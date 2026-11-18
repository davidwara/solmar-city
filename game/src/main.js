// Solmar City — boot, game loop and state machine.
// States: menu (start screen) -> playing -> paused. ?shot=<pose>&seed=N
// stages a screenshot pose instead of the menu and marks window.__shotReady
// once the scene has settled, so headless Chrome can capture it.
// Phase 2: the city is alive — traffic, pedestrians, police/wanted,
// three story missions, melee combat, procedural audio and saves.
import * as THREE from 'three';
import { buildCity, setTimeOfDay, CITY } from './city.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnParkedCars, updateCar, nearestCar } from './vehicles.js';
import { spawnTraffic, trafficCrash } from './traffic.js';
import { spawnPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame, hasSave, clearSave } from './save.js';
import { createHud, showScreen } from './hud.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const city = buildCity(scene, seed);
const player = createPlayer(scene);
const cars = spawnParkedCars(scene, seed);
const traffic = spawnTraffic(scene, seed, 10);
const peds = spawnPedestrians(scene, seed, 26);
const police = createPolice(scene, seed);
const missions = createMissions(scene);
const combat = createCombat();
const audio = createAudio();
const hud = createHud();

// --- game state ------------------------------------------------------------
const savedGame = loadSave();
const state = {
  mode: 'menu', // menu | playing | paused
  health: 100,
  money: 1250,
  wanted: 0,
  bestWanted: 0,
  objective: 'Meet Rico at the marina — drive south to the pier',
  objectivePos: missions.markerPos,
  inCar: false,
  car: null,
  nearCar: null,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 9,
  cameraMode: 'chase', // chase | fixed
  fixedCam: null,
  saveTimer: 0,
};
const crashCooldown = { value: 0 };

const input = { forward: false, back: false, left: false, right: false, run: false, jump: false };

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
};

function persistSave() {
  if (isShot) return; // screenshot runs never write a save
  saveGame({
    money: state.money,
    missionsCompleted: missions.completed,
    bestWanted: state.bestWanted,
    health: state.health,
  });
}

function toast(text) {
  hud.showToast(text);
}

function startGame(useSave) {
  audio.unlock();
  if (useSave && savedGame) {
    state.money = savedGame.money;
    state.health = savedGame.health;
    state.bestWanted = savedGame.bestWanted;
    missions.startMission(Math.min(savedGame.missionsCompleted, 2));
    toast(`Welcome back, Mara — ${savedGame.missionsCompleted}/3 jobs done.`);
  } else {
    state.money = 1250;
    state.health = 100;
    state.bestWanted = 0;
    missions.startMission(0);
    if (!isShot) clearSave();
  }
  state.mode = 'playing';
  showScreen(null);
}

function handleBusted() {
  police.setWanted(0, player.pos);
  state.money = Math.max(0, state.money - 150);
  if (state.car) exitCar(true);
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  state.health = Math.max(state.health, 60);
  toast('BUSTED! $150 fine — the law lets you walk. This time.');
  audio.thud();
  persistSave();
}

function handleWasted() {
  police.setWanted(0, player.pos);
  state.money = Math.max(0, state.money - 200);
  if (state.car) exitCar(true);
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  state.health = 100;
  toast('WASTED! The crew patched you up — $200.');
  audio.thud();
  persistSave();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = true;
  if (e.code === 'KeyE' && !e.repeat && state.mode === 'playing') toggleCar();
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause();
  if (e.code === 'Enter' && state.mode === 'menu') startGame(false);
  if (e.code === 'KeyF' && !e.repeat && state.mode === 'playing' && !state.inCar) {
    const hit = combat.tryPunch(player, peds);
    if (hit) {
      police.addHeat(1, player.pos);
      audio.thud();
      toast('You laid out a pedestrian — the law noticed! +1★');
    }
  }
  if (e.code === 'KeyM' && !e.repeat) {
    audio.unlock();
    const muted = audio.toggleMute();
    const tag = document.getElementById('mute-tag');
    if (tag) tag.textContent = muted ? 'MUTED (M)' : '';
    toast(muted ? 'Sound off' : 'Sound on');
  }
  if (e.code === 'KeyJ' && !e.repeat && state.mode === 'playing') {
    hud.toggleMissionList(missions.listText());
  }
  if (e.code === 'KeyR' && !e.repeat && state.mode === 'playing') {
    missions.restartCurrent();
    toast('Job restarted — back to the marker.');
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
});

