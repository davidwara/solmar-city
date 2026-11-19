// AI traffic: cars that cruise the road grid, queue at red lights,
// overtake parked cars and honk when they get stuck. They are scenery
// with manners — they stop for each other and for red lights, but the
// player is free to run a light and take the consequences.
import * as THREE from 'three';
import { createCar } from './vehicles.js';
import { CITY, randomRoadPoint, nearestStreet } from './city.js';
import { createRng, rand, randInt, pick, clamp, angleDiff } from './utils.js';

const PAINT = [0xd23b3b, 0x2e6fd8, 0xf2c14e, 0x3fae6a, 0x8a5fc0, 0xe8e8e8, 0x222831, 0xff7a2a];
const LANE = 2.4; // right-hand lane offset from the street centreline
const CYCLE = 19; // traffic-light cycle: 8 green + 1.5 amber per axis
const AHEAD_RANGE = 11; // how far ahead a car looks for a blocker
const AHEAD_WIDTH = 3.2; // lateral slack for "the car in front of me"
const MAP_EDGE = 198; // U-turn line along the travel axis
const WORLD_CLAMP = 210;

const SIGNALS = [[0, 0], [62, 62], [-62, -62], [0, 124]];

function headingFor(axis, dir) {
  if (axis === 'ns') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function buildSignal(scene, ix, iz, rng) {
  const group = new THREE.Group();
  group.position.set(ix + 9, 0, iz + 9);
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), dark);
  pole.position.y = 3.5;
  group.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.7), dark);
  head.position.y = 7.2;
  group.add(head);
  const lampGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const red = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x330000 }));
  red.position.y = 7.9;
  group.add(red);
  const amber = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x332200 }));
  amber.position.y = 7.2;
  group.add(amber);
  const green = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  green.position.y = 6.5;
  group.add(green);
  scene.add(group);
  const timer = rand(rng, 0, 8);
  return {
    group, x: ix, z: iz, timer,
    nsGreen: timer < 9.5,
    nsGreenSince: 0, ewGreenSince: 0,
    red, amber, green,
  };
}

// Advance one signal one frame: 8s NS green, 1.5s amber, 8s EW green,
// 1.5s amber, then the cycle repeats. Lamp colours follow the phase.
function advanceSignal(light, dt, clock) {
  const wasNs = light.nsGreen;
  light.timer = (light.timer + dt) % CYCLE;
  const t = light.timer;
  light.nsGreen = t < 9.5;
  if (light.nsGreen && !wasNs) light.nsGreenSince = clock;
  if (!light.nsGreen && wasNs) light.ewGreenSince = clock;
  const phase = t < 8 ? 'ns' : t < 9.5 ? 'nsAmber' : t < 17.5 ? 'ew' : 'ewAmber';
  light.red.material.color.setHex(phase === 'ns' || phase === 'nsAmber' ? 0x330000 : 0xff2222);
  light.amber.material.color.setHex(phase === 'nsAmber' || phase === 'ewAmber' ? 0xffaa00 : 0x332200);
  light.green.material.color.setHex(phase === 'ns' ? 0x22ff66 : 0x003311);
}

