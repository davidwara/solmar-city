// The second island: a district across the bay from Solmar City.
// A narrow causeway bridge (the only dry crossing) runs from the mainland
// beach at x = 40 down to the island's north shore. The island holds its
// own cluster of low-rise blocks, a palm grove, a crescent beach, and the
// Solmar lighthouse — its rotating beam sweeps the bay at night and is the
// goal of the Lighthouse Keeper job. The island is drawn on the minimap
// from ISLAND_BOUNDS, and its buildings block movement like the mainland's.
import * as THREE from 'three';
import { createRng, pick, rand } from './utils.js';

// Island land: a rounded rectangle of dry ground in the middle of the bay.
export const ISLAND_BOUNDS = { minX: -80, maxX: 160, minZ: 300, maxZ: 430 };
export const LIGHTHOUSE_POS = new THREE.Vector3(120, 0, 398);
export const ISLAND_DOCK = new THREE.Vector3(40, 0, 312);
export const CAUSEWAY_X = 40;

const ISLAND_PALETTE = [
  0xf2e3c9, 0xe8b4a0, 0x7fb3c8, 0x9db98a, 0xe6d7b8, 0xd98a7a, 0xf0c98a,
];

/** A low island block: painted box, flat roof, lit windows at night. */
function makeIslandBlock(rng, x, z, w, d, h, color) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  group.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
  );
  roof.position.y = h + 0.2;
  group.add(roof);
  // Windows: a grid of small emissive panes so the island glows at night.
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const floors = Math.max(1, Math.floor(h / 4));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < Math.max(2, Math.floor(w / 4)); c++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), winMat);
      win.position.set(-w / 2 + 2 + c * 3.4, 2.4 + f * 3.6, d / 2 + 0.06);
      group.add(win);
    }
  }
  group.position.set(x, 0, z);
  return group;
}

/** A palm: leaning trunk, five fronds, a coconut cluster. */
function makeIslandPalm(rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.5, 7), trunkMat);
  trunk.position.y = 3.25;
  trunk.rotation.z = rand(rng, -0.12, 0.12);
  group.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4a });
  for (let i = 0; i < 5; i++) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 3.4), frondMat);
    const a = (i / 5) * Math.PI * 2;
    frond.position.set(Math.sin(a) * 1.5, 6.6, Math.cos(a) * 1.5);
    frond.rotation.y = a;
    frond.rotation.x = -0.5;
    group.add(frond);
  }
  const nuts = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6a4a22 }),
  );
  nuts.position.set(0.3, 6.2, 0.2);
  group.add(nuts);
  return group;
}

/** The causeway: a low road on pillars from the beach to the island. */
function buildCauseway(scene) {
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x5a5a58 });
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x8a8a86 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 58), roadMat);
  deck.position.set(CAUSEWAY_X, 0.9, 276);
  scene.add(deck);
  for (const px of [CAUSEWAY_X - 4, CAUSEWAY_X + 4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 58), railMat);
    rail.position.set(px, 1.7, 276);
    scene.add(rail);
  }
  for (const pz of [256, 272, 288, 298]) {
    for (const px of [CAUSEWAY_X - 3.5, CAUSEWAY_X + 3.5]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.4, 8), pillarMat);
      pillar.position.set(px, -0.6, pz);
      scene.add(pillar);
    }
  }
  // Centre line dashes so it reads as a road from the air.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let z = 252; z < 300; z += 6) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 2.6), dashMat);
    dash.position.set(CAUSEWAY_X, 1.32, z);
    scene.add(dash);
  }
}

/** The lighthouse: striped tower, lamp room, and a rotating beam. */
function buildLighthouse(scene) {
  const group = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xd23b3b });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  // Five stacked drums, alternating red and white.
  for (let i = 0; i < 5; i++) {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6 - i * 0.22, 2.9 - i * 0.22, 4.4, 12),
      i % 2 === 0 ? white : red,
    );
    drum.position.y = 2.2 + i * 4.4;
    group.add(drum);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 12), white);
  gallery.position.y = 24.4;
  group.add(gallery);
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.0, 3.2, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8 }),
  );
  lamp.position.y = 26.4;
  group.add(lamp);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 2.4, 12),
    new THREE.MeshLambertMaterial({ color: 0x222831 }),
  );
  cap.position.y = 29.2;
  group.add(cap);

  // The beam: a long translucent cone that sweeps the bay at night.
  const beamGeo = new THREE.ConeGeometry(4.5, 70, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff6c8, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(35, 26.4, 0);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 0;
  beamPivot.add(beam);
  group.add(beamPivot);
  const lampLight = new THREE.PointLight(0xfff2b0, 0, 90);
  lampLight.position.y = 26.4;
  group.add(lampLight);

  group.position.copy(LIGHTHOUSE_POS);
  scene.add(group);
  return { group, beamPivot, beamMat, lampLight, lamp };
}

