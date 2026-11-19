// Fishing: a quiet side-hustle on the east pier. Mara walks out onto the
// wooden pier south of the beachfront, casts a line with F, and waits for
// the bobber to dip. A bite gives her a short window to reel in with F
// again — too slow and the fish gets away. The catch goes in her bucket:
// Minnow $15, Bass $40, and the rare Golden Koi $200 (much likelier at
// golden hour, when the bay turns to copper). Sell the bucket at the pier
// with E. The pier, the bobber and the bucket are all built here; the
// catch log feeds the HUD side line through main.js.
import * as THREE from 'three';
import { clamp } from './utils.js';

// The pier juts off the east beach into the bay, clear of the marina
// moorings to the west. The water starts at z = 250; the pier tip hangs
// over it so the bobber always lands in open water.
export const PIER_POS = { x: 100, z: 232 };
export const PIER_TIP = { x: 100, z: 256 };
export const FISH_PRICES = { Minnow: 15, Bass: 40, 'Golden Koi': 200, 'Old Boot': 5 };

const CATCH_TABLE = [
  { kind: 'Minnow', weight: 58, color: 0x9fb8c8 },
  { kind: 'Bass', weight: 32, color: 0x5a7a4a },
  { kind: 'Golden Koi', weight: 10, color: 0xf2c14e },
  // Phase 7: the bay gives up junk too — an old boot, worth $5 as scrap.
  { kind: 'Old Boot', weight: 8, color: 0x5a4028 },
];

