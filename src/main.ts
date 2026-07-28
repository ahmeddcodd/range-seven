import * as THREE from "three";
import "./styles.css";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  clearGameTimeout,
  gameNow,
  gameTimeout,
  youtubePlayables,
} from "./youtube-playables";

type Weapon = {
  name: string;
  code: string;
  ammo: number;
  reserve: number;
  rpm: number;
  recoil: number;
  spread: number;
  damage: number;
  auto: boolean;
  reloadMs: number;
  color: number;
};

type DifficultyKey = "recruit" | "operator" | "elite";
type PerkKey = "ammo" | "ghost" | "heal";

type CloudProfile = {
  bestScore: number;
  bestStreak: number;
  highestDrill: number;
  completedRuns: number;
  difficulty: DifficultyKey;
};

type CloudSession = {
  level: number;
  levelKills: number;
  score: number;
  streak: number;
  bestStreak: number;
  combo: number;
  shots: number;
  hits: number;
  time: number;
  health: number;
  ammo: number;
  reserve: number;
  weapon: number;
  unlocked: number;
  perks: Record<PerkKey, number>;
  perkSelectionPending: boolean;
  ghostActive: boolean;
  cameraX: number;
  cameraZ: number;
  yaw: number;
  pitch: number;
};

type RangeSevenCloudSave = {
  version: 1;
  profile: CloudProfile;
  session: CloudSession | null;
};

const DEFAULT_CLOUD_PROFILE: CloudProfile = {
  bestScore: 0,
  bestStreak: 0,
  highestDrill: 1,
  completedRuns: 0,
  difficulty: "operator",
};

const PERKS: Record<
  PerkKey,
  { label: string; status: string }
> = {
  ammo: { label: "AMMO CACHE", status: "AMMO" },
  ghost: { label: "PHASE WARD", status: "WARD" },
  heal: { label: "TRAUMA KIT", status: "MEDKIT" },
};

const DIFFICULTIES = {
  recruit: {
    label: "WANDERER",
    description: "Slower infected",
    startTime: 68,
    lifeScale: 1.22,
    speedScale: 0.84,
    spawnScale: 1.14,
    scoreScale: 0.85,
    maxBonus: 0,
  },
  operator: {
    label: "SURVIVOR",
    description: "Relentless pressure",
    startTime: 58,
    lifeScale: 1,
    speedScale: 1,
    spawnScale: 1,
    scoreScale: 1,
    maxBonus: 1,
  },
  elite: {
    label: "NIGHTMARE",
    description: "Fast and merciless",
    startTime: 50,
    lifeScale: 0.76,
    speedScale: 1.28,
    spawnScale: 0.78,
    scoreScale: 1.35,
    maxBonus: 2,
  },
} as const;

type TargetState = {
  id: number;
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  hp: number;
  bornAt: number;
  lifetime: number;
  phase: number;
  motion: "shambler" | "runner" | "crawler" | "brute";
  baseX: number;
  baseY: number;
  baseZ: number;
  speed: number;
  range: number;
  dead: boolean;
  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;
  activeAction?: string;
  muzzle?: THREE.Object3D;
  pistolAction?: THREE.AnimationAction;
  nextShotAt?: number;
  nextRollAt?: number;
  rollingUntil?: number;
  lastMoveDirection?: number;
  nextThinkAt?: number;
  hasLineOfSight?: boolean;
  blockedSince?: number;
  advancing?: boolean;
  advanceMinUntil?: number;
  flankDirection?: number;
  nextAttackAt?: number;
  attackingUntil?: number;
  screamingUntil?: number;
  reactionUntil?: number;
  deathVariant?: "death" | "deathAlt";
  blockedFor?: number;
  facingYaw: number;
  lastMovedAt?: number;
};

const WEAPONS: Weapon[] = [
  {
    name: "AKM",
    code: "AR",
    ammo: 30,
    reserve: 120,
    rpm: 600,
    recoil: 0.026,
    spread: 0.0026,
    damage: 42,
    auto: true,
    reloadMs: 2583,
    color: 0x53634b,
  },
  {
    name: "VOLT-9",
    code: "SMG",
    ammo: 36,
    reserve: 144,
    rpm: 900,
    recoil: 0.021,
    spread: 0.0048,
    damage: 34,
    auto: true,
    reloadMs: 1050,
    color: 0x315f68,
  },
  {
    name: "MRK-12",
    code: "DMR",
    ammo: 12,
    reserve: 48,
    rpm: 310,
    recoil: 0.045,
    spread: 0.001,
    damage: 82,
    auto: false,
    reloadMs: 1550,
    color: 0x675249,
  },
];

const LEVELS = [
  {
    title: "FIRST KNOCK",
    goal: 5,
    motions: ["shambler", "runner"],
    targetLife: 999999,
    moveSpeed: 1.35,
    firstShot: 1450,
    fireDelay: 1500,
    enemyAccuracy: 1,
    enemyDamage: 7,
    timeBonus: 18,
    advanceDelay: 0,
    advanceSpeed: 1.35,
  },
  {
    title: "DARK CORRIDOR",
    goal: 8,
    motions: ["shambler", "runner", "crawler"],
    targetLife: 999999,
    moveSpeed: 1.58,
    firstShot: 1250,
    fireDelay: 1420,
    enemyAccuracy: 1,
    enemyDamage: 8,
    timeBonus: 21,
    advanceDelay: 0,
    advanceSpeed: 1.58,
  },
  {
    title: "THE HUNGER",
    goal: 12,
    motions: ["runner", "shambler", "crawler", "runner"],
    targetLife: 999999,
    moveSpeed: 1.82,
    firstShot: 1100,
    fireDelay: 1320,
    enemyAccuracy: 1,
    enemyDamage: 9,
    timeBonus: 25,
    advanceDelay: 0,
    advanceSpeed: 1.82,
  },
  {
    title: "RED SIGNAL",
    goal: 17,
    motions: ["runner", "crawler", "runner", "brute"],
    targetLife: 999999,
    moveSpeed: 2.08,
    firstShot: 950,
    fireDelay: 1220,
    enemyAccuracy: 1,
    enemyDamage: 11,
    timeBonus: 29,
    advanceDelay: 0,
    advanceSpeed: 2.08,
  },
  {
    title: "LAST LIGHT",
    goal: 23,
    motions: ["runner", "runner", "crawler", "brute"],
    targetLife: 999999,
    moveSpeed: 2.34,
    firstShot: 820,
    fireDelay: 1120,
    enemyAccuracy: 1,
    enemyDamage: 13,
    timeBonus: 34,
    advanceDelay: 0,
    advanceSpeed: 2.34,
  },
  {
    title: "NIGHTFALL",
    goal: 30,
    motions: ["runner", "crawler", "runner", "brute", "runner"],
    targetLife: 999999,
    moveSpeed: 2.62,
    firstShot: 700,
    fireDelay: 1020,
    enemyAccuracy: 1,
    enemyDamage: 15,
    timeBonus: 0,
    advanceDelay: 0,
    advanceSpeed: 2.62,
  },
] as const;

const DRILL_DETAILS = [
  "THE STREET IS NOT EMPTY",
  "LISTEN FOR THE SCREAMS",
  "DO NOT LET THEM REACH YOU",
  "THE FAST ONES HAVE WOKEN",
  "ONLY ONE LIGHT REMAINS",
  "SURVIVE THE FINAL HORDE",
] as const;

const ZOMBIE_LANES = [-11, -7.5, -4, 0, 4, 7.5, 11] as const;
const LEVEL_ENCOUNTERS: ReadonlyArray<
  ReadonlyArray<{
    x: number;
    z: number;
    motion: TargetState["motion"];
    entry: "street" | "alley";
  }>
> = LEVELS.map((level, levelIndex) =>
  Array.from({ length: level.goal }, (_, index) => {
    const motion = level.motions[index % level.motions.length] as TargetState["motion"];
    const row = Math.floor(index / ZOMBIE_LANES.length);
    const laneIndex = (index * 3 + levelIndex * 2 + row) % ZOMBIE_LANES.length;
    const alleyEntry = index > 0 && (index + levelIndex * 2) % 5 === 3;
    const alleySide = (index + levelIndex) % 2 === 0 ? -1 : 1;
    return {
      x: alleyEntry
        ? alleySide * (8.2 + (index % 2) * 1.4)
        : ZOMBIE_LANES[laneIndex] + ((index % 3) - 1) * 0.38,
      z: alleyEntry
        ? 2.2 - (index % 3) * 2.15 - Math.min(levelIndex, 4) * 0.35
        : -14 - row * 8.5 - (index % 4) * 1.45,
      motion,
      entry: alleyEntry ? "alley" : "street",
    };
  }),
);

function levelConfig(level: number) {
  return LEVELS[Math.min(Math.max(level - 1, 0), LEVELS.length - 1)];
}

function levelObjective(level: number) {
  const config = levelConfig(level);
  return `${config.title} — ${config.goal} STILL MOVING`;
}

function enemyFireScale(difficulty: DifficultyKey) {
  return difficulty === "recruit" ? 1.12 : difficulty === "elite" ? 0.9 : 1;
}

function enemyAccuracyAdjustment(difficulty: DifficultyKey) {
  return difficulty === "recruit" ? -0.06 : difficulty === "elite" ? 0.06 : 0;
}

function enemyDamageScale(difficulty: DifficultyKey) {
  return difficulty === "recruit" ? 0.85 : difficulty === "elite" ? 1.15 : 1;
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  castShadow = false,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  radius = 0.08,
  castShadow = false,
) {
  const safeRadius = Math.min(radius, Math.min(...size) * 0.45);
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(...size, 2, safeRadius),
    material,
  );
  mesh.position.set(...pos);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeLabel(
  text: string,
  color = "#e9bd63",
  background = "rgba(9,13,13,.88)",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = color;
  ctx.font = "700 46px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true }),
  );
  sprite.scale.set(4.8, 1.2, 1);
  return sprite;
}

type Updater<T> = T | ((current: T) => T);

function resolveUpdate<T>(current: T, update: Updater<T>) {
  return typeof update === "function"
    ? (update as (value: T) => T)(current)
    : update;
}

function element<T extends HTMLElement>(id: string) {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing required UI element: ${id}`);
  return target as T;
}

const engineRef: {
  current: {
    start: () => void;
    reload: () => void;
    setFiring: (value: boolean) => void;
    aimDelta: (dx: number, dy: number) => void;
    switchWeapon: (index: number) => void;
    choosePerk: (perk: PerkKey) => void;
    createCloudSave: () => RangeSevenCloudSave;
    restoreCloudSave: (save: RangeSevenCloudSave) => void;
    pauseFromYouTube: () => void;
    resumeFromYouTube: () => void;
    setYouTubeAudioEnabled: (enabled: boolean) => void;
  } | null;
} = { current: null };

let gameAssetsReady = false;
let started = false;
let gameOver = false;
let score = 0;
let level = 1;
let streak = 0;
let bestStreak = 0;
let combo = 1;
let accuracy = 100;
let difficulty: DifficultyKey = "operator";
let ammo = { mag: 30, reserve: 120 };
let weaponIndex = 0;
let time = 45;
let objective = levelObjective(1);
let feed = "STANDBY";
let hitPulse = 0;
let damageFlash = 0;
let playerHitFlash = 0;
let health = 100;
let reloading = false;
let isMobile = false;
let interfaceLocked = false;
let youtubePaused = youtubePlayables.isPaused;
let cloudProfile = { ...DEFAULT_CLOUD_PROFILE };
let cloudSaveTimer: number | null = null;

const difficultyRef: { current: DifficultyKey } = { current: difficulty };
const hapticsRef = { current: true };
const lookPointer = { current: null as number | null };
const shootPointer = { current: null as number | null };
const lookLast = { current: { x: 0, y: 0 } };
const feedTimer = {
  current: null as number | null,
};

function parseCloudSave(serialized: string | null): RangeSevenCloudSave | null {
  if (!serialized) return null;
  try {
    const raw = JSON.parse(serialized) as Partial<RangeSevenCloudSave>;
    if (!raw || raw.version !== 1 || !raw.profile) return null;
    const validDifficulty = ["recruit", "operator", "elite"].includes(
      raw.profile.difficulty,
    )
      ? raw.profile.difficulty
      : "operator";
    const number = (value: unknown, fallback: number, min: number, max: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? THREE.MathUtils.clamp(value, min, max)
        : fallback;
    const profile: CloudProfile = {
      bestScore: Math.round(number(raw.profile.bestScore, 0, 0, 999999999)),
      bestStreak: Math.round(number(raw.profile.bestStreak, 0, 0, 999999)),
      highestDrill: Math.round(
        number(raw.profile.highestDrill, 1, 1, LEVELS.length),
      ),
      completedRuns: Math.round(
        number(raw.profile.completedRuns, 0, 0, 999999),
      ),
      difficulty: validDifficulty as DifficultyKey,
    };
    const rawSession = raw.session as Partial<CloudSession> | null | undefined;
    if (!rawSession) return { version: 1, profile, session: null };
    const levelValue = Math.round(
      number(rawSession.level, 1, 1, LEVELS.length),
    );
    const weaponValue = Math.round(
      number(rawSession.weapon, 0, 0, WEAPONS.length - 1),
    );
    const unlockedValue = Math.round(
      number(rawSession.unlocked, 1, 1, WEAPONS.length),
    );
    const perkPending = Boolean(rawSession.perkSelectionPending);
    const session: CloudSession = {
      level: levelValue,
      levelKills: Math.round(
        number(
          rawSession.levelKills,
          0,
          0,
          Math.max(
            0,
            levelConfig(levelValue).goal - (perkPending ? 0 : 1),
          ),
        ),
      ),
      score: Math.round(number(rawSession.score, 0, 0, 999999999)),
      streak: Math.round(number(rawSession.streak, 0, 0, 999999)),
      bestStreak: Math.round(number(rawSession.bestStreak, 0, 0, 999999)),
      combo: Math.round(number(rawSession.combo, 1, 1, 5)),
      shots: Math.round(number(rawSession.shots, 0, 0, 999999999)),
      hits: Math.round(number(rawSession.hits, 0, 0, 999999999)),
      time: number(
        rawSession.time,
        DIFFICULTIES[validDifficulty as DifficultyKey].startTime,
        1,
        9999,
      ),
      health: number(rawSession.health, 100, 1, 100),
      ammo: Math.round(
        number(rawSession.ammo, WEAPONS[weaponValue].ammo, 0, 9999),
      ),
      reserve: Math.round(number(rawSession.reserve, 120, 0, 99999)),
      weapon: Math.min(weaponValue, unlockedValue - 1),
      unlocked: unlockedValue,
      perks: {
        ammo: Math.round(number(rawSession.perks?.ammo, 0, 0, 99)),
        ghost: Math.round(number(rawSession.perks?.ghost, 0, 0, 99)),
        heal: Math.round(number(rawSession.perks?.heal, 0, 0, 99)),
      },
      perkSelectionPending: perkPending,
      ghostActive: Boolean(rawSession.ghostActive),
      cameraX: number(rawSession.cameraX, 0, -12.5, 12.5),
      cameraZ: number(rawSession.cameraZ, 12, -86, 14),
      yaw: number(rawSession.yaw, 0, -Math.PI * 8, Math.PI * 8),
      pitch: number(rawSession.pitch, -0.015, -0.62, 0.62),
    };
    return { version: 1, profile, session };
  } catch {
    return null;
  }
}

async function flushCloudSave() {
  if (!youtubePlayables.isInPlayablesEnvironment) return;
  const save = engineRef.current?.createCloudSave();
  if (!save) return;
  await youtubePlayables.saveCloudData(JSON.stringify(save));
}

function requestCloudSave(immediate = false) {
  if (!youtubePlayables.isInPlayablesEnvironment) return;
  if (cloudSaveTimer !== null) {
    clearGameTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
  }
  if (immediate) {
    void flushCloudSave();
    return;
  }
  cloudSaveTimer = gameTimeout(() => {
    cloudSaveTimer = null;
    void flushCloudSave();
  }, 650);
}

function replayClass(target: HTMLElement, className: string) {
  target.className = "";
  void target.offsetWidth;
  target.className = className;
}

function updateTouchLayer() {
  element("touch-layer").hidden = !(
    isMobile &&
    started &&
    !gameOver &&
    !interfaceLocked &&
    !youtubePaused
  );
}

function setInterfaceLocked(locked: boolean) {
  interfaceLocked = locked;
  if (locked) {
    lookPointer.current = null;
    shootPointer.current = null;
    engineRef.current?.setFiring(false);
  }
  updateTouchLayer();
}

function updateResults() {
  element("result-eyebrow").textContent =
    health <= 0
      ? "THE HORDE TOOK YOU"
      : `${DIFFICULTIES[difficulty].label} // DAWN REACHED`;
  element("result-score").textContent = score.toLocaleString("en-US");
  element("result-level").textContent = String(level);
  element("result-streak").textContent = String(bestStreak);
  element("result-accuracy").textContent = `${accuracy}%`;
  element("result-rating").textContent =
    score > 6500 ? "S" : score > 4000 ? "A" : score > 2200 ? "B" : "C";
}

function updateWeaponRail() {
  document.querySelectorAll<HTMLButtonElement>(".weapon-slot").forEach((button) => {
    const index = Number(button.dataset.weapon);
    const locked = index > Math.floor(level / 2);
    button.disabled = locked;
    button.classList.toggle("active", weaponIndex === index);
    button.setAttribute(
      "aria-label",
      `${WEAPONS[index].name}${locked ? ", locked" : ""}`,
    );
    const label = button.querySelector("b");
    if (label) label.textContent = locked ? "LOCK" : WEAPONS[index].code;
  });
}

function setStarted(update: Updater<boolean>) {
  started = resolveUpdate(started, update);
  element("start-screen").hidden = started;
  updateTouchLayer();
}

function setGameOver(update: Updater<boolean>) {
  gameOver = resolveUpdate(gameOver, update);
  element("result-screen").hidden = !gameOver;
  if (gameOver) {
    updateResults();
    requestCloudSave(true);
  }
  updateTouchLayer();
}

function setScore(update: Updater<number>) {
  const previousScore = score;
  score = resolveUpdate(score, update);
  cloudProfile.bestScore = Math.max(cloudProfile.bestScore, score);
  youtubePlayables.sendScore(cloudProfile.bestScore);
  element("score-value").textContent = score
    .toLocaleString("en-US")
    .padStart(6, "0");
  if (score > previousScore) {
    replayClass(element("score-hud"), "score-hud score-bump");
  }
}

function setLevel(update: Updater<number>) {
  level = resolveUpdate(level, update);
  cloudProfile.highestDrill = Math.max(cloudProfile.highestDrill, level);
  updateWeaponRail();
}

function setStreak(update: Updater<number>) {
  streak = resolveUpdate(streak, update);
}

function setBestStreak(update: Updater<number>) {
  bestStreak = resolveUpdate(bestStreak, update);
  cloudProfile.bestStreak = Math.max(cloudProfile.bestStreak, bestStreak);
}

function setCombo(update: Updater<number>) {
  combo = resolveUpdate(combo, update);
  element("combo-badge").classList.toggle("active", combo > 1);
  element("combo-value").textContent =
    `x${(1 + (combo - 1) * 0.25).toFixed(2)}`;
}

function setAccuracy(update: Updater<number>) {
  accuracy = resolveUpdate(accuracy, update);
}

