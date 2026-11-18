// Gangs: three crews carve Solmar City into turf, and Mara can take it.
// The Vipers (green) hold the west blocks, the Sharks (blue) hold the
// north streets, the Crows (purple) hold the east docks. Zones are drawn
// as coloured rings on the minimap. Stand inside a rival zone for 20
// seconds and the turf flips to Mara's crew — each turf she owns pays
// $50 a minute in passive income, ticked into her wallet while she plays.
// Rival members patrol their own turf and attack Mara on sight with
// fists; knocking them down clears the way, and the Turf War job needs
// the Sharks' turf emptied completely.
import * as THREE from 'three';
import { createRng, rand } from './utils.js';
import { applyKnockdown } from './combat.js';

// Turf zones: centre, radius, owning gang, and the colour the minimap uses.
export const GANGS = [
  { id: 'vipers', name: 'Vipers', color: 0x3fae6a, css: '#3fae6a', center: new THREE.Vector3(-124, 0, 62), radius: 34 },
  { id: 'sharks', name: 'Sharks', color: 0x2e6fd8, css: '#2e6fd8', center: new THREE.Vector3(-62, 0, -124), radius: 34 },
  { id: 'crows', name: 'Crows', color: 0x8a5fc0, css: '#8a5fc0', center: new THREE.Vector3(124, 0, -62), radius: 34 },
];

const CLAIM_TIME = 20; // seconds standing in a rival zone to claim it
const TURF_PAY_PER_MIN = 50; // passive income per owned turf, per minute
const MEMBER_COUNT = 2; // rivals patrolling each gang's turf
const ATTACK_RANGE = 2.0;
const ATTACK_DAMAGE = 6;
const CHASE_RANGE = 26;

/** A rival member: a hooded figure in gang colours, fists ready. */
function buildRivalFigure(color) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.9, 0.42), jacket);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.88;
  group.add(head);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 10), jacket);
  hood.position.y = 2.08;
  group.add(hood);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.32), pants);
  legs.position.y = 0.39;
  group.add(legs);
  for (const side of [-0.45, 0.45]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), jacket);
    arm.position.set(side, 1.15, 0);
    group.add(arm);
  }
  return group;
}

