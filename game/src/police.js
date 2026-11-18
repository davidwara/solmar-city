// Police: the wanted system and the pursuit cars that answer it.
// Heat 0–3 stars. Stealing a car, hitting a pedestrian or ramming traffic
// raises it; staying out of sight lets it cool off one star at a time.
// One police car spawns per star and chases Mara: it rams her car, and on
// foot it can bust her (fine + wanted cleared). Lose them by distance.
import * as THREE from 'three';
import { createCar, addLightBar } from './vehicles.js';
import { CITY, randomRoadPoint } from './city.js';
import { createRng, rand, clamp, angleDiff } from './utils.js';
import { resolveCollisions } from './player.js';

const MAX_WANTED = 3;
const BUST_TIME = 1.4; // seconds a police car must stay on foot-Mara to bust her

/** Create the police system. Returns the wanted state + update/addHeat. */
export function createPolice(scene, seed) {
  const rng = createRng(seed * 15485863 + 99);
  const police = {
    wanted: 0,
    cars: [], // { car, lights, speed, bustTimer }
    unseenTimer: 0,
    decayTimer: 0,
    ramCooldown: 0, // seconds until the next ram may hurt the player
    flash: 0,
  };

  function spawnOne(x, z, heading) {
    const car = createCar(scene, x, z, heading, 0x181c22);
    const lights = addLightBar(car.group);
    // White doors read as a patrol car at a glance.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.3, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    door.position.set(0, 0.62, 0);
    car.group.add(door);
    const unit = { car, lights, speed: 0, bustTimer: 0 };
    police.cars.push(unit);
    return unit;
  }

  // Spawn a pursuit car on a road near (but not on top of) the player.
  function spawnNear(playerPos) {
    const start = randomRoadPoint(rng);
    let x = start.x;
    let z = start.z;
    // Push the spawn point at least 35m away so it arrives as a chase.
    const d = Math.hypot(x - playerPos.x, z - playerPos.z);
    if (d < 35) {
      const a = Math.atan2(x - playerPos.x, z - playerPos.z);
      x = playerPos.x + Math.sin(a) * 45;
      z = playerPos.z + Math.cos(a) * 45;
      x = clamp(x, -200, 200);
      z = clamp(z, -200, 200);
    }
    return spawnOne(x, z, Math.atan2(playerPos.x - x, playerPos.z - z));
  }

  /** Raise the wanted level (clamped to 3) and make sure cars are out. */
  function addHeat(n, playerPos) {
    if (n <= 0) return;
    police.wanted = Math.min(MAX_WANTED, police.wanted + n);
    police.unseenTimer = 0;
    while (police.cars.length < police.wanted) spawnNear(playerPos);
  }

  /** Set the wanted level directly (used by ?shot= poses). */
  function setWanted(n, playerPos) {
    police.wanted = clamp(n, 0, MAX_WANTED);
    police.unseenTimer = 0;
    while (police.cars.length < police.wanted) spawnNear(playerPos);
    while (police.cars.length > police.wanted) {
      const unit = police.cars.pop();
      unit.car.group.visible = false;
    }
  }

  /** Stage a police car at an exact spot (used by ?shot= poses). */
  function place(i, x, z, heading) {
    while (police.cars.length <= i) spawnOne(x, z, heading);
    const unit = police.cars[i];
    unit.car.group.visible = true;
    unit.car.pos.set(x, 0, z);
    unit.car.heading = heading;
    unit.car.speed = 14;
    unit.speed = 14;
    unit.car.group.position.copy(unit.car.pos);
    unit.car.group.rotation.y = heading;
    return unit;
  }

  /**
   * Chase the player. player: { pos, heading }, playerCar or null.
   * Returns events: { rammed, busted } for this frame.
   */
  function update(dt, player, playerCar, inCar, colliders) {
    const events = { rammed: false, busted: false };
    police.flash += dt * 7;
    if (police.ramCooldown > 0) police.ramCooldown -= dt;
    const target = inCar && playerCar ? playerCar.pos : player.pos;

    // Flash the light bars: red and blue alternate.
    for (const unit of police.cars) {
      const on = Math.sin(police.flash) > 0;
      unit.lights.red.material.color.setHex(on ? 0xff2222 : 0x551111);
      unit.lights.blue.material.color.setHex(on ? 0x112266 : 0x2266ff);
    }

    if (police.wanted === 0) {
      // No heat: patrol cars drift off and despawn.
      for (const unit of police.cars) {
        unit.car.group.visible = false;
      }
      police.cars.length = 0;
      return events;
    }
    while (police.cars.length < police.wanted) spawnNear(target);
    while (police.cars.length > police.wanted) {
      const unit = police.cars.pop();
      unit.car.group.visible = false;
    }

    let nearestDist = Infinity;
    for (const unit of police.cars) {
      const car = unit.car;
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      nearestDist = Math.min(nearestDist, dist);

      // Steer toward the player, capped turn rate so the chase is escapable.
      const wantHeading = Math.atan2(dx, dz);
      car.heading += clamp(angleDiff(car.heading, wantHeading), -1.9 * dt, 1.9 * dt);
      const topSpeed = 24 + police.wanted * 2.5;
      // Close in fast from afar, but creep in when near: at full speed a
      // pursuit car just orbits the player and can never pin her down
      // (on foot) or ram her (in a car). Creeping keeps it on her bumper.
      const targetSpeed = dist > 90 ? topSpeed : dist < 14
        ? Math.max(3.5, topSpeed * (dist / 30))
        : topSpeed * 0.92;
      unit.speed += (targetSpeed - unit.speed) * Math.min(1, dt * 1.4);
      car.speed = unit.speed;
      car.pos.x += Math.sin(car.heading) * unit.speed * dt;
      car.pos.z += Math.cos(car.heading) * unit.speed * dt;
      car.pos.x = clamp(car.pos.x, -CITY.bound, CITY.bound);
      car.pos.z = clamp(car.pos.z, -CITY.bound, CITY.bound + 40);
      resolveCollisions(car.pos, 2.0, colliders);
      car.group.position.copy(car.pos);
      car.group.rotation.y = car.heading;
      for (const w of car.wheels) w.rotation.x += unit.speed * dt * 2.2;

      if (inCar && playerCar) {
        // Ram: shove the player's car and hurt her — but at most once
        // every 0.8s, so a touch is a bump, not an instant wreck.
        if (dist < 4.2 && police.ramCooldown <= 0) {
          playerCar.speed *= 0.82;
          playerCar.pos.x += (playerCar.pos.x - car.pos.x) * 0.06;
          playerCar.pos.z += (playerCar.pos.z - car.pos.z) * 0.06;
          if (dist < 3.4) {
            events.rammed = true;
            police.ramCooldown = 0.8;
          }
        }
        unit.bustTimer = 0;
      } else {
        // On foot: stay close long enough and Mara gets busted.
        if (dist < 3.2) {
          unit.bustTimer += dt;
          if (unit.bustTimer > BUST_TIME) events.busted = true;
        } else {
          unit.bustTimer = 0;
        }
      }
    }

    // Out of sight: the heat cools, one star every few seconds.
    if (nearestDist > 110) {
      police.unseenTimer += dt;
      if (police.unseenTimer > 6) {
        police.decayTimer += dt;
        if (police.decayTimer > 4) {
          police.decayTimer = 0;
          police.wanted = Math.max(0, police.wanted - 1);
        }
      }
    } else {
      police.unseenTimer = 0;
      police.decayTimer = 0;
    }
    return events;
  }

  police.addHeat = addHeat;
  police.setWanted = setWanted;
  police.place = place;
  police.update = update;
  return police;
}