function setDifficulty(update: Updater<DifficultyKey>) {
  difficulty = resolveUpdate(difficulty, update);
  difficultyRef.current = difficulty;
  element("difficulty-label").textContent = DIFFICULTIES[difficulty].label;
  document
    .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
    .forEach((button) => {
      const active = button.dataset.difficulty === difficulty;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
}

function setAmmo(update: Updater<{ mag: number; reserve: number }>) {
  ammo = resolveUpdate(ammo, update);
  element("ammo-mag").textContent = String(ammo.mag).padStart(2, "0");
  element("ammo-reserve").textContent =
    `/ ${String(ammo.reserve).padStart(3, "0")}`;
  element("ammo-panel").classList.toggle("low", ammo.mag <= 5);
}

function setWeaponIndex(update: Updater<number>) {
  weaponIndex = resolveUpdate(weaponIndex, update);
  updateWeaponRail();
}

function setTime(update: Updater<number>) {
  time = resolveUpdate(time, update);
}

function setObjective(update: Updater<string>) {
  objective = resolveUpdate(objective, update);
}

function setFeed(update: Updater<string>) {
  feed = resolveUpdate(feed, update);
  const target = element("kill-feed");
  target.textContent = feed;
  target.classList.toggle("visible", Boolean(feed));
}

function setHitPulse(
  update: Updater<number>,
  kind: "body" | "head" | "kill" = "body",
) {
  hitPulse = resolveUpdate(hitPulse, update);
  replayClass(element("hitmarker"), `hitmarker pulse ${kind}`);
}

function pulseShotFlash() {
  replayClass(element("shot-pulse"), "shot-pulse active");
}

function setDamageFlash(update: Updater<number>) {
  damageFlash = resolveUpdate(damageFlash, update);
  replayClass(element("level-flash"), "level-flash");
}

function setPlayerHitFlash(update: Updater<number>) {
  playerHitFlash = resolveUpdate(playerHitFlash, update);
  replayClass(element("player-hit-flash"), "player-hit-flash");
}

function setHealth(update: Updater<number>) {
  health = resolveUpdate(health, update);
}

function setReloading(update: Updater<boolean>) {
  reloading = resolveUpdate(reloading, update);
  const button = element<HTMLButtonElement>("reload-button");
  button.disabled = reloading;
  button.textContent = reloading ? "RELOADING" : "R  RELOAD";
}

function setIsMobile(update: Updater<boolean>) {
  isMobile = resolveUpdate(isMobile, update);
  element("aim-help").textContent = isMobile ? "DRAG TO AIM" : "MOVE MOUSE";
  element("fire-help").textContent = isMobile ? "HOLD SHOOT" : "LEFT CLICK";
  element("move-help").textContent = "NO MOVEMENT";
  updateTouchLayer();
}

function showFeed(message: string) {
    setFeed(message);
    if (feedTimer.current) clearGameTimeout(feedTimer.current);
    feedTimer.current = gameTimeout(() => setFeed(""), 850);
}

const coarsePointerQuery = matchMedia("(pointer: coarse)");
const onPointerModeChange = (event: MediaQueryListEvent) =>
  setIsMobile(event.matches);
setIsMobile(coarsePointerQuery.matches);
coarsePointerQuery.addEventListener("change", onPointerModeChange);
const performanceNavigator = navigator as Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};
const mobileRendering = coarsePointerQuery.matches;
const mobileDeviceMemory = performanceNavigator.deviceMemory ?? 4;
const mobileCpuCores = navigator.hardwareConcurrency || 4;
const constrainedRendering =
  performanceNavigator.connection?.saveData === true ||
  (mobileRendering &&
    (mobileDeviceMemory <= 3 || mobileCpuCores <= 3));
const premiumMobileRendering =
  mobileRendering &&
  !constrainedRendering &&
  mobileDeviceMemory >= 6 &&
  mobileCpuCores >= 6;
const renderProfile = {
  maxPixelRatio: mobileRendering
    ? constrainedRendering
      ? 1.15
      : premiumMobileRendering
        ? 1.75
        : 1.5
    : 1.5,
  minPixelRatio: mobileRendering ? (constrainedRendering ? 0.9 : 1.05) : 1,
  antialias: !constrainedRendering,
  shadows: !mobileRendering,
  shadowMapSize: 768,
  practicalLights: mobileRendering ? 1 : 2,
  smokeWisps: constrainedRendering ? 3 : mobileRendering ? 5 : 8,
  rearSmoke: constrainedRendering ? 8 : mobileRendering ? 12 : 18,
  dustCount: constrainedRendering ? 90 : mobileRendering ? 150 : 260,
  hitParticles: constrainedRendering ? 8 : mobileRendering ? 11 : 17,
  characterAnimationFps: constrainedRendering ? 30 : mobileRendering ? 45 : 60,
};
const removeYouTubePauseListener = youtubePlayables.onPause(() => {
  requestCloudSave(true);
  youtubePaused = true;
  lookPointer.current = null;
  updateTouchLayer();
  engineRef.current?.pauseFromYouTube();
});
const removeYouTubeResumeListener = youtubePlayables.onResume(() => {
  youtubePaused = false;
  updateTouchLayer();
  engineRef.current?.resumeFromYouTube();
});
const removeYouTubeAudioListener = youtubePlayables.onAudioChange((enabled) => {
  engineRef.current?.setYouTubeAudioEnabled(enabled);
});
const mount = element<HTMLDivElement>("viewport");

    const loadingScreen = element<HTMLElement>("loading-screen");
    const loadingStatus = element<HTMLElement>("loading-status");
    const loadingDetail = element<HTMLElement>("loading-detail");
    const loadingPercent = element<HTMLElement>("loading-percent");
    const loadingFill = element<HTMLElement>("loading-fill");
    const loadingTrack = loadingScreen.querySelector<HTMLElement>(".loading-track")!;
    const deployButton = element<HTMLButtonElement>("deploy-button");
    const loadingRetry = element<HTMLButtonElement>("loading-retry");
    let sceneFirstFrameRendered = false;
    let trackedAssetsLoaded = false;
    let shadersPrepared = false;
    let loadingFailed = false;
    let shaderPreparationStarted = false;

    function updateLoadingProgress(
      progress: number,
      detail: string,
      status = "Loading scene and survival assets...",
    ) {
      const value = Math.round(THREE.MathUtils.clamp(progress, 0, 100));
      loadingFill.style.width = `${value}%`;
      loadingPercent.textContent = `${value}%`;
      loadingDetail.textContent = detail;
      loadingStatus.textContent = status;
      loadingTrack.setAttribute("aria-valuenow", String(value));
    }

    function showLoadingFailure(url: string) {
      loadingFailed = true;
      gameAssetsReady = false;
      deployButton.disabled = true;
      deployButton.setAttribute("aria-disabled", "true");
      loadingScreen.classList.add("failed");
      loadingRetry.hidden = false;
      updateLoadingProgress(
        0,
        "CONNECTION LOST",
        `Could not load ${url.split("/").pop() ?? "a required asset"}.`,
      );
    }

    function finishLoading() {
      if (
        gameAssetsReady ||
        loadingFailed ||
        !trackedAssetsLoaded ||
        !sceneFirstFrameRendered ||
        !shadersPrepared
      ) {
        return;
      }
      gameAssetsReady = true;
      updateLoadingProgress(100, "READY", "Everything is loaded. Survive the night.");
      deployButton.disabled = false;
      deployButton.setAttribute("aria-disabled", "false");
      document.documentElement.dataset.assetsReady = "true";
      document.documentElement.dataset.gameReady = "true";
      youtubePlayables.signalGameReady();
      loadingScreen.classList.add("complete");
      window.setTimeout(() => {
        if (gameAssetsReady) loadingScreen.hidden = true;
      }, 560);
    }

    const loadingManager = new THREE.LoadingManager();
    loadingManager.onStart = () => {
      updateLoadingProgress(10, "LOCATING SURVIVORS");
    };
    loadingManager.onProgress = (_url, loaded, total) => {
      updateLoadingProgress(
        10 + (loaded / Math.max(1, total)) * 78,
        loaded < total ? "LOADING INFECTED" : "ASSEMBLING STREET",
      );
    };
    loadingManager.onError = showLoadingFailure;
    loadingRetry.addEventListener("click", () => window.location.reload());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07100f);
    scene.fog = new THREE.FogExp2(0x0b1615, 0.0135);

    const camera = new THREE.PerspectiveCamera(
      68,
      mount.clientWidth / mount.clientHeight,
      0.05,
      140,
    );
    camera.position.set(0, 1.72, 11.5);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({
      antialias: renderProfile.antialias,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
    });
    let renderPixelRatio = Math.min(devicePixelRatio, renderProfile.maxPixelRatio);
    renderer.setPixelRatio(renderPixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.domElement.style.imageRendering = "auto";
    renderer.shadowMap.enabled = renderProfile.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Three-dimensional zombie survival street");
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x506f78, 0x15100c, 1.18);
    scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(0x86aabd, 2.65);
    moonLight.position.set(-18, 26, -8);
    moonLight.castShadow = false;
    scene.add(moonLight);

    const survivorLight = new THREE.SpotLight(
      0xc4ddd6,
      225,
      82,
      Math.PI * 0.23,
      0.62,
      1.35,
    );
    survivorLight.position.set(0, 5.8, 10.5);
    survivorLight.target.position.set(0, 1.1, -34);
    survivorLight.castShadow = renderProfile.shadows;
    survivorLight.shadow.mapSize.set(
      renderProfile.shadowMapSize,
      renderProfile.shadowMapSize,
    );
    survivorLight.shadow.camera.near = 1.5;
    survivorLight.shadow.camera.far = 68;
    survivorLight.shadow.bias = -0.00045;
    scene.add(survivorLight, survivorLight.target);

    const moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 28),
      new THREE.MeshBasicMaterial({
        color: 0xa9c2cc,
        fog: false,
        depthWrite: false,
      }),
    );
    moonDisc.position.set(-31, 24, -105);
    scene.add(moonDisc);

    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const floorContext = floorCanvas.getContext("2d")!;
    floorContext.fillStyle = "#171b1a";
    floorContext.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 760; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const shade = 19 + Math.floor(Math.random() * 22);
      floorContext.fillStyle = `rgba(${shade},${shade + 3},${shade + 1},${0.18 + Math.random() * 0.25})`;
      floorContext.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 38; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      floorContext.strokeStyle = `rgba(2,5,5,${0.2 + Math.random() * 0.34})`;
      floorContext.lineWidth = 1 + Math.random() * 2;
      floorContext.beginPath();
      floorContext.moveTo(x, y);
      floorContext.bezierCurveTo(
        x + 18,
        y + (Math.random() - 0.5) * 16,
        x + 38,
        y + (Math.random() - 0.5) * 20,
        x + 58 + Math.random() * 50,
        y + (Math.random() - 0.5) * 24,
      );
      floorContext.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4, 15);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const brickCanvas = document.createElement("canvas");
    brickCanvas.width = 512;
    brickCanvas.height = 512;
    const brickContext = brickCanvas.getContext("2d")!;
    brickContext.fillStyle = "#15191a";
    brickContext.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 16; row++) {
      const offset = row % 2 ? -32 : 0;
      for (let column = 0; column < 9; column++) {
        const x = offset + column * 64;
        const y = row * 32;
        const value = 25 + ((row * 9 + column * 13) % 15);
        brickContext.fillStyle = `rgb(${value + 6},${value + 3},${value})`;
        brickContext.fillRect(x + 2, y + 2, 60, 28);
        brickContext.strokeStyle = "rgba(4,6,6,.7)";
        brickContext.strokeRect(x + 1, y + 1, 62, 30);
      }
    }
    const brickTexture = new THREE.CanvasTexture(brickCanvas);
    brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping;
    brickTexture.repeat.set(3, 3);
    brickTexture.colorSpace = THREE.SRGBColorSpace;
    brickTexture.anisotropy = floorTexture.anisotropy;

    const crateCanvas = document.createElement("canvas");
    crateCanvas.width = 256;
    crateCanvas.height = 256;
    const crateContext = crateCanvas.getContext("2d")!;
    const crateGradient = crateContext.createLinearGradient(0, 0, 256, 256);
    crateGradient.addColorStop(0, "#6d4b2f");
    crateGradient.addColorStop(0.5, "#4c321f");
    crateGradient.addColorStop(1, "#2d2119");
    crateContext.fillStyle = crateGradient;
    crateContext.fillRect(0, 0, 256, 256);
    for (let plank = 0; plank < 8; plank++) {
      const y = plank * 32;
      crateContext.fillStyle = plank % 2 === 0
        ? "rgba(179,125,72,.1)"
        : "rgba(15,9,6,.13)";
      crateContext.fillRect(0, y, 256, 29);
      crateContext.fillStyle = "rgba(10,7,5,.72)";
      crateContext.fillRect(0, y + 29, 256, 3);
    }
    for (let grain = 0; grain < 95; grain++) {
      const y = Math.random() * 256;
      const length = 18 + Math.random() * 76;
      crateContext.strokeStyle = `rgba(20,12,8,${0.12 + Math.random() * 0.18})`;
      crateContext.lineWidth = 0.6 + Math.random() * 1.4;
      crateContext.beginPath();
      crateContext.moveTo(Math.random() * 256, y);
      crateContext.lineTo(Math.random() * 256 + length, y + (Math.random() - 0.5) * 4);
      crateContext.stroke();
    }
    for (const x of [14, 242]) {
      for (let y = 15; y < 256; y += 32) {
        crateContext.fillStyle = "#17120e";
        crateContext.beginPath();
        crateContext.arc(x, y, 2.2, 0, Math.PI * 2);
        crateContext.fill();
      }
    }
    const crateTexture = new THREE.CanvasTexture(crateCanvas);
    crateTexture.wrapS = crateTexture.wrapT = THREE.RepeatWrapping;
    crateTexture.colorSpace = THREE.SRGBColorSpace;
    crateTexture.anisotropy = floorTexture.anisotropy;

    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x2a302e,
      map: floorTexture,
      roughness: 0.96,
      metalness: 0.04,
    });
    const brick = new THREE.MeshStandardMaterial({
      color: 0x5a5e59,
      map: brickTexture,
      roughness: 0.93,
      metalness: 0.02,
    });
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x333837,
      roughness: 0.9,
      metalness: 0.05,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x12191a,
      roughness: 0.82,
      metalness: 0.2,
      envMapIntensity: 0,
    });
    const rust = new THREE.MeshStandardMaterial({
      color: 0x3e2218,
      roughness: 0.96,
      metalness: 0.04,
      envMapIntensity: 0,
    });
    const crateWood = new THREE.MeshStandardMaterial({
      color: 0x8d6843,
      map: crateTexture,
      roughness: 0.96,
      metalness: 0.01,
    });
    const crateEdge = new THREE.MeshStandardMaterial({
      color: 0x302117,
      roughness: 0.91,
      metalness: 0.03,
    });
    const deadGlass = new THREE.MeshStandardMaterial({
      color: 0x172024,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0,
    });
    const windowGlow = new THREE.MeshStandardMaterial({
      color: 0x5c3018,
      emissive: 0xff7a30,
      emissiveIntensity: 2.35,
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0,
    });
    const redGlow = new THREE.MeshBasicMaterial({ color: 0xff2f25 });

    const world = new THREE.Group();
    const obstacleBoxes: { x: number; z: number; halfW: number; halfD: number }[] = [];
    const flickerLights: THREE.PointLight[] = [];
    const smokeWisps: THREE.Mesh[] = [];
    const rearSmoke: THREE.Sprite[] = [];
    scene.add(world);
    roundedBox(world, [30, 0.34, 102], [0, -0.17, -37], asphalt, 0.08);
    roundedBox(world, [3.5, 0.55, 102], [-16.5, -0.05, -37], concrete, 0.06);
    roundedBox(world, [3.5, 0.55, 102], [16.5, -0.05, -37], concrete, 0.06);
    for (const x of [-5.3, 5.3]) {
      const lane = roundedBox(
        world,
        [0.12, 0.025, 94],
        [x, 0.025, -38],
        new THREE.MeshBasicMaterial({ color: 0x4d4b3e, transparent: true, opacity: 0.36 }),
        0.01,
      );
      lane.receiveShadow = false;
    }

    function addBuilding(
      side: -1 | 1,
      z: number,
      width: number,
      depth: number,
      height: number,
      litPattern: number,
    ) {
      const x = side * (17.3 + width / 2);
      const building = roundedBox(
        world,
        [width, height, depth],
        [x, height / 2 - 0.02, z],
        brick,
        0.09,
        false,
      );
      building.rotation.y = side * 0.006;
      roundedBox(
        world,
        [width + 0.22, 0.32, depth + 0.22],
        [x, height + 0.08, z],
        concrete,
        0.05,
      );
      const stories = Math.max(2, Math.floor(height / 2.5));
      const columns = Math.max(2, Math.floor(depth / 2.8));
      for (let story = 0; story < stories; story++) {
        for (let column = 0; column < columns; column++) {
          const lit = (story * 7 + column * 3 + litPattern) % 5 === 0;
          const windowMaterial = lit ? windowGlow : deadGlass;
          const window = box(
            world,
            [0.09, 1.05, 1.25],
            [
              side * 17.24,
              1.45 + story * 2.25,
              z - depth * 0.36 + column * (depth * 0.72) / Math.max(1, columns - 1),
            ],
            windowMaterial,
          );
          window.rotation.y = side > 0 ? 0 : Math.PI;
        }
      }
    }

    const buildings = [
      [-1, 5, 8, 16, 10, 1], [1, 4, 9, 17, 13, 3],
      [-1, -14, 10, 18, 15, 2], [1, -16, 8, 16, 9, 5],
      [-1, -36, 9, 20, 12, 4], [1, -38, 11, 19, 16, 1],
      [-1, -60, 12, 22, 17, 6], [1, -61, 9, 21, 12, 2],
      [-1, -84, 11, 18, 14, 3], [1, -85, 12, 19, 18, 5],
    ] as const;
    buildings.forEach((entry) =>
      addBuilding(
        entry[0] as -1 | 1,
        entry[1],
        entry[2],
        entry[3],
        entry[4],
        entry[5],
      ),
    );

    roundedBox(world, [28, 14, 2.5], [0, 7, -91], brick, 0.08, true);
    const quarantineSign = makeLabel("QUARANTINE", "#ff493d", "rgba(8,5,5,.92)");
    quarantineSign.position.set(0, 5.2, -89.65);
    quarantineSign.scale.set(7.4, 1.65, 1);
    world.add(quarantineSign);
    let practicalLightsUsed = 0;
    function addStreetLamp(x: number, z: number, working: boolean) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 5.4, 8), steel);
      pole.position.set(x, 2.7, z);
      pole.castShadow = true;
      const arm = roundedBox(world, [1.15, 0.1, 0.1], [x + Math.sign(x) * -0.5, 5.25, z], steel, 0.035);
      arm.rotation.z = Math.sign(x) * 0.08;
      const lamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.36, 0.18, 8),
        working ? windowGlow : deadGlass,
      );
      lamp.rotation.z = Math.PI / 2;
      lamp.position.set(x + Math.sign(x) * -0.98, 5.14, z);
      world.add(pole, lamp);
      if (working && practicalLightsUsed < renderProfile.practicalLights) {
        const light = new THREE.PointLight(0xffa65c, 58, 17, 2.1);
        light.position.copy(lamp.position);
        light.userData.baseIntensity = 48;
        light.userData.phase = Math.random() * 16;
        flickerLights.push(light);
        world.add(light);
        practicalLightsUsed++;
      }
    }
    for (const [x, z, working] of [
      [-13.2, 7, true], [13.2, -7, false], [-13.2, -22, true],
      [13.2, -38, true], [-13.2, -54, false], [13.2, -70, true],
    ] as const) addStreetLamp(x, z, working);

    function addWreck(x: number, z: number, rotation: number, scale = 1) {
      const wreck = new THREE.Group();
      wreck.position.set(x, 0, z);
      wreck.rotation.y = rotation;
      world.add(wreck);
      roundedBox(wreck, [3.2 * scale, 0.72 * scale, 1.7 * scale], [0, 0.63 * scale, 0], rust, 0.24, true);
      roundedBox(wreck, [1.7 * scale, 0.62 * scale, 1.5 * scale], [-0.25 * scale, 1.2 * scale, 0], deadGlass, 0.18, true);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34 * scale, 0.34 * scale, 0.2 * scale, 10),
            steel,
          );
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(sx * 1.05 * scale, 0.33 * scale, sz * 0.88 * scale);
          wreck.add(wheel);
        }
      }
      obstacleBoxes.push({ x, z, halfW: 1.9 * scale, halfD: 1.25 * scale });
    }

    function addBrokenCrates(x: number, z: number, rotation: number, scale = 1) {
      const pile = new THREE.Group();
      pile.position.set(x, 0, z);
      pile.rotation.y = rotation;
      world.add(pile);

      const addCrate = (
        cx: number,
        cy: number,
        cz: number,
        crateScale: number,
        turn = 0,
        broken = false,
      ) => {
        const crate = new THREE.Group();
        crate.position.set(cx, cy, cz);
        crate.rotation.y = turn;
        crate.rotation.z = broken ? -0.055 : 0;
        pile.add(crate);
        const width = 1.72 * crateScale;
        const height = 1.18 * crateScale;
        const depth = 1.28 * crateScale;
        for (const faceZ of [-1, 1]) {
          for (let row = 0; row < 4; row++) {
            if (broken && faceZ === 1 && row === 3) continue;
            const slat = roundedBox(
              crate,
              [width, height * 0.205, 0.09 * crateScale],
              [0, -height * 0.37 + row * height * 0.25, faceZ * depth * 0.47],
              crateWood,
              0.022 * crateScale,
              true,
            );
            if (broken && faceZ === 1 && row === 2) slat.rotation.z = 0.08;
          }
        }
        for (const faceX of [-1, 1]) {
          for (let row = 0; row < 4; row++) {
            roundedBox(
              crate,
              [0.09 * crateScale, height * 0.205, depth * 0.9],
              [faceX * width * 0.47, -height * 0.37 + row * height * 0.25, 0],
              crateWood,
              0.022 * crateScale,
              true,
            );
          }
        }
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            roundedBox(
              crate,
              [0.14 * crateScale, height * 1.08, 0.14 * crateScale],
              [sx * width * 0.43, 0, sz * depth * 0.43],
              crateEdge,
              0.025 * crateScale,
              true,
            );
          }
        }
      };

      addCrate(-0.72 * scale, 0.6 * scale, 0, scale, -0.04, false);
      addCrate(0.72 * scale, 0.56 * scale, 0.08 * scale, scale * 0.92, 0.08, true);
      addCrate(-0.28 * scale, 1.64 * scale, 0.04 * scale, scale * 0.78, 0.13, true);

      const scatteredPlanks = [
        [-1.8, 0.11, 0.95, 0.28, 0.16],
        [1.72, 0.09, 0.92, -0.38, -0.09],
        [0.82, 0.13, -1.02, 0.46, 0.12],
      ] as const;
      for (const [px, py, pz, yaw, roll] of scatteredPlanks) {
        const plank = roundedBox(
          pile,
          [1.28 * scale, 0.12 * scale, 0.24 * scale],
          [px * scale, py * scale, pz * scale],
          crateWood,
          0.02 * scale,
          true,
        );
        plank.rotation.set(roll, yaw, roll * 0.5);
      }
      obstacleBoxes.push({ x, z, halfW: 2.2 * scale, halfD: 1.45 * scale });
    }

    addBrokenCrates(-9.5, -8, 0.14, 0.92);
    addWreck(9.4, -31, -0.22, 1.05);
    addWreck(-9.8, -57, 0.28, 1);

    for (const [x, z, turn] of [
      [11.8, 1, -0.08], [-12, -18, 0.1], [11.8, -48, -0.05], [-11.8, -76, 0.08],
    ] as const) {
      const dumpster = roundedBox(world, [2.2, 1.55, 1.5], [x, 0.78, z], rust, 0.13, true);
      dumpster.rotation.y = turn;
      obstacleBoxes.push({ x, z, halfW: 1.35, halfD: 1.05 });
    }

    for (let i = 0; i < renderProfile.smokeWisps; i++) {
      const wisp = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 2),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x3b4741 : 0x24302d,
          transparent: true,
          opacity: 0.035 + (i % 3) * 0.012,
          depthWrite: false,
        }),
      );
      wisp.position.set((Math.random() - 0.5) * 26, 0.8 + Math.random() * 2.4, -5 - Math.random() * 80);
      wisp.scale.set(4 + Math.random() * 5, 0.8 + Math.random(), 2 + Math.random() * 4);
      wisp.userData.drift = 0.16 + Math.random() * 0.22;
      wisp.userData.phase = Math.random() * 10;
      smokeWisps.push(wisp);
      world.add(wisp);
    }

    const smokeCanvas = document.createElement("canvas");
    smokeCanvas.width = 256;
    smokeCanvas.height = 256;
    const smokeContext = smokeCanvas.getContext("2d")!;
    smokeContext.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 54; i++) {
      const x = 38 + Math.random() * 180;
      const y = 48 + Math.random() * 160;
      const radius = 18 + Math.random() * 50;
      const gradient = smokeContext.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(174, 196, 185, ${0.14 + Math.random() * 0.12})`);
      gradient.addColorStop(0.48, `rgba(109, 137, 127, ${0.06 + Math.random() * 0.06})`);
      gradient.addColorStop(1, "rgba(45, 63, 58, 0)");
      smokeContext.fillStyle = gradient;
      smokeContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    smokeTexture.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < renderProfile.rearSmoke; i++) {
      const baseOpacity = 0.16 + (i % 4) * 0.028;
      const material = new THREE.SpriteMaterial({
        map: smokeTexture,
        color: i % 3 === 0 ? 0x8ba29a : 0x657a73,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        fog: true,
      });
      const smoke = new THREE.Sprite(material);
      const depth = -43 - (i % 6) * 8.2 - Math.floor(i / 6) * 2.6;
      smoke.position.set(-19 + (i * 7.1) % 38, 1.7 + (i % 5) * 0.72, depth);
      smoke.scale.set(15 + (i % 4) * 4.5, 7 + (i % 3) * 2.8, 1);
      smoke.userData.baseX = smoke.position.x;
      smoke.userData.baseY = smoke.position.y;
      smoke.userData.baseZ = smoke.position.z;
      smoke.userData.baseScaleX = smoke.scale.x;
      smoke.userData.baseScaleY = smoke.scale.y;
      smoke.userData.baseOpacity = baseOpacity;
      smoke.userData.phase = Math.random() * Math.PI * 2;
      rearSmoke.push(smoke);
      world.add(smoke);
    }

    const dustPositions = new Float32Array(renderProfile.dustCount * 3);
    for (let i = 0; i < renderProfile.dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 36;
      dustPositions[i * 3 + 1] = 0.15 + Math.random() * 5.6;
      dustPositions[i * 3 + 2] = 12 - Math.random() * 106;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(dustPositions, 3),
    );
    const dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0x9caaa0,
        size: 0.065,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    world.add(dust);
    const shotBlockers: THREE.Mesh[] = [];
    world.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (
        materials.some(
          (material) => material instanceof THREE.MeshStandardMaterial,
        )
      ) {
        shotBlockers.push(object);
      }
    });

    const targetRoot = new THREE.Group();
    scene.add(targetRoot);
    const targets = new Map<number, TargetState>();
    let targetId = 0;
    let engineDisposed = false;
    let zombieTemplate: THREE.Object3D | null = null;
    let zombieClips: THREE.AnimationClip[] = [];
    const zombieStrideDistances = new Map<string, number>();
    let enemyAssetsReady = false;

    function prepareZombieClip(source: THREE.AnimationClip) {
      const clip = source.clone();
      const isLocomotion = ["Walk", "Walk2", "Crawl", "Running_Crawl"].some(
        (name) => source.name.endsWith(`|${name}`),
      );
      if (!isLocomotion) return clip;
      const hipsTrack = clip.tracks.find(
        (track) =>
          track.name.endsWith("mixamorigHips.position") &&
          track instanceof THREE.VectorKeyframeTrack,
      ) as THREE.VectorKeyframeTrack | undefined;
      if (!hipsTrack || hipsTrack.values.length < 6) return clip;
      const values = hipsTrack.values;
      const last = values.length - 3;
      const stride = Math.hypot(
        values[last] - values[0],
        values[last + 2] - values[2],
      );
      zombieStrideDistances.set(source.name, Math.max(0.01, stride));
      const anchorX = values[0];
      const anchorZ = values[2];
      for (let index = 0; index < values.length; index += 3) {
        values[index] = anchorX;
        values[index + 2] = anchorZ;
      }
      clip.resetDuration();
      return clip;
    }

    function updateEnemyAssetState() {
      enemyAssetsReady = Boolean(zombieTemplate && zombieClips.length);
      if (enemyAssetsReady) deployLevelSquad();
    }

    function improveImportedTexture(texture: THREE.Texture | null) {
      if (!texture) return;
      texture.anisotropy = Math.min(
        premiumMobileRendering ? 8 : 4,
        renderer.capabilities.getMaxAnisotropy(),
      );
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
    }

    function improveImportedMaterial(material: THREE.Material) {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      improveImportedTexture(material.map);
      improveImportedTexture(material.normalMap);
      improveImportedTexture(material.roughnessMap);
      improveImportedTexture(material.metalnessMap);
      improveImportedTexture(material.emissiveMap);
    }

    const zombieLoader = new GLTFLoader(loadingManager);
    zombieLoader.load(
      "./models/zombie.glb",
      (gltf) => {
        if (engineDisposed) return;
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.frustumCulled = true;
            object.castShadow = renderProfile.shadows;
            object.receiveShadow = renderProfile.shadows;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) {
              if (!(material instanceof THREE.MeshStandardMaterial)) continue;
              improveImportedMaterial(material);
              material.emissive.setHex(0x10191a);
              material.emissiveIntensity = 0.32;
              material.roughness = Math.max(material.roughness, 0.78);
              material.metalness = Math.min(material.metalness, 0.12);
              material.envMapIntensity = 0;
            }
          }
        });
        zombieTemplate = gltf.scene;
        zombieClips = gltf.animations.map(prepareZombieClip);
        updateEnemyAssetState();
      },
      undefined,
      () => showFeed("ZOMBIE ASSET FAILED TO LOAD"),
    );

    function createTarget(
      x: number,
      z: number,
      motion: TargetState["motion"],
      deploymentDelay = 0,
      entry: "street" | "alley" = "street",
    ) {
      if (!enemyAssetsReady || !zombieTemplate) return;
      const spawnPoint = findWalkableSpawn(x, z);
      x = spawnPoint.x;
      z = spawnPoint.z;
      const group = new THREE.Group();
      group.position.set(x, -2.2, z);
      group.userData.isZombie = true;
      group.userData.entry = entry;
      const character = cloneSkeleton(zombieTemplate);
      const id = ++targetId;
      const variantScale = motion === "brute" ? 0.5 : motion === "crawler" ? 0.39 : 0.42;
      character.scale.setScalar(variantScale);
      character.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.frustumCulled = true;
        object.castShadow = renderProfile.shadows;
        object.receiveShadow = renderProfile.shadows;
        object.userData = { targetId: id, zone: "torso" };
      });
      group.add(character);

      const hitboxMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(motion === "brute" ? 0.34 : 0.28, 10, 8), hitboxMaterial);
      head.position.set(0, motion === "crawler" ? 0.82 : motion === "brute" ? 1.88 : 1.62, 0.02);
      head.userData = { targetId: id, zone: "head" };
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(motion === "brute" ? 0.95 : 0.72, motion === "crawler" ? 0.66 : 1.02, 0.52),
        hitboxMaterial.clone(),
      );
      torso.position.set(0, motion === "crawler" ? 0.48 : motion === "brute" ? 1.17 : 1.02, 0);
      torso.userData = { targetId: id, zone: "torso" };
      group.add(head, torso);
      targetRoot.add(group);

      const difficultyConfig = DIFFICULTIES[difficultyRef.current];
      const drill = levelConfig(levelLive);
      const now = gameNow();
      const speedMultiplier =
        motion === "runner" ? 1.26 : motion === "crawler" ? 1.08 : motion === "brute" ? 0.7 : 0.86;
      const speed =
        drill.advanceSpeed *
        speedMultiplier *
        difficultyConfig.speedScale *
        (0.92 + Math.random() * 0.16);
      const hp =
        motion === "brute"
          ? 155 + levelLive * 18
          : motion === "runner"
            ? 68 + levelLive * 7
            : motion === "crawler"
              ? 58 + levelLive * 6
              : 82 + levelLive * 8;

      const mixer = new THREE.AnimationMixer(character);
      const actions = new Map<string, THREE.AnimationAction>();
      const actionNames = {
        idle: "Idle",
        scream: "Scream",
        walk: "Walk",
        run: "Walk2",
        crawl: "Crawl",
        crawlRun: "Running_Crawl",
        attack: "Attack",
        attackAlt: "Headbutt",
        bite: "Bite_ground",
        hit: "Hit_reaction",
        death: "Die",
        deathAlt: "Die2",
      } as const;
      for (const [key, clipName] of Object.entries(actionNames)) {
        const clip = zombieClips.find((candidate) => candidate.name.endsWith(`|${clipName}`));
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        if (["scream", "attack", "attackAlt", "bite", "hit", "death", "deathAlt"].includes(key)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = key === "death" || key === "deathAlt";
        }
        if (["walk", "run", "crawl", "crawlRun"].includes(key)) {
          const modelStride = zombieStrideDistances.get(clip.name) ?? 1;
          const worldStride = modelStride * variantScale;
          const cycleDuration = THREE.MathUtils.clamp(
            worldStride / Math.max(0.1, speed),
            key === "run" || key === "crawlRun" ? 0.38 : 0.58,
            key === "walk" || key === "crawl" ? 1.45 : 0.92,
          );
          action.setDuration(cycleDuration);
        } else {
          const oneShotScale = ({
            idle: 0.92,
            scream: entry === "alley" ? 3.45 : 2.15,
            attack: 3.2,
            attackAlt: 3.1,
            bite: 5.35,
            hit: 3.8,
            death: 1.2,
            deathAlt: 1.34,
          } as Record<string, number>)[key];
          if (oneShotScale) action.setEffectiveTimeScale(oneShotScale);
        }
        actions.set(key, action);
      }
      actions.get("idle")?.play();
      targets.set(id, {
        id,
        group,
        head,
        torso,
        hp,
        bornAt: now + deploymentDelay,
        lifetime: drill.targetLife * difficultyConfig.lifeScale,
        phase: Math.random() * Math.PI * 2,
        motion,
        baseX: x,
        baseY: 0,
        baseZ: z,
        speed,
        range: 0,
        dead: false,
        mixer,
        actions,
        activeAction: "idle",
        nextAttackAt: now + deploymentDelay + drill.firstShot,
        screamingUntil: now + deploymentDelay + (entry === "alley" ? 720 : 1250),
        flankDirection: id % 2 === 0 ? 1 : -1,
        facingYaw: Math.atan2(camera.position.x - x, camera.position.z - z),
      });
    }

    function setEnemyLocomotion(target: TargetState, key: string) {
      if (!target.actions || target.activeAction === key || target.dead) return;
      const next = target.actions.get(key) ?? target.actions.get("idle");
      if (!next) return;
      const current = target.activeAction
        ? target.actions.get(target.activeAction)
        : undefined;
      current?.fadeOut(0.18);
      next.reset().setEffectiveWeight(1).fadeIn(0.18).play();
      target.activeAction = key;
    }

    function playEnemyOneShot(target: TargetState, key: string) {
      const action = target.actions?.get(key);
      if (!action || target.dead) return;
      if (["scream", "attack", "attackAlt", "bite", "hit"].includes(key)) {
        const current = target.activeAction
          ? target.actions?.get(target.activeAction)
          : undefined;
        if (current !== action) current?.fadeOut(key === "hit" ? 0.06 : 0.1);
        target.activeAction = key;
      }
      action.stop();
      action.reset().setEffectiveWeight(1).fadeIn(key === "hit" ? 0.04 : 0.07).play();
      if (key === "hit") target.reactionUntil = gameNow() + 155;
    }

    const weaponRoot = new THREE.Group();
    camera.add(weaponRoot);
    scene.add(camera);
    const muzzle = new THREE.Object3D();
    let weaponVisualScale = 0.4;
    let muzzleFlash: THREE.Mesh | null = null;
    let muzzleLight: THREE.PointLight | null = null;
    let weaponMagazine: THREE.Mesh | null = null;
    let reloadMagazine: THREE.Mesh | null = null;
    let supportHand: THREE.Mesh | null = null;
    let supportArm: THREE.Mesh | null = null;
    let chargingHandle: THREE.Mesh | null = null;
    let importedWeaponRig: THREE.Group | null = null;
    let importedWeaponMixer: THREE.AnimationMixer | null = null;
    let importedIdleAction: THREE.AnimationAction | null = null;
    let importedReloadAction: THREE.AnimationAction | null = null;
    let importedShootAction: THREE.AnimationAction | null = null;
    let importedWeaponReady = false;

    function setupMuzzle(position: THREE.Vector3) {
      muzzle.position.copy(position);
      weaponRoot.add(muzzle);
      muzzleFlash = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.42, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffd68a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
        }),
      );
      muzzleFlash.position.copy(muzzle.position);
      muzzleFlash.rotation.x = -Math.PI / 2;
      weaponRoot.add(muzzleFlash);
      if (!mobileRendering) {
        muzzleLight = new THREE.PointLight(0xff8f32, 0, 2.6, 2.3);
        muzzleLight.position.copy(muzzle.position);
        weaponRoot.add(muzzleLight);
      }
    }

    function buildWeapon(index: number) {
      while (weaponRoot.children.length) weaponRoot.remove(weaponRoot.children[0]);
      weaponMagazine = null;
      reloadMagazine = null;
      supportHand = null;
      supportArm = null;
      chargingHandle = null;
      muzzleFlash = null;
      muzzleLight = null;
      weaponRoot.rotation.set(0, 0, 0);
      if (index === 0 && importedWeaponRig) {
        weaponVisualScale = 1;
        weaponRoot.position.set(0.44, -0.52, -1.72);
        weaponRoot.scale.setScalar(1);
        weaponRoot.add(importedWeaponRig);
        importedReloadAction?.stop();
        importedShootAction?.stop();
        importedIdleAction?.reset().fadeIn(0.08).play();
        setupMuzzle(new THREE.Vector3(0, 0.08, -1.2));
        return;
      }
      importedIdleAction?.stop();
      importedReloadAction?.stop();
      importedShootAction?.stop();
      const w = WEAPONS[index];
      const profile =
        index === 1
          ? { receiver: 0.72, handguard: 0.58, barrel: 0.46, stock: 0.46 }
          : index === 2
            ? { receiver: 1.02, handguard: 1.08, barrel: 1.05, stock: 0.56 }
            : { receiver: 0.9, handguard: 0.9, barrel: 0.72, stock: 0.5 };
      const gunmetal = new THREE.MeshStandardMaterial({
        color: 0x1b272b,
        roughness: 0.76,
        metalness: 0.26,
        envMapIntensity: 0,
      });
      const accent = new THREE.MeshStandardMaterial({
        color: w.color,
        roughness: 0.82,
        metalness: 0.08,
        envMapIntensity: 0,
      });
      const skin = new THREE.MeshStandardMaterial({
        color: 0xb98262,
        roughness: 0.78,
      });
      const sleeve = new THREE.MeshStandardMaterial({
        color: 0x45503c,
        roughness: 0.9,
      });
      weaponVisualScale = index === 1 ? 0.39 : index === 2 ? 0.38 : 0.4;
      weaponRoot.position.set(0.32, -0.3, -1.48);
      weaponRoot.scale.setScalar(weaponVisualScale);
      roundedBox(
        weaponRoot,
        [0.38, 0.32, profile.receiver],
        [0, 0, -0.18],
        gunmetal,
        0.08,
        true,
      );
      const handguard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.19, profile.handguard, 8),
        accent,
      );
      handguard.rotation.x = Math.PI / 2;
      handguard.position.set(0, 0.025, -0.98);
      handguard.castShadow = true;
      weaponRoot.add(handguard);
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.06, profile.barrel, 8),
        gunmetal,
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, -1.66);
      weaponRoot.add(barrel);
      const stock = roundedBox(
        weaponRoot,
        [0.34, 0.24, profile.stock],
        [0, -0.015, 0.53],
        accent,
        0.09,
        true,
      );
      stock.rotation.x = -0.04;
      roundedBox(
        weaponRoot,
        [0.39, 0.3, 0.12],
        [0, -0.03, 0.53 + profile.stock / 2],
        gunmetal,
        0.08,
      );
      roundedBox(
        weaponRoot,
        [0.27, 0.075, 1.32],
        [0, 0.205, -0.52],
        gunmetal,
        0.028,
        true,
      );
      for (const railZ of [-0.62, -0.82, -1.02, -1.22]) {
        roundedBox(
          weaponRoot,
          [0.34, 0.055, 0.08],
          [0, 0.22, railZ],
          gunmetal,
          0.018,
        );
      }
      const grip = roundedBox(
        weaponRoot,
        [0.24, 0.64, 0.3],
        [0, -0.42, -0.04],
        gunmetal,
        0.08,
        true,
      );
      grip.rotation.x = -0.22;
      weaponMagazine = roundedBox(
        weaponRoot,
        [index === 1 ? 0.22 : 0.27, index === 1 ? 0.72 : 0.62, 0.34],
        [0, -0.43, -0.44],
        accent,
        0.07,
        true,
      );
      weaponMagazine.rotation.x = -0.12;
      reloadMagazine = roundedBox(
        weaponRoot,
        [index === 1 ? 0.22 : 0.27, index === 1 ? 0.72 : 0.62, 0.34],
        [0, -1.05, -0.3],
        accent,
        0.07,
        true,
      );
      reloadMagazine.rotation.x = -0.12;
      reloadMagazine.visible = false;

      const rightHand = roundedBox(
        weaponRoot,
        [0.3, 0.34, 0.32],
        [0.08, -0.42, 0.0],
        skin,
        0.11,
        true,
      );
      rightHand.rotation.x = -0.2;
      const rightArm = roundedBox(
        weaponRoot,
        [0.46, 0.42, 1.05],
        [0.32, -0.66, 0.42],
        sleeve,
        0.16,
        true,
      );
      rightArm.rotation.x = -0.34;
      rightArm.rotation.z = -0.12;
      supportHand = roundedBox(
        weaponRoot,
        [0.31, 0.28, 0.36],
        [-0.04, -0.2, -1.02],
        skin,
        0.1,
        true,
      );
      supportArm = roundedBox(
        weaponRoot,
        [0.42, 0.38, 1.2],
        [-0.28, -0.52, -0.54],
        sleeve,
        0.15,
        true,
      );
      supportArm.rotation.x = -0.64;
      supportArm.rotation.z = 0.15;
      chargingHandle = roundedBox(
        weaponRoot,
        [0.12, 0.09, 0.28],
        [0.24, 0.22, -0.12],
        gunmetal,
        0.03,
        true,
      );

      if (index === 2) {
        const scope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.18, 0.68, 12),
          gunmetal,
        );
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.39, -0.42);
        weaponRoot.add(scope);
        roundedBox(
          weaponRoot,
          [0.22, 0.16, 0.1],
          [0, 0.26, -0.35],
          gunmetal,
          0.04,
        );
      } else {
        roundedBox(
          weaponRoot,
          [0.3, 0.09, 0.27],
          [0, 0.31, -0.36],
          gunmetal,
          0.035,
        );
        roundedBox(weaponRoot, [0.055, 0.24, 0.055], [-0.12, 0.4, -0.48], gunmetal, 0.018);
        roundedBox(weaponRoot, [0.055, 0.24, 0.055], [0.12, 0.4, -0.48], gunmetal, 0.018);
        roundedBox(weaponRoot, [0.29, 0.055, 0.055], [0, 0.51, -0.48], gunmetal, 0.018);
        roundedBox(
          weaponRoot,
          [0.038, 0.038, 0.02],
          [0, 0.405, -0.515],
          new THREE.MeshBasicMaterial({ color: 0xff4b37 }),
          0.01,
        );
      }
      roundedBox(
        weaponRoot,
        [0.05, 0.22, 0.08],
        [0, 0.29, -1.48],
        gunmetal,
        0.018,
      );

      setupMuzzle(
        new THREE.Vector3(0, 0.03, -1.66 - profile.barrel / 2),
      );
    }
    buildWeapon(0);

    new GLTFLoader(loadingManager).load(
      "./models/fps-akm.glb",
      (gltf) => {
        if (engineDisposed) return;
        gltf.scene.updateMatrixWorld(true);
        const weaponObject =
          gltf.scene.getObjectByName("AKM_model") ?? gltf.scene;
        const bounds = new THREE.Box3().setFromObject(weaponObject);
        const center = bounds.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.frustumCulled = true;
            object.castShadow = false;
            object.receiveShadow = false;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) {
              if (!(material instanceof THREE.MeshStandardMaterial)) continue;
              improveImportedMaterial(material);
              material.roughness = Math.max(material.roughness, 0.76);
              material.metalness = Math.min(material.metalness, 0.3);
              material.envMapIntensity = 0;
            }
          }
        });
        importedWeaponRig = new THREE.Group();
        importedWeaponRig.rotation.y = Math.PI / 2;
        importedWeaponRig.scale.setScalar(0.1);
        importedWeaponRig.add(gltf.scene);
        importedWeaponMixer = new THREE.AnimationMixer(gltf.scene);
        const idleClip = gltf.animations.find((clip) =>
          clip.name.toLowerCase().includes("idle"),
        );
        const reloadClip = gltf.animations.find((clip) =>
          clip.name.toLowerCase().includes("reload"),
        );
        const shootClip = gltf.animations.find((clip) =>
          clip.name.toLowerCase().includes("shoot"),
        );
        if (idleClip) {
          const stableIdleClip = idleClip.clone();
          stableIdleClip.tracks = stableIdleClip.tracks.filter(
            (track) => !track.name.startsWith("Root."),
          );
          stableIdleClip.resetDuration();
          importedIdleAction = importedWeaponMixer.clipAction(stableIdleClip);
          importedIdleAction.setLoop(THREE.LoopRepeat, Infinity);
          importedIdleAction.play();
        }
        if (reloadClip) {
          importedReloadAction = importedWeaponMixer.clipAction(reloadClip);
          importedReloadAction.setLoop(THREE.LoopOnce, 1);
          importedReloadAction.clampWhenFinished = true;
        }
        if (shootClip) {
          const stableShootClip = shootClip.clone();
          stableShootClip.tracks = stableShootClip.tracks.filter(
            (track) => !track.name.startsWith("Root."),
          );
          stableShootClip.resetDuration();
          importedShootAction =
            importedWeaponMixer.clipAction(stableShootClip);
          importedShootAction.setLoop(THREE.LoopOnce, 1);
          importedShootAction.clampWhenFinished = false;
        }
        importedWeaponReady = Boolean(
          importedIdleAction && importedReloadAction && importedShootAction,
        );
        if (currentWeapon === 0) buildWeapon(0);
      },
      undefined,
      () => showFeed("AKM MODEL FALLBACK ACTIVE"),
    );

    loadingManager.onLoad = () => {
      if (loadingFailed || engineDisposed) return;
      trackedAssetsLoaded = true;
      updateLoadingProgress(92, "WARMING SHADERS", "Preparing the first encounter...");
      if (shaderPreparationStarted) return;
      shaderPreparationStarted = true;
      const warmupZombie = zombieTemplate
        ? cloneSkeleton(zombieTemplate)
        : null;
      if (warmupZombie) {
        warmupZombie.position.set(0, -40, -8);
        warmupZombie.scale.setScalar(0.42);
        warmupZombie.traverse((object) => {
          if (object instanceof THREE.Mesh) object.frustumCulled = false;
        });
        scene.add(warmupZombie);
      }
      void renderer
        .compileAsync(scene, camera)
        .catch(() => undefined)
        .finally(() => {
          if (warmupZombie) scene.remove(warmupZombie);
          shadersPrepared = true;
          updateLoadingProgress(98, "OPENING THE STREET");
          finishLoading();
        });
    };

    const raycaster = new THREE.Raycaster();
    const aim = new THREE.Vector2(0, 0);
    const clock = new THREE.Clock();
    const keys = new Set<string>();
    const tracers: { line: THREE.Line; life: number }[] = [];
    const particles: {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      life: number;
    }[] = [];
    const shockwaves: {
      mesh: THREE.Mesh;
      life: number;
      maxLife: number;
    }[] = [];
    const bloodParticleGeometry = new THREE.OctahedronGeometry(0.038, 0);
    const sparkParticleGeometry = new THREE.OctahedronGeometry(0.032, 0);
    const shellGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.085, 7);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xd9aa49,
      roughness: 0.78,
      metalness: 0.18,
      envMapIntensity: 0,
    });
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc167 });
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x7d0b0b });
    const audio = new AudioContext();
    const masterAudioGain = audio.createGain();
    masterAudioGain.gain.value = youtubePlayables.isAudioEnabled ? 1 : 0;
    masterAudioGain.connect(audio.destination);
    const musicInput = audio.createGain();
    const musicFilter = audio.createBiquadFilter();
    const musicCompressor = audio.createDynamicsCompressor();
    const musicReverb = audio.createConvolver();
    const musicReverbGain = audio.createGain();
    const musicBusGain = audio.createGain();
    const weaponEffectsBus = audio.createGain();
    const weaponEffectsCompressor = audio.createDynamicsCompressor();
    const creatureVocalBus = audio.createGain();
    const creatureVocalCompressor = audio.createDynamicsCompressor();
    const creatureVocalReverb = audio.createConvolver();
    const creatureVocalReverbGain = audio.createGain();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 1450;
    musicFilter.Q.value = 0.42;
    musicCompressor.threshold.value = -24;
    musicCompressor.knee.value = 18;
    musicCompressor.ratio.value = 3.2;
    musicCompressor.attack.value = 0.025;
    musicCompressor.release.value = 0.48;
    musicReverbGain.gain.value = 0.28;
    musicBusGain.gain.value = 0;
    musicInput.connect(musicFilter).connect(musicCompressor).connect(musicBusGain);
    musicInput.connect(musicReverb).connect(musicReverbGain).connect(musicBusGain);
    musicBusGain.connect(masterAudioGain);
    weaponEffectsBus.gain.value = 1.16;
    weaponEffectsCompressor.threshold.value = -13;
    weaponEffectsCompressor.knee.value = 9;
    weaponEffectsCompressor.ratio.value = 5.5;
    weaponEffectsCompressor.attack.value = 0.002;
    weaponEffectsCompressor.release.value = 0.11;
    weaponEffectsBus.connect(weaponEffectsCompressor).connect(masterAudioGain);
    creatureVocalBus.gain.value = 0.82;
    creatureVocalCompressor.threshold.value = -20;
    creatureVocalCompressor.knee.value = 16;
    creatureVocalCompressor.ratio.value = 5;
    creatureVocalCompressor.attack.value = 0.012;
    creatureVocalCompressor.release.value = 0.24;
    creatureVocalReverbGain.gain.value = 0.19;
    creatureVocalBus.connect(creatureVocalCompressor).connect(masterAudioGain);
    creatureVocalBus
      .connect(creatureVocalReverb)
      .connect(creatureVocalReverbGain)
      .connect(masterAudioGain);

    const reverbImpulse = audio.createBuffer(
      2,
      Math.floor(audio.sampleRate * 2.8),
      audio.sampleRate,
    );
    for (let channel = 0; channel < reverbImpulse.numberOfChannels; channel++) {
      const impulse = reverbImpulse.getChannelData(channel);
      for (let i = 0; i < impulse.length; i++) {
        const decay = Math.pow(1 - i / impulse.length, 3.6);
        impulse[i] = (Math.random() * 2 - 1) * decay * (0.7 + Math.random() * 0.3);
      }
    }
    musicReverb.buffer = reverbImpulse;
    creatureVocalReverb.buffer = reverbImpulse;
    let noiseBuffer: AudioBuffer | null = null;
    let reloadNoiseBuffer: AudioBuffer | null = null;
    let musicNoiseBuffer: AudioBuffer | null = null;
    let audioInitialized = false;
    let effectiveAudioEnabled = youtubePlayables.isAudioEnabled;
    let musicStarted = false;
    let nextMusicEventAt = 0;
    let nextScoreBeatAt = 0;
    let musicStep = 0;
    let musicLifted = false;
    let musicDuckUntil = 0;
    let musicDuckDepth = 1;

    function duckMusic(durationMs: number, depth: number) {
      musicDuckUntil = Math.max(musicDuckUntil, gameNow() + durationMs);
      musicDuckDepth = Math.min(musicDuckDepth, depth);
    }

    function setYouTubeAudioEnabled(enabled: boolean) {
      effectiveAudioEnabled = enabled;
      const targetGain = enabled ? 1 : 0;
      masterAudioGain.gain.cancelScheduledValues(audio.currentTime);
      masterAudioGain.gain.setValueAtTime(targetGain, audio.currentTime);
      if (!enabled) {
        if (audio.state === "running") void audio.suspend();
      } else if (audioInitialized) {
        if (audio.state === "suspended") void audio.resume();
        if (!musicStarted) startHorrorMusic();
      }
    }

    function initAudio() {
      audioInitialized = true;
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      if (audio.state === "suspended") void audio.resume();
      if (!noiseBuffer) {
        noiseBuffer = audio.createBuffer(1, audio.sampleRate * 0.12, audio.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
      }
      if (!reloadNoiseBuffer) {
        reloadNoiseBuffer = audio.createBuffer(
          1,
          Math.floor(audio.sampleRate * 0.42),
          audio.sampleRate,
        );
        const data = reloadNoiseBuffer.getChannelData(0);
        let mechanicalNoise = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          mechanicalNoise = mechanicalNoise * 0.28 + white * 0.72;
          data[i] = mechanicalNoise * (0.76 + Math.random() * 0.24);
        }
      }
      if (!musicStarted) startHorrorMusic();
    }

    function startHorrorMusic() {
      if (musicStarted) return;
      musicStarted = true;
      const now = audio.currentTime;
      musicNoiseBuffer = audio.createBuffer(
        1,
        Math.floor(audio.sampleRate * 7),
        audio.sampleRate,
      );
      const ambienceData = musicNoiseBuffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < ambienceData.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = brown * 0.985 + white * 0.09;
        ambienceData[i] = THREE.MathUtils.clamp(brown * 0.55, -1, 1);
      }

      const ambience = audio.createBufferSource();
      const ambienceHighpass = audio.createBiquadFilter();
      const ambienceLowpass = audio.createBiquadFilter();
      const ambienceGain = audio.createGain();
      ambience.buffer = musicNoiseBuffer;
      ambience.loop = true;
      ambienceHighpass.type = "highpass";
      ambienceHighpass.frequency.value = 78;
      ambienceLowpass.type = "lowpass";
      ambienceLowpass.frequency.value = 760;
      ambienceGain.gain.value = 0.014;
      ambience
        .connect(ambienceHighpass)
        .connect(ambienceLowpass)
        .connect(ambienceGain)
        .connect(musicInput);
      ambience.start(now);

      musicBusGain.gain.setValueAtTime(0.001, now);
      nextScoreBeatAt = now + 0.12;
      musicStep = 0;
      nextMusicEventAt = gameNow() + 5200;
    }

    const scoreBeatLength = 60 / 78;
    const scoreBassPattern = [38, 38, 39, 38, 34, 33, 37, 38, 39, 34, 38, 37, 33, 34, 37, 38] as const;
    const scoreMelody = [
      74, 69, 75, 74, 70, 69, 75, 73,
      74, 69, 77, 75, 74, 70, 73, 69,
    ] as const;
    const scoreChords = [
      [50, 57, 62, 63, 65],
      [46, 53, 57, 62, 63],
      [40, 46, 50, 54, 57],
      [45, 52, 58, 61, 64],
    ] as const;

    function midiFrequency(note: number) {
      return 440 * Math.pow(2, (note - 69) / 12);
    }

    function playLowString(
      note: number,
      start: number,
      duration: number,
      volume: number,
      pan = 0,
    ) {
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      const panner = audio.createStereoPanner();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(420, start);
      filter.frequency.exponentialRampToValueAtTime(155, start + duration);
      filter.Q.value = 1.1;
      panner.pan.value = pan;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.12);
      gain.gain.setTargetAtTime(volume * 0.62, start + 0.3, 0.65);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      filter.connect(gain).connect(panner).connect(musicInput);
      for (const [type, detune, level] of [
        ["triangle", -5, 1],
        ["sine", 7, 0.45],
      ] as const) {
        const oscillator = audio.createOscillator();
        const layerGain = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.value = midiFrequency(note);
        oscillator.detune.value = detune;
        layerGain.gain.value = level;
        oscillator.connect(layerGain).connect(filter);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.08);
      }
    }

    function playStringChord(
      notes: readonly number[],
      start: number,
      duration: number,
      volume: number,
    ) {
      notes.forEach((note, index) => {
        playLowString(
          note,
          start + index * 0.018,
          duration + (index % 2) * 0.35,
          volume / Math.sqrt(notes.length),
          THREE.MathUtils.clamp((index - 2) * 0.28, -0.72, 0.72),
        );
      });
    }

    function playPreparedPiano(
      note: number,
      start: number,
      volume: number,
      pan = 0,
    ) {
      const panner = audio.createStereoPanner();
      const gain = audio.createGain();
      const bodyFilter = audio.createBiquadFilter();
      panner.pan.value = pan;
      bodyFilter.type = "bandpass";
      bodyFilter.frequency.value = Math.min(2600, midiFrequency(note) * 2.1);
      bodyFilter.Q.value = 0.7;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.009);
      gain.gain.exponentialRampToValueAtTime(volume * 0.24, start + 0.42);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 2.4);
      bodyFilter.connect(gain).connect(panner).connect(musicInput);
      for (const [ratio, level, type] of [
        [1, 1, "triangle"],
        [2.01, 0.34, "sine"],
        [3.97, 0.11, "sine"],
      ] as const) {
        const oscillator = audio.createOscillator();
        const partialGain = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.value = midiFrequency(note) * ratio;
        partialGain.gain.value = level;
        oscillator.connect(partialGain).connect(bodyFilter);
        oscillator.start(start);
        oscillator.stop(start + 2.45);
      }
    }

    function playDistantBell(intensity = 1) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      const start = audio.currentTime;
      const baseFrequency = [146.83, 164.81, 196][musicStep % 3];
      const panner = audio.createStereoPanner();
      panner.pan.value = musicStep % 2 === 0 ? -0.65 : 0.65;
      const bellGain = audio.createGain();
      bellGain.gain.setValueAtTime(0.001, start);
      bellGain.gain.exponentialRampToValueAtTime(0.034 * intensity, start + 0.012);
      bellGain.gain.exponentialRampToValueAtTime(0.001, start + 4.8);
      bellGain.connect(panner).connect(musicInput);
      for (const [ratio, level] of [[1, 1], [1.414, 0.42], [2.17, 0.26], [3.76, 0.09]] as const) {
        const oscillator = audio.createOscillator();
        const partialGain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = baseFrequency * ratio;
        partialGain.gain.value = level;
        oscillator.connect(partialGain).connect(bellGain);
        oscillator.start(start);
        oscillator.stop(start + 4.9);
      }
    }

    function playTensionSwell(intensity = 1) {
      if (!musicNoiseBuffer || !effectiveAudioEnabled || youtubePlayables.isPaused) return;
      const start = audio.currentTime;
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      source.buffer = musicNoiseBuffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(280, start);
      filter.frequency.exponentialRampToValueAtTime(1850, start + 2.6);
      filter.Q.value = 1.8;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.038 * intensity, start + 2.35);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 2.8);
      source.connect(filter).connect(gain).connect(musicInput);
      source.start(start, Math.random() * 3.4, 2.85);
    }

    function dreadPulse(intensity = 1) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      const now = audio.currentTime;
      for (const offset of [0, 0.32]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(58, now + offset);
        oscillator.frequency.exponentialRampToValueAtTime(34, now + offset + 0.24);
        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.11 * intensity, now + offset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.31);
        oscillator.connect(gain).connect(musicInput);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.34);
      }
    }

    function playScorePulse(start: number, intensity: number, accent: boolean) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const panner = audio.createStereoPanner();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(accent ? 54 : 47, start);
      oscillator.frequency.exponentialRampToValueAtTime(32, start + 0.2);
      panner.pan.value = accent ? -0.12 : 0.12;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(
        (accent ? 0.036 : 0.022) * intensity,
        start + 0.012,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain).connect(panner).connect(musicInput);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    }

    function horrorStinger(intensity = 1) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      const now = audio.currentTime;
      playStringChord([38, 39, 45, 46, 51], now, 1.7, 0.082 * intensity);
      playLowString(26, now, 1.35, 0.095 * intensity);
      if (musicNoiseBuffer) {
        const impact = audio.createBufferSource();
        const impactFilter = audio.createBiquadFilter();
        const impactGain = audio.createGain();
        impact.buffer = musicNoiseBuffer;
        impactFilter.type = "lowpass";
        impactFilter.frequency.setValueAtTime(1200, now);
        impactFilter.frequency.exponentialRampToValueAtTime(90, now + 0.72);
        impactGain.gain.setValueAtTime(0.075 * intensity, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
        impact.connect(impactFilter).connect(impactGain).connect(musicInput);
        impact.start(now, Math.random() * 3.5, 0.82);
      }
    }

    function scheduleScoreBeat(proximity: number, quietValley: number, lift: boolean) {
      const start = nextScoreBeatAt;
      const step = musicStep % 32;
      const chordIndex = Math.floor(step / 4) % scoreChords.length;
      const beat = step % 4;
      const pressure = 0.72 + proximity * 0.38 + Math.min(levelLive - 1, 5) * 0.045;

      playScorePulse(start, pressure, beat === 0);
      if (beat === 0) {
        playStringChord(
          scoreChords[chordIndex],
          start,
          scoreBeatLength * 3.9,
          0.046 * pressure * (0.72 + quietValley * 0.28),
        );
      }
      if (beat % 2 === 0) {
        playLowString(
          scoreBassPattern[(step / 2) % scoreBassPattern.length],
          start,
          scoreBeatLength * 1.85,
          0.062 * pressure,
          beat === 0 ? -0.18 : 0.18,
        );
      }

      const melodyNote = scoreMelody[step % scoreMelody.length];
      if (melodyNote !== null) {
        playPreparedPiano(
          melodyNote + (chordIndex === 2 ? -12 : 0),
          start + scoreBeatLength * 0.13,
          0.021 * pressure * (0.78 + quietValley * 0.22),
          beat % 2 === 0 ? -0.42 : 0.42,
        );
      }
      if (step % 8 === 6 && lift) dreadPulse(0.58 + proximity * 0.32);
      if (step === 12 || step === 28) playTensionSwell(0.64 + proximity * 0.42);

      musicStep++;
      nextScoreBeatAt += scoreBeatLength;
    }

    function updateHorrorMusic(elapsed: number) {
      if (!musicStarted || !effectiveAudioEnabled || youtubePlayables.isPaused) return;
      const livingTargets = Array.from(targets.values()).filter((target) => !target.dead);
      let nearestDistance = 46;
      for (const target of livingTargets) {
        nearestDistance = Math.min(
          nearestDistance,
          Math.hypot(
            target.group.position.x - camera.position.x,
            target.group.position.z - camera.position.z,
          ),
        );
      }
      const proximity = THREE.MathUtils.clamp(1 - (nearestDistance - 2.4) / 32, 0, 1);
      const cycle = (elapsed / 1000) % 34;
      const quietValley =
        cycle > 9 && cycle < 15 ? 0.68 : cycle > 25 && cycle < 29 ? 0.58 : 1;
      const lift = (cycle >= 15 && cycle < 21) || cycle >= 29;
      const levelPressure = 1 + Math.min(levelLive - 1, 5) * 0.085;
      const targetLevel =
        started && !gameOver
          ? (running ? 0.5 + proximity * 0.17 : 0.14) * quietValley * levelPressure
          : 0.045;
      const duckActive = elapsed < musicDuckUntil;
      if (!duckActive) musicDuckDepth = 1;
      musicBusGain.gain.setTargetAtTime(
        THREE.MathUtils.clamp(
          targetLevel * (duckActive ? musicDuckDepth : 1),
          0.018,
          0.68,
        ),
        audio.currentTime,
        lift ? 0.08 : 0.75,
      );
      musicFilter.frequency.setTargetAtTime(
        880 + proximity * 920 + levelLive * 75,
        audio.currentTime,
        0.9,
      );
      if (lift && !musicLifted && running) horrorStinger(0.72 + proximity * 0.42);
      musicLifted = lift;

      if (running) {
        let scheduled = 0;
        while (nextScoreBeatAt <= audio.currentTime + 0.12 && scheduled < 4) {
          scheduleScoreBeat(proximity, quietValley, lift);
          scheduled++;
        }
      } else {
        nextScoreBeatAt = audio.currentTime + 0.1;
      }

      if (running && elapsed >= nextMusicEventAt) {
        const roll = Math.random();
        if (roll < 0.42) dreadPulse(0.72 + proximity * 0.46);
        else if (roll < 0.82) playDistantBell(0.72 + levelLive * 0.045);
        else if (roll < 0.94) playTensionSwell(0.66 + proximity * 0.4);
        else horrorStinger(0.66 + proximity * 0.42);
        nextMusicEventAt =
          elapsed + Math.max(7200, 12500 + Math.random() * 7200 - levelLive * 560);
      }
    }

    function shotAudio(index: number) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      initAudio();
      if (!noiseBuffer) return;
      const t = audio.currentTime;
      duckMusic(115, 0.7);

      const crack = audio.createBufferSource();
      const crackFilter = audio.createBiquadFilter();
      const crackGain = audio.createGain();
      crack.buffer = noiseBuffer;
      crack.playbackRate.value = index === 1 ? 1.28 : index === 2 ? 0.82 : 1;
      crackFilter.type = "highpass";
      crackFilter.frequency.value = index === 1 ? 1450 : index === 2 ? 760 : 1080;
      crackGain.gain.setValueAtTime(index === 2 ? 0.62 : 0.54, t);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.052);
      crack.connect(crackFilter).connect(crackGain).connect(weaponEffectsBus);
      crack.start(t, 0, 0.06);

      const body = audio.createBufferSource();
      const bodyFilter = audio.createBiquadFilter();
      const bodyGain = audio.createGain();
      body.buffer = noiseBuffer;
      body.playbackRate.value = index === 2 ? 0.58 : 0.78;
      bodyFilter.type = "bandpass";
      bodyFilter.frequency.value = index === 1 ? 780 : index === 2 ? 420 : 560;
      bodyFilter.Q.value = 0.58;
      bodyGain.gain.setValueAtTime(index === 2 ? 0.48 : 0.37, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      body.connect(bodyFilter).connect(bodyGain).connect(weaponEffectsBus);
      body.start(t, 0.008, 0.115);

      const thump = audio.createOscillator();
      const thumpGain = audio.createGain();
      thump.type = "triangle";
      thump.frequency.setValueAtTime(index === 2 ? 104 : 132, t);
      thump.frequency.exponentialRampToValueAtTime(42, t + 0.095);
      thumpGain.gain.setValueAtTime(index === 2 ? 0.42 : 0.34, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      thump.connect(thumpGain).connect(weaponEffectsBus);
      thump.start(t);
      thump.stop(t + 0.12);

      const tail = audio.createBufferSource();
      const tailFilter = audio.createBiquadFilter();
      const tailGain = audio.createGain();
      tail.buffer = noiseBuffer;
      tail.playbackRate.value = 0.52;
      tailFilter.type = "bandpass";
      tailFilter.frequency.value = 1180;
      tailFilter.Q.value = 2.1;
      tailGain.gain.setValueAtTime(0.001, t);
      tailGain.gain.linearRampToValueAtTime(0.12, t + 0.038);
      tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      tail.connect(tailFilter).connect(tailGain).connect(weaponEffectsBus);
      tail.start(t + 0.03, 0.012, 0.12);
    }

    function tone(frequency: number, duration: number, volume = 0.1) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      initAudio();
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(masterAudioGain);
      osc.start(t);
      osc.stop(t + duration);
    }

    type ReloadSoundStage =
      | "release"
      | "magOut"
      | "magGrab"
      | "magIn"
      | "seat"
      | "boltPull"
      | "boltRelease";

    function reloadMechanicalSound(stage: ReloadSoundStage) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      initAudio();
      if (!reloadNoiseBuffer) return;
      const now = audio.currentTime;
      const stageProfile = {
        release: [2850, 0.045, 0.3, 1.5],
        magOut: [690, 0.22, 0.32, 0.72],
        magGrab: [1260, 0.12, 0.2, 1.04],
        magIn: [880, 0.2, 0.34, 0.82],
        seat: [310, 0.095, 0.48, 1.02],
        boltPull: [1480, 0.23, 0.35, 0.68],
        boltRelease: [2450, 0.075, 0.52, 1.34],
      }[stage] as [number, number, number, number];
      const [frequency, duration, volume, playbackRate] = stageProfile;
      const noise = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      const panner = audio.createStereoPanner();
      noise.buffer = reloadNoiseBuffer;
      noise.playbackRate.value = playbackRate;
      filter.type = stage === "seat" ? "lowpass" : "bandpass";
      filter.frequency.setValueAtTime(frequency, now);
      filter.Q.value = stage === "boltPull" || stage === "magOut" ? 1.05 : 1.7;
      if (stage === "boltPull") {
        filter.frequency.exponentialRampToValueAtTime(620, now + duration);
      } else if (stage === "magIn") {
        filter.frequency.exponentialRampToValueAtTime(1550, now + duration);
      }
      panner.pan.value =
        stage === "magOut" || stage === "magGrab"
          ? -0.24
          : stage === "boltPull" || stage === "boltRelease"
            ? 0.22
            : 0;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
      if (duration > 0.1) {
        gain.gain.setValueAtTime(volume * 0.72, now + duration * 0.52);
      }
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      noise.connect(filter).connect(gain).connect(panner).connect(weaponEffectsBus);
      noise.start(now, Math.random() * 0.035, duration);

      const resonance = audio.createOscillator();
      const resonanceGain = audio.createGain();
      const resonanceFrequency =
        stage === "seat"
          ? 155
          : stage === "boltRelease"
            ? 760
            : stage === "release"
              ? 510
              : stage === "magOut" || stage === "magIn"
                ? 215
                : 330;
      resonance.type = "triangle";
      resonance.frequency.setValueAtTime(resonanceFrequency, now);
      resonance.frequency.exponentialRampToValueAtTime(
        Math.max(72, resonanceFrequency * 0.38),
        now + Math.min(duration, 0.095),
      );
      resonanceGain.gain.setValueAtTime(volume * 0.58, now);
      resonanceGain.gain.exponentialRampToValueAtTime(
        0.001,
        now + Math.min(duration + 0.025, 0.16),
      );
      resonance
        .connect(resonanceGain)
        .connect(panner);
      resonance.start(now);
      resonance.stop(now + Math.min(duration + 0.03, 0.17));

      if (stage === "release" || stage === "seat" || stage === "boltRelease") {
        const snap = audio.createBufferSource();
        const snapFilter = audio.createBiquadFilter();
        const snapGain = audio.createGain();
        snap.buffer = reloadNoiseBuffer;
        snap.playbackRate.value = stage === "seat" ? 0.82 : 1.9;
        snapFilter.type = stage === "seat" ? "bandpass" : "highpass";
        snapFilter.frequency.value = stage === "seat" ? 420 : 1900;
        snapFilter.Q.value = 0.8;
        snapGain.gain.setValueAtTime(stage === "boltRelease" ? 0.52 : 0.38, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        snap.connect(snapFilter).connect(snapGain).connect(weaponEffectsBus);
        snap.start(now, 0.008, 0.045);
      }
    }

    function hitConfirmAudio(headshot: boolean, killed: boolean) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      initAudio();
      if (!noiseBuffer) return;
      const now = audio.currentTime;
      const impact = audio.createBufferSource();
      const impactFilter = audio.createBiquadFilter();
      const impactGain = audio.createGain();
      impact.buffer = noiseBuffer;
      impact.playbackRate.value = killed ? 0.72 : headshot ? 1.4 : 1.05;
      impactFilter.type = "bandpass";
      impactFilter.frequency.value = headshot ? 2380 : killed ? 620 : 1180;
      impactFilter.Q.value = headshot ? 2.2 : 0.9;
      impactGain.gain.setValueAtTime(killed ? 0.3 : 0.2, now);
      impactGain.gain.exponentialRampToValueAtTime(0.001, now + (killed ? 0.12 : 0.065));
      impact.connect(impactFilter).connect(impactGain).connect(weaponEffectsBus);
      impact.start(now, 0, killed ? 0.12 : 0.07);

      const tick = audio.createOscillator();
      const tickGain = audio.createGain();
      tick.type = "triangle";
      tick.frequency.setValueAtTime(headshot ? 1780 : killed ? 380 : 920, now);
      tick.frequency.exponentialRampToValueAtTime(
        headshot ? 880 : killed ? 94 : 540,
        now + (killed ? 0.09 : 0.045),
      );
      tickGain.gain.setValueAtTime(headshot ? 0.12 : killed ? 0.19 : 0.08, now);
      tickGain.gain.exponentialRampToValueAtTime(0.001, now + (killed ? 0.11 : 0.055));
      tick.connect(tickGain).connect(weaponEffectsBus);
      tick.start(now);
      tick.stop(now + (killed ? 0.12 : 0.06));
    }

    let lastZombieVocalAt = -10;

    function zombieVocal(
      kind: "scream" | "attack" | "death",
      pan = 0,
      intensity = 1,
      entrance: "street" | "alley" = "street",
    ) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      initAudio();
      const t = audio.currentTime;
      if (kind === "scream" && t - lastZombieVocalAt < 0.14) return;
      lastZombieVocalAt = t;

      const alleyScream = kind === "scream" && entrance === "alley";
      const duration =
        kind === "scream"
          ? alleyScream
            ? 0.94
            : 1.32
          : kind === "death"
            ? 0.82
            : 0.42;
      const sampleCount = Math.ceil(audio.sampleRate * duration);
      const vocalBuffer = audio.createBuffer(1, sampleCount, audio.sampleRate);
      const samples = vocalBuffer.getChannelData(0);
      const startPitch =
        kind === "scream"
          ? alleyScream
            ? 122 + Math.random() * 24
            : 72 + Math.random() * 17
          : kind === "death"
            ? 83 + Math.random() * 12
            : 96 + Math.random() * 18;
      const endPitch = kind === "attack" ? 54 : kind === "death" ? 36 : 43;
      let phase = Math.random();
      let throatNoise = 0;
      for (let index = 0; index < sampleCount; index++) {
        const progress = index / Math.max(1, sampleCount - 1);
        const attack = Math.min(1, progress / (alleyScream ? 0.035 : 0.075));
        const release = Math.min(1, (1 - progress) / (kind === "attack" ? 0.34 : 0.24));
        const envelope = Math.pow(Math.min(attack, release), 0.72);
        const pitchArc = alleyScream
          ? progress < 0.18
            ? THREE.MathUtils.lerp(startPitch * 0.74, startPitch * 1.3, progress / 0.18)
            : THREE.MathUtils.lerp(startPitch * 1.3, endPitch, (progress - 0.18) / 0.82)
          : THREE.MathUtils.lerp(startPitch, endPitch, Math.pow(progress, 0.72));
        const pitchWobble =
          1 +
          Math.sin(progress * Math.PI * (kind === "scream" ? 17 : 10)) * 0.035 +
          Math.sin(progress * Math.PI * 43) * 0.012;
        phase += (pitchArc * pitchWobble) / audio.sampleRate;
        phase -= Math.floor(phase);
        const airflow = Math.random() * 2 - 1;
        throatNoise = throatNoise * 0.87 + airflow * 0.13;
        const glottal =
          Math.sin(phase * Math.PI * 2) * 0.58 +
          Math.sin(phase * Math.PI * 4 + 0.4) * 0.17;
        const rasp = throatNoise * (0.34 + Math.sin(progress * Math.PI) * 0.18);
        const breath = airflow * (alleyScream ? 0.24 : 0.14);
        samples[index] = (glottal + rasp + breath) * envelope * 0.72;
      }

      const source = audio.createBufferSource();
      const panner = audio.createStereoPanner();
      const throatFilter = audio.createBiquadFilter();
      const throatGain = audio.createGain();
      const mouthFilter = audio.createBiquadFilter();
      const mouthGain = audio.createGain();
      const raspFilter = audio.createBiquadFilter();
      const raspGain = audio.createGain();
      const outputGain = audio.createGain();
      source.buffer = vocalBuffer;
      panner.pan.value = THREE.MathUtils.clamp(pan, -0.88, 0.88);
      throatFilter.type = "lowpass";
      throatFilter.frequency.value = alleyScream ? 690 : kind === "attack" ? 560 : 470;
      throatFilter.Q.value = 0.7;
      throatGain.gain.value = 0.82;
      mouthFilter.type = "bandpass";
      mouthFilter.frequency.value = alleyScream ? 1040 : kind === "death" ? 620 : 790;
      mouthFilter.Q.value = alleyScream ? 2.7 : 3.5;
      mouthGain.gain.value = alleyScream ? 0.34 : 0.27;
      raspFilter.type = "bandpass";
      raspFilter.frequency.value = alleyScream ? 2180 : 1480;
      raspFilter.Q.value = 0.82;
      raspGain.gain.value = alleyScream ? 0.16 : 0.1;
      const baseVolume = kind === "scream" ? 0.2 : kind === "attack" ? 0.17 : 0.15;
      outputGain.gain.setValueAtTime(
        baseVolume * THREE.MathUtils.clamp(intensity, 0.35, 1.15),
        t,
      );
      outputGain.gain.setTargetAtTime(baseVolume * 0.72 * intensity, t + duration * 0.32, 0.22);
      outputGain.gain.exponentialRampToValueAtTime(0.001, t + duration + 0.08);
      source.connect(throatFilter).connect(throatGain).connect(outputGain);
      source.connect(mouthFilter).connect(mouthGain).connect(outputGain);
      source.connect(raspFilter).connect(raspGain).connect(outputGain);
      outputGain.connect(panner).connect(creatureVocalBus);
      source.start(t);
      source.stop(t + duration + 0.1);
    }

    let running = false;
    let squadDeployed = false;
    let levelLive = 1;
    let levelKills = 0;
    let scoreLive = 0;
    let streakLive = 0;
    let comboLive = 1;
    let lastKillAt = 0;
    let shotsLive = 0;
    let hitsLive = 0;
    let timeLive: number = DIFFICULTIES.operator.startTime;
    let playerHealthLive = 100;
    let timeAccumulator = 0;
    let ammoLive = WEAPONS[0].ammo;
    let reserveLive = WEAPONS[0].reserve;
    let currentWeapon = 0;
    let unlocked = 1;
    let lastShot = 0;
    let firing = false;
    let reloadingLive = false;
    let reloadStarted = 0;
    let reloadToken = 0;
    let walkPhase = 0;
    let recoil = 0;
    let weaponKick = 0;
    let shotRoll = 0;
    let yaw = 0;
    let pitch = -0.015;
    let pointerLockUnavailable = false;
    let drillTransitionToken = 0;
    let perkSelectionPending = false;
    let ghostActive = false;
    const perkCounts: Record<PerkKey, number> = {
      ammo: 0,
      ghost: 0,
      heal: 0,
    };
    let pendingCloudSession: CloudSession | null = null;

    function tryPointerLock() {
      if (
        pointerLockUnavailable ||
        coarsePointerQuery.matches ||
        document.pointerLockElement === renderer.domElement
      ) {
        return;
      }
      try {
        const lockRequest = renderer.domElement.requestPointerLock();
        void lockRequest
          ?.then(() => {
            pointerLockUnavailable = false;
          })
          .catch(() => {
            pointerLockUnavailable = true;
          });
      } catch {
        pointerLockUnavailable = true;
      }
    }

    function renderPerkStatus() {
      const container = element<HTMLElement>("perk-status");
      container.replaceChildren();
      (Object.keys(PERKS) as PerkKey[]).forEach((key) => {
        const count = perkCounts[key];
        if (count <= 0) return;
        const chip = document.createElement("span");
        chip.dataset.perk = key;
        chip.classList.toggle("active", key === "ghost" && ghostActive);
        chip.textContent =
          key === "ghost" && ghostActive
            ? "WARD ACTIVE"
            : `${PERKS[key].status}${count > 1 ? ` x${count}` : ""}`;
        container.appendChild(chip);
      });
      container.hidden = container.childElementCount === 0;
    }

    function announceDrillStart() {
      const token = ++drillTransitionToken;
      const drill = levelConfig(levelLive);
      running = false;
      firing = false;
      setInterfaceLocked(true);
      element("announcement-level").textContent = String(levelLive).padStart(2, "0");
      element("announcement-title").textContent = drill.title;
      element("announcement-enemies").textContent = String(drill.goal);
      element("announcement-detail").textContent =
        DRILL_DETAILS[Math.min(levelLive - 1, DRILL_DETAILS.length - 1)];
      const announcement = element<HTMLElement>("drill-announcement");
      announcement.hidden = false;
      replayClass(announcement, "drill-announcement");
      tone(420, 0.08, 0.055);
      gameTimeout(() => tone(680, 0.1, 0.05), 115);
      gameTimeout(() => {
        if (token !== drillTransitionToken || gameOver || !started) return;
        announcement.hidden = true;
        setInterfaceLocked(false);
        running = true;
        showFeed(`${drill.title} // HORDE APPROACHING`);
        deployLevelSquad();
        const deploymentLevel = levelLive;
        gameTimeout(() => {
          if (
            running &&
            !squadDeployed &&
            levelLive === deploymentLevel
          ) {
            deployLevelSquad();
          }
        }, 2200);
        tryPointerLock();
      }, 1550);
    }

    function showPerkSelection() {
      perkSelectionPending = true;
      running = false;
      firing = false;
      setInterfaceLocked(true);
      element("drill-announcement").hidden = true;
      element("perk-eyebrow").textContent =
        `NIGHT ${String(levelLive).padStart(2, "0")} SURVIVED`;
      element<HTMLElement>("perk-screen").hidden = false;
      document.exitPointerLock?.();
      showFeed("THE STREET IS QUIET // CHOOSE");
    }

    function choosePerk(perk: PerkKey) {
      if (!perkSelectionPending) return;
      perkSelectionPending = false;
      perkCounts[perk]++;
      if (perk === "ammo") {
        ammoLive = WEAPONS[currentWeapon].ammo;
        reserveLive += 60;
        setAmmo({ mag: ammoLive, reserve: reserveLive });
      } else if (perk === "ghost") {
        ghostActive = true;
      } else {
        playerHealthLive = Math.min(100, playerHealthLive + 40);
        setHealth(playerHealthLive);
      }
      element<HTMLElement>("perk-screen").hidden = true;
      renderPerkStatus();

      const completedDrill = levelConfig(levelLive);
      const previousUnlocked = unlocked;
      levelLive++;
      levelKills = 0;
      timeLive += completedDrill.timeBonus;
      timeAccumulator = 0;
      unlocked = Math.min(WEAPONS.length, 1 + Math.floor(levelLive / 2));
      setLevel(levelLive);
      setTime(Math.ceil(timeLive));
      setObjective(levelObjective(levelLive));
      setDamageFlash((value) => value + 1);
      camera.position.set(0, 1.72, 11.5);
      yaw = 0;
      pitch = -0.015;
      tone(560, 0.11, 0.08);
      gameTimeout(() => tone(860, 0.16, 0.075), 105);
      showFeed(
        `${PERKS[perk].label} // ${
          unlocked > previousUnlocked ? "WEAPON UNLOCKED" : "EQUIPPED"
        }`,
      );
      requestCloudSave(true);
      announceDrillStart();
    }

    function burst(position: THREE.Vector3, hit = false) {
      const count = hit ? renderProfile.hitParticles : mobileRendering ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
          hit ? bloodParticleGeometry : sparkParticleGeometry,
          hit ? bloodMat : sparkMat,
        );
        mesh.scale.setScalar(0.52 + Math.random() * (hit ? 0.5 : 0.55));
        mesh.position.copy(position);
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2.6,
          Math.random() * (hit ? 3.1 : 2.2),
          (Math.random() - 0.5) * 2.6,
        );
        scene.add(mesh);
        particles.push({ mesh, velocity, life: (hit ? 0.42 : 0.28) + Math.random() * 0.24 });
      }
      if (hit) {
        const wave = new THREE.Mesh(
          new THREE.RingGeometry(0.08, 0.115, 16),
          new THREE.MeshBasicMaterial({
            color: 0xb72118,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        wave.position.copy(position);
        wave.lookAt(camera.position);
        scene.add(wave);
        shockwaves.push({ mesh: wave, life: 0.16, maxLife: 0.16 });
      }
    }

    function addTracer(end: THREE.Vector3) {
      const start = new THREE.Vector3();
      muzzle.getWorldPosition(start);
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0xffd38a,
          transparent: true,
          opacity: 0.82,
        }),
      );
      scene.add(line);
      tracers.push({ line, life: 0.06 });
    }

    function damagePlayerFromZombie(target: TargetState) {
      if (!running || target.dead) return;
      const drill = levelConfig(levelLive);
      const activeDifficulty = difficultyRef.current;
      if (ghostActive && Math.random() < 0.28) {
        showFeed("PHASE DODGE");
        return;
      }
      const damage = Math.round(
        drill.enemyDamage *
          enemyDamageScale(activeDifficulty) *
          (target.motion === "brute" ? 1.45 : target.motion === "crawler" ? 0.82 : 1),
      );
      playerHealthLive = Math.max(0, playerHealthLive - damage);
      setHealth(playerHealthLive);
      setPlayerHitFlash((value) => value + 1);
      showFeed(`BITTEN  -${damage}`);
      tone(58, 0.22, 0.11);
      if (hapticsRef.current && navigator.vibrate) navigator.vibrate([42, 22, 55]);
      if (playerHealthLive <= 0) {
        running = false;
        firing = false;
        setGameOver(true);
        document.exitPointerLock?.();
        showFeed("YOU JOINED THE HORDE");
      }
    }

    function ejectShell() {
      const mesh = new THREE.Mesh(
        shellGeometry,
        shellMat,
      );
      const pos = new THREE.Vector3();
      camera.getWorldPosition(pos);
      mesh.position.copy(pos).add(new THREE.Vector3(0.38, -0.12, -0.42).applyQuaternion(camera.quaternion));
      mesh.quaternion.copy(camera.quaternion);
      scene.add(mesh);
      const velocity = new THREE.Vector3(2.2, 1.8, 0.4)
        .applyQuaternion(camera.quaternion)
        .multiplyScalar(0.7 + Math.random() * 0.35);
      particles.push({ mesh, velocity, life: 0.8 });
    }

    function resetGame() {
      targets.forEach((t) => targetRoot.remove(t.group));
      targets.clear();
      levelLive = 1;
      levelKills = 0;
      scoreLive = 0;
      streakLive = 0;
      comboLive = 1;
      lastKillAt = 0;
      shotsLive = 0;
      hitsLive = 0;
      timeLive = DIFFICULTIES[difficultyRef.current].startTime;
      playerHealthLive = 100;
      timeAccumulator = 0;
      currentWeapon = 0;
      unlocked = 1;
      ammoLive = WEAPONS[0].ammo;
      reserveLive = WEAPONS[0].reserve;
      perkSelectionPending = false;
      ghostActive = false;
      drillTransitionToken++;
      perkCounts.ammo = 0;
      perkCounts.ghost = 0;
      perkCounts.heal = 0;
      reloadingLive = false;
      reloadToken++;
      setReloading(false);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setCombo(1);
      setAccuracy(100);
      setHealth(100);
      setLevel(1);
      setTime(timeLive);
      setWeaponIndex(0);
      setAmmo({ mag: ammoLive, reserve: reserveLive });
      setObjective(levelObjective(1));
      setGameOver(false);
      camera.position.set(0, 1.72, 11.5);
      yaw = 0;
      pitch = -0.015;
      buildWeapon(0);
      squadDeployed = false;
      running = false;
      element<HTMLElement>("perk-screen").hidden = true;
      element<HTMLElement>("drill-announcement").hidden = true;
      renderPerkStatus();
      showFeed("THE LIGHT IS FAILING");
      initAudio();
      requestCloudSave();
      announceDrillStart();
    }

    function restoreCloudSession(session: CloudSession) {
      targets.forEach((target) => targetRoot.remove(target.group));
      targets.clear();
      levelLive = session.level;
      levelKills = session.levelKills;
      scoreLive = session.score;
      streakLive = session.streak;
      comboLive = session.combo;
      lastKillAt = 0;
      shotsLive = session.shots;
      hitsLive = Math.min(session.hits, session.shots);
      timeLive = session.time;
      playerHealthLive = session.health;
      timeAccumulator = 0;
      currentWeapon = Math.min(session.weapon, session.unlocked - 1);
      unlocked = session.unlocked;
      ammoLive = session.ammo;
      reserveLive = session.reserve;
      perkSelectionPending = session.perkSelectionPending;
      ghostActive = session.ghostActive;
      perkCounts.ammo = session.perks.ammo;
      perkCounts.ghost = session.perks.ghost;
      perkCounts.heal = session.perks.heal;
      drillTransitionToken++;
      reloadingLive = false;
      reloadToken++;
      setReloading(false);
      setScore(scoreLive);
      setStreak(streakLive);
      setBestStreak(Math.max(session.bestStreak, streakLive));
      setCombo(comboLive);
      setAccuracy(
        shotsLive > 0 ? Math.round((hitsLive / shotsLive) * 100) : 100,
      );
      setHealth(playerHealthLive);
      setLevel(levelLive);
      setTime(Math.ceil(timeLive));
      setWeaponIndex(currentWeapon);
      setAmmo({ mag: ammoLive, reserve: reserveLive });
      setObjective(levelObjective(levelLive));
      setGameOver(false);
      camera.position.set(0, 1.72, 11.5);
      yaw = session.yaw;
      pitch = session.pitch;
      buildWeapon(currentWeapon);
      squadDeployed = false;
      running = false;
      element<HTMLElement>("perk-screen").hidden = true;
      element<HTMLElement>("drill-announcement").hidden = true;
      renderPerkStatus();
      initAudio();
      if (perkSelectionPending) {
        showPerkSelection();
      } else {
        showFeed("CLOUD CHECKPOINT RESTORED");
        announceDrillStart();
      }
    }

    function createCloudSave(): RangeSevenCloudSave {
      cloudProfile.difficulty = difficultyRef.current;
      cloudProfile.bestScore = Math.max(cloudProfile.bestScore, scoreLive);
      cloudProfile.bestStreak = Math.max(
        cloudProfile.bestStreak,
        bestStreak,
        streakLive,
      );
      cloudProfile.highestDrill = Math.max(
        cloudProfile.highestDrill,
        levelLive,
      );
      return {
        version: 1,
        profile: { ...cloudProfile },
        session:
          started && !gameOver
            ? {
                level: levelLive,
                levelKills,
                score: scoreLive,
                streak: streakLive,
                bestStreak: Math.max(bestStreak, streakLive),
                combo: comboLive,
                shots: shotsLive,
                hits: hitsLive,
                time: timeLive,
                health: playerHealthLive,
                ammo: ammoLive,
                reserve: reserveLive,
                weapon: currentWeapon,
                unlocked,
                perks: { ...perkCounts },
                perkSelectionPending,
                ghostActive,
                cameraX: camera.position.x,
                cameraZ: camera.position.z,
                yaw,
                pitch,
              }
            : null,
      };
    }

    function restoreCloudSave(save: RangeSevenCloudSave) {
      cloudProfile = { ...save.profile };
      setDifficulty(save.profile.difficulty);
      pendingCloudSession = save.session;
      const deployButton = element<HTMLButtonElement>("deploy-button");
      const deployLabel = deployButton.querySelector("span");
      if (deployLabel) {
        deployLabel.textContent = pendingCloudSession
          ? `CONTINUE NIGHT ${String(pendingCloudSession.level).padStart(2, "0")}`
          : "BEGIN THE NIGHT";
      }
    }

    function switchWeapon(index: number) {
      if (index >= unlocked || index === currentWeapon || reloadingLive) return;
      currentWeapon = index;
      ammoLive = Math.min(ammoLive, WEAPONS[index].ammo);
      if (ammoLive <= 0) ammoLive = WEAPONS[index].ammo;
      reserveLive = Math.max(reserveLive, WEAPONS[index].reserve);
      setWeaponIndex(index);
      setAmmo({ mag: ammoLive, reserve: reserveLive });
      buildWeapon(index);
      tone(240, 0.08, 0.05);
      showFeed(`${WEAPONS[index].name} READY`);
      requestCloudSave();
    }

    function reload() {
      const weapon = WEAPONS[currentWeapon];
      if (
        reloadingLive ||
        ammoLive >= weapon.ammo ||
        reserveLive <= 0 ||
        !running
      )
        return;
      reloadingLive = true;
      const token = ++reloadToken;
      reloadStarted = gameNow();
      firing = false;
      setReloading(true);
      showFeed("RELOADING");
      duckMusic(weapon.reloadMs + 140, 0.24);
      if (
        currentWeapon === 0 &&
        importedWeaponReady &&
        importedReloadAction
      ) {
        importedShootAction?.stop();
        importedIdleAction?.fadeOut(0.06);
        importedReloadAction.reset().fadeIn(0.06).play();
      }
      const reloadSound = (progress: number, stage: ReloadSoundStage) => {
        gameTimeout(() => {
          if (token === reloadToken && reloadingLive) {
            reloadMechanicalSound(stage);
          }
        }, weapon.reloadMs * progress);
      };
      reloadSound(0.11, "release");
      reloadSound(0.22, "magOut");
      reloadSound(0.42, "magGrab");
      reloadSound(0.52, "magIn");
      reloadSound(0.69, "seat");
      reloadSound(0.81, "boltPull");
      reloadSound(0.9, "boltRelease");
      gameTimeout(() => {
        if (token !== reloadToken || !reloadingLive) return;
        const needed = weapon.ammo - ammoLive;
        const loaded = Math.min(needed, reserveLive);
        ammoLive += loaded;
        reserveLive -= loaded;
        reloadingLive = false;
        setReloading(false);
        setAmmo({ mag: ammoLive, reserve: reserveLive });
        if (currentWeapon === 0 && importedWeaponReady) {
          importedReloadAction?.fadeOut(0.06);
          importedIdleAction?.reset().fadeIn(0.08).play();
        }
        requestCloudSave();
      }, weapon.reloadMs);
    }

    function levelUp() {
      if (levelLive >= LEVELS.length) {
        running = false;
        firing = false;
        setInterfaceLocked(true);
        setObjective("DAWN REACHED");
        cloudProfile.completedRuns++;
        setGameOver(true);
        document.exitPointerLock?.();
        tone(660, 0.18, 0.12);
        gameTimeout(() => tone(880, 0.2, 0.1), 115);
        gameTimeout(() => tone(1180, 0.28, 0.09), 235);
        showFeed("YOU SURVIVED THE NIGHT");
        return;
      }
      targets.forEach((target) => targetRoot.remove(target.group));
      targets.clear();
      squadDeployed = false;
      ghostActive = false;
      renderPerkStatus();
      tone(520, 0.18, 0.11);
      gameTimeout(() => tone(780, 0.24, 0.1), 120);
      showPerkSelection();
      requestCloudSave(true);
    }

    function registerHit(hit: THREE.Intersection<THREE.Object3D>) {
      const { targetId: id, zone } = hit.object.userData as {
        targetId?: number;
        zone?: string;
      };
      if (!id || !zone) {
        burst(hit.point, false);
        streakLive = 0;
        comboLive = 1;
        setStreak(0);
        setCombo(1);
        return;
      }
      const target = targets.get(id);
      if (!target || target.dead) return;
      const weapon = WEAPONS[currentWeapon];
      const multiplier = zone === "head" ? 2.5 : zone === "bullseye" ? 1.55 : 1;
      target.hp -= weapon.damage * multiplier;
      const killed = target.hp <= 0;
      setHitPulse(
        (v) => v + 1,
        killed ? "kill" : zone === "head" ? "head" : "body",
      );
      hitConfirmAudio(zone === "head", killed);
      burst(hit.point, true);
      const material = hit.object instanceof THREE.Mesh ? hit.object.material : null;
      const hitMaterials = Array.isArray(material) ? material : material ? [material] : [];
      for (const hitMaterial of hitMaterials) {
        if (!(hitMaterial instanceof THREE.MeshStandardMaterial)) continue;
        const previous = hitMaterial.emissive.getHex();
        hitMaterial.emissive.setHex(0xff6a45);
        gameTimeout(() => hitMaterial.emissive.setHex(previous), 70);
      }
      if (killed) {
        const killTime = gameNow();
        target.dead = true;
        target.group.userData.fall = 0;
        if (target.actions) {
          for (const action of target.actions.values()) action.fadeOut(0.08);
          target.deathVariant = Math.random() > 0.48 ? "deathAlt" : "death";
          const death = target.actions.get(target.deathVariant);
          death?.reset().setEffectiveWeight(1).fadeIn(0.08).play();
          target.activeAction = target.deathVariant;
        }
        zombieVocal(
          "death",
          THREE.MathUtils.clamp(
            (target.baseX - camera.position.x) / 13,
            -0.88,
            0.88,
          ),
          0.78,
        );
        if (hapticsRef.current && navigator.vibrate) {
          navigator.vibrate(zone === "head" ? [16, 18, 34] : [14, 20, 24]);
        }
        burst(hit.point.clone().add(new THREE.Vector3(0, 0.04, 0)), true);
        streakLive++;
        levelKills++;
        comboLive =
          lastKillAt > 0 && killTime - lastKillAt < 1650
            ? Math.min(5, comboLive + 1)
            : 1;
        lastKillAt = killTime;
        const comboMultiplier = 1 + (comboLive - 1) * 0.25;
        const movementMultiplier =
          target.motion === "brute"
            ? 1.45
            : target.motion === "runner"
              ? 1.28
              : target.motion === "crawler"
                ? 1.18
                : 1;
        const precisionTime =
          zone === "head" ? 0.6 : zone === "bullseye" ? 0.35 : 0;
        const points = Math.round(
          (zone === "head" ? 150 : zone === "bullseye" ? 120 : 100) *
            (1 + Math.min(streakLive, 10) * 0.08) *
            comboMultiplier *
            movementMultiplier *
            DIFFICULTIES[difficultyRef.current].scoreScale,
        );
        if (precisionTime) {
          timeLive += precisionTime;
          setTime(Math.ceil(timeLive));
        }
        if (streakLive % 5 === 0) {
          timeLive += 1;
          setTime(Math.ceil(timeLive));
        }
        scoreLive += points;
        setScore(scoreLive);
        setStreak(streakLive);
        setCombo(comboLive);
        setBestStreak((best) => Math.max(best, streakLive));
        requestCloudSave();
        showFeed(
          `${zone === "head" ? "SKULL CRUSHED" : "INFECTED DOWN"} · +${points}${
            precisionTime ? " · TIME BONUS" : ""
          }${comboLive > 1 ? ` · x${comboMultiplier.toFixed(2)}` : ""}`,
        );
        if (comboLive > 1) {
          gameTimeout(
            () => tone(880 + comboLive * 115, 0.08, 0.05),
            38,
          );
        }
        if (streakLive % 5 === 0) {
          tone(1320, 0.14, 0.08);
          gameTimeout(() => tone(1640, 0.11, 0.055), 90);
        }
        const goal = levelConfig(levelLive).goal;
        if (levelKills >= goal) levelUp();
      } else if (target.actions) {
        playEnemyOneShot(target, "hit");
      }
    }

    function shoot() {
      if (!running || reloadingLive) return;
      const now = gameNow();
      const weapon = WEAPONS[currentWeapon];
      if (now - lastShot < 60000 / weapon.rpm) return;
      lastShot = now;
      if (ammoLive <= 0) {
        tone(120, 0.06, 0.05);
        showFeed("EMPTY // RELOAD");
        firing = false;
        return;
      }
      ammoLive--;
      shotsLive++;
      setAmmo({ mag: ammoLive, reserve: reserveLive });
      if (
        currentWeapon === 0 &&
        importedWeaponReady &&
        importedShootAction
      ) {
        importedShootAction.stop();
        importedShootAction
          .reset()
          .setEffectiveWeight(1)
          .play();
      }
      shotAudio(currentWeapon);
      pulseShotFlash();
      weaponKick = 1;
      shotRoll = (Math.random() - 0.5) * (currentWeapon === 2 ? 0.014 : 0.009);
      recoil = Math.min(recoil + weapon.recoil * (0.78 + Math.random() * 0.42), 0.16);
      if (muzzleFlash) {
        (muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;
        muzzleFlash.scale.setScalar(0.85 + Math.random() * 0.8);
        muzzleFlash.rotation.z = Math.random() * Math.PI;
      }
      if (muzzleLight) muzzleLight.intensity = 3.2;
      ejectShell();
      aim.set(0, 0);
      raycaster.setFromCamera(aim, camera);
      const hits = raycaster.intersectObjects(
        [targetRoot, ...shotBlockers],
        true,
      );
      const end = hits.length
        ? hits[0].point.clone()
        : raycaster.ray.at(100, new THREE.Vector3());
      addTracer(end);
      if (hits.length) {
        if (hits[0].object.userData.targetId) hitsLive++;
        registerHit(hits[0]);
      }
      setAccuracy(
        shotsLive > 0 ? Math.round((hitsLive / shotsLive) * 100) : 100,
      );
      if (hapticsRef.current && navigator.vibrate) {
        navigator.vibrate(currentWeapon === 2 ? 24 : 12);
      }
      if (ammoLive === 0) gameTimeout(reload, 220);
    }

    function deployLevelSquad() {
      if (!running || squadDeployed) return;
      if (!enemyAssetsReady) return;
      const encounter =
        LEVEL_ENCOUNTERS[
          Math.min(Math.max(levelLive - 1, 0), LEVEL_ENCOUNTERS.length - 1)
        ];
      squadDeployed = true;
      const spawnInterval = Math.max(150, 520 - levelLive * 58);
      encounter.slice(Math.min(levelKills, encounter.length)).forEach((slot, index) => {
        createTarget(slot.x, slot.z, slot.motion, index * spawnInterval, slot.entry);
      });
      setObjective(levelObjective(levelLive));
      showFeed(`${encounter.length - levelKills} infected are still moving`);
    }

    function isWalkableWorldPosition(x: number, z: number, padding = 0.42) {
      return (
        x > -13.7 &&
        x < 13.7 &&
        z > -88 &&
        z < 10.5 &&
        !obstacleBoxes.some(
          (obstacle) =>
            Math.abs(x - obstacle.x) < obstacle.halfW + padding &&
            Math.abs(z - obstacle.z) < obstacle.halfD + padding,
        )
      );
    }

    function findWalkableSpawn(x: number, z: number) {
      if (isWalkableWorldPosition(x, z, 0.62)) return { x, z };
      for (const radius of [0.9, 1.7, 2.7, 3.8]) {
        for (let step = 0; step < 12; step++) {
          const angle = (step / 12) * Math.PI * 2;
          const candidateX = THREE.MathUtils.clamp(
            x + Math.sin(angle) * radius,
            -13.2,
            13.2,
          );
          const candidateZ = THREE.MathUtils.clamp(
            z + Math.cos(angle) * radius,
            -87.4,
            9.9,
          );
          if (isWalkableWorldPosition(candidateX, candidateZ, 0.62)) {
            return { x: candidateX, z: candidateZ };
          }
        }
      }
      return { x: THREE.MathUtils.clamp(x, -7, 7), z };
    }

    function canEnemyMoveTo(x: number, z: number, movingTarget?: TargetState) {
      return (
        isWalkableWorldPosition(x, z) &&
        !Array.from(targets.values()).some(
          (other) =>
            other !== movingTarget &&
            !other.dead &&
            Math.hypot(x - other.baseX, z - other.baseZ) < 0.78,
        )
      );
    }

    function dampAngle(
      current: number,
      target: number,
      smoothing: number,
      dt: number,
    ) {
      const delta = Math.atan2(
        Math.sin(target - current),
        Math.cos(target - current),
      );
      return current + delta * (1 - Math.exp(-smoothing * dt));
    }

    function advanceEnemyTowardPlayer(
      target: TargetState,
      speed: number,
      dt: number,
    ) {
      const toPlayerX = camera.position.x - target.baseX;
      const toPlayerZ = camera.position.z - target.baseZ;
      const distanceToPlayer = Math.max(0.001, Math.hypot(toPlayerX, toPlayerZ));
      if (distanceToPlayer <= 2.25) {
        return { moved: false, directionX: 0, directionZ: 0, arrived: true };
      }

      const desiredAngle = Math.atan2(toPlayerX, toPlayerZ);
      const flank = target.flankDirection ?? 1;
      const blockedFor = target.blockedFor ?? 0;
      const angleOffsets = [
        0,
        flank * 0.34,
        flank * -0.34,
        flank * 0.68,
        flank * -0.68,
        flank * 1.02,
        flank * -1.02,
        flank * 1.36,
        flank * -1.36,
        flank * 1.7,
        flank * -1.7,
        flank * 2.08,
        flank * -2.08,
      ];
      const step = Math.min(
        speed * dt,
        Math.max(0, distanceToPlayer - 2.25),
      );
      const probeDistance = THREE.MathUtils.clamp(
        1.05 + speed * 0.24 + blockedFor * 0.9,
        1.05,
        3.2,
      );

      for (const offset of angleOffsets) {
        const angle = desiredAngle + offset;
        const directionX = Math.sin(angle);
        const directionZ = Math.cos(angle);
        const nextX = target.baseX + directionX * step;
        const nextZ = target.baseZ + directionZ * step;
        if (!canEnemyMoveTo(nextX, nextZ, target)) continue;
        const probeX = target.baseX + directionX * probeDistance;
        const probeZ = target.baseZ + directionZ * probeDistance;
        if (
          !canEnemyMoveTo(probeX, probeZ, target) &&
          !(blockedFor > 0.65 && Math.abs(offset) >= 1.02)
        ) {
          continue;
        }
        target.baseX = nextX;
        target.baseZ = nextZ;
        target.blockedFor = Math.max(0, blockedFor - dt * 2.5);
        if (offset !== 0) target.flankDirection = Math.sign(offset) || flank;
        return {
          moved: true,
          directionX,
          directionZ,
          arrived: false,
        };
      }

      target.flankDirection = -flank;
      target.blockedFor = Math.min(2.5, blockedFor + dt);
      return { moved: false, directionX: 0, directionZ: 0, arrived: false };
    }

    function onMouseMove(event: MouseEvent) {
      if (youtubePaused) return;
      const hasPointerLock = document.pointerLockElement === renderer.domElement;
      if (!running || (!hasPointerLock && event.buttons === 0)) return;
      yaw -= event.movementX * 0.0018;
      pitch -= event.movementY * 0.00165;
      pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.62);
    }

    function onMouseDown(event: MouseEvent) {
      if (youtubePaused || !running) return;
      if (document.pointerLockElement !== renderer.domElement) {
        tryPointerLock();
      }
      if (event.button !== 0) return;
      firing = true;
      shoot();
      if (!WEAPONS[currentWeapon].auto) firing = false;
    }

    function onMouseUp(event: MouseEvent) {
      if (youtubePaused) return;
      if (event.button === 0) firing = false;
    }

    function onContextMenu(event: MouseEvent) {
      if (youtubePaused) return;
      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (youtubePaused) return;
      keys.add(event.code);
      if (event.code === "KeyR") reload();
      if (event.code === "Digit1") switchWeapon(0);
      if (event.code === "Digit2") switchWeapon(1);
      if (event.code === "Digit3") switchWeapon(2);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (youtubePaused) return;
      keys.delete(event.code);
    }

    function onResize() {
      if (!mount || youtubePaused) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderPixelRatio = Math.min(
        renderPixelRatio,
        devicePixelRatio,
        renderProfile.maxPixelRatio,
      );
      renderer.setPixelRatio(renderPixelRatio);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", onResize);

    let frame: number | null = null;
    let qualitySampleTime = 0;
    let qualitySampleFrames = 0;
    let characterAnimationAccumulator = 0;

    engineRef.current = {
      start() {
        if (pendingCloudSession) {
          const session = pendingCloudSession;
          pendingCloudSession = null;
          restoreCloudSession(session);
        } else {
          resetGame();
        }
      },
      reload,
      setFiring(value) {
        if (youtubePaused) return;
        firing = value;
        if (value) shoot();
      },
      aimDelta(dx, dy) {
        if (youtubePaused || !running) return;
        yaw -= dx * 0.0041;
        pitch -= dy * 0.0038;
        pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.62);
      },
      switchWeapon,
      choosePerk,
      createCloudSave,
      restoreCloudSave,
      pauseFromYouTube() {
        firing = false;
        shootPointer.current = null;
        lookPointer.current = null;
        keys.clear();
        navigator.vibrate?.(0);
        document.exitPointerLock?.();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        clock.stop();
        setYouTubeAudioEnabled(false);
      },
      resumeFromYouTube() {
        setYouTubeAudioEnabled(youtubePlayables.isAudioEnabled);
        onResize();
        clock.start();
        clock.getDelta();
        startLoop();
      },
      setYouTubeAudioEnabled,
    };

    function animate() {
      if (youtubePlayables.isPaused) {
        frame = null;
        return;
      }
      frame = requestAnimationFrame(animate);
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.04);
      const elapsed = gameNow();
      importedWeaponMixer?.update(dt);
      updateHorrorMusic(elapsed);

      if (mobileRendering) {
        qualitySampleTime += rawDt;
        qualitySampleFrames++;
        if (qualitySampleTime >= 1.8) {
          const averageFrameTime = qualitySampleTime / qualitySampleFrames;
          let nextPixelRatio = renderPixelRatio;
          if (averageFrameTime > 0.0235) nextPixelRatio -= 0.1;
          else if (averageFrameTime < 0.0172) nextPixelRatio += 0.05;
          nextPixelRatio = THREE.MathUtils.clamp(
            nextPixelRatio,
            renderProfile.minPixelRatio,
            Math.min(devicePixelRatio, renderProfile.maxPixelRatio),
          );
          if (Math.abs(nextPixelRatio - renderPixelRatio) >= 0.045) {
            renderPixelRatio = nextPixelRatio;
            renderer.setPixelRatio(renderPixelRatio);
          }
          qualitySampleTime = 0;
          qualitySampleFrames = 0;
        }
      }

      if (running) {
        if (firing) shoot();
        if (comboLive > 1 && elapsed - lastKillAt > 1900) {
          comboLive = 1;
          setCombo(1);
        }
        timeAccumulator += dt;
        if (timeAccumulator >= 0.25) {
          timeAccumulator = 0;
          timeLive -= 0.25;
          setTime(Math.max(0, Math.ceil(timeLive)));
          if (timeLive <= 0) {
            running = false;
            firing = false;
            setGameOver(true);
            document.exitPointerLock?.();
            showFeed("SESSION COMPLETE");
          }
        }
      }

      const playerMoveMagnitude = 0;
      camera.position.set(0, 1.72, 11.5);
      walkPhase += dt * 1.45;

      recoil = THREE.MathUtils.lerp(recoil, 0, 1 - Math.pow(0.0001, dt));
      shotRoll = THREE.MathUtils.lerp(shotRoll, 0, 1 - Math.pow(0.00002, dt));
      camera.rotation.y = yaw;
      camera.rotation.x = pitch + recoil;
      camera.rotation.z = shotRoll;
      camera.fov = THREE.MathUtils.lerp(camera.fov, 68, 1 - Math.pow(0.00002, dt));
      camera.updateProjectionMatrix();
      weaponKick = THREE.MathUtils.lerp(weaponKick, 0, 1 - Math.pow(0.00004, dt));
      const importedAkActive = currentWeapon === 0 && importedWeaponReady;
      const hipWeaponX = importedAkActive ? 0.34 : 0.32;
      const hipWeaponY = importedAkActive ? -0.56 : -0.3;
      const hipWeaponZ = importedAkActive ? -1.3 : -1.48;
      const viewWeaponPitch = importedAkActive ? -0.018 : 0;
      weaponRoot.position.x = hipWeaponX;
      weaponRoot.position.z =
        hipWeaponZ + weaponKick * 0.045;
      weaponRoot.position.y =
        hipWeaponY -
        weaponKick * 0.02 +
        Math.sin(walkPhase) * 0.0035;
      if (reloadingLive) {
        const reloadProgress = Math.min(
          1,
          (elapsed - reloadStarted) / WEAPONS[currentWeapon].reloadMs,
        );
        const ease = (value: number) => value * value * (3 - 2 * value);
        const phase = (start: number, end: number) =>
          ease(THREE.MathUtils.clamp((reloadProgress - start) / (end - start), 0, 1));
        const enterPose = phase(0, 0.13);
        const exitPose = phase(0.82, 1);
        const authoredReload =
          currentWeapon === 0 && importedWeaponReady;
        const pose = authoredReload ? 0 : enterPose * (1 - exitPose);
        const removeMag = phase(0.18, 0.38);
        const insertMag = phase(0.46, 0.7);
        const reachBolt = phase(0.7, 0.82);
        const leaveBolt = phase(0.92, 1);
        const boltPull =
          phase(0.82, 0.875) * (1 - phase(0.875, 0.93));

        weaponRoot.rotation.z = -pose * 0.36;
        weaponRoot.rotation.x = viewWeaponPitch + pose * 0.12;
        weaponRoot.rotation.y = pose * 0.08;
        weaponRoot.position.x += pose * 0.045;
        weaponRoot.position.y -= pose * 0.05;

        if (
          weaponMagazine &&
          reloadMagazine &&
          supportHand &&
          supportArm &&
          chargingHandle
        ) {
          weaponMagazine.visible = reloadProgress < 0.42 || reloadProgress >= 0.69;
          weaponMagazine.position.set(
            THREE.MathUtils.lerp(0, -0.22, removeMag),
            THREE.MathUtils.lerp(-0.43, -1.05, removeMag),
            THREE.MathUtils.lerp(-0.44, -0.3, removeMag),
          );
          weaponMagazine.rotation.x = -0.12;
          weaponMagazine.rotation.z = -removeMag * 0.32;
          if (reloadProgress >= 0.69) {
            weaponMagazine.position.set(0, -0.43, -0.44);
            weaponMagazine.rotation.z = 0;
          }

          reloadMagazine.visible =
            reloadProgress >= 0.4 && reloadProgress < 0.69;
          reloadMagazine.position.set(
            THREE.MathUtils.lerp(-0.22, 0, insertMag),
            THREE.MathUtils.lerp(-1.05, -0.43, insertMag),
            THREE.MathUtils.lerp(-0.3, -0.44, insertMag),
          );
          reloadMagazine.rotation.x = -0.12;
          reloadMagazine.rotation.z = THREE.MathUtils.lerp(-0.32, 0, insertMag);

          const grabOld = phase(0.06, 0.18);
          const grabNew = phase(0.38, 0.46);
          const handToBolt = reachBolt * (1 - leaveBolt);
          let handX = THREE.MathUtils.lerp(-0.04, -0.08, grabOld);
          let handY = THREE.MathUtils.lerp(-0.2, -0.35, grabOld);
          let handZ = THREE.MathUtils.lerp(-1.02, -0.42, grabOld);
          if (reloadProgress >= 0.18 && reloadProgress < 0.4) {
            handX = weaponMagazine.position.x - 0.07;
            handY = weaponMagazine.position.y + 0.08;
            handZ = weaponMagazine.position.z;
          } else if (reloadProgress >= 0.4 && reloadProgress < 0.7) {
            handX = reloadMagazine.position.x - 0.07;
            handY = reloadMagazine.position.y + 0.08 - (1 - grabNew) * 0.08;
            handZ = reloadMagazine.position.z;
          }
          handX = THREE.MathUtils.lerp(handX, 0.12, handToBolt);
          handY = THREE.MathUtils.lerp(handY, 0.2, handToBolt);
          handZ = THREE.MathUtils.lerp(handZ, -0.12 + boltPull * 0.17, handToBolt);
          if (reloadProgress >= 0.92) {
            handX = THREE.MathUtils.lerp(handX, -0.04, leaveBolt);
            handY = THREE.MathUtils.lerp(handY, -0.2, leaveBolt);
            handZ = THREE.MathUtils.lerp(handZ, -1.02, leaveBolt);
          }
          supportHand.position.set(handX, handY, handZ);
          supportHand.rotation.x = -0.2 + pose * 0.34;
          supportHand.rotation.z = -pose * 0.18;

          supportArm.position.set(
            -0.28 + (handX + 0.04) * 0.42,
            -0.52 + (handY + 0.2) * 0.36,
            -0.54 + (handZ + 1.02) * 0.34,
          );
          supportArm.rotation.x = -0.64 + pose * 0.3;
          supportArm.rotation.z = 0.15 - pose * 0.2;
          chargingHandle.position.set(0.24, 0.22, -0.12 + boltPull * 0.17);
        }
      } else {
        weaponRoot.rotation.z =
          Math.sin(walkPhase * 0.5) * 0.012;
        weaponRoot.rotation.x = viewWeaponPitch - weaponKick * 0.05;
        weaponRoot.rotation.y = 0;
        if (
          weaponMagazine &&
          reloadMagazine &&
          supportHand &&
          supportArm &&
          chargingHandle
        ) {
          weaponMagazine.visible = true;
          weaponMagazine.position.set(0, -0.43, -0.44);
          weaponMagazine.rotation.set(-0.12, 0, 0);
          reloadMagazine.visible = false;
          supportHand.position.set(-0.04, -0.2, -1.02);
          supportHand.rotation.set(0, 0, 0);
          supportArm.position.set(-0.28, -0.52, -0.54);
          supportArm.rotation.set(-0.64, 0, 0.15);
          chargingHandle.position.set(0.24, 0.22, -0.12);
        }
      }

      if (muzzleFlash) {
        const mat = muzzleFlash.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - dt * 28);
      }
      if (muzzleLight) {
        muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 90);
      }

      characterAnimationAccumulator += dt;
      const updateCharacterAnimations =
        characterAnimationAccumulator >= 1 / renderProfile.characterAnimationFps;
      const characterAnimationStep = characterAnimationAccumulator;
      if (updateCharacterAnimations) characterAnimationAccumulator = 0;

      for (const target of targets.values()) {
        const age = elapsed - target.bornAt;
        if (updateCharacterAnimations) {
          target.mixer?.update(characterAnimationStep);
        }
        if (age < 0) {
          target.group.visible = false;
          continue;
        }
        target.group.visible = true;
        if (target.dead) {
          target.group.userData.fall = (target.group.userData.fall || 0) + dt;
          if (target.group.userData.fall >= 2.35) {
            targetRoot.remove(target.group);
            targets.delete(target.id);
          }
          continue;
        }

        const drill = levelConfig(levelLive);
        const alleyEntry = target.group.userData.entry === "alley";
        const spawnProgress = THREE.MathUtils.clamp(age / (alleyEntry ? 360 : 620), 0, 1);
        const spawnEase = 1 - Math.pow(1 - spawnProgress, 3);
        if (spawnProgress < 1) {
          target.group.position.set(
            target.baseX +
              (alleyEntry
                ? Math.sign(target.baseX || 1) * (1 - spawnEase) * 2.35
                : 0),
            target.baseY - (1 - spawnEase) * (alleyEntry ? 0.24 : 1.45),
            target.baseZ,
          );
        } else {
          target.group.position.x = THREE.MathUtils.damp(
            target.group.position.x,
            target.baseX,
            18,
            dt,
          );
          target.group.position.y = THREE.MathUtils.damp(
            target.group.position.y,
            target.baseY,
            20,
            dt,
          );
          target.group.position.z = THREE.MathUtils.damp(
            target.group.position.z,
            target.baseZ,
            18,
            dt,
          );
        }
        target.group.rotation.set(0, target.facingYaw, 0);

        if (!target.group.userData.screamed) {
          target.group.userData.screamed = true;
          playEnemyOneShot(target, "scream");
          if (alleyEntry || target.id % 3 === 1) {
            const spawnDistance = Math.hypot(
              camera.position.x - target.baseX,
              camera.position.z - target.baseZ,
            );
            zombieVocal(
              "scream",
              THREE.MathUtils.clamp(
                (target.baseX - camera.position.x) / 13,
                -0.88,
                0.88,
              ),
              THREE.MathUtils.clamp(1.08 - spawnDistance / 70, 0.48, 1.04),
              alleyEntry ? "alley" : "street",
            );
          }
        }
        if (!running || spawnProgress < 1 || elapsed < (target.screamingUntil ?? 0)) {
          continue;
        }

        const distanceToPlayer = Math.hypot(
          camera.position.x - target.baseX,
          camera.position.z - target.baseZ,
        );
        const playerFacingYaw = Math.atan2(
          camera.position.x - target.baseX,
          camera.position.z - target.baseZ,
        );
        if (target.reactionUntil && elapsed < target.reactionUntil) {
          target.facingYaw = dampAngle(target.facingYaw, playerFacingYaw, 10, dt);
          target.group.rotation.y = target.facingYaw;
          continue;
        }
        if (target.attackingUntil && elapsed < target.attackingUntil) {
          target.facingYaw = dampAngle(target.facingYaw, playerFacingYaw, 16, dt);
          target.group.rotation.y = target.facingYaw;
          continue;
        }

        if (distanceToPlayer <= 2.38) {
          target.facingYaw = dampAngle(target.facingYaw, playerFacingYaw, 14, dt);
          target.group.rotation.y = target.facingYaw;
          setEnemyLocomotion(target, "idle");
          if (elapsed >= (target.nextAttackAt ?? 0)) {
            const attackKey =
              target.motion === "crawler"
                ? "bite"
                : Math.random() > 0.72
                  ? "attackAlt"
                  : "attack";
            playEnemyOneShot(target, attackKey);
            const attackDuration = target.motion === "crawler" ? 1080 : 840;
            const attackImpactDelay =
              target.motion === "crawler" ? 420 : attackKey === "attackAlt" ? 350 : 310;
            target.attackingUntil = elapsed + attackDuration;
            target.nextAttackAt =
              elapsed +
              drill.fireDelay * enemyFireScale(difficultyRef.current) * (ghostActive ? 1.2 : 1) +
              Math.random() * 260;
            zombieVocal(
              "attack",
              THREE.MathUtils.clamp(
                (target.baseX - camera.position.x) / 8,
                -0.82,
                0.82,
              ),
              target.motion === "brute" ? 1.08 : 0.88,
            );
            gameTimeout(() => {
              if (!running || target.dead) return;
              const currentDistance = Math.hypot(
                camera.position.x - target.baseX,
                camera.position.z - target.baseZ,
              );
              if (currentDistance <= 2.75) damagePlayerFromZombie(target);
            }, attackImpactDelay);
          }
          continue;
        }

        const advance = advanceEnemyTowardPlayer(target, target.speed, dt);
        if (advance.moved) {
          target.lastMovedAt = elapsed;
          target.facingYaw = dampAngle(
            target.facingYaw,
            Math.atan2(advance.directionX, advance.directionZ),
            target.motion === "runner" ? 15 : 11,
            dt,
          );
          target.group.rotation.y = target.facingYaw;
          setEnemyLocomotion(
            target,
            target.motion === "crawler"
              ? levelLive >= 3
                ? "crawlRun"
                : "crawl"
              : target.motion === "runner"
                ? "run"
                : "walk",
          );
        } else if (
          !advance.arrived &&
          elapsed - (target.lastMovedAt ?? -1000) > 180
        ) {
          setEnemyLocomotion(target, "idle");
        }
      }

      for (let i = tracers.length - 1; i >= 0; i--) {
        const tracer = tracers[i];
        tracer.life -= dt;
        (tracer.line.material as THREE.LineBasicMaterial).opacity = Math.max(
          0,
          tracer.life * 16,
        );
        if (tracer.life <= 0) {
          scene.remove(tracer.line);
          tracer.line.geometry.dispose();
          (tracer.line.material as THREE.Material).dispose();
          tracers.splice(i, 1);
        }
      }

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const wave = shockwaves[i];
        wave.life -= dt;
        const progress = 1 - wave.life / wave.maxLife;
        wave.mesh.scale.setScalar(1 + progress * 5.5);
        (wave.mesh.material as THREE.MeshBasicMaterial).opacity =
          Math.max(0, 1 - progress) * 0.85;
        if (wave.life <= 0) {
          scene.remove(wave.mesh);
          wave.mesh.geometry.dispose();
          (wave.mesh.material as THREE.Material).dispose();
          shockwaves.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.life -= dt;
        particle.velocity.y -= 5.8 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.rotation.x += dt * 11;
        particle.mesh.rotation.z += dt * 8;
        if (particle.life <= 0) {
          scene.remove(particle.mesh);
          particles.splice(i, 1);
        }
      }

      dust.rotation.y += dt * 0.003;
      for (const light of flickerLights) {
        const base = light.userData.baseIntensity as number;
        const phase = light.userData.phase as number;
        const flutter = Math.sin(elapsed * 0.011 + phase) * 0.18;
        const dropout = Math.sin(elapsed * 0.0037 + phase * 2.3) > 0.96 ? 0.18 : 1;
        light.intensity = base * (0.82 + flutter) * dropout;
      }
      windowGlow.emissiveIntensity =
        2.15 + Math.sin(elapsed * 0.0017) * 0.16;
      smokeWisps.forEach((wisp, index) => {
        wisp.position.x += Math.sin(elapsed * 0.00022 + wisp.userData.phase) * wisp.userData.drift * dt;
        wisp.position.y = 1.1 + index * 0.16 + Math.sin(elapsed * 0.00034 + index) * 0.38;
        wisp.rotation.y += dt * (index % 2 ? 0.025 : -0.018);
      });
      rearSmoke.forEach((smoke, index) => {
        const phase = smoke.userData.phase as number;
        smoke.position.x =
          (smoke.userData.baseX as number) +
          Math.sin(elapsed * 0.00022 + phase) * (1.75 + (index % 3) * 0.55);
        smoke.position.y =
          (smoke.userData.baseY as number) +
          Math.sin(elapsed * 0.00031 + phase * 1.7) * 0.48;
        smoke.position.z =
          (smoke.userData.baseZ as number) +
          Math.sin(elapsed * 0.00017 + phase * 0.8) * 0.75;
        const billow = 1 + Math.sin(elapsed * 0.00026 + phase) * 0.055;
        smoke.scale.set(
          (smoke.userData.baseScaleX as number) * billow,
          (smoke.userData.baseScaleY as number) * (2 - billow),
          1,
        );
        (smoke.material as THREE.SpriteMaterial).opacity =
          (smoke.userData.baseOpacity as number) *
          (0.8 + Math.sin(elapsed * 0.0003 + phase) * 0.2);
      });
      renderer.render(scene, camera);
      if (!sceneFirstFrameRendered) {
        sceneFirstFrameRendered = true;
        youtubePlayables.signalFirstFrameReady();
        updateLoadingProgress(96, "LIGHTING THE STREET");
        finishLoading();
      }
    }

    function startLoop() {
      if (frame !== null || youtubePlayables.isPaused) return;
      clock.start();
      clock.getDelta();
      frame = requestAnimationFrame(animate);
    }

    if (youtubePlayables.isPaused) {
      engineRef.current.pauseFromYouTube();
    } else {
      engineRef.current.setYouTubeAudioEnabled(
        youtubePlayables.isAudioEnabled,
      );
    }

    window.addEventListener("beforeunload", () => {
      engineDisposed = true;
      reloadToken++;
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", onResize);
      coarsePointerQuery.removeEventListener("change", onPointerModeChange);
      removeYouTubePauseListener();
      removeYouTubeResumeListener();
      removeYouTubeAudioListener();
      if (cloudSaveTimer !== null) clearGameTimeout(cloudSaveTimer);
      youtubePlayables.destroy();
      renderer.dispose();
      void audio.close();
    });

  function begin() {
    if (youtubePaused || !gameAssetsReady) return;
    setStarted(true);
    engineRef.current?.start();
  }

  function onLookStart(event: PointerEvent) {
    if (youtubePaused || lookPointer.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    lookPointer.current = event.pointerId;
    lookLast.current = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onLookMove(event: PointerEvent) {
    if (youtubePaused || lookPointer.current !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - lookLast.current.x;
    const dy = event.clientY - lookLast.current.y;
    lookLast.current = { x: event.clientX, y: event.clientY };
    engineRef.current?.aimDelta(dx, dy);
  }

  function onLookEnd(event: PointerEvent) {
    if (youtubePaused || lookPointer.current !== event.pointerId) return;
    event.preventDefault();
    lookPointer.current = null;
  }

  function onShootStart(event: PointerEvent) {
    if (youtubePaused || shootPointer.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    shootPointer.current = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    engineRef.current?.setFiring(true);
  }

  function onShootEnd(event: PointerEvent) {
    if (shootPointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    shootPointer.current = null;
    engineRef.current?.setFiring(false);
  }

  element<HTMLButtonElement>("reload-button").addEventListener("click", () =>
    engineRef.current?.reload(),
  );
  document.querySelectorAll<HTMLButtonElement>(".weapon-slot").forEach((button) => {
    button.addEventListener("click", () => {
      engineRef.current?.switchWeapon(Number(button.dataset.weapon));
    });
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.difficulty as DifficultyKey;
        setDifficulty(key);
        setTime(DIFFICULTIES[key].startTime);
        requestCloudSave();
      });
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-perk]")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        engineRef.current?.choosePerk(button.dataset.perk as PerkKey);
      });
    });
  element<HTMLButtonElement>("deploy-button").addEventListener("click", begin);
  element<HTMLButtonElement>("restart-button").addEventListener("click", begin);
  element<HTMLButtonElement>("change-difficulty").addEventListener("click", () => {
    setGameOver(false);
    setStarted(false);
    setInterfaceLocked(false);
    element<HTMLElement>("perk-screen").hidden = true;
    element<HTMLElement>("drill-announcement").hidden = true;
    requestCloudSave(true);
  });

  const touchLayer = element<HTMLDivElement>("touch-layer");
  touchLayer.addEventListener("pointerdown", onLookStart);
  touchLayer.addEventListener("pointermove", onLookMove);
  touchLayer.addEventListener("pointerup", onLookEnd);
  touchLayer.addEventListener("pointercancel", onLookEnd);
  touchLayer.addEventListener("lostpointercapture", onLookEnd);
  const shootButton = element<HTMLButtonElement>("shoot-button");
  shootButton.addEventListener("pointerdown", onShootStart);
  shootButton.addEventListener("pointerup", onShootEnd);
  shootButton.addEventListener("pointercancel", onShootEnd);
  shootButton.addEventListener("lostpointercapture", onShootEnd);

  updateWeaponRail();
  setFeed(feed);
  void youtubePlayables
    .getCloudData()
    .then((serialized) => {
      const save = parseCloudSave(serialized);
      if (save) engineRef.current?.restoreCloudSave(save);
    })
    .finally(() => {
      youtubePlayables.sendScore(cloudProfile.bestScore);
      youtubePlayables.markCloudRestoreApplied();
    });
  startLoop();