/** Build the island district. Returns colliders, lighthouse and update. */
export function buildIsland(scene, seed) {
  const rng = createRng(seed + 77);
  const colliders = [];

  // Island ground: sand ring over a grass-topped rise, set into the sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 140),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(40, 0.04, 365);
  scene.add(sand);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(210, 110),
    new THREE.MeshLambertMaterial({ color: 0x6fae62 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(40, 0.07, 368);
  scene.add(grass);

  // The building cluster: six low blocks around a small plaza.
  const blocks = [
    { x: -20, z: 330, w: 18, d: 14, h: 9 },
    { x: 18, z: 326, w: 14, d: 12, h: 12 },
    { x: 56, z: 330, w: 20, d: 14, h: 7 },
    { x: -34, z: 366, w: 16, d: 14, h: 11 },
    { x: 8, z: 372, w: 22, d: 16, h: 8 },
    { x: 62, z: 372, w: 14, d: 12, h: 14 },
  ];
  for (const b of blocks) {
    const color = pick(rng, ISLAND_PALETTE);
    scene.add(makeIslandBlock(rng, b.x, b.z, b.w, b.d, b.h, color));
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
  }

  // Palm groves along the east and west shores.
  const palmSpots = [
    [-62, 322], [-68, 350], [-58, 388], [-44, 412],
    [140, 326], [148, 356], [138, 390], [128, 416],
    [0, 414], [40, 418], [80, 414],
  ];
  for (const [px, pz] of palmSpots) {
    const palm = makeIslandPalm(rng);
    palm.position.set(px + rand(rng, -2, 2), 0, pz + rand(rng, -2, 2));
    palm.rotation.y = rand(rng, 0, Math.PI * 2);
    scene.add(palm);
  }

  // A plaza fountain at the island's heart.
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 5, 1.0, 14),
    new THREE.MeshLambertMaterial({ color: 0x9db8c8 }),
  );
  basin.position.set(24, 0.5, 352);
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(4.0, 4.0, 0.3, 14),
    new THREE.MeshBasicMaterial({ color: 0x2e7fb8 }),
  );
  water.position.set(24, 1.0, 352);
  scene.add(water);

  buildCauseway(scene);
  const lighthouse = buildLighthouse(scene);

  let lit = false;
  let beamAngle = 0;

  /** Light the lighthouse (Lighthouse Keeper job): beam + lamp go live. */
  function lightOn() {
    lit = true;
    lighthouse.lampLight.intensity = 60;
    lighthouse.beamMat.opacity = 0.3;
  }

  /** Rotate the beam at night; the lamp glows faintly even unlit. */
  function update(dt, isNight) {
    if (lit && isNight) {
      beamAngle += dt * 0.55;
      lighthouse.beamPivot.rotation.y = beamAngle;
      lighthouse.beamPivot.visible = true;
    } else if (lit) {
      lighthouse.beamPivot.visible = false;
    } else {
      lighthouse.beamPivot.visible = false;
    }
  }

  /** True when a world point stands on island land (for boat disembark). */
  function onIsland(x, z) {
    return x >= ISLAND_BOUNDS.minX && x <= ISLAND_BOUNDS.maxX
      && z >= ISLAND_BOUNDS.minZ && z <= ISLAND_BOUNDS.maxZ;
  }

  return {
    colliders,
    lighthouse,
    lightOn,
    update,
    onIsland,
    isLit: () => lit,
    bounds: ISLAND_BOUNDS,
    lighthousePos: LIGHTHOUSE_POS.clone(),
    dockPos: ISLAND_DOCK.clone(),
  };
}
