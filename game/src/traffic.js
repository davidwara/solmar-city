// traffic.js — AI cars cruising the Solmar City road grid.
//
// Cars stick to the streets, keep to their lane, queue at red lights,
// overtake parked cars, honk when stuck, and turn at intersections.
// The player is free to run a red light; the AI is not.
import * as THREE from 'three';
import { createCar } from './vehicles.js';
import { CITY, randomRoadPoint, nearestStreet } from './city.js';
import { createRng, rand, pick, clamp, angleDiff } from './utils.js';

const LIGHT_CYCLE = 19; // seconds: 8 green + 1.5 amber, per axis
const LIGHT_SPOTS = [[0, 0], [62, 62], [-62, -62], [0, 124]];
const PAINT = [0xd23b3b, 0x2e6fd8, 0xf2c14e, 0x3fae6a, 0x8a5fc0, 0xe8e8e8, 0x222831, 0xff7a2a];

/** Heading that drives along an axis in a direction (forward = sin/cos). */
function headingFor(axis, dir) {
  if (axis === 'ns') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** One signalled intersection: pole, head box and three lamps. */
function buildLight(scene, rng, ix, iz) {
  const group = new THREE.Group();
  group.position.set(ix + 9, 0, iz + 9);
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262b });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 8), dark);
  pole.position.y = 3.5;
  group.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.7), dark);
  head.position.y = 7.2;
  group.add(head);
  const lampGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const red = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x330000 }));
  red.position.y = 7.9;
  const amber = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x332200 }));
  amber.position.y = 7.2;
  const green = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x002200 }));
  green.position.y = 6.5;
  group.add(red, amber, green);
  scene.add(group);
  return { group, x: ix, z: iz, timer: rand(rng, 0, 8), nsGreen: true, lamps: { red, amber, green } };
}

/** Colour the three lamps for the current phase (north-south shown). */
function paintLamps(light) {
  const ph = light.timer % LIGHT_CYCLE;
  light.nsGreen = ph < 8;
  const nsAmber = ph >= 8 && ph < 9.5;
  const nsRed = ph >= 9.5;
  light.lamps.red.material.color.setHex(nsRed ? 0xff2222 : 0x330000);
  light.lamps.amber.material.color.setHex(nsAmber ? 0xffaa22 : 0x332200);
  light.lamps.green.material.color.setHex(light.nsGreen ? 0x22ff66 : 0x002200);
}

/** Is the given axis facing red at this light's phase? Amber counts as red. */
function axisIsRed(light, axis) {
  const ph = light.timer % LIGHT_CYCLE;
  if (axis === 'ns') return ph >= 8;
  return ph < 9.5 || ph >= 17.5;
}

