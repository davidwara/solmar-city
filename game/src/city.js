// Solmar City — the procedural coastal city.
// A road grid with downtown towers, mid-rise blocks, palms, street lamps,
// a beach and the sea to the south. Everything is built from boxes, cylinders
// and canvas textures generated at runtime: no external assets, no network.
//
// Layout (world units, metres): streets run on a grid with pitch 62, road
// width 14. Street centrelines sit at -186, -124, -62, 0, 62, 124, 186 on both
// axes. The beach starts at z = 210, the sea beyond z = 250. Downtown (tall
// towers) is the 3x3 blocks around the origin.
import * as THREE from 'three';
import { createRng, pick, rand, randInt } from './utils.js';

export const CITY = {
  pitch: 62,
  roadHalf: 7,
  streets: [-186, -124, -62, 0, 62, 124, 186],
  beachZ: 210,
  seaZ: 250,
  bound: 235,
};

const PALETTE = [
  0xf2e3c9, 0xe8b4a0, 0xd9a441, 0x7fb3c8, 0xc96f5a, 0x9db98a,
  0xe6d7b8, 0xb7c9d9, 0xf0c98a, 0xd98a7a, 0x8aa8b8, 0xe9e2d0,
];

/** Paint a window-grid texture on a canvas; returns a THREE CanvasTexture. */
function buildingTexture(rng, baseColor, floors) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  // Slight vertical shading so towers read as tall.
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 5;
  const rows = Math.max(3, Math.min(18, floors));
  const cw = 128 / cols;
  const rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.28;
      ctx.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(c * cw + 4, r * rh + 5, cw - 8, rh - 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const h = rand(rng, 5, 8);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = rand(rng, -0.08, 0.08);
  group.add(trunk);
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 1.1, h + 0.25, Math.sin(a) * 1.1);
    frond.rotation.z = Math.cos(a) * 1.15;
    frond.rotation.x = -Math.sin(a) * 1.15;
    frond.scale.y = 1;
    group.add(frond);
  }
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  crown.position.y = h + 0.4;
  group.add(crown);
  return group;
}