/** Create the gang system. Returns zones, members, claim and income. */
export function createGangs(scene, seed) {
  const rng = createRng(seed + 31);
  const zones = GANGS.map((g) => ({
    ...g,
    owner: g.id, // 'vipers' | 'sharks' | 'crows' | 'mara'
    claimProgress: 0, // 0..1 while Mara stands inside it
  }));

  // Rival members: two per gang, wandering their own turf.
  const members = [];
  for (const zone of zones) {
    for (let i = 0; i < MEMBER_COUNT; i++) {
      const figure = buildRivalFigure(zone.color);
      const a = rand(rng, 0, Math.PI * 2);
      const r = rand(rng, 4, zone.radius - 8);
      const pos = new THREE.Vector3(
        zone.center.x + Math.sin(a) * r,
        0,
        zone.center.z + Math.cos(a) * r,
      );
      figure.position.copy(pos);
      scene.add(figure);
      members.push({
        figure,
        pos,
        gang: zone.id,
        zone,
        down: false,
        downTimer: 0,
        cooldown: 0,
        wanderAngle: rand(rng, 0, Math.PI * 2),
        wanderTimer: rand(rng, 1, 3),
      });
    }
  }

  let incomeAcc = 0; // seconds of owned-turf pay banked toward the next $50
  let turfArmed = false; // Turf War job: Sharks' turf must be emptied

  /** Zone Mara is standing in right now, or null. */
  function zoneAt(pos) {
    for (const zone of zones) {
      const d = Math.hypot(zone.center.x - pos.x, zone.center.z - pos.z);
      if (d < zone.radius) return zone;
    }
    return null;
  }

  /** How many turfs Mara's crew owns (HUD turf counter). */
  function ownedCount() {
    let n = 0;
    for (const zone of zones) if (zone.owner === 'mara') n += 1;
    return n;
  }

  /** Rivals still standing in a gang's turf (Turf War job progress). */
  function rivalsAliveIn(gangId) {
    let n = 0;
    for (const m of members) if (m.gang === gangId && !m.down) n += 1;
    return n;
  }

  /** Arm the Turf War job: the Sharks' members stop wandering and hunt. */
  function armTurfMission() {
    if (turfArmed) return;
    turfArmed = true;
    for (const m of members) {
      if (m.gang === 'sharks' && m.down) {
        m.down = false;
        m.downTimer = 0;
        m.figure.visible = true;
      }
    }
  }

  /** Knock a rival down (punch / shot): he stays down 25 seconds, unable
   *  to attack — the shared knockdown state from combat.js. */
  function knockDown(member) {
    return applyKnockdown(member, 25000);
  }

  /** Nearest standing rival to a point (for punches and shots). */
  function nearestRival(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const m of members) {
      if (m.down) continue;
      const d = Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  /**
   * Phase 6: every rival standing within maxDist of a point — Biscuit
   * barks at the whole pack, not just the nearest one.
   */
  function rivalsNear(pos, maxDist) {
    const out = [];
    for (const m of members) {
      if (m.down) continue;
      if (Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z) < maxDist) out.push(m);
    }
    return out;
  }

  /**
   * Advance gangs. Returns events:
   * { claimed, claimedName, income, damage } — claimed fires when a zone
   * flips to Mara, income pays $50 per owned turf per minute, damage is
   * the hit points rivals landed on Mara this frame.
   */
  function update(dt, playerPos, inCar, inBoat) {
    const events = { claimed: null, claimedName: '', income: 0, damage: 0 };
    const safe = inCar || inBoat;

    // Claiming: stand in a rival zone and the ring fills over 20 seconds.
    const here = zoneAt(playerPos);
    for (const zone of zones) {
      if (zone.owner !== 'mara' && zone === here && !safe) {
        zone.claimProgress += dt / CLAIM_TIME;
        if (zone.claimProgress >= 1) {
          zone.claimProgress = 0;
          zone.owner = 'mara';
          events.claimed = zone;
          events.claimedName = zone.name;
        }
      } else if (zone !== here) {
        zone.claimProgress = Math.max(0, zone.claimProgress - dt / 8);
      }
    }

    // Passive income: every owned turf banks $50 a minute.
    const owned = ownedCount();
    if (owned > 0) {
      incomeAcc += dt * owned * (TURF_PAY_PER_MIN / 60);
      if (incomeAcc >= TURF_PAY_PER_MIN) {
        incomeAcc -= TURF_PAY_PER_MIN;
        events.income = TURF_PAY_PER_MIN;
      }
    }

    // Rivals: wander their turf, chase Mara on sight, punch up close.
    for (const m of members) {
      if (m.down) {
        m.downTimer -= dt;
        if (m.downTimer <= 0) {
          m.down = false;
          m.figure.visible = true;
          // A recovered rival walks back to his turf's centre.
          m.pos.set(m.zone.center.x, 0, m.zone.center.z);
          m.figure.position.copy(m.pos);
        }
        continue;
      }
      if (m.cooldown > 0) m.cooldown -= dt;
      const d = Math.hypot(m.pos.x - playerPos.x, m.pos.z - playerPos.z);
      const hunting = !safe && d < CHASE_RANGE && (turfArmed || m.zone === here || d < 12);
      if (hunting) {
        // Chase Mara at a brisk walk, fists up.
        const dx = playerPos.x - m.pos.x;
        const dz = playerPos.z - m.pos.z;
        const step = Math.min(d, 3.4 * dt);
        m.pos.x += (dx / d) * step;
        m.pos.z += (dz / d) * step;
        m.figure.rotation.y = Math.atan2(dx, dz);
        m.figure.position.copy(m.pos);
        if (d < ATTACK_RANGE && m.cooldown <= 0) {
          m.cooldown = 1.3;
          events.damage += ATTACK_DAMAGE;
        }
      } else {
        // Wander: pick a new direction every couple of seconds.
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = rand(rng, 1.5, 3.5);
          m.wanderAngle = rand(rng, 0, Math.PI * 2);
        }
        const nx = m.pos.x + Math.sin(m.wanderAngle) * 1.1 * dt;
        const nz = m.pos.z + Math.cos(m.wanderAngle) * 1.1 * dt;
        const inZone = Math.hypot(nx - m.zone.center.x, nz - m.zone.center.z) < m.zone.radius - 4;
        if (inZone) {
          m.pos.x = nx;
          m.pos.z = nz;
          m.figure.rotation.y = m.wanderAngle;
          m.figure.position.copy(m.pos);
        } else {
          m.wanderAngle += Math.PI;
        }
      }
    }
    return events;
  }

  /** Save-friendly snapshot: which zones Mara owns. */
  function saveData() {
    return zones.filter((z) => z.owner === 'mara').map((z) => z.id);
  }

  /** Restore owned zones from a save. */
  function restore(ownedIds) {
    if (!Array.isArray(ownedIds)) return;
    for (const zone of zones) {
      if (ownedIds.includes(zone.id)) zone.owner = 'mara';
    }
  }

  return {
    zones,
    members,
    update,
    zoneAt,
    ownedCount,
    rivalsAliveIn,
    armTurfMission,
    knockDown,
    nearestRival,
    rivalsNear,
    saveData,
    restore,
    claimTime: CLAIM_TIME,
  };
}
