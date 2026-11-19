// Solmar City — boot, input, camera and the frame loop.
//
// This is the game's front door: it builds every system, owns the shared
// run state, routes keys / mouse / wheel input to the right system, and
// steps the world once per animation frame. The city, cars, missions,
// audio and the rest live in their own modules; this file only wires them
// together and decides what happens when Mara does something.
//
// Phase 7 rewrite: fresh structure, same observable game — same screens,
// same keys, same money / health / wanted numbers, same mission flow.
import * as THREE from 'three';
import { buildCity, CITY } from './city.js';
import { createPlayer, updatePlayer, faceToward } from './player.js';
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
import { createWeapons, GUN_PRICE, BAT_PRICE } from './weapons.js';
import { createDayNight } from './daynight.js';
import { createWasted, HOSPITAL_POS } from './wasted.js';
import { createWeather } from './weather.js';
import { createCollectibles } from './collectibles.js';
import { createBoats } from './boats.js';
import { buildIsland, ISLAND_BOUNDS, LIGHTHOUSE_POS } from './island.js';
import { createGangs } from './gangs.js';
import { createCustomization, ARMOR_BONUS } from './customization.js';
import { createStory, STORY_JOBS } from './story.js';
import { createFishing, PIER_TIP, FISH_PRICES } from './fishing.js';
import { createRaces, RACE_ROUTES } from './races.js';
import { createHousing } from './housing.js';
import { createCasino } from './casino.js';
import { createDelivery } from './delivery.js';
import { createPets, SNACK_PRICE } from './pets.js';
import { formatMoney } from './utils.js';

// ---------------------------------------------------------------------------
// Address bar: which screenshot pose (if any) and which world seed.
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number(params.get('seed'));
const seed = Number.isInteger(seedParam) ? seedParam : 1;
const isShot = Boolean(shot) && SHOT_NAMES.includes(shot);

window.__shotReady = false;
window.__shotError = null;

// ---------------------------------------------------------------------------
// Renderer, scene, camera.
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(60, 34, 90);
camera.lookAt(0, 14, 0);

const clock = new THREE.Clock();

// ---------------------------------------------------------------------------
// Shared run state. Everything the loop and the input handlers need to
// agree on lives here, under these exact field names.
// ---------------------------------------------------------------------------
const state = {
  mode: 'menu', // menu | playing | paused | story | garage | wasted
  health: 100,
  maxHealth: 100,
  money: 1250,
  wanted: 0,
  bestWanted: 0,
  objective: 'Meet Rico at the marina — drive south to the pier',
  objectivePos: null,
  inCar: false,
  car: null,
  nearCar: null,
  inBoat: false,
  boat: null,
  nearBoat: null,
  nearGarage: false,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 9,
  cameraMode: 'chase', // chase | fixed
  fixedCam: null,
  saveTimer: 0,
  playTime: 0,
};

// Held movement keys (WASD / arrows / Shift / Space).
const input = { forward: false, back: false, left: false, right: false, run: false, jump: false };

const crashCooldown = { value: 0 };
let frameCount = 0;
let elapsed = 0; // seconds since boot, for ambient motion (boat bobbing)
let menuAngle = Math.atan2(60, 90); // slow orbit around the city on the menu
let nearShopNow = false; // gun-shop proximity, refreshed each frame
let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// ---------------------------------------------------------------------------
// Build the world. The order below is the order the systems expect to be
// created in: the city first, then the things that stand in it.
// ---------------------------------------------------------------------------
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
const weapons = createWeapons(scene);
const daynight = createDayNight(scene, city);
const wasted = createWasted();
const weather = createWeather(scene, city, daynight);
const collectibles = createCollectibles(scene, seed);
const island = buildIsland(scene, seed);
const boats = createBoats(scene);
const gangs = createGangs(scene, seed);
const story = createStory();
const customization = createCustomization(scene, {
  getMoney: () => state.money,
  spend: (amount) => {
    if (state.money < amount) return false;
    state.money -= amount;
    persistSave();
    return true;
  },
  onBought: (text) => {
    hud.showToast(text);
    audio.chime();
    if (customization.state.armor) state.maxHealth = 100 + ARMOR_BONUS;
  },
  onClosed: () => { state.mode = 'playing'; },
});

// The island's buildings block movement like the mainland's.
city.colliders.push(...island.colliders);

// Mission hooks: lighting the lighthouse, and counting the Sharks still
// standing in their turf for the Turf War job.
missions.setLighthouseHook(() => island.lightOn());
missions.setTurfHook(() => gangs.rivalsAliveIn('sharks'));

// The six side hustles.
const fishing = createFishing(scene, audio);
const races = createRaces(scene);
const housing = createHousing(scene);
const casino = createCasino(scene, audio);
const delivery = createDelivery(scene);
const pets = createPets(scene, audio, collectibles, gangs);

// The marker starts over the first job's target.
state.objectivePos = missions.markerPos;

// The save, read once at boot.
const savedGame = loadSave();

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

/** Where Mara's attention is: the boat, the car, or her own feet. */
function focusPosition() {
  if (state.inBoat && state.boat) return state.boat.pos;
  if (state.inCar && state.car) return state.car.pos;
  return player.pos;
}

