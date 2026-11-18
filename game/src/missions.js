// Missions: Mara's nine story jobs for the Solmar underworld.
// Jobs 1-3 are drive-to-the-marker runs. Job 4 is a timed night run with
// the law already on her, job 5 is a bodyguard walk (keep the client close
// and alive), job 6 is a taxi shift: three fares against the clock.
// Phase 4 adds three more: job 7 is a two-stage smuggler's run (pick up
// at the marina, then deliver downtown past police roadblocks), job 8 is
// a getaway (survive three stars for 100 seconds), job 9 is a shutterbug
// tour (photograph three scenic spots with the C key). Finishing all
// nine opens free roam with the whole city as Mara's playground. The
// marker is a floating golden beacon + a light pillar, and the same
// position feeds the HUD objective line and the minimap diamond.
import * as THREE from 'three';
import { CITY } from './city.js';
import { clamp } from './utils.js';

export const MISSIONS = [
  {
    id: 'first-job',
    title: 'First Job',
    kind: 'drive',
    briefing: 'Rico left a package at the marina pier. Go get it.',
    target: new THREE.Vector3(-150, 0, 225),
    radius: 9,
    reward: 250,
    timeLimit: 0,
  },
  {
    id: 'hot-delivery',
    title: 'Hot Delivery',
    kind: 'drive',
    briefing: 'The package is marked — the law is on you. Deliver it to the downtown drop, fast.',
    target: new THREE.Vector3(62, 0, -62),
    radius: 9,
    reward: 500,
    timeLimit: 0,
    heatOnStart: 2,
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    kind: 'drive',
    briefing: 'One last run: reach the beachfront safehouse before the clock runs out.',
    target: new THREE.Vector3(124, 0, 200),
    radius: 9,
    reward: 750,
    timeLimit: 90,
  },
  {
    id: 'night-run',
    title: 'Night Run',
    kind: 'drive',
    briefing: 'A midnight pickup on the north edge — the streets are dark and the law is out. 2 minutes.',
    target: new THREE.Vector3(-186, 0, 124),
    radius: 9,
    reward: 900,
    timeLimit: 120,
    heatOnStart: 1,
    night: true,
  },
  {
    id: 'bodyguard',
    title: 'Bodyguard',
    kind: 'bodyguard',
    briefing: 'Walk Rico\u2019s client across downtown. Stay close — he only moves when you are near.',
    target: new THREE.Vector3(62, 0, 62),
    vipStart: new THREE.Vector3(-62, 0, 62),
    radius: 6,
    reward: 1000,
    timeLimit: 150,
  },
  {
    id: 'taxi-king',
    title: 'Taxi King',
    kind: 'taxi',
    briefing: 'Three fares, one shift. Pick up each rider before their patience runs out.',
    target: new THREE.Vector3(0, 0, 124),
    fares: [
      new THREE.Vector3(0, 0, 124),
      new THREE.Vector3(-124, 0, -62),
      new THREE.Vector3(124, 0, 200),
    ],
    fareTime: 60,
    fareReward: 150,
    radius: 9,
    reward: 400,
    timeLimit: 0,
  },
  {
    id: 'smugglers-run',
    title: "Smuggler's Run",
    kind: 'smuggler',
    briefing: 'Grab the crate at the marina pier, then run it to the east docks — roadblocks go up the moment you lift it.',
    pickup: new THREE.Vector3(-150, 0, 225),
    target: new THREE.Vector3(186, 0, -62),
    radius: 9,
    reward: 1200,
    timeLimit: 150,
    heatOnPickup: 1,
  },
  {
    id: 'getaway-driver',
    title: 'Getaway Driver',
    kind: 'getaway',
    briefing: 'Three stars, the whole city behind you — stay free for 100 seconds and the heat dies.',
    target: new THREE.Vector3(0, 0, 0),
    radius: 0,
    reward: 1500,
    timeLimit: 100,
    heatOnStart: 3,
  },
  {
    id: 'shutterbug',
    title: 'Shutterbug',
    kind: 'shutterbug',
    briefing: 'Three scenic spots — beach, downtown, marina. Get close and snap each one with C. $300 a photo, $500 bonus for the set.',
    spots: [
      new THREE.Vector3(0, 0, 215),
      new THREE.Vector3(62, 0, -62),
      new THREE.Vector3(-150, 0, 225),
    ],
    photoReward: 300,
    radius: 15,
    reward: 500,
    timeLimit: 0,
  },
];

