import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const SUPPORTED_BUNDLE_NAME = /^[a-zA-Z0-9._-]+$/;

async function assertSupportedBundleNames(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.match(
      entry.name,
      SUPPORTED_BUNDLE_NAME,
      `Unsupported YouTube Playables bundle name: ${entry.name}`,
    );
    if (entry.isDirectory()) {
      await assertSupportedBundleNames(new URL(`${entry.name}/`, directory));
    }
  }
}

async function collectBundleStats(directory) {
  let count = 0;
  let totalBytes = 0;
  let largestFileBytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) {
      const nested = await collectBundleStats(url);
      count += nested.count;
      totalBytes += nested.totalBytes;
      largestFileBytes = Math.max(largestFileBytes, nested.largestFileBytes);
    } else {
      const file = await stat(url);
      count++;
      totalBytes += file.size;
      largestFileBytes = Math.max(largestFileBytes, file.size);
    }
  }
  return { count, totalBytes, largestFileBytes };
}

test("builds the complete static Nightfall Seven game shell", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /Nightfall Seven/);
  assert.match(html, /BEGIN THE NIGHT/);
  assert.match(html, /QUARANTINE DISTRICT/);
  assert.match(html, /id="viewport"/);
  assert.match(html, /id="drill-announcement"/);
  assert.match(html, /CHOOSE WHAT KEEPS YOU ALIVE/);
  assert.match(html, /data-perk="ammo"/);
  assert.match(html, /data-perk="ghost"/);
  assert.match(html, /data-perk="heal"/);
  assert.match(html, /HOLD TO AIM \+ FIRE/);
  assert.match(html, /NO MOVEMENT/);
  assert.match(html, />BULLETS</);
  assert.doesNotMatch(html, />AKM</);
  assert.match(html, /https:\/\/www\.youtube\.com\/game_api\/v1/);
  assert.ok(
    html.indexOf("https://www.youtube.com/game_api/v1") <
      html.indexOf('type="module"'),
    "YouTube Playables SDK must load before the game module",
  );
  assert.doesNotMatch(
    html,
    /id="(?:joystick|fire-button|aim-button|touch-reload|haptics-toggle)"/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships a Vercel-ready vanilla Vite and TypeScript FPS", async () => {
  const [
    source,
    playablesSource,
    styles,
    packageJson,
    viteConfig,
    vercelConfig,
  ] = await Promise.all([
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/youtube-playables.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);

  assert.match(source, /import \* as THREE from "three"/);
  assert.match(source, /GLTFLoader/);
  assert.match(source, /fps-akm\.glb/);
  assert.match(source, /zombie\.glb/);
  assert.doesNotMatch(source, /enemy-punk\.glb|enemy-glock\.glb/);
  assert.match(source, /cloneSkeleton/);
  assert.match(source, /requestPointerLock/);
  assert.match(source, /function shoot\(\)/);
  assert.match(source, /function levelUp\(\)/);
  assert.match(source, /NIGHTFALL/);
  assert.match(source, /const LEVEL_ENCOUNTERS/);
  assert.match(source, /entry: "street" \| "alley"/);
  assert.match(source, /alleyEntry \? 360 : 620/);
  assert.match(source, /entry === "alley" \? 720 : 1250/);
  assert.match(source, /function deployLevelSquad/);
  assert.match(source, /function findWalkableSpawn/);
  assert.match(source, /function isWalkableWorldPosition/);
  assert.match(source, /function advanceEnemyTowardPlayer/);
  assert.match(source, /const probeDistance = THREE\.MathUtils\.clamp/);
  assert.match(source, /target\.blockedFor = Math\.min\(2\.5, blockedFor \+ dt\)/);
  assert.doesNotMatch(source, /function advanceMobilePlayer/);
  assert.doesNotMatch(source, /mobileAdvanceRequested/);
  assert.match(source, /camera\.position\.set\(0, 1\.72, 11\.5\)/);
  assert.match(source, /setFiring\(true\)/);
  assert.match(source, /function onLookStart/);
  assert.match(source, /engineRef\.current\?\.setAiming\(true\)/);
  assert.match(source, /engineRef\.current\?\.aimDelta\(dx, dy\)/);
  assert.match(source, /touchLayer\.addEventListener\("pointerdown", onLookStart\)/);
  assert.match(source, /function announceDrillStart/);
  assert.match(source, /function showPerkSelection/);
  assert.match(source, /function choosePerk/);
  assert.match(source, /ghostActive \? 1\.2/);
  assert.match(source, /reserveLive \+= 60/);
  assert.match(source, /playerHealthLive \+ 40/);
  assert.match(source, /dataset\.gameReady = "true"/);
  assert.match(source, /signalFirstFrameReady\(\)/);
  assert.match(source, /signalGameReady\(\)/);
  assert.match(source, /pauseFromYouTube/);
  assert.match(source, /resumeFromYouTube/);
  assert.match(source, /masterAudioGain/);
  assert.match(source, /function startHorrorMusic/);
  assert.match(source, /function updateHorrorMusic/);
  assert.match(source, /function horrorStinger/);
  assert.match(source, /function scheduleScoreBeat/);
  assert.match(source, /function playPreparedPiano/);
  assert.match(source, /function playStringChord/);
  assert.match(source, /function playDistantBell/);
  assert.match(source, /function playTensionSwell/);
  assert.match(source, /function playScorePulse/);
  assert.match(source, /function dreadPulse/);
  assert.match(source, /musicReverb/);
  assert.match(source, /gameNow\(\)/);
  assert.match(source, /gameTimeout\(/);
  assert.doesNotMatch(
    `${source}\n${playablesSource}`,
    /localStorage|sessionStorage|indexedDB|document\.cookie|visibilitychange|document\.visibilityState/,
  );
  assert.match(source, /type RangeSevenCloudSave/);
  assert.match(source, /version:\s*1/);
  assert.match(source, /parseCloudSave/);
  assert.match(source, /createCloudSave/);
  assert.match(source, /restoreCloudSave/);
  assert.match(source, /requestCloudSave\(true\)/);
  assert.match(playablesSource, /loadData:\s*\(\) => Promise<string>/);
  assert.match(playablesSource, /saveData:\s*\(data: string\) => Promise<void>/);
  assert.match(playablesSource, /await this\.cloudLoadPromise/);
  assert.match(playablesSource, /CLOUD_RESTORE_DEADLINE_MS = 2400/);
  assert.match(playablesSource, /Promise\.race\(\[this\.cloudLoadPromise, restoreDeadline\]\)/);
  assert.match(playablesSource, /const data = await this\.api\.game\.loadData\(\)/);
  assert.match(playablesSource, /cloudLoadSucceeded/);
  assert.match(playablesSource, /64 \* 1024/);
  assert.match(playablesSource, /isWellFormed/);
  assert.match(playablesSource, /markCloudRestoreApplied/);
  assert.match(playablesSource, /sendScore:\s*\(score: \{ value: number \}\)/);
  assert.match(playablesSource, /Math\.trunc\(score\)/);
  assert.match(playablesSource, /sendScore\(\{ value: integerScore \}\)/);
  assert.match(source, /youtubePlayables\.sendScore\(cloudProfile\.bestScore\)/);
  assert.match(playablesSource, /isAudioEnabled\(\)/);
  assert.match(playablesSource, /onAudioEnabledChange/);
  assert.match(playablesSource, /onPause/);
  assert.match(playablesSource, /onResume/);
  assert.match(playablesSource, /firstFrameReady/);
  assert.match(playablesSource, /gameReady/);
  assert.match(playablesSource, /stopImmediatePropagation/);
  assert.match(source, /function tryPointerLock/);
  assert.match(source, /pointerLockUnavailable/);
  assert.doesNotMatch(source, /function spawnTarget/);
  assert.match(source, /scream: "Scream"/);
  assert.match(source, /run: "Walk2"/);
  assert.match(source, /crawlRun: "Running_Crawl"/);
  assert.match(source, /attack: "Attack"/);
  assert.match(source, /hit: "Hit_reaction"/);
  assert.match(source, /deathAlt: "Die2"/);
  assert.match(source, /function damagePlayerFromZombie/);
  assert.match(source, /function zombieVocal/);
  assert.match(source, /creatureVocalCompressor/);
  assert.match(source, /creatureVocalReverb/);
  assert.match(source, /const vocalBuffer = audio\.createBuffer/);
  assert.match(source, /const throatFilter = audio\.createBiquadFilter/);
  assert.match(source, /const mouthFilter = audio\.createBiquadFilter/);
  assert.match(source, /const raspFilter = audio\.createBiquadFilter/);
  assert.doesNotMatch(source, /oscillator\.type = "sawtooth"|growl\.type = "square"/);
  assert.match(source, /brickTexture/);
  assert.match(source, /smokeWisps/);
  assert.match(source, /rearSmoke/);
  assert.match(source, /createRadialGradient/);
  assert.match(source, /flickerLights/);
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
  assert.match(styles, /@media \(pointer: coarse\)/);
  assert.match(styles, /\.auto-move-indicator/);
  assert.match(styles, /data-youtube-paused="true"/);
  assert.match(viteConfig, /defineConfig/);
  assert.match(viteConfig, /base:\s*"\.\/"/);
  assert.match(vercelConfig, /"framework": "vite"/);
  assert.match(vercelConfig, /"outputDirectory": "dist"/);

  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/models/fps-akm.glb", import.meta.url));
  await access(new URL("../public/models/zombie.glb", import.meta.url));
  await assert.rejects(access(new URL("../public/models/enemy-punk.glb", import.meta.url)));
  await assert.rejects(access(new URL("../public/models/enemy-glock.glb", import.meta.url)));
  await assertSupportedBundleNames(new URL("../public/", import.meta.url));
  const distUrl = new URL("../dist/", import.meta.url);
  await assertSupportedBundleNames(distUrl);
  const bundle = await collectBundleStats(distUrl);
  assert.ok(bundle.totalBytes < 30 * 1024 * 1024, "Initial bundle must stay below 30 MiB");
  assert.ok(bundle.largestFileBytes < 30 * 1024 * 1024, "Every file must stay below 30 MiB");
  assert.ok(bundle.count <= 8000, "Bundle must contain at most 8000 files");
});

test("obeys the YouTube Playables lifecycle contract", async () => {
  const source = await readFile(
    new URL("../src/youtube-playables.ts", import.meta.url),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const calls = [];
  const sdkCallbacks = {};
  const capturedEvents = new Map();
  class MockEvent {
    constructor(type) {
      this.type = type;
      this.defaultPrevented = false;
      this.propagationStopped = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopImmediatePropagation() {
      this.propagationStopped = true;
    }
  }
  class MockKeyboardEvent extends MockEvent {
    constructor(type, key) {
      super(type);
      this.key = key;
    }
  }

  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    document: { documentElement: { dataset: {} } },
    window: {
      addEventListener(name, listener) {
        capturedEvents.set(name, listener);
      },
      removeEventListener(name) {
        capturedEvents.delete(name);
      },
    },
    performance,
    setTimeout,
    clearTimeout,
    Event: MockEvent,
    KeyboardEvent: MockKeyboardEvent,
    ytgame: {
      IN_PLAYABLES_ENV: true,
      SDK_VERSION: "test",
      game: {
        firstFrameReady() {
          calls.push("firstFrameReady");
        },
        gameReady() {
          calls.push("gameReady");
        },
        async loadData() {
          calls.push("loadData");
          return '{"version":1}';
        },
        async saveData(data) {
          calls.push(["saveData", data]);
        },
      },
      engagement: {
        async sendScore(score) {
          calls.push(["sendScore", score.value]);
        },
      },
      system: {
        isAudioEnabled: () => true,
        onAudioEnabledChange(callback) {
          sdkCallbacks.audio = callback;
          return () => undefined;
        },
        onPause(callback) {
          sdkCallbacks.pause = callback;
          return () => undefined;
        },
        onResume(callback) {
          sdkCallbacks.resume = callback;
          return () => undefined;
        },
      },
      health: {
        logError() {},
        logWarning() {},
      },
    },
  });
  vm.runInContext(transpiled, context);
  const runtime = module.exports.youtubePlayables;

  assert.equal(await runtime.getCloudData(), '{"version":1}');
  runtime.markCloudRestoreApplied();
  runtime.signalGameReady();
  assert.equal(calls.includes("gameReady"), false);
  runtime.signalFirstFrameReady();
  runtime.signalGameReady();
  assert.deepEqual(calls.slice(0, 3), ["loadData", "firstFrameReady", "gameReady"]);

  assert.equal(await runtime.saveCloudData('{"level":2}'), true);
  runtime.sendScore(91.8);
  runtime.sendScore(90);
  await Promise.resolve();
  assert.deepEqual(
    calls.filter((call) => Array.isArray(call) && call[0] === "sendScore"),
    [["sendScore", 91]],
  );

  let scheduledRan = false;
  runtime.schedule(() => {
    scheduledRan = true;
  }, 20);
  sdkCallbacks.pause();
  const blockedClick = new MockEvent("click");
  capturedEvents.get("click")(blockedClick);
  assert.equal(runtime.isPaused, true);
  assert.equal(blockedClick.defaultPrevented, true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(scheduledRan, false);
  sdkCallbacks.resume();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(scheduledRan, true);

  const audioStates = [];
  runtime.onAudioChange((enabled) => audioStates.push(enabled));
  sdkCallbacks.audio(false);
  assert.equal(runtime.isAudioEnabled, false);
  assert.deepEqual(audioStates, [true, false]);
  runtime.destroy();
});