/** Shortest-arc angle step, so the camera never spins the long way round. */
function easeAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Step out of whatever vehicle Mara is in, without any camera flourish. */
function leaveVehicleQuietly() {
  if (state.inCar) exitCar(true);
  if (state.inBoat) exitBoat(true);
}

// ---------------------------------------------------------------------------
// Saving.
// ---------------------------------------------------------------------------

function persistSave() {
  if (isShot) return; // screenshot runs never write a save
  const shop = customization.saveData();
  saveGame({
    money: state.money,
    missionsCompleted: missions.completed,
    bestWanted: state.bestWanted,
    health: state.health,
    timesWasted: wasted.timesWasted,
    timesBusted: wasted.timesBusted,
    shotsFired: weapons.shotsFired,
    packagesCollected: collectibles.count,
    photosTaken: missions.photosTaken,
    turfOwned: gangs.saveData(),
    paintIndex: shop.paintIndex,
    engineLevel: shop.engineLevel,
    armor: shop.armor,
    fishing: fishing.saveData(),
    races: races.saveData(),
    housing: housing.saveData(),
    casino: casino.saveData(),
    delivery: delivery.saveData(),
    pets: pets.saveData(),
  });
}

// ---------------------------------------------------------------------------
// Starting a game, fresh or from a save.
// ---------------------------------------------------------------------------

function startGame(useSave) {
  audio.unlock();
  if (useSave && savedGame) {
    state.money = savedGame.money;
    state.health = savedGame.health;
    state.bestWanted = savedGame.bestWanted;
    wasted.timesWasted = savedGame.timesWasted;
    wasted.timesBusted = savedGame.timesBusted;
    weapons.shotsFired = savedGame.shotsFired;
    collectibles.restore(savedGame.packagesCollected);
    customization.restore({
      paintIndex: savedGame.paintIndex,
      engineLevel: savedGame.engineLevel,
      armor: savedGame.armor,
    });
    gangs.restore(savedGame.turfOwned);
    fishing.restore(savedGame.fishing);
    races.restore(savedGame.races);
    housing.restore(savedGame.housing);
    casino.restore(savedGame.casino);
    delivery.restore(savedGame.delivery);
    pets.restore(savedGame.pets);
    if (savedGame.armor) state.maxHealth = 100 + ARMOR_BONUS;
    missions.startMission(Math.min(savedGame.missionsCompleted, 11));
    maybeStartNight();
    hud.showToast(`Welcome back, Mara — ${savedGame.missionsCompleted}/12 jobs done.`);
  } else {
    state.money = 1250;
    state.health = 100;
    state.maxHealth = 100;
    state.bestWanted = 0;
    state.wanted = 0;
    police.setWanted(0, player.pos);
    missions.startMission(0);
    if (!isShot) clearSave();
  }
  state.objective = missions.objectiveText(player.pos);
  state.objectivePos = missions.markerPos || null;
  state.mode = 'playing';
  state.cameraMode = 'chase';
  state.fixedCam = null;
  showScreen(null);
  maybeShowStory(missions.index);
}

/** Play the intro cutscene for a job, if it has one; otherwise just continue. */
function maybeShowStory(jobIndex, after) {
  if (isShot) {
    if (after) after();
    return;
  }
  if (STORY_JOBS.includes(jobIndex)) {
    const shown = story.showFor(jobIndex, () => {
      state.mode = 'playing';
      if (after) after();
    });
    if (shown) {
      state.mode = 'story';
      return;
    }
  }
  if (after) after();
}

/** Night jobs start after dark: jump the clock to 21:00. */
function maybeStartNight() {
  const job = missions.current();
  if (job && job.night) daynight.setHours(21);
}

// ---------------------------------------------------------------------------
// Busted / wasted.
// ---------------------------------------------------------------------------

function handleBusted() {
  wasted.countBusted();
  state.wanted = 0;
  police.setWanted(0, player.pos);
  state.money = Math.max(0, state.money - 150);
  leaveVehicleQuietly();
  player.pos.set(0, 0, -20);
  state.health = Math.max(state.health, 60);
  hud.showToast('Busted! The law took $150 — walk it off, Mara.');
  audio.thud();
  persistSave();
}

function handleWasted() {
  if (state.mode === 'wasted') return;
  const bill = wasted.billBreakdown(state.money);
  state.money = Math.max(0, state.money - bill.total);
  state.wanted = 0;
  police.setWanted(0, player.pos);
  leaveVehicleQuietly();
  state.mode = 'wasted';
  audio.thud();
  wasted.showWasted(() => {
    const home = housing.respawnPoint();
    const receipt = `WASTED — hospital bill ${formatMoney(bill.total)} `
      + `(bed ${formatMoney(bill.bed)} + treatment ${formatMoney(bill.treatment)})`;
    if (home) {
      player.pos.set(home.x, 0, home.z);
      hud.showToast(`${receipt} — you wake up at home.`);
    } else {
      player.pos.set(HOSPITAL_POS.x, 0, HOSPITAL_POS.z);
      hud.showToast(`${receipt} — St. Solmar patched you up.`);
    }
    state.health = state.maxHealth;
    state.mode = 'playing';
    persistSave();
  });
}

