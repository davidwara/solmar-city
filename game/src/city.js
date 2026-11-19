// Solmar City — the procedural coastal city Mara drives through.
// One seeded pass builds the whole town: the sky and sea, the 7x7
// street grid, the downtown towers and low blocks, the palms and lamps,
// the marina pier and the Golden Gull casino. Everything is placed from
// a single deterministic random stream, so a seed always rebuilds the
// same streets, the same towers, the same beach.
import * as THREE from 'three';
import { createRng, pick, rand, randInt } from './utils.js';

// The city's constants: street pitch, road half-width, the seven
// north-south (and east-west) street centrelines, where the sand and the
// sea start, and how far Mara may roam.
export const CITY = {
  pitch: 62,
  roadHalf: 7,
  streets: [-186, -124, -62, 0, 62, 124, 186],
  beachZ: 210,
  seaZ: 250,
  bound: 235,
};

// The Golden Gull casino sits on the downtown-east block, door facing south.
export const CASINO_POS = { x: 155, z: 155 };

// Facade colours: warm creams, terracotta, ochre, sea blue, sage.
const FACADE_COLORS = [
  0xf2e3c9, 0xe8b4a0, 0xd9a441, 0x7fb3c8, 0xc96f5a, 0x9db98a,
  0xe6d7b8, 0xb7c9d9, 0xf0c98a, 0xd98a7a, 0x8aa8b8, 0xe9e2d0,
];

const SKY_NOON = new THREE.Color(0x87bfe8);
const SKY_GOLD = new THREE.Color(0xff9a52);
const FOG_NOON = new THREE.Color(0x9fc6e8);
const FOG_GOLD = new THREE.Color(0xe8906a);
const ROOF_COLOR = 0x5a5f66;
const BEACON_COLOR = 0xff2a2a;

// Blocks kept clear of generated buildings: the casino block and the
// downtown-loft lot, both hand-placed landmarks.
const CLEAR_BLOCKS = [
  { x: 155, z: 155 },
  { x: 93, z: -93 },
];

// Offsets for the buildings inside one block: the four quadrants, so a
// block's buildings stand apart instead of stacking on the centreline.
const QUADRANT_OFFSETS = [[-11, -11], [11, -11], [-11, 11], [11, 11]];

