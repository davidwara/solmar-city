// Mara's twelve story jobs — the campaign spine of Solmar City.
// Each job is a small contract: go somewhere (or do something) and get
// paid. The module owns the golden beacon, the bodyguard client and the
// smuggler roadblocks, and reports frame-by-frame events to the main
// loop so the HUD, the money and the wanted level stay in sync.
import * as THREE from 'three';
import { CITY } from './city.js';
import { clamp } from './utils.js';

const BEACON_GOLD = 0xffc93c;
const VIP_JACKET = 0xd4af37;
const VIP_SKIN = 0xd9a986;
const VIP_TROUSERS = 0x222831;
const BLOCK_ORANGE = 0xff7a2a;
const BLOCK_WHITE = 0xf2f2f2;

const SPOT_NAMES = ['the beachfront', 'downtown plaza', 'the marina'];

// The twelve jobs, in campaign order. `time` is a limit in seconds
// (0 = no clock); `target` is always a flat point on the map (y = 0).
export const MISSIONS = [
  {
    id: 'first-job', title: 'First Job', kind: 'drive',
    briefing: 'Rico left a package at the marina pier. Go get it.',
    target: new THREE.Vector3(-150, 0, 225), radius: 9, reward: 250, time: 0,
  },
  {
    id: 'hot-delivery', title: 'Hot Delivery', kind: 'drive',
    briefing: 'The package is marked — the law is on you. Deliver it to the downtown drop, fast.',
    target: new THREE.Vector3(62, 0, -62), radius: 9, reward: 500, time: 0,
    heatOnStart: 2,
  },
  {
    id: 'the-getaway', title: 'The Getaway', kind: 'drive',
    briefing: 'One last run: reach the beachfront safehouse before the clock runs out.',
    target: new THREE.Vector3(124, 0, 200), radius: 9, reward: 750, time: 90,
  },
  {
    id: 'night-run', title: 'Night Run', kind: 'drive',
    briefing: 'A midnight pickup on the north edge — the streets are dark and the law is out. 2 minutes.',
    target: new THREE.Vector3(-186, 0, 124), radius: 9, reward: 900, time: 120,
    heatOnStart: 1, night: true,
  },
  {
    id: 'bodyguard', title: 'Bodyguard', kind: 'bodyguard',
    briefing: 'Walk Rico’s client across downtown. Stay close — he only moves when you are near.',
    target: new THREE.Vector3(62, 0, 62),
    clientStart: new THREE.Vector3(-62, 0, 62),
    radius: 6, reward: 1000, time: 150,
  },
  {
    id: 'taxi-king', title: 'Taxi King', kind: 'taxi',
    briefing: 'Three fares, one shift. Pick up each rider before their patience runs out.',
    target: new THREE.Vector3(0, 0, 124),
    fares: [
      new THREE.Vector3(0, 0, 124),
      new THREE.Vector3(-124, 0, -62),
      new THREE.Vector3(124, 0, 200),
    ],
    fareTime: 60, fareReward: 150, radius: 9, reward: 400, time: 0,
  },
  {
    id: 'smugglers-run', title: 'Smuggler\'s Run', kind: 'smuggler',
    briefing: 'Grab the crate at the marina pier, then run it to the east docks — roadblocks go up the moment you lift it.',
    pickup: new THREE.Vector3(-150, 0, 225),
    target: new THREE.Vector3(186, 0, -62), radius: 9, reward: 1200, time: 150,
    heatOnPickup: 1,
  },
  {
    id: 'getaway-driver', title: 'Getaway Driver', kind: 'getaway',
    briefing: 'Three stars, the whole city behind you — stay free for 100 seconds and the heat dies.',
    target: new THREE.Vector3(0, 0, 0), radius: 0, reward: 1500, time: 100,
    heatOnStart: 3,
  },
  {
    id: 'shutterbug', title: 'Shutterbug', kind: 'shutterbug',
    briefing: 'Three scenic spots — beach, downtown, marina. Get close and snap each one with C. $300 a photo, $500 bonus for the set.',
    target: new THREE.Vector3(0, 0, 215),
    spots: [
      new THREE.Vector3(0, 0, 215),
      new THREE.Vector3(62, 0, -62),
      new THREE.Vector3(-150, 0, 225),
    ],
    photoReward: 300, radius: 15, reward: 500, time: 0,
  },
  {
    id: 'island-hopper', title: 'Island Hopper', kind: 'boat',
    briefing: 'Take a boat from the marina and run the drop across the bay to the island jetty — the delivery only counts if you arrive by boat.',
    target: new THREE.Vector3(40, 0, 312), radius: 12, reward: 1400, time: 240,
  },
  {
    id: 'lighthouse-keeper', title: 'Lighthouse Keeper', kind: 'lighthouse',
    briefing: 'After dark, climb to the island lighthouse and light it — the beam guides the smugglers home. Reach the tower after 21:00.',
    target: new THREE.Vector3(120, 0, 398), radius: 10, reward: 1600, time: 300,
    night: true,
  },
  {
    id: 'turf-war', title: 'Turf War', kind: 'turf',
    briefing: 'The Sharks jumped one of ours. Clear every Shark out of their turf on the north streets — get in close and lay them out with your fists.',
    target: new THREE.Vector3(-62, 0, -124), radius: 34, reward: 1800, time: 0,
    gang: 'sharks',
  },
];

