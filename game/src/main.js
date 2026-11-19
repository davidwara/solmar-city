// Solmar City — boot, state machine and frame loop.
// Mara Voss, courier for Rico's crew, drives, sails, fishes, races and
// takes turf across a procedural coastal city. This file owns the boot
// sequence, the game state, the input bindings and the per-frame update
// order; every system it talks to lives in its own module.
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
// Small local helpers (this file's own math; nothing imported for these).
// ---------------------------------------------------------------------------

/** Clamp a number into a range. */
function clampNum(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Shortest signed angle from a to b, in [-PI, PI]. */
function shortAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
// Boot: URL query, renderer, scene, camera.
// ---------------------------------------------------------------------------

const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');
const seedRaw = Number.parseInt(query.get('seed') ?? '', 10);
const seed = Number.isInteger(seedRaw) ? seedRaw : 1;
const isShot = shotName !== null && SHOT_NAMES.includes(shotName);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(60, 34, 90);
camera.lookAt(0, 14, 0);

// ---------------------------------------------------------------------------
// Systems, built in dependency order.
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
    toast(text);
    audio.chime();
    if (customization.state.armor) state.maxHealth = 100 + ARMOR_BONUS;
  },
  onClosed: () => { state.mode = 'playing'; },
});

// The island's buildings block movement like the mainland's.
city.colliders.push(...island.colliders);

// Mission hooks: the lighthouse job lights the beam; the turf job counts
// the Sharks still standing in their own turf.
missions.setLighthouseHook(() => island.lightOn());
missions.setTurfHook(() => gangs.rivalsAliveIn('sharks'));

// The six side hustles.
const fishing = createFishing(scene, audio);
const races = createRaces(scene);
const housing = createHousing(scene);
const casino = createCasino(scene, audio);
const delivery = createDelivery(scene);
const pets = createPets(scene, audio, collectibles, gangs);

// ---------------------------------------------------------------------------
// Game state.
// ---------------------------------------------------------------------------

const state = {
  mode: 'menu', // menu | playing | paused | story | garage | wasted
  health: 100,
  maxHealth: 100,
  money: 1250,
  wanted: 0,
  bestWanted: 0,
  objective: 'Meet Rico at the marina — drive south to the pier',
  objectivePos: missions.markerPos,
  inCar: false,
  car: null,
  nearCar: null,
  inBoat: false,
  boat: null,
  nearBoat: null,
  nearGarage: false,
  nearShop: false,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 9,
  cameraMode: 'chase', // chase | fixed
  fixedCam: null,
  saveTimer: 0,
  playTime: 0,
};

const input = { forward: false, back: false, left: false, right: false, run: false, jump: false };
const crashCooldown = { value: 0 };
let frame = 0;
let elapsed = 0;
// The menu camera starts on the vista the spec parks it on, then drifts
// slowly around the city while the start screen is up.
let menuAngle = Math.atan2(60, 90);

const savedGame = loadSave();

/** Show a toast through the HUD. */
function toast(text) {
  hud.showToast(text);
}

/** Where Mara / her car / her boat is, and which way it faces. */
function focusPos() {
  if (state.inBoat && state.boat) return state.boat.pos;
  if (state.inCar && state.car) return state.car.pos;
  return player.pos;
}

function focusHeading() {
  if (state.inBoat && state.boat) return state.boat.heading;
  if (state.inCar && state.car) return state.car.heading;
  return player.heading;
}

// ---------------------------------------------------------------------------
// Saving.
// ---------------------------------------------------------------------------

function persistSave() {
  if (isShot) return;
  const garage = customization.saveData();
  saveGame({
    money: state.money,
    missionsCompleted: missions.completed,
    bestWanted: state.bestWanted,
    health: Math.round(state.health),
    timesWasted: wasted.timesWasted,
    timesBusted: wasted.timesBusted,
    shotsFired: weapons.shotsFired,
    packagesCollected: collectibles.count,
    photosTaken: missions.photosTaken,
    turfOwned: gangs.saveData(),
    paintIndex: garage.paintIndex,
    engineLevel: garage.engineLevel,
    armor: garage.armor,
    fishing: fishing.saveData(),
    races: races.saveData(),
    housing: housing.saveData(),
    casino: casino.saveData(),
    delivery: delivery.saveData(),
    pets: pets.saveData(),
  });
}

