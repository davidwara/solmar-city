// Solmar City — boot, game loop and state machine.
// States: menu (start screen) -> playing -> paused. ?shot=<pose>&seed=N
// stages a screenshot pose instead of the menu and marks window.__shotReady
// once the scene has settled, so headless Chrome can capture it.
// Phase 2: the city is alive — traffic, pedestrians, police/wanted,
// three story missions, melee combat, procedural audio and saves.
// Phase 3: a pistol from the gun shop, three more jobs (night run,
// bodyguard, taxi), a WASTED hospital respawn, traffic lights + horns,
// talking pedestrians, a day/night cycle and a polished HUD.
// Phase 4: dynamic weather (rain/storms, wet-road grip, lightning),
// three more jobs (smuggler's run, getaway driver, shutterbug), 15 hidden
// packages to hunt, and two procedural radio stations while driving.
// Phase 5: drivable boats on the bay, a second island with a lighthouse
// across a causeway, three more jobs (boat delivery, lighthouse keeper,
// turf war), gang turf with passive income, a garage for paint/engine/
// armour, and story cutscenes before jobs 1, 4, 7 and 10.
import * as THREE from 'three';
import { buildCity, CITY } from './city.js';
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
import { createWeapons, GUN_PRICE, BAT_PRICE } from './weapons.js';
import { createDayNight } from './daynight.js';
import { createWasted, HOSPITAL_POS } from './wasted.js';
import { createWeather } from './weather.js';
import { createCollectibles } from './collectibles.js';
import { createBoats } from './boats.js';
import { buildIsland, ISLAND_BOUNDS, ISLAND_DOCK, LIGHTHOUSE_POS } from './island.js';
import { createGangs } from './gangs.js';
import { createCustomization, ARMOR_BONUS } from './customization.js';
import { createStory, STORY_JOBS } from './story.js';
// Phase 6: the side hustles — fishing, street races, safehouses, the
// casino, courier runs, and Biscuit the stray dog.
import { createFishing, PIER_TIP, FISH_PRICES } from './fishing.js';
import { createRaces, RACE_ROUTES } from './races.js';
import { createHousing } from './housing.js';
import { createCasino } from './casino.js';
import { createDelivery } from './delivery.js';
import { createPets, SNACK_PRICE } from './pets.js';
import { faceToward } from './player.js';
import { formatMoney } from './utils.js';

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
// The island's buildings block movement just like the mainland's.
for (const c of island.colliders) city.colliders.push(c);
// Mission hooks: the lighthouse job lights the island's beam, and the
// turf job counts the Sharks still standing in their turf.
missions.setLighthouseHook(() => island.lightOn());
missions.setTurfHook(() => gangs.rivalsAliveIn('sharks'));

// Phase 6: the side hustles. Fishing and the casino need the audio
// system; Biscuit needs the packages and the gangs to sniff and bark at.
const fishing = createFishing(scene, audio);
const races = createRaces(scene);
const housing = createHousing(scene);
const casino = createCasino(scene, audio);
const delivery = createDelivery(scene);
const pets = createPets(scene, audio, collectibles, gangs);

// --- game state ------------------------------------------------------------
const savedGame = loadSave();
const state = {
  mode: 'menu', // menu | playing | paused | story | garage
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
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 9,
  cameraMode: 'chase', // chase | fixed
  fixedCam: null,
  saveTimer: 0,
  playTime: 0, // Phase 6: seconds played — Biscuit waits 15s before hello
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
    timesWasted: wasted.timesWasted,
    timesBusted: wasted.timesBusted,
    shotsFired: weapons.shotsFired,
    packagesCollected: collectibles.count,
    photosTaken: missions.photosTaken,
    turfOwned: gangs.saveData(),
    paintIndex: customization.state.paintIndex,
    engineLevel: customization.state.engineLevel,
    armor: customization.state.armor,
    fishing: fishing.saveData(),
    races: races.saveData(),
    housing: housing.saveData(),
    casino: casino.saveData(),
    delivery: delivery.saveData(),
    pets: pets.saveData(),
  });
}

