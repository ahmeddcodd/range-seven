import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the complete static Range Seven game shell", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /Range Seven/);
  assert.match(html, /ENTER BLACKSITE/);
  assert.match(html, /CLIFFSIDE QUALIFICATION/);
  assert.match(html, /id="viewport"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships a Vercel-ready vanilla Vite and TypeScript FPS", async () => {
  const [source, styles, packageJson, viteConfig, vercelConfig] = await Promise.all([
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);

  assert.match(source, /import \* as THREE from "three"/);
  assert.match(source, /GLTFLoader/);
  assert.match(source, /fps-akm\.glb/);
  assert.match(source, /enemy-punk\.glb/);
  assert.match(source, /enemy-glock\.glb/);
  assert.match(source, /cloneSkeleton/);
  assert.match(source, /requestPointerLock/);
  assert.match(source, /function shoot\(\)/);
  assert.match(source, /function levelUp\(\)/);
  assert.match(source, /BLACKSITE FINAL/);
  assert.match(source, /const LEVEL_ENCOUNTERS/);
  assert.match(source, /function deployLevelSquad/);
  assert.match(source, /dataset\.gameReady = "true"/);
  assert.match(source, /function tryPointerLock/);
  assert.match(source, /pointerLockUnavailable/);
  assert.doesNotMatch(source, /function spawnTarget/);
  assert.match(source, /run: "Run"/);
  assert.match(source, /roll: "Roll"/);
  assert.match(source, /function enemyHasLineOfSight/);
  assert.match(source, /advanceDelay/);
  assert.match(source, /intersectObjects\(shotBlockers, false\)/);
  assert.match(source, /\[targetRoot, \.\.\.shotBlockers\]/);
  assert.doesNotMatch(
    source,
    /runShoot|runLeft|runRight|Run_Shoot|Run_Left|Run_Right/,
  );
  assert.match(source, /navigator\.vibrate/);
  assert.match(packageJson, /"build": "tsc --noEmit && vite build"/);
  assert.match(packageJson, /"vite":/);
  assert.match(packageJson, /"typescript":/);
  assert.match(packageJson, /"three":/);
  assert.doesNotMatch(packageJson, /react|next|vinext|wrangler|cloudflare|drizzle/i);
  assert.match(styles, /\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(viteConfig, /defineConfig/);
  assert.match(vercelConfig, /"framework": "vite"/);
  assert.match(vercelConfig, /"outputDirectory": "dist"/);

  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/models/fps-akm.glb", import.meta.url));
  await access(new URL("../public/models/enemy-punk.glb", import.meta.url));
  await access(new URL("../public/models/enemy-glock.glb", import.meta.url));
});
