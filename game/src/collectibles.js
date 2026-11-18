// Collectibles: 15 hidden packages stashed around Solmar City.
// A package is a glowing cyan octahedron bobbing over a ring — tucked
// down alleys, on the beach, at the marina pier and on downtown corners.
// Walk or drive through one to grab it: $100 each, and $1,000 when the
// set is complete. The minimap only shows a package once Mara is within
// 60m, so the last few have to be hunted, not followed. Progress saves
// with the rest of Mara's story (save.js keeps the count).
import * as THREE from 'three';
import { createRng, rand } from './utils.js';

export const PACKAGE_TOTAL = 15;
export const PACKAGE_REWARD = 100;
export const PACKAGE_BONUS = 1000;
export const PACKAGE_RADIUS = 3.5;
export const PACKAGE_REVEAL = 60;

/**
 * Hidden-package glow brightness for an hour of day and a game-time
 * clock: 0..1, pulsing on a sine of game time and brighter at night
 * (day ~0.35, deep night 1.0, smooth ramps at dawn and dusk) so the
 * packages are easier to spot after dark.
 */
export function packageGlow(hour, time) {
  const h = ((hour % 24) + 24) % 24;
  const night = h >= 20.5 || h < 5 ? 1 : h < 7 ? 1 - (h - 5) / 2 : h < 19 ? 0 : (h - 19) / 1.5;
  const pulse = 0.75 + 0.25 * Math.sin(time * 3);
  return Math.min(1, (0.35 + 0.65 * night) * pulse);
}

// Stash spots: alleys, beach corners, the marina pier, downtown nooks.
const SPOTS = [
  [-150, 225], // marina pier — where the first job starts
  [-168, 200], // behind the marina boats
  [60, 215], // beach, east end
  [-120, 205], // beach, west end
  [0, 215], // beachfront centre
  [62, -62], // downtown drop corner
  [-62, -62], // downtown west alley
  [124, 62], // east side street
  [-124, 62], // west side street
  [-186, 124], // north-west edge
  [186, -62], // east edge
  [0, -186], // north edge
  [124, -124], // north-east alley
  [-62, 186], // beachfront west
  [186, 124], // docks corner
];

/** Build the package hunt. Returns the tracker + update. */
export function createCollectibles(scene, seed) {
  const rng = createRng(seed * 7919 + 7);
  const items = SPOTS.map(([x, z], i) => {
    const group = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: 0x7df9ff }),
    );
    gem.position.y = 1.6;
    group.add(gem);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.6 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.35;
    group.add(ring);
    group.position.set(x, 0, z);
    scene.add(group);
    return { group, gem, ring, pos: new THREE.Vector3(x, 0, z), taken: false, phase: rand(rng, 0, Math.PI * 2), index: i };
  });

  const collectibles = {
    count: 0,
    total: PACKAGE_TOTAL,
    items,
    timer: 0,
  };

  /** HUD line: how many of the set Mara has found. */
  function counterText() {
    return `Packages ${collectibles.count}/${PACKAGE_TOTAL}`;
  }

  /** Packages close enough to show on the minimap (cyan dots). */
  function nearby(focusPos) {
    const out = [];
    for (const it of items) {
      if (it.taken) continue;
      const d = Math.hypot(it.pos.x - focusPos.x, it.pos.z - focusPos.z);
      if (d < PACKAGE_REVEAL) out.push(it.pos);
    }
    return out;
  }

  /** Move one package to a spot (screenshot poses stage a grab in frame). */
  function stageOne(x, z) {
    const it = items.find((p) => !p.taken);
    if (!it) return null;
    it.pos.set(x, 0, z);
    it.group.position.set(x, 0, z);
    return it;
  }

  /** Restore a saved count (loaded games keep the packages Mara found). */
  function restore(n) {
    const kept = Math.max(0, Math.min(PACKAGE_TOTAL, n || 0));
    for (let i = 0; i < kept; i++) {
      items[i].taken = true;
      items[i].group.visible = false;
    }
    collectibles.count = kept;
  }

  /**
   * Spin + bob the gems; grab any Mara walks or drives through.
   * Returns { collected, bonus }: how many were just taken, and true
   * when the set is complete (the $1,000 bonus pays then).
   * `hour` drives the glow: packages pulse brighter at night.
   */
  function update(dt, focusPos, hour = 10) {
    const events = { collected: 0, bonus: false };
    collectibles.timer += dt;
    const glow = packageGlow(hour, collectibles.timer);
    for (const it of items) {
      if (it.taken) continue;
      it.gem.position.y = 1.6 + Math.sin(collectibles.timer * 2 + it.phase) * 0.35;
      it.gem.rotation.y += dt * 1.8;
      it.gem.scale.setScalar(0.9 + 0.25 * glow);
      it.ring.material.opacity = 0.25 + 0.55 * glow;
      it.ring.rotation.z += dt * 0.8;
      const d = Math.hypot(it.pos.x - focusPos.x, it.pos.z - focusPos.z);
      if (d < PACKAGE_RADIUS) {
        it.taken = true;
        it.group.visible = false;
        collectibles.count += 1;
        events.collected += 1;
        if (collectibles.count >= PACKAGE_TOTAL) events.bonus = true;
      }
    }
    return events;
  }

  collectibles.counterText = counterText;
  collectibles.nearby = nearby;
  collectibles.stageOne = stageOne;
  collectibles.restore = restore;
  collectibles.update = update;
  return collectibles;
}
