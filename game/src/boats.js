// Boats: drivable boats moored at the Solmar marina.
// Four boats bob on the bay south of the beach. Mara boards one with E
// (standing close on the dock or the sand), steers it with WASD like a car
// — W throttle, S reverse, A/D rudder — and steps off with E again near a
// shore. Boats live on the water only: they are clamped to the bay and can
// never cross the beach line onto land, and they leave a fading white wake
// behind them. The causeway to the second island is the only dry crossing.
import * as THREE from 'three';
import { clamp, wrapAngle } from './utils.js';

// The bay: boats may sail anywhere in this rectangle of open water.
export const BAY = { minX: -260, maxX: 260, minZ: 258, maxZ: 470 }; // minZ is the beach line — boats stop here, they never beach themselves

// Phase 6: the Marina Market stall on the west dock — the third courier
// depot, where parcels change hands beside the moored boats.
export const MARINA_MARKET_POS = { x: -150, z: 240 };

// Where a boat is moored when nobody is driving it.
const MOORINGS = [
  { x: -168, z: 282, heading: 0.4, color: 0xe8e8e8, name: 'Gull' },
  { x: -138, z: 296, heading: -0.3, color: 0x2e6fd8, name: 'Marlin' },
  { x: -108, z: 282, heading: 0.2, color: 0xff7a2a, name: 'Coral' },
  { x: 66, z: 292, heading: 2.6, color: 0x3fae6a, name: 'Tide' },
];

/** One mesh, positioned and added — the boat builder's shorthand. */
function box(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Build one boat: hull, deck, cabin, mast, outboard motor, nav light. */
function buildBoatMesh(color) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color });
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xf2e3c9 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2b36 });

  // Hull: a long tapered box, white stripe along the waterline.
  box(group, new THREE.BoxGeometry(2.6, 0.9, 7.2), hullMat, 0, 0.55, 0);
  const bow = box(group, new THREE.ConeGeometry(1.3, 2.2, 4), hullMat, 0, 0.55, 4.6);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  box(group, new THREE.BoxGeometry(2.66, 0.22, 7.24), deckMat, 0, 0.32, 0);

  // Deck, cabin with windows, and a short mast with a red nav light.
  box(group, new THREE.BoxGeometry(2.3, 0.18, 6.4), deckMat, 0, 1.05, 0);
  box(group, new THREE.BoxGeometry(1.9, 0.9, 2.4), glassMat, 0, 1.55, -0.6);
  box(group, new THREE.BoxGeometry(2.0, 0.12, 2.6), hullMat, 0, 2.05, -0.6);
  box(group, new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), darkMat, 0, 3.3, -0.6);
  const navLight = box(group, new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3d3d }), 0, 4.65, -0.6);

  // Outboard motor at the stern, plus a bench seat.
  box(group, new THREE.BoxGeometry(0.6, 0.9, 0.5), darkMat, 0, 0.7, -3.8);
  box(group, new THREE.BoxGeometry(1.8, 0.16, 0.6), deckMat, 0, 1.25, 1.4);
  return { group, navLight };
}

/** A wooden dock finger jutting into the bay so boats can be boarded. */
function buildDock(scene, x, z, rotY) {
  const dock = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  box(dock, new THREE.BoxGeometry(4, 0.35, 26), wood, 0, 0.55, 0);
  for (const [px, pz] of [[-1.8, -12], [1.8, -12], [-1.8, 0], [1.8, 0], [-1.8, 12], [1.8, 12]]) {
    box(dock, new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), postMat, px, 0.5, pz);
  }
  dock.position.set(x, 0, z);
  dock.rotation.y = rotY;
  scene.add(dock);
  return dock;
}

