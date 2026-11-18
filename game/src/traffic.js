// Traffic: AI cars driving the Solmar City road grid.
// Each car owns a street (north-south or east-west), a direction and a lane
// offset, cruises at its own speed, turns at intersections now and then,
// slows for the car ahead, and U-turns at the edge of the map instead of
// driving into the sea. Traffic cars are real cars (vehicles.js), so they
// show up on the minimap and can be bumped by the player.
import * as THREE from 'three';
import { createCar } from './vehicles.js';
import { CITY, randomRoadPoint, nearestStreet } from './city.js';
import { createRng, rand, randInt, pick, clamp } from './utils.js';

const TRAFFIC_COLORS = [0x3fae6a, 0xe8e8e8, 0x2e6fd8, 0xf2c14e, 0x8a5fc0, 0x9db98a, 0xd9a441, 0x7fb3c8];

/** Spawn `count` traffic cars. Returns { cars, update, place }. */
export function spawnTraffic(scene, seed, count = 10) {
  const rng = createRng(seed * 7919 + 13);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const start = randomRoadPoint(rng);
    const car = createCar(scene, start.x, start.z, start.axis === 'ns' ? (start.dir > 0 ? 0 : Math.PI) : (start.dir > 0 ? Math.PI / 2 : -Math.PI / 2), pick(rng, TRAFFIC_COLORS));
    cars.push({
      car,
      axis: start.axis, // 'ns' = moving along z, 'ew' = moving along x
      dir: start.dir,
      lane: start.dir > 0 ? 2.4 : -2.4, // right-hand lane for the direction
      cruise: rand(rng, 8, 13),
      speed: rand(rng, 6, 12),
      turnCooldown: rand(rng, 2, 8),
    });
    syncMesh(cars[i]);
  }

  // --- Traffic lights -----------------------------------------------------
  // Four signalled intersections. Each light runs its own cycle: north-south
  // green for 8s, amber 1.5s, then east-west green 8s, amber 1.5s. AI cars
  // stop on red for their axis; the player is free to run it (and pay for
  // it, if the law sees). Lights are built from the same boxes as the city.
  const lights = [];
  const LIGHT_SPOTS = [[0, 0], [62, 62], [-62, -62], [0, 124]];
  for (const [lx, lz] of LIGHT_SPOTS) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x2e3438 }),
    );
    pole.position.y = 3.5;
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 2.1, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x1c1f24 }),
    );
    head.position.y = 7.2;
    group.add(head);
    const lampGeo = new THREE.SphereGeometry(0.26, 8, 6);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const amberMat = new THREE.MeshBasicMaterial({ color: 0x552200 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x115511 });
    const red = new THREE.Mesh(lampGeo, redMat);
    red.position.y = 7.9;
    group.add(red);
    const amber = new THREE.Mesh(lampGeo, amberMat);
    amber.position.y = 7.2;
    group.add(amber);
    const green = new THREE.Mesh(lampGeo, greenMat);
    green.position.y = 6.5;
    group.add(green);
    group.position.set(lx + 9, 0, lz + 9);
    scene.add(group);
    lights.push({ x: lx, z: lz, timer: rand(rng, 0, 8), nsGreen: true, redMat, amberMat, greenMat });
  }

  // Advance every light one step and paint its lamps.
  function updateLights(dt) {
    for (const l of lights) {
      l.timer += dt;
      const cycle = l.timer % 19; // 8 green + 1.5 amber, twice
      const nsPhase = cycle < 9.5;
      const nsGreen = nsPhase && cycle < 8;
      const nsAmber = nsPhase && cycle >= 8;
      const ewGreen = !nsPhase && cycle < 17.5;
      const ewAmber = !nsPhase && cycle >= 17.5;
      l.nsGreen = nsGreen;
      l.redMat.color.setHex(nsGreen || nsAmber ? 0x551111 : 0xff2222);
      l.amberMat.color.setHex(nsAmber ? 0xffaa22 : 0x552200);
      l.greenMat.color.setHex(nsGreen ? 0x22ff66 : 0x115511);
      l.ewGreen = ewGreen;
      l.ewAmber = ewAmber;
    }
  }

  // The light this car is about to cross, if any (within 16m ahead).
  function lightAhead(w) {
    const car = w.car;
    for (const l of lights) {
      const along = w.axis === 'ns' ? l.z - car.pos.z : l.x - car.pos.x;
      const cross = w.axis === 'ns' ? Math.abs(l.x - car.pos.x) : Math.abs(l.z - car.pos.z);
      if (w.dir > 0 ? along > 0 && along < 16 : along < 0 && along > -16) {
        if (cross < 8) return l;
      }
    }
    return null;
  }

  // Put a traffic wrapper's mesh exactly where its logic says it is.
  function syncMesh(w) {
    w.car.group.position.copy(w.car.pos);
    w.car.group.rotation.y = w.car.heading;
  }

  // Is another vehicle roughly ahead of wrapper w, within `dist`?
  // Returns the blocker, or null. Parked cars are overtaken, not queued
  // behind: a parked car sits on the centreline, so traffic would jam
  // behind it forever if it just stopped.
  function blockedAhead(w, vehicles, dist) {
    const fx = Math.sin(w.car.heading);
    const fz = Math.cos(w.car.heading);
    for (const other of vehicles) {
      if (other === w.car) continue;
      const dx = other.pos.x - w.car.pos.x;
      const dz = other.pos.z - w.car.pos.z;
      const ahead = dx * fx + dz * fz;
      if (ahead > 0 && ahead < dist && Math.abs(dx * fz - dz * fx) < 3.2) return other;
    }
    return null;
  }

  /**
   * Drive the traffic. ctx: { playerCar (or null), playerPos, playerInCar,
   *   parkedCars } — the player car counts as an obstacle, so traffic
   *   queues behind Mara instead of driving through her.
   */
  function update(dt, ctx) {
    updateLights(dt);
    const obstacles = [];
    for (const w of cars) obstacles.push(w.car);
    if (ctx.playerInCar && ctx.playerCar) obstacles.push(ctx.playerCar);
    for (const c of ctx.parkedCars || []) obstacles.push(c);

    for (const w of cars) {
      w.turnCooldown -= dt;
      const car = w.car;
      // Overtake a parked car: swing into the other lane for a moment.
      const blocker = blockedAhead(w, obstacles, 11);
      const parkedBlock = blocker && (ctx.parkedCars || []).includes(blocker);
      if (parkedBlock) w.passTimer = (w.passTimer || 0) + dt;
      else if ((w.passTimer || 0) > 0) w.passTimer = Math.max(0, (w.passTimer || 0) - dt);
      const overtaking = (w.passTimer || 0) > 0.6;
      const laneTarget = overtaking ? -w.lane : w.lane;
      // Lane position: stay on the street line plus the lane offset.
      if (w.axis === 'ns') car.pos.x += (nearestStreet(car.pos.x) + laneTarget - car.pos.x) * Math.min(1, dt * 3);
      else car.pos.z += (nearestStreet(car.pos.z) + laneTarget - car.pos.z) * Math.min(1, dt * 3);

      // Stop for the vehicle ahead (unless overtaking a parked one); creep otherwise.
      // Phase 4: rain slows traffic too — wet roads, cautious drivers.
      const rainGrip = ctx.grip || 1;
      let targetSpeed = (blocker && !parkedBlock) || (blocker && !overtaking) ? 0 : (overtaking ? w.cruise * 0.7 : w.cruise) * rainGrip;
      // Red light: stop at the line instead of crossing the intersection.
      const light = lightAhead(w);
      const redForMe = light && (w.axis === 'ns' ? !light.nsGreen : !light.ewGreen);
      if (redForMe) targetSpeed = 0;
      // Horn: stuck behind someone (or a red light queue) for a while and
      // the driver loses patience. Main plays the sound, once per honk.
      if (blocker && !parkedBlock && w.speed < 0.5) {
        w.blockedTimer = (w.blockedTimer || 0) + dt;
        if (w.blockedTimer > 2.5) {
          w.blockedTimer = -4; // cooldown before the next honk
          traffic.horn = true;
        }
      } else if ((w.blockedTimer || 0) > 0) {
        w.blockedTimer = 0;
      }
      w.speed += (targetSpeed - w.speed) * Math.min(1, dt * 2.5);

      // Heading follows axis + direction, eased so turns look like turns.
      const wantHeading = w.axis === 'ns' ? (w.dir > 0 ? 0 : Math.PI) : (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += dh * Math.min(1, dt * 4);

      car.pos.x += Math.sin(car.heading) * w.speed * dt;
      car.pos.z += Math.cos(car.heading) * w.speed * dt;

      // Turn at an intersection sometimes: snap onto the crossing street.
      const along = w.axis === 'ns' ? car.pos.z : car.pos.x;
      const cross = nearestStreet(along);
      if (w.turnCooldown <= 0 && Math.abs(along - cross) < 3 && rng() < dt * 0.9) {
        if (w.axis === 'ns') {
          w.axis = 'ew';
          car.pos.z = cross;
          w.dir = rng() < 0.5 ? 1 : -1;
        } else {
          w.axis = 'ns';
          car.pos.x = cross;
          w.dir = rng() < 0.5 ? 1 : -1;
        }
        w.lane = w.dir > 0 ? 2.4 : -2.4;
        w.turnCooldown = rand(rng, 4, 10);
      }

      // Edge of the map: U-turn instead of leaving the city.
      if (w.axis === 'ns' && (car.pos.z > 198 || car.pos.z < -198)) {
        w.dir *= -1;
        w.lane *= -1;
        car.pos.z = clamp(car.pos.z, -198, 198);
        w.turnCooldown = 4;
      }
      if (w.axis === 'ew' && (car.pos.x > 198 || car.pos.x < -198)) {
        w.dir *= -1;
        w.lane *= -1;
        car.pos.x = clamp(car.pos.x, -198, 198);
        w.turnCooldown = 4;
      }
      car.pos.x = clamp(car.pos.x, -210, 210);
      car.pos.z = clamp(car.pos.z, -210, 210);
      syncMesh(w);
      for (const wh of car.wheels) wh.rotation.x += w.speed * dt * 2.2;
    }
  }

  // Stage one traffic car at an exact spot (used by ?shot= poses).
  function place(i, x, z, axis, dir, speed = 10) {
    const w = cars[i % cars.length];
    w.axis = axis;
    w.dir = dir;
    w.lane = dir > 0 ? 2.4 : -2.4;
    w.cruise = speed;
    w.speed = speed;
    w.car.pos.set(x, 0, z);
    w.car.heading = axis === 'ns' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    syncMesh(w);
    return w;
  }

  const traffic = { cars, update, place, lights, horn: false };
  return traffic;
}

/** True when the player's car freshly overlaps a traffic car (crash). */
export function trafficCrash(traffic, playerCar, cooldown) {
  if (!playerCar || Math.abs(playerCar.speed) < 3) return false;
  for (const w of traffic.cars) {
    const d = Math.hypot(w.car.pos.x - playerCar.pos.x, w.car.pos.z - playerCar.pos.z);
    if (d < 3.6) {
      if (cooldown.value <= 0) {
        cooldown.value = 2;
        // Shove the traffic car sideways and slow the player down.
        w.car.pos.x += (w.car.pos.x - playerCar.pos.x) * 0.4;
        w.car.pos.z += (w.car.pos.z - playerCar.pos.z) * 0.4;
        playerCar.speed *= 0.45;
        return true;
      }
      return false;
    }
  }
  return false;
}