/** Play the story cutscene for a job, if it has one; otherwise just play. */
function maybeShowStory(jobIndex, after) {
  if (isShot) { if (after) after(); return; }
  if (STORY_JOBS.includes(jobIndex) && story.showFor(jobIndex, () => {
    state.mode = 'playing';
    if (after) after();
  })) {
    state.mode = 'story';
  } else if (after) {
    after();
  }
}

function toast(text) {
  hud.showToast(text);
}

/** Night jobs start after dark: jump the clock to 21:00 when one begins. */
function maybeStartNight() {
  const m = missions.current();
  if (m && m.night) daynight.setHours(21);
}

function startGame(useSave) {
  audio.unlock();
  if (useSave && savedGame) {
    state.money = savedGame.money;
    state.health = savedGame.health;
    state.bestWanted = savedGame.bestWanted;
    wasted.timesWasted = savedGame.timesWasted || 0;
    wasted.timesBusted = savedGame.timesBusted || 0;
    weapons.shotsFired = savedGame.shotsFired || 0;
    collectibles.restore(savedGame.packagesCollected || 0);
    customization.restore(savedGame);
    gangs.restore(savedGame.turfOwned);
    fishing.restore(savedGame.fishing);
    races.restore(savedGame.races);
    housing.restore(savedGame.housing);
    casino.restore(savedGame.casino);
    delivery.restore(savedGame.delivery);
    pets.restore(savedGame.pets);
    if (customization.state.armor) state.maxHealth = 100 + ARMOR_BONUS;
    missions.startMission(Math.min(savedGame.missionsCompleted, 11));
    maybeStartNight();
    toast(`Welcome back, Mara — ${savedGame.missionsCompleted}/12 jobs done.`);
  } else {
    state.money = 1250;
    state.health = 100;
    state.maxHealth = 100;
    state.bestWanted = 0;
    missions.startMission(0);
    if (!isShot) clearSave();
  }
  state.mode = 'playing';
  showScreen(null);
  maybeShowStory(missions.index);
}

function handleBusted() {
  wasted.countBusted();
  police.setWanted(0, player.pos);
  state.money = Math.max(0, state.money - 150);
  if (state.car) exitCar(true);
  if (state.boat) exitBoat(true);
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  state.health = Math.max(state.health, 60);
  toast('BUSTED! $150 fine — the law lets you walk. This time.');
  audio.thud();
  persistSave();
}

function handleWasted() {
  if (state.mode === 'wasted') return;
  // Phase 6: the itemised hospital bill — bed + treatment, and the wake-up
  // point is home when Mara owns a safehouse she has slept in.
  const parts = wasted.billBreakdown(state.money);
  const bill = parts.total;
  state.money = Math.max(0, state.money - bill);
  police.setWanted(0, player.pos);
  if (state.car) exitCar(true);
  if (state.boat) exitBoat(true);
  state.mode = 'wasted';
  audio.thud();
  wasted.showWasted(() => {
    const home = housing.respawnPoint();
    if (home) {
      player.pos.set(home.x, 0, home.z);
      toast(`WASTED! Bed $${parts.bed} + treatment $${parts.treatment} = $${bill} — you wake up at home.`);
    } else {
      player.pos.set(HOSPITAL_POS.x, 0, HOSPITAL_POS.z);
      toast(`WASTED! St. Solmar patched you up — bed $${parts.bed} + treatment $${parts.treatment} = $${bill}.`);
    }
    player.group.position.copy(player.pos);
    state.health = state.maxHealth;
    state.mode = 'playing';
    persistSave();
  });
}