// Mouse orbit: drag to look around. Wheel zooms the chase camera.
let dragging = false;
let lastX = 0;
let lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging || state.cameraMode === 'fixed') return;
  state.cameraYaw -= (e.clientX - lastX) * 0.005;
  state.cameraPitch = Math.max(0.05, Math.min(1.1, state.cameraPitch + (e.clientY - lastY) * 0.004));
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('wheel', (e) => {
  state.cameraDist = Math.max(5, Math.min(16, state.cameraDist + Math.sign(e.deltaY)));
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    persistSave();
    showScreen('pause-screen');
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    showScreen(null);
  }
}

function toggleCar() {
  if (state.inCar) {
    exitCar(false);
    return;
  }
  const car = nearestCar(cars, player.pos, 4.5);
  if (car) enterCar(car);
}

function enterCar(car) {
  // Stealing a parked car is a crime: first take adds a wanted star.
  if (!car.stolen && !isShot) {
    car.stolen = true;
    police.addHeat(1, player.pos);
    toast('Car stolen — the law noticed! +1★');
  }
  state.inCar = true;
  state.car = car;
  car.driven = true;
  player.group.visible = false;
}

function exitCar(silent) {
  if (!state.car) return;
  const car = state.car;
  car.driven = false;
  car.speed = 0;
  player.pos.set(car.pos.x - 3, 0, car.pos.z);
  player.group.position.copy(player.pos);
  player.group.visible = true;
  state.inCar = false;
  state.car = null;
  if (!silent) state.cameraYaw = car.heading + Math.PI;
}

// --- camera ----------------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (state.cameraMode === 'fixed' && state.fixedCam) {
    camera.position.lerp(state.fixedCam.pos, Math.min(1, dt * 4));
    camera.lookAt(state.fixedCam.look);
    return;
  }
  const focus = state.inCar ? state.car.pos : player.pos;
  const focusY = state.inCar ? 1.6 : 1.7;
  // Ease the orbit yaw toward the car's heading while driving.
  if (state.inCar) {
    const behind = state.car.heading + Math.PI;
    let d = behind - state.cameraYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    state.cameraYaw += d * Math.min(1, dt * 1.2);
  }
  const dist = state.cameraDist;
  const cx = focus.x + Math.sin(state.cameraYaw) * Math.cos(state.cameraPitch) * dist;
  const cz = focus.z + Math.cos(state.cameraYaw) * Math.cos(state.cameraPitch) * dist;
  const cy = focusY + Math.sin(state.cameraPitch) * dist;
  camTarget.set(cx, cy, cz);
  camera.position.lerp(camTarget, Math.min(1, dt * 8));
  camera.lookAt(focus.x, focusY, focus.z);
}

// --- shot staging ----------------------------------------------------------
let framesRendered = 0;
const isShot = shotName && SHOT_NAMES.includes(shotName);
if (isShot) {
  showScreen(null);
  state.cameraMode = stageShot(shotName, {
    scene,
    city,
    player,
    cars,
    traffic,
    peds,
    police,
    missions,
    setCamera: (x, y, z, lx, ly, lz) => {
      state.fixedCam = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) };
      camera.position.copy(state.fixedCam.pos);
      camera.lookAt(state.fixedCam.look);
    },
    setState: (mode) => {
      state.mode = mode;
      if (mode === 'menu') showScreen('start-screen');
    },
    enterCar,
    exitCar,
  });
  if (shotName === 'menu') {
    // Menu pose keeps the start screen visible over a sunset vista.
    state.cameraMode = 'fixed';
  } else if (state.cameraMode === 'chase') {
    state.cameraMode = 'chase';
  }
} else {
  setTimeOfDay(scene, city, 0);
  showScreen('start-screen');
  // Slow menu orbit behind the start screen.
  state.cameraMode = 'fixed';
  state.fixedCam = { pos: new THREE.Vector3(60, 34, 90), look: new THREE.Vector3(0, 14, 0) };
  // Offer Continue when a save exists.
  if (hasSave() && savedGame) {
    const btn = document.getElementById('continue-button');
    const note = document.getElementById('save-note');
    if (btn) {
      btn.style.display = 'inline-block';
      btn.addEventListener('click', () => startGame(true));
    }
    if (note) {
      note.style.display = 'block';
      note.textContent = `Saved progress: $${savedGame.money.toLocaleString('en-US')} · ${savedGame.missionsCompleted}/3 jobs done.`;
    }
  }
}

