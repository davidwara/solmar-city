// Mara's twelve story jobs for Rico — drive, guard, taxi, smuggle, survive,
// photograph, sail, light and fight across Solmar City. Each job is pure
// data in MISSIONS; createMissions builds the beacon, the client and the
// roadblocks and runs the per-frame job logic main.js calls into.
import * as THREE from 'three';
import { CITY } from './city.js';
import { clamp } from './utils.js';

/** A flat point on the city plane (y is always 0). */
function V(x, z) { return new THREE.Vector3(x, 0, z); }

/**
 * The job table, in play order. timeLimit is seconds (0 = no limit);
 * heatOnStart is wanted stars the job opens with; night jobs start at 21:00.
 */
export const MISSIONS = [
  {
    id: 'first-job', title: 'First Job', kind: 'drive',
    briefing: 'Rico left a package at the marina pier. Go get it.',
    target: V(-150, 225), radius: 9, reward: 250, timeLimit: 0,
  },
  {
    id: 'hot-delivery', title: 'Hot Delivery', kind: 'drive',
    briefing: 'The package is marked — the law is on you. Deliver it to the downtown drop, fast.',
    target: V(62, -62), radius: 9, reward: 500, timeLimit: 0, heatOnStart: 2,
  },
  {
    id: 'the-getaway', title: 'The Getaway', kind: 'drive',
    briefing: 'One last run: reach the beachfront safehouse before the clock runs out.',
    target: V(124, 200), radius: 9, reward: 750, timeLimit: 90,
  },
  {
    id: 'night-run', title: 'Night Run', kind: 'drive',
    briefing: 'A midnight pickup on the north edge — the streets are dark and the law is out. 2 minutes.',
    target: V(-186, 124), radius: 9, reward: 900, timeLimit: 120, heatOnStart: 1, night: true,
  },
  {
    id: 'bodyguard', title: 'Bodyguard', kind: 'bodyguard',
    briefing: 'Walk Rico’s client across downtown. Stay close — he only moves when you are near.',
    target: V(62, 62), clientStart: V(-62, 62), radius: 6, reward: 1000, timeLimit: 150,
  },
  {
    id: 'taxi-king', title: 'Taxi King', kind: 'taxi',
    briefing: 'Three fares, one shift. Pick up each rider before their patience runs out.',
    target: V(0, 124),
    fares: [V(0, 124), V(-124, -62), V(124, 200)],
    fareTime: 60, fareReward: 150, radius: 9, reward: 400, timeLimit: 0,
  },
  {
    id: 'smugglers-run', title: 'Smuggler\'s Run', kind: 'smuggler',
    briefing: 'Grab the crate at the marina pier, then run it to the east docks — roadblocks go up the moment you lift it.',
    pickup: V(-150, 225), target: V(186, -62), radius: 9, reward: 1200,
    timeLimit: 150, heatOnPickup: 1,
  },
  {
    id: 'getaway-driver', title: 'Getaway Driver', kind: 'getaway',
    briefing: 'Three stars, the whole city behind you — stay free for 100 seconds and the heat dies.',
    target: V(0, 0), radius: 0, reward: 1500, timeLimit: 100, heatOnStart: 3,
  },
  {
    id: 'shutterbug', title: 'Shutterbug', kind: 'shutterbug',
    briefing: 'Three scenic spots — beach, downtown, marina. Get close and snap each one with C. $300 a photo, $500 bonus for the set.',
    spots: [V(0, 215), V(62, -62), V(-150, 225)],
    photoReward: 300, radius: 15, reward: 500, timeLimit: 0,
  },
  {
    id: 'island-hopper', title: 'Island Hopper', kind: 'boat',
    briefing: 'Take a boat from the marina and run the drop across the bay to the island jetty — the delivery only counts if you arrive by boat.',
    target: V(40, 312), radius: 12, reward: 1400, timeLimit: 240,
  },
  {
    id: 'lighthouse-keeper', title: 'Lighthouse Keeper', kind: 'lighthouse',
    briefing: 'After dark, climb to the island lighthouse and light it — the beam guides the smugglers home. Reach the tower after 21:00.',
    target: V(120, 398), radius: 10, reward: 1600, timeLimit: 300, night: true,
  },
  {
    id: 'turf-war', title: 'Turf War', kind: 'turf',
    briefing: 'The Sharks jumped one of ours. Clear every Shark out of their turf on the north streets — get in close and lay them out with your fists.',
    target: V(-62, -124), radius: 34, reward: 1800, timeLimit: 0, gang: 'sharks',
  },
];