export function spawnTraffic(scene, seed, count = 10) {
  const rng = createRng(seed * 7919 + 13);
  const lights = LIGHT_SPOTS.map(([x, z]) => buildLight(scene, rng, x, z));

  const cars = [];
  for (let i = 0; i < count; i++) {
    const spot = randomRoadPoint(rng);
    const dir = spot.dir;
    const car = createCar(scene, spot.x, spot.z, headingFor(spot.axis, dir), pick(rng, PAINT));
    const cruise = rand(rng, 8, 13);
    const speed = rand(rng, 6, 12);
    car.speed = speed;
    cars.push({
      car,
      axis: spot.axis,
      dir,
      lane: dir > 0 ? 2.4 : -2.4,
      cruise,
      speed,
      turnCooldown: rand(rng, 2, 8),
      overtakeTimer: 0,
      overtaking: false,
      overtakeCar: null,
      stuckTimer: 0,
      queueTimer: 0,
      queueCount: 0,
      queued: false,
    });
  }

  const traffic = {
    cars,
    lights,
    horn: false,
    hornCooldown: 0,
    update,
    place,
  };

  function update(dt, ctx) {
    const grip = ctx.grip ?? 1;
    traffic.hornCooldown = Math.max(0, traffic.hornCooldown - dt);
    for (const light of lights) {
      light.timer += dt;
      paintLamps(light);
    }

    // Everything a car can bump into: other traffic, the player's car,
    // and parked cars (which may be overtaken instead of waited on).
    const obstacles = [];
    for (const w of cars) obstacles.push({ pos: w.car.pos, speed: w.speed, parked: false, wrap: w });
    if (ctx.playerInCar && ctx.playerCar) {
      obstacles.push({ pos: ctx.playerCar.pos, speed: Math.abs(ctx.playerCar.speed), parked: false, player: true });
    }
    for (const pc of ctx.parkedCars || []) {
      obstacles.push({ pos: pc.pos, speed: 0, parked: true, car: pc });
    }

    for (const w of cars) {
      w.turnCooldown -= dt;
      const fx = Math.sin(w.car.heading);
      const fz = Math.cos(w.car.heading);

      // Vehicle directly ahead: inside the forward cone, nearest wins.
      let ahead = null;
      let aheadDist = Infinity;
      for (const o of obstacles) {
        if (o.wrap === w) continue;
        const dx = o.pos.x - w.car.pos.x;
        const dz = o.pos.z - w.car.pos.z;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > 11) continue;
        if (Math.abs(fx * dz - fz * dx) >= 3.2) continue;
        if (along < aheadDist) { aheadDist = along; ahead = o; }
      }

      // Parked cars: wait a beat, then swing into the opposite lane.
      if (ahead && ahead.parked && !w.overtaking) {
        w.overtakeTimer += dt;
        if (w.overtakeTimer > 0.6) {
          w.overtaking = true;
          w.overtakeCar = ahead.car;
        }
      } else if (!ahead || !ahead.parked) {
        w.overtakeTimer = Math.max(0, w.overtakeTimer - dt);
      }
      if (w.overtaking && w.overtakeCar) {
        const dx = w.overtakeCar.pos.x - w.car.pos.x;
        const dz = w.overtakeCar.pos.z - w.car.pos.z;
        if (dx * fx + dz * fz < -3) {
          w.overtaking = false;
          w.overtakeCar = null;
          w.overtakeTimer = 0;
        }
      }

      // Ease onto the street centreline plus the lane offset.
      const centre = w.axis === 'ns' ? nearestStreet(w.car.pos.x) : nearestStreet(w.car.pos.z);
      const laneTarget = centre + (w.overtaking ? -w.lane : w.lane);
      const laneNow = w.axis === 'ns' ? w.car.pos.x : w.car.pos.z;
      const laneNext = laneNow + (laneTarget - laneNow) * Math.min(1, dt * 3);
      if (w.axis === 'ns') w.car.pos.x = laneNext;
      else w.car.pos.z = laneNext;

      // Red light ahead on this car's own street?
      let redAhead = false;
      for (const light of lights) {
        if (w.axis === 'ns') {
          if (Math.abs(light.x - w.car.pos.x) > 7) continue;
          const along = (light.z - w.car.pos.z) * w.dir;
          if (along <= 0 || along > 16) continue;
          if (axisIsRed(light, 'ns')) redAhead = true;
        } else {
          if (Math.abs(light.z - w.car.pos.z) > 7) continue;
          const along = (light.x - w.car.pos.x) * w.dir;
          if (along <= 0 || along > 16) continue;
          if (axisIsRed(light, 'ew')) redAhead = true;
        }
      }

      // Intersection queue: stopped behind a stopped car at a red light.
      const leaderStopped = ahead && !ahead.parked && aheadDist < 12 && Math.abs(ahead.speed) < 0.5;
      if (leaderStopped && redAhead) {
        w.queued = true;
        let n = 0;
        for (const o of obstacles) {
          if (o.wrap === w || o.parked || o.player || !o.wrap) continue;
          if (o.wrap.axis !== w.axis) continue;
          const dx = o.pos.x - w.car.pos.x;
          const dz = o.pos.z - w.car.pos.z;
          const along = dx * fx + dz * fz;
          const lat = Math.abs(fx * dz - fz * dx);
          if (along > 0 && along < 30 && lat < 8 && Math.abs(o.speed) < 1) n++;
        }
        w.queueCount = n;
      } else if (!leaderStopped) {
        w.queued = false;
        w.queueTimer = 0;
      }

      // Target speed: blocked, red, queued, or cruising (slower to pass).
      let target = w.cruise * (w.overtaking ? 0.7 : 1) * grip;
      if (ahead && !ahead.parked) target = 0;
      else if (ahead && ahead.parked && !w.overtaking) target = 0;
      if (redAhead) target = 0;
      if (w.queued) {
        if (!redAhead) {
          if (w.queueTimer <= 0) w.queueTimer = (w.queueCount + 1) * 0.7;
          w.queueTimer -= dt;
          if (w.queueTimer > 0) target = 0;
          else w.queued = false;
        } else {
          target = 0;
        }
      }

      // Honk when stuck behind a moving car for too long.
      if (ahead && !ahead.parked && w.speed < 0.5) {
        w.stuckTimer += dt;
        if (w.stuckTimer > 2.5 && traffic.hornCooldown <= 0) {
          traffic.horn = true;
          traffic.hornCooldown = 4;
        }
      } else {
        w.stuckTimer = 0;
      }

      w.speed += (target - w.speed) * Math.min(1, dt * 2.5);
      if (target === 0 && Math.abs(w.speed) < 0.01) w.speed = 0;
      w.car.speed = w.speed;

      // Steer onto the axis heading, then roll forward.
      const wantHeading = headingFor(w.axis, w.dir);
      w.car.heading += clamp(angleDiff(w.car.heading, wantHeading), -4 * dt, 4 * dt);
      w.car.pos.x += Math.sin(w.car.heading) * w.speed * dt;
      w.car.pos.z += Math.cos(w.car.heading) * w.speed * dt;

      // Turn at an intersection onto the crossing street.
      if (w.turnCooldown <= 0) {
        const alongCoord = w.axis === 'ns' ? w.car.pos.z : w.car.pos.x;
        if (Math.abs(alongCoord - nearestStreet(alongCoord)) < 3 && rng() < 0.9 * dt) {
          const newAxis = w.axis === 'ns' ? 'ew' : 'ns';
          const newDir = rng() < 0.5 ? 1 : -1;
          if (newAxis === 'ew') w.car.pos.z = nearestStreet(w.car.pos.z);
          else w.car.pos.x = nearestStreet(w.car.pos.x);
          w.axis = newAxis;
          w.dir = newDir;
          w.lane = newDir > 0 ? 2.4 : -2.4;
          w.turnCooldown = rand(rng, 4, 10);
        }
      }

      // Map edge: U-turn and head back into town.
      if (w.axis === 'ns' && Math.abs(w.car.pos.z) > 198) {
        w.dir *= -1;
        w.lane *= -1;
        w.car.pos.z = clamp(w.car.pos.z, -198, 198);
        w.turnCooldown = 4;
      } else if (w.axis === 'ew' && Math.abs(w.car.pos.x) > 198) {
        w.dir *= -1;
        w.lane *= -1;
        w.car.pos.x = clamp(w.car.pos.x, -198, 198);
        w.turnCooldown = 4;
      }
      w.car.pos.x = clamp(w.car.pos.x, -210, 210);
      w.car.pos.z = clamp(w.car.pos.z, -210, 210);

      w.car.group.position.copy(w.car.pos);
      w.car.group.rotation.y = w.car.heading;
      for (const wheel of w.car.wheels) wheel.rotation.x += w.speed * dt * 2.2;
    }
  }

  /** Stage one car at an exact spot (screenshot poses). */
  function place(i, x, z, axis, dir, speed = 10) {
    if (cars.length === 0) return null;
    const w = cars[i % cars.length];
    w.axis = axis;
    w.dir = dir;
    w.lane = dir > 0 ? 2.4 : -2.4;
    w.cruise = speed;
    w.speed = speed;
    w.car.speed = speed;
    w.car.pos.set(x, 0, z);
    w.car.heading = headingFor(axis, dir);
    w.car.group.position.copy(w.car.pos);
    w.car.group.rotation.y = w.car.heading;
    w.turnCooldown = 4;
    w.overtaking = false;
    w.overtakeTimer = 0;
    w.overtakeCar = null;
    w.queued = false;
    w.queueTimer = 0;
    return w;
  }

  return traffic;
}

/**
 * Fresh overlap between the player's car and a traffic car: shove the
 * traffic car aside, slow the player down, and arm a 2s cooldown.
 */
export function trafficCrash(traffic, playerCar, cooldown) {
  if (!playerCar || Math.abs(playerCar.speed) < 3) return false;
  if (!cooldown || cooldown.value > 0) return false;
  for (const w of traffic.cars) {
    const dx = w.car.pos.x - playerCar.pos.x;
    const dz = w.car.pos.z - playerCar.pos.z;
    if (Math.hypot(dx, dz) < 3.6) {
      cooldown.value = 2;
      w.car.pos.x += dx * 0.4;
      w.car.pos.z += dz * 0.4;
      w.car.group.position.copy(w.car.pos);
      playerCar.speed *= 0.45;
      return true;
    }
  }
  return false;
}