document.getElementById('start-button').addEventListener('click', () => startGame(false));
document.getElementById('resume-button').addEventListener('click', togglePause);
document.getElementById('restart-button').addEventListener('click', () => {
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  if (state.car) exitCar(true);
  state.health = 100;
  police.setWanted(0, player.pos);
  missions.restartCurrent();
  state.mode = 'playing';
  showScreen(null);
});

// Debug handle for headless probes (CDP): window.__solmar.
window.__solmar = { state, missions, police, traffic, peds };

// --- main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  try {
    if (state.mode === 'playing') {
      // Screenshot poses hold the throttle so the drive shot stays in motion.
      if (isShot && shotName === 'drive') input.forward = true;
      if (isShot && shotName === 'chase') input.forward = true;
      if (state.inCar && state.car) {
        updateCar(state.car, dt, input, city.colliders, CITY.bound);
      } else {
        updatePlayer(player, dt, input, state.cameraYaw, city.colliders, CITY.bound);
      }
      state.nearCar = state.inCar ? null : nearestCar(cars, player.pos, 4.5);

      // --- the living city -------------------------------------------------
      const focusPos = state.inCar ? state.car.pos : player.pos;
      traffic.update(dt, {
        playerCar: state.car,
        playerPos: focusPos,
        playerInCar: state.inCar,
        parkedCars: cars,
      });
      peds.update(dt, {
        playerPos,
        playerCar: state.car,
        playerInCar: state.inCar,
        trafficCars: traffic.cars,
        policeCars: police.cars,
      });
      combat.update(dt);
      if (crashCooldown.value > 0) crashCooldown.value -= dt;

      // Mara's car vs pedestrians: a hit puts the ped down and adds heat.
      if (state.inCar && state.car) {
        const hit = combat.carHits(state.car, peds);
        if (hit.length > 0) {
          police.addHeat(1, focusPos);
          audio.thud();
          toast('You hit a pedestrian! +1★');
        }
        if (trafficCrash(traffic, state.car, crashCooldown)) {
          police.addHeat(1, focusPos);
          audio.thud();
          toast('Crash! The law noticed. +1★');
        }
      }

      // --- police + wanted -------------------------------------------------
      const policeEvents = police.update(dt, player, state.car, state.inCar, city.colliders);
      state.wanted = police.wanted;
      state.bestWanted = Math.max(state.bestWanted, police.wanted);
      if (policeEvents.rammed) {
        state.health -= 3;
        audio.thud();
      }
      if (policeEvents.busted) handleBusted();
      if (state.wanted === 0 && state.health < 100) state.health = Math.min(100, state.health + 2 * dt);
      if (state.health <= 0) handleWasted();

      // --- missions ----------------------------------------------------------
      const missionEvents = missions.update(dt, focusPos);
      if (missionEvents.completed) {
        state.money += missionEvents.reward;
        audio.jingle();
        toast(`JOB DONE — ${missionEvents.completed.title}: +$${missionEvents.reward}`);
        if (missionEvents.heat > 0) {
          police.addHeat(missionEvents.heat, focusPos);
          toast('The law is on you — deliver it anyway!');
        }
        if (!missions.current()) toast('ALL JOBS DONE — Solmar City is yours!');
        persistSave();
      }
      if (missionEvents.failed) {
        audio.thud();
        toast('Out of time — the job restarts. Drive faster next time.');
      }
      state.objective = missions.objectiveText(focusPos);
      state.objectivePos = missions.current() ? missions.markerPos : null;

      // --- audio + autosave --------------------------------------------------
      audio.update(dt, {
        speed: state.inCar ? state.car.speed : 0,
        inCar: state.inCar,
        moving: state.inCar ? Math.abs(state.car.speed) > 0.5 : player.moving,
        running: player.running,
        wanted: state.wanted,
      });
      state.saveTimer += dt;
      if (state.saveTimer > 10) {
        state.saveTimer = 0;
        persistSave();
      }
    }
  } catch (err) {
    window.__shotError = String(err && err.message ? err.message : err);
  }
  updateCamera(dt);
  hud.update({
    health: state.health,
    money: state.money,
    wanted: state.wanted,
    objective: state.objective,
    objectivePos: state.objectivePos,
    inCar: state.inCar,
    speed: state.inCar ? state.car.speed : 0,
    playerPos: state.inCar ? state.car.pos : player.pos,
    heading: state.inCar ? state.car.heading : player.heading,
    cars,
    nearCar: state.nearCar,
    traffic: traffic.cars,
    police: police.cars,
    peds: peds.peds,
  });
  renderer.render(scene, camera);
  framesRendered++;
  if (isShot && framesRendered === 40) {
    window.__shotReady = true;
  }
}
frame();