/** Create the marina fleet. Returns the boats plus their update/boarding. */
export function createBoats(scene) {
  const boats = [];
  for (const m of MOORINGS) {
    const { group, navLight } = buildBoatMesh(m.color);
    group.position.set(m.x, 0, m.z);
    group.rotation.y = m.heading;
    scene.add(group);
    boats.push({
      group,
      navLight,
      name: m.name,
      color: m.color,
      pos: new THREE.Vector3(m.x, 0, m.z),
      heading: m.heading,
      speed: 0,
      rudder: 0,
      driven: false,
      home: new THREE.Vector3(m.x, 0, m.z),
      homeHeading: m.heading,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  // Two dock fingers at the marina so Mara can step aboard dry-shod.
  buildDock(scene, -150, 268, 0);
  buildDock(scene, -120, 268, 0);
  // A short jetty on the island side, where the delivery job lands.
  buildDock(scene, 40, 312, 0);

  // Wake particles: a pool of small white foam puffs recycled behind the
  // driven boat. Each puff has a life that fades it out and shrinks it.
  const wakeGeo = new THREE.BoxGeometry(0.9, 0.25, 0.9);
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.7 });
  const wakePool = [];
  for (let i = 0; i < 42; i++) {
    const puff = new THREE.Mesh(wakeGeo, wakeMat.clone());
    puff.visible = false;
    scene.add(puff);
    wakePool.push({ mesh: puff, life: 0 });
  }
  let wakeCursor = 0;
  let wakeTimer = 0;

  function spawnWake(boat) {
    const puff = wakePool[wakeCursor];
    wakeCursor = (wakeCursor + 1) % wakePool.length;
    const bx = Math.sin(boat.heading);
    const bz = Math.cos(boat.heading);
    puff.mesh.position.set(
      boat.pos.x - bx * 3.6 + (Math.random() - 0.5) * 1.6,
      0.15,
      boat.pos.z - bz * 3.6 + (Math.random() - 0.5) * 1.6,
    );
    puff.mesh.visible = true;
    puff.life = 1;
  }

  function updateWake(dt) {
    for (const puff of wakePool) {
      if (puff.life <= 0) continue;
      puff.life -= dt * 0.8;
      if (puff.life <= 0) {
        puff.mesh.visible = false;
        continue;
      }
      puff.mesh.material.opacity = 0.7 * puff.life;
      const s = 1 + (1 - puff.life) * 1.6;
      puff.mesh.scale.set(s, 1, s);
    }
  }

  /** Nearest boat within reach of a position, or null. */
  function nearest(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const boat of boats) {
      const d = Math.hypot(boat.pos.x - pos.x, boat.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = boat; }
    }
    return best;
  }

  /** Drive the boat under input (W throttle, S reverse, A/D rudder).
   *  `audio` is optional: the driven boat's engine hum follows its speed. */
  function update(dt, input, drivenBoat, time, audio) {
    // Every boat bobs gently on the swell, driven or moored.
    for (const boat of boats) {
      const bob = Math.sin(time * 1.4 + boat.bobPhase) * 0.14;
      boat.group.position.y = bob;
      boat.group.rotation.z = Math.sin(time * 1.1 + boat.bobPhase) * 0.03;
      boat.group.rotation.x = Math.sin(time * 0.9 + boat.bobPhase * 1.7) * 0.02;
      // Nav lights blink at night so the fleet is visible from the beach.
      boat.navLight.visible = Math.sin(time * 3 + boat.bobPhase) > -0.4;
    }
    updateWake(dt);
    if (!drivenBoat) {
      // Nobody aboard: the outboard falls silent.
      if (audio && audio.setBoatEngine) audio.setBoatEngine(0);
      return;
    }

    // Throttle: a boat gathers speed slowly and glides a long way.
    const throttle = (input.forward ? 11 : 0) + (input.back ? -5 : 0);
    drivenBoat.speed += throttle * dt;
    drivenBoat.speed -= drivenBoat.speed * 0.35 * dt;
    drivenBoat.speed = clamp(drivenBoat.speed, -6, 24);
    if (Math.abs(drivenBoat.speed) < 0.05 && !input.forward && !input.back) drivenBoat.speed = 0;

    // Rudder: the boat only turns while it has way on, and turns wide.
    const rudderTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    drivenBoat.rudder += (rudderTarget - drivenBoat.rudder) * Math.min(1, dt * 5);
    const turn = drivenBoat.rudder * 0.5 * clamp(Math.abs(drivenBoat.speed) / 9, 0, 1);
    drivenBoat.heading += turn * (drivenBoat.speed >= 0 ? 1 : -1) * dt;
    drivenBoat.heading = wrapAngle(drivenBoat.heading);

    const fx = Math.sin(drivenBoat.heading);
    const fz = Math.cos(drivenBoat.heading);
    drivenBoat.pos.x += fx * drivenBoat.speed * dt;
    drivenBoat.pos.z += fz * drivenBoat.speed * dt;

    // The bay is the boat's world: clamp it to open water. The beach line
    // stops it dead instead of letting it grind onto the sand.
    if (drivenBoat.pos.z < BAY.minZ) {
      drivenBoat.pos.z = BAY.minZ;
      if (drivenBoat.speed > 0 && Math.cos(drivenBoat.heading) < 0) drivenBoat.speed *= 0.2;
    }
    // Phase 7: shallow-water drag — within 20m of the beach line the
    // sandbar drags on the hull, so a boat loses way as it noses into
    // the shallows instead of charging the sand at full speed.
    const shallow = shallowAt(drivenBoat.pos.x, drivenBoat.pos.z);
    if (shallow > 0) {
      drivenBoat.speed -= drivenBoat.speed * 0.9 * shallow * dt;
    }
    drivenBoat.pos.x = clamp(drivenBoat.pos.x, BAY.minX, BAY.maxX);
    drivenBoat.pos.z = clamp(drivenBoat.pos.z, BAY.minZ, BAY.maxZ);
    if (drivenBoat.pos.x <= BAY.minX || drivenBoat.pos.x >= BAY.maxX) drivenBoat.speed *= 0.5;

    drivenBoat.group.position.x = drivenBoat.pos.x;
    drivenBoat.group.position.z = drivenBoat.pos.z;
    drivenBoat.group.rotation.y = drivenBoat.heading;

    // Wake: faster boat, denser foam.
    wakeTimer -= dt;
    if (Math.abs(drivenBoat.speed) > 3 && wakeTimer <= 0) {
      spawnWake(drivenBoat);
      wakeTimer = Math.abs(drivenBoat.speed) > 14 ? 0.05 : 0.12;
    }
    // Engine hum follows the driven boat's speed (0 when moored).
    if (audio && audio.setBoatEngine) audio.setBoatEngine(Math.abs(drivenBoat.speed) / 24);
  }

  /** Where Mara steps ashore when she leaves a boat: nearest dry land. */
  function shorePoint(boatPos) {
    // Island shore (the causeway side) is closer than the mainland beach.
    const toIsland = Math.hypot(boatPos.x - 40, boatPos.z - 306);
    const toBeach = Math.abs(boatPos.z - 246);
    if (toIsland < toBeach && boatPos.z > 280) return new THREE.Vector3(40, 0, 300);
    if (boatPos.x < -90) return new THREE.Vector3(-150, 0, 246);
    return new THREE.Vector3(boatPos.x, 0, 246);
  }

  /** Speed in km/h for the HUD, from the driven boat. */
  function speedKmh(boat) {
    return boat ? Math.abs(boat.speed) * 3.6 : 0;
  }

  return { boats, update, nearest, shorePoint, speedKmh, bay: BAY };
}

/**
 * Phase 7: how shallow the water is at a point — 0 in open water,
 * rising to 1 at the beach line — so hulls, wakes and the pier can all
 * feel the sandbar the same way. Only the beach side is shallow; the
 * bay stays deep east, west and south.
 */
export function shallowAt(x, z) {
  if (z >= BAY.minZ + 20) return 0;
  if (z <= BAY.minZ) return 1;
  return 1 - (z - BAY.minZ) / 20;
}