/** Create the mission system. Returns the tracker + marker + update. */
export function createMissions(scene) {
  // Marker: a floating octahedron over a light pillar, visible from afar.
  const marker = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.1),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  gem.position.y = 6;
  marker.add(gem);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.2, 26, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  beam.position.y = 13;
  marker.add(beam);
  scene.add(marker);

  // The Bodyguard client: a gold-jacketed figure who walks only while Mara
  // stays close. Hidden until job 5 starts.
  const vip = new THREE.Group();
  const vipJacket = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const vipTorso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), vipJacket);
  vipTorso.position.y = 1.15;
  vip.add(vipTorso);
  const vipHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshLambertMaterial({ color: 0x8a5a3b }));
  vipHead.position.y = 1.85;
  vip.add(vipHead);
  const vipLegs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), new THREE.MeshLambertMaterial({ color: 0x222831 }));
  vipLegs.position.y = 0.38;
  vip.add(vipLegs);
  vip.visible = false;
  scene.add(vip);

  // Police roadblocks for the Smuggler's Run: striped barriers thrown
  // across the route the moment Mara lifts the crate. Hidden until then.
  const roadblocks = [];
  const blockMat = new THREE.MeshLambertMaterial({ color: 0xff7a2a });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  for (const [bx, bz, rot] of [[-62, 186, 0], [62, 124, Math.PI / 2], [124, 0, 0]]) {
    const block = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 0.6), blockMat);
    bar.position.y = 0.9;
    block.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.62), stripeMat);
    stripe.position.y = 1.05;
    block.add(stripe);
    for (const lx of [-3, 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.5), stripeMat);
      leg.position.set(lx, 0.45, 0);
      block.add(leg);
    }
    block.position.set(bx, 0, bz);
    block.rotation.y = rot;
    block.visible = false;
    scene.add(block);
    roadblocks.push(block);
  }
  function showRoadblocks() {
    for (const b of roadblocks) b.visible = true;
  }
  function hideRoadblocks() {
    for (const b of roadblocks) b.visible = false;
  }

  const missions = {
    index: 0, // current job (0..8); 9 = all done
    completed: 0,
    timer: 0, // counts down on timed jobs
    timeLeft: 0,
    markerPos: MISSIONS[0].target.clone(),
    started: false,
    fareIndex: 0, // Taxi King: which fare is being picked up (0..2)
    fareTimeLeft: 0,
    vipPos: new THREE.Vector3(-62, 0, 62),
    vipWalking: false,
    smugglerStage: 0, // Smuggler's Run: 0 = fetch the crate, 1 = deliver it
    photoIndex: 0, // Shutterbug: which scenic spot is next (0..2)
    photosTaken: 0, // Shutterbug: photos snapped this job
  };

  function current() {
    return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
  }

  function placeMarker() {
    const m = current();
    if (!m) {
      marker.visible = false;
      vip.visible = false;
      return;
    }
    if (m.kind === 'bodyguard') {
      // The beacon rides over the client, so the minimap follows him.
      missions.markerPos.copy(missions.vipPos);
      marker.position.copy(missions.vipPos);
      marker.visible = true;
      vip.visible = true;
      vip.position.copy(missions.vipPos);
    } else if (m.kind === 'taxi') {
      const fare = m.fares[Math.min(missions.fareIndex, m.fares.length - 1)];
      missions.markerPos.copy(fare);
      marker.position.copy(fare);
      marker.visible = true;
      vip.visible = false;
    } else if (m.kind === 'smuggler') {
      // Stage 0 points at the marina pickup, stage 1 at the docks drop.
      const spot = missions.smugglerStage === 0 ? m.pickup : m.target;
      missions.markerPos.copy(spot);
      marker.position.copy(spot);
      marker.visible = true;
      vip.visible = false;
    } else if (m.kind === 'getaway') {
      // No destination — the job is survival, so the beacon hides.
      marker.visible = false;
      vip.visible = false;
    } else if (m.kind === 'shutterbug') {
      const spot = m.spots[Math.min(missions.photoIndex, m.spots.length - 1)];
      missions.markerPos.copy(spot);
      marker.position.copy(spot);
      marker.visible = true;
      vip.visible = false;
    } else {
      missions.markerPos.copy(m.target);
      marker.position.copy(m.target);
      marker.visible = true;
      vip.visible = false;
    }
  }

  /** Reset the moving parts of the current job (VIP, fares, timers). */
  function resetJobState() {
    const m = current();
    if (!m) return;
    if (m.kind === 'bodyguard' && m.vipStart) {
      missions.vipPos.copy(m.vipStart);
      missions.vipWalking = false;
    }
    if (m.kind === 'taxi') {
      missions.fareIndex = 0;
      missions.fareTimeLeft = m.fareTime;
    }
    if (m.kind === 'smuggler') {
      missions.smugglerStage = 0;
      hideRoadblocks();
    }
    if (m.kind === 'shutterbug') {
      missions.photoIndex = 0;
      missions.photosTaken = 0;
    }
    if (m.kind === 'getaway') {
      missions.timeLeft = m.timeLimit;
    }
    missions.timeLeft = m.timeLimit;
  }

  /** Begin job i (0-based). Returns the job, or null when all are done. */
  function startMission(i) {
    missions.index = clamp(i, 0, MISSIONS.length);
    missions.completed = i;
    const m = current();
    missions.timeLeft = m ? m.timeLimit : 0;
    missions.timer = 0;
    missions.started = true;
    resetJobState();
    placeMarker();
    return m;
  }

  /** Restart the current job (R key): timer and marker reset. */
  function restartCurrent() {
    const m = current();
    if (!m) return null;
    missions.timeLeft = m.timeLimit;
    resetJobState();
    placeMarker();
    return m;
  }

  /** Objective line for the HUD, with live distance to the marker. */
  function objectiveText(playerPos) {
    const m = current();
    if (!m) return 'All jobs done — Solmar City is yours. Free roam!';
    const tag = `JOB ${missions.index + 1}/9 — ${m.title}: `;
    if (m.kind === 'bodyguard') {
      const d = Math.round(Math.hypot(m.target.x - missions.vipPos.x, m.target.z - missions.vipPos.z));
      const near = Math.hypot(missions.vipPos.x - playerPos.x, missions.vipPos.z - playerPos.z) < 18;
      const time = ` — ${Math.max(0, Math.ceil(missions.timeLeft))}s left`;
      return tag + `${m.briefing} Client is ${d}m from safety${near ? '' : ' — GET CLOSER, he stopped!'}${time}`;
    }
    if (m.kind === 'taxi') {
      const fare = m.fares[Math.min(missions.fareIndex, m.fares.length - 1)];
      const d = Math.round(Math.hypot(fare.x - playerPos.x, fare.z - playerPos.z));
      return tag + `Fare ${missions.fareIndex + 1}/3 — pick up the rider (${d}m) — ${Math.max(0, Math.ceil(missions.fareTimeLeft))}s left`;
    }
    if (m.kind === 'smuggler') {
      const spot = missions.smugglerStage === 0 ? m.pickup : m.target;
      const d = Math.round(Math.hypot(spot.x - playerPos.x, spot.z - playerPos.z));
      const time = ` — ${Math.max(0, Math.ceil(missions.timeLeft))}s left`;
      return missions.smugglerStage === 0
        ? tag + `Pick up the crate at the marina pier (${d}m)${time}`
        : tag + `Crate aboard — run it to the east docks (${d}m), roadblocks ahead!${time}`;
    }
    if (m.kind === 'getaway') {
      return tag + `Stay free — ${Math.max(0, Math.ceil(missions.timeLeft))}s until the heat dies. Lose the patrol cars!`;
    }
    if (m.kind === 'shutterbug') {
      const spot = m.spots[Math.min(missions.photoIndex, m.spots.length - 1)];
      const d = Math.round(Math.hypot(spot.x - playerPos.x, spot.z - playerPos.z));
      const names = ['the beachfront', 'downtown plaza', 'the marina'];
      return tag + `Photo ${missions.photoIndex + 1}/3 — ${names[Math.min(missions.photoIndex, 2)]} (${d}m) — press C to snap it`;
    }
    const d = Math.round(Math.hypot(m.target.x - playerPos.x, m.target.z - playerPos.z));
    const time = m.timeLimit > 0 ? ` — ${Math.max(0, Math.ceil(missions.timeLeft))}s left` : '';
    return tag + `${m.briefing} (${d}m)${time}`;
  }

  /** Short list of all jobs + status, for the J (jobs) panel. */
  function listText() {
    return MISSIONS.map((m, i) => {
      const status = i < missions.completed ? 'DONE' : i === missions.index ? 'ACTIVE' : 'LOCKED';
      return `${i + 1}. ${m.title} — $${m.reward} — ${status}`;
    }).join('\n');
  }

  /** Stage the Smuggler's Run mid-delivery (screenshot pose): crate
   *  aboard, roadblocks up, beacon on the docks drop. */
  function armSmugglerDelivery() {
    const m = current();
    if (!m || m.kind !== 'smuggler') return;
    missions.smugglerStage = 1;
    showRoadblocks();
    placeMarker();
  }

  /**
   * Snap a photo (C key) on the Shutterbug job. Returns events:
   * { photoDone, photoReward, tooFar, completed, reward } — a photo
   * pays $300 on the spot; the third completes the job (+$500 bonus).
   */
  function snapPhoto(playerPos) {
    const events = { photoDone: false, photoReward: 0, tooFar: false, completed: null, reward: 0 };
    const m = current();
    if (!m || m.kind !== 'shutterbug') return events;
    const spot = m.spots[Math.min(missions.photoIndex, m.spots.length - 1)];
    const d = Math.hypot(spot.x - playerPos.x, spot.z - playerPos.z);
    if (d > m.radius) {
      events.tooFar = true;
      return events;
    }
    events.photoDone = true;
    events.photoReward = m.photoReward;
    missions.photosTaken += 1;
    missions.photoIndex += 1;
    if (missions.photoIndex >= m.spots.length) return completeJob(events);
    placeMarker();
    return events;
  }

  /**
   * Advance the jobs. Returns events: { completed, reward, failed, heat,
   *   fareDone, fareReward, pickup, photoDone, photoReward } — fareDone
   *   pays per rider on the Taxi King, pickup fires when the smuggler's
   *   crate is lifted (roadblocks go up, heat follows).
   * `failed` fires when a timed job runs out — the job restarts, no cash lost.
   */
  function update(dt, playerPos) {
    const events = { completed: null, reward: 0, failed: false, heat: 0, fareDone: false, fareReward: 0, pickup: false, photoDone: false, photoReward: 0 };
    const m = current();
    if (!m) return events;
    // Marker bob + spin so it reads as a live objective.
    missions.timer += dt;
    gem.position.y = 6 + Math.sin(missions.timer * 2.2) * 0.7;
    gem.rotation.y += dt * 1.5;

    // --- Smuggler's Run: fetch the crate, then deliver past roadblocks. --
    if (m.kind === 'smuggler') {
      if (m.timeLimit > 0) {
        missions.timeLeft -= dt;
        if (missions.timeLeft <= 0) {
          missions.timeLeft = m.timeLimit;
          events.failed = true;
          resetJobState();
          placeMarker();
          return events;
        }
      }
      if (missions.smugglerStage === 0) {
        const d = Math.hypot(m.pickup.x - playerPos.x, m.pickup.z - playerPos.z);
        if (d < m.radius) {
          missions.smugglerStage = 1;
          events.pickup = true;
          events.heat = m.heatOnPickup || 0;
          showRoadblocks();
          placeMarker();
        }
        return events;
      }
      const d = Math.hypot(m.target.x - playerPos.x, m.target.z - playerPos.z);
      if (d < m.radius) return completeJob(events);
      return events;
    }

    // --- Getaway Driver: survive the timer — no destination at all. ------
    if (m.kind === 'getaway') {
      missions.timeLeft -= dt;
      if (missions.timeLeft <= 0) return completeJob(events);
      return events;
    }

    // --- Shutterbug: photos are taken with the C key (see snapPhoto). ----
    if (m.kind === 'shutterbug') {
      return events;
    }

    // --- Bodyguard: the client walks only while Mara stays within 18m. ---
    if (m.kind === 'bodyguard') {
      if (m.timeLimit > 0) {
        missions.timeLeft -= dt;
        if (missions.timeLeft <= 0) {
          missions.timeLeft = m.timeLimit;
          events.failed = true;
          resetJobState();
          placeMarker();
          return events;
        }
      }
      const near = Math.hypot(missions.vipPos.x - playerPos.x, missions.vipPos.z - playerPos.z) < 18;
      missions.vipWalking = near;
      if (near) {
        const dx = m.target.x - missions.vipPos.x;
        const dz = m.target.z - missions.vipPos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const step = Math.min(d, 2.4 * dt);
          missions.vipPos.x += (dx / d) * step;
          missions.vipPos.z += (dz / d) * step;
          vip.position.copy(missions.vipPos);
          vip.rotation.y = Math.atan2(dx, dz);
        }
      }
      marker.position.copy(missions.vipPos);
      missions.markerPos.copy(missions.vipPos);
      const arrived = Math.hypot(m.target.x - missions.vipPos.x, m.target.z - missions.vipPos.z) < m.radius;
      if (arrived) return completeJob(events);
      return events;
    }

    // --- Taxi King: three fares, one timer each, pay per pickup. ---
    if (m.kind === 'taxi') {
      missions.fareTimeLeft -= dt;
      if (missions.fareTimeLeft <= 0) {
        missions.fareIndex = 0;
        missions.fareTimeLeft = m.fareTime;
        events.failed = true;
        placeMarker();
        return events;
      }
      const fare = m.fares[Math.min(missions.fareIndex, m.fares.length - 1)];
      const d = Math.hypot(fare.x - playerPos.x, fare.z - playerPos.z);
      if (d < m.radius) {
        events.fareDone = true;
        events.fareReward = m.fareReward;
        missions.fareIndex += 1;
        if (missions.fareIndex >= m.fares.length) return completeJob(events);
        missions.fareTimeLeft = m.fareTime;
        placeMarker();
      }
      return events;
    }

    // --- Drive jobs: the original reach-the-marker rule. ---
    if (m.timeLimit > 0) {
      missions.timeLeft -= dt;
      if (missions.timeLeft <= 0) {
        missions.timeLeft = m.timeLimit;
        events.failed = true;
        return events;
      }
    }
    const d = Math.hypot(m.target.x - playerPos.x, m.target.z - playerPos.z);
    if (d < m.radius) return completeJob(events);
    return events;
  }

  /** Shared finish: advance the index, pay the reward, arm the next job. */
  function completeJob(events) {
    const m = current();
    hideRoadblocks();
    events.completed = m;
    events.reward = m.reward;
    missions.completed = missions.index + 1;
    missions.index += 1;
    const next = current();
    if (next) {
      missions.timeLeft = next.timeLimit;
      resetJobState();
      if (next.heatOnStart) events.heat = next.heatOnStart;
    }
    placeMarker();
    return events;
  }

  missions.current = current;
  missions.startMission = startMission;
  missions.restartCurrent = restartCurrent;
  missions.objectiveText = objectiveText;
  missions.listText = listText;
  missions.update = update;
  missions.snapPhoto = snapPhoto;
  missions.armSmugglerDelivery = armSmugglerDelivery;
  placeMarker();
  return missions;
}
