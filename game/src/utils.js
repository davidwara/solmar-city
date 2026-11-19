// Small math / RNG helpers shared by every Solmar City module.
// No dependencies; everything here is written for this game.

/** Deterministic RNG (mulberry32) so a seed always builds the same city. */
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random number in [min, max). */
export function rand(rng, min, max) { return min + rng() * (max - min); }

/** Random integer in [min, max] inclusive. */
export function randInt(rng, min, max) { return Math.floor(rand(rng, min, max + 1)); }

/** True with probability p (0..1) on the given rng — weather rolls on it. */
export function chance(rng, p) { return rng() < p; }

/** Pick one element of an array. */
export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

/** Clamp to 0..1 (used for flash / fade intensities). */
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Shortest signed angle from a to b, in [-PI, PI]. Used by pursuit AI. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Shortest-arc interpolation between two angles. */
export function lerpAngle(a, b, t) { return a + angleDiff(a, b) * t; }

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Phase 6: clamp any angle to [-PI, PI] in one call — Biscuit's heading
 * and the race gates use it so a turn never spins the long way round.
 */
export function clampAngle(a) { return angleDiff(0, a); }

/**
 * Phase 6: money as "$1,250" everywhere — the HUD, the casino and the
 * hospital bill all format through this one helper now.
 */
export function formatMoney(n) {
  const v = Math.round(n || 0);
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US');
}