// ---------------------------------------------------------------------------
// Shooting.
// ---------------------------------------------------------------------------

function fireShot() {
  if (!weapons.owned) return;
  const hit = weapons.shoot(player.pos, player.heading, { peds, traffic, police });
  if (!hit) return; // still on cooldown / reloading
  if (hit.kind === 'dry') {
    audio.dryClick();
    hud.showToast('Empty — R to reload.');
    return;
  }
  audio.gunshot();
  if (hit.kind === 'none') {
    // A miss is only a crime when somebody sees it happen.
    if (peds.nearest(player.pos, 30)) {
      police.addHeat(1, player.pos);
      hud.showToast('Someone saw that — +1★');
    }
    return;
  }
  const heat = combat.applyShotHit(hit);
  if (heat > 0) police.addHeat(heat, player.pos);
  if (hit.kind === 'ped') hud.showToast('Pedestrian down — +1★');
  else if (hit.kind === 'traffic') hud.showToast('You shot a car — +1★');
  else if (hit.kind === 'police') hud.showToast('You shot a patrol car — +2★');
}

// ---------------------------------------------------------------------------
// Pause, vehicles, camera.
// ---------------------------------------------------------------------------

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

/** The pause screen's RESTART button: back to the start line, fresh. */
function restartFromPause() {
  leaveVehicleQuietly();
  player.pos.set(0, 0, -20);
  state.health = state.maxHealth;
  state.wanted = 0;
  police.setWanted(0, player.pos);
  missions.restartCurrent();
  maybeStartNight();
  state.mode = 'playing';
  showScreen(null);
}

function toggleCar() {
  if (state.inBoat) { exitBoat(false); return; }
  if (state.inCar) { exitCar(false); return; }
  const boat = boats.nearest(player.pos, 6);
  if (boat) { enterBoat(boat); return; }
  const car = nearestCar(cars, player.pos, 4.5);
  if (car) enterCar(car);
}

function enterBoat(boat) {
  state.inBoat = true;
  state.boat = boat;
  boat.driven = true;
  player.group.visible = false;
  hud.showToast('Boat — W throttle · A/D rudder · E to step ashore');
}

function exitBoat(silent) {
  const boat = state.boat;
  if (!boat) return;
  boat.driven = false;
  boat.speed = 0;
  const shore = boats.shorePoint(boat.pos);
  player.pos.set(shore.x, 0, shore.z);
  player.group.visible = true;
  state.inBoat = false;
  state.boat = null;
  if (!silent) state.cameraYaw = boat.heading + Math.PI;
}

function enterCar(car) {
  if (!car.stolen) {
    car.stolen = true;
    if (!isShot) {
      police.addHeat(1, player.pos);
      hud.showToast('You stole a car — +1★');
    }
  }
  state.inCar = true;
  state.car = car;
  car.driven = true;
  customization.applyTo(car);
  player.group.visible = false;
}

function exitCar(silent) {
  const car = state.car;
  if (!car) return;
  car.driven = false;
  car.speed = 0;
  // Step out to the car's right-hand side.
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  player.pos.set(car.pos.x + rx * 3, 0, car.pos.z + rz * 3);
  player.group.visible = true;
  state.inCar = false;
  state.car = null;
  if (!silent) state.cameraYaw = car.heading + Math.PI;
}

function updateCamera(dt) {
  if (state.cameraMode === 'fixed' && state.fixedCam) {
    camera.position.lerp(state.fixedCam.pos, Math.min(1, dt * 3));
    camera.lookAt(state.fixedCam.target);
    return;
  }
  const anchor = focusPosition();
  const focus = new THREE.Vector3(
    anchor.x, (state.inCar || state.inBoat) ? 1.6 : 1.7, anchor.z,
  );
  if (state.inCar || state.inBoat) {
    // Swing the orbit round to sit behind the vehicle as it turns.
    const heading = state.inCar ? state.car.heading : state.boat.heading;
    state.cameraYaw = easeAngle(state.cameraYaw, heading + Math.PI, Math.min(1, dt * 2.5));
  }
  const level = Math.cos(state.cameraPitch);
  const wanted = new THREE.Vector3(
    focus.x + Math.sin(state.cameraYaw) * level * state.cameraDist,
    focus.y + Math.sin(state.cameraPitch) * state.cameraDist,
    focus.z + Math.cos(state.cameraYaw) * level * state.cameraDist,
  );
  camera.position.lerp(wanted, Math.min(1, dt * 5));
  camera.lookAt(focus);
}

// ---------------------------------------------------------------------------
// Keyboard: one handler, every binding.
// ---------------------------------------------------------------------------

