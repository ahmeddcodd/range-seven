/**
 * Packages the production Vite build into a YouTube Playables uploadable zip.
 *
 * The web (Vercel) deployment and the Playables package share one build. This
 * script produces the Playables variant: it drops assets that only matter to
 * link-unfurling crawlers, validates the payload against the Playables
 * certification limits, and writes a zip with index.html at the archive root.
 *
 * Usage: npm run pack:playables
 */
import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIST = new URL("../dist/", import.meta.url);
const RELEASE = new URL("../release/", import.meta.url);
const ZIP_NAME = "nightfall-seven-playables.zip";

/** Assets served on the web build but inert inside the Playables iframe. */
const EXCLUDED = new Set([
  "og.png", // og:image is only ever fetched by link-unfurl crawlers
  "file.svg", // unreferenced Next.js template leftover
  "globe.svg", // unreferenced Next.js template leftover
  "window.svg", // unreferenced Next.js template leftover
]);

const SDK_URL = "https://www.youtube.com/game_api/v1";
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const MiB = 1024 * 1024;

const LIMITS = {
  totalBytes: 30 * MiB,
  totalBytesPreferred: 15 * MiB,
  fileBytes: 30 * MiB,
  fileBytesPreferred: 512 * 1024,
  fileCount: 8000,
};

const problems = [];
const warnings = [];

const fail = (message) => problems.push(message);
const warn = (message) => warnings.push(message);

/* ------------------------------------------------------------------ *
 * Collect the payload
 * ------------------------------------------------------------------ */

/** @returns {Promise<Array<{ name: string, body: Buffer }>>} */
async function collect(dir, prefix = "") {
  /** @type {Array<{ name: string, body: Buffer }>} */
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (!SAFE_NAME.test(entry.name)) {
      fail(`Unsupported file name for Playables: ${name}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collect(new URL(`${entry.name}/`, dir), `${name}/`)));
    } else if (!EXCLUDED.has(name)) {
      files.push({ name, body: await readFile(new URL(entry.name, dir)) });
    }
  }
  return files;
}

let files;
try {
  files = await collect(DIST);
} catch {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Rewrite index.html for the Playables target
 * ------------------------------------------------------------------ */

const indexEntry = files.find((file) => file.name === "index.html");
if (!indexEntry) {
  fail("index.html must exist at the root of the package.");
} else {
  let html = indexEntry.body.toString("utf8");

  // og.png is excluded above, so drop the tag that points at it rather than
  // shipping a dangling reference.
  const ogImage = /[ \t]*<meta property="og:image"[^>]*>\r?\n?/g;
  const removed = html.match(ogImage)?.length ?? 0;
  if (removed !== 1) {
    fail(
      `Expected exactly one og:image meta tag to strip, found ${removed}. ` +
        "Update scripts/pack-playables.mjs to match index.html.",
    );
  }
  html = html.replace(ogImage, "");

  // Certification: the SDK must be parsed before the game module.
  const sdkAt = html.indexOf(SDK_URL);
  const moduleAt = html.indexOf('type="module"');
  if (sdkAt === -1) fail("The YouTube Playables SDK script tag is missing.");
  else if (moduleAt === -1) fail("No game module script tag found.");
  else if (sdkAt > moduleAt) fail("The SDK must load before the game module.");

  // Certification: relative paths only, and no third-party origins.
  for (const [, url] of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    if (url !== SDK_URL) fail(`External resource is not allowed: ${url}`);
  }
  for (const [attr] of html.matchAll(/(?:src|href)="\/[^"]*"/g)) {
    fail(`Absolute path is not allowed: ${attr}`);
  }

  indexEntry.body = Buffer.from(html, "utf8");
}

/* ------------------------------------------------------------------ *
 * Validate the payload against the certification limits
 * ------------------------------------------------------------------ */

const referenced = new Set();
for (const file of files) {
  if (!/\.(html|css|js)$/.test(file.name)) continue;
  const text = file.body.toString("utf8");
  for (const [, ref] of text.matchAll(/["'`(]\.\/([A-Za-z0-9._/-]+)["'`)]/g)) {
    referenced.add(ref);
  }
}
for (const ref of referenced) {
  if (!files.some((file) => file.name === ref)) {
    fail(`index/bundle references a file missing from the package: ./${ref}`);
  }
}

const totalBytes = files.reduce((sum, file) => sum + file.body.length, 0);
if (totalBytes >= LIMITS.totalBytes) {
  fail(`Package is ${fmt(totalBytes)}; the hard limit is 30 MiB.`);
} else if (totalBytes >= LIMITS.totalBytesPreferred) {
  warn(`Package is ${fmt(totalBytes)}; under 15 MiB is recommended.`);
}
if (files.length > LIMITS.fileCount) {
  fail(`Package has ${files.length} files; the limit is 8000.`);
}
for (const file of files) {
  if (file.body.length >= LIMITS.fileBytes) {
    fail(`${file.name} is ${fmt(file.body.length)}; the hard limit is 30 MiB.`);
  } else if (file.body.length >= LIMITS.fileBytesPreferred) {
    warn(`${file.name} is ${fmt(file.body.length)}; under 512 KiB is preferred.`);
  }
}

if (problems.length > 0) {
  console.error("Playables packaging failed:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Write the zip
 * ------------------------------------------------------------------ */

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return crc;
});

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

// Fixed timestamp (2020-01-01 12:00) keeps the archive byte-for-byte
// reproducible across runs.
const DOS_TIME = (12 << 11) | (0 << 5) | 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const UNIX_FILE_MODE = ((0o100644) << 16) >>> 0;

const locals = [];
const centrals = [];
let offset = 0;

for (const file of files) {
  const name = Buffer.from(file.name, "utf8"); // ASCII-only, enforced above
  const deflated = deflateRawSync(file.body, { level: 9 });
  // Fall back to STORE when deflate does not actually help.
  const stored = deflated.length >= file.body.length;
  const payload = stored ? file.body : deflated;
  const method = stored ? 0 : 8;
  const crc = crc32(file.body);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(file.body.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28); // extra length
  locals.push(local, name, payload);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, zip 2.0
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(file.body.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30); // extra length
  central.writeUInt16LE(0, 32); // comment length
  central.writeUInt16LE(0, 34); // disk number start
  central.writeUInt16LE(0, 36); // internal attributes
  central.writeUInt32LE(UNIX_FILE_MODE, 38);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + payload.length;
}

const centralBuffer = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4); // this disk
end.writeUInt16LE(0, 6); // disk with central directory
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuffer.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20); // comment length

const archive = Buffer.concat([...locals, centralBuffer, end]);

await rm(RELEASE, { recursive: true, force: true });
await mkdir(RELEASE, { recursive: true });
const zipPath = new URL(ZIP_NAME, RELEASE);
await writeFile(zipPath, archive);

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function fmt(bytes) {
  return bytes >= MiB
    ? `${(bytes / MiB).toFixed(2)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}

console.log(`Packaged ${files.length} files for YouTube Playables:\n`);
for (const file of files) {
  console.log(`  ${file.name.padEnd(34)} ${fmt(file.body.length).padStart(10)}`);
}
console.log(`\n  uncompressed  ${fmt(totalBytes)}`);
console.log(`  zip           ${fmt(archive.length)}`);
console.log(`\n  -> ${path.relative(process.cwd(), fileURLToPath(zipPath))}`);

if (warnings.length > 0) {
  console.log("\nAdvisory (not blocking):");
  for (const warning of warnings) console.log(`  - ${warning}`);
}
