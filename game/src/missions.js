// Missions: Mara's six story jobs for the Solmar underworld.
// Jobs 1-3 are drive-to-the-marker runs. Job 4 is a timed night run with
// the law already on her, job 5 is a bodyguard walk (keep the client close
// and alive), job 6 is a taxi shift: three fares against the clock.
// Each job is a drive-to-the-marker objective with a cash reward. Job 2
// starts hot (the law is already on Mara), job 3 is timed. Finishing all
// six opens free roam with the whole city as Mara's playground. The
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

  const missions = {
    index: 0, // current job (0..5); 6 = all done
    completed: 0,
    timer: 0, // counts down on timed jobs
    timeLeft: 0,
    markerPos: MISSIONS[0].target.clone(),
    started: false,
    fareIndex: 0, // Taxi King: which fare is being picked up (0..2)
    fareTimeLeft: 0,
    vipPos: new THREE.Vector3(-62, 0, 62),
    vipWalking: false,
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
    const tag = `JOB ${missions.index + 1}/6 — ${m.title}: `;
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

  /**
   * Advance the jobs. Returns events: { completed, reward, failed, heat,
   *   fareDone, fareReward } — fareDone pays per rider on the Taxi King.
   * `failed` fires when a timed job runs out — the job restarts, no cash lost.
   */
  function update(dt, playerPos) {
    const events = { completed: null, reward: 0, failed: false, heat: 0, fareDone: false, fareReward: 0 };
    const m = current();
    if (!m) return events;
    // Marker bob + spin so it reads as a live objective.
    missions.timer += dt;
    gem.position.y = 6 + Math.sin(missions.timer * 2.2) * 0.7;
    gem.rotation.y += dt * 1.5;

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
  placeMarker();
  return missions;
}
