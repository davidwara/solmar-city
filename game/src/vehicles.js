// Vehicles: procedural boxy cars and arcade driving physics.
// Cars are built from boxes + cylinder wheels — no external models. Driving
// is deliberately arcade: strong acceleration, forgiving steering, quick
// stops, and a soft slide when the wheels lose grip at speed.
import * as THREE from 'three';
import { clamp, lerpAngle, wrapAngle } from './utils.js';
import { resolveCollisions } from './player.js';

const CAR_COLORS = [0xd23b3b, 0x2e6fd8, 0xf2c14e, 0x3fae6a, 0x8a5fc0, 0xe8e8e8, 0x222831, 0xff7a2a];

/** One mesh, positioned and added to a group — the car builders' shorthand. */
function box(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function buildCarMesh(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2b36 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  box(group, new THREE.BoxGeometry(1.9, 0.62, 4.3), paint, 0, 0.55, 0);
  box(group, new THREE.BoxGeometry(1.65, 0.55, 2.1), glass, 0, 1.1, -0.25);
  box(group, new THREE.BoxGeometry(1.7, 0.1, 2.0), paint, 0, 1.42, -0.25);
  // Headlights + taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.6, 0.6]) {
    box(group, new THREE.BoxGeometry(0.35, 0.16, 0.08), lightMat, x, 0.55, 2.16);
    box(group, new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat, x, 0.55, -2.16);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = box(group, wheelGeo, tyre, x, 0.36, z);
    w.rotation.z = Math.PI / 2;
    wheels.push(w);
  }
  return { group, wheels };
}

export function createCar(scene, x, z, heading, color) {
  const { group, wheels } = buildCarMesh(color);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    group, wheels,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    steer: 0,
    color,
    driven: false,
    hp: 3, // gunfire damage: 0 = disabled, engine dead
  };
}

/** Damage a car by n hits; at 0 hp it stops dead (smoke not modelled). */
export function damageCar(car, n = 1) {
  if (!car || typeof car.hp !== 'number') return false;
  car.hp = Math.max(0, car.hp - n);
  if (car.hp === 0) car.speed = 0;
  return car.hp === 0;
}

/** Park a row of cars along the roads so the player can steal one. */
export function spawnParkedCars(scene, rngSeed) {
  const spots = [
    [0, -40, 0], [62, 30, Math.PI / 2], [-62, -90, -Math.PI / 2], [124, 80, Math.PI], [0, 100, 0],
    [-124, -30, Math.PI / 2], [62, -150, 0], [-62, 150, Math.PI], [186, -60, -Math.PI / 2], [124, 170, Math.PI],
  ];
  const cars = [];
  spots.forEach(([x, z, heading], i) => {
    cars.push(createCar(scene, x, z, heading, CAR_COLORS[i % CAR_COLORS.length]));
  });
  return cars;
}

export function updateCar(car, dt, input, colliders, bound, grip = 1) {
  const accel = (input.forward ? 16 : 0) * grip;
  const brake = input.back ? 22 : 0;
  const reverse = input.back && car.speed < 0.5 ? 8 : 0;
  car.speed += (accel + reverse - brake * (car.speed > 0 ? 1 : 0)) * dt;
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (!input.forward && !input.back) car.speed -= car.speed * 1.1 * dt;
  // Phase 7: limp mode — a car down to its last hit point can only crawl
  // at 14 m/s, so gunfire has a cost even before the engine dies.
  const topSpeed = (car.hp ?? 3) <= 1 ? 14 : 30 + (car.engineLevel || 0) * 6;
  car.speed = clamp(car.speed, -9, topSpeed); // garage engine upgrades raise the top speed
  if (Math.abs(car.speed) < 0.05 && !input.forward && !input.back) car.speed = 0;
  // Steering scales with speed and flips in reverse.
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const steerAmount = car.steer * 0.55 * clamp(Math.abs(car.speed) / 8, 0, 1) * grip;
  car.heading += steerAmount * (car.speed >= 0 ? 1 : -1) * dt * (Math.abs(car.speed) > 0.1 ? 1 : 0);
  car.heading = wrapAngle(car.heading);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  car.pos.x = clamp(car.pos.x, -bound, bound);
  car.pos.z = clamp(car.pos.z, -bound, bound + 40);
  resolveCollisions(car.pos, 2.0, colliders);
  car.group.position.copy(car.pos);
  car.group.rotation.y = car.heading;
  // Spin the wheels; steer the front pair.
  for (const w of car.wheels) w.rotation.x += car.speed * dt * 2.2;
  car.wheels[0].rotation.y = car.steer * 0.3;
  car.wheels[1].rotation.y = car.steer * 0.3;
}

/** Nearest car within reach of the player, or null. */
export function nearestCar(cars, pos, maxDist) {
  if (!cars || cars.length === 0) return null;
  let best = null;
  let bestD = Math.max(0, maxDist);
  for (const car of cars) {
    const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Red/blue emergency light bar for a police car roof. Returns the two
 *  lamp meshes so police.js can flash them alternately. */
export function addLightBar(group) {
  box(group, new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }), 0, 1.52, -0.25);
  const red = box(group, new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.28, 1.56, -0.25);
  const blue = box(group, new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0x2266ff }), 0.28, 1.56, -0.25);
  return { red, blue };
}

/**
 * Phase 6: bolt a rear spoiler onto a car group — the mark of a street
 * racer. Races add it the first time Mara lines up at the garage flag;
 * it stays on the car for good.
 */
export function addSpoiler(group) {
  if (!group || group.userData.spoiler) return false;
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
  box(group, new THREE.BoxGeometry(1.7, 0.1, 0.45), dark, 0, 1.35, -1.95);
  for (const sx of [-0.6, 0.6]) box(group, new THREE.BoxGeometry(0.1, 0.35, 0.1), dark, sx, 1.15, -1.95);
  group.userData.spoiler = true;
  return true;
}
