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

const PERKS: Record<
  PerkKey,
  { label: string; status: string }
> = {
  ammo: { label: "AMMO CACHE", status: "AMMO" },
  ghost: { label: "GHOST MODE", status: "GHOST" },
  heal: { label: "FIELD MEDKIT", status: "MEDKIT" },
};

const DIFFICULTIES = {
  recruit: {
    label: "RECRUIT",
    description: "Forgiving timing",
    startTime: 55,
    lifeScale: 1.22,
    speedScale: 0.84,
    spawnScale: 1.14,
    scoreScale: 0.85,
    maxBonus: 0,
  },
  operator: {
    label: "OPERATOR",
    description: "Balanced pressure",
    startTime: 45,
    lifeScale: 1,
    speedScale: 1,
    spawnScale: 1,
    scoreScale: 1,
    maxBonus: 1,
  },
  elite: {
    label: "ELITE",
    description: "Fast and punishing",
    startTime: 38,
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
  motion: "pop" | "strafe" | "hover" | "dash";
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
    title: "ZEROING",
    goal: 5,
    motions: ["pop"],
    targetLife: 9000,
    moveSpeed: 0.68,
    firstShot: 2150,
    fireDelay: 2350,
    enemyAccuracy: 0.31,
    enemyDamage: 5,
    timeBonus: 16,
    advanceDelay: Number.POSITIVE_INFINITY,
    advanceSpeed: 0,
  },
  {
    title: "SIDE STEP",
    goal: 7,
    motions: ["pop", "strafe", "strafe"],
    targetLife: 8600,
    moveSpeed: 0.76,
    firstShot: 1900,
    fireDelay: 2150,
    enemyAccuracy: 0.35,
    enemyDamage: 6,
    timeBonus: 15,
    advanceDelay: 4200,
    advanceSpeed: 2.25,
  },
  {
    title: "CROSSFIRE",
    goal: 9,
    motions: ["pop", "strafe", "hover", "strafe"],
    targetLife: 8200,
    moveSpeed: 0.84,
    firstShot: 1700,
    fireDelay: 1950,
    enemyAccuracy: 0.39,
    enemyDamage: 7,
    timeBonus: 14,
    advanceDelay: 3200,
    advanceSpeed: 2.55,
  },
  {
    title: "ROLLING COVER",
    goal: 11,
    motions: ["strafe", "hover", "dash", "strafe"],
    targetLife: 7800,
    moveSpeed: 0.92,
    firstShot: 1500,
    fireDelay: 1750,
    enemyAccuracy: 0.43,
    enemyDamage: 8,
    timeBonus: 13,
    advanceDelay: 2350,
    advanceSpeed: 2.9,
  },
  {
    title: "BLACKSITE FINAL",
    goal: 14,
    motions: ["strafe", "hover", "dash", "dash"],
    targetLife: 7400,
    moveSpeed: 1,
    firstShot: 1300,
    fireDelay: 1550,
    enemyAccuracy: 0.47,
    enemyDamage: 9,
    timeBonus: 0,
    advanceDelay: 1650,
    advanceSpeed: 3.25,
  },
] as const;

const DRILL_DETAILS = [
  "ESTABLISH YOUR SIGHTLINE",
  "TRACK MOVING CONTACTS",
  "BREAK THE CROSSFIRE",
  "CONTROL THE FLANKS",
  "CLEAR THE BLACKSITE",
] as const;

const LEVEL_ENCOUNTERS: ReadonlyArray<
  ReadonlyArray<{
    x: number;
    z: number;
    motion: TargetState["motion"];
  }>
> = [
  [
    { x: -10, z: 0, motion: "pop" },
    { x: -5, z: -15, motion: "pop" },
    { x: 0, z: -27, motion: "pop" },
    { x: 5, z: -15, motion: "pop" },
    { x: 10, z: 0, motion: "pop" },
  ],
  [
    { x: -10, z: -5, motion: "strafe" },
    { x: -4, z: -15, motion: "pop" },
    { x: 4, z: -15, motion: "strafe" },
    { x: 10, z: -5, motion: "pop" },
    { x: -8, z: -31, motion: "strafe" },
    { x: 0, z: -41, motion: "pop" },
    { x: 8, z: -31, motion: "strafe" },
  ],
  [
    { x: -11, z: -4, motion: "strafe" },
    { x: -5, z: -12, motion: "hover" },
    { x: 2, z: -10, motion: "pop" },
    { x: 9, z: -6, motion: "strafe" },
    { x: -9, z: -29, motion: "hover" },
    { x: -2, z: -36, motion: "strafe" },
    { x: 7, z: -28, motion: "pop" },
    { x: -6, z: -52, motion: "strafe" },
    { x: 6, z: -52, motion: "hover" },
  ],
  [
    { x: -11, z: -3, motion: "dash" },
    { x: -5, z: -10, motion: "strafe" },
    { x: 1, z: -8, motion: "hover" },
    { x: 9, z: -4, motion: "strafe" },
    { x: -10, z: -25, motion: "hover" },
    { x: -3, z: -31, motion: "dash" },
    { x: 5, z: -26, motion: "strafe" },
    { x: 11, z: -34, motion: "dash" },
    { x: -8, z: -51, motion: "strafe" },
    { x: 0, z: -59, motion: "hover" },
    { x: 8, z: -51, motion: "dash" },
  ],
  [
    { x: -11, z: -2, motion: "dash" },
    { x: -6, z: -8, motion: "strafe" },
    { x: 0, z: -5, motion: "hover" },
    { x: 6, z: -9, motion: "dash" },
    { x: 11, z: -2, motion: "strafe" },
    { x: -10, z: -23, motion: "hover" },
    { x: -3, z: -28, motion: "dash" },
    { x: 4, z: -24, motion: "strafe" },
    { x: 10, z: -34, motion: "dash" },
    { x: -9, z: -47, motion: "strafe" },
    { x: -2, z: -54, motion: "hover" },
    { x: 6, z: -49, motion: "dash" },
    { x: -6, z: -68, motion: "dash" },
    { x: 7, z: -68, motion: "strafe" },
  ],
];

function levelConfig(level: number) {
  return LEVELS[Math.min(Math.max(level - 1, 0), LEVELS.length - 1)];
}

function levelObjective(level: number) {
  const config = levelConfig(level);
  return `${config.title} // ${config.goal} HOSTILES`;
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
    setAiming: (value: boolean) => void;
    aimDelta: (dx: number, dy: number) => void;
    switchWeapon: (index: number) => void;
    choosePerk: (perk: PerkKey) => void;
    pauseFromYouTube: () => void;
    resumeFromYouTube: () => void;
    setYouTubeAudioEnabled: (enabled: boolean) => void;
  } | null;
} = { current: null };

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
let aiming = false;
let isMobile = false;
let interfaceLocked = false;
let mobileAutoMoving = false;
let youtubePaused = youtubePlayables.isPaused;

const difficultyRef: { current: DifficultyKey } = { current: difficulty };
const hapticsRef = { current: true };
const lookPointer = { current: null as number | null };
const lookLast = { current: { x: 0, y: 0 } };
const feedTimer = {
  current: null as number | null,
};

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
    engineRef.current?.setFiring(false);
    engineRef.current?.setAiming(false);
    setMobileAutoMoving(false);
  }
  updateTouchLayer();
}

function setMobileAutoMoving(moving: boolean) {
  if (mobileAutoMoving === moving) return;
  mobileAutoMoving = moving;
  element<HTMLElement>("auto-move-indicator").hidden = !(isMobile && moving);
}

function updateResults() {
  element("result-eyebrow").textContent =
    health <= 0
      ? "OPERATOR DOWN"
      : `${DIFFICULTIES[difficulty].label} QUALIFICATION COMPLETE`;
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
    setMobileAutoMoving(false);
    updateResults();
  }
  updateTouchLayer();
}

