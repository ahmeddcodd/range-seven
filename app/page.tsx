"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

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

type TargetState = {
  id: number;
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  hp: number;
  bornAt: number;
  lifetime: number;
  phase: number;
  moving: boolean;
  baseX: number;
  dead: boolean;
};

const WEAPONS: Weapon[] = [
  {
    name: "RAVEN A2",
    code: "AR",
    ammo: 30,
    reserve: 120,
    rpm: 690,
    recoil: 0.026,
    spread: 0.0026,
    damage: 42,
    auto: true,
    reloadMs: 1280,
    color: 0xb78b50,
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
    color: 0x456c73,
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
    color: 0x72554a,
  },
];

const LEVEL_GOALS = [6, 9, 12, 16, 20];

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

export default function Home() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<{
    start: () => void;
    reload: () => void;
    setFiring: (value: boolean) => void;
    setAiming: (value: boolean) => void;
    aimDelta: (dx: number, dy: number) => void;
    moveInput: (x: number, y: number) => void;
    switchWeapon: (index: number) => void;
  } | null>(null);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [ammo, setAmmo] = useState({ mag: 30, reserve: 120 });
  const [weaponIndex, setWeaponIndex] = useState(0);
  const [time, setTime] = useState(45);
  const [objective, setObjective] = useState("6 TARGETS");
  const [feed, setFeed] = useState("STANDBY");
  const [hitPulse, setHitPulse] = useState(0);
  const [damageFlash, setDamageFlash] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [aiming, setAiming] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joyPointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const feedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeed = useCallback((message: string) => {
    setFeed(message);
    if (feedTimer.current) clearTimeout(feedTimer.current);
    feedTimer.current = setTimeout(() => setFeed(""), 850);
  }, []);

  useEffect(() => {
    setIsMobile(matchMedia("(pointer: coarse)").matches);
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090c);
    scene.fog = new THREE.FogExp2(0x10151a, 0.0065);

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
    renderer.toneMappingExposure = 1.24;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Three-dimensional firing range");
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xd7e3e2, 0x25282a, 1.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xf2f7f5, 2.4);
    sun.position.set(-8, 12, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);

    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const floorContext = floorCanvas.getContext("2d")!;
    floorContext.fillStyle = "#777874";
    floorContext.fillRect(0, 0, 512, 512);
    floorContext.strokeStyle = "rgba(34,37,38,.22)";
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
      floorContext.strokeStyle = `rgba(28,31,32,${0.04 + Math.random() * 0.12})`;
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
    const concrete = new THREE.MeshStandardMaterial({
      color: 0xb2b2ad,
      map: floorTexture,
      roughness: 0.94,
      metalness: 0.02,
    });
    const leftWall = new THREE.MeshStandardMaterial({
      color: 0x5f6262,
      roughness: 0.96,
    });
    const rightWall = new THREE.MeshStandardMaterial({
      color: 0x19232d,
      roughness: 0.9,
    });
    const ceiling = new THREE.MeshStandardMaterial({
      color: 0x07090b,
      roughness: 0.88,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x252b30,
      roughness: 0.5,
      metalness: 0.66,
    });
    const hazard = new THREE.MeshStandardMaterial({
      color: 0xe5ae22,
      roughness: 0.7,
      metalness: 0.1,
    });
    const coverMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b5b35,
      roughness: 0.88,
      metalness: 0.02,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: 0xd94c16,
      roughness: 0.67,
      metalness: 0.06,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x080a0b,
      roughness: 0.98,
    });
    const whiteLight = new THREE.MeshBasicMaterial({ color: 0xe5ffff });

    const world = new THREE.Group();
    const obstacleBoxes: { x: number; z: number; halfW: number; halfD: number }[] = [];
    scene.add(world);
    box(world, [30, 0.22, 108], [0, -0.11, -39], concrete);
    box(world, [0.5, 7.4, 108], [-15, 3.7, -39], leftWall);
    box(world, [0.5, 7.4, 108], [15, 3.7, -39], rightWall);
    box(world, [30, 7.4, 0.5], [0, 3.7, -93], rightWall);
    box(world, [30, 0.42, 108], [0, 7.25, -39], ceiling);

    for (let z = 9; z > -91; z -= 9.5) {
      box(world, [18, 0.055, 0.22], [0, 7.01, z], whiteLight);
      if (Math.abs(z % 19) < 10) {
        const light = new THREE.PointLight(0xddeeed, 13, 20, 2);
        light.position.set(0, 6.5, z);
        world.add(light);
      }
    }

    const seam = new THREE.MeshBasicMaterial({ color: 0x303435 });
    for (let z = 8; z > -91; z -= 6) {
      box(world, [0.025, 6.4, 0.06], [-14.72, 3.25, z], seam);
      box(world, [0.025, 6.4, 0.06], [14.72, 3.25, z], seam);
    }
    for (const y of [1.6, 3.2, 4.8]) {
      box(world, [0.025, 0.035, 106], [-14.72, y, -39], seam);
      box(world, [0.025, 0.035, 106], [14.72, y, -39], seam);
    }

    const startStrip = box(world, [29.3, 0.035, 2.2], [0, 0.03, 9.2], rubber);
    startStrip.receiveShadow = false;
    for (let x = -13.5; x < 14; x += 2.2) {
      const stripe = box(world, [1.05, 0.045, 2.3], [x, 0.052, 9.2], hazard);
      stripe.rotation.y = -0.58;
    }

    function addCover(x: number, z: number, width: number, depth: number, height: number) {
      const cover = box(world, [width, height, depth], [x, height / 2, z], coverMaterial, true);
      obstacleBoxes.push({ x, z, halfW: width / 2 + 0.48, halfD: depth / 2 + 0.48 });
      const panelLine = new THREE.MeshBasicMaterial({ color: 0x3a321f });
      for (const px of [-width / 4, width / 4]) {
        box(world, [0.025, height + 0.01, depth + 0.015], [x + px, height / 2, z], panelLine);
      }
      box(world, [width + 0.015, 0.025, depth + 0.015], [x, height / 2, z], panelLine);
      return cover;
    }

    addCover(-7.5, -6, 5.2, 3.1, 2.8);
    addCover(5.2, -19, 5.6, 3.2, 2.45);
    addCover(-5.3, -33, 4.2, 2.8, 2.2);
    addCover(7.2, -48, 4.8, 3.1, 2.75);
    addCover(0.2, -65, 6.2, 3.4, 2.55);

    function addHazardBarrier(x: number, z: number) {
      box(world, [1.75, 0.75, 0.65], [x, 0.375, z], rubber, true);
      for (const offset of [-0.58, -0.2, 0.2, 0.58]) {
        const stripe = box(world, [0.24, 0.82, 0.035], [x + offset, 0.4, z + 0.34], hazard);
        stripe.rotation.z = -0.42;
      }
    }
    for (const [x, z] of [
      [-12.7, 1], [12.7, -3], [-12.7, -17], [12.7, -24],
      [-12.7, -41], [12.7, -58], [-12.7, -72],
    ] as const) addHazardBarrier(x, z);

    for (const [x, z] of [
      [-10, -12], [10.5, -10], [-1.8, -24], [11, -31],
      [-10.5, -40], [2.3, -46], [-8, -57], [10, -67],
    ] as const) {
      box(world, [0.72, 2.35, 0.72], [x, 1.175, z], orange, true);
    }

    box(world, [2.3, 3.5, 0.28], [-14.68, 1.75, -27], steel, true);
    box(world, [2.3, 3.5, 0.28], [14.68, 1.75, -14], steel, true);
    box(world, [2.3, 3.5, 0.28], [14.68, 1.75, -60], steel, true);

    const distances = [
      ["10 M", 0],
      ["25 M", -15],
      ["50 M", -40],
      ["75 M", -65],
    ] as const;
    for (const [label, z] of distances) {
      const sign = makeLabel(label);
      sign.position.set(-13.75, 5.8, z);
      sign.scale.set(3.2, 0.8, 1);
      world.add(sign);
    }

    const titleSign = makeLabel("RANGE // SEVEN", "#f0bd57", "rgba(10,14,14,.96)");
    titleSign.scale.set(7.5, 1.85, 1);
    titleSign.position.set(0, 5.0, -92.7);
    world.add(titleSign);

    const targetRoot = new THREE.Group();
    scene.add(targetRoot);
    const targets = new Map<number, TargetState>();
    let targetId = 0;

    function createTarget(x: number, z: number, moving: boolean) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const standMat = new THREE.MeshStandardMaterial({
        color: 0xd94c16,
        roughness: 0.7,
        metalness: 0.08,
      });
      const targetMat = new THREE.MeshStandardMaterial({
        color: 0xb72d22,
        roughness: 0.68,
        metalness: 0.1,
        emissive: 0x000000,
      });
      box(group, [0.42, 2.1, 0.36], [0, 1.05, 0.12], standMat, true);
      box(group, [1.25, 0.18, 0.58], [0, 0.09, 0.12], steel);
      const backboard = box(group, [1.34, 1.34, 0.2], [0, 2.16, 0], steel, true);
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.88, 0.12),
        targetMat.clone(),
      );
      torso.position.set(0, 2.16, 0.16);
      torso.castShadow = true;
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 0.055),
        new THREE.MeshBasicMaterial({ color: 0xf5fbf8 }),
      );
      head.position.set(0, 2.16, 0.255);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.255, 16),
        new THREE.MeshBasicMaterial({ color: 0x1a2024, side: THREE.DoubleSide }),
      );
      ring.position.set(0, 2.16, 0.225);
      group.add(torso, head, ring);
      const id = ++targetId;
      backboard.userData = { targetId: id, zone: "torso" };
      torso.userData = { targetId: id, zone: "torso" };
      head.userData = { targetId: id, zone: "head" };
      ring.userData = { targetId: id, zone: "bullseye" };
      targetRoot.add(group);
      group.scale.y = 0.01;
      const target: TargetState = {
        id,
        group,
        head,
        torso,
        hp: 100,
        bornAt: performance.now(),
        lifetime: Math.max(3500, 7100 - levelLive * 480),
        phase: Math.random() * Math.PI * 2,
        moving,
        baseX: x,
        dead: false,
      };
      targets.set(id, target);
    }

    const weaponRoot = new THREE.Group();
    camera.add(weaponRoot);
    scene.add(camera);
    const muzzle = new THREE.Object3D();
    let muzzleFlash: THREE.Mesh | null = null;
    let muzzleLight: THREE.PointLight | null = null;

    function buildWeapon(index: number) {
      while (weaponRoot.children.length) weaponRoot.remove(weaponRoot.children[0]);
      const w = WEAPONS[index];
      const profile =
        index === 1
          ? { receiver: 0.72, handguard: 0.58, barrel: 0.46, stock: 0.46 }
          : index === 2
            ? { receiver: 1.02, handguard: 1.08, barrel: 1.05, stock: 0.78 }
            : { receiver: 0.9, handguard: 0.9, barrel: 0.72, stock: 0.68 };
      const gunmetal = new THREE.MeshStandardMaterial({
        color: 0x20272d,
        roughness: 0.36,
        metalness: 0.74,
      });
      const accent = new THREE.MeshStandardMaterial({
        color: w.color,
        roughness: 0.57,
        metalness: 0.32,
      });
      const skin = new THREE.MeshStandardMaterial({
        color: 0xb98262,
        roughness: 0.78,
      });
      const sleeve = new THREE.MeshStandardMaterial({
        color: 0x45503c,
        roughness: 0.9,
      });
      weaponRoot.position.set(0.48, -0.42, -0.7);
      weaponRoot.scale.setScalar(index === 1 ? 1.02 : 1.08);
      box(weaponRoot, [0.38, 0.32, profile.receiver], [0, 0, -0.18], gunmetal, true);
      box(weaponRoot, [0.31, 0.24, profile.handguard], [0, 0.025, -0.98], accent, true);
      box(weaponRoot, [0.11, 0.11, profile.barrel], [0, 0.03, -1.66], gunmetal, true);
      box(weaponRoot, [0.34, 0.24, profile.stock], [0, -0.015, 0.53], accent, true);
      box(weaponRoot, [0.28, 0.08, 1.32], [0, 0.205, -0.52], gunmetal, true);
      for (const railZ of [-0.62, -0.82, -1.02, -1.22]) {
        box(weaponRoot, [0.34, 0.055, 0.08], [0, 0.22, railZ], gunmetal);
      }
      const grip = box(weaponRoot, [0.24, 0.64, 0.3], [0, -0.42, -0.04], gunmetal, true);
      grip.rotation.x = -0.22;
      const mag = box(
        weaponRoot,
        [index === 1 ? 0.22 : 0.27, index === 1 ? 0.72 : 0.62, 0.34],
        [0, -0.43, -0.44],
        accent,
        true,
      );
      mag.rotation.x = -0.12;

      const rightHand = box(weaponRoot, [0.3, 0.34, 0.32], [0.08, -0.42, 0.0], skin, true);
      rightHand.rotation.x = -0.2;
      const rightArm = box(weaponRoot, [0.46, 0.42, 1.05], [0.32, -0.66, 0.42], sleeve, true);
      rightArm.rotation.x = -0.34;
      rightArm.rotation.z = -0.12;
      box(weaponRoot, [0.31, 0.28, 0.36], [-0.04, -0.2, -1.02], skin, true);
      const leftArm = box(weaponRoot, [0.42, 0.38, 1.2], [-0.28, -0.52, -0.54], sleeve, true);
      leftArm.rotation.x = -0.64;
      leftArm.rotation.z = 0.15;

      if (index === 2) {
        const scope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.18, 0.68, 12),
          gunmetal,
        );
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.39, -0.42);
        weaponRoot.add(scope);
        box(weaponRoot, [0.22, 0.16, 0.1], [0, 0.26, -0.35], gunmetal);
      } else {
        box(weaponRoot, [0.28, 0.08, 0.25], [0, 0.31, -0.36], gunmetal);
        box(weaponRoot, [0.055, 0.24, 0.055], [-0.12, 0.4, -0.48], gunmetal);
        box(weaponRoot, [0.055, 0.24, 0.055], [0.12, 0.4, -0.48], gunmetal);
        box(weaponRoot, [0.29, 0.055, 0.055], [0, 0.51, -0.48], gunmetal);
        box(
          weaponRoot,
          [0.038, 0.038, 0.02],
          [0, 0.405, -0.515],
          new THREE.MeshBasicMaterial({ color: 0xff4b37 }),
        );
      }
      box(weaponRoot, [0.05, 0.22, 0.08], [0, 0.29, -1.48], gunmetal);

      muzzle.position.set(0, 0.03, -1.66 - profile.barrel / 2);
      weaponRoot.add(muzzle);
      muzzleFlash = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({
          color: 0xffd68a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
        }),
      );
      muzzleFlash.position.copy(muzzle.position);
      muzzleLight = new THREE.PointLight(0xff8f32, 0, 3.5);
      muzzleLight.position.copy(muzzle.position);
      weaponRoot.add(muzzleFlash, muzzleLight);
    }
    buildWeapon(0);

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
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xd9aa49,
      roughness: 0.35,
      metalness: 0.9,
    });
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc167 });
    const audio = new AudioContext();
    let noiseBuffer: AudioBuffer | null = null;

    function initAudio() {
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
      noise.connect(filter).connect(gain).connect(audio.destination);
      noise.start(t);
      const thump = audio.createOscillator();
      const thumpGain = audio.createGain();
      thump.type = "triangle";
      thump.frequency.setValueAtTime(index === 2 ? 92 : 122, t);
      thump.frequency.exponentialRampToValueAtTime(48, t + 0.075);
      thumpGain.gain.setValueAtTime(0.28, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      thump.connect(thumpGain).connect(audio.destination);
      thump.start(t);
      thump.stop(t + 0.1);
    }

    function tone(frequency: number, duration: number, volume = 0.1) {
      initAudio();
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + duration);
    }

    let running = false;
    let levelLive = 1;
    let levelKills = 0;
    let scoreLive = 0;
    let streakLive = 0;
    let timeLive = 45;
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
    let walkPhase = 0;
    let recoil = 0;
    let weaponKick = 0;
    let yaw = 0;
    let pitch = -0.015;
    let spawnTimer = 0;
    let mobileMove = { x: 0, y: 0 };

    function burst(position: THREE.Vector3, hit = false) {
      const count = hit ? 7 : 4;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.025, 0.09),
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
      timeLive = 45;
      timeAccumulator = 0;
      currentWeapon = 0;
      unlocked = 1;
      ammoLive = WEAPONS[0].ammo;
      reserveLive = WEAPONS[0].reserve;
      aimingLive = false;
      reloadingLive = false;
      setAiming(false);
      setReloading(false);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setLevel(1);
      setTime(45);
      setWeaponIndex(0);
      setAmmo({ mag: ammoLive, reserve: reserveLive });
      setObjective(`${LEVEL_GOALS[0]} TARGETS`);
      setGameOver(false);
      camera.position.set(0, 1.72, 12);
      yaw = 0;
      pitch = -0.015;
      buildWeapon(0);
      running = true;
      spawnTimer = 0;
      showFeed("RANGE LIVE");
      initAudio();
      if (!matchMedia("(pointer: coarse)").matches) {
        void renderer.domElement.requestPointerLock();
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
      reloadStarted = performance.now();
      firing = false;
      setReloading(true);
      showFeed("RELOADING");
      tone(180, 0.06, 0.055);
      setTimeout(() => tone(310, 0.05, 0.045), weapon.reloadMs * 0.56);
      setTimeout(() => {
        const needed = weapon.ammo - ammoLive;
        const loaded = Math.min(needed, reserveLive);
        ammoLive += loaded;
        reserveLive -= loaded;
        reloadingLive = false;
        setReloading(false);
        setAmmo({ mag: ammoLive, reserve: reserveLive });
        tone(440, 0.06, 0.045);
      }, weapon.reloadMs);
    }

    function levelUp() {
      levelLive++;
      levelKills = 0;
      timeLive += 18;
      unlocked = Math.min(WEAPONS.length, 1 + Math.floor(levelLive / 2));
      setLevel(levelLive);
      setTime(Math.ceil(timeLive));
      setObjective(
        `${LEVEL_GOALS[Math.min(levelLive - 1, LEVEL_GOALS.length - 1)]} TARGETS`,
      );
      tone(520, 0.18, 0.11);
      setTimeout(() => tone(780, 0.24, 0.1), 120);
      showFeed(`LEVEL ${levelLive} // ${unlocked > currentWeapon + 1 ? "WEAPON UNLOCKED" : "CLEAR"}`);
      setDamageFlash((v) => v + 1);
    }

    function registerHit(hit: THREE.Intersection<THREE.Object3D>) {
      const { targetId: id, zone } = hit.object.userData as {
        targetId?: number;
        zone?: string;
      };
      if (!id || !zone) {
        burst(hit.point, false);
        streakLive = 0;
        setStreak(0);
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
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0xffb36b);
        setTimeout(() => material.emissive.setHex(0x000000), 55);
      }
      if (target.hp <= 0) {
        target.dead = true;
        target.group.userData.fall = 0;
        streakLive++;
        levelKills++;
        const points = Math.round(
          (zone === "head" ? 150 : zone === "bullseye" ? 120 : 100) *
            (1 + Math.min(streakLive, 10) * 0.1),
        );
        scoreLive += points;
        setScore(scoreLive);
        setStreak(streakLive);
        setBestStreak((best) => Math.max(best, streakLive));
        showFeed(`${zone === "head" ? "HEADSHOT" : "TARGET DOWN"}  +${points}`);
        if (streakLive % 5 === 0) tone(1320, 0.14, 0.08);
        const goal = LEVEL_GOALS[Math.min(levelLive - 1, LEVEL_GOALS.length - 1)];
        if (levelKills >= goal) levelUp();
      }
    }

    function shoot() {
      if (!running || reloadingLive) return;
      const now = performance.now();
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
      setAmmo({ mag: ammoLive, reserve: reserveLive });
      shotAudio(currentWeapon);
      weaponKick = 1;
      recoil = Math.min(recoil + weapon.recoil * (0.78 + Math.random() * 0.42), 0.16);
      yaw += (Math.random() - 0.5) * weapon.recoil * 0.38;
      if (muzzleFlash && muzzleLight) {
        (muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 1;
        muzzleFlash.scale.setScalar(0.85 + Math.random() * 0.8);
        muzzleFlash.rotation.z = Math.random() * Math.PI;
        muzzleLight.intensity = 5;
      }
      ejectShell();
      const spread =
        weapon.spread *
        (aimingLive ? 0.42 : 1) *
        (1 + Math.min(streakLive * 0.015, 0.1));
      aim.set(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
      );
      raycaster.setFromCamera(aim, camera);
      const hits = raycaster.intersectObjects([targetRoot, world], true);
      const end = hits.length
        ? hits[0].point.clone()
        : raycaster.ray.at(100, new THREE.Vector3());
      addTracer(end);
      if (hits.length) registerHit(hits[0]);
      if (navigator.vibrate) navigator.vibrate(currentWeapon === 2 ? 24 : 12);
      if (ammoLive === 0) setTimeout(reload, 220);
    }

    function spawnTarget() {
      if (targets.size >= Math.min(4 + Math.floor(levelLive / 2), 8)) return;
      const lanes = [-10, -5, 0, 5, 10];
      const depths =
        levelLive < 2
          ? [0, -15]
          : levelLive < 4
            ? [0, -15, -40]
            : [-15, -40, -65];
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      const depth = depths[Math.floor(Math.random() * depths.length)];
      const occupied = [...targets.values()].some(
        (target) =>
          !target.dead &&
          Math.abs(target.baseX - lane) < 1 &&
          Math.abs(target.group.position.z - depth) < 4,
      );
      if (!occupied) createTarget(lane, depth, levelLive >= 3 && Math.random() > 0.45);
    }

    function onMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== renderer.domElement || !running) return;
      yaw -= event.movementX * 0.0018;
      pitch -= event.movementY * 0.00165;
      pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.62);
    }

    function onMouseDown(event: MouseEvent) {
      if (!running) return;
      if (document.pointerLockElement !== renderer.domElement) {
        void renderer.domElement.requestPointerLock();
        return;
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
      if (event.button === 2) {
        aimingLive = false;
        setAiming(false);
      }
      if (event.button === 0) firing = false;
    }

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      keys.add(event.code);
      if (event.code === "KeyR") reload();
      if (event.code === "Digit1") switchWeapon(0);
      if (event.code === "Digit2") switchWeapon(1);
      if (event.code === "Digit3") switchWeapon(2);
    }

    function onKeyUp(event: KeyboardEvent) {
      keys.delete(event.code);
    }

    function onResize() {
      if (!mount) return;
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

    engineRef.current = {
      start: resetGame,
      reload,
      setFiring(value) {
        firing = value;
        if (value) shoot();
      },
      setAiming(value) {
        aimingLive = value;
        setAiming(value);
      },
      aimDelta(dx, dy) {
        if (!running) return;
        yaw -= dx * 0.0041;
        pitch -= dy * 0.0038;
        pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.62);
      },
      moveInput(x, y) {
        mobileMove = { x, y };
      },
      switchWeapon,
    };

    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      const elapsed = performance.now();

      if (running) {
        if (firing) shoot();
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
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnTarget();
          spawnTimer = Math.max(0.45, 1.18 - levelLive * 0.07) + Math.random() * 0.48;
        }
      }

      const forward =
        (keys.has("KeyW") ? 1 : 0) -
        (keys.has("KeyS") ? 1 : 0) +
        -mobileMove.y;
      const strafe =
        (keys.has("KeyD") ? 1 : 0) -
        (keys.has("KeyA") ? 1 : 0) +
        mobileMove.x;
      if (running) {
        const magnitude = Math.min(1, Math.hypot(strafe, forward));
        const normalizedStrafe = magnitude ? strafe / Math.max(1, Math.hypot(strafe, forward)) : 0;
        const normalizedForward = magnitude ? forward / Math.max(1, Math.hypot(strafe, forward)) : 0;
        const moveSpeed = aimingLive ? 3.2 : 5.25;
        const moveX =
          (Math.cos(yaw) * normalizedStrafe - Math.sin(yaw) * normalizedForward) *
          dt *
          moveSpeed;
        const moveZ =
          (-Math.sin(yaw) * normalizedStrafe - Math.cos(yaw) * normalizedForward) *
          dt *
          moveSpeed;
        const canMoveTo = (x: number, z: number) =>
          x > -14.1 &&
          x < 14.1 &&
          z > -88.5 &&
          z < 12.9 &&
          !obstacleBoxes.some(
            (obstacle) =>
              Math.abs(x - obstacle.x) < obstacle.halfW &&
              Math.abs(z - obstacle.z) < obstacle.halfD,
          );
        if (canMoveTo(camera.position.x + moveX, camera.position.z)) {
          camera.position.x += moveX;
        }
        if (canMoveTo(camera.position.x, camera.position.z + moveZ)) {
          camera.position.z += moveZ;
        }
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
      weaponRoot.position.x = THREE.MathUtils.lerp(0.48, 0, adsBlend);
      weaponRoot.position.z =
        THREE.MathUtils.lerp(-0.7, -0.84, adsBlend) + weaponKick * 0.11;
      weaponRoot.position.y =
        THREE.MathUtils.lerp(-0.42, currentWeapon === 2 ? -0.4 : -0.435, adsBlend) -
        weaponKick * 0.05 +
        Math.sin(walkPhase) * 0.012 * (1 - adsBlend);
      if (reloadingLive) {
        const reloadProgress = Math.min(
          1,
          (elapsed - reloadStarted) / WEAPONS[currentWeapon].reloadMs,
        );
        weaponRoot.rotation.z = -Math.sin(reloadProgress * Math.PI) * 0.48;
        weaponRoot.rotation.x = Math.sin(reloadProgress * Math.PI) * 0.18;
        weaponRoot.position.y -= Math.sin(reloadProgress * Math.PI) * 0.22;
      } else {
        weaponRoot.rotation.z =
          Math.sin(walkPhase * 0.5) * 0.012 * (1 - adsBlend);
        weaponRoot.rotation.x = 0;
      }

      if (muzzleFlash && muzzleLight) {
        const mat = muzzleFlash.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - dt * 28);
        muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 90);
      }

      for (const target of targets.values()) {
        const age = elapsed - target.bornAt;
        if (!target.dead) {
          target.group.scale.y = THREE.MathUtils.lerp(
            target.group.scale.y,
            1,
            1 - Math.pow(0.00002, dt),
          );
          if (target.moving) {
            target.group.position.x =
              target.baseX + Math.sin(elapsed * 0.0019 + target.phase) * 1.05;
          }
          if (age > target.lifetime) {
            target.dead = true;
            target.group.userData.missed = true;
            streakLive = 0;
            setStreak(0);
            showFeed("TARGET MISSED");
          }
        } else {
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

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      void audio.close();
      mount.removeChild(renderer.domElement);
    };
  }, [showFeed]);

  function begin() {
    setStarted(true);
    engineRef.current?.start();
  }

  function onJoyStart(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    joyPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onJoyMove(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (joyPointer.current !== event.pointerId || !joystickRef.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const x = THREE.MathUtils.clamp(
      (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.35),
      -1,
      1,
    );
    const y = THREE.MathUtils.clamp(
      (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.35),
      -1,
      1,
    );
    joystickRef.current.style.setProperty("--jx", `${x * 28}px`);
    joystickRef.current.style.setProperty("--jy", `${y * 28}px`);
    engineRef.current?.moveInput(x, y);
  }

  function onJoyEnd(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    joyPointer.current = null;
    joystickRef.current?.style.setProperty("--jx", "0px");
    joystickRef.current?.style.setProperty("--jy", "0px");
    engineRef.current?.moveInput(0, 0);
  }

  function onLookStart(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    lookPointer.current = event.pointerId;
    lookLast.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onLookMove(event: React.PointerEvent<HTMLDivElement>) {
    if (lookPointer.current !== event.pointerId) return;
    const dx = event.clientX - lookLast.current.x;
    const dy = event.clientY - lookLast.current.y;
    lookLast.current = { x: event.clientX, y: event.clientY };
    engineRef.current?.aimDelta(dx, dy);
  }

  function onLookEnd() {
    lookPointer.current = null;
  }

  return (
    <main className="game-shell">
      <div ref={mountRef} className="viewport" />
      <div key={damageFlash} className={damageFlash ? "level-flash" : ""} />

      <header className="topbar" aria-label="Mission status">
        <div className="brand">
          <span className="brand-mark">R//7</span>
          <span>
            RANGE <b>SEVEN</b>
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
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => engineRef.current?.reload()}
          >
            R
          </button>
        </div>
      )}

      {!started && (
        <section className="start-screen">
          <div className="scanline" />
          <div className="eyebrow">LIVE-FIRE QUALIFICATION // 07</div>
          <h1>
            RANGE
            <span>SEVEN</span>
          </h1>
          <p>
            Clear targets. Chain precision hits. Advance through escalating
            tactical drills before the clock expires.
          </p>
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
            <span>ENTER THE RANGE</span>
            <i>▶</i>
          </button>
          <small className="legal">
            ORIGINAL TACTICAL TRAINING EXPERIENCE · HEADPHONES RECOMMENDED
          </small>
        </section>
      )}

      {gameOver && (
        <section className="result-screen">
          <span className="eyebrow">QUALIFICATION COMPLETE</span>
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
              <span>RATING</span>
              <strong>{score > 6500 ? "S" : score > 4000 ? "A" : score > 2200 ? "B" : "C"}</strong>
            </div>
          </div>
          <button className="deploy-button" onClick={begin}>
            RUN IT AGAIN
          </button>
        </section>
      )}

      <footer className="footer-strip">
        <span>LIVE RANGE</span>
        <i />
        <span>WIND 00.4</span>
        <span>CAL 5.56</span>
        <b>SAFETY OFF</b>
      </footer>
    </main>
  );
}
