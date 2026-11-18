// Weather: a living sky over Solmar City — clear sun, rain, and storms.
// The cycle drifts on its own (clear -> rain -> storm -> clear) on timers
// Mara never controls, so the same street can be dry at noon and slick by
// dusk. Rain falls as a particle curtain that follows the player, the
// roads darken into a wet sheen, lightning strobes the sky during storms
// with a thunder rumble, and wet asphalt costs grip: cars accelerate and
// steer a little worse in the rain, traffic slows, and pedestrians hurry.
// Screenshot poses force a mode with setMode(); the HUD reads iconText().
import * as THREE from 'three';
import { clamp01, chance } from './utils.js';

export const WEATHER_MODES = ['clear', 'rain', 'storm'];

const WEATHER_ICON = { clear: '☀ CLEAR', rain: '☂ RAIN', storm: '⚡ STORM' };
const DRY_ROAD = 0x3a3f46;
const WET_ROAD = 0x20242a;
const RAIN_DROPS = 700;

/** Build the weather system. city must carry roadMat (city.js returns it). */
export function createWeather(scene, city, daynight) {
  const weather = {
    mode: 'clear',
    rainLevel: 0, // 0 dry -> 1 pouring; eases toward the mode's target
    timer: 0,
    duration: 60 + Math.random() * 30,
    flash: 0, // lightning brightness, 1 at the strike, decays after
    flashHold: 0,
    nextBolt: 5 + Math.random() * 4,
    dryRoad: new THREE.Color(DRY_ROAD),
    wetRoad: new THREE.Color(WET_ROAD),
  };

  // --- rain curtain: points falling in a box that rides with the player --
  const positions = new Float32Array(RAIN_DROPS * 3);
  for (let i = 0; i < RAIN_DROPS; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 1] = Math.random() * 32;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xbfd9ee,
    size: 0.28,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  // --- lightning: a white directional light that only fires on a strike --
  const bolt = new THREE.DirectionalLight(0xdfeaff, 0);
  bolt.position.set(80, 220, -40);
  scene.add(bolt);

  /** Pick the next mode in the cycle (storms only ever follow rain). */
  function nextMode() {
    if (weather.mode === 'clear') return chance(Math.random, 0.55) ? 'rain' : 'clear';
    if (weather.mode === 'rain') return chance(Math.random, 0.35) ? 'storm' : 'clear';
    return 'clear'; // storms always break back to clear skies
  }

  /** Force a mode (screenshot poses). Snaps the rain in at once. */
  function setMode(mode) {
    if (!WEATHER_MODES.includes(mode)) return;
    weather.mode = mode;
    weather.timer = 0;
    weather.duration = 120; // posed weather holds for the whole shot
    weather.rainLevel = mode === 'clear' ? 0 : 1;
    weather.nextBolt = 2 + Math.random() * 3;
  }

  /** Fire a lightning strike now (night pose): full flash, held a beat. */
  function flashNow() {
    weather.flash = 1;
    weather.flashHold = 1.4;
  }

  /** Grip factor for the driving model: wet roads slide. */
  function gripFactor() {
    return 1 - 0.24 * weather.rainLevel;
  }

  function iconText() {
    return WEATHER_ICON[weather.mode];
  }

  function update(dt, focusPos, audio) {
    // --- the cycle: drift from mode to mode on a slow timer -------------
    weather.timer += dt;
    if (weather.timer >= weather.duration) {
      weather.mode = nextMode();
      weather.timer = 0;
      weather.duration = weather.mode === 'clear'
        ? 55 + Math.random() * 40
        : weather.mode === 'rain' ? 30 + Math.random() * 25 : 22 + Math.random() * 18;
      weather.nextBolt = 3 + Math.random() * 5;
    }
    // Rain eases in and out instead of snapping on.
    const target = weather.mode === 'clear' ? 0 : 1;
    weather.rainLevel = clamp01(weather.rainLevel + (target - weather.rainLevel) * Math.min(1, dt * 0.6));
    weather.raining = weather.rainLevel > 0.4;

    // --- the curtain follows Mara and falls ------------------------------
    if (weather.rainLevel > 0.02) {
      rain.visible = true;
      rainMat.opacity = 0.75 * weather.rainLevel;
      rain.position.set(focusPos.x, 0, focusPos.z);
      const pos = rainGeo.attributes.position.array;
      const fall = (26 + 14 * weather.rainLevel) * dt;
      for (let i = 0; i < RAIN_DROPS; i++) {
        let y = pos[i * 3 + 1] - fall;
        if (y < 0) {
          y = 30 + Math.random() * 2;
          pos[i * 3] = (Math.random() - 0.5) * 70;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
        }
        pos[i * 3 + 1] = y;
      }
      rainGeo.attributes.position.needsUpdate = true;
    } else {
      rain.visible = false;
    }

    // --- wet sheen: roads darken as the rain soaks in --------------------
    if (city.roadMat) {
      city.roadMat.color.copy(weather.dryRoad).lerp(weather.wetRoad, weather.rainLevel);
    }
    // Storms dim the sun on top of the day/night cycle (daynight.js reads
    // stormDim when it applies the light for the hour).
    if (daynight) daynight.stormDim = weather.mode === 'storm' ? weather.rainLevel : 0;

    // --- lightning: random strikes in a storm, thunder on the strike -----
    if (weather.mode === 'storm') {
      weather.nextBolt -= dt;
      if (weather.nextBolt <= 0) {
        weather.nextBolt = 4 + Math.random() * 6;
        weather.flash = 1;
        weather.flashHold = 0.25;
        if (audio && audio.thunder) audio.thunder();
      }
    }
    if (weather.flashHold > 0) {
      weather.flashHold -= dt;
    } else if (weather.flash > 0) {
      weather.flash = Math.max(0, weather.flash - dt * 1.6);
    }
    bolt.intensity = weather.flash * 3.2;
  }

  weather.setMode = setMode;
  weather.flashNow = flashNow;
  weather.gripFactor = gripFactor;
  weather.iconText = iconText;
  weather.update = update;
  weather.raining = false;
  return weather;
}