function onKeyDown(e) {
  if (e.code === 'Space') e.preventDefault(); // Space must never scroll the page

  if (state.mode === 'story') {
    story.advance();
    return;
  }
  if (state.mode === 'garage') {
    if (e.code === 'KeyG' || e.code === 'Escape') customization.close();
    return; // the shop eats every other key
  }

  // Movement flags from the key map.
  if (e.code === 'KeyW' || e.code === 'ArrowUp') input.forward = true;
  else if (e.code === 'KeyS' || e.code === 'ArrowDown') input.back = true;
  else if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = true;
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = true;
  else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
  else if (e.code === 'Space') input.jump = true;

  if (e.code === 'Enter' && state.mode === 'menu') {
    startGame(false);
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) {
    audio.unlock();
    const muted = audio.toggleMute();
    const tag = document.getElementById('mute-tag');
    if (tag) tag.textContent = muted ? 'MUTED' : '';
    hud.showToast(muted ? 'Sound off' : 'Sound on');
    return;
  }
  if (e.code === 'KeyJ' && !e.repeat) {
    hud.toggleMissionList(
      `${missions.listText()}\n${missions.sideJobsText({ fishing, races, delivery, casino, housing, pets })}`,
    );
    return;
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
    togglePause();
    return;
  }
  if (state.mode !== 'playing' || e.repeat) return;

  switch (e.code) {
    case 'KeyE': handleUseKey(); break;
    case 'KeyF': handlePunchKey(); break;
    case 'KeyR': handleRetryKey(); break;
    case 'KeyG': handleShopKey(); break;
    case 'KeyT': handleRaceKey(); break;
    case 'KeyH': handleFeedKey(); break;
    case 'KeyV': handlePointKey(); break;
    case 'KeyU': handleCardKey(true); break;
    case 'KeyI': handleCardKey(false); break;
    case 'KeyX': handleCashOutKey(); break;
    case 'KeyQ': handleRadioKey(); break;
    case 'KeyC': handleCameraKey(); break;
    default: break;
  }
}

function onKeyUp(e) {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') input.forward = false;
  else if (e.code === 'KeyS' || e.code === 'ArrowDown') input.back = false;
  else if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = false;
  else if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = false;
  else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
  else if (e.code === 'Space') input.jump = false;
}

/** E: use whatever is in front of Mara, in this priority order. */
function handleUseKey() {
  if (state.inCar || state.inBoat) {
    toggleCar(); // E exits a vehicle
    return;
  }
  if (housing.inside) {
    const out = housing.exit();
    if (out) player.pos.set(out.x, 0, out.z);
    return;
  }
  const house = housing.doorAt(player.pos);
  if (house) {
    if (housing.isOwned(house)) {
      const room = housing.enter(player.pos);
      if (room) player.pos.set(room.x, 0, room.z);
    } else {
      const price = housing.buy(house, state.money);
      if (price >= 0) {
        state.money -= price;
        audio.jingle();
        hud.showToast(`${house.name} is yours — ${formatMoney(price)}.`);
        persistSave();
      } else {
        hud.showToast(`${house.name} costs ${formatMoney(house.price)} — save up.`);
      }
    }
    return;
  }
  if (delivery.nearDepot(player.pos)) {
    if (delivery.job) {
      hud.showToast('Already carrying a parcel — deliver it first.');
    } else {
      const job = delivery.pickup(player.pos);
      if (job) hud.showToast(`Parcel picked up — deliver to ${job.drop.label}.`);
    }
    return;
  }
  if (fishing.nearPier(player.pos) && fishing.bucket.length > 0) {
    const cash = fishing.sell(player.pos);
    if (cash > 0) {
      state.money += cash;
      hud.showToast(`Sold the catch — +${formatMoney(cash)}.`);
      persistSave();
    }
    return;
  }
  toggleCar();
}

/** F: fish, flatten a rival, or throw a punch — in that order. */
function handlePunchKey() {
  if (state.inCar || state.inBoat) return;
  if (fishing.nearPier(player.pos)) {
    if (fishing.state === 'bite') {
      const kind = fishing.reel();
      if (kind) hud.showToast(`Caught a ${kind} — worth ${formatMoney(FISH_PRICES[kind])}.`);
    } else if (fishing.state === 'idle') {
      faceToward(player, PIER_TIP.x, PIER_TIP.z);
      if (fishing.cast(player.pos)) hud.showToast('Line cast — wait for the bobber to dip.');
    }
    return; // while waiting for a bite, F does nothing
  }
  const rival = gangs.nearestRival(player.pos, 2.4);
  if (rival) {
    gangs.knockDown(rival);
    audio.thud();
    hud.showToast('Gang rival laid out!');
    return;
  }
  const hit = combat.tryPunch(player, peds, weapons.meleeReach());
  if (hit) {
    police.addHeat(1, player.pos);
    audio.thud();
    hud.showToast(weapons.bat
      ? 'The bat connects — pedestrian down! +1★'
      : 'Punch landed — pedestrian down! +1★');
  }
}

/** R: reload the pistol when it can be reloaded, else restart the job. */
function handleRetryKey() {
  if (!state.inCar && !state.inBoat && weapons.owned && weapons.reload()) {
    audio.reloadClick();
    hud.showToast('Reloading…');
    return;
  }
  const job = missions.restartCurrent();
  maybeStartNight();
  hud.showToast(job ? `Job restarted — ${job.title}.` : 'No job to restart.');
}

