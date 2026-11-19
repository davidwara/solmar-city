// police.js — the wanted system and its pursuit cars.
//
// Heat runs 0..3 stars, one patrol car per star. Units chase Mara (or her
// car), creep in close, ram at three stars, and bust her on foot if they
// hold her for 1.4s. Lose them for long enough and the heat cools off,
// one star at a time.
import * as THREE from 'three';
import { createCar, addLightBar } from './vehicles.js';
import { CITY, randomRoadPoint } from './city.js';
import { createRng, rand, clamp, angleDiff } from './utils.js';
import { resolveCollisions } from './player.js';

const MAX_WANTED = 3;
const BUST_TIME = 1.4;

export function createPolice(scene, seed) {
  const rng = createRng(seed * 15485863 + 99);

  const police = {
    wanted: 0,
    cars: [],
    unseenTimer: 0,
    decayTimer: 0,
    ramCooldown: 0,
    flash: 0,
    ramming: false,
    addHeat,
    setWanted,
    place,
    update,
  };

  /** Build one patrol car at a spot: near-black paint, light bar, white doors. */
  function buildUnit(x, z, heading) {
    const car = createCar(scene, x, z, heading, 0x181c22);
    const lights = addLightBar(car.group);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.3, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
    );
    slab.position.y = 0.62;
    car.group.add(slab);
    return { car, lights, speed: 0, bustTimer: 0 };
  }

  /** Drop a unit on a random road point near the target (never too close). */
  function dropNear(unit, targetPos) {
    const spot = randomRoadPoint(rng);
    let x = spot.x;
    let z = spot.z;
    let dx = x - targetPos.x;
    let dz = z - targetPos.z;
    const d = Math.hypot(dx, dz);
    if (d < 35) {
      const ux = d > 0.01 ? dx / d : 1;
      const uz = d > 0.01 ? dz / d : 0;
      x = clamp(targetPos.x + ux * 45, -200, 200);
      z = clamp(targetPos.z + uz * 45, -200, 200);
    }
    unit.car.pos.set(x, 0, z);
    unit.car.heading = Math.atan2(targetPos.x - x, targetPos.z - z);
    unit.car.group.position.copy(unit.car.pos);
    unit.car.group.rotation.y = unit.car.heading;
  }

  function spawnUnit(targetPos) {
    const unit = buildUnit(0, 0, 0);
    dropNear(unit, targetPos);
    police.cars.push(unit);
    return unit;
  }

  /** Keep exactly n units visible: reuse hidden ones, spawn, or hide extras. */
  function ensureFleet(n, targetPos) {
    let visible = police.cars.filter((u) => u.car.group.visible);
    while (visible.length < n) {
      const hidden = police.cars.find((u) => !u.car.group.visible);
      if (hidden) {
        hidden.car.group.visible = true;
        dropNear(hidden, targetPos);
      } else {
        spawnUnit(targetPos);
      }
      visible = police.cars.filter((u) => u.car.group.visible);
    }
    while (visible.length > n) {
      visible[visible.length - 1].car.group.visible = false;
      visible = police.cars.filter((u) => u.car.group.visible);
    }
  }

  function addHeat(n, playerPos) {
    if (n <= 0) return;
    police.wanted = clamp(police.wanted + n, 0, MAX_WANTED);
    police.unseenTimer = 0;
    ensureFleet(police.wanted, playerPos);
  }

  function setWanted(n, playerPos) {
    police.wanted = clamp(n, 0, MAX_WANTED);
    police.unseenTimer = 0;
    ensureFleet(police.wanted, playerPos);
  }

  /** Stage a pursuit car at an exact spot (screenshot poses). */
  function place(i, x, z, heading) {
    while (police.cars.length <= i) {
      police.cars.push(buildUnit(x, z, heading));
    }
    const unit = police.cars[i];
    unit.car.group.visible = true;
    unit.car.pos.set(x, 0, z);
    unit.car.heading = heading;
    unit.speed = 14;
    unit.car.speed = 14;
    unit.car.group.position.copy(unit.car.pos);
    unit.car.group.rotation.y = unit.car.heading;
    return unit;
  }

  function update(dt, player, playerCar, inCar, colliders) {
    const events = { rammed: false, busted: false };
    police.flash += dt * 7;
    police.ramCooldown = Math.max(0, police.ramCooldown - dt);

    // Light bars flash red/blue on alternating beats.
    const redOn = Math.floor(police.flash) % 2 === 0;
    for (const u of police.cars) {
      if (!u.lights) continue;
      u.lights.red.material.color.setHex(redOn ? 0xff2222 : 0x550000);
      u.lights.blue.material.color.setHex(redOn ? 0x002266 : 0x2266ff);
    }

    if (police.wanted === 0) {
      police.ramming = false;
      for (const u of police.cars) u.car.group.visible = false;
      police.cars.length = 0;
      return events;
    }

    const targetPos = inCar && playerCar ? playerCar.pos : player.pos;
    ensureFleet(police.wanted, targetPos);

    // At three stars in a car the patrol stops creeping and goes for the hit.
    const ramRun = police.wanted === 3 && inCar;
    police.ramming = ramRun;
    const topSpeed = 24 + 2.5 * police.wanted + (ramRun ? 6 : 0);
    const turnRate = ramRun ? 2.8 : 1.9;

    let nearestDist = Infinity;
    for (const u of police.cars) {
      if (!u.car.group.visible) continue;
      const gap = Math.hypot(u.car.pos.x - targetPos.x, u.car.pos.z - targetPos.z);
      if (gap < nearestDist) nearestDist = gap;

      // A car shot three times is dead on the road: it stops and stays put.
      if (typeof u.car.hp === 'number' && u.car.hp <= 0) {
        u.speed = 0;
        u.car.speed = 0;
        continue;
      }

      const wantHeading = Math.atan2(targetPos.x - u.car.pos.x, targetPos.z - u.car.pos.z);
      u.car.heading += clamp(angleDiff(u.car.heading, wantHeading), -turnRate * dt, turnRate * dt);

      // Close in fast from afar, creep when near — unless it's a ram run.
      let target;
      if (ramRun) target = topSpeed;
      else if (gap > 90) target = topSpeed;
      else if (gap < 14) target = Math.max(3.5, topSpeed * gap / 30);
      else target = topSpeed * 0.92;
      u.speed += (target - u.speed) * Math.min(1, dt * 1.4);
      u.car.speed = u.speed;

      u.car.pos.x += Math.sin(u.car.heading) * u.speed * dt;
      u.car.pos.z += Math.cos(u.car.heading) * u.speed * dt;
      u.car.pos.x = clamp(u.car.pos.x, -CITY.bound, CITY.bound);
      u.car.pos.z = clamp(u.car.pos.z, -CITY.bound, CITY.bound + 40);
      resolveCollisions(u.car.pos, 2.0, colliders);
      u.car.group.position.copy(u.car.pos);
      u.car.group.rotation.y = u.car.heading;
      for (const wheel of u.car.wheels) wheel.rotation.x += u.speed * dt * 2.2;

      if (inCar && playerCar) {
        // Ram: shove and slow the player's car; at most one damaging
        // ram per 0.8s.
        const ramGap = Math.hypot(playerCar.pos.x - u.car.pos.x, playerCar.pos.z - u.car.pos.z);
        if (ramGap < 4.2 && police.ramCooldown <= 0) {
          playerCar.speed *= ramRun ? 0.68 : 0.82;
          const shove = ramRun ? 0.14 : 0.06;
          playerCar.pos.x += (playerCar.pos.x - u.car.pos.x) * shove;
          playerCar.pos.z += (playerCar.pos.z - u.car.pos.z) * shove;
          if (ramGap < 3.4) {
            events.rammed = true;
            police.ramCooldown = 0.8;
          }
        }
        u.bustTimer = 0;
      } else {
        // Bust: hold Mara for 1.4s on foot and it's over.
        const footGap = Math.hypot(player.pos.x - u.car.pos.x, player.pos.z - u.car.pos.z);
        if (footGap < 3.2) {
          u.bustTimer += dt;
          if (u.bustTimer > BUST_TIME) events.busted = true;
        } else {
          u.bustTimer = 0;
        }
      }
    }

    // Cooling off: unseen for 6s, then one star drops every 4s.
    if (nearestDist > 110) {
      police.unseenTimer += dt;
      if (police.unseenTimer > 6) {
        police.decayTimer += dt;
        if (police.decayTimer > 4) {
          police.wanted = Math.max(0, police.wanted - 1);
          police.decayTimer = 0;
        }
      }
    } else {
      police.unseenTimer = 0;
      police.decayTimer = 0;
    }

    return events;
  }

  return police;
}
