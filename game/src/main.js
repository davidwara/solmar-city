// Solmar City — boot, game loop and state machine.
// States: menu (start screen) -> playing -> paused. ?shot=<pose>&seed=N
// stages a screenshot pose instead of the menu and marks window.__shotReady
// once the scene has settled, so headless Chrome can capture it.
import * as THREE from 'three';
import { buildCity, setTimeOfDay, CITY } from './city.js';
import { createPlayer, updatePlayer } from './player.js';
import { spawnParkedCars, updateCar, nearestCar } from './vehicles.js';
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
const hud = createHud();

// --- game state ------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused
  health: 100,
  money: 1250,
  wanted: 0,
  objective: 'Meet Rico at the marina — drive south to the pier',
  objectivePos: new THREE.Vector3(-150, 0, 225),
  inCar: false,
  car: null,
  nearCar: null,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 9,
  cameraMode: 'chase', // chase | fixed
  fixedCam: null,
};

const input = { forward: false, back: false, left: false, right: false, run: false, jump: false };

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = true;
  if (e.code === 'KeyE' && !e.repeat && state.mode === 'playing') toggleCar();
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause();
  if (e.code === 'Enter' && state.mode === 'menu') startGame();
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

function startGame() {
  state.mode = 'playing';
  showScreen(null);
}

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
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
}

document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('resume-button').addEventListener('click', togglePause);
document.getElementById('restart-button').addEventListener('click', () => {
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  if (state.car) exitCar(true);
  state.health = 100;
  state.mode = 'playing';
  showScreen(null);
});

// --- main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'playing') {
    // Screenshot poses hold the throttle so the drive shot stays in motion.
    if (isShot && shotName === 'drive') input.forward = true;
    if (state.inCar && state.car) {
      updateCar(state.car, dt, input, city.colliders, CITY.bound);
    } else {
      updatePlayer(player, dt, input, state.cameraYaw, city.colliders, CITY.bound);
    }
    state.nearCar = state.inCar ? null : nearestCar(cars, player.pos, 4.5);
    // Gentle menu-free drift for the parked cars' wheels is not needed; the
    // city stays still while Mara moves through it.
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
  });
  renderer.render(scene, camera);
  framesRendered++;
  if (isShot && framesRendered === 40) {
    window.__shotReady = true;
  }
}
frame();