/** Fire the pistol (mouse click on foot): tracer, sound, damage, heat. */
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
    // A shot in public still draws attention if anyone is close enough.
    const witness = peds.nearest(player.pos, 30);
    if (witness) {
      police.addHeat(1, player.pos);
      toast('Shots fired in public — the law noticed! +1★');
    }
    return;
  }
  const heat = combat.applyShotHit(hit);
  if (heat > 0) police.addHeat(heat, player.pos);
  if (hit.kind === 'ped') toast('You shot a pedestrian — the law noticed! +1★');
  else if (hit.kind === 'traffic') toast('You shot a car — the law noticed! +1★');
  else if (hit.kind === 'police') toast('You shot a patrol car! +2★');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  // Story cutscene: any key advances the dialogue, nothing else runs.
  if (state.mode === 'story') {
    if (!e.repeat) story.advance();
    return;
  }
  // Garage shop open: G or Escape closes it, other keys wait.
  if (state.mode === 'garage') {
    if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyG')) customization.close();
    return;
  }
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = true;
  if (e.code === 'KeyE' && !e.repeat && state.mode === 'playing') {
    // Phase 6 on-foot errands come before the car: step out of a
    // safehouse, buy or enter a house, take a courier parcel, or sell
    // the fishing bucket at the pier. In a car or boat, E still exits.
    if (!state.inCar && !state.inBoat) {
      if (housing.inside) {
        const out = housing.exit();
        if (out) {
          player.pos.set(out.x, 0, out.z);
          player.group.position.copy(player.pos);
          toast(`Stepped out of the ${out.name} — the street again.`);
        }
        return;
      }
      const house = housing.doorAt(player.pos);
      if (house) {
        if (housing.isOwned(house)) {
          const room = housing.enter(player.pos);
          if (room) {
            player.pos.set(room.x, 0, room.z);
            player.group.position.copy(player.pos);
            toast(`Home — the ${room.name}. Wake up here from now on.`);
            persistSave();
          }
        } else if (state.money >= house.price) {
          const paid = housing.buy(house, state.money);
          if (paid > 0) {
            state.money -= paid;
            audio.jingle();
            toast(`The ${house.name} is yours — ${formatMoney(paid)}. Press E again to step inside.`);
            persistSave();
          }
        } else {
          toast(`The ${house.name} costs ${formatMoney(house.price)} — save up.`);
        }
        return;
      }
      if (delivery.nearDepot(player.pos)) {
        const job = delivery.pickup(player.pos);
        if (job) {
          audio.chime();
          toast(`Parcel picked up — deliver to ${job.drop.label} in ${job.timeTotal}s.`);
        } else {
          toast('Finish the parcel you are carrying first.');
        }
        return;
      }
      if (fishing.nearPier(player.pos) && fishing.bucket.length > 0) {
        const cash = fishing.sell(player.pos);
        if (cash > 0) {
          state.money += cash;
          toast(`Sold the bucket — +${formatMoney(cash)}.`);
          persistSave();
        }
        return;
      }
    }
    toggleCar();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause();
  if (e.code === 'Enter' && state.mode === 'menu') startGame(false);
  if (e.code === 'KeyF' && !e.repeat && state.mode === 'playing' && !state.inCar && !state.inBoat) {
    // Fishing first: on the pier, F casts the line and reels a bite in
    // instead of punching — face the water, then fish.
    if (fishing.nearPier(player.pos)) {
      if (fishing.state === 'bite') {
        const caught = fishing.reel();
        if (caught) toast(`Caught a ${caught} — worth ${formatMoney(FISH_PRICES[caught])}. E at the pier sells the bucket.`);
        return;
      }
      if (fishing.state === 'idle') {
        faceToward(player, PIER_TIP.x, PIER_TIP.z);
        if (fishing.cast(player.pos)) toast('Line cast — wait for the bobber to dip…');
        return;
      }
      return; // waiting for a bite — F does nothing until it dips
    }
    // A rival gang member up close goes down first — turf war business.
    const rival = gangs.nearestRival(player.pos, 2.4);
    if (rival) {
      gangs.knockDown(rival);
      audio.thud();
      toast('Rival down! The turf notices.');
      return;
    }
    const hit = combat.tryPunch(player, peds, weapons.meleeReach());
    if (hit) {
      police.addHeat(1, player.pos);
      audio.thud();
      toast(weapons.bat ? 'You laid out a pedestrian with the bat — the law noticed! +1★' : 'You laid out a pedestrian — the law noticed! +1★');
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
    hud.toggleMissionList(missions.listText() + '\n' + missions.sideJobsText({ fishing, races, delivery, casino, housing, pets }));
  }
  if (e.code === 'KeyR' && !e.repeat && state.mode === 'playing') {
    // R reloads the pistol when it can; otherwise it retries the job.
    if (!state.inCar && weapons.owned && weapons.reload()) {
      audio.reloadClick();
      toast('Reloading…');
    } else {
      missions.restartCurrent();
      maybeStartNight();
      toast('Job restarted — back to the marker.');
    }
  }
  if (e.code === 'KeyG' && !e.repeat && state.mode === 'playing' && !state.inCar && !state.inBoat) {
    // The casino door first: G pulls the slot lever at the Golden Gull.
    if (casino.nearCasino(player.pos)) {
      const spin = casino.slots(state.money);
      if (!spin.ok) { toast(spin.text); return; }
      state.money += spin.delta;
      toast(spin.text);
      persistSave();
      return;
    }
    // The garage comes first when Mara stands on its lot; otherwise the
    // gun shop — same key, whichever business she is standing in.
    if (customization.nearGarage(player.pos)) {
      state.mode = 'garage';
      customization.open();
      return;
    }
    if (!weapons.nearShop(player.pos)) {
      toast('Gun shop is on the downtown corner — look for the green sign.');
      return;
    }
    const res = weapons.buy(state.money);
    if (res === 'ok') {
      state.money -= GUN_PRICE;
      audio.chime();
      toast('Pistol bought — click to shoot, R to reload.');
      persistSave();
    } else if (res === 'owned') {
      // Pistol already hers — the same shop sells the $50 bat instead.
      if (!weapons.bat) {
        const batRes = weapons.buyBat(state.money);
        if (batRes === 'ok') {
          state.money -= BAT_PRICE;
          audio.chime();
          toast('Bat bought — F swings farther now, and it never needs ammo.');
          persistSave();
        } else {
          toast('You already own the pistol. The bat is $50.');
        }
      } else {
        toast('You already own the pistol — and the bat.');
      }
    } else {
      toast('Not enough cash — the pistol is $400.');
    }
  }
  if (e.code === 'KeyT' && !e.repeat && state.mode === 'playing' && state.inCar && state.car) {
    // Street race: line up at the chequered flag by the garage. The next
    // route without a best time runs first; once all three have a best,
    // T runs the Harbour Sprint again for a faster time.
    if (races.active) { toast('A race is already running — finish it first.'); return; }
    if (!races.nearStart(state.car.pos)) { toast('Races start at the chequered flag by the Solmar Garage.'); return; }
    const next = RACE_ROUTES.findIndex((r) => races.best[r.name] === undefined);
    const idx = next === -1 ? 0 : next;
    if (races.start(idx, state.car)) {
      audio.jingle();
      toast(`${RACE_ROUTES[idx].name} — ${formatMoney(RACE_ROUTES[idx].prize)} to the winner. 3… 2… 1…`);
    }
  }
  if (e.code === 'KeyH' && !e.repeat && state.mode === 'playing' && !state.inCar && !state.inBoat) {
    // Biscuit's snack: $10, and a happy dog walks closer.
    if (pets.feed(state.money)) {
      state.money -= SNACK_PRICE;
      toast('Biscuit scarfs the snack — tail wagging.');
      persistSave();
    } else {
      toast('A snack costs $10 — Biscuit waits.');
    }
  }
  if (e.code === 'KeyV' && !e.repeat && state.mode === 'playing' && !state.inCar && !state.inBoat) {
    // Biscuit, find a package: he runs toward the nearest one still out.
    if (pets.point(player.pos)) toast(pets.lastPoint);
    else toast(pets.lastPoint || 'Biscuit sniffs the air — nothing left to find.');
  }
  if (e.code === 'KeyU' && !e.repeat && state.mode === 'playing' && casino.hiLo) {
    // Card table: the next card is HIGHER than the one showing.
    const g = casino.guessHiLo(true);
    state.money += g.delta;
    toast(g.text);
    if (g.done) persistSave();
  }
  if (e.code === 'KeyI' && !e.repeat && state.mode === 'playing' && casino.hiLo) {
    // Card table: the next card is LOWER than the one showing.
    const g = casino.guessHiLo(false);
    state.money += g.delta;
    toast(g.text);
    if (g.done) persistSave();
  }
  if (e.code === 'KeyX' && !e.repeat && state.mode === 'playing' && casino.hiLo) {
    // Card table: walk away with the pot as it stands.
    const out = casino.cashOut();
    state.money += out.delta;
    toast(out.text);
    persistSave();
  }
  if (e.code === 'KeyQ' && !e.repeat && state.mode === 'playing') {
    // Radio: only while driving — on foot the streets are the soundtrack.
    if (!state.inCar) {
      toast('The radio only plays behind the wheel — steal a car first.');
      return;
    }
    const station = audio.toggleStation();
    toast(station ? `Radio: ${station}` : 'Radio off');
  }
  if (e.code === 'KeyC' && !e.repeat && state.mode === 'playing') {
    // The card table first: C sits Mara down at the Golden Gull.
    if (casino.nearCasino(player.pos) && !state.inCar && !state.inBoat) {
      const seated = casino.startHiLo(state.money);
      if (!seated.ok) { toast(seated.text); return; }
      state.money += seated.delta;
      toast(seated.text);
      persistSave();
      return;
    }
    // Shutterbug: snap the scenic spot when Mara is close enough.
    const m = missions.current();
    if (!m || m.kind !== 'shutterbug') return;
    const focusPos = state.inCar ? state.car.pos : player.pos;
    const ev = missions.snapPhoto(focusPos);
    if (ev.tooFar) {
      toast('Get closer to the spot to snap it.');
      return;
    }
    if (ev.photoDone) {
      state.money += ev.photoReward;
      audio.shutter();
      hud.showFlash();
      toast(`Photo ${missions.photosTaken}/3 — +$${ev.photoReward}`);
      persistSave();
    }
    if (ev.completed) {
      state.money += ev.reward;
      audio.jingle();
      toast(`SHUTTERBUG DONE — all three spots: +$${ev.reward} bonus`);
      if (!missions.current()) toast('ALL JOBS DONE — Solmar City is yours!');
      persistSave();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
});

// Mouse orbit: drag to look around. Wheel zooms the chase camera.
// Click (on foot, pistol owned) fires the pistol.
let dragging = false;
let lastX = 0;
let lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  if (state.mode === 'story') { story.advance(); return; }
  if (state.mode === 'playing' && !state.inCar && weapons.owned) fireShot();
});
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
  if (state.inBoat) {
    exitBoat(false);
    return;
  }
  if (state.inCar) {
    exitCar(false);
    return;
  }
  const boat = boats.nearest(player.pos, 6);
  if (boat) { enterBoat(boat); return; }
  const car = nearestCar(cars, player.pos, 4.5);
  if (car) enterCar(car);
}