// ---------------------------------------------------------------------------
// Story cutscenes.
// ---------------------------------------------------------------------------

/** Play the opening cutscene for a job, if it has one, then run `after`. */
function maybeShowStory(jobIndex, after) {
  if (isShot) {
    if (after) after();
    return;
  }
  if (STORY_JOBS.includes(jobIndex)) {
    const started = story.showFor(jobIndex, () => {
      state.mode = 'playing';
      if (after) after();
    });
    if (started) {
      state.mode = 'story';
      return;
    }
  }
  if (after) after();
}

/** Night jobs start after dark — jump the clock to 21:00. */
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
  exitCar(true);
  exitBoat(true);
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  state.health = Math.max(state.health, 60);
  toast('Busted! $150 fine — the law took its cut.');
  audio.thud();
  persistSave();
}

function handleWasted() {
  if (state.mode === 'wasted') return;
  const bill = wasted.billBreakdown(state.money);
  state.money = Math.max(0, state.money - bill.total);
  state.wanted = 0;
  police.setWanted(0, player.pos);
  exitCar(true);
  exitBoat(true);
  state.mode = 'wasted';
  audio.thud();
  const billText = `Hospital bill: bed ${formatMoney(bill.bed)} + treatment ${formatMoney(bill.treatment)} = ${formatMoney(bill.total)}`;
  wasted.showWasted(() => {
    const home = housing.respawnPoint();
    if (home) {
      player.pos.set(home.x, 0, home.z);
      toast(`${billText} — you wake up at home.`);
    } else {
      player.pos.set(HOSPITAL_POS.x, 0, HOSPITAL_POS.z);
      toast(`${billText} — St. Solmar patched you up.`);
    }
    player.group.position.copy(player.pos);
    state.health = state.maxHealth;
    state.mode = 'playing';
    persistSave();
  });
}

// ---------------------------------------------------------------------------
// Shooting.
// ---------------------------------------------------------------------------

function fireShot() {
  const hit = weapons.shoot(player.pos, player.heading, { peds, traffic, police });
  if (!hit) return;
  if (hit.kind === 'dry') {
    audio.dryClick();
    toast('Empty — R to reload.');
    return;
  }
  audio.gunshot();
  if (hit.kind === 'none') {
    // A witness nearby sees the shot and calls it in.
    if (peds.nearest(player.pos, 30)) {
      police.addHeat(1, player.pos);
      toast('Someone saw that! +1★');
    }
    return;
  }
  const heat = combat.applyShotHit(hit);
  if (heat > 0) police.addHeat(heat, player.pos);
  if (hit.kind === 'ped') toast('Pedestrian down! +1★');
  else if (hit.kind === 'traffic') toast('You shot a car! +1★');
  else if (hit.kind === 'police') toast('You shot a patrol car! +2★');
}

// ---------------------------------------------------------------------------
// Starting a game.
// ---------------------------------------------------------------------------

function startGame(useSave) {
  audio.unlock();
  if (useSave && savedGame) {
    const s = savedGame;
    state.money = s.money;
    state.health = s.health;
    state.bestWanted = s.bestWanted;
    wasted.timesWasted = s.timesWasted || 0;
    wasted.timesBusted = s.timesBusted || 0;
    weapons.shotsFired = s.shotsFired || 0;
    collectibles.restore(s.packagesCollected || 0);
    customization.restore({ paintIndex: s.paintIndex, engineLevel: s.engineLevel, armor: s.armor });
    state.maxHealth = 100 + (customization.state.armor ? ARMOR_BONUS : 0);
    state.health = Math.min(state.health, state.maxHealth);
    gangs.restore(s.turfOwned);
    fishing.restore(s.fishing);
    races.restore(s.races);
    housing.restore(s.housing);
    casino.restore(s.casino);
    delivery.restore(s.delivery);
    pets.restore(s.pets);
    missions.startMission(Math.min(s.missionsCompleted || 0, 11));
    maybeStartNight();
    toast(`Welcome back, Mara — ${s.missionsCompleted || 0}/12 jobs done.`);
  } else {
    state.money = 1250;
    state.health = 100;
    state.maxHealth = 100;
    state.bestWanted = 0;
    missions.startMission(0);
    if (!isShot) clearSave();
  }
  state.mode = 'playing';
  state.cameraMode = 'chase';
  showScreen(null);
  maybeShowStory(missions.index);
}

