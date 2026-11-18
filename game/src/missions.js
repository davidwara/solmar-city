// Missions: Mara's three story jobs for the Solmar underworld.
// Each job is a drive-to-the-marker objective with a cash reward. Job 2
// starts hot (the law is already on Mara), job 3 is timed. Finishing all
// three opens free roam with the whole city as Mara's playground. The
// marker is a floating golden beacon + a light pillar, and the same
// position feeds the HUD objective line and the minimap diamond.
import * as THREE from 'three';
import { CITY } from './city.js';
import { clamp } from './utils.js';

export const MISSIONS = [
  {
    id: 'first-job',
    title: 'First Job',
    briefing: 'Rico left a package at the marina pier. Go get it.',
    target: new THREE.Vector3(-150, 0, 225),
    radius: 9,
    reward: 250,
    timeLimit: 0,
  },
  {
    id: 'hot-delivery',
    title: 'Hot Delivery',
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
    briefing: 'One last run: reach the beachfront safehouse before the clock runs out.',
    target: new THREE.Vector3(124, 0, 200),
    radius: 9,
    reward: 750,
    timeLimit: 90,
  },
];

/** Create the mission system. Returns the tracker + marker + update. */
export function createMissions(scene) {
  // Marker: a floating octahedron over a light pillar, visible from afar.
  const marker = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
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

  const missions = {
    index: 0, // current job (0..2); 3 = all done
    completed: 0,
    timer: 0, // counts down on timed jobs
    timeLeft: 0,
    markerPos: MISSIONS[0].target.clone(),
    started: false,
  };

  function current() {
    return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
  }

  function placeMarker() {
    const m = current();
    if (m) {
      missions.markerPos.copy(m.target);
      marker.position.copy(m.target);
      marker.visible = true;
    } else {
      marker.visible = false;
    }
  }

  /** Begin job i (0-based). Returns the job, or null when all are done. */
  function startMission(i) {
    missions.index = clamp(i, 0, MISSIONS.length);
    missions.completed = i;
    const m = current();
    missions.timeLeft = m ? m.timeLimit : 0;
    missions.timer = 0;
    missions.started = true;
    placeMarker();
    return m;
  }

  /** Restart the current job (R key): timer and marker reset. */
  function restartCurrent() {
    const m = current();
    if (!m) return null;
    missions.timeLeft = m.timeLimit;
    placeMarker();
    return m;
  }

  /** Objective line for the HUD, with live distance to the marker. */
  function objectiveText(playerPos) {
    const m = current();
    if (!m) return 'All jobs done — Solmar City is yours. Free roam!';
    const d = Math.round(Math.hypot(m.target.x - playerPos.x, m.target.z - playerPos.z));
    const time = m.timeLimit > 0 ? ` — ${Math.max(0, Math.ceil(missions.timeLeft))}s left` : '';
    return `JOB ${missions.index + 1}/3 — ${m.title}: ${m.briefing} (${d}m)${time}`;
  }

  /** Short list of all jobs + status, for the J (jobs) panel. */
  function listText() {
    return MISSIONS.map((m, i) => {
      const status = i < missions.completed ? 'DONE' : i === missions.index ? 'ACTIVE' : 'LOCKED';
      return `${i + 1}. ${m.title} — $${m.reward} — ${status}`;
    }).join('\n');
  }

  /**
   * Advance the jobs. Returns events: { completed, reward, failed, heat }.
   * `failed` fires when a timed job runs out — the job restarts, no cash lost.
   */
  function update(dt, playerPos) {
    const events = { completed: null, reward: 0, failed: false, heat: 0 };
    const m = current();
    if (!m) return events;
    if (m.timeLimit > 0) {
      missions.timeLeft -= dt;
      if (missions.timeLeft <= 0) {
        missions.timeLeft = m.timeLimit;
        events.failed = true;
        return events;
      }
    }
    // Marker bob + spin so it reads as a live objective.
    missions.timer += dt;
    gem.position.y = 6 + Math.sin(missions.timer * 2.2) * 0.7;
    gem.rotation.y += dt * 1.5;
    const d = Math.hypot(m.target.x - playerPos.x, m.target.z - playerPos.z);
    if (d < m.radius) {
      events.completed = m;
      events.reward = m.reward;
      missions.completed = missions.index + 1;
      missions.index += 1;
      const next = current();
      if (next) {
        missions.timeLeft = next.timeLimit;
        if (next.heatOnStart) events.heat = next.heatOnStart;
      }
      placeMarker();
    }
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