/** Board a boat: Mara stands on deck, the boat answers the throttle. */
function enterBoat(boat) {
  state.inBoat = true;
  state.boat = boat;
  boat.driven = true;
  player.group.visible = false;
  toast(`${boat.name} — W throttle, A/D rudder, E to step ashore.`);
}

/** Step ashore from a boat, onto the nearest dry land. */
function exitBoat(silent) {
  if (!state.boat) return;
  const boat = state.boat;
  boat.driven = false;
  boat.speed = 0;
  const shore = boats.shorePoint(boat.pos);
  player.pos.copy(shore);
  player.group.position.copy(player.pos);
  player.group.visible = true;
  state.inBoat = false;
  state.boat = null;
  if (!silent) state.cameraYaw = boat.heading + Math.PI;
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
  customization.applyTo(car);
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
  const focus = state.inBoat ? state.boat.pos : state.inCar ? state.car.pos : player.pos;
  const focusY = state.inCar || state.inBoat ? 1.6 : 1.7;
  // Ease the orbit yaw toward the car's (or boat's) heading while driving.
  if (state.inCar || state.inBoat) {
    const heading = state.inCar ? state.car.heading : state.boat.heading;
    const behind = heading + Math.PI;
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
    enterBoat,
    exitBoat,
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
  });
  if (shotName === 'menu') {
    // Menu pose keeps the start screen visible over a sunset vista.
    state.cameraMode = 'fixed';
  } else if (state.cameraMode === 'chase') {
    state.cameraMode = 'chase';
  }
} else {
  daynight.setHours(10);
  showScreen('start-screen');
  // Slow menu orbit behind the start screen.
  state.cameraMode = 'fixed';
  state.fixedCam = { pos: new THREE.Vector3(60, 34, 90), look: new THREE.Vector3(0, 14, 0) };
  // Offer Continue when a save exists.
  if (hasSave() && savedGame) {
    wasted.timesWasted = savedGame.timesWasted || 0;
    wasted.timesBusted = savedGame.timesBusted || 0;
    const btn = document.getElementById('continue-button');
    const note = document.getElementById('save-note');
    if (btn) {
      btn.style.display = 'inline-block';
      btn.addEventListener('click', () => startGame(true));
    }
    if (note) {
      note.style.display = 'block';
      const stats = wasted.statsText();
      note.textContent = `Saved progress: $${savedGame.money.toLocaleString('en-US')} · ${savedGame.missionsCompleted}/9 jobs done${stats ? ' · ' + stats : ''}.`;
    }
  }
}

