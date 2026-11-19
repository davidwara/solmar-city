// Combat: Mara's fists (F key) and what a speeding car does to a pedestrian.
// Light by design — one punch, one knockdown — but the law notices: every
// pedestrian put on the ground adds heat to the wanted level. Phase 3 adds
// the pistol: applyShotHit turns a shot's result into damage and heat.
// Phase 4: rain changes the roads, not the fists — punches, shots and car
// hits work the same in a storm, and the Getaway Driver job is won by
// outrunning these pursuit cars, not by fighting them.
import { setPunch } from './player.js';
import { damageCar } from './vehicles.js';

const PUNCH_RANGE = 2.4;
const PUNCH_COOLDOWN = 0.45;

/**
 * Knock a target down for `ms` milliseconds: it cannot attack while down.
 * Sets the shared down state (down flag + downTimer in seconds, figure
 * hidden) that the gangs update loop already ticks down and recovers
 * from — rivals stay out of the fight for the full timer.
 */
export function applyKnockdown(target, ms) {
  if (!target || target.down) return false;
  target.down = true;
  target.downTimer = Math.max(0, ms || 0) / 1000;
  if (target.figure) target.figure.visible = false;
  return true;
}

/** Create the combat state (just a cooldown timer). */
export function createCombat() {
  const combat = { cooldown: 0, combo: 0, comboTimer: 0 };

  function update(dt) {
    if (combat.cooldown > 0) combat.cooldown -= dt;
    // The combo window: 1.5s without a landed punch and the streak is gone.
    if (combat.comboTimer > 0) {
      combat.comboTimer -= dt;
      if (combat.comboTimer <= 0) combat.combo = 0;
    }
  }

  /**
   * Throw a punch. Returns the pedestrian hit, or null (miss / on cooldown).
   * Only pedestrians standing in front of Mara, inside range, can be hit.
   * `reach` is the swing distance — the bat's 3.6m when Mara owns one.
   */
  function tryPunch(player, peds, reach = PUNCH_RANGE) {
    if (combat.cooldown > 0) return null;
    // Phase 7: a combo — landed punches inside the window swing faster,
    // down to a 0.25s floor; a miss breaks the streak.
    combat.cooldown = Math.max(0.25, PUNCH_COOLDOWN - combat.combo * 0.05);
    setPunch(player);
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    for (const p of peds.peds) {
      if (p.down) continue;
      const dx = p.pos.x - player.pos.x;
      const dz = p.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      // Must be in front of Mara (dot product with facing direction).
      if ((dx * fx + dz * fz) / Math.max(d, 0.001) < 0.35) continue;
      peds.knockDown(p);
      combat.combo += 1;
      combat.comboTimer = 1.5;
      return p;
    }
    combat.combo = 0;
    return null;
  }

  /**
   * Car hits: any standing pedestrian the player's car ploughs into at
   * speed goes down. Returns the list hit this frame.
   */
  function carHits(playerCar, peds) {
    const hit = [];
    if (!playerCar || Math.abs(playerCar.speed) < 4) return hit;
    for (const p of peds.peds) {
      if (p.down) continue;
      const d = Math.hypot(p.pos.x - playerCar.pos.x, p.pos.z - playerCar.pos.z);
      if (d < 2.3) {
        peds.knockDown(p);
        hit.push(p);
      }
    }
    return hit;
  }

  /**
   * Apply a pistol shot's result: damage the thing hit and return the heat
   * it earns. A pedestrian down is +1★, a traffic car shot is +1★, shooting
   * a patrol car is +2★ — and three hits disable any car outright.
   */
  function applyShotHit(hit) {
    if (!hit) return 0;
    if (hit.kind === 'ped') return 1;
    if (hit.kind === 'traffic') {
      const disabled = damageCar(hit.car, 1);
      if (disabled) hit.car.speed = 0;
      return 1;
    }
    if (hit.kind === 'police') {
      const disabled = damageCar(hit.car, 1);
      if (disabled) hit.car.speed = 0;
      return 2;
    }
    return 0;
  }

  combat.update = update;
  combat.tryPunch = tryPunch;
  combat.carHits = carHits;
  combat.applyShotHit = applyShotHit;
  return combat;
}