// ---------------------------------------------------------------------------
// Pause / cars / boats.
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
  toast('Boat controls — W throttle · A/D rudder · E to step ashore.');
}

function exitBoat(silent) {
  if (!state.boat) return;
  const boat = state.boat;
  boat.speed = 0;
  boat.driven = false;
  const shore = boats.shorePoint(boat.pos);
  player.pos.copy(shore);
  player.group.position.copy(player.pos);
  player.group.visible = true;
  state.inBoat = false;
  state.boat = null;
  if (!silent) {
    faceToward(player, player.pos.x + Math.sin(boat.heading) * 2, player.pos.z + Math.cos(boat.heading) * 2);
    state.cameraYaw = boat.heading + Math.PI;
  }
}

function enterCar(car) {
  if (!car.stolen && !isShot) {
    police.addHeat(1, player.pos);
    toast('Stolen car! +1★');
  }
  car.stolen = true;
  state.inCar = true;
  state.car = car;
  car.driven = true;
  customization.applyTo(car);
  player.group.visible = false;
}

function exitCar(silent) {
  if (!state.car) return;
  const car = state.car;
  car.speed = 0;
  car.driven = false;
  // Step out 3m to the car's side.
  player.pos.set(
    car.pos.x + Math.cos(car.heading) * 3,
    0,
    car.pos.z - Math.sin(car.heading) * 3,
  );
  player.group.position.copy(player.pos);
  player.group.visible = true;
  state.inCar = false;
  state.car = null;
  if (!silent) {
    faceToward(player, player.pos.x + Math.sin(car.heading) * 2, player.pos.z + Math.cos(car.heading) * 2);
    state.cameraYaw = car.heading + Math.PI;
  }
}

// ---------------------------------------------------------------------------
// Camera.
// ---------------------------------------------------------------------------

function updateCamera(dt) {
  if (state.cameraMode === 'fixed') {
    if (state.fixedCam) {
      camera.position.lerp(state.fixedCam.pos, Math.min(1, dt * 5));
      camera.lookAt(state.fixedCam.target);
    }
    return;
  }
  const focus = focusPos();
  const focusY = focus.y + (state.inCar || state.inBoat ? 1.6 : 1.7);
  // While driving, the orbit eases around to sit behind the vehicle.
  if (state.inCar || state.inBoat) {
    const behind = focusHeading() + Math.PI;
    state.cameraYaw += shortAngle(state.cameraYaw, behind) * Math.min(1, dt * 2.5);
  }
  const flat = Math.cos(state.cameraPitch);
  const wanted = new THREE.Vector3(
    focus.x + Math.sin(state.cameraYaw) * flat * state.cameraDist,
    focusY + Math.sin(state.cameraPitch) * state.cameraDist,
    focus.z + Math.cos(state.cameraYaw) * flat * state.cameraDist,
  );
  camera.position.lerp(wanted, Math.min(1, dt * 8));
  camera.lookAt(focus.x, focusY, focus.z);
}

// ---------------------------------------------------------------------------
// Hint bar + side line.
// ---------------------------------------------------------------------------

function computeHint() {
  if (!state.inCar && !state.inBoat) {
    if (housing.inside) return 'E — step out of the house';
    const house = housing.doorAt(player.pos);
    if (house) return housing.promptText(house);
    if (fishing.nearPier(player.pos)) return fishing.promptText();
    if (casino.nearCasino(player.pos)) return casino.promptText();
    if (delivery.nearDepot(player.pos)) return delivery.promptText();
    if (pets.pointing) return 'Biscuit is on a scent — follow him!';
    return '';
  }
  if (state.inCar && !races.active && races.nearStart(state.car.pos)) return races.promptText();
  return '';
}

function computeSideText() {
  let main = '';
  if (races.active) main = races.statusText();
  else if (fishing.state !== 'idle') main = fishing.statusText();
  else if (delivery.job) main = delivery.statusText();
  else if (casino.hiLo) main = casino.statusText();
  else {
    for (const line of [housing.statusText(), pets.statusText(), casino.statusText(),
      fishing.statusText(), delivery.statusText(), races.statusText()]) {
      if (line) { main = line; break; }
    }
  }
  const parts = [];
  if (main) parts.push(main);
  if (police.ramming) parts.push('3-STAR RAM RUN!');
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Keyboard.
// ---------------------------------------------------------------------------

const KEY_MOVE = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
};