document.getElementById('start-button').addEventListener('click', () => startGame(false));
document.getElementById('resume-button').addEventListener('click', togglePause);
document.getElementById('restart-button').addEventListener('click', () => {
  player.pos.set(0, 0, -20);
  player.group.position.copy(player.pos);
  if (state.car) exitCar(true);
  if (state.boat) exitBoat(true);
  state.health = state.maxHealth;
  police.setWanted(0, player.pos);
  missions.restartCurrent();
  maybeStartNight();
  state.mode = 'playing';
  showScreen(null);
});

// Debug handle for headless probes (CDP): window.__solmar.
window.__solmar = { state, missions, police, traffic, peds, player, cars, weapons, daynight, wasted, weather, collectibles, boats, island, gangs, customization, story, fishing, races, housing, casino, delivery, pets };

// --- main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  try {
    if (state.mode === 'playing') {
      state.playTime += dt;
      // Screenshot poses hold the throttle so the drive shot stays in motion.
      if (isShot && shotName === 'drive') input.forward = true;
      // Day/night clock runs in play (frozen for screenshot poses, whose
      // stage sets the hour directly) and the pistol animates its tracer.
      if (!isShot) daynight.update(dt);
      weapons.update(dt);
      story.update(dt);
      player.aiming = weapons.owned && !state.inCar && !state.inBoat;
      if (state.inBoat && state.boat) {
        boats.update(dt, input, state.boat, clock.elapsedTime, audio);
      } else if (state.inCar && state.car) {
        boats.update(dt, input, null, clock.elapsedTime, audio);
        updateCar(state.car, dt, input, city.colliders, CITY.bound, weather.gripFactor());
      } else {
        boats.update(dt, input, null, clock.elapsedTime, audio);
        updatePlayer(player, dt, input, state.cameraYaw, city.colliders, CITY.bound);
      }
      island.update(dt, daynight.hours);
      state.nearCar = state.inCar || state.inBoat ? null : nearestCar(cars, player.pos, 4.5);
      state.nearBoat = state.inCar || state.inBoat ? null : boats.nearest(player.pos, 6);
      state.nearGarage = !state.inCar && !state.inBoat && customization.nearGarage(player.pos);
      state.nearShop = !state.inCar && weapons.nearShop(player.pos);

      // --- gangs: turf claims, passive income, rival fists ---------------
      const focusPos = state.inBoat ? state.boat.pos : state.inCar ? state.car.pos : player.pos;
      const gangEvents = gangs.update(dt, focusPos, state.inCar, state.inBoat);
      if (gangEvents.claimed) {
        audio.jingle();
        toast(`TURF TAKEN — the ${gangEvents.claimedName} turf is Mara's now. +$50/min.`);
        persistSave();
      }
      if (gangEvents.income > 0) {
        state.money += gangEvents.income;
        toast(`Turf income — +$${gangEvents.income} from Mara's turf.`);
        persistSave();
      }
      if (gangEvents.damage > 0) {
        state.health -= gangEvents.damage;
        audio.thud();
        toast('Rival gang member landed a hit!');
      }
      if (missions.current() && missions.current().kind === 'turf') gangs.armTurfMission();

      // --- the living city -------------------------------------------------
      traffic.update(dt, {
        playerCar: state.car,
        playerPos: focusPos,
        playerInCar: state.inCar,
        parkedCars: cars,
        grip: weather.gripFactor(),
      });
      if (traffic.horn) {
        traffic.horn = false;
        audio.horn();
      }
      peds.update(dt, {
        playerPos: player.pos,
        playerCar: state.car,
        playerInCar: state.inCar,
        trafficCars: traffic.cars,
        policeCars: police.cars,
        gunshotPos: weapons.lastShotPos,
        raining: weather.raining,
      });
      weapons.lastShotPos = null; // consumed: peds flee once per shot
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
      if (state.wanted === 0 && state.health > 0 && state.health < state.maxHealth) state.health = Math.min(state.maxHealth, state.health + 2 * dt);
      if (state.health <= 0) handleWasted();

      // --- missions ----------------------------------------------------------
      const missionEvents = missions.update(dt, focusPos, { inBoat: state.inBoat });
      if (missionEvents.fareDone) {
        state.money += missionEvents.fareReward;
        audio.chime();
        toast(`Fare paid — +$${missionEvents.fareReward}`);
        persistSave();
      }
      if (missionEvents.pickup) {
        audio.thud();
        toast('Crate aboard — roadblocks up ahead, the law is on you!');
      }
      if (missionEvents.pickup && missionEvents.heat > 0) {
        // Smuggler's pickup heat (job-start heat still pays in the
        // completed branch below — this one is only for the crate lift).
        police.addHeat(missionEvents.heat, focusPos);
      }
      if (missionEvents.completed) {
        state.money += missionEvents.reward;
        audio.jingle();
        toast(`JOB DONE — ${missionEvents.completed.title}: +$${missionEvents.reward}`);
        if (missionEvents.heat > 0) {
          police.addHeat(missionEvents.heat, focusPos);
          toast('The law is on you — deliver it anyway!');
        }
        if (missions.current() && missions.current().night) {
          daynight.setHours(21);
          toast('Night falls — the Night Run starts after dark.');
        }
        // Jobs 4, 7 and 10 open with a cutscene; the next one plays now.
        if (missions.current() && STORY_JOBS.includes(missions.index)) {
          maybeShowStory(missions.index);
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

      // --- weather + hidden packages ----------------------------------------
      weather.update(dt, focusPos, audio);
      const packEvents = collectibles.update(dt, focusPos, daynight.hours);
      if (packEvents.collected > 0) {
        state.money += packEvents.collected * 100;
        audio.chime();
        toast(`Hidden package found — +$${packEvents.collected * 100} (${collectibles.count}/15)`);
        persistSave();
      }
      if (packEvents.bonus) {
        state.money += 1000;
        audio.jingle();
        toast('ALL 15 PACKAGES — $1,000 completion bonus!');
        persistSave();
      }

      // --- Phase 6: side hustles -------------------------------------------
      // Fishing: the bobber, the bite window, the golden-hour Koi.
      fishing.update(dt, { playerPos: player.pos, goldenHour: daynight.isGoldenHour(), seaBreeze: weather.seaBreeze() });
      // Street races: countdown calls, gate calls, and the prize.
      const raceEv = races.update(dt, state.inCar ? state.car.pos : null, state.inCar);
      if (raceEv && raceEv.countdown) toast(raceEv.countdown);
      if (raceEv && raceEv.gate) toast(`Gate ${raceEv.gate}/${races.route.gates.length} — keep it flat!`);
      if (raceEv && raceEv.abandoned) toast(races.lastResult);
      if (raceEv && raceEv.finished) {
        state.money += raceEv.prize;
        audio.jingle();
        toast(races.lastResult);
        persistSave();
      }
      // Courier runs: delivery pays, expiry costs nothing but the parcel.
      const delEv = delivery.update(dt, focusPos);
      if (delEv && delEv.delivered) {
        state.money += delEv.pay;
        audio.chime();
        toast(delivery.lastResult);
        persistSave();
      }
      if (delEv && delEv.failed) {
        audio.thud();
        toast(delivery.lastResult);
      }
      // Biscuit: follows Mara, barks at gang members, sniffs packages.
      pets.update(dt, player.pos, player.moving);
      // The stray adopts Mara the first time she walks up to him (after
      // the opening cutscenes have had their moment — 15s in).
      if (!isShot && state.playTime > 15 && Math.hypot(player.pos.x - pets.pos.x, player.pos.z - pets.pos.z) < 7) {
        if (story.showBiscuit(() => { state.mode = 'playing'; })) state.mode = 'story';
      }

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
    // The WASTED overlay counts down outside the playing state.
    if (state.mode === 'wasted') wasted.update(dt);
  } catch (err) {
    window.__shotError = String(err && err.message ? err.message : err);
  }
  updateCamera(dt);
  // Phase 6: the hint bar and the side line follow the nearest hustle —
  // the pier, the casino door, a depot, a house door, or the race flag.
  const houseAt = !state.inCar && !state.inBoat ? housing.doorAt(player.pos) : null;
  const phase6Hint = !state.inCar && !state.inBoat ? (
    housing.inside ? 'E — step out of the house' :
    houseAt ? housing.promptText(houseAt) :
    fishing.nearPier(player.pos) ? fishing.promptText() :
    casino.nearCasino(player.pos) ? casino.promptText() :
    delivery.nearDepot(player.pos) ? delivery.promptText() :
    pets.pointing ? 'Biscuit is on a scent — follow him!' : ''
  ) : (state.inCar && state.car && races.nearStart(state.car.pos) && !races.active ? races.promptText() : '');
  const sideParts = [];
  if (races.active) sideParts.push(races.statusText());
  else if (fishing.state !== 'idle') sideParts.push(fishing.statusText());
  else if (delivery.job) sideParts.push(delivery.statusText());
  else if (casino.hiLo) sideParts.push(casino.statusText());
  else {
    const t = housing.statusText() || pets.statusText() || casino.statusText() || fishing.statusText() || delivery.statusText() || races.statusText();
    if (t) sideParts.push(t);
  }
  if (police.ramming) sideParts.push('3-STAR RAM RUN!');
  hud.update({
    health: state.health,
    money: state.money,
    wanted: state.wanted,
    objective: state.objective,
    objectivePos: state.objectivePos,
    inCar: state.inCar,
    inBoat: state.inBoat,
    boatSpeed: state.boat ? boats.speedKmh(state.boat) : 0,
    speed: state.inCar ? state.car.speed : 0,
    playerPos: state.inBoat ? state.boat.pos : state.inCar ? state.car.pos : player.pos,
    heading: state.inBoat ? state.boat.heading : state.inCar ? state.car.heading : player.heading,
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
    stationText: audio.stationName(),
    packageDots: collectibles.nearby(state.inCar ? state.car.pos : player.pos),
    turfText: `Turf ${gangs.ownedCount()}/3`,
    island: ISLAND_BOUNDS,
    lighthousePos: LIGHTHOUSE_POS,
    lighthouseLit: island.isLit(),
    turfZones: gangs.zones,
    boats: boats.boats,
    garagePos: customization.garagePos,
    sideText: sideParts.join(' · '),
    phase6Hint,
    ramming: police.ramming,
    phase6Markers: [...fishing.markers(), ...races.markers(), ...housing.markers(), ...casino.markers(), ...delivery.markers(), ...pets.markers()],
  });
  renderer.render(scene, camera);
  framesRendered++;
  if (isShot && framesRendered === 40) {
    window.__shotReady = true;
  }
}
frame();