function setScore(update: Updater<number>) {
  score = resolveUpdate(score, update);
  element("score-value").textContent = score
    .toLocaleString("en-US")
    .padStart(6, "0");
}

function setLevel(update: Updater<number>) {
  level = resolveUpdate(level, update);
  element("level-value").textContent = String(level).padStart(2, "0");
  updateWeaponRail();
}

function setStreak(update: Updater<number>) {
  streak = resolveUpdate(streak, update);
  element("streak-value").textContent =
    streak > 1 ? `x${streak} STREAK` : "BUILD STREAK";
  element<HTMLElement>("streak-meter").style.width =
    `${Math.min(streak * 10, 100)}%`;
}

function setBestStreak(update: Updater<number>) {
  bestStreak = resolveUpdate(bestStreak, update);
}

function setCombo(update: Updater<number>) {
  combo = resolveUpdate(combo, update);
  element("combo-badge").classList.toggle("active", combo > 1);
  element("combo-value").textContent =
    `x${(1 + (combo - 1) * 0.25).toFixed(2)}`;
}

function setAccuracy(update: Updater<number>) {
  accuracy = resolveUpdate(accuracy, update);
  element("accuracy-value").textContent = `${accuracy}% ACCURACY`;
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
  const weapon = WEAPONS[weaponIndex];
  element("weapon-code").textContent = weapon.code;
  element("weapon-name").textContent = weapon.name;
  element("weapon-mode").textContent = weapon.auto ? "FULL AUTO" : "SEMI AUTO";
  updateWeaponRail();
}

function setTime(update: Updater<number>) {
  time = resolveUpdate(time, update);
  element("time-value").textContent = `00:${String(time).padStart(2, "0")}`;
  element("timer").classList.toggle("danger", time <= 10);
}

function setObjective(update: Updater<string>) {
  objective = resolveUpdate(objective, update);
  element("objective-value").textContent = objective;
}

function setFeed(update: Updater<string>) {
  feed = resolveUpdate(feed, update);
  const target = element("kill-feed");
  target.textContent = feed;
  target.classList.toggle("visible", Boolean(feed));
}

function setHitPulse(update: Updater<number>) {
  hitPulse = resolveUpdate(hitPulse, update);
  replayClass(element("hitmarker"), "hitmarker pulse");
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
  element("health-value").textContent = String(health).padStart(3, "0");
  element<HTMLElement>("health-meter").style.width = `${health}%`;
  element("health-panel").classList.toggle("danger", health <= 30);
}

function setReloading(update: Updater<boolean>) {
  reloading = resolveUpdate(reloading, update);
  const button = element<HTMLButtonElement>("reload-button");
  button.disabled = reloading;
  button.textContent = reloading ? "RELOADING" : "R  RELOAD";
}

function setAiming(update: Updater<boolean>) {
  aiming = resolveUpdate(aiming, update);
  element("crosshair").classList.toggle("aiming", aiming);
}