/** A flat plane lying on the ground, for ground / sand / sea / roads. */
function groundPlane(w, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

// Window-grid textures, cached by facade colour + floor count so every
// identical building shares one material instead of its own canvas.
const textureCache = new Map();

/** A facade texture: base colour, a top-to-bottom light gradient, and a
 *  grid of windows — 5 across, floors down — lit warm 28% of the time. */
function facadeTexture(baseColor, floors) {
  const key = `${baseColor}:${floors}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const rows = Math.max(3, Math.min(18, floors));
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${baseColor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 128, 256);
  const shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, 256);
  // The lit/dark pattern is seeded by colour + floors, so the same
  // building always gets the same windows.
  const wrng = createRng((baseColor >>> 0) + floors * 7919 + 13);
  const cellW = 128 / 5;
  const cellH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      ctx.fillStyle = wrng() < 0.28 ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(c * cellW + 5, r * cellH + 5, cellW - 10, cellH - 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** One palm: a leaning trunk, six cone fronds fanning out at the crown,
 *  and a coconut at the top. Height varies 5–8m. */
function buildPalm(rng) {
  const palm = new THREE.Group();
  const height = rand(rng, 5, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.26, height, 7),
    trunkMat,
  );
  trunk.position.y = height / 2;
  trunk.rotation.z = rand(rng, -0.08, 0.08);
  palm.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 5), frondMat);
    frond.position.set(Math.sin(a) * 1.35, height + 0.35, Math.cos(a) * 1.35);
    frond.rotation.x = Math.cos(a) * 1.15;
    frond.rotation.z = -Math.sin(a) * 1.15;
    palm.add(frond);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6a4a22 }),
  );
  nut.position.set(0, height + 0.15, 0);
  palm.add(nut);
  return palm;
}

/** Build the city into the scene. Returns colliders, landmarks, lights
 *  and the shared road / lamp materials other systems drive. */
export function buildCity(scene, seed) {
  const rng = createRng(seed);
  const colliders = [];

  // Sky and light: hemisphere wash, a low warm sun, blue sky and haze.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 2.1);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(sun.target);
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc6e8, 260, 700);

  // Ground: grey sidewalks, the sand strip, the sea and a pale surf band.
  scene.add(groundPlane(560, 560, 0xb8b0a0, 0, 0, 10));
  scene.add(groundPlane(560, 46, 0xe8d29a, 0, 0.05, 233));
  scene.add(groundPlane(560, 220, 0x2e7fb8, 0, 0.02, 366));
  scene.add(groundPlane(560, 4, 0x9fd4e8, 0, 0.06, 254));

  // Roads: one north-south and one east-west strip per street, with a
  // yellow centre line down each.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
  for (const c of CITY.streets) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(14, 470), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.08, -10);
    scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(470, 14), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.08, c);
    scene.add(ew);
    const lineNs = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 470), lineMat);
    lineNs.rotation.x = -Math.PI / 2;
    lineNs.position.set(c, 0.1, -10);
    scene.add(lineNs);
    const lineEw = new THREE.Mesh(new THREE.PlaneGeometry(470, 0.5), lineMat);
    lineEw.rotation.x = -Math.PI / 2;
    lineEw.position.set(0, 0.1, c);
    scene.add(lineEw);
  }

  // Buildings: the 6x6 blocks between the streets. Downtown is the 3x3
  // blocks around the origin — taller towers, fewer per block.
  const roofMat = new THREE.MeshLambertMaterial({ color: ROOF_COLOR });
  const beaconMat = new THREE.MeshBasicMaterial({ color: BEACON_COLOR });
  const streets = CITY.streets;
  for (let i = 0; i < streets.length - 1; i++) {
    for (let j = 0; j < streets.length - 1; j++) {
      const cx = (streets[i] + streets[i + 1]) / 2;
      const cz = (streets[j] + streets[j + 1]) / 2;
      if (CLEAR_BLOCKS.some((b) => b.x === cx && b.z === cz)) continue;
      const downtown = Math.abs(cx) <= 95 && Math.abs(cz) <= 95;
      const count = downtown ? randInt(rng, 1, 2) : randInt(rng, 2, 4);
      for (let k = 0; k < count; k++) {
        const w = downtown ? rand(rng, 18, 26) : rand(rng, 10, 18);
        const d = downtown ? rand(rng, 18, 26) : rand(rng, 10, 16);
        const h = downtown ? rand(rng, 30, 78) : rand(rng, 6, 22);
        const floors = Math.max(2, Math.round(h / 4));
        const off = QUADRANT_OFFSETS[k % QUADRANT_OFFSETS.length];
        const bx = cx + (count > 1 ? off[0] : 0) + rand(rng, -4, 4);
        const bz = cz + (count > 1 ? off[1] : 0) + rand(rng, -4, 4);
        const color = pick(rng, FACADE_COLORS);
        const tex = facadeTexture(color, floors);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        body.position.set(bx, h / 2, bz);
        scene.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.8, d * 0.92), roofMat);
        roof.position.set(bx, h + 0.4, bz);
        scene.add(roof);
        colliders.push({
          minX: bx - w / 2, maxX: bx + w / 2,
          minZ: bz - d / 2, maxZ: bz + d / 2,
        });
        // The tallest downtown towers carry a red rooftop beacon.
        if (downtown && h > 60) {
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), beaconMat);
          beacon.position.set(bx, h + 1.6, bz);
          scene.add(beacon);
        }
      }
    }
  }

  // Palms: a beachfront row, then a chance of one at each avenue corner.
  for (let x = -220; x <= 220; x += 22) {
    const palm = buildPalm(rng);
    palm.position.set(x + rand(rng, -4, 4), 0, 208 + rand(rng, -3, 3));
    scene.add(palm);
  }
  for (const s of streets) {
    for (const end of [-186, 186]) {
      if (rng() < 0.6) {
        const palm = buildPalm(rng);
        palm.position.set(s + 10, 0, end + 10);
        scene.add(palm);
      }
    }
  }

  // Street lamps on the three main avenues: dark pole, warm bulb.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  for (const avenue of [-124, 0, 124]) {
    for (let z = -180; z <= 180; z += 62) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
      pole.position.set(avenue + 8.5, 3, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      bulb.position.set(avenue + 8.5, 6.2, z);
      scene.add(bulb);
    }
  }

  // Marina pier (south-west beach): wooden deck, post pairs, four moored
  // boats with masts bobbing beside it.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.6, 42),
    new THREE.MeshLambertMaterial({ color: 0x9a7b52 }),
  );
  pier.position.set(-150, 0.6, 232);
  scene.add(pier);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  for (let z = 214; z <= 214 + 4 * 9; z += 9) {
    for (const px of [-154.5, -145.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8), postMat);
      post.position.set(px, 1.2, z);
      scene.add(post);
    }
  }
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  for (let i = 0; i < 4; i++) {
    const bx = -168 + i * 12;
    const bz = 262 + (i % 2) * 8;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), hullMat);
    hull.position.set(bx, 0.6, bz);
    hull.rotation.y = rand(rng, -0.3, 0.3);
    scene.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), mastMat);
    mast.position.set(bx, 3.6, bz);
    mast.rotation.y = hull.rotation.y;
    scene.add(mast);
  }

  // The Golden Gull casino: a dark purple-gold block with a gold trim
  // slab on top. Solid — Mara walks around it.
  const casinoBody = new THREE.Mesh(
    new THREE.BoxGeometry(22, 12, 22),
    new THREE.MeshLambertMaterial({ color: 0x3a2b4a }),
  );
  casinoBody.position.set(CASINO_POS.x, 6, CASINO_POS.z);
  scene.add(casinoBody);
  const casinoTrim = new THREE.Mesh(
    new THREE.BoxGeometry(23, 1.6, 23),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  casinoTrim.position.set(CASINO_POS.x, 11.4, CASINO_POS.z);
  scene.add(casinoTrim);
  colliders.push({
    minX: CASINO_POS.x - 11, maxX: CASINO_POS.x + 11,
    minZ: CASINO_POS.z - 11, maxZ: CASINO_POS.z + 11,
  });

  const landmarks = {
    downtown: new THREE.Vector3(0, 0, 0),
    beach: new THREE.Vector3(0, 0, 235),
    marina: new THREE.Vector3(-150, 0, 225),
    docks: new THREE.Vector3(150, 0, 186),
    safehouse: new THREE.Vector3(124, 0, 200),
    drop: new THREE.Vector3(62, 0, -62),
  };

  return { colliders, landmarks, sun, hemi, lampMat, roadMat };
}

/** Slide the light from midday (t = 0) to golden sunset (t = 1): the sky
 *  and fog warm up, the sun arcs down toward the west and dims. */
export function setTimeOfDay(scene, city, t) {
  const sky = SKY_NOON.clone().lerp(SKY_GOLD, t);
  const fog = FOG_NOON.clone().lerp(FOG_GOLD, t);
  scene.background.copy(sky);
  if (scene.fog) scene.fog.color.copy(fog);
  const angle = Math.PI * (0.28 + 0.22 * t);
  city.sun.position.set(Math.cos(angle) * 200, Math.sin(angle) * 200, 60 + 120 * t);
  city.sun.color.setHex(t > 0.6 ? 0xffb36b : 0xffe6b0);
  city.sun.intensity = 2.1 - 0.7 * t;
  city.hemi.intensity = 0.95 - 0.35 * t;
}

/** True on the narrow causeway deck from the beach to the island's north
 *  shore — the only dry crossing over the bay. */
export function isOnCauseway(x, z) {
  return Math.abs(x - 40) <= 5.5 && z >= 247 && z <= 305;
}

/** A random point on a road: a street centreline and an along-track spot,
 *  with the axis and the direction of travel on it. */
export function randomRoadPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = rand(rng, -180, 180);
  const dir = rng() < 0.5 ? 1 : -1;
  if (rng() < 0.5) return { x: street, z: along, axis: 'ns', dir };
  return { x: along, z: street, axis: 'ew', dir };
}

/** A random point on a sidewalk: a street centreline, an along-track spot
 *  and a side offset — roads are 14 wide, so the sidewalk sits ~10.5m out. */
export function randomSidewalkPoint(rng) {
  const street = pick(rng, CITY.streets);
  const along = rand(rng, -185, 185);
  const side = rng() < 0.5 ? 10.5 : -10.5;
  if (rng() < 0.5) return { x: street + side, z: along, axis: 'ns', dir: side > 0 ? 1 : -1 };
  return { x: along, z: street + side, axis: 'ew', dir: side > 0 ? 1 : -1 };
}

/** The street centreline coordinate closest to v. */
export function nearestStreet(v) {
  let best = CITY.streets[0];
  for (const s of CITY.streets) {
    if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  }
  return best;
}