/** Scenic-spot names for the Shutterbug objective line, in spot order. */
const SPOT_NAMES = ['the beachfront', 'downtown plaza', 'the marina'];

/** Flat (x/z) distance between two points. */
function flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

/** Ceiled seconds left, never negative. */
function secsLeft(v) { return Math.max(0, Math.ceil(v)); }

/** A fresh, all-empty events object for one update / photo frame. */
function emptyEvents() {
  return {
    completed: null, reward: 0, failed: false, heat: 0,
    fareDone: false, fareReward: 0, pickup: false,
    photoDone: false, photoReward: 0,
  };
}

/** Build the mission system. scene gets the beacon, the client and the roadblocks. */
export function createMissions(scene) {
  // --- the golden beacon: a spinning gem in a pillar of light ------------
  const markerGroup = new THREE.Group();
  const goldBasic = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(2.1), goldBasic);
  gem.position.y = 6;
  markerGroup.add(gem);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.2, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  pillar.position.y = 13;
  markerGroup.add(pillar);
  scene.add(markerGroup);

  // --- the bodyguard client: gold jacket, easy to spot in a crowd --------
  const vipGroup = new THREE.Group();
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0xe8b73c });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), jacketMat);
  torso.position.y = 1.15;
  vipGroup.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.85;
  vipGroup.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), darkMat);
  legs.position.y = 0.38;
  vipGroup.add(legs);
  vipGroup.visible = false;
  scene.add(vipGroup);

  // --- the smuggler roadblocks: striped barriers across three avenues ----
  const roadblockGroup = new THREE.Group();
  const orangeMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const blockDefs = [
    { x: -62, z: 186, rot: 0 },
    { x: 62, z: 124, rot: Math.PI / 2 },
    { x: 124, z: 0, rot: 0 },
  ];
  for (const def of blockDefs) {
    const barrier = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 0.6), orangeMat);
    bar.position.y = 0.9;
    barrier.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.62), whiteMat);
    stripe.position.y = 1.05;
    barrier.add(stripe);
    for (const sx of [-3, 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.5), whiteMat);
      leg.position.set(sx, 0.45, 0);
      barrier.add(leg);
    }
    barrier.position.set(def.x, 0, def.z);
    barrier.rotation.y = def.rot;
    roadblockGroup.add(barrier);
  }
  roadblockGroup.visible = false;
  scene.add(roadblockGroup);

  // Hooks main.js wires up: the island lights when the lighthouse job
  // completes; the turf hook counts rival Sharks still standing.
  let lighthouseHook = null;
  let turfHook = null;

  // The beacon's spin clock.
  let elapsed = 0;

  const missions = {
    index: 0,
    completed: 0,
    timer: 0,
    timeLeft: 0,
    markerPos: MISSIONS[0].target.clone(),
    started: false,
    fareIndex: 0,
    fareTimeLeft: 0,
    vipPos: MISSIONS[4].clientStart.clone(),
    vipWalking: false,
    smugglerStage: 0,
    photoIndex: 0,
    photosTaken: 0,
  };

  /** The current job, or null when all twelve are done. */
  function current() {
    return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
  }

  /** Reset one job's moving parts (VIP, fares, crate stage, photos, clock). */
  function resetJobState(job) {
    if (!job) return;
    missions.timeLeft = job.timeLimit || 0;
    if (job.kind === 'bodyguard') {
      missions.vipPos.copy(job.clientStart);
      missions.vipWalking = false;
    } else if (job.kind === 'taxi') {
      missions.fareIndex = 0;
      missions.fareTimeLeft = job.fareTime;
    } else if (job.kind === 'smuggler') {
      missions.smugglerStage = 0;
      roadblockGroup.visible = false;
    } else if (job.kind === 'shutterbug') {
      missions.photoIndex = 0;
      missions.photosTaken = 0;
    }
  }

  /** Move the beacon (and the VIP) to wherever the current job points. */
  function placeMarker() {
    const job = current();
    if (!job) {
      markerGroup.visible = false;
      vipGroup.visible = false;
      return;
    }
    vipGroup.visible = job.kind === 'bodyguard';
    if (job.kind === 'bodyguard') {
      missions.markerPos.copy(missions.vipPos);
    } else if (job.kind === 'taxi') {
      missions.markerPos.copy(job.fares[missions.fareIndex]);
    } else if (job.kind === 'smuggler') {
      missions.markerPos.copy(missions.smugglerStage === 0 ? job.pickup : job.target);
    } else if (job.kind === 'getaway') {
      markerGroup.visible = false;
      return;
    } else if (job.kind === 'shutterbug') {
      missions.markerPos.copy(job.spots[missions.photoIndex]);
    } else {
      missions.markerPos.copy(job.target);
    }
    // Keep the beacon inside the playable city even if data ever drifts.
    missions.markerPos.x = clamp(missions.markerPos.x, -CITY.bound, CITY.bound);
    missions.markerPos.z = clamp(missions.markerPos.z, -CITY.bound, CITY.bound + 200);
    markerGroup.visible = true;
    markerGroup.position.set(missions.markerPos.x, 0, missions.markerPos.z);
    vipGroup.position.copy(missions.vipPos);
  }

  /** Start (or jump to) job i. Returns the job, or null when all are done. */
  function startMission(i) {
    const at = Number.isFinite(i) ? clamp(i, 0, MISSIONS.length) : 0;
    missions.index = at;
    missions.completed = at;
    missions.timer = 0;
    missions.started = true;
    const job = current();
    if (job) {
      missions.timeLeft = job.timeLimit || 0;
      resetJobState(job);
    } else {
      missions.timeLeft = 0;
    }
    placeMarker();
    return job;
  }

  /** Restart the current job from scratch. Returns the job, or null. */
  function restartCurrent() {
    const job = current();
    missions.timer = 0;
    if (job) resetJobState(job);
    placeMarker();
    return job;
  }

  /** The HUD objective line for the current job. */
  function objectiveText(playerPos) {
    const job = current();
    if (!job) return 'All jobs done — Solmar City is yours. Free roam!';
    const head = `JOB ${missions.index + 1}/12 — ${job.title}: `;
    const timed = job.timeLimit > 0 ? ` — ${secsLeft(missions.timeLeft)}s left` : '';
    const dist = (p) => Math.round(flatDist(playerPos, p));
    if (job.kind === 'bodyguard') {
      const toSafety = Math.round(flatDist(missions.vipPos, job.target));
      const maraGap = flatDist(playerPos, missions.vipPos);
      let line = `${job.briefing} Client is ${toSafety}m from safety`;
      if (maraGap >= 18) line += ' — GET CLOSER, he stopped!';
      return head + line + ` — ${secsLeft(missions.timeLeft)}s left`;
    }
    if (job.kind === 'taxi') {
      const fare = job.fares[missions.fareIndex];
      return head + `Fare ${missions.fareIndex + 1}/3 — pick up the rider (${dist(fare)}m) — ${secsLeft(missions.fareTimeLeft)}s left`;
    }
    if (job.kind === 'smuggler') {
      if (missions.smugglerStage === 0) {
        return head + `Pick up the crate at the marina pier (${dist(job.pickup)}m)` + timed;
      }
      return head + `Crate aboard — run it to the east docks (${dist(job.target)}m), roadblocks ahead!` + timed;
    }
    if (job.kind === 'getaway') {
      return head + `Stay free — ${secsLeft(missions.timeLeft)}s until the heat dies. Lose the patrol cars!`;
    }
    if (job.kind === 'boat') {
      return head + `Boat delivery — sail to the island jetty (${dist(job.target)}m), arrive by boat` + timed;
    }
    if (job.kind === 'lighthouse') {
      return head + `Light the lighthouse on the island (${dist(job.target)}m)` + timed;
    }
    if (job.kind === 'turf') {
      const left = turfHook ? turfHook() : 0;
      return head + `Clear the Sharks out of their turf — ${left} rival(s) left standing`;
    }
    if (job.kind === 'shutterbug') {
      const spot = job.spots[missions.photoIndex];
      return head + `Photo ${missions.photoIndex + 1}/3 — ${SPOT_NAMES[missions.photoIndex]} (${dist(spot)}m) — press C to snap it`;
    }
    return head + `${job.briefing} (${dist(job.target)}m)` + timed;
  }

  /** The J-key job list: one line per job, DONE / ACTIVE / LOCKED. */
  function listText() {
    return MISSIONS.map((job, i) => {
      const state = i < missions.completed ? 'DONE' : i === missions.index ? 'ACTIVE' : 'LOCKED';
      return `${i + 1}. ${job.title} — $${job.reward} — ${state}`;
    }).join('\n');
  }

  /**
   * The side-hustle lines under the job list. s carries the six systems
   * (fishing, races, delivery, casino, housing, pets) — each as its live
   * object or its save data; absent systems are skipped.
   */
  function sideJobsText(s) {
    const lines = ['— Side hustles —'];
    const num = (obj, ...keys) => {
      if (!obj) return 0;
      for (const k of keys) if (typeof obj[k] === 'number') return obj[k];
      return 0;
    };
    if (s.fishing) {
      lines.push(`Fishing: ${num(s.fishing, 'caught', 'fishCaught')} caught · $${num(s.fishing, 'earned', 'cashEarned')} earned`);
    }
    if (s.races) {
      let bestCount = 0;
      const best = s.races.best;
      if (best && typeof best === 'object') {
        bestCount = Object.values(best).filter((v) => typeof v === 'number' && v > 0).length;
      } else {
        bestCount = num(s.races, 'bestCount', 'bestRoutes');
      }
      lines.push(`Races: ${num(s.races, 'wins')} won · best ${bestCount}/3 routes`);
    }
    if (s.delivery) {
      lines.push(`Courier: ${num(s.delivery, 'done', 'jobsDone')} delivered · $${num(s.delivery, 'tips', 'tipsEarned')} in tips`);
    }
    if (s.casino) {
      lines.push(`Casino: won $${num(s.casino, 'won')} · lost $${num(s.casino, 'lost')}`);
    }
    if (s.housing) {
      const owned = Array.isArray(s.housing.owned)
        ? s.housing.owned.length
        : num(s.housing, 'owned', 'ownedCount');
      lines.push(`Safehouses: ${owned}/3 owned`);
    }
    if (s.pets) {
      lines.push(`Biscuit: ${num(s.pets, 'snacks', 'snacksGiven')} snacks · ${num(s.pets, 'found', 'packagesFound')} packages sniffed out`);
    }
    return lines.join('\n');
  }

  /** Shared finish: pay out, advance to the next job, hand over its heat. */
  function completeJob(events) {
    const job = current();
    if (!job) return events;
    roadblockGroup.visible = false;
    events.completed = job;
    events.reward = job.reward;
    missions.completed = missions.index + 1;
    missions.index += 1;
    missions.timer = 0;
    const next = current();
    if (next) {
      resetJobState(next);
      if (next.heatOnStart) events.heat = next.heatOnStart;
    }
    placeMarker();
    return events;
  }

  /**
   * Snap a photo (C key) on the Shutterbug job. Returns
   * { photoDone, photoReward, tooFar, completed, reward }.
   */
  function snapPhoto(playerPos) {
    const events = {
      photoDone: false, photoReward: 0, tooFar: false, completed: null, reward: 0,
    };
    const job = current();
    if (!job || job.kind !== 'shutterbug') return events;
    const spot = job.spots[missions.photoIndex];
    if (flatDist(playerPos, spot) > job.radius) {
      events.tooFar = true;
      return events;
    }
    events.photoDone = true;
    events.photoReward = job.photoReward;
    missions.photosTaken += 1;
    missions.photoIndex += 1;
    if (missions.photoIndex >= job.spots.length) {
      const done = emptyEvents();
      completeJob(done);
      events.completed = done.completed;
      events.reward = done.reward;
    } else {
      placeMarker();
    }
    return events;
  }

  /** Stage the smuggler delivery (used by screenshot poses). */
  function armSmugglerDelivery() {
    const job = current();
    if (!job || job.kind !== 'smuggler') return;
    missions.smugglerStage = 1;
    roadblockGroup.visible = true;
    placeMarker();
  }

  /** Per-frame job logic. Returns the frame's events. */
  function update(dt, playerPos, opts) {
    const events = emptyEvents();
    const job = current();
    // The beacon always bobs and spins, even with no job left.
    elapsed += dt;
    gem.position.y = 6 + Math.sin(elapsed * 2.2) * 0.7;
    gem.rotation.y += dt * 1.5;
    if (!job) return events;
    const inBoat = !!(opts && opts.inBoat);
    missions.timer += dt;

    /** Count a timed job down; on time-out fail it and reset its clock. */
    const tickClock = () => {
      if (!job.timeLimit) return false;
      missions.timeLeft -= dt;
      if (missions.timeLeft > 0) return false;
      missions.timer = 0;
      missions.timeLeft = job.timeLimit;
      events.failed = true;
      return true;
    };
    const within = (p) => flatDist(playerPos, p) <= job.radius;

    if (job.kind === 'boat') {
      if (tickClock()) return events;
      if (within(job.target) && inBoat) completeJob(events);
      return events;
    }
    if (job.kind === 'lighthouse') {
      if (tickClock()) return events;
      if (within(job.target)) {
        if (lighthouseHook) lighthouseHook();
        completeJob(events);
      }
      return events;
    }
    if (job.kind === 'turf') {
      if (turfHook && turfHook() === 0) completeJob(events);
      return events;
    }
    if (job.kind === 'smuggler') {
      if (tickClock()) {
        resetJobState(job);
        placeMarker();
        return events;
      }
      if (missions.smugglerStage === 0) {
        if (within(job.pickup)) {
          missions.smugglerStage = 1;
          events.pickup = true;
          events.heat = job.heatOnPickup || 0;
          roadblockGroup.visible = true;
          placeMarker();
        }
      } else if (within(job.target)) {
        completeJob(events);
      }
      return events;
    }
    if (job.kind === 'getaway') {
      missions.timeLeft -= dt;
      if (missions.timeLeft <= 0) completeJob(events);
      return events;
    }
    if (job.kind === 'shutterbug') {
      return events; // photos come from the C key, not from the frame loop
    }
    if (job.kind === 'bodyguard') {
      if (tickClock()) {
        resetJobState(job);
        placeMarker();
        return events;
      }
      const gap = flatDist(playerPos, missions.vipPos);
      missions.vipWalking = gap < 18;
      if (missions.vipWalking) {
        const dx = job.target.x - missions.vipPos.x;
        const dz = job.target.z - missions.vipPos.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.01) {
          const step = Math.min(2.4 * dt, len);
          missions.vipPos.x += (dx / len) * step;
          missions.vipPos.z += (dz / len) * step;
        }
      }
      vipGroup.position.copy(missions.vipPos);
      missions.markerPos.copy(missions.vipPos);
      markerGroup.position.set(missions.markerPos.x, 0, missions.markerPos.z);
      if (flatDist(missions.vipPos, job.target) <= job.radius) completeJob(events);
      return events;
    }
    if (job.kind === 'taxi') {
      missions.fareTimeLeft -= dt;
      if (missions.fareTimeLeft <= 0) {
        missions.fareIndex = 0;
        missions.fareTimeLeft = job.fareTime;
        missions.timer = 0;
        events.failed = true;
        placeMarker();
        return events;
      }
      const fare = job.fares[missions.fareIndex];
      if (within(fare)) {
        events.fareDone = true;
        events.fareReward = job.fareReward;
        missions.fareIndex += 1;
        missions.fareTimeLeft = job.fareTime;
        if (missions.fareIndex >= job.fares.length) {
          completeJob(events);
        } else {
          placeMarker();
        }
      }
      return events;
    }
    // Plain drive jobs.
    if (tickClock()) return events;
    if (within(job.target)) completeJob(events);
    return events;
  }

  missions.current = current;
  missions.startMission = startMission;
  missions.restartCurrent = restartCurrent;
  missions.objectiveText = objectiveText;
  missions.listText = listText;
  missions.sideJobsText = sideJobsText;
  missions.update = update;
  missions.snapPhoto = snapPhoto;
  missions.armSmugglerDelivery = armSmugglerDelivery;
  missions.setLighthouseHook = (fn) => { lighthouseHook = fn; };
  missions.setTurfHook = (fn) => { turfHook = fn; };

  placeMarker();
  return missions;
}
