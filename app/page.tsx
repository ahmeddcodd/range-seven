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
    scene.background = new THREE.Color(0x151c1c);
    scene.fog = new THREE.FogExp2(0x1b2423, 0.011);

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
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Three-dimensional firing range");
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xadc9c5, 0x433828, 1.4);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe5b2, 3.2);
    sun.position.set(-5, 15, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x454946,
      roughness: 0.92,
      metalness: 0.04,
    });
    const darkConcrete = new THREE.MeshStandardMaterial({
      color: 0x242a29,
      roughness: 0.95,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x253134,
      roughness: 0.58,
      metalness: 0.74,
    });
    const hazard = new THREE.MeshStandardMaterial({
      color: 0xd49a31,
      roughness: 0.72,
      metalness: 0.18,
    });
    const sand = new THREE.MeshStandardMaterial({
      color: 0x8a7150,
      roughness: 1,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x101414,
      roughness: 0.98,
    });
    const laneLine = new THREE.MeshBasicMaterial({ color: 0xc8a84e });

    const world = new THREE.Group();
    scene.add(world);
    box(world, [22, 0.22, 105], [0, -0.11, -36], concrete);
    box(world, [0.45, 7, 105], [-11, 3.45, -36], darkConcrete);
    box(world, [0.45, 7, 105], [11, 3.45, -36], darkConcrete);
    box(world, [22, 7, 0.5], [0, 3.5, -88], darkConcrete);

    for (let z = 9; z > -86; z -= 5) {
      box(world, [0.035, 0.012, 2.2], [0, 0.015, z], laneLine);
    }
    for (const x of [-7.4, -3.7, 3.7, 7.4]) {
      for (let z = 9; z > -86; z -= 4.4) {
        box(world, [0.025, 0.012, 1.7], [x, 0.017, z], laneLine);
      }
    }

    for (let z = 8; z > -82; z -= 12) {
      box(world, [0.42, 6.2, 0.42], [-10.55, 3.1, z], steel);
      box(world, [0.42, 6.2, 0.42], [10.55, 3.1, z], steel);
      box(world, [21.1, 0.35, 0.42], [0, 6.05, z], steel);
      const strip = box(
        world,
        [13, 0.05, 0.32],
        [0, 5.75, z - 0.08],
        new THREE.MeshBasicMaterial({ color: 0xc9ecdf }),
      );
      strip.userData.light = true;
    }

    const distances = [
      ["10 M", 0],
      ["25 M", -15],
      ["50 M", -40],
      ["75 M", -65],
    ] as const;
    for (const [label, z] of distances) {
      const sign = makeLabel(label);
      sign.position.set(-8.2, 3.8, z);
      world.add(sign);
    }

    for (let i = 0; i < 5; i++) {
      const x = -8 + i * 4;
      box(world, [3.25, 1.05, 1.3], [x, 0.52, 10.2], steel);
      box(world, [3.05, 0.12, 0.95], [x, 1.11, 10.05], hazard);
      if (i < 4) box(world, [0.16, 2.6, 3.2], [x + 1.88, 1.3, 10], steel);
    }

    for (let i = 0; i < 14; i++) {
      const x = i % 2 ? -9.7 : 9.7;
      const z = 5 - Math.floor(i / 2) * 11.5;
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.19, 8, 18),
        rubber,
      );
      tire.position.set(x, 0.55, z);
      tire.rotation.x = Math.PI / 2;
      world.add(tire);
    }

    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? -1 : 1;
      const row = Math.floor(i / 2);
      box(
        world,
        [1.25, 0.42, 0.58],
        [side * (8.8 - (row % 2) * 0.35), 0.22 + (row % 3) * 0.38, -67 - row * 0.65],
        sand,
        true,
      );
    }

    for (let i = 0; i < 9; i++) {
      const z = -4 - i * 9.2;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.8, 10),
        new THREE.MeshStandardMaterial({ color: 0xd8792a, roughness: 0.7 }),
      );
      cone.position.set(i % 2 ? -9.25 : 9.25, 0.4, z);
      world.add(cone);
    }

    const titleSign = makeLabel("RANGE // SEVEN", "#f0bd57", "rgba(10,14,14,.96)");
    titleSign.scale.set(7.5, 1.85, 1);
    titleSign.position.set(0, 4.5, -87.7);
    world.add(titleSign);

    const targetRoot = new THREE.Group();
    scene.add(targetRoot);
    const targets = new Map<number, TargetState>();
    let targetId = 0;

    function createTarget(x: number, z: number, moving: boolean) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const standMat = new THREE.MeshStandardMaterial({
        color: 0x5c6663,
        roughness: 0.75,
        metalness: 0.55,
      });
      const targetMat = new THREE.MeshStandardMaterial({
        color: 0x262b2b,
        roughness: 0.78,
        metalness: 0.16,
        emissive: 0x000000,
      });
      box(group, [0.1, 2.25, 0.1], [0, 1.12, 0.1], standMat);
      box(group, [1.25, 0.16, 0.42], [0, 0.09, 0.12], standMat);
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.28, 0.18),
        targetMat.clone(),
      );
      torso.position.set(0, 1.72, 0);
      torso.castShadow = true;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 14, 10),
        targetMat.clone(),
      );
      head.scale.z = 0.5;
      head.position.set(0, 2.62, 0);
      head.castShadow = true;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.29, 24),
        new THREE.MeshBasicMaterial({ color: 0xb95c3e, side: THREE.DoubleSide }),
      );
      ring.position.set(0, 1.85, 0.101);
      group.add(torso, head, ring);
      const id = ++targetId;
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
      const gunmetal = new THREE.MeshStandardMaterial({
        color: 0x1c2426,
        roughness: 0.42,
        metalness: 0.78,
      });
      const accent = new THREE.MeshStandardMaterial({
        color: w.color,
        roughness: 0.62,
        metalness: 0.35,
      });
      weaponRoot.position.set(0.34, -0.28, -0.58);
      box(weaponRoot, [0.2, 0.25, 0.55], [0.04, -0.19, 0.08], accent, true);
      box(weaponRoot, [0.33, 0.25, 0.82], [0, 0, -0.12], gunmetal, true);
      box(weaponRoot, [0.25, 0.18, 0.86], [0, 0.04, -0.82], accent, true);
      box(weaponRoot, [0.09, 0.09, 0.78], [0, 0.04, -1.58], gunmetal, true);
      box(weaponRoot, [0.05, 0.12, 0.22], [0, 0.2, -0.66], gunmetal, true);
      box(weaponRoot, [0.04, 0.1, 0.16], [0, 0.2, -1.22], gunmetal, true);
      const grip = box(weaponRoot, [0.22, 0.62, 0.28], [0, -0.42, -0.16], gunmetal, true);
      grip.rotation.x = -0.22;
      const mag = box(weaponRoot, [0.22, 0.6, 0.32], [0, -0.43, -0.55], accent, true);
      mag.rotation.x = -0.12;
      muzzle.position.set(0, 0.04, -2.05);
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
    let reloadingLive = false;
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
      reloadingLive = false;
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
      const spread = weapon.spread * (1 + Math.min(streakLive * 0.015, 0.1));
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
      const lanes = [-7.3, -3.65, 0, 3.65, 7.3];
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
      if (event.button !== 0 || !running) return;
      if (document.pointerLockElement !== renderer.domElement) {
        void renderer.domElement.requestPointerLock();
        return;
      }
      firing = true;
      shoot();
      if (!WEAPONS[currentWeapon].auto) firing = false;
    }

    function onMouseUp() {
      firing = false;
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
    window.addEventListener("resize", onResize);

    engineRef.current = {
      start: resetGame,
      reload,
      setFiring(value) {
        firing = value;
        if (value) shoot();
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
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x + strafe * dt * 4.4,
          -7.9,
          7.9,
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z - forward * dt * 3.5,
          7.8,
          13.2,
        );
      }

      recoil = THREE.MathUtils.lerp(recoil, 0, 1 - Math.pow(0.0001, dt));
      camera.rotation.y = yaw;
      camera.rotation.x = pitch + recoil;
      weaponKick = THREE.MathUtils.lerp(weaponKick, 0, 1 - Math.pow(0.00004, dt));
      weaponRoot.position.z = -0.58 + weaponKick * 0.095;
      weaponRoot.position.y =
        -0.28 -
        weaponKick * 0.045 +
        Math.sin(elapsed * 0.0028) * (running ? 0.004 : 0.009);
      weaponRoot.rotation.z = Math.sin(elapsed * 0.002) * 0.005;

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
      <div className="crosshair" aria-hidden="true">
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
            className="touch-reload"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => engineRef.current?.reload()}
          >
            ↻
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