/** G: slots, garage shop, or the gun shop — whichever door Mara is at. */
function handleShopKey() {
  if (state.inCar || state.inBoat) return;
  if (casino.nearCasino(player.pos)) {
    const spin = casino.slots(state.money);
    if (spin.ok) {
      state.money += spin.delta;
      hud.showToast(spin.text);
      persistSave();
    } else {
      hud.showToast(spin.text);
    }
    return;
  }
  if (customization.nearGarage(player.pos)) {
    customization.open();
    state.mode = 'garage';
    return;
  }
  if (weapons.nearShop(player.pos)) {
    if (!weapons.owned) {
      if (weapons.buy(state.money) === 'ok') {
        state.money -= GUN_PRICE;
        audio.chime();
        hud.showToast('Pistol bought — $400. R to reload, click to fire.');
        persistSave();
      } else {
        hud.showToast('Pistol costs $400 — save up.');
      }
    } else {
      const result = weapons.buyBat(state.money);
      if (result === 'ok') {
        state.money -= BAT_PRICE;
        audio.chime();
        hud.showToast('Bat bought — $50. Longer reach, no ammo needed.');
        persistSave();
      } else if (result === 'owned') {
        hud.showToast('Already armed — pistol and bat in hand.');
      } else {
        hud.showToast('Bat costs $50 — save up.');
      }
    }
    return;
  }
  hud.showToast('Looking for a gun? The GUN SHOP is downtown — green sign, $400.');
}

/** T: line up at the garage flag and run the next unraced route. */
function handleRaceKey() {
  if (!state.inCar) return;
  if (races.active) {
    hud.showToast('A race is already running — finish it first.');
    return;
  }
  if (!races.nearStart(state.car.pos)) {
    hud.showToast('Drive to the chequered flag by the garage to start a race.');
    return;
  }
  let idx = RACE_ROUTES.findIndex((r) => races.best[r.name] === undefined);
  if (idx < 0) idx = 0; // every route has a time: run the first one again
  const route = RACE_ROUTES[idx];
  if (races.start(idx, state.car)) {
    audio.jingle();
    hud.showToast(`${route.name} — ${formatMoney(route.prize)} prize. 3… 2… 1… GO!`);
  }
}

/** H: buy Biscuit a $10 snack. */
function handleFeedKey() {
  if (state.inCar || state.inBoat) return;
  if (pets.feed(state.money)) {
    state.money -= SNACK_PRICE;
    hud.showToast('Biscuit loved the snack!');
    persistSave();
  } else {
    hud.showToast('A snack costs $10.');
  }
}

/** V: ask Biscuit to point at the nearest hidden package. */
function handlePointKey() {
  if (state.inCar || state.inBoat) return;
  pets.point(player.pos);
  hud.showToast(pets.lastPoint);
}

/** U / I: call the next card higher / lower at the card table. */
function handleCardKey(higher) {
  if (!casino.hiLo) return;
  const res = casino.guessHiLo(higher);
  if (!res.ok) {
    hud.showToast(res.text);
    return;
  }
  state.money += res.delta;
  hud.showToast(res.text);
  if (res.done) persistSave();
}

/** X: walk away from the card table with the pot. */
function handleCashOutKey() {
  if (!casino.hiLo) return;
  const res = casino.cashOut();
  state.money += res.delta;
  hud.showToast(res.text);
  persistSave();
}

/** Q: the radio only works while driving. */
function handleRadioKey() {
  if (!state.inCar) {
    hud.showToast('The radio only works while driving.');
    return;
  }
  const name = audio.toggleStation();
  hud.showToast(name ? `Radio — ${name}` : 'Radio off');
}

/** C: sit at the card table, or snap a Shutterbug photo. */
function handleCameraKey() {
  if (state.inCar || state.inBoat) return;
  if (casino.nearCasino(player.pos)) {
    const res = casino.startHiLo(state.money);
    if (res.ok) {
      state.money += res.delta;
      hud.showToast(res.text);
      persistSave();
    } else {
      hud.showToast(res.text);
    }
    return;
  }
  const job = missions.current();
  if (!job || job.kind !== 'shutterbug') return;
  const snap = missions.snapPhoto(player.pos);
  if (snap.tooFar) {
    hud.showToast('Too far — get closer to the spot.');
    return;
  }
  if (!snap.photoDone) return;
  state.money += snap.photoReward;
  audio.shutter();
  hud.showFlash();
  hud.showToast(`Photo ${missions.photosTaken}/3 — +${formatMoney(snap.photoReward)}.`);
  if (snap.completed) {
    state.money += snap.reward;
    audio.jingle();
    hud.showToast(`All three photos — +${formatMoney(snap.reward)} bonus!`);
    maybeStartNight();
    maybeShowStory(missions.index);
    if (!missions.current()) hud.showToast('All jobs done — Solmar City is yours. Free roam!');
  }
  persistSave();
}

// ---------------------------------------------------------------------------
// Mouse / wheel / resize.
// ---------------------------------------------------------------------------

function onMouseDown(e) {
  dragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (state.mode === 'story') {
    story.advance();
    return;
  }
  if (state.mode === 'playing' && !state.inCar && !state.inBoat && weapons.owned) fireShot();
}