function onKeyDown(e) {
  if (e.code === 'Space') e.preventDefault();
  if (state.mode === 'story') {
    story.advance();
    return;
  }
  if (state.mode === 'garage') {
    if (e.code === 'KeyG' || e.code === 'Escape') customization.close();
    return;
  }
  const moveFlag = KEY_MOVE[e.code];
  if (moveFlag) input[moveFlag] = true;
  if (e.repeat) return;

  switch (e.code) {
    case 'KeyE': {
      if (state.mode !== 'playing') break;
      if (state.inCar) { exitCar(false); break; }
      if (state.inBoat) { exitBoat(false); break; }
      if (housing.inside) {
        const out = housing.exit();
        if (out) {
          player.pos.set(out.x, 0, out.z);
          player.group.position.copy(player.pos);
          toast(`You step out of the ${out.name}.`);
        }
        break;
      }
      const house = housing.doorAt(player.pos);
      if (house) {
        if (housing.isOwned(house)) {
          const room = housing.enter(player.pos);
          if (room) {
            player.pos.set(room.x, 0, room.z);
            player.group.position.copy(player.pos);
            toast(`Welcome home — ${room.name}.`);
          }
        } else {
          const price = housing.buy(house, state.money);
          if (price > 0) {
            state.money -= price;
            audio.jingle();
            toast(`Bought the ${house.name} — ${formatMoney(price)}!`);
            persistSave();
          } else {
            toast(`The ${house.name} costs ${formatMoney(house.price)}.`);
          }
        }
        break;
      }
      const depot = delivery.nearDepot(player.pos);
      if (depot) {
        const job = delivery.pickup(player.pos);
        if (job) toast(`Parcel picked up — deliver it to ${job.drop.label}.`);
        else toast('Already carrying a parcel — deliver it first.');
        break;
      }
      if (fishing.nearPier(player.pos) && fishing.bucket.length > 0) {
        const cash = fishing.sell(player.pos);
        if (cash > 0) {
          state.money += cash;
          toast(`Sold the catch — +${formatMoney(cash)}!`);
          persistSave();
        }
        break;
      }
      toggleCar();
      break;
    }
    case 'KeyP':
    case 'Escape':
      togglePause();
      break;
    case 'Enter':
      if (state.mode === 'menu') startGame(false);
      break;
    case 'KeyF': {
      if (state.mode !== 'playing' || state.inCar || state.inBoat) break;
      if (fishing.nearPier(player.pos)) {
        if (fishing.state === 'bite') {
          const caught = fishing.reel();
          if (caught) toast(`Caught a ${caught} — ${formatMoney(FISH_PRICES[caught])}!`);
        } else if (fishing.state === 'idle') {
          faceToward(player, PIER_TIP.x, PIER_TIP.z);
          if (fishing.cast(player.pos)) toast('Line cast — wait for a bite…');
        }
        break;
      }
      const rival = gangs.nearestRival(player.pos, 2.4);
      if (rival) {
        gangs.knockDown(rival);
        audio.thud();
        toast('Rival gang member down!');
        break;
      }
      const hit = combat.tryPunch(player, peds, weapons.meleeReach());
      if (hit) {
        police.addHeat(1, player.pos);
        audio.thud();
        toast(weapons.bat ? 'Bat swing — pedestrian down! +1★' : 'Punch landed — pedestrian down! +1★');
      }
      break;
    }
    case 'KeyM': {
      audio.unlock();
      const muted = audio.toggleMute();
      const tag = document.getElementById('mute-tag');
      if (tag) tag.textContent = muted ? 'MUTED' : '';
      toast(muted ? 'Sound off' : 'Sound on');
      break;
    }
    case 'KeyJ':
      hud.toggleMissionList(
        `${missions.listText()}\n${missions.sideJobsText({ fishing, races, delivery, casino, housing, pets })}`,
      );
      break;
    case 'KeyR': {
      if (state.mode !== 'playing') break;
      if (!state.inCar && !state.inBoat && weapons.owned && weapons.reload()) {
        audio.reloadClick();
        toast('Reloading…');
      } else {
        const job = missions.restartCurrent();
        maybeStartNight();
        toast(job ? `Job restarted — ${job.title}.` : 'Job restarted.');
      }
      break;
    }
    case 'KeyG': {
      if (state.mode !== 'playing' || state.inCar || state.inBoat) break;
      if (casino.nearCasino(player.pos)) {
        const spin = casino.slots(state.money);
        if (spin.ok) {
          state.money += spin.delta;
          toast(spin.text);
          persistSave();
        } else {
          toast(spin.text);
        }
        break;
      }
      if (customization.nearGarage(player.pos)) {
        customization.open();
        state.mode = 'garage';
        break;
      }
      if (weapons.nearShop(player.pos)) {
        const bought = weapons.buy(state.money);
        if (bought === 'ok') {
          state.money -= GUN_PRICE;
          audio.chime();
          toast('Pistol bought — $400. 12 in the mag, 36 spare.');
          persistSave();
        } else if (bought === 'owned') {
          const bat = weapons.buyBat(state.money);
          if (bat === 'ok') {
            state.money -= BAT_PRICE;
            audio.chime();
            toast('Bat bought — $50. F hits harder now.');
            persistSave();
          } else {
            toast('The bat is $50 — not enough cash.');
          }
        } else {
          toast('The pistol is $400 — not enough cash.');
        }
        break;
      }
      toast('The gun shop is downtown — look for the green beam.');
      break;
    }
    case 'KeyT': {
      if (state.mode !== 'playing' || !state.inCar) break;
      if (races.active) {
        toast('A race is already running.');
        break;
      }
      if (!races.nearStart(state.car.pos)) {
        toast('Drive to the chequered flag by the garage to race.');
        break;
      }
      let routeIndex = RACE_ROUTES.findIndex((r) => !(r.name in races.best));
      if (routeIndex < 0) routeIndex = 0;
      if (races.start(routeIndex, state.car)) {
        audio.jingle();
        toast(`${RACE_ROUTES[routeIndex].name} — win ${formatMoney(RACE_ROUTES[routeIndex].prize)}!`);
      }
      break;
    }
    case 'KeyH': {
      if (state.mode !== 'playing' || state.inCar || state.inBoat) break;
      if (pets.feed(state.money)) {
        state.money -= SNACK_PRICE;
        toast('Biscuit scarfs the snack — happy dog.');
        persistSave();
      } else {
        toast(`A snack is ${formatMoney(SNACK_PRICE)} — not enough cash.`);
      }
      break;
    }
    case 'KeyV': {
      if (state.mode !== 'playing' || state.inCar || state.inBoat) break;
      pets.point(player.pos);
      toast(pets.lastPoint);
      break;
    }
    case 'KeyU':
    case 'KeyI':
    case 'KeyX': {
      if (state.mode !== 'playing' || !casino.hiLo) break;
      if (e.code === 'KeyX') {
        const out = casino.cashOut();
        state.money += out.delta;
        toast(out.text);
        persistSave();
      } else {
        const guess = casino.guessHiLo(e.code === 'KeyU');
        if (!guess.ok) {
          toast(guess.text);
          break;
        }
        state.money += guess.delta;
        toast(guess.text);
        if (guess.done) persistSave();
      }
      break;
    }
    case 'KeyQ': {
      if (state.mode !== 'playing') break;
      if (!state.inCar) {
        toast('The radio only works while driving.');
        break;
      }
      const station = audio.toggleStation();
      toast(station ? `Radio — ${station}` : 'Radio off');
      break;
    }
    case 'KeyC': {
      if (state.mode !== 'playing') break;
      if (!state.inCar && !state.inBoat && casino.nearCasino(player.pos)) {
        const table = casino.startHiLo(state.money);
        if (table.ok) {
          state.money += table.delta;
          toast(table.text);
          persistSave();
        } else {
          toast(table.text);
        }
        break;
      }
      const job = missions.current();
      if (job && job.kind === 'shutterbug') {
        const shot = missions.snapPhoto(player.pos);
        if (shot.tooFar) {
          toast('Too far — get closer to the spot.');
          break;
        }
        if (shot.photoDone) {
          state.money += shot.photoReward;
          audio.shutter();
          hud.showFlash();
          toast(`Photo ${missions.photosTaken}/3 — +${formatMoney(shot.photoReward)}!`);
          persistSave();
        }
        if (shot.completed) {
          state.money += shot.reward;
          audio.jingle();
          toast(`All three photos — ${formatMoney(shot.reward)} bonus!`);
          maybeStartNight();
          maybeShowStory(missions.index);
          if (!missions.current()) toast('All jobs done — Solmar City is yours!');
          persistSave();
        }
      }
      break;
    }
    default:
      break;
  }
}

