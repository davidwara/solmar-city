// Solmar City — a procedural coastal city on a road grid: towers downtown,
// low blocks out on the avenues, a beachfront, a marina pier, the Golden
// Gull casino, palms and street lamps. Built once from a seed; the same
// seed always builds the same city.
import * as THREE from 'three';
import { createRng, pick, rand, randInt } from './utils.js';

/** City constants: street pitch, road half-width, streets, shore, bound. */
export const CITY = {
  pitch: 62,
  roadHalf: 7,
  streets: [-186, -124, -62, 0, 62, 124, 186],
  beachZ: 210,
  seaZ: 250,
  bound: 235,
};

/** The Golden Gull casino sits on the downtown-east block, door south. */
export const CASINO_POS = { x: 155, z: 155 };

/** Block centres: the midpoints between adjacent streets (6 x 6). */
const BLOCKS = [-155, -93, -31, 31, 93, 155];

/** Warm coastal palette for the building facades. */
const FACADE_COLORS = [
  0xf2e3c9, 0xe8b4a0, 0xd9a441, 0x7fb3c8, 0xc96f5a, 0x9db98a,
  0xe6d7b8, 0xb7c9d9, 0xf0c98a, 0xd98a7a, 0x8aa8b8, 0xe9e2d0,
];

/** One mesh, positioned and added — the city's shorthand. */
function put(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * A window-grid facade texture for one building colour and floor count.
 * Cached so identical buildings share one material; the lit-window roll
 * is seeded from colour + floors so it is stable across rebuilds.
 */
function facadeTexture(color, floors, cache) {
  const key = `${color}_${floors}`;
  let tex = cache.get(key);
  if (tex) return tex;
  const rows = Math.max(3, Math.min(18, floors));
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const base = `#${color.toString(16).padStart(6, '0')}`;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const shade = g.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 256);
  const roll = createRng((color ^ (floors * 7919)) >>> 0);
  const cellW = 128 / 5;
  const cellH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      g.fillStyle = roll() < 0.28 ? '#ffe9a8' : '#2c3e50';
      g.fillRect(c * cellW + 4, r * cellH + 5, cellW - 8, cellH - 10);
    }
  }
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** One palm: a leaning trunk, six tilted fronds and a coconut crown. */
function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkH = rand(rng, 5, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, trunkH, 6), trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = rand(rng, -0.08, 0.08);
  palm.add(trunk);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 5), frondMat);
    frond.position.set(Math.sin(a) * 1.2, trunkH + 0.6, Math.cos(a) * 1.2);
    frond.rotation.z = -Math.sin(a) * 1.05;
    frond.rotation.x = Math.cos(a) * 1.05;
    palm.add(frond);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
  );
  nut.position.y = trunkH + 0.2;
  palm.add(nut);
  return palm;
}

/**
 * Build the city into the scene. Returns the colliders, the landmark map,
 * the sun and hemisphere lights, and the lamp and road materials (day/night
 * and weather tune those live).
 */