const VIP_FOLLOW_RANGE = 18; // Mara must stay this close or the client freezes
const VIP_WALK_SPEED = 2.4; // metres per second toward the safe point

export function createMissions(scene) {
  // ---- visuals: the golden beacon -------------------------------------
  const beacon = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.05),
    new THREE.MeshBasicMaterial({ color: BEACON_GOLD }),
  );
  gem.position.y = 6;
  beacon.add(gem);
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.2, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: BEACON_GOLD, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  pillar.position.y = 13;
  beacon.add(pillar);
  scene.add(beacon);

  // ---- visuals: Rico's client (the bodyguard VIP) --------------------
  const vip = new THREE.Group();
  const vipTorso = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.85, 0.4),
    new THREE.MeshLambertMaterial({ color: VIP_JACKET }),
  );
  vipTorso.position.y = 1.15;
  vip.add(vipTorso);
  const vipHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshLambertMaterial({ color: VIP_SKIN }),
  );
  vipHead.position.y = 1.85;
  vip.add(vipHead);
  const vipLegs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.75, 0.3),
    new THREE.MeshLambertMaterial({ color: VIP_TROUSERS }),
  );
  vipLegs.position.y = 0.38;
  vip.add(vipLegs);
  vip.visible = false;
  scene.add(vip);

  // ---- visuals: the three smuggler roadblocks ------------------------
  const blockSpecs = [
    { x: -62, z: 186, rot: 0 },
    { x: 62, z: 124, rot: Math.PI / 2 },
    { x: 124, z: 0, rot: 0 },
  ];
  const blockers = blockSpecs.map(({ x, z, rot }) => {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.1, 0.6),
      new THREE.MeshLambertMaterial({ color: BLOCK_ORANGE }),
    );
    bar.position.y = 0.9;
    g.add(bar);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.35, 0.62),
      new THREE.MeshLambertMaterial({ color: BLOCK_WHITE }),
    );
    stripe.position.y = 1.05;
    g.add(stripe);
    for (const sx of [-3, 3]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.9, 0.5),
        new THREE.MeshLambertMaterial({ color: BLOCK_WHITE }),
      );
      leg.position.set(sx, 0.45, 0);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.visible = false;
    scene.add(g);
    return g;
  });

  // ---- hooks set by the main loop ------------------------------------
  let lighthouseHook = null;
  let turfHook = null;
  let bobTime = 0;

  function showBlockers() { for (const b of blockers) b.visible = true; }
  function hideBlockers() { for (const b of blockers) b.visible = false; }

  const missions = {
    index: 0,
    completed: 0,
    timer: 0,
    timeLeft: 0,
    markerPos: new THREE.Vector3(-150, 0, 225),
    started: false,
    fareIndex: 0,
    fareTimeLeft: 0,
    vipPos: new THREE.Vector3(-62, 0, 62),
    vipWalking: false,
    smugglerStage: 0,
    photoIndex: 0,
    photosTaken: 0,
  };

  function currentJob() {
    return MISSIONS[missions.index] || null;
  }

  // Put every per-job moving part back to its start-of-job state.
  function resetJobState() {
    const job = currentJob();
    missions.timeLeft = job ? (job.time || 0) : 0;
    if (!job) return;
    if (job.kind === 'bodyguard') {
      missions.vipPos.copy(job.clientStart);
      missions.vipWalking = false;
      vip.position.copy(missions.vipPos);
    } else if (job.kind === 'taxi') {
      missions.fareIndex = 0;
      missions.fareTimeLeft = job.fareTime || 0;
    } else if (job.kind === 'smuggler') {
      missions.smugglerStage = 0;
      hideBlockers();
    } else if (job.kind === 'shutterbug') {
      missions.photoIndex = 0;
      missions.photosTaken = 0;
    }
  }

  // Move the beacon (and the VIP) to wherever the current job points.
  function placeMarker() {
    const job = currentJob();
    if (!job || job.kind === 'getaway') {
      beacon.visible = false;
      vip.visible = false;
      return;
    }
    beacon.visible = true;
    if (job.kind === 'bodyguard') {
      missions.markerPos.copy(missions.vipPos);
      vip.visible = true;
    } else if (job.kind === 'taxi') {
      missions.markerPos.copy(job.fares[missions.fareIndex]);
      vip.visible = false;
    } else if (job.kind === 'smuggler') {
      missions.markerPos.copy(missions.smugglerStage === 0 ? job.pickup : job.target);
      vip.visible = false;
    } else if (job.kind === 'shutterbug') {
      missions.markerPos.copy(job.spots[missions.photoIndex]);
      vip.visible = false;
    } else {
      missions.markerPos.copy(job.target);
      vip.visible = false;
    }
    beacon.position.set(missions.markerPos.x, 0, missions.markerPos.z);
  }

  // Shared finish path: pay out, advance, set up the next job.
  function finishJob(events) {
    const job = currentJob();
    hideBlockers();
    events.completed = job;
    events.reward = job.reward;
    missions.completed = missions.index + 1;
    missions.index += 1;
    missions.timer = 0;
    const next = currentJob();
    if (next) {
      missions.timeLeft = next.time || 0;
      resetJobState();
      if (next.heatOnStart) events.heat = next.heatOnStart;
    } else {
      missions.timeLeft = 0;
    }
    placeMarker();
    return events;
  }

  // Advance the job clock; true when a timed job just ran out.
  function clockExpired(dt) {
    const job = currentJob();
    if (!job || !job.time) return false;
    missions.timer += dt;
    missions.timeLeft = Math.max(0, job.time - missions.timer);
    return missions.timer >= job.time;
  }

  function flatDist(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function startMission(i) {
    const idx = clamp(i, 0, MISSIONS.length);
    missions.index = idx;
    missions.completed = idx;
    missions.timer = 0;
    missions.started = true;
    hideBlockers();
    resetJobState();
    placeMarker();
    return currentJob();
  }

  function restartCurrent() {
    missions.timer = 0;
    resetJobState();
    placeMarker();
    return currentJob();
  }

  function objectiveText(playerPos) {
    const job = currentJob();
    if (!job) return 'All jobs done — Solmar City is yours. Free roam!';
    const head = `JOB ${missions.index + 1}/12 — ${job.title}: `;
    const secsLeft = () => Math.max(0, Math.ceil(missions.timeLeft));
    const timed = job.time > 0 ? ` — ${secsLeft()}s left` : '';
    const metres = (p) => Math.round(flatDist(playerPos, p));
    if (job.kind === 'bodyguard') {
      const toSafety = Math.round(flatDist(missions.vipPos, job.target));
      const maraToVip = flatDist(playerPos, missions.vipPos);
      let line = `${job.briefing} Client is ${toSafety}m from safety`;
      if (maraToVip >= VIP_FOLLOW_RANGE) line += ' — GET CLOSER, he stopped!';
      line += ` — ${secsLeft()}s left`;
      return head + line;
    }
    if (job.kind === 'taxi') {
      const fare = job.fares[missions.fareIndex];
      const fareSecs = Math.max(0, Math.ceil(missions.fareTimeLeft));
      return head + `Fare ${missions.fareIndex + 1}/3 — pick up the rider (${metres(fare)}m) — ${fareSecs}s left`;
    }
    if (job.kind === 'smuggler') {
      if (missions.smugglerStage === 0) {
        return head + `Pick up the crate at the marina pier (${metres(job.pickup)}m)` + timed;
      }
      return head + `Crate aboard — run it to the east docks (${metres(job.target)}m), roadblocks ahead!` + timed;
    }
    if (job.kind === 'getaway') {
      return head + `Stay free — ${secsLeft()}s until the heat dies. Lose the patrol cars!`;
    }
    if (job.kind === 'boat') {
      return head + `Boat delivery — sail to the island jetty (${metres(job.target)}m), arrive by boat` + timed;
    }
    if (job.kind === 'lighthouse') {
      return head + `Light the lighthouse on the island (${metres(job.target)}m)` + timed;
    }
    if (job.kind === 'turf') {
      const left = turfHook ? turfHook() : 0;
      return head + `Clear the Sharks out of their turf — ${left} rival(s) left standing`;
    }
    if (job.kind === 'shutterbug') {
      const spot = job.spots[missions.photoIndex];
      return head + `Photo ${missions.photoIndex + 1}/3 — ${SPOT_NAMES[missions.photoIndex]} (${metres(spot)}m) — press C to snap it`;
    }
    return head + `${job.briefing} (${metres(job.target)}m)` + timed;
  }

  function listText() {
    return MISSIONS.map((job, i) => {
      const state = i < missions.completed ? 'DONE' : (i === missions.index ? 'ACTIVE' : 'LOCKED');
      return `${i + 1}. ${job.title} — $${job.reward} — ${state}`;
    }).join('\n');
  }

  function sideJobsText(s) {
    const sys = s || {};
    const lines = ['— Side hustles —'];
    if (sys.fishing) {
      lines.push(`Fishing: ${sys.fishing.fishCaught} caught · $${sys.fishing.cashEarned} earned`);
    }
    if (sys.races) {
      const routes = Object.keys(sys.races.best || {}).length;
      lines.push(`Races: ${sys.races.wins} won · best ${routes}/3 routes`);
    }
    if (sys.delivery) {
      lines.push(`Courier: ${sys.delivery.jobsDone} delivered · $${sys.delivery.tipsEarned} in tips`);
    }
    if (sys.casino) {
      lines.push(`Casino: won $${sys.casino.won} · lost $${sys.casino.lost}`);
    }
    if (sys.housing) {
      lines.push(`Safehouses: ${sys.housing.owned.length}/3 owned`);
    }
    if (sys.pets) {
      lines.push(`Biscuit: ${sys.pets.snacksGiven} snacks · ${sys.pets.packagesFound} packages sniffed out`);
    }
    return lines.join('\n');
  }

  function snapPhoto(playerPos) {
    const events = { photoDone: false, photoReward: 0, tooFar: false, completed: null, reward: 0 };
    const job = currentJob();
    if (!job || job.kind !== 'shutterbug') return events;
    const spot = job.spots[missions.photoIndex];
    if (flatDist(playerPos, spot) > job.radius) {
      events.tooFar = true;
      return events;
    }
    missions.photosTaken += 1;
    missions.photoIndex += 1;
    events.photoDone = true;
    events.photoReward = job.photoReward;
    if (missions.photoIndex >= job.spots.length) {
      finishJob(events);
    } else {
      placeMarker();
    }
    return events;
  }

  function update(dt, playerPos, opts) {
    const events = {
      completed: null, reward: 0, failed: false, heat: 0,
      fareDone: false, fareReward: 0, pickup: false,
      photoDone: false, photoReward: 0,
    };
    // The beacon gem bobs and spins whether or not a job is live.
    bobTime += dt;
    gem.rotation.y = bobTime * 1.5;
    gem.position.y = 6 + Math.sin(bobTime * 2.2) * 0.7;

    const job = currentJob();
    if (!job) return events;
    const options = opts || {};
    const within = (p, r) => flatDist(playerPos, p) <= r;

    if (job.kind === 'boat') {
      if (clockExpired(dt)) {
        events.failed = true;
        missions.timer = 0;
        missions.timeLeft = job.time;
        return events;
      }
      if (within(job.target, job.radius) && options.inBoat) finishJob(events);
      return events;
    }

    if (job.kind === 'lighthouse') {
      if (clockExpired(dt)) {
        events.failed = true;
        missions.timer = 0;
        missions.timeLeft = job.time;
        return events;
      }
      if (within(job.target, job.radius)) {
        if (lighthouseHook) lighthouseHook();
        finishJob(events);
      }
      return events;
    }

    if (job.kind === 'turf') {
      if (turfHook && turfHook() === 0) finishJob(events);
      return events;
    }

    if (job.kind === 'smuggler') {
      if (clockExpired(dt)) {
        events.failed = true;
        missions.timer = 0;
        resetJobState();
        placeMarker();
        return events;
      }
      if (missions.smugglerStage === 0) {
        if (within(job.pickup, job.radius)) {
          missions.smugglerStage = 1;
          events.pickup = true;
          events.heat = job.heatOnPickup || 0;
          showBlockers();
          placeMarker();
        }
      } else if (within(job.target, job.radius)) {
        finishJob(events);
      }
      return events;
    }

    if (job.kind === 'getaway') {
      missions.timer += dt;
      missions.timeLeft = Math.max(0, job.time - missions.timer);
      if (missions.timer >= job.time) finishJob(events);
      return events;
    }

    if (job.kind === 'shutterbug') {
      return events; // photos only arrive through snapPhoto (the C key)
    }

    if (job.kind === 'bodyguard') {
      if (clockExpired(dt)) {
        events.failed = true;
        missions.timer = 0;
        resetJobState();
        placeMarker();
        return events;
      }
      const maraToVip = flatDist(playerPos, missions.vipPos);
      missions.vipWalking = maraToVip < VIP_FOLLOW_RANGE;
      if (missions.vipWalking) {
        const dx = job.target.x - missions.vipPos.x;
        const dz = job.target.z - missions.vipPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0) {
          const step = Math.min(VIP_WALK_SPEED * dt, dist);
          missions.vipPos.x += (dx / dist) * step;
          missions.vipPos.z += (dz / dist) * step;
          missions.vipPos.x = clamp(missions.vipPos.x, -CITY.bound, CITY.bound);
          missions.vipPos.z = clamp(missions.vipPos.z, -CITY.bound, CITY.bound);
        }
        vip.position.copy(missions.vipPos);
        missions.markerPos.copy(missions.vipPos);
        beacon.position.set(missions.vipPos.x, 0, missions.vipPos.z);
      }
      if (flatDist(missions.vipPos, job.target) <= job.radius) finishJob(events);
      return events;
    }

    if (job.kind === 'taxi') {
      missions.fareTimeLeft -= dt;
      if (missions.fareTimeLeft <= 0) {
        events.failed = true;
        missions.fareIndex = 0;
        missions.fareTimeLeft = job.fareTime;
        placeMarker();
        return events;
      }
      const fare = job.fares[missions.fareIndex];
      if (fare && within(fare, job.radius)) {
        events.fareDone = true;
        events.fareReward = job.fareReward;
        missions.fareIndex += 1;
        missions.fareTimeLeft = job.fareTime;
        if (missions.fareIndex >= job.fares.length) finishJob(events);
        else placeMarker();
      }
      return events;
    }

    // Plain drive jobs.
    if (clockExpired(dt)) {
      events.failed = true;
      missions.timer = 0;
      missions.timeLeft = job.time || 0;
      return events;
    }
    if (within(job.target, job.radius)) finishJob(events);
    return events;
  }

  missions.current = currentJob;
  missions.startMission = startMission;
  missions.restartCurrent = restartCurrent;
  missions.objectiveText = objectiveText;
  missions.listText = listText;
  missions.sideJobsText = sideJobsText;
  missions.update = update;
  missions.snapPhoto = snapPhoto;
  missions.armSmugglerDelivery = () => {
    const job = currentJob();
    if (!job || job.kind !== 'smuggler') return;
    missions.smugglerStage = 1;
    showBlockers();
    placeMarker();
  };
  missions.setLighthouseHook = (fn) => { lighthouseHook = fn; };
  missions.setTurfHook = (fn) => { turfHook = fn; };

  placeMarker();
  return missions;
}
