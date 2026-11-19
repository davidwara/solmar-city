// Street races: four checkpoint routes around Solmar City, run from the
// chequered flag at the Solmar Garage. Mara pulls up in a car, presses T
// at the flag, and gets a 3-2-1-GO countdown. Each route is a chain of
// glowing gates on the avenues — drive through them in order and the
// clock stops at the finish. Win the route and the prize lands in her
// wallet; beat her own best time and the new record is saved. The gates
// are torus rings on striped posts so they read from a block away, and
// the next gate always shows on the minimap. Racing also bolts a spoiler
// onto her car the first time she lines up — the city's way of knowing
// she means it.
import * as THREE from 'three';
import { addSpoiler } from './vehicles.js';
import { clampAngle, formatMoney } from './utils.js';

// Three routes: a downtown sprint, a beachfront dash, and a long loop out
// across the causeway to the second island and back.
export const RACE_ROUTES = [
  {
    name: 'Harbour Sprint',
    prize: 300,
    gates: [{ x: 124, z: 186 }, { x: 124, z: -62 }, { x: 0, z: -62 }, { x: 0, z: 124 }, { x: 124, z: 124 }, { x: 124, z: 186 }],
  },
  {
    name: 'Beachfront Dash',
    prize: 500,
    gates: [{ x: 124, z: 186 }, { x: -124, z: 186 }, { x: -124, z: -124 }, { x: 62, z: -124 }, { x: 62, z: 186 }, { x: 124, z: 186 }],
  },
  {
    name: 'Island Loop',
    prize: 800,
    gates: [{ x: 124, z: 186 }, { x: 40, z: 186 }, { x: 40, z: 320 }, { x: 120, z: 380 },
      { x: -20, z: 380 }, { x: 40, z: 320 }, { x: 40, z: 186 }, { x: 124, z: 186 }],
  },
  // Phase 7: the Downtown Loop — a tight figure round the towers, $400.
  {
    name: 'Downtown Loop',
    prize: 400,
    gates: [{ x: 124, z: 186 }, { x: 124, z: -124 }, { x: -62, z: -124 }, { x: -62, z: 62 }, { x: 62, z: 62 }, { x: 124, z: 186 }],
  },
];

export const RACE_START = { x: 124, z: 200 }; // the flag at the garage
const GATE_RADIUS = 7;
const COUNTDOWN = 3.2;

function formatRaceTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export function createRaces(scene) {
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const nextMat = new THREE.MeshBasicMaterial({ color: 0x7dff8a });
  const doneMat = new THREE.MeshBasicMaterial({ color: 0x3d7bff });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });

  // The start flag: a chequered pole at the garage forecourt.
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), postMat);
  pole.position.y = 3.5;
  flag.add(pole);
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = 64;
  flagCanvas.height = 32;
  const fctx = flagCanvas.getContext('2d');
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      fctx.fillStyle = (i + j) % 2 === 0 ? '#111111' : '#ffffff';
      fctx.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  const flagTex = new THREE.CanvasTexture(flagCanvas);
  const flagCloth = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.6),
    new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }),
  );
  flagCloth.position.set(1.7, 6.2, 0);
  flag.add(flagCloth);
  flag.position.set(RACE_START.x, 0, RACE_START.z);
  scene.add(flag);

  // One ring mesh per gate, shared across routes: gates are repositioned
  // and recoloured when a race starts, so the city never holds 21 rings.
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.45, 8, 24), gateMat);
    ring.visible = false;
    scene.add(ring);
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5, 6), postMat);
    postL.visible = false;
    scene.add(postL);
    const postR = postL.clone();
    postR.visible = false;
    scene.add(postR);
    rings.push({ ring, postL, postR });
  }

  const races = {
    active: false,
    routeIndex: -1,
    route: null,
    gateIndex: 0,
    time: 0,
    countdown: 0,
    countdownShown: 0,
    best: {}, // route name -> seconds
    wins: 0,
    racesRun: 0,
    lastResult: '',
    spoilerOn: false,
  };

  /** Hide every gate ring (race over or abandoned). */
  function hideRings() {
    rings.forEach((g) => { g.ring.visible = false; g.postL.visible = false; g.postR.visible = false; });
  }

  /** True when the car sits at the start flag (any route can begin). */
  function nearStart(pos) {
    return Math.hypot(pos.x - RACE_START.x, pos.z - RACE_START.z) < 12;
  }

  /** Line up on a route (0, 1 or 2) and start the countdown. */
  function start(routeIndex, car) {
    if (races.active) return false;
    const route = RACE_ROUTES[routeIndex];
    if (!route) return false;
    races.active = true;
    races.routeIndex = routeIndex;
    races.route = route;
    races.gateIndex = 0;
    races.time = 0;
    races.countdown = COUNTDOWN;
    races.countdownShown = 4;
    races.lastResult = `${route.name} — get ready…`;
    // First race in a car bolts the spoiler on for good.
    if (car && car.group && !races.spoilerOn) {
      addSpoiler(car.group);
      races.spoilerOn = true;
    }
    layoutGates();
    return true;
  }

  /** Move the ring meshes onto this route's gates; next gate glows green. */
  function layoutGates() {
    const gates = races.route ? races.route.gates : [];
    rings.forEach((g, i) => {
      const gate = gates[i];
      const on = races.active && Boolean(gate);
      g.ring.visible = on;
      g.postL.visible = on;
      g.postR.visible = on;
      if (!on) return;
      g.ring.position.set(gate.x, 3.4, gate.z);
      g.ring.rotation.y = clampAngle(Math.atan2(gate.x - RACE_START.x, gate.z - RACE_START.z));
      g.postL.position.set(gate.x - 4.5, 2.5, gate.z);
      g.postR.position.set(gate.x + 4.5, 2.5, gate.z);
      const isNext = i === races.gateIndex;
      const isDone = i < races.gateIndex;
      g.ring.material = isNext ? nextMat : isDone ? doneMat : gateMat;
    });
  }

  /**
   * Advance the race. Returns an event: { finished, won, prize, best }
   * when the last gate is crossed, or { countdown } while counting down.
   */
  function update(dt, carPos, inCar) {
    if (!races.active) return null;
    if (!inCar || !carPos) {
      // Mara left the car mid-race — the run is void.
      races.active = false;
      races.lastResult = 'Race abandoned — you left the car.';
      hideRings();
      return { abandoned: true };
    }
    if (races.countdown > 0) {
      races.countdown -= dt;
      const shown = Math.ceil(Math.max(0, races.countdown));
      if (shown !== races.countdownShown) {
        races.countdownShown = shown;
        races.lastResult = shown > 0 ? String(shown) : 'GO!';
        return { countdown: races.lastResult };
      }
      return null;
    }
    races.time += dt;
    const gate = races.route.gates[races.gateIndex];
    const d = Math.hypot(carPos.x - gate.x, carPos.z - gate.z);
    if (d < GATE_RADIUS) {
      races.gateIndex += 1;
      layoutGates();
      if (races.gateIndex >= races.route.gates.length) {
        const t = races.time;
        const prevBest = races.best[races.route.name];
        const isBest = prevBest === undefined || t < prevBest;
        if (isBest) races.best[races.route.name] = t;
        races.wins += 1;
        races.racesRun += 1;
        races.active = false;
        races.lastResult = `${races.route.name} — ${formatRaceTime(t)}${isBest ? ' · NEW BEST!' : ''} · +${formatMoney(races.route.prize)}`;
        hideRings();
        return { finished: true, won: true, prize: races.route.prize, best: isBest, time: t };
      }
      return { gate: races.gateIndex };
    }
    return null;
  }

  /** Next gate for the minimap (null when no race is running). */
  function nextGate() {
    if (!races.active || !races.route) return null;
    return races.route.gates[races.gateIndex] || null;
  }

  function statusText() {
    if (races.active && races.route) {
      if (races.countdown > 0) return `Race: ${races.countdownShown > 0 ? races.countdownShown : 'GO!'}`;
      return `Race ${races.route.name} — gate ${races.gateIndex}/${races.route.gates.length} · ${formatRaceTime(races.time)}`;
    }
    if (races.lastResult) return races.lastResult;
    return '';
  }

  function promptText() {
    return 'T — race: Harbour Sprint $300 · Beachfront Dash $500 · Island Loop $800 · Downtown Loop $400';
  }

  /** Minimap markers: start flag, plus the next gate while racing. */
  function markers() {
    const out = [{ x: RACE_START.x, z: RACE_START.z, color: '#ffffff', shape: 'flag', r: 5 }];
    const gate = nextGate();
    if (gate) out.push({ x: gate.x, z: gate.z, color: '#7dff8a', shape: 'diamond', r: 6 });
    return out;
  }

  function saveData() {
    return { best: { ...races.best }, wins: races.wins, racesRun: races.racesRun, spoilerOn: races.spoilerOn };
  }

  function restore(data) {
    if (!data) return;
    if (data.best && typeof data.best === 'object') races.best = { ...data.best };
    if (typeof data.wins === 'number') races.wins = data.wins;
    if (typeof data.racesRun === 'number') races.racesRun = data.racesRun;
    if (data.spoilerOn === true) races.spoilerOn = true;
  }

  Object.assign(races, { nearStart, start, update, nextGate, statusText, promptText, markers, saveData, restore, formatTime: formatRaceTime });
  return races;
}