/*
  return (
    <main className="game-shell">
      <div ref={mountRef} className="viewport" />
      <div key={damageFlash} className={damageFlash ? "level-flash" : ""} />
      <div
        key={playerHitFlash}
        className={playerHitFlash ? "player-hit-flash" : ""}
      />

      <header className="topbar" aria-label="Mission status">
        <div className="brand">
          <span className="brand-mark">R//7</span>
          <span>
            BLACKSITE <b>SEVEN</b>
          </span>
        </div>
        <div className="level-block">
          <span>DRILL</span>
          <strong>{String(level).padStart(2, "0")}</strong>
          <i />
          <small>{objective}</small>
        </div>
        <div className={`timer ${time <= 10 ? "danger" : ""}`}>
          <small>TIME</small>
          <strong>00:{String(time).padStart(2, "0")}</strong>
        </div>
      </header>

      <aside className="score-panel" aria-label="Score">
        <span>SCORE</span>
        <strong>{score.toLocaleString("en-US").padStart(6, "0")}</strong>
        <div className="streak">
          <i style={{ width: `${Math.min(streak * 10, 100)}%` }} />
        </div>
        <small>{streak > 1 ? `x${streak} STREAK` : "BUILD STREAK"}</small>
        <em>{accuracy}% ACCURACY</em>
      </aside>

      <aside className={`health-panel ${health <= 30 ? "danger" : ""}`}>
        <span>ARMOR</span>
        <div>
          <i style={{ width: `${health}%` }} />
        </div>
        <strong>{String(health).padStart(3, "0")}</strong>
      </aside>

      <div className="compass" aria-hidden="true">
        <i />
        <span>W</span>
        <b>348</b>
        <strong>N</strong>
        <b>012</b>
        <span>E</span>
      </div>

      <div key={hitPulse} className={hitPulse ? "hitmarker pulse" : "hitmarker"}>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className={`crosshair ${aiming ? "aiming" : ""}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div className={`kill-feed ${feed ? "visible" : ""}`}>{feed}</div>
      <div className={`combo-badge ${combo > 1 ? "active" : ""}`}>
        <strong>x{(1 + (combo - 1) * 0.25).toFixed(2)}</strong>
        <span>FLOW</span>
      </div>

      <section className="weapon-hud" aria-label="Weapon and ammunition">
        <div className="weapon-name">
          <span>{WEAPONS[weaponIndex].code}</span>
          <strong>{WEAPONS[weaponIndex].name}</strong>
          <small>{WEAPONS[weaponIndex].auto ? "FULL AUTO" : "SEMI AUTO"}</small>
        </div>
        <div className={`ammo ${ammo.mag <= 5 ? "low" : ""}`}>
          <strong>{String(ammo.mag).padStart(2, "0")}</strong>
          <span>/ {String(ammo.reserve).padStart(3, "0")}</span>
        </div>
        <button
          className="reload-chip"
          onClick={() => engineRef.current?.reload()}
          disabled={reloading}
        >
          {reloading ? "RELOADING" : "R  RELOAD"}
        </button>
      </section>

      <div className="weapon-rail" aria-label="Available weapons">
        {WEAPONS.map((weapon, index) => {
          const locked = index > Math.floor(level / 2);
          return (
            <button
              key={weapon.code}
              className={weaponIndex === index ? "active" : ""}
              disabled={locked}
              onClick={() => engineRef.current?.switchWeapon(index)}
              aria-label={`${weapon.name}${locked ? ", locked" : ""}`}
            >
              <span>{index + 1}</span>
              <b>{locked ? "LOCK" : weapon.code}</b>
            </button>
          );
        })}
      </div>

      {isMobile && started && !gameOver && (
        <div
          className="touch-layer"
          onPointerDown={onLookStart}
          onPointerMove={onLookMove}
          onPointerUp={onLookEnd}
          onPointerCancel={onLookEnd}
        >
          <div
            ref={joystickRef}
            className="joystick"
            onPointerDown={onJoyStart}
            onPointerMove={onJoyMove}
            onPointerUp={onJoyEnd}
            onPointerCancel={onJoyEnd}
          >
            <i />
          </div>
          <button
            className="fire-button"
            aria-label="Fire weapon"
            onPointerDown={(event) => {
              event.stopPropagation();
              engineRef.current?.setFiring(true);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              engineRef.current?.setFiring(false);
            }}
            onPointerCancel={() => engineRef.current?.setFiring(false)}
          >
            FIRE
          </button>
          <button
            className="aim-button"
            aria-label="Aim down sights"
            onPointerDown={(event) => {
              event.stopPropagation();
              engineRef.current?.setAiming(true);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              engineRef.current?.setAiming(false);
            }}
            onPointerCancel={() => engineRef.current?.setAiming(false)}
          >
            ADS
          </button>
          <button
            className="touch-reload"
            aria-label="Reload weapon"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => engineRef.current?.reload()}
          >
            R
          </button>
          <button
            className="haptics-toggle"
            aria-label={`Turn haptics ${haptics ? "off" : "on"}`}
            aria-pressed={haptics}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              hapticsRef.current = !hapticsRef.current;
              setHaptics(hapticsRef.current);
            }}
          >
            VIBE
            <small>{haptics ? "ON" : "OFF"}</small>
          </button>
        </div>
      )}

      {!started && (
        <section className="start-screen">
          <div className="scanline" />
          <div className="eyebrow">CLIFFSIDE QUALIFICATION // 07</div>
          <h1>
            RANGE
            <span>SEVEN</span>
          </h1>
          <p>
            Track pop-ups, strafers, hover patterns, and dash targets across a
            fast tactical course before the clock expires.
          </p>
          <div className="difficulty-select" role="radiogroup" aria-label="Difficulty">
            {(Object.keys(DIFFICULTIES) as DifficultyKey[]).map((key) => (
              <button
                key={key}
                role="radio"
                aria-checked={difficulty === key}
                className={difficulty === key ? "active" : ""}
                onClick={() => {
                  difficultyRef.current = key;
                  setDifficulty(key);
                  setTime(DIFFICULTIES[key].startTime);
                }}
              >
                <b>{DIFFICULTIES[key].label}</b>
                <small>{DIFFICULTIES[key].description}</small>
              </button>
            ))}
          </div>
          <div className="briefing">
            <div>
              <span>01</span>
              <b>AIM</b>
              <small>{isMobile ? "DRAG RIGHT SIDE" : "MOVE MOUSE"}</small>
            </div>
            <div>
              <span>02</span>
              <b>FIRE</b>
              <small>{isMobile ? "HOLD FIRE" : "LEFT CLICK"}</small>
            </div>
            <div>
              <span>03</span>
              <b>MOVE</b>
              <small>{isMobile ? "LEFT STICK" : "WASD KEYS"}</small>
            </div>
          </div>
          <button className="deploy-button" onClick={begin}>
            <span>ENTER BLACKSITE</span>
            <i>▶</i>
          </button>
          <small className="legal">
            ORIGINAL TACTICAL TRAINING EXPERIENCE · HEADPHONES RECOMMENDED
          </small>
        </section>
      )}

      {gameOver && (
        <section className="result-screen">
          <span className="eyebrow">
            {health <= 0
              ? "OPERATOR DOWN"
              : `${DIFFICULTIES[difficulty].label} QUALIFICATION COMPLETE`}
          </span>
          <h2>{score.toLocaleString("en-US")}</h2>
          <p>FINAL SCORE</p>
          <div className="result-grid">
            <div>
              <span>DRILL</span>
              <strong>{level}</strong>
            </div>
            <div>
              <span>BEST STREAK</span>
              <strong>{bestStreak}</strong>
            </div>
            <div>
              <span>ACCURACY</span>
              <strong>{accuracy}%</strong>
            </div>
            <div>
              <span>RATING</span>
              <strong>{score > 6500 ? "S" : score > 4000 ? "A" : score > 2200 ? "B" : "C"}</strong>
            </div>
          </div>
          <button className="deploy-button" onClick={begin}>
            RUN IT AGAIN
          </button>
          <button
            className="change-difficulty"
            onClick={() => {
              setGameOver(false);
              setStarted(false);
            }}
          >
            CHANGE DIFFICULTY
          </button>
        </section>
      )}

      <footer className="footer-strip">
        <span>BLACKSITE LIVE</span>
        <i />
        <span>{DIFFICULTIES[difficulty].label}</span>
        <span>WIND 00.4</span>
        <span>CAL 5.56</span>
        <b>SAFETY OFF</b>
      </footer>
    </main>
  );
}
*/