export function buildCity(scene, seed) {
  const rng = createRng(seed);
  const colliders = [];
  const landmarks = {
    downtown: new THREE.Vector3(0, 0, 0),
    beach: new THREE.Vector3(0, 0, 235),
    marina: new THREE.Vector3(-150, 0, 225),
    docks: new THREE.Vector3(150, 0, 186),
    safehouse: new THREE.Vector3(124, 0, 200),
    drop: new THREE.Vector3(62, 0, -62),
  };

  // --- sky and lights -----------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 2.1);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(sun.target);
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc6e8, 260, 700);

  // --- ground: pavement, sand, sea and the surf line ----------------------
  const flat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), flat);
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
  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 4),
    new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(0, 0.06, 254);
  scene.add(surf);

  // --- roads and centre lines ---------------------------------------------
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
    const nsLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 470), lineMat);
    nsLine.rotation.x = -Math.PI / 2;
    nsLine.position.set(c, 0.1, -10);
    scene.add(nsLine);
    const ewLine = new THREE.Mesh(new THREE.PlaneGeometry(470, 0.5), lineMat);
    ewLine.rotation.x = -Math.PI / 2;
    ewLine.position.set(0, 0.1, c);
    scene.add(ewLine);
  }

  // --- buildings: 36 blocks, two kept clear for landmarks ----------------
  const textureCache = new Map();
  const materialCache = new Map();
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const offsets = [[0, 0], [-11, 0], [11, 0], [0, -11], [0, 11]];
  for (const cx of BLOCKS) {
    for (const cz of BLOCKS) {
      // The casino block and the loft lot stay open for hand-placed work.
      if (cx === 155 && cz === 155) continue;
      if (cx === 93 && cz === -93) continue;
      const downtown = Math.abs(cx) <= 95 && Math.abs(cz) <= 95;
      const count = downtown ? randInt(rng, 1, 2) : randInt(rng, 2, 4);
      for (let i = 0; i < count; i++) {
        const w = downtown ? rand(rng, 18, 26) : rand(rng, 10, 18);
        const d = downtown ? rand(rng, 18, 26) : rand(rng, 10, 16);
        const h = downtown ? rand(rng, 30, 78) : rand(rng, 6, 22);
        const floors = Math.max(2, Math.round(h / 4));
        const color = pick(rng, FACADE_COLORS);
        const matKey = `${color}_${floors}`;
        let mat = materialCache.get(matKey);
        if (!mat) {
          mat = new THREE.MeshLambertMaterial({ map: facadeTexture(color, floors, textureCache) });
          materialCache.set(matKey, mat);
        }
        const ox = offsets[i % offsets.length][0];
        const oz = offsets[i % offsets.length][1];
        const x = cx + rand(rng, -4, 4) + ox;
        const z = cz + rand(rng, -4, 4) + oz;
        put(scene, new THREE.BoxGeometry(w, h, d), mat, x, h / 2, z);
        put(scene, new THREE.BoxGeometry(w * 0.92, 0.8, d * 0.92), roofMat, x, h + 0.4, z);
        if (downtown && h > 60) {
          put(scene, new THREE.SphereGeometry(0.7, 8, 6), beaconMat, x, h + 1.6, z);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // --- palms: a beachfront row and a chance at every avenue corner --------
  for (let x = -220; x <= 220; x += 22) {
    const palm = makePalm(rng);
    palm.position.set(x + rand(rng, -4, 4), 0, 208 + rand(rng, -3, 3));
    scene.add(palm);
  }
  for (const street of CITY.streets) {
    for (const end of [-186, 186]) {
      if (rng() < 0.6) {
        const palm = makePalm(rng);
        palm.position.set(street + 10, 0, end + 10);
        scene.add(palm);
      }
    }
  }

  // --- street lamps on the three avenues ----------------------------------
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
  for (const avenue of [-124, 0, 124]) {
    for (let z = -180; z <= 180; z += 62) {
      put(scene, new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat, avenue + 8.5, 3, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      bulb.position.set(avenue + 8.5, 6.2, z);
      scene.add(bulb);
    }
  }

  // --- marina pier, its posts and the moored boats -------------------------
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  put(scene, new THREE.BoxGeometry(10, 0.6, 42), woodMat, -150, 0.6, 232);
  for (let k = 0; k < 5; k++) {
    const z = 214 + k * 9;
    put(scene, new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8), woodMat, -154.5, 1.2, z);
    put(scene, new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8), woodMat, -145.5, 1.2, z);
  }
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  for (let i = 0; i < 4; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), hullMat);
    hull.position.y = 0.6;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), woodMat);
    mast.position.y = 3.6;
    boat.add(mast);
    boat.position.set(-168 + i * 12, 0, 262 + (i % 2) * 8);
    boat.rotation.y = rand(rng, -0.2, 0.2);
    scene.add(boat);
  }

  // --- the Golden Gull casino: solid purple-gold, door facing south -------
  put(scene, new THREE.BoxGeometry(22, 12, 22),
    new THREE.MeshLambertMaterial({ color: 0x3a2b4a }), CASINO_POS.x, 6, CASINO_POS.z);
  put(scene, new THREE.BoxGeometry(23, 1.6, 23),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }), CASINO_POS.x, 11.4, CASINO_POS.z);
  colliders.push({
    minX: CASINO_POS.x - 11, maxX: CASINO_POS.x + 11,
    minZ: CASINO_POS.z - 11, maxZ: CASINO_POS.z + 11,
  });

  return { colliders, landmarks, sun, hemi, lampMat, roadMat };
}

/**
 * Slide the light from midday (t = 0) to golden sunset (t = 1): the sky
 * and fog warm up, the sun arcs down toward the sea and dims.
 */
export function setTimeOfDay(scene, city, t) {
  t = Math.max(0, Math.min(1, t)); // the sunset blend only means something in 0..1
  const skyDay = new THREE.Color(0x87bfe8);
  const skyDusk = new THREE.Color(0xff9a52);
  const fogDay = new THREE.Color(0x9fc6e8);
  const fogDusk = new THREE.Color(0xe8906a);
  scene.background.copy(skyDay).lerp(skyDusk, t);
  if (scene.fog) scene.fog.color.copy(fogDay).lerp(fogDusk, t);
  const angle = Math.PI * (0.28 + 0.22 * t);
  city.sun.position.set(Math.cos(angle) * 200, Math.sin(angle) * 200, 60 + 120 * t);
  city.sun.color.setHex(t > 0.6 ? 0xffb36b : 0xffe6b0);
  city.sun.intensity = 2.1 - 0.7 * t;
  city.hemi.intensity = 0.95 - 0.35 * t;
}

/** True on the narrow causeway deck from the beach to the island. */
export function isOnCauseway(x, z) {
  return Math.abs(x - 40) <= 5.5 && z >= 247 && z <= 305;
}

/** A random point on a random street, with its axis and direction. */
export function randomRoadPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = rand(rng, -180, 180);
  const dir = rng() < 0.5 ? 1 : -1;
  if (rng() < 0.5) return { x: street, z: along, axis: 'ns', dir };
  return { x: along, z: street, axis: 'ew', dir };
}

/** A random sidewalk point: a street, an along-track spot, a side offset. */
export function randomSidewalkPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = rand(rng, -185, 185);
  const side = rng() < 0.5 ? 10.5 : -10.5;
  const dir = rng() < 0.5 ? 1 : -1;
  if (rng() < 0.5) return { x: street + side, z: along, axis: 'ns', dir };
  return { x: along, z: street + side, axis: 'ew', dir };
}

/** The closest street centreline coordinate to v. */
export function nearestStreet(v) {
  let best = CITY.streets[0];
  let bestDist = Infinity;
  for (const s of CITY.streets) {
    const d = Math.abs(s - v);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
