// The wanted system: stars, pursuit cars, ram runs and busts.
// One patrol car per star chases Mara (or her car) until she gets far
// enough away for long enough that the heat cools off one star at a
// time. At three stars the patrol cars stop creeping and go for the
// bumper instead.
import * as THREE from 'three';
import { createCar, addLightBar } from './vehicles.js';
import { CITY, randomRoadPoint } from './city.js';
import { createRng, clamp, angleDiff } from './utils.js';
import { resolveCollisions } from './player.js';

const MAX_WANTED = 3;
const BUST_HOLD = 1.4; // seconds a patrol car must stay on foot-Mara to bust her
const MIN_SPAWN_GAP = 35; // never spawn a pursuit car closer than this
const SPAWN_PUSH_OUT = 45; // ...push it out to this distance instead
const SPAWN_CLAMP = 200;
const UNSEEN_TO_DECAY = 6; // seconds out of sight before a star starts fading
const DECAY_TO_DROP = 4; // seconds of fading before one star drops
const LOSE_RANGE = 110; // beyond this the patrol cars are losing her
const RAM_RANGE = 4.2; // a ram connects inside this
const RAM_DAMAGE_RANGE = 3.4; // ...and only hurts inside this
const BUST_RANGE = 3.2;

const PATROL_PAINT = 0x181c22;
const DOOR_WHITE = 0xf2f2f2;

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
  };

  // One patrol unit: a near-black car, a light bar, and a white door
  // slab so it reads as a patrol car at a glance.
  function buildUnit(x, z, heading) {
    const car = createCar(scene, x, z, heading, PATROL_PAINT);
    const lights = addLightBar(car.group);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.3, 1.4),
      new THREE.MeshLambertMaterial({ color: DOOR_WHITE }),
    );
    door.position.y = 0.62;
    car.group.add(door);
    return { car, lights, speed: 0, bustTimer: 0 };
  }

  // Drop a fresh unit onto a road near the target, never on top of her.
  function spawnNear(targetPos) {
    const spot = randomRoadPoint(rng);
    let x = spot.x;
    let z = spot.z;
    const dx = x - targetPos.x;
    const dz = z - targetPos.z;
    const d = Math.hypot(dx, dz);
    if (d < MIN_SPAWN_GAP) {
      const bx = d > 0.001 ? dx / d : 1;
      const bz = d > 0.001 ? dz / d : 0;
      x = clamp(targetPos.x + bx * SPAWN_PUSH_OUT, -SPAWN_CLAMP, SPAWN_CLAMP);
      z = clamp(targetPos.z + bz * SPAWN_PUSH_OUT, -SPAWN_CLAMP, SPAWN_CLAMP);
    }
    const heading = Math.atan2(targetPos.x - x, targetPos.z - z);
    const unit = buildUnit(x, z, heading);
    police.cars.push(unit);
    return unit;
  }

  // Grow or shrink the fleet until there is exactly one car per star.
  // Cars that leave the fleet are hidden, not destroyed.
  function ensureFleet(count, targetPos) {
    const anchor = targetPos || { x: 0, z: 0 };
    while (police.cars.length < count) spawnNear(anchor);
    while (police.cars.length > count) {
      const extra = police.cars.pop();
      extra.car.group.visible = false;
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

  // Stage one pursuit car at an exact spot (screenshot poses).
  function place(i, x, z, heading) {
    while (police.cars.length <= i) {
      const spare = buildUnit(x, z, heading);
      spare.car.group.visible = false;
      police.cars.push(spare);
    }
    const unit = police.cars[i];
    unit.car.group.visible = true;
    unit.car.pos.set(x, 0, z);
    unit.car.heading = heading;
    unit.speed = 14;
    unit.car.speed = 14;
    unit.car.group.position.copy(unit.car.pos);
    unit.car.group.rotation.y = heading;
    return unit;
  }

  function update(dt, player, playerCar, inCar, colliders) {
    const events = { rammed: false, busted: false };
    police.flash += dt * 7;
    police.ramCooldown = Math.max(0, police.ramCooldown - dt);

    // Alternate the light bars red/blue on the flash phase.
    const redPhase = Math.floor(police.flash) % 2 === 0;
    for (const unit of police.cars) {
      unit.lights.red.material.color.setHex(redPhase ? 0xff2222 : 0x330000);
      unit.lights.blue.material.color.setHex(redPhase ? 0x000033 : 0x2266ff);
    }

    // No heat: no pursuit. Clear the fleet and go home.
    if (police.wanted <= 0) {
      police.ramming = false;
      for (const unit of police.cars) unit.car.group.visible = false;
      police.cars.length = 0;
      return events;
    }

    const targetPos = (inCar && playerCar) ? playerCar.pos : player.pos;
    ensureFleet(police.wanted, targetPos);

    // Three stars in a car: the ram run. Faster, sharper, no creeping.
    const ramRun = police.wanted >= MAX_WANTED && inCar;
    police.ramming = ramRun;
    const topSpeed = 24 + 2.5 * police.wanted + (ramRun ? 6 : 0);
    const turnRate = ramRun ? 2.8 : 1.9;

    for (const unit of police.cars) {
      // Shot three times: the engine is dead, the car sits where it is.
      if (typeof unit.car.hp === 'number' && unit.car.hp <= 0) {
        unit.speed = 0;
        unit.car.speed = 0;
        continue;
      }

      const dx = targetPos.x - unit.car.pos.x;
      const dz = targetPos.z - unit.car.pos.z;
      const dist = Math.hypot(dx, dz);

      // Steer toward the target, capped so the chase stays escapable.
      const wantHeading = Math.atan2(dx, dz);
      const turn = angleDiff(unit.car.heading, wantHeading);
      unit.car.heading += clamp(turn, -turnRate * dt, turnRate * dt);

      // Close in fast from afar, creep when near — unless ramming,
      // in which case hold top speed all the way to the bumper.
      let target;
      if (ramRun) target = topSpeed;
      else if (dist > 90) target = topSpeed;
      else if (dist < 14) target = Math.max(3.5, topSpeed * (dist / 30));
      else target = topSpeed * 0.92;
      unit.speed += (target - unit.speed) * Math.min(1, dt * 1.4);
      unit.car.speed = unit.speed;

      unit.car.pos.x += Math.sin(unit.car.heading) * unit.speed * dt;
      unit.car.pos.z += Math.cos(unit.car.heading) * unit.speed * dt;
      unit.car.pos.x = clamp(unit.car.pos.x, -CITY.bound, CITY.bound);
      unit.car.pos.z = clamp(unit.car.pos.z, -CITY.bound, CITY.bound + 40);
      resolveCollisions(unit.car.pos, 2.0, colliders);
      unit.car.group.position.copy(unit.car.pos);
      unit.car.group.rotation.y = unit.car.heading;
      for (const wheel of unit.car.wheels) wheel.rotation.x += unit.speed * dt * 2.2;

      if (inCar && playerCar) {
        // Ram: a close pass shoves Mara's car and bleeds its speed; a
        // hard hit (inside 3.4m) counts as one damaging ram per 0.8s.
        const rdx = playerCar.pos.x - unit.car.pos.x;
        const rdz = playerCar.pos.z - unit.car.pos.z;
        const rd = Math.hypot(rdx, rdz);
        if (rd < RAM_RANGE && police.ramCooldown <= 0) {
          playerCar.speed *= ramRun ? 0.68 : 0.82;
          const shove = ramRun ? 0.14 : 0.06;
          playerCar.pos.x += rdx * shove;
          playerCar.pos.z += rdz * shove;
          if (rd < RAM_DAMAGE_RANGE) {
            events.rammed = true;
            police.ramCooldown = 0.8;
          }
        }
        unit.bustTimer = 0;
      } else {
        // Bust: on foot, a patrol car that stays on Mara for 1.4s
        // takes her in. Drift away and the timer resets.
        const bdx = player.pos.x - unit.car.pos.x;
        const bdz = player.pos.z - unit.car.pos.z;
        if (Math.hypot(bdx, bdz) < BUST_RANGE) {
          unit.bustTimer += dt;
          if (unit.bustTimer > BUST_HOLD) events.busted = true;
        } else {
          unit.bustTimer = 0;
        }
      }
    }

    // Cooling off: out of sight for 6s, then one star fades every 4s.
    // Any patrol car within range resets both clocks.
    let nearest = Infinity;
    for (const unit of police.cars) {
      const d = Math.hypot(unit.car.pos.x - targetPos.x, unit.car.pos.z - targetPos.z);
      if (d < nearest) nearest = d;
    }
    if (nearest > LOSE_RANGE) {
      police.unseenTimer += dt;
      if (police.unseenTimer > UNSEEN_TO_DECAY) {
        police.decayTimer += dt;
        if (police.decayTimer > DECAY_TO_DROP) {
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

  police.addHeat = addHeat;
  police.setWanted = setWanted;
  police.place = place;
  police.update = update;
  return police;
}