function onMouseMove(e) {
  if (dragging && state.cameraMode !== 'fixed') {
    state.cameraYaw -= (e.clientX - lastMouseX) * 0.005;
    state.cameraPitch = Math.min(1.1, Math.max(0.05,
      state.cameraPitch + (e.clientY - lastMouseY) * 0.004));
  }
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

function onMouseUp() {
  dragging = false;
}

function onWheel(e) {
  state.cameraDist = Math.min(16, Math.max(5, state.cameraDist + Math.sign(e.deltaY)));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// The hint bar and the side line.
// ---------------------------------------------------------------------------

/** One contextual hint for the bar above the HUD, or '' when none applies. */
function computeHint() {
  if (state.inCar) {
    if (races.nearStart(state.car.pos) && !races.active) return races.promptText();
    return '';
  }
  if (state.inBoat) return '';
  if (housing.inside) return 'E — step out of the house';
  const house = housing.doorAt(player.pos);
  if (house) return housing.promptText(house);
  if (fishing.nearPier(player.pos)) return fishing.promptText();
  if (casino.nearCasino(player.pos)) return casino.promptText();
  if (delivery.nearDepot(player.pos)) return delivery.promptText();
  if (pets.pointing) return 'Biscuit is on a scent — follow him!';
  return '';
}

/** The side-hustle line under the objective, plus the ram-run warning. */
function computeSideLine() {
  const bits = [];
  if (races.active) {
    const line = races.statusText();
    if (line) bits.push(line);
  } else if (fishing.statusText()) {
    bits.push(fishing.statusText());
  } else if (delivery.statusText()) {
    bits.push(delivery.statusText());
  } else if (casino.hiLo) {
    bits.push(casino.statusText());
  } else {
    const fallbacks = [
      housing.statusText(), pets.statusText(), casino.statusText(),
      fishing.statusText(), delivery.statusText(), races.statusText(),
    ];
    const first = fallbacks.find((s) => s);
    if (first) bits.push(first);
  }
  if (police.ramming) bits.push('3-STAR RAM RUN!');
  return bits.join(' · ');
}

// ---------------------------------------------------------------------------
// The frame loop.
// ---------------------------------------------------------------------------

function tickPlaying(dt) {
  state.playTime += dt;
  if (isShot && shot === 'drive') input.forward = true; // the pose drives itself

  if (!isShot) daynight.update(dt);
  weapons.update(dt);
  story.update(dt);
  player.aiming = weapons.owned && !state.inCar && !state.inBoat;

  // Move: boat, car, or Mara on foot. Boats always bob, driven or not.
  if (state.inBoat) {
    boats.update(dt, input, state.boat, elapsed, audio);
  } else if (state.inCar) {
    updateCar(state.car, dt, input, city.colliders, CITY.bound, weather.gripFactor());
  } else {
    updatePlayer(player, dt, input, state.cameraYaw, city.colliders, CITY.bound);
  }
  if (!state.inBoat) boats.update(dt, input, null, elapsed, audio);

  island.update(dt, daynight.hours);

  // What is close enough to interact with?
  state.nearCar = nearestCar(cars, player.pos, 4.5);
  state.nearBoat = boats.nearest(player.pos, 6);
  state.nearGarage = customization.nearGarage(player.pos);
  nearShopNow = weapons.nearShop(player.pos);

  const focusPos = focusPosition();

  // Gangs: turf claims, passive income, and rivals landing hits.
  const gangEvents = gangs.update(dt, focusPos, state.inCar, state.inBoat);
  const currentJob = missions.current();
  if (currentJob && currentJob.kind === 'turf') gangs.armTurfMission();
  if (gangEvents.claimed) {
    audio.jingle();
    hud.showToast(`Turf claimed — ${gangEvents.claimedName} is yours now!`);
    persistSave();
  }
  if (gangEvents.income > 0) {
    state.money += gangEvents.income;
    hud.showToast(`Turf income +${formatMoney(gangEvents.income)}.`);
    persistSave();
  }
  if (gangEvents.damage > 0) {
    state.health -= gangEvents.damage;
    audio.thud();
    hud.showToast(`A rival landed a hit — -${gangEvents.damage} HP.`);
  }

  // Traffic, and the horn when somebody sits on it.
  traffic.update(dt, {
    playerCar: state.inCar ? state.car : null,
    playerPos: focusPos,
    playerInCar: state.inCar,
    parkedCars: cars,
    grip: weather.gripFactor(),
  });
  if (traffic.horn) {
    traffic.horn = false;
    audio.horn();
  }

  // Pedestrians flee the last gunshot once, then the position is spent.
  const shotPos = weapons.lastShotPos;
  peds.update(dt, {
    playerPos: player.pos,
    playerCar: state.inCar ? state.car : null,
    playerInCar: state.inCar,
    trafficCars: traffic.cars,
    policeCars: police.cars,
    gunshotPos: shotPos,
    raining: weather.raining,
  });
  weapons.lastShotPos = null;

  combat.update(dt);
  crashCooldown.value = Math.max(0, crashCooldown.value - dt);

  // Driving into people and into traffic both earn heat.
  if (state.inCar) {
    for (const _hit of combat.carHits(state.car, peds)) {
      police.addHeat(1, player.pos);
      audio.thud();
      hud.showToast('You ran over a pedestrian — +1★');
    }
    if (trafficCrash(traffic, state.car, crashCooldown)) {
      police.addHeat(1, player.pos);
      audio.thud();
      hud.showToast('Crash! +1★');
    }
  }

  // The law: pursuit, rams, busts, and cooling off.
  const policeEvents = police.update(dt, player, state.inCar ? state.car : null, state.inCar, city.colliders);
  state.wanted = police.wanted;
  if (state.wanted > state.bestWanted) state.bestWanted = state.wanted;
  if (policeEvents.rammed) {
    state.health -= 3;
    audio.thud();
  }
  if (policeEvents.busted) handleBusted();
  if (state.wanted === 0 && state.health < state.maxHealth) {
    state.health = Math.min(state.maxHealth, state.health + 2 * dt);
  }
  if (state.health <= 0) handleWasted();

  // Missions: fares, pickups, completions, failures.
  const missionEvents = missions.update(dt, focusPos, { inBoat: state.inBoat });
  if (missionEvents.fareDone) {
    state.money += missionEvents.fareReward;
    audio.chime();
    hud.showToast(`Fare done — +${formatMoney(missionEvents.fareReward)}.`);
    persistSave();
  }
  if (missionEvents.pickup) {
    audio.thud();
    hud.showToast('Crate aboard — run it to the east docks, roadblocks ahead!');
    if (missionEvents.heat > 0) police.addHeat(missionEvents.heat, focusPos);
  }
  if (missionEvents.completed) {
    state.money += missionEvents.reward;
    audio.jingle();
    hud.showToast(`Job complete — ${missionEvents.completed.title} +${formatMoney(missionEvents.reward)}.`);
    if (missionEvents.heat > 0) police.addHeat(missionEvents.heat, focusPos);
    maybeStartNight();
    maybeShowStory(missions.index);
    if (!missions.current()) hud.showToast('All jobs done — Solmar City is yours. Free roam!');
    persistSave();
  }
  if (missionEvents.failed) {
    audio.thud();
    hud.showToast('Time’s up — the job failed. Press R to retry.');
  }
  state.objective = missions.objectiveText(focusPos);
  state.objectivePos = missions.markerPos || null;

  // Weather follows Mara; hidden packages pay out when she walks over one.
  weather.update(dt, focusPos, audio);
  const found = collectibles.update(dt, focusPos, daynight.hours);
  if (found.collected > 0) {
    state.money += 100 * found.collected;
    audio.chime();
    hud.showToast(`Hidden package found — +${formatMoney(100 * found.collected)} (${collectibles.count}/15).`);
    persistSave();
  }
  if (found.bonus) {
    state.money += 1000;
    audio.jingle();
    hud.showToast('All 15 packages found — +$1,000 bonus!');
    persistSave();
  }

  // Side hustles.
  fishing.update(dt, { goldenHour: daynight.isGoldenHour(), seaBreeze: weather.seaBreeze() });

  const raceEvents = races.update(dt, state.inCar ? state.car.pos : null, state.inCar);
  if (raceEvents) {
    if (raceEvents.countdown) {
      hud.showToast(raceEvents.countdown);
    } else if (raceEvents.gate) {
      hud.showToast(`Gate ${raceEvents.gate}/${races.route.gates.length} cleared!`);
    } else if (raceEvents.abandoned) {
      hud.showToast(races.lastResult);
    } else if (raceEvents.finished) {
      state.money += raceEvents.prize;
      audio.jingle();
      hud.showToast(races.lastResult);
      persistSave();
    }
  }

  const deliveryEvents = delivery.update(dt, focusPos);
  if (deliveryEvents) {
    if (deliveryEvents.delivered) {
      state.money += deliveryEvents.pay;
      audio.chime();
      hud.showToast(delivery.lastResult);
      persistSave();
    } else if (deliveryEvents.failed) {
      audio.thud();
      hud.showToast(delivery.lastResult);
    }
  }

  pets.update(dt, player.pos, player.moving);
  if (!isShot && state.playTime >= 15) {
    // After 15 seconds of play, Biscuit adopts Mara when she walks up to him.
    const dogD = Math.hypot(player.pos.x - pets.dog.position.x, player.pos.z - pets.dog.position.z);
    if (dogD < 7 && story.showBiscuit(() => { state.mode = 'playing'; })) {
      state.mode = 'story';
    }
  }

  // Engine hum, footsteps, sirens, radio.
  audio.update(dt, {
    speed: state.inCar ? Math.abs(state.car.speed) : 0,
    inCar: state.inCar,
    moving: player.moving,
    running: player.running,
    wanted: state.wanted,
  });

  // Autosave every 10 seconds of play.
  state.saveTimer += dt;
  if (state.saveTimer >= 10) {
    state.saveTimer = 0;
    persistSave();
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (state.mode === 'playing') {
    try {
      tickPlaying(dt);
    } catch (err) {
      window.__shotError = String((err && err.message) || err);
    }
  } else {
    // The WASTED overlay counts down outside of play.
    wasted.update(dt);
  }

  // On the menu (a real one, not a screenshot pose) the camera drifts
  // slowly around the city.
  if (!isShot && state.mode === 'menu') {
    menuAngle += dt * 0.03;
    state.fixedCam = {
      pos: new THREE.Vector3(Math.sin(menuAngle) * 108, 34, Math.cos(menuAngle) * 108),
      target: new THREE.Vector3(0, 14, 0),
    };
  }

  updateCamera(dt);

  const hint = computeHint();
  const side = computeSideLine();
  const focusPos = focusPosition();
  const jobNow = missions.current();
  const packageDots = collectibles.nearby(focusPos);
  hud.update({
    health: state.health,
    money: state.money,
    wanted: state.wanted,
    objective: state.objective,
    objectivePos: state.objectivePos,
    inCar: state.inCar,
    inBoat: state.inBoat,
    boatSpeed: boats.speedKmh(state.boat),
    speed: state.inCar ? Math.abs(state.car.speed) : 0, // m/s; the HUD converts to km/h
    playerPos: focusPos,
    heading: state.inBoat ? state.boat.heading : state.inCar ? state.car.heading : player.heading,
    cars,
    nearCar: state.nearCar,
    nearBoat: state.nearBoat,
    nearGarage: state.nearGarage,
    nearShop: nearShopNow,
    traffic: traffic.cars,
    police: police.cars,
    peds: peds.peds,
    ammoText: weapons.ammoText(),
    clockText: daynight.clockText(),
    isNight: daynight.isNight,
    shopPos: weapons.shopPos,
    vipPos: jobNow && jobNow.kind === 'bodyguard' ? missions.vipPos : null,
    weatherIcon: weather.iconText(),
    packagesText: collectibles.counterText(),
    stationText: audio.stationName(),
    packageDots,
    packages: packageDots,
    turfText: `Turf ${gangs.ownedCount()}/3`,
    island: ISLAND_BOUNDS,
    lighthousePos: LIGHTHOUSE_POS,
    lighthouseLit: island.isLit(),
    turfZones: gangs.zones,
    boats: boats.boats,
    garagePos: customization.garagePos,
    sideText: side,
    phase6Hint: hint,
    ramming: police.ramming,
    phase6Markers: [
      ...fishing.markers(), ...races.markers(), ...housing.markers(),
      ...casino.markers(), ...delivery.markers(), ...pets.markers(),
    ],
  });

  renderer.render(scene, camera);
  frameCount += 1;
  if (isShot && frameCount >= 40) window.__shotReady = true;
}

// ---------------------------------------------------------------------------
// Screenshot staging, menu wiring, debug handle, go.
// ---------------------------------------------------------------------------

function setCamera(x, y, z, lx, ly, lz) {
  state.fixedCam = {
    pos: new THREE.Vector3(x, y, z),
    target: new THREE.Vector3(lx, ly, lz),
  };
  camera.position.copy(state.fixedCam.pos);
  camera.lookAt(state.fixedCam.target);
}

function setState(mode) {
  state.mode = mode;
  if (mode === 'menu') showScreen('start-screen');
}

if (isShot) {
  // A named pose: hide every screen and let the pose stage the world.
  showScreen(null);
  const poseMode = stageShot(shot, {
    scene, city, player, cars, traffic, peds, police, missions,
    daynight, weapons, weather, collectibles, boats, island, gangs,
    customization, story, fishing, races, housing, casino, delivery, pets,
    setCamera, setState, enterCar, exitCar, enterBoat, exitBoat,
  });
  state.cameraMode = poseMode === 'fixed' ? 'fixed' : 'chase';
} else {
  // A real visit: mid-morning, start screen up, camera on its slow orbit.
  daynight.setHours(10);
  showScreen('start-screen');
  state.cameraMode = 'fixed';
  state.fixedCam = {
    pos: new THREE.Vector3(60, 34, 90),
    target: new THREE.Vector3(0, 14, 0),
  };
  if (hasSave() && savedGame) {
    const continueBtn = document.getElementById('continue-button');
    if (continueBtn) continueBtn.style.display = 'inline-block';
    const note = document.getElementById('save-note');
    if (note) {
      let text = `Saved progress: ${formatMoney(savedGame.money)} · ${savedGame.missionsCompleted}/9 jobs done`;
      const stats = [];
      if (savedGame.timesWasted > 0) stats.push(`WASTED ×${savedGame.timesWasted}`);
      if (savedGame.timesBusted > 0) stats.push(`BUSTED ×${savedGame.timesBusted}`);
      if (stats.length > 0) text += ` · ${stats.join(' · ')}`;
      note.textContent = text;
    }
  }
}

window.__solmar = {
  state, missions, police, traffic, peds, player, cars, weapons, daynight,
  wasted, weather, collectibles, boats, island, gangs, customization, story,
  fishing, races, housing, casino, delivery, pets,
};

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('wheel', onWheel);
window.addEventListener('resize', onResize);

document.getElementById('start-button')?.addEventListener('click', () => startGame(false));
document.getElementById('continue-button')?.addEventListener('click', () => startGame(true));
document.getElementById('resume-button')?.addEventListener('click', togglePause);
document.getElementById('restart-button')?.addEventListener('click', restartFromPause);

requestAnimationFrame(frame);