/** Build the whole city into the scene. Returns colliders + landmarks. */
export function buildCity(scene, seed) {
  const rng = createRng(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const landmarks = { downtown: new THREE.Vector3(0, 0, 0), beach: new THREE.Vector3(0, 0, 235), marina: new THREE.Vector3(-150, 0, 225), docks: new THREE.Vector3(150, 0, 186), safehouse: new THREE.Vector3(124, 0, 200), drop: new THREE.Vector3(62, 0, -62) };

  // --- lights & sky -------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 2.1);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(sun.target);
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc6e8, 260, 700);

  // --- ground: sidewalk-coloured base, sea, sand --------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 46),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, 233);
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 220),
    new THREE.MeshLambertMaterial({ color: 0x2e7fb8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, 366);
  scene.add(sea);
  // A lighter band where the waves meet the sand.
  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 4),
    new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(0, 0.06, 254);
  scene.add(surf);

  // --- roads --------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
  for (const c of CITY.streets) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(14, 470), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.08, -10);
    scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(470, 14), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.08, c);
    scene.add(ew);
    const lineNS = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 470), lineMat);
    lineNS.rotation.x = -Math.PI / 2;
    lineNS.position.set(c, 0.1, -10);
    scene.add(lineNS);
    const lineEW = new THREE.Mesh(new THREE.PlaneGeometry(470, 0.5), lineMat);
    lineEW.rotation.x = -Math.PI / 2;
    lineEW.position.set(0, 0.1, c);
    scene.add(lineEW);
  }

  // --- buildings ----------------------------------------------------------
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
  const texCache = new Map();
  function materialFor(color, floors) {
    const key = color + ':' + floors;
    if (!texCache.has(key)) {
      const tex = buildingTexture(createRng(color * 31 + floors * 7 + 5), color, floors);
      texCache.set(key, new THREE.MeshLambertMaterial({ map: tex }));
    }
    return texCache.get(key);
  }

  const blockCentres = [];
  for (let i = 0; i < CITY.streets.length - 1; i++) {
    for (let j = 0; j < CITY.streets.length - 1; j++) {
      blockCentres.push({
        x: (CITY.streets[i] + CITY.streets[i + 1]) / 2,
        z: (CITY.streets[j] + CITY.streets[j + 1]) / 2,
      });
    }
  }
  for (const b of blockCentres) {
    const downtown = Math.abs(b.x) <= 95 && Math.abs(b.z) <= 95;
    const count = downtown ? randInt(rng, 1, 2) : randInt(rng, 2, 4);
    for (let k = 0; k < count; k++) {
      const w = downtown ? rand(rng, 18, 26) : rand(rng, 10, 18);
      const d = downtown ? rand(rng, 18, 26) : rand(rng, 10, 16);
      const h = downtown ? rand(rng, 30, 78) : rand(rng, 6, 22);
      const floors = Math.max(2, Math.round(h / 4));
      const ox = (k % 2 === 0 ? -1 : 1) * (count > 1 ? 11 : 0) * (k > 0 ? 1 : 0);
      const oz = (k >= 2 ? -11 : 0);
      const x = b.x + ox + rand(rng, -4, 4);
      const z = b.z + oz + rand(rng, -4, 4);
      const color = pick(rng, PALETTE);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materialFor(color, floors));
      mesh.position.set(x, h / 2, z);
      scene.add(mesh);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.8, d * 0.92), roofMat);
      roof.position.set(x, h + 0.4, z);
      scene.add(roof);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      // Rooftop beacon on the tallest downtown towers.
      if (downtown && h > 60) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.7, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff4444 }),
        );
        beacon.position.set(x, h + 1.6, z);
        scene.add(beacon);
      }
    }
  }

  // --- palms: beachfront row + avenue corners ------------------------------
  for (let x = -220; x <= 220; x += 22) {
    const palm = makePalm(rng);
    palm.position.set(x + rand(rng, -4, 4), 0, 208 + rand(rng, -3, 3));
    scene.add(palm);
  }
  for (const s of CITY.streets) {
    for (const t of [-186, 186]) {
      if (rng() < 0.6) {
        const palm = makePalm(rng);
        palm.position.set(s + 10, 0, t + 10);
        scene.add(palm);
      }
    }
  }

  // --- street lamps along the main avenues --------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const s of [-124, 0, 124]) {
    for (let z = -180; z <= 180; z += 62) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
      pole.position.set(s + 8.5, 3, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      bulb.position.set(s + 8.5, 6.2, z);
      scene.add(bulb);
    }
  }

  // --- marina pier (south-west beach) --------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 42), pierMat);
  pier.position.set(-150, 0.6, 232);
  scene.add(pier);
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), pierMat);
    post.position.set(-154.5, 0.4, 214 + i * 9);
    scene.add(post);
    const post2 = post.clone();
    post2.position.x = -145.5;
    scene.add(post2);
  }
  // A few moored boats: hull + mast.
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  for (let i = 0; i < 4; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), hullMat);
    hull.position.y = 0.4;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), poleMat);
    mast.position.y = 3.5;
    boat.add(mast);
    boat.position.set(-168 + i * 12, 0, 262 + (i % 2) * 8);
    boat.rotation.y = rand(rng, -0.2, 0.2);
    scene.add(boat);
  }

  return { colliders, landmarks, sun, hemi, lampMat };
}

/** Move the sun / sky for a time of day: 0 = midday, 1 = golden sunset. */
export function setTimeOfDay(scene, city, t) {
  const skyMid = new THREE.Color(0x87bfe8);
  const skySet = new THREE.Color(0xff9a52);
  const fogMid = new THREE.Color(0x9fc6e8);
  const fogSet = new THREE.Color(0xe8906a);
  scene.background.copy(skyMid).lerp(skySet, t);
  scene.fog.color.copy(fogMid).lerp(fogSet, t);
  const angle = Math.PI * (0.28 + 0.22 * t);
  city.sun.position.set(Math.cos(angle) * 200, Math.sin(angle) * 200, 60 + 120 * t);
  city.sun.color.setHex(t > 0.6 ? 0xffb36b : 0xffe6b0);
  city.sun.intensity = 2.1 - 0.7 * t;
  city.hemi.intensity = 0.95 - 0.35 * t;
}

// --- Phase 2 helpers: road + sidewalk points for traffic and pedestrians ---

/** A random point on a road centreline, with the driving direction along it. */
export function randomRoadPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = rand(rng, -180, 180);
  if (rng() < 0.5) return { x: street, z: along, axis: 'ns', dir: rng() < 0.5 ? 1 : -1 };
  return { x: along, z: street, axis: 'ew', dir: rng() < 0.5 ? 1 : -1 };
}

/** A random point on a sidewalk beside a road (roads are 14 wide, so the
 *  sidewalk sits ~10.5 from the centreline). Pedestrians walk here. */
export function randomSidewalkPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = rand(rng, -185, 185);
  const side = rng() < 0.5 ? -10.5 : 10.5;
  if (rng() < 0.5) return { x: street + side, z: along };
  return { x: along, z: street + side };
}

/** Nearest street centreline coordinate to a value (for snapping turns). */
export function nearestStreet(v) {
  let best = CITY.streets[0];
  for (const s of CITY.streets) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}