function setIsMobile(update: Updater<boolean>) {
  isMobile = resolveUpdate(isMobile, update);
  element("aim-help").textContent = isMobile ? "DRAG TO STEER" : "MOVE MOUSE";
  element("fire-help").textContent = isMobile ? "TAP + HOLD" : "LEFT CLICK";
  element("move-help").textContent = isMobile ? "AUTO ADVANCE" : "WASD KEYS";
  if (!isMobile) setMobileAutoMoving(false);
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
const removeYouTubePauseListener = youtubePlayables.onPause(() => {
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x78929a);
    scene.fog = new THREE.FogExp2(0x647d83, 0.008);

    const camera = new THREE.PerspectiveCamera(
      68,
      mount.clientWidth / mount.clientHeight,
      0.05,
      160,
    );
    camera.position.set(0, 1.72, 12);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Three-dimensional firing range");
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xcce5e1, 0x25302f, 2.25);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd6a3, 3.15);
    sun.position.set(-20, 24, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.far = 95;
    scene.add(sun);

    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(7, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd39b,
        fog: false,
        depthWrite: false,
      }),
    );
    sunDisc.position.set(-37, 27, -112);
    scene.add(sunDisc);

    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const floorContext = floorCanvas.getContext("2d")!;
    floorContext.fillStyle = "#4b5757";
    floorContext.fillRect(0, 0, 512, 512);
    floorContext.strokeStyle = "rgba(198,220,214,.12)";
    floorContext.lineWidth = 2;
    for (let i = 0; i <= 512; i += 128) {
      floorContext.beginPath();
      floorContext.moveTo(i, 0);
      floorContext.lineTo(i, 512);
      floorContext.stroke();
      floorContext.beginPath();
      floorContext.moveTo(0, i);
      floorContext.lineTo(512, i);
      floorContext.stroke();
    }
    for (let i = 0; i < 190; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const length = 4 + Math.random() * 22;
      floorContext.strokeStyle = `rgba(20,27,27,${0.05 + Math.random() * 0.14})`;
      floorContext.lineWidth = Math.random() > 0.84 ? 2 : 1;
      floorContext.beginPath();
      floorContext.moveTo(x, y);
      floorContext.lineTo(x + length, y + (Math.random() - 0.5) * 5);
      floorContext.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4, 18);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    const deck = new THREE.MeshStandardMaterial({
      color: 0x667271,
      map: floorTexture,
      roughness: 0.82,
      metalness: 0.16,
    });
    const cliffMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b4e50,
      roughness: 0.98,
      flatShading: true,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x223136,
      roughness: 0.44,
      metalness: 0.72,
    });
    const paleSteel = new THREE.MeshStandardMaterial({
      color: 0x758584,
      roughness: 0.62,
      metalness: 0.42,
    });
    const safety = new THREE.MeshStandardMaterial({
      color: 0xf0b83f,
      roughness: 0.58,
      metalness: 0.16,
    });
    const coral = new THREE.MeshStandardMaterial({
      color: 0xe2573e,
      roughness: 0.58,
      metalness: 0.12,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x11191b,
      roughness: 0.98,
    });
    const cyanGlow = new THREE.MeshBasicMaterial({ color: 0x83e5dd });
    const warmGlow = new THREE.MeshBasicMaterial({ color: 0xffd478 });

    const world = new THREE.Group();
    const obstacleBoxes: { x: number; z: number; halfW: number; halfD: number }[] = [];
    scene.add(world);
    roundedBox(world, [30, 0.36, 108], [0, -0.18, -39], deck, 0.16);
    roundedBox(world, [31.2, 0.6, 108], [0, -0.58, -39], steel, 0.2);

    function addRock(
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotation: number,
    ) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 0),
        cliffMaterial,
      );
      rock.position.set(x, y, z);
      rock.scale.set(sx, sy, sz);
      rock.rotation.set(rotation * 0.32, rotation, rotation * 0.14);
      rock.castShadow = Math.abs(x) < 23;
      rock.receiveShadow = true;
      world.add(rock);
    }

    const rockBands = [
      [-23, 2.1, 8, 9, 4.8, 7, 0.1],
      [22, 3.4, 3, 8, 7, 9, 0.6],
      [-25, 4.2, -12, 11, 8, 10, 1.2],
      [25, 2.8, -22, 9, 6, 9, 0.25],
      [-24, 3.5, -36, 10, 7, 12, 0.8],
      [24, 4.4, -48, 10, 9, 11, 1.1],
      [-26, 3.1, -64, 12, 7, 13, 0.3],
      [25, 4.6, -78, 11, 9, 12, 0.9],
      [-20, 5.2, -95, 15, 11, 10, 0.5],
      [20, 5.2, -98, 15, 12, 11, 1.3],
    ] as const;
    rockBands.forEach((rock) =>
      addRock(
        rock[0],
        rock[1],
        rock[2],
        rock[3],
        rock[4],
        rock[5],
        rock[6],
      ),
    );
    for (const [x, z, scale, rotation] of [
      [-44, -42, 24, 0.4],
      [42, -52, 28, 1.1],
      [-32, -104, 22, 0.7],
      [34, -112, 30, 0.2],
    ] as const) {
      addRock(x, scale * 0.23, z, scale, scale * 0.52, scale * 0.8, rotation);
    }

    function addFrame(z: number) {
      for (const x of [-13.65, 13.65]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.3, 6.5, 8),
          steel,
        );
        post.position.set(x, 3.25, z);
        post.castShadow = true;
        world.add(post);
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.58, 0.72, 0.22, 8),
          paleSteel,
        );
        foot.position.set(x, 0.11, z);
        world.add(foot);
      }
      roundedBox(world, [27.7, 0.38, 0.48], [0, 6.4, z], steel, 0.16, true);
      roundedBox(world, [9.5, 0.06, 0.16], [0, 6.16, z], cyanGlow, 0.02);
      const light = new THREE.PointLight(0x9deae2, 7, 14, 2);
      light.position.set(0, 5.85, z);
      world.add(light);
    }
    for (const z of [7, -14, -35, -56, -77]) addFrame(z);

    for (const x of [-11.4, 0, 11.4]) {
      roundedBox(world, [0.09, 0.025, 102], [x, 0.03, -40], cyanGlow, 0.02);
    }
    for (let z = 7; z > -91; z -= 8) {
      roundedBox(world, [28.8, 0.018, 0.055], [0, 0.035, z], paleSteel, 0.01);
    }

    const startStrip = roundedBox(world, [29.3, 0.055, 2.2], [0, 0.04, 9.2], rubber, 0.08);
    startStrip.receiveShadow = false;
    for (let x = -13.5; x < 14; x += 2.2) {
      const stripe = roundedBox(world, [1.05, 0.045, 2.3], [x, 0.06, 9.2], safety, 0.025);
      stripe.rotation.y = -0.58;
    }

    function addShield(x: number, z: number, width: number, height: number) {
      const shield = new THREE.Group();
      shield.position.set(x, 0, z);
      world.add(shield);
      const center = roundedBox(
        shield,
        [width * 0.72, height, 0.65],
        [0, height / 2, 0],
        paleSteel,
        0.18,
        true,
      );
      center.rotation.y = 0.04;
      for (const side of [-1, 1]) {
        const wing = roundedBox(
          shield,
          [width * 0.28, height * 0.82, 0.56],
          [side * width * 0.45, height * 0.42, 0.18],
          steel,
          0.16,
          true,
        );
        wing.rotation.y = side * -0.28;
        roundedBox(
          shield,
          [0.06, height * 0.7, 0.59],
          [side * width * 0.28, height * 0.45, -0.01],
          safety,
          0.02,
        );
      }
      obstacleBoxes.push({
        x,
        z,
        halfW: width / 2 + 0.55,
        halfD: 0.85,
      });
    }

    addShield(-7.4, -7, 4.8, 2.55);
    addShield(6.8, -22, 4.6, 2.2);
    addShield(-5.6, -39, 4.2, 2.35);
    addShield(7.4, -56, 4.8, 2.65);
    addShield(-1.2, -72, 5.2, 2.4);

    function addBeacon(x: number, z: number) {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.52, 0.22, 8),
        rubber,
      );
      base.position.set(x, 0.11, z);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.27, 1.7, 8),
        coral,
      );
      stem.position.set(x, 0.92, z);
      stem.castShadow = true;
      const lamp = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        warmGlow,
      );
      lamp.position.set(x, 1.82, z);
      world.add(base, stem, lamp);
    }
    for (const [x, z] of [
      [-12.3, 1], [12.3, -5], [-12.3, -19], [12.3, -31],
      [-12.3, -45], [12.3, -61], [-12.3, -76],
    ] as const) addBeacon(x, z);

    for (const side of [-1, 1]) {
      for (let z = 10; z > -92; z -= 6.5) {
        const railPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.09, 1.05, 7),
          steel,
        );
        railPost.position.set(side * 14.45, 0.54, z);
        world.add(railPost);
      }
      roundedBox(
        world,
        [0.15, 0.16, 104],
        [side * 14.45, 1.03, -40],
        steel,
        0.06,
      );
    }

    const distances = [
      ["10 M", 0],
      ["25 M", -15],
      ["50 M", -40],
      ["75 M", -65],
    ] as const;
    for (const [label, z] of distances) {
      const sign = makeLabel(label);
      sign.position.set(-13.25, 3.6, z);
      sign.scale.set(2.7, 0.68, 1);
      world.add(sign);
    }

    const titleSign = makeLabel("BLACKSITE // SEVEN", "#8ce4dc", "rgba(10,19,20,.94)");
    titleSign.scale.set(7.5, 1.85, 1);
    titleSign.position.set(0, 4.9, -92);
    world.add(titleSign);

    const dustPositions = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 32;
      dustPositions[i * 3 + 1] = 0.4 + Math.random() * 6;
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
        color: 0xffe1b7,
        size: 0.045,
        transparent: true,
        opacity: 0.35,
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
    let enemyCharacterTemplate: THREE.Object3D | null = null;
    let enemyCharacterClips: THREE.AnimationClip[] = [];
    let enemyPistolTemplate: THREE.Object3D | null = null;
    let enemyPistolShootClip: THREE.AnimationClip | null = null;
    let enemyAssetsReady = false;

    function updateEnemyAssetState() {
      enemyAssetsReady = Boolean(
        enemyCharacterTemplate &&
          enemyCharacterClips.length &&
          enemyPistolTemplate,
      );
      if (enemyAssetsReady) deployLevelSquad();
    }

    const enemyLoader = new GLTFLoader();
    enemyLoader.load(
      "./models/enemy-punk.glb",
      (gltf) => {
        if (engineDisposed) return;
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.frustumCulled = false;
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        enemyCharacterTemplate = gltf.scene;
        enemyCharacterClips = gltf.animations;
        updateEnemyAssetState();
      },
      undefined,
      () => showFeed("ENEMY MODEL FALLBACK ACTIVE"),
    );
    enemyLoader.load(
      "./models/enemy-glock.glb",
      (gltf) => {
        if (engineDisposed) return;
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.frustumCulled = false;
            object.castShadow = true;
          }
        });
        enemyPistolTemplate = gltf.scene;
        enemyPistolShootClip =
          gltf.animations.find((clip) =>
            clip.name.toLowerCase().includes("shoot"),
          ) ?? null;
        updateEnemyAssetState();
      },
      undefined,
      () => showFeed("PISTOL MODEL FALLBACK ACTIVE"),
    );

    function createTarget(
      x: number,
      z: number,
      motion: TargetState["motion"],
      deploymentDelay = 0,
    ) {
      if (
        enemyAssetsReady &&
        enemyCharacterTemplate &&
        enemyPistolTemplate
      ) {
        const group = new THREE.Group();
        group.position.set(x, -1.8, z);
        group.userData.isAnimatedEnemy = true;
        const character = cloneSkeleton(enemyCharacterTemplate);
        const id = ++targetId;
        let head: THREE.Mesh | null = null;
        let torso: THREE.Mesh | null = null;
        character.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const isHead = object.name.toLowerCase().includes("head");
          object.userData = {
            targetId: id,
            zone: isHead ? "head" : "torso",
          };
          if (isHead && !head) head = object;
          if (object.name.toLowerCase().includes("body") && !torso) {
            torso = object;
          }
        });

        const pistol = enemyPistolTemplate.clone(true);
        pistol.scale.setScalar(0.0003);
        pistol.position.set(0, 0, 0.00042);
        pistol.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.userData = { targetId: id, zone: "torso" };
          }
        });
        const pistolMount = new THREE.Group();
        pistolMount.quaternion.set(
          -0.4689339436,
          0.5354140912,
          0.5489974958,
          0.4382173629,
        );
        pistolMount.position.set(0, 0.00018, 0);
        pistolMount.add(pistol);
        const wrist =
          character.getObjectByName("WristR") ??
          character.getObjectByName("Wrist.R");
        if (wrist) wrist.add(pistolMount);
        else character.add(pistolMount);
        const enemyMuzzle =
          pistol.getObjectByName("barrel_end") ??
          pistol.getObjectByName("barrelEnd") ??
          undefined;

        group.add(character);
        const warning = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.09, 0),
          new THREE.MeshBasicMaterial({
            color: 0xff5b3d,
            transparent: true,
            opacity: 0.9,
          }),
        );
        warning.position.y = 2.18;
        warning.visible = false;
        group.userData.warning = warning;
        group.add(warning);
        targetRoot.add(group);
        const mixer = new THREE.AnimationMixer(group);
        const actions = new Map<string, THREE.AnimationAction>();
        const actionNames = {
          idle: "Idle_Gun_Pointing",
          shoot: "Idle_Gun_Shoot",
          walk: "Walk",
          run: "Run",
          roll: "Roll",
          hit: "HitRecieve",
          hitAlt: "HitRecieve_2",
          death: "Death",
        } as const;
        for (const [key, clipName] of Object.entries(actionNames)) {
          const clip = enemyCharacterClips.find((candidate) =>
            candidate.name.endsWith(`|${clipName}`),
          );
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          if (
            key === "shoot" ||
            key === "roll" ||
            key.startsWith("hit") ||
            key === "death"
          ) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = key === "death";
          }
          actions.set(key, action);
        }
        const pistolAction = enemyPistolShootClip
          ? mixer.clipAction(enemyPistolShootClip, pistol)
          : undefined;
        if (pistolAction) {
          pistolAction.setLoop(THREE.LoopOnce, 1);
          pistolAction.clampWhenFinished = false;
        }
        actions.get("idle")?.play();

        const difficultyConfig = DIFFICULTIES[difficultyRef.current];
        const drill = levelConfig(levelLive);
        const now = gameNow();
        targets.set(id, {
          id,
          group,
          head: head ?? (torso as unknown as THREE.Mesh),
          torso: torso ?? (head as unknown as THREE.Mesh),
          hp: 100,
          bornAt: now,
          lifetime: drill.targetLife * difficultyConfig.lifeScale,
          phase: 0,
          motion,
          baseX: x,
          baseY: 0,
          baseZ: z,
          speed:
            (drill.moveSpeed + Math.random() * 0.16) *
            difficultyConfig.speedScale,
          range: motion === "dash" ? 2.5 : motion === "strafe" ? 1.8 : 1,
          dead: false,
          mixer,
          actions,
          activeAction: "idle",
          muzzle: enemyMuzzle,
          pistolAction,
          nextShotAt:
            now +
            drill.firstShot *
              enemyFireScale(difficultyRef.current) *
              (ghostActive ? 1.35 : 1) +
            deploymentDelay +
            Math.random() * 320,
          nextRollAt:
            levelLive >= 4
              ? now + 2300 + Math.random() * 2100
              : undefined,
          lastMoveDirection: 0,
          nextThinkAt: now + 500 + deploymentDelay,
          hasLineOfSight: true,
          flankDirection: id % 2 === 0 ? 1 : -1,
        });
        return;
      }

      const group = new THREE.Group();
      group.position.set(x, -1.8, z);
      const standMat = new THREE.MeshStandardMaterial({
        color: 0x26383d,
        roughness: 0.48,
        metalness: 0.66,
      });
      const targetMat = new THREE.MeshStandardMaterial({
        color: 0xe2573e,
        roughness: 0.52,
        metalness: 0.18,
        emissive: 0x36100a,
        emissiveIntensity: 0.7,
      });
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.72, 0.2, 8),
        standMat,
      );
      base.position.y = 0.1;
      base.castShadow = true;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 1.15, 8),
        standMat,
      );
      pole.position.y = 0.72;
      pole.castShadow = true;
      const shoulder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.56, 0.46, 0.28, 8),
        standMat,
      );
      shoulder.position.y = 1.42;
      shoulder.rotation.z = Math.PI / 2;
      shoulder.scale.y = 1.8;
      shoulder.castShadow = true;
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.57, 0.92, 8),
        targetMat.clone(),
      );
      torso.position.set(0, 1.62, 0);
      torso.castShadow = true;
      const head = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.3, 0),
        targetMat.clone(),
      );
      head.position.set(0, 2.37, 0);
      head.castShadow = true;
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.13, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe3c1 }),
      );
      face.position.set(0, 2.37, 0.275);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.19, 0.25, 16),
        new THREE.MeshBasicMaterial({
          color: 0x182326,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.set(0, 1.66, 0.445);
      const core = new THREE.Mesh(
        new THREE.CircleGeometry(0.105, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe3c1 }),
      );
      core.position.set(0, 1.66, 0.452);
      const armorLeft = roundedBox(
        group,
        [0.22, 0.52, 0.16],
        [-0.49, 1.58, 0],
        standMat,
        0.08,
        true,
      );
      const armorRight = roundedBox(
        group,
        [0.22, 0.52, 0.16],
        [0.49, 1.58, 0],
        standMat,
        0.08,
        true,
      );
      armorLeft.rotation.z = -0.18;
      armorRight.rotation.z = 0.18;
      const spawnRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.55, 20),
        new THREE.MeshBasicMaterial({
          color: 0x8ce4dc,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      spawnRing.rotation.x = -Math.PI / 2;
      spawnRing.position.y = 0.035;
      group.userData.spawnRing = spawnRing;
      group.add(base, pole, shoulder, torso, head, face, ring, core, spawnRing);
      const id = ++targetId;
      torso.userData = { targetId: id, zone: "torso" };
      shoulder.userData = { targetId: id, zone: "torso" };
      armorLeft.userData = { targetId: id, zone: "torso" };
      armorRight.userData = { targetId: id, zone: "torso" };
      head.userData = { targetId: id, zone: "head" };
      face.userData = { targetId: id, zone: "head" };
      ring.userData = { targetId: id, zone: "bullseye" };
      core.userData = { targetId: id, zone: "bullseye" };
      targetRoot.add(group);
      const difficultyConfig = DIFFICULTIES[difficultyRef.current];
      const drill = levelConfig(levelLive);
      const target: TargetState = {
        id,
        group,
        head,
        torso,
        hp: 100,
        bornAt: gameNow(),
        lifetime: drill.targetLife * difficultyConfig.lifeScale,
        phase: 0,
        motion,
        baseX: x,
        baseY: 0,
        baseZ: z,
        speed:
          (drill.moveSpeed + Math.random() * 0.16) *
          difficultyConfig.speedScale,
        range: motion === "dash" ? 2.25 : motion === "strafe" ? 1.6 : 0.8,
        dead: false,
      };
      targets.set(id, target);
    }

    function setEnemyLocomotion(target: TargetState, key: string) {
      if (!target.actions || target.activeAction === key || target.dead) return;
      const next = target.actions.get(key) ?? target.actions.get("idle");
      if (!next) return;
      const current = target.activeAction
        ? target.actions.get(target.activeAction)
        : undefined;
      current?.fadeOut(0.14);
      next.reset().fadeIn(0.14).play();
      target.activeAction = key;
    }

    function playEnemyOneShot(target: TargetState, key: string) {
      const action = target.actions?.get(key);
      if (!action || target.dead) return;
      if (key === "roll") {
        const current = target.activeAction
          ? target.actions?.get(target.activeAction)
          : undefined;
        current?.fadeOut(0.08);
        target.activeAction = "roll";
      }
      action.stop();
      action.reset().setEffectiveWeight(1).fadeIn(0.045).play();
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
      muzzleLight = new THREE.PointLight(0xff8f32, 0, 3.5);
      muzzleLight.position.copy(muzzle.position);
      weaponRoot.add(muzzleFlash, muzzleLight);
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
        roughness: 0.4,
        metalness: 0.76,
      });
      const accent = new THREE.MeshStandardMaterial({
        color: w.color,
        roughness: 0.62,
        metalness: 0.28,
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

    new GLTFLoader().load(
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
            object.frustumCulled = false;
            object.castShadow = false;
            object.receiveShadow = false;
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
          importedIdleAction = importedWeaponMixer.clipAction(idleClip);
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
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xd9aa49,
      roughness: 0.35,
      metalness: 0.9,
    });
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc167 });
    const audio = new AudioContext();
    const masterAudioGain = audio.createGain();
    masterAudioGain.gain.value = youtubePlayables.isAudioEnabled ? 1 : 0;
    masterAudioGain.connect(audio.destination);
    let noiseBuffer: AudioBuffer | null = null;
    let audioInitialized = false;
    let effectiveAudioEnabled = youtubePlayables.isAudioEnabled;

    function setYouTubeAudioEnabled(enabled: boolean) {
      effectiveAudioEnabled = enabled;
      const targetGain = enabled ? 1 : 0;
      masterAudioGain.gain.cancelScheduledValues(audio.currentTime);
      masterAudioGain.gain.setValueAtTime(targetGain, audio.currentTime);
      if (!enabled) {
        if (audio.state === "running") void audio.suspend();
      } else if (audioInitialized && audio.state === "suspended") {
        void audio.resume();
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
    }

    function shotAudio(index: number) {
      if (!effectiveAudioEnabled || youtubePlayables.isPaused) return;
      initAudio();
      const t = audio.currentTime;
      const noise = audio.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = index === 1 ? 1350 : index === 2 ? 720 : 980;
      filter.Q.value = 0.75;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.42, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      noise.connect(filter).connect(gain).connect(masterAudioGain);
      noise.start(t);
      const thump = audio.createOscillator();
      const thumpGain = audio.createGain();
      thump.type = "triangle";
      thump.frequency.setValueAtTime(index === 2 ? 92 : 122, t);
      thump.frequency.exponentialRampToValueAtTime(48, t + 0.075);
      thumpGain.gain.setValueAtTime(0.28, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      thump.connect(thumpGain).connect(masterAudioGain);
      thump.start(t);
      thump.stop(t + 0.1);
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
    let aimingLive = false;
    let adsBlend = 0;
    let reloadingLive = false;
    let reloadStarted = 0;
    let reloadToken = 0;
    let walkPhase = 0;
    let recoil = 0;
    let weaponKick = 0;
    let yaw = 0;
    let pitch = -0.015;
    let mobileAdvanceRequested = false;
    let mobilePathSide = 1;
    let pointerLockUnavailable = false;
    let drillTransitionToken = 0;
    let perkSelectionPending = false;
    let ghostActive = false;
    const perkCounts: Record<PerkKey, number> = {
      ammo: 0,
      ghost: 0,
      heal: 0,
    };

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
            ? "GHOST ACTIVE"
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
      aimingLive = false;
      setAiming(false);
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
        showFeed(`${drill.title} // HOSTILES DEPLOYED`);
        deployLevelSquad();
        const deploymentLevel = levelLive;
        gameTimeout(() => {
          if (
            running &&
            !squadDeployed &&
            levelLive === deploymentLevel
          ) {
            deployLevelSquad(true);
          }
        }, 2200);
        tryPointerLock();
      }, 1550);
    }

    function showPerkSelection() {
      perkSelectionPending = true;
      mobileAdvanceRequested = false;
      running = false;
      firing = false;
      aimingLive = false;
      setAiming(false);
      setInterfaceLocked(true);
      element("drill-announcement").hidden = true;
      element("perk-eyebrow").textContent =
        `DRILL ${String(levelLive).padStart(2, "0")} SECURED`;
      element<HTMLElement>("perk-screen").hidden = false;
      document.exitPointerLock?.();
      showFeed("DRILL COMPLETE // CHOOSE PERK");
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
      if (isMobile) {
        camera.position.set(0, 1.72, 12);
        yaw = 0;
        pitch = -0.015;
        mobileAdvanceRequested = false;
        mobilePathSide = levelLive % 2 === 0 ? -1 : 1;
      }
      tone(560, 0.11, 0.08);
      gameTimeout(() => tone(860, 0.16, 0.075), 105);
      showFeed(
        `${PERKS[perk].label} // ${
          unlocked > previousUnlocked ? "WEAPON UNLOCKED" : "EQUIPPED"
        }`,
      );
      announceDrillStart();
    }

    function burst(position: THREE.Vector3, hit = false) {
      const count = hit ? 11 : 5;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.025 + Math.random() * 0.025, 0),
          sparkMat,
        );
        mesh.position.copy(position);
        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2.6,
          Math.random() * 2.2,
          (Math.random() - 0.5) * 2.6,
        );
        scene.add(mesh);
        particles.push({ mesh, velocity, life: 0.28 + Math.random() * 0.2 });
      }
      if (hit) {
        const wave = new THREE.Mesh(
          new THREE.RingGeometry(0.08, 0.115, 16),
          new THREE.MeshBasicMaterial({
            color: 0xffe1b7,
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

    function enemyShotOrigin(target: TargetState) {
      const start = new THREE.Vector3();
      if (target.muzzle) target.muzzle.getWorldPosition(start);
      else start.copy(target.group.position).add(new THREE.Vector3(0, 1.35, 0));
      return start;
    }

    function firstShotBlocker(start: THREE.Vector3, end: THREE.Vector3) {
      const shotVector = end.clone().sub(start);
      const shotDistance = shotVector.length();
      if (shotDistance <= 0.05) return undefined;
      const coverRay = new THREE.Raycaster(
        start,
        shotVector.normalize(),
        0.05,
        shotDistance,
      );
      return coverRay
        .intersectObjects(shotBlockers, false)
        .find(
          (intersection) => intersection.distance < shotDistance - 0.2,
        );
    }

    function enemyHasLineOfSight(target: TargetState) {
      const end = camera.position.clone();
      end.y -= 0.12;
      return !firstShotBlocker(enemyShotOrigin(target), end);
    }

    function enemyShoot(target: TargetState, playerMoving: number) {
      if (!running || target.dead) return;
      const drill = levelConfig(levelLive);
      const activeDifficulty = difficultyRef.current;
      const start = enemyShotOrigin(target);
      const end = camera.position.clone();
      end.y -= 0.12;
      const hitChance =
        THREE.MathUtils.clamp(
          drill.enemyAccuracy +
            enemyAccuracyAdjustment(activeDifficulty) -
            playerMoving * 0.18 -
            (ghostActive ? 0.22 : 0),
          0.12,
          0.72,
        );
      let hitPlayer = Math.random() < hitChance;
      if (!hitPlayer) {
        end.x += (Math.random() - 0.5) * 2.8;
        end.y += (Math.random() - 0.5) * 1.6;
      }
      const coverHit = firstShotBlocker(start, end);
      if (coverHit) {
        end.copy(coverHit.point);
        hitPlayer = false;
        burst(end, false);
      }
      const tracer = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start, end]),
        new THREE.LineBasicMaterial({
          color: 0xff5d3d,
          transparent: true,
          opacity: 0.94,
        }),
      );
      scene.add(tracer);
      tracers.push({ line: tracer, life: 0.11 });
      burst(start, false);
      playEnemyOneShot(target, "shoot");
      target.pistolAction?.stop();
      target.pistolAction?.reset().play();
      tone(210, 0.07, 0.045);

      if (!hitPlayer) {
        showFeed(coverHit ? "COVER BLOCK" : "INCOMING FIRE");
        return;
      }
      const damage = Math.round(
        drill.enemyDamage * enemyDamageScale(activeDifficulty),
      );
      playerHealthLive = Math.max(0, playerHealthLive - damage);
      setHealth(playerHealthLive);
      setPlayerHitFlash((value) => value + 1);
      showFeed(`HIT  -${damage} HP`);
      tone(92, 0.16, 0.095);
      if (hapticsRef.current && navigator.vibrate) navigator.vibrate([28, 20, 38]);
      if (playerHealthLive <= 0) {
        running = false;
        firing = false;
        aimingLive = false;
        setAiming(false);
        setGameOver(true);
        document.exitPointerLock?.();
        showFeed("OPERATOR DOWN");
      }
    }

    function ejectShell() {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.085, 7),
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
      mobileAdvanceRequested = false;
      mobilePathSide = 1;
      setMobileAutoMoving(false);
      aimingLive = false;
      reloadingLive = false;
      reloadToken++;
      setAiming(false);
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
      camera.position.set(0, 1.72, 12);
      yaw = 0;
      pitch = -0.015;
      buildWeapon(0);
      squadDeployed = false;
      running = false;
      element<HTMLElement>("perk-screen").hidden = true;
      element<HTMLElement>("drill-announcement").hidden = true;
      renderPerkStatus();
      showFeed("BLACKSITE LIVE");
      initAudio();
      announceDrillStart();
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
      aimingLive = false;
      setAiming(false);
      setReloading(true);
      showFeed("RELOADING");
      if (
        currentWeapon === 0 &&
        importedWeaponReady &&
        importedReloadAction
      ) {
        importedShootAction?.stop();
        importedIdleAction?.fadeOut(0.06);
        importedReloadAction.reset().fadeIn(0.06).play();
      }
      const reloadSound = (progress: number, frequency: number, volume: number) => {
        gameTimeout(() => {
          if (token === reloadToken && reloadingLive) {
            tone(frequency, 0.045, volume);
          }
        }, weapon.reloadMs * progress);
      };
      reloadSound(0.12, 165, 0.045);
      reloadSound(0.31, 125, 0.055);
      reloadSound(0.48, 205, 0.04);
      reloadSound(0.69, 340, 0.065);
      reloadSound(0.87, 475, 0.07);
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
        tone(560, 0.055, 0.045);
      }, weapon.reloadMs);
    }

    function levelUp() {
      if (levelLive >= LEVELS.length) {
        running = false;
        firing = false;
        aimingLive = false;
        setAiming(false);
        setInterfaceLocked(true);
        setObjective("BLACKSITE CLEARED");
        setGameOver(true);
        document.exitPointerLock?.();
        tone(660, 0.18, 0.12);
        gameTimeout(() => tone(880, 0.2, 0.1), 115);
        gameTimeout(() => tone(1180, 0.28, 0.09), 235);
        showFeed("BLACKSITE CLEARED");
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
      setHitPulse((v) => v + 1);
      tone(zone === "head" ? 1040 : 760, 0.045, 0.055);
      burst(hit.point, true);
      const material = hit.object instanceof THREE.Mesh ? hit.object.material : null;
      const hitMaterials = Array.isArray(material) ? material : material ? [material] : [];
      for (const hitMaterial of hitMaterials) {
        if (!(hitMaterial instanceof THREE.MeshStandardMaterial)) continue;
        const previous = hitMaterial.emissive.getHex();
        hitMaterial.emissive.setHex(0xff6a45);
        gameTimeout(() => hitMaterial.emissive.setHex(previous), 70);
      }
      if (target.hp <= 0) {
        const killTime = gameNow();
        target.dead = true;
        target.group.userData.fall = 0;
        if (target.actions) {
          for (const action of target.actions.values()) action.fadeOut(0.08);
          const death = target.actions.get("death");
          death?.reset().setEffectiveWeight(1).fadeIn(0.08).play();
          target.activeAction = "death";
        }
        streakLive++;
        levelKills++;
        if (isMobile) mobileAdvanceRequested = true;
        comboLive =
          lastKillAt > 0 && killTime - lastKillAt < 1650
            ? Math.min(5, comboLive + 1)
            : 1;
        lastKillAt = killTime;
        const comboMultiplier = 1 + (comboLive - 1) * 0.25;
        const movementMultiplier =
          target.motion === "dash"
            ? 1.35
            : target.motion === "hover"
              ? 1.2
              : target.motion === "strafe"
                ? 1.1
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
        showFeed(
          `${zone === "head" ? "HEADSHOT" : zone === "bullseye" ? "CORE HIT" : "TARGET DOWN"}  +${points}${
            precisionTime ? "  +TIME" : ""
          }${comboLive > 1 ? `  x${comboMultiplier.toFixed(2)}` : ""}`,
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
        playEnemyOneShot(
          target,
          Math.random() > 0.5 ? "hit" : "hitAlt",
        );
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
          .setEffectiveWeight(aimingLive ? 0.42 : 1)
          .play();
      }
      shotAudio(currentWeapon);
      weaponKick = 1;
      recoil = Math.min(recoil + weapon.recoil * (0.78 + Math.random() * 0.42), 0.16);
      yaw +=
        (Math.random() - 0.5) *
        weapon.recoil *
        0.38 *
        (aimingLive ? 0.08 : 1);
      if (muzzleFlash && muzzleLight) {
        (muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;
        muzzleFlash.scale.setScalar(0.85 + Math.random() * 0.8);
        muzzleFlash.rotation.z = Math.random() * Math.PI;
        muzzleLight.intensity = 5;
      }
      ejectShell();
      const spread =
        weapon.spread *
        (aimingLive ? 0.02 : 0.55);
      aim.set(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
      );
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

    function deployLevelSquad(forceFallback = false) {
      if (!running || squadDeployed) return;
      if (!enemyAssetsReady && !forceFallback) return;
      const encounter =
        LEVEL_ENCOUNTERS[
          Math.min(Math.max(levelLive - 1, 0), LEVEL_ENCOUNTERS.length - 1)
        ];
      squadDeployed = true;
      encounter.forEach((slot, index) => {
        createTarget(slot.x, slot.z, slot.motion, index * 115);
      });
      setObjective(levelObjective(levelLive));
      showFeed(`${levelConfig(levelLive).title} // HOSTILES DEPLOYED`);
    }

    function canEnemyMoveTo(x: number, z: number, movingTarget?: TargetState) {
      return (
        x > -13.7 &&
        x < 13.7 &&
        z > -88 &&
        z < 10.5 &&
        !obstacleBoxes.some(
          (obstacle) =>
            Math.abs(x - obstacle.x) < obstacle.halfW + 0.42 &&
            Math.abs(z - obstacle.z) < obstacle.halfD + 0.42,
        ) &&
        !Array.from(targets.values()).some(
          (other) =>
            other !== movingTarget &&
            !other.dead &&
            Math.hypot(x - other.baseX, z - other.baseZ) < 0.78,
        )
      );
    }

    function advanceEnemyTowardPlayer(
      target: TargetState,
      speed: number,
      dt: number,
    ) {
      const toPlayerX = camera.position.x - target.baseX;
      const toPlayerZ = camera.position.z - target.baseZ;
      const distanceToPlayer = Math.max(0.001, Math.hypot(toPlayerX, toPlayerZ));
      if (distanceToPlayer <= 3.8) {
        return { moved: false, directionX: 0, directionZ: 0, arrived: true };
      }

      const desiredAngle = Math.atan2(toPlayerX, toPlayerZ);
      const flank = target.flankDirection ?? 1;
      const angleOffsets = [
        0,
        flank * 0.38,
        flank * -0.38,
        flank * 0.76,
        flank * -0.76,
        flank * 1.12,
        flank * -1.12,
      ];
      const step = Math.min(
        speed * DIFFICULTIES[difficultyRef.current].speedScale * dt,
        Math.max(0, distanceToPlayer - 3.8),
      );

      for (const offset of angleOffsets) {
        const angle = desiredAngle + offset;
        const directionX = Math.sin(angle);
        const directionZ = Math.cos(angle);
        const nextX = target.baseX + directionX * step;
        const nextZ = target.baseZ + directionZ * step;
        if (!canEnemyMoveTo(nextX, nextZ, target)) continue;
        target.baseX = nextX;
        target.baseZ = nextZ;
        if (offset !== 0) target.flankDirection = Math.sign(offset) || flank;
        return {
          moved: true,
          directionX,
          directionZ,
          arrived: false,
        };
      }

      target.flankDirection = -flank;
      return { moved: false, directionX: 0, directionZ: 0, arrived: false };
    }

    function canPlayerMoveTo(x: number, z: number) {
      return (
        x > -14.1 &&
        x < 14.1 &&
        z > -88.5 &&
        z < 12.9 &&
        !obstacleBoxes.some(
          (obstacle) =>
            Math.abs(x - obstacle.x) < obstacle.halfW &&
            Math.abs(z - obstacle.z) < obstacle.halfD,
        )
      );
    }

    function advanceMobilePlayer(dt: number) {
      if (!isMobile || !running || !mobileAdvanceRequested) {
        setMobileAutoMoving(false);
        return false;
      }

      const livingTargets = Array.from(targets.values()).filter(
        (target) =>
          !target.dead &&
          gameNow() - target.bornAt >= 420,
      );
      if (livingTargets.length === 0) {
        mobileAdvanceRequested = false;
        setMobileAutoMoving(false);
        return false;
      }

      let nearest = livingTargets[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const target of livingTargets) {
        const distance = Math.hypot(
          target.group.position.x - camera.position.x,
          target.group.position.z - camera.position.z,
        );
        if (distance < nearestDistance) {
          nearest = target;
          nearestDistance = distance;
        }
      }

      const engagementDistance = 16.5;
      const forwardDistance = nearest.group.position.z - camera.position.z;
      if (nearestDistance <= engagementDistance || forwardDistance > -2) {
        mobileAdvanceRequested = false;
        setMobileAutoMoving(false);
        return false;
      }

      const laneX = THREE.MathUtils.clamp(
        nearest.group.position.x * 0.28,
        -4.2,
        4.2,
      );
      const toLaneX = laneX - camera.position.x;
      const toEnemyZ = nearest.group.position.z - camera.position.z;
      const desiredAngle = Math.atan2(toLaneX, toEnemyZ);
      const offsets = [
        0,
        mobilePathSide * 0.42,
        mobilePathSide * -0.42,
        mobilePathSide * 0.82,
        mobilePathSide * -0.82,
      ];
      const step = Math.min(
        (3.55 + levelLive * 0.16) * dt,
        Math.max(0, nearestDistance - engagementDistance),
      );

      for (const offset of offsets) {
        const angle = desiredAngle + offset;
        const directionX = Math.sin(angle);
        const directionZ = Math.cos(angle);
        if (directionZ > -0.08) continue;
        const nextX = camera.position.x + directionX * step;
        const nextZ = camera.position.z + directionZ * step;
        if (!canPlayerMoveTo(nextX, nextZ)) continue;
        camera.position.x = nextX;
        camera.position.z = nextZ;
        if (offset !== 0) mobilePathSide = Math.sign(offset) || mobilePathSide;
        setMobileAutoMoving(true);
        return true;
      }

      mobilePathSide *= -1;
      setMobileAutoMoving(false);
      return false;
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
      if (event.button === 2) {
        aimingLive = true;
        setAiming(true);
        return;
      }
      if (event.button !== 0) return;
      firing = true;
      shoot();
      if (!WEAPONS[currentWeapon].auto) firing = false;
    }

    function onMouseUp(event: MouseEvent) {
      if (youtubePaused) return;
      if (event.button === 2) {
        aimingLive = false;
        setAiming(false);
      }
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
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", onResize);

    let frame: number | null = null;

    engineRef.current = {
      start: resetGame,
      reload,
      setFiring(value) {
        if (youtubePaused) return;
        firing = value;
        if (value) shoot();
      },
      setAiming(value) {
        if (youtubePaused) return;
        aimingLive = value;
        setAiming(value);
      },
      aimDelta(dx, dy) {
        if (youtubePaused || !running) return;
        yaw -= dx * 0.0041;
        pitch -= dy * 0.0038;
        pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.62);
      },
      switchWeapon,
      choosePerk,
      pauseFromYouTube() {
        firing = false;
        aimingLive = false;
        keys.clear();
        setAiming(false);
        setMobileAutoMoving(false);
        navigator.vibrate?.(0);
        document.exitPointerLock?.();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        clock.stop();
        setYouTubeAudioEnabled(false);
      },
      resumeFromYouTube() {
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
      const dt = Math.min(clock.getDelta(), 0.04);
      const elapsed = gameNow();
      importedWeaponMixer?.update(dt);

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
            aimingLive = false;
            setAiming(false);
            setGameOver(true);
            document.exitPointerLock?.();
            showFeed("SESSION COMPLETE");
          }
        }
      }

      const forward =
        (keys.has("KeyW") ? 1 : 0) -
        (keys.has("KeyS") ? 1 : 0);
      const strafe =
        (keys.has("KeyD") ? 1 : 0) -
        (keys.has("KeyA") ? 1 : 0);
      let playerMoveMagnitude = 0;
      if (running) {
        if (isMobile) {
          playerMoveMagnitude = advanceMobilePlayer(dt) ? 1 : 0;
        } else {
          playerMoveMagnitude = Math.min(1, Math.hypot(strafe, forward));
          const magnitude = playerMoveMagnitude;
          const normalizedStrafe = magnitude
            ? strafe / Math.max(1, Math.hypot(strafe, forward))
            : 0;
          const normalizedForward = magnitude
            ? forward / Math.max(1, Math.hypot(strafe, forward))
            : 0;
          const moveSpeed = aimingLive ? 3.2 : 5.25;
          const moveX =
            (Math.cos(yaw) * normalizedStrafe -
              Math.sin(yaw) * normalizedForward) *
            dt *
            moveSpeed;
          const moveZ =
            (-Math.sin(yaw) * normalizedStrafe -
              Math.cos(yaw) * normalizedForward) *
            dt *
            moveSpeed;
          if (canPlayerMoveTo(camera.position.x + moveX, camera.position.z)) {
            camera.position.x += moveX;
          }
          if (canPlayerMoveTo(camera.position.x, camera.position.z + moveZ)) {
            camera.position.z += moveZ;
          }
        }
        const magnitude = playerMoveMagnitude;
        if (magnitude > 0.05) walkPhase += dt * (aimingLive ? 7 : 10);
        camera.position.y = 1.72 + Math.sin(walkPhase) * 0.028 * magnitude;
      }

      recoil = THREE.MathUtils.lerp(recoil, 0, 1 - Math.pow(0.0001, dt));
      camera.rotation.y = yaw;
      camera.rotation.x = pitch + recoil;
      adsBlend = THREE.MathUtils.lerp(
        adsBlend,
        aimingLive && !reloadingLive ? 1 : 0,
        1 - Math.pow(0.000003, dt),
      );
      const targetFov = aimingLive ? (currentWeapon === 2 ? 47 : 55) : 68;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.00002, dt));
      camera.updateProjectionMatrix();
      weaponKick = THREE.MathUtils.lerp(weaponKick, 0, 1 - Math.pow(0.00004, dt));
      const importedAkActive = currentWeapon === 0 && importedWeaponReady;
      const hipWeaponX = importedAkActive ? 0.44 : 0.32;
      const hipWeaponY = importedAkActive ? -0.52 : -0.3;
      const hipWeaponZ = importedAkActive ? -1.72 : -1.48;
      const adsWeaponY = importedAkActive
        ? -0.29
        : currentWeapon === 2
          ? -0.39 * weaponVisualScale
          : -0.405 * weaponVisualScale;
      const adsWeaponZ = importedAkActive ? -1.86 : -1.6;
      weaponRoot.position.x = THREE.MathUtils.lerp(hipWeaponX, 0, adsBlend);
      weaponRoot.position.z =
        THREE.MathUtils.lerp(hipWeaponZ, adsWeaponZ, adsBlend) +
        weaponKick * 0.045;
      weaponRoot.position.y =
        THREE.MathUtils.lerp(hipWeaponY, adsWeaponY, adsBlend) -
        weaponKick * 0.02 +
        Math.sin(walkPhase) * 0.006 * (1 - adsBlend);
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
        weaponRoot.rotation.x = pose * 0.12;
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
          Math.sin(walkPhase * 0.5) * 0.012 * (1 - adsBlend);
        weaponRoot.rotation.x = 0;
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

      if (muzzleFlash && muzzleLight) {
        const mat = muzzleFlash.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - dt * 28);
        muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 90);
      }

      for (const target of targets.values()) {
        const age = elapsed - target.bornAt;
        target.mixer?.update(dt);
        if (!target.dead) {
          const spawnProgress = THREE.MathUtils.clamp(age / 420, 0, 1);
          const spawnEase = 1 - Math.pow(1 - spawnProgress, 3);
          const spawnRing = target.group.userData.spawnRing as THREE.Mesh;
          if (spawnRing) {
            const ringMaterial = spawnRing.material as THREE.MeshBasicMaterial;
            spawnRing.scale.setScalar(0.65 + spawnEase * 1.45);
            ringMaterial.opacity =
              spawnProgress < 1
                ? (1 - spawnProgress) * 0.72
                : 0.08 + Math.sin(age * 0.006) * 0.025;
          }
          const drill = levelConfig(levelLive);
          if (
            target.mixer &&
            running &&
            spawnProgress >= 1 &&
            target.nextThinkAt &&
            elapsed >= target.nextThinkAt
          ) {
            const hasLineOfSight = enemyHasLineOfSight(target);
            target.hasLineOfSight = hasLineOfSight;
            if (hasLineOfSight) {
              target.blockedSince = undefined;
              if (
                target.advancing &&
                elapsed >= (target.advanceMinUntil ?? 0)
              ) {
                target.advancing = false;
              }
            } else {
              target.blockedSince ??= elapsed;
              const distanceToPlayer = Math.hypot(
                camera.position.x - target.baseX,
                camera.position.z - target.baseZ,
              );
              if (
                elapsed - target.blockedSince >= drill.advanceDelay &&
                distanceToPlayer > 4.5
              ) {
                target.advancing = true;
                target.advanceMinUntil = elapsed + 900;
              }
            }
            target.nextThinkAt =
              elapsed + Math.max(150, 360 - levelLive * 40);
          }

          const motionTime = age * 0.001 * target.speed + target.phase;
          target.group.position.y = target.baseY - (1 - spawnEase) * 1.8;
          target.group.position.z = target.baseZ;
          target.group.rotation.y = 0;
          target.group.rotation.z = 0;
          let movementDirection = 0;
          let advancedThisFrame = false;
          if (target.advancing) {
            const advance = advanceEnemyTowardPlayer(
              target,
              drill.advanceSpeed,
              dt,
            );
            if (advance.arrived) {
              target.advancing = false;
            }
            advancedThisFrame = advance.moved;
            movementDirection = Math.sign(advance.directionX);
            target.group.position.x = target.baseX;
            target.group.position.z = target.baseZ;
          } else if (target.motion === "strafe") {
            const travel = Math.sin(motionTime * 1.7);
            target.group.position.x = target.baseX + travel * target.range;
            target.group.rotation.z = -Math.cos(motionTime * 1.7) * 0.045;
            movementDirection = Math.sign(Math.cos(motionTime * 1.7));
          } else if (target.motion === "hover") {
            target.group.position.x =
              target.baseX + Math.sin(motionTime * 1.55) * target.range;
            if (!target.mixer) {
              target.group.position.y += Math.sin(motionTime * 3.1) * 0.16;
            }
            target.group.position.z =
              target.baseZ + Math.cos(motionTime * 1.55) * 0.38;
            movementDirection = Math.sign(Math.cos(motionTime * 1.55));
          } else if (target.motion === "dash") {
            const dash = Math.tanh(Math.sin(motionTime * 1.25) * 2.4);
            target.group.position.x = target.baseX + dash * target.range;
            target.group.rotation.z =
              -Math.cos(motionTime * 1.25) * (1 - Math.abs(dash)) * 0.12;
            movementDirection = Math.sign(Math.cos(motionTime * 1.25));
          } else {
            target.group.position.x = target.baseX;
          }
          if (target.mixer) {
            target.group.rotation.z = 0;
            target.group.rotation.y = Math.atan2(
              camera.position.x - target.group.position.x,
              camera.position.z - target.group.position.z,
            );
            const isRolling =
              target.rollingUntil !== undefined &&
              elapsed < target.rollingUntil;
            if (target.advancing && advancedThisFrame) {
              setEnemyLocomotion(target, "run");
            } else if (!isRolling) {
              setEnemyLocomotion(
                target,
                target.motion === "pop" ? "idle" : "walk",
              );
            }
            if (
              levelLive >= 4 &&
              target.motion !== "pop" &&
              target.actions?.has("roll") &&
              target.nextRollAt &&
              elapsed >= target.nextRollAt &&
              !isRolling &&
              !target.advancing
            ) {
              target.rollingUntil = elapsed + 1120;
              target.nextRollAt = elapsed + 3100 + Math.random() * 2100;
              playEnemyOneShot(target, "roll");
            }
            target.lastMoveDirection = movementDirection;
            const warning = target.group.userData.warning as
              | THREE.Mesh
              | undefined;
            if (warning && target.nextShotAt) {
              const timeToShot = target.nextShotAt - elapsed;
              warning.visible =
                running &&
                target.hasLineOfSight !== false &&
                !target.advancing &&
                timeToShot > 0 &&
                timeToShot < 480;
              if (warning.visible) {
                warning.scale.setScalar(
                  0.75 + Math.sin(elapsed * 0.035) * 0.28,
                );
              }
            }
            if (
              running &&
              spawnProgress >= 1 &&
              target.nextShotAt &&
              elapsed >= target.nextShotAt
            ) {
              if (
                !target.advancing &&
                (levelLive === 1 || target.hasLineOfSight !== false)
              ) {
                enemyShoot(target, playerMoveMagnitude);
                target.nextShotAt =
                  elapsed +
                  drill.fireDelay *
                    enemyFireScale(difficultyRef.current) *
                    (ghostActive ? 1.3 : 1) +
                  Math.random() * 520;
              } else {
                target.nextShotAt = elapsed + 180;
              }
            }
          }
        } else {
          if (target.mixer) {
            target.group.userData.fall =
              (target.group.userData.fall || 0) + dt;
            if (target.group.userData.fall >= 1.18) {
              targetRoot.remove(target.group);
              targets.delete(target.id);
            }
            continue;
          }
          target.group.userData.fall = Math.min(
            1.65,
            (target.group.userData.fall || 0) + dt * 5.2,
          );
          target.group.rotation.x = target.group.userData.fall;
          if (target.group.userData.fall >= 1.55) {
            targetRoot.remove(target.group);
            targets.delete(target.id);
          }
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
          particle.mesh.geometry.dispose();
          particles.splice(i, 1);
        }
      }

      dust.rotation.y += dt * 0.0015;
      renderer.render(scene, camera);
      youtubePlayables.signalFirstFrameReady();
      youtubePlayables.signalGameReady();
      document.documentElement.dataset.gameReady = "true";
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
      youtubePlayables.destroy();
      renderer.dispose();
      void audio.close();
    });

  function begin() {
    if (youtubePaused) return;
    setStarted(true);
    engineRef.current?.start();
  }

  function onLookStart(event: PointerEvent) {
    if (youtubePaused || !event.isPrimary || lookPointer.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    lookPointer.current = event.pointerId;
    lookLast.current = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    engineRef.current?.setFiring(true);
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
  });

  const touchLayer = element<HTMLDivElement>("touch-layer");
  touchLayer.addEventListener("pointerdown", onLookStart);
  touchLayer.addEventListener("pointermove", onLookMove);
  touchLayer.addEventListener("pointerup", onLookEnd);
  touchLayer.addEventListener("pointercancel", onLookEnd);
  touchLayer.addEventListener("lostpointercapture", onLookEnd);

  updateWeaponRail();
  setFeed(feed);
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