function onKeyUp(e) {
  const moveFlag = KEY_MOVE[e.code];
  if (moveFlag) input[moveFlag] = false;
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// ---------------------------------------------------------------------------
// Mouse / wheel / resize.
// ---------------------------------------------------------------------------

let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (state.mode === 'story') {
    story.advance();
    return;
  }
  if (state.mode === 'playing' && !state.inCar && !state.inBoat && weapons.owned) fireShot();
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging || state.cameraMode === 'fixed') return;
  state.cameraYaw -= (e.clientX - lastMouseX) * 0.005;
  state.cameraPitch = clampNum(state.cameraPitch + (e.clientY - lastMouseY) * 0.004, 0.05, 1.1);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});
window.addEventListener('wheel', (e) => {
  state.cameraDist = clampNum(state.cameraDist + e.deltaY * 0.01, 5, 16);
}, { passive: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Menu buttons + screenshot staging.
// ---------------------------------------------------------------------------

document.getElementById('start-button').addEventListener('click', () => startGame(false));
document.getElementById('continue-button').addEventListener('click', () => startGame(true));
document.getElementById('resume-button').addEventListener('click', () => togglePause());
document.getElementById('restart-button').addEventListener('click', () => {
  exitCar(true);
  exitBoat(true);
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  state.health = state.maxHealth;
  state.wanted = 0;
  police.setWanted(0, player.pos);
  missions.restartCurrent();
  maybeStartNight();
  state.mode = 'playing';
  showScreen(null);
});

/** Screenshot poses: place the camera and switch the mode. */
function setCamera(x, y, z, lx, ly, lz) {
  state.fixedCam = { pos: new THREE.Vector3(x, y, z), target: new THREE.Vector3(lx, ly, lz) };
  camera.position.set(x, y, z);
  camera.lookAt(lx, ly, lz);
}

function setState(mode) {
  state.mode = mode;
  if (mode === 'menu') showScreen('start-screen');
}

if (isShot) {
  showScreen(null);
  const shotCameraMode = stageShot(shotName, {
    scene,
    city,
    player,
    cars,
    traffic,
    peds,
    police,
    missions,
    daynight,
    weapons,
    weather,
    collectibles,
    boats,
    island,
    gangs,
    customization,
    story,
    fishing,
    races,
    housing,
    casino,
    delivery,
    pets,
    setCamera,
    setState,
    enterCar,
    exitCar,
    enterBoat,
    exitBoat,
  });
  state.cameraMode = shotCameraMode === 'chase' ? 'chase' : 'fixed';
} else {
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
      const stats = [];
      if (savedGame.timesWasted > 0) stats.push(`WASTED ×${savedGame.timesWasted}`);
      if (savedGame.timesBusted > 0) stats.push(`BUSTED ×${savedGame.timesBusted}`);
      note.textContent = `Saved progress: ${formatMoney(savedGame.money)} · ${savedGame.missionsCompleted}/12 jobs done`
        + (stats.length > 0 ? ` · ${stats.join(' · ')}` : '');
      note.style.display = 'block';
    }
  }
}