export function spawnTraffic(scene, seed, count = 10) {
  const rng = createRng(seed * 7919 + 13);
  let clock = 0;
  let hornCooldown = 0;

  const lights = SIGNALS.map(([x, z]) => buildSignal(scene, x, z, rng));

  const cars = [];
  for (let i = 0; i < count; i++) {
    const spot = randomRoadPoint(rng);
    const car = createCar(scene, spot.x, spot.z, headingFor(spot.axis, spot.dir), pick(rng, PAINT));
    const cruise = rand(rng, 8, 13);
    const speed = rand(rng, 6, 12);
    car.speed = speed;
    cars.push({
      car,
      axis: spot.axis,
      dir: spot.dir,
      lane: spot.dir > 0 ? LANE : -LANE,
      cruise,
      speed,
      turnCooldown: rand(rng, 2, 8),
      overtakeTimer: 0,
      overtaking: false,
      stuckTimer: 0,
    });
  }

  const traffic = { cars, update, place, lights, horn: false };

  // The nearest obstacle in the forward cone (0..11m ahead, <3.2m to
  // the side), or null. Carries the leader's speed for queue checks.
  function findAhead(self, obstacles) {
    const p = self.car.pos;
    const h = self.car.heading;
    const sx = Math.sin(h);
    const cx = Math.cos(h);
    let best = null;
    let bestFwd = AHEAD_RANGE + 1;
    for (const o of obstacles) {
      if (o.ref === self) continue;
      const dx = o.pos.x - p.x;
      const dz = o.pos.z - p.z;
      const fwd = dx * sx + dz * cx;
      if (fwd <= 0 || fwd > AHEAD_RANGE) continue;
      const lat = dx * cx - dz * sx;
      if (Math.abs(lat) >= AHEAD_WIDTH) continue;
      if (fwd < bestFwd) { bestFwd = fwd; best = { gap: fwd, parked: o.parked, speed: o.speed }; }
    }
    return best;
  }

  // The signalled intersection directly ahead on this car's street
  // (within 16m), or null when the road ahead is unsignalled.
  function signalAhead(self) {
    const p = self.car.pos;
    let best = null;
    let bestD = 16;
    for (const light of lights) {
      if (self.axis === 'ns') {
        if (Math.abs(p.x - light.x) > 8) continue;
        const d = (light.z - p.z) * self.dir;
        if (d > 0 && d <= bestD) { bestD = d; best = light; }
      } else {
        if (Math.abs(p.z - light.z) > 8) continue;
        const d = (light.x - p.x) * self.dir;
        if (d > 0 && d <= bestD) { bestD = d; best = light; }
      }
    }
    return best;
  }

  // How many stopped cars are queued ahead of this one on the same
  // approach (same axis, within 8m sideways, in front, nearly still).
  function queuedAhead(self) {
    const p = self.car.pos;
    const h = self.car.heading;
    const sx = Math.sin(h);
    const cx = Math.cos(h);
    let n = 0;
    for (const other of cars) {
      if (other === self || other.axis !== self.axis) continue;
      if (other.speed > 0.5) continue;
      const dx = other.car.pos.x - p.x;
      const dz = other.car.pos.z - p.z;
      const fwd = dx * sx + dz * cx;
      if (fwd <= 0 || fwd > 30) continue;
      const lat = dx * cx - dz * sx;
      if (Math.abs(lat) < 8) n += 1;
    }
    return n;
  }

  function stepCar(w, dt, obstacles, grip) {
    w.turnCooldown -= dt;
    const ahead = findAhead(w, obstacles);

    // Parked cars: wait 0.6s, then swing into the opposite lane to pass.
    // The overtake clock drains once the way ahead is clear again.
    if (ahead && ahead.parked) {
      w.overtakeTimer += dt;
      if (w.overtakeTimer >= 0.6) w.overtaking = true;
    } else if (!ahead) {
      w.overtakeTimer = Math.max(0, w.overtakeTimer - dt);
      if (w.overtakeTimer <= 0) w.overtaking = false;
    }

    // Ease back to the street centreline plus the lane offset (or the
    // opposite lane while overtaking). NS cars correct x, EW cars z.
    const centre = w.axis === 'ns'
      ? nearestStreet(w.car.pos.x, w.car.pos.z)
      : nearestStreet(w.car.pos.z, w.car.pos.x);
    const laneTarget = centre + (w.overtaking ? -w.lane : w.lane);
    const ease = Math.min(1, dt * 3);
    if (w.axis === 'ns') w.car.pos.x += (laneTarget - w.car.pos.x) * ease;
    else w.car.pos.z += (laneTarget - w.car.pos.z) * ease;

    // Target speed: blocked means stopped; otherwise cruise, slower
    // while overtaking, and slower still on a wet road.
    let target = w.cruise * (w.overtaking ? 0.7 : 1) * grip;
    if (ahead && !ahead.parked) target = 0;
    else if (ahead && ahead.parked && !w.overtaking) target = 0;

    // Signals and the queue: a red light stops the car, and a car that
    // queued behind a stopped leader pulls away (n + 1) * 0.7s after the
    // light turns green instead of surging with the whole line.
    const light = signalAhead(w);
    if (light) {
      const redForMe = w.axis === 'ns' ? !light.nsGreen : light.nsGreen;
      if (redForMe) {
        target = 0;
      } else if (ahead && !ahead.parked && ahead.gap < 12 && ahead.speed < 0.5) {
        const greenSince = w.axis === 'ns' ? light.nsGreenSince : light.ewGreenSince;
        const wait = (queuedAhead(w) + 1) * 0.7;
        if (clock < greenSince + wait) target = 0;
      }
    }

    // Honk when stuck behind someone (not a parked car) at a crawl.
    if (ahead && !ahead.parked && w.speed < 0.5) {
      w.stuckTimer += dt;
      if (w.stuckTimer > 2.5 && hornCooldown <= 0) {
        traffic.horn = true;
        hornCooldown = 4;
      }
    } else {
      w.stuckTimer = 0;
    }

    // Ease toward the target speed and keep the car object in sync —
    // other systems read car.speed for their own queue checks.
    w.speed += (target - w.speed) * Math.min(1, dt * 2.5);
    w.car.speed = w.speed;

    // Heading eases toward the axis direction, then the car rolls.
    const want = headingFor(w.axis, w.dir);
    const turn = angleDiff(w.car.heading, want);
    w.car.heading += clamp(turn, -4 * dt, 4 * dt);
    w.car.pos.x += Math.sin(w.car.heading) * w.speed * dt;
    w.car.pos.z += Math.cos(w.car.heading) * w.speed * dt;

    // Turns: at an intersection, with the cooldown spent and a bit of
    // luck, snap onto the crossing street with a fresh direction.
    if (w.turnCooldown <= 0 && rng() < 0.9 * dt) {
      if (w.axis === 'ns') {
        const cross = nearestStreet(w.car.pos.z, w.car.pos.x);
        if (Math.abs(w.car.pos.z - cross) < 3) {
          const nd = randInt(rng, 0, 1) === 0 ? -1 : 1;
          w.axis = 'ew';
          w.dir = nd;
          w.lane = nd > 0 ? LANE : -LANE;
          w.car.pos.z = cross + w.lane;
          w.turnCooldown = rand(rng, 4, 10);
        }
      } else {
        const cross = nearestStreet(w.car.pos.x, w.car.pos.z);
        if (Math.abs(w.car.pos.x - cross) < 3) {
          const nd = randInt(rng, 0, 1) === 0 ? -1 : 1;
          w.axis = 'ns';
          w.dir = nd;
          w.lane = nd > 0 ? LANE : -LANE;
          w.car.pos.x = cross + w.lane;
          w.turnCooldown = rand(rng, 4, 10);
        }
      }
    }

    // Map edge: U-turn, clamp, and a fresh turn cooldown.
    if (w.axis === 'ns') {
      if (w.car.pos.z > MAP_EDGE || w.car.pos.z < -MAP_EDGE) {
        w.dir = -w.dir;
        w.lane = -w.lane;
        w.car.pos.z = clamp(w.car.pos.z, -MAP_EDGE, MAP_EDGE);
        w.turnCooldown = 4;
      }
    } else if (w.car.pos.x > MAP_EDGE || w.car.pos.x < -MAP_EDGE) {
      w.dir = -w.dir;
      w.lane = -w.lane;
      w.car.pos.x = clamp(w.car.pos.x, -MAP_EDGE, MAP_EDGE);
      w.turnCooldown = 4;
    }
    w.car.pos.x = clamp(w.car.pos.x, -WORLD_CLAMP, WORLD_CLAMP);
    w.car.pos.z = clamp(w.car.pos.z, -WORLD_CLAMP, WORLD_CLAMP);

    // Sync the mesh and spin the wheels.
    w.car.group.position.copy(w.car.pos);
    w.car.group.rotation.y = w.car.heading;
    for (const wheel of w.car.wheels) wheel.rotation.x += w.speed * dt * 2.2;
  }

  function update(dt, ctx) {
    const grip = ctx.grip == null ? 1 : ctx.grip;
    clock += dt;
    hornCooldown = Math.max(0, hornCooldown - dt);
    for (const light of lights) advanceSignal(light, dt, clock);

    const obstacles = [];
    for (const w of cars) {
      obstacles.push({ pos: w.car.pos, parked: false, speed: w.speed, ref: w });
    }
    if (ctx.playerInCar && ctx.playerCar) {
      obstacles.push({ pos: ctx.playerCar.pos, parked: false, speed: ctx.playerCar.speed, ref: null });
    }
    for (const parked of (ctx.parkedCars || [])) {
      obstacles.push({ pos: parked.pos, parked: true, speed: 0, ref: null });
    }
    for (const w of cars) stepCar(w, dt, obstacles, grip);
  }

  // Stage one car at an exact spot (screenshot poses).
  function place(i, x, z, axis, dir, speed = 10) {
    const w = cars[i % cars.length];
    w.axis = axis;
    w.dir = dir;
    w.lane = dir > 0 ? LANE : -LANE;
    w.cruise = speed;
    w.speed = speed;
    w.car.speed = speed;
    w.car.pos.set(x, 0, z);
    w.car.heading = headingFor(axis, dir);
    w.car.group.position.copy(w.car.pos);
    w.car.group.rotation.y = w.car.heading;
    return w;
  }

  return traffic;
}

// True when the player's car freshly overlaps a traffic car: the player
// has to be moving, a traffic car has to be within 3.6m, and the
// cooldown has to be spent. On a fresh crash the traffic car is shoved
// sideways and the player loses just over half their speed.
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