export function createFishing(scene, audio) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });

  // The pier: planks from the sand out over the water, posts at the end.
  const pier = new THREE.Group();
  /** One mesh, positioned and added to the pier — the pier builder's shorthand. */
  const box = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    pier.add(m);
    return m;
  };
  box(new THREE.BoxGeometry(5, 0.35, 30), wood, 0, 0.6, 0);
  for (const [px, pz] of [[-2.2, -13], [2.2, -13], [-2.2, 13], [2.2, 13]]) {
    box(new THREE.CylinderGeometry(0.24, 0.24, 2.2, 8), postMat, px, 0.6, pz);
  }
  // A bait bucket and a hand-painted FISHING sign at the pier root.
  box(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 10), new THREE.MeshLambertMaterial({ color: 0x3d7bff }), -2.6, 0.4, -13);
  box(new THREE.BoxGeometry(4.4, 1.1, 0.2), new THREE.MeshLambertMaterial({ color: 0x2e6fd8 }), 0, 2.6, -14.6);
  pier.position.set(PIER_POS.x, 0, PIER_POS.z);
  scene.add(pier);

  // The bobber: a red-and-white float that bobs on the swell and dips
  // under when something takes the bait.
  const bobberMat = new THREE.MeshLambertMaterial({ color: 0xff3b30 });
  const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), bobberMat);
  bobber.visible = false;
  scene.add(bobber);

  const fishing = {
    state: 'idle', // idle | waiting | bite
    waitTimer: 0,
    biteTimer: 0,
    bobPhase: 0,
    castPos: null,
    bucket: [], // kinds caught since the last sale
    fishCaught: 0,
    cashEarned: 0,
    lastCatch: '',
    goldenBites: 0,
    // Phase 7: the catch log — the last five things on the line, newest
    // first, so the pier keeps its own scorecard.
    catchLog: [],
  };

  /** True when Mara stands on (or at the root of) the pier, on foot. */
  function nearPier(pos) {
    return Math.hypot(pos.x - PIER_POS.x, pos.z - PIER_POS.z) < 9;
  }

  /** Cast the line off the pier tip. Returns false if she cannot fish. */
  function cast(pos) {
    if (fishing.state !== 'idle') return false;
    if (!nearPier(pos)) return false;
    fishing.state = 'waiting';
    fishing.waitTimer = 3 + Math.random() * 5;
    fishing.castPos = { x: PIER_TIP.x + (Math.random() - 0.5) * 3, z: PIER_TIP.z + Math.random() * 3 };
    bobber.position.set(fishing.castPos.x, 0.45, fishing.castPos.z);
    bobber.visible = true;
    bobberMat.color.setHex(0xff3b30);
    return true;
  }

  /** Reel in. Only a bite in progress can be landed. Returns the catch. */
  function reel() {
    if (fishing.state !== 'bite') return null;
    fishing.state = 'idle';
    bobber.visible = false;
    const goldenHour = fishing._goldenHour === true;
    // Golden hour doubles the Koi's share of the table.
    const table = CATCH_TABLE.map((c) => ({
      ...c,
      weight: c.kind === 'Golden Koi' && goldenHour ? c.weight * 2 : c.weight,
    }));
    const total = table.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * total;
    let caught = table[0];
    for (const c of table) {
      roll -= c.weight;
      if (roll <= 0) { caught = c; break; }
    }
    fishing.bucket.push(caught.kind);
    fishing.fishCaught += 1;
    fishing.lastCatch = caught.kind;
    fishing.catchLog.unshift(caught.kind);
    if (fishing.catchLog.length > 5) fishing.catchLog.pop();
    if (caught.kind === 'Golden Koi') fishing.goldenBites += 1;
    if (audio && audio.chime) audio.chime();
    return caught.kind;
  }

  /** Sell the whole bucket at the pier. Returns the cash paid, or 0. */
  function sell(pos) {
    if (!nearPier(pos) || fishing.bucket.length === 0) return 0;
    let total = 0;
    for (const kind of fishing.bucket) total += FISH_PRICES[kind] || 0;
    fishing.bucket.length = 0;
    fishing.cashEarned += total;
    if (audio && audio.jingle) audio.jingle();
    return total;
  }

  function update(dt, opts = {}) {
    dt = Math.max(0, dt); // a negative frame step must never rewind the bite clock
    fishing._goldenHour = opts.goldenHour === true;
    if (fishing.state === 'idle') return;
    fishing.bobPhase += dt;
    // The bobber rides the swell; the sea-breeze drift is subtle.
    const drift = opts.seaBreeze || 0;
    if (fishing.castPos) {
      bobber.position.x = fishing.castPos.x + Math.sin(fishing.bobPhase * 0.9) * (0.25 + drift * 0.4);
      bobber.position.z = fishing.castPos.z + Math.cos(fishing.bobPhase * 0.7) * 0.2;
    }
    if (fishing.state === 'waiting') {
      bobber.position.y = 0.45 + Math.sin(fishing.bobPhase * 2.2) * 0.12;
      fishing.waitTimer -= dt;
      if (fishing.waitTimer <= 0) {
        fishing.state = 'bite';
        fishing.biteTimer = 1.4;
        bobberMat.color.setHex(0xffd23f);
        if (audio && audio.splash) audio.splash();
      }
    } else if (fishing.state === 'bite') {
      // The bite: the bobber plunges under and pops back up twice.
      bobber.position.y = 0.45 - Math.abs(Math.sin(fishing.bobPhase * 9)) * 0.45;
      fishing.biteTimer -= dt;
      if (fishing.biteTimer <= 0) {
        // Too slow — the fish stole the bait and the line goes slack.
        fishing.state = 'idle';
        bobber.visible = false;
        fishing.lastCatch = 'got away';
      }
    }
  }

  /** One-line status for the HUD side line. */
  function statusText() {
    const carrying = fishing.bucket.length;
    if (fishing.state === 'waiting') return 'Fishing… waiting for a bite';
    if (fishing.state === 'bite') return 'BITE! Press F to reel in!';
    if (carrying > 0) return `Bucket: ${carrying} fish — E at the pier to sell`;
    if (fishing.fishCaught > 0) return `Fishing: ${fishing.fishCaught} caught · $${fishing.cashEarned} earned`;
    return '';
  }

  /** Phase 7: the catch log as one line — "Bass, Minnow, Old Boot" —
   *  or '' before the first cast. */
  function catchLogText() {
    if (fishing.catchLog.length === 0) return '';
    return `Last catches: ${fishing.catchLog.join(', ')}`;
  }

  /** What the hint bar should say when Mara stands on the pier. */
  function promptText() {
    if (fishing.state === 'bite') return 'F — REEL IT IN!';
    if (fishing.state === 'waiting') return 'Fishing… wait for the bobber to dip';
    if (fishing.bucket.length > 0) return 'F — cast a line · E — sell the bucket';
    return 'F — cast a fishing line';
  }

  /** Minimap marker: the pier. */
  function markers() {
    return [{ x: PIER_POS.x, z: PIER_POS.z, color: '#3d7bff', shape: 'diamond', r: 5 }];
  }

  function saveData() {
    return { fishCaught: fishing.fishCaught, cashEarned: fishing.cashEarned, goldenBites: fishing.goldenBites, bucket: fishing.bucket.slice() };
  }

  function restore(data) {
    if (!data) return;
    for (const k of ['fishCaught', 'cashEarned', 'goldenBites']) if (typeof data[k] === 'number') fishing[k] = data[k];
    if (Array.isArray(data.bucket)) fishing.bucket = data.bucket.filter((k) => FISH_PRICES[k]);
  }

  Object.assign(fishing, { nearPier, cast, reel, sell, update, statusText, catchLogText, promptText, markers, saveData, restore });
  return fishing;
}