// ---------------------------------------------------------------------------
// Debug handle.
// ---------------------------------------------------------------------------

window.__solmar = {
  state,
  audio,
  missions,
  police,
  traffic,
  peds,
  player,
  cars,
  weapons,
  daynight,
  wasted,
  weather,
  collectibles,
  boats,
  island,
  gangs,
  customization,
  story,
  fishing,
  races,
  housing,
  casino,
  delivery,
  pets,
};

// ---------------------------------------------------------------------------
// Frame loop.
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  try {
    // The cutscene typewriter runs in every mode; everything else below
    // is the playing branch.
    story.update(dt);
    if (state.mode === 'playing') {
      state.playTime += dt;
      elapsed += dt;
      // The drive pose holds the throttle so the car keeps rolling.
      if (shotName === 'drive') input.forward = true;
      if (!isShot) daynight.update(dt);
      weapons.update(dt);
      player.aiming = weapons.owned && !state.inCar && !state.inBoat;

      // Movement: boat, car, or Mara on foot. Boats bob even when
      // nobody is aboard.
      if (state.inBoat) {
        boats.update(dt, input, state.boat, elapsed, audio);
      } else {
        if (state.inCar) updateCar(state.car, dt, input, city.colliders, CITY.bound, weather.gripFactor());
        else updatePlayer(player, dt, input, state.cameraYaw, city.colliders, CITY.bound);
        boats.update(dt, input, null, elapsed, audio);
      }
      island.update(dt, daynight.hours);

      // What Mara is standing next to.
      state.nearCar = nearestCar(cars, player.pos, 4.5);
      state.nearBoat = boats.nearest(player.pos, 6);
      state.nearGarage = customization.nearGarage(player.pos);
      state.nearShop = weapons.nearShop(player.pos);

      const focus = focusPos();

      // Gangs: turf claims, passive income, rival fists.
      const gangEvents = gangs.update(dt, focus, state.inCar, state.inBoat);
      if (missions.current() && missions.current().kind === 'turf') gangs.armTurfMission();
      if (gangEvents.claimed) {
        audio.jingle();
        toast(`Turf claimed — ${gangEvents.claimedName}!`);
        persistSave();
      }
      if (gangEvents.income > 0) {
        state.money += gangEvents.income;
        toast(`Turf income +${formatMoney(gangEvents.income)}.`);
        persistSave();
      }
      if (gangEvents.damage > 0) {
        state.health -= gangEvents.damage;
        audio.thud();
        toast(`A rival jumped you! -${gangEvents.damage} health.`);
      }

      // Traffic: drive, queue, honk.
      traffic.update(dt, {
        playerCar: state.car,
        playerPos: player.pos,
        playerInCar: state.inCar,
        parkedCars: cars,
        grip: weather.gripFactor(),
      });
      if (traffic.horn) {
        traffic.horn = false;
        audio.horn();
      }

      // Pedestrians: walk, flee, panic at gunfire (once per shot).
      peds.update(dt, {
        playerPos: player.pos,
        playerCar: state.car,
        playerInCar: state.inCar,
        trafficCars: traffic.cars,
        policeCars: police.cars,
        gunshotPos: weapons.lastShotPos,
        raining: weather.raining,
      });
      weapons.lastShotPos = null;
      combat.update(dt);
      crashCooldown.value = Math.max(0, crashCooldown.value - dt);

      // Running people over and crashing into traffic both draw heat.
      if (state.inCar) {
        for (const downed of combat.carHits(state.car, peds)) {
          void downed;
          police.addHeat(1, player.pos);
          audio.thud();
          toast('You ran someone over! +1★');
        }
        if (trafficCrash(traffic, state.car, crashCooldown)) {
          police.addHeat(1, player.pos);
          audio.thud();
          toast('Crash! +1★');
        }
      }

      // Police: pursuit, rams, busts, and the slow cool-down.
      const policeEvents = police.update(dt, player, state.car, state.inCar, city.colliders);
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
      const missionEvents = missions.update(dt, focus, { inBoat: state.inBoat });
      if (missionEvents.fareDone) {
        state.money += missionEvents.fareReward;
        audio.chime();
        toast(`Fare done — +${formatMoney(missionEvents.fareReward)}!`);
        persistSave();
      }
      if (missionEvents.pickup) {
        audio.thud();
        toast('Crate aboard — run it to the east docks, roadblocks ahead!');
        if (missionEvents.heat > 0) police.addHeat(missionEvents.heat, player.pos);
      }
      if (missionEvents.completed) {
        const doneJob = missionEvents.completed;
        state.money += missionEvents.reward;
        audio.jingle();
        toast(`Job done — ${doneJob.title}! +${formatMoney(missionEvents.reward)}`);
        if (missionEvents.heat > 0) police.addHeat(missionEvents.heat, player.pos);
        maybeStartNight();
        maybeShowStory(missions.index);
        if (!missions.current()) toast('All jobs done — Solmar City is yours!');
        persistSave();
      }
      if (missionEvents.failed) {
        audio.thud();
        toast('Time’s up — the job failed. Press R to retry.');
      }
      state.objective = missions.objectiveText(focus);
      state.objectivePos = missions.current() ? missions.markerPos : null;

      // Weather and the hidden-package hunt.
      weather.update(dt, focus, audio);
      const packageEvents = collectibles.update(dt, focus, daynight.hours);
      if (packageEvents.collected > 0) {
        state.money += 100 * packageEvents.collected;
        audio.chime();
        toast(`Hidden package found! +${formatMoney(100 * packageEvents.collected)} (${collectibles.count}/15)`);
        persistSave();
      }
      if (packageEvents.bonus) {
        state.money += 1000;
        audio.jingle();
        toast('All 15 packages — $1,000 bonus!');
        persistSave();
      }

      // Side hustles.
      fishing.update(dt, {
        playerPos: player.pos,
        goldenHour: daynight.isGoldenHour(),
        seaBreeze: weather.seaBreeze(),
      });
      const raceEvents = races.update(dt, state.inCar ? state.car.pos : null, state.inCar);
      if (raceEvents) {
        if (raceEvents.countdown) toast(raceEvents.countdown);
        if (raceEvents.gate) toast(`Gate ${raceEvents.gate}/${races.route ? races.route.gates.length : ''} cleared!`);
        if (raceEvents.abandoned) toast('Race abandoned — you left the car.');
        if (raceEvents.finished) {
          state.money += raceEvents.prize;
          audio.jingle();
          toast(races.lastResult);
          persistSave();
        }
      }
      const deliveryEvents = delivery.update(dt, focus);
      if (deliveryEvents) {
        if (deliveryEvents.delivered) {
          state.money += deliveryEvents.pay;
          audio.chime();
          toast(delivery.lastResult);
          persistSave();
        } else if (deliveryEvents.failed) {
          audio.thud();
          toast(delivery.lastResult);
        }
      }
      pets.update(dt, player.pos, player.moving);
      // Biscuit adopts Mara once she walks up to him after 15s of play.
      if (!isShot && state.playTime >= 15 && !state.inCar && !state.inBoat
        && player.pos.distanceTo(pets.dog.position) < 7) {
        if (story.showBiscuit(() => { state.mode = 'playing'; })) state.mode = 'story';
      }

      audio.update(dt, {
        speed: state.inCar ? Math.abs(state.car.speed) : 0,
        inCar: state.inCar,
        moving: state.inCar ? Math.abs(state.car.speed) > 0.5 : player.moving,
        running: player.running,
        wanted: state.wanted,
      });
      state.saveTimer += dt;
      if (state.saveTimer >= 10) {
        state.saveTimer = 0;
        persistSave();
      }
    } else {
      // Outside play, only the WASTED overlay keeps counting down.
      wasted.update(dt);
    }
  } catch (err) {
    window.__shotError = err && err.message ? err.message : String(err);
  }

  // The start screen's slow orbit around the city.
  if (!isShot && state.mode === 'menu') {
    menuAngle += dt * 0.05;
    const orbitRadius = Math.hypot(60, 90);
    state.fixedCam.pos.set(Math.sin(menuAngle) * orbitRadius, 34, Math.cos(menuAngle) * orbitRadius);
  }

  updateCamera(dt);
  const hint = computeHint();
  const side = computeSideText();
  const focusNow = focusPos();
  const packageDots = collectibles.nearby(focusNow);
  hud.update({
    health: state.health,
    money: state.money,
    wanted: state.wanted,
    objective: state.objective,
    objectivePos: state.objectivePos,
    inCar: state.inCar,
    inBoat: state.inBoat,
    boatSpeed: boats.speedKmh(state.boat),
    speed: state.inCar ? Math.abs(state.car.speed) : 0,
    playerPos: focusNow,
    heading: focusHeading(),
    cars,
    nearCar: state.nearCar,
    nearBoat: state.nearBoat,
    nearGarage: state.nearGarage,
    nearShop: state.nearShop,
    traffic: traffic.cars,
    police: police.cars,
    peds: peds.peds,
    ammoText: weapons.ammoText(),
    clockText: daynight.clockText(),
    isNight: daynight.isNight,
    shopPos: weapons.shopPos,
    vipPos: missions.current() && missions.current().kind === 'bodyguard' ? missions.vipPos : null,
    weatherIcon: weather.iconText(),
    packagesText: collectibles.counterText(),
    stationText: state.inCar ? audio.stationName() : '',
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
      ...fishing.markers(),
      ...races.markers(),
      ...housing.markers(),
      ...casino.markers(),
      ...delivery.markers(),
      ...pets.markers(),
    ],
  });
  renderer.render(scene, camera);
  frame += 1;
  if (isShot && frame >= 40) window.__shotReady = true;
}
animate();
