// Vehicles: procedural boxy cars and arcade driving physics.
// Cars are built from boxes + cylinder wheels — no external models. Driving
// is deliberately arcade: strong acceleration, forgiving steering, quick
// stops, and a soft slide when the wheels lose grip at speed.
import * as THREE from 'three';
import { clamp, lerpAngle, wrapAngle } from './utils.js';
import { resolveCollisions } from './player.js';

const CAR_COLORS = [0xd23b3b, 0x2e6fd8, 0xf2c14e, 0x3fae6a, 0x8a5fc0, 0xe8e8e8, 0x222831, 0xff7a2a];

export function buildCarMesh(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2b36 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.1), glass);
  cabin.position.set(0, 1.1, -0.25);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 2.0), paint);
  roof.position.set(0, 1.42, -0.25);
  group.add(roof);
  // Headlights + taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), lightMat);
    hl.position.set(x, 0.55, 2.16);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat);
    tl.position.set(x, 0.55, -2.16);
    group.add(tl);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    group.add(w);
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
  };
}

/** Park a row of cars along the roads so the player can steal one. */
export function spawnParkedCars(scene, rngSeed) {
  const spots = [
    [0, -40, 0], [62, 30, Math.PI / 2], [-62, -90, -Math.PI / 2],
    [124, 80, Math.PI], [0, 100, 0], [-124, -30, Math.PI / 2],
    [62, -150, 0], [-62, 150, Math.PI], [186, -60, -Math.PI / 2],
    [124, 170, Math.PI],
  ];
  const cars = [];
  spots.forEach(([x, z, heading], i) => {
    cars.push(createCar(scene, x, z, heading, CAR_COLORS[i % CAR_COLORS.length]));
  });
  return cars;
}

export function updateCar(car, dt, input, colliders, bound) {
  const accel = input.forward ? 16 : 0;
  const brake = input.back ? 22 : 0;
  const reverse = input.back && car.speed < 0.5 ? 8 : 0;
  car.speed += (accel + reverse - brake * (car.speed > 0 ? 1 : 0)) * dt;
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (!input.forward && !input.back) car.speed -= car.speed * 1.1 * dt;
  car.speed = clamp(car.speed, -9, 30);
  if (Math.abs(car.speed) < 0.05 && !input.forward && !input.back) car.speed = 0;
  // Steering scales with speed and flips in reverse.
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const steerAmount = car.steer * 0.55 * clamp(Math.abs(car.speed) / 8, 0, 1);
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
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
