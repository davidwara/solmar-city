// Combat: Mara's fists (F key) and what a speeding car does to a pedestrian.
// Light by design — one punch, one knockdown — but the law notices: every
// pedestrian put on the ground adds heat to the wanted level.
import { setPunch } from './player.js';

const PUNCH_RANGE = 2.4;
const PUNCH_COOLDOWN = 0.45;

/** Create the combat state (just a cooldown timer). */
export function createCombat() {
  const combat = { cooldown: 0 };

  function update(dt) {
    if (combat.cooldown > 0) combat.cooldown -= dt;
  }

  /**
   * Throw a punch. Returns the pedestrian hit, or null (miss / on cooldown).
   * Only pedestrians standing in front of Mara, inside range, can be hit.
   */
  function tryPunch(player, peds) {
    if (combat.cooldown > 0) return null;
    combat.cooldown = PUNCH_COOLDOWN;
    setPunch(player);
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    for (const p of peds.peds) {
      if (p.down) continue;
      const dx = p.pos.x - player.pos.x;
      const dz = p.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > PUNCH_RANGE) continue;
      // Must be in front of Mara (dot product with facing direction).
      if ((dx * fx + dz * fz) / Math.max(d, 0.001) < 0.35) continue;
      peds.knockDown(p);
      return p;
    }
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

  combat.update = update;
  combat.tryPunch = tryPunch;
  combat.carHits = carHits;
  return combat;
}
