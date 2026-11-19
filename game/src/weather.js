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

  // --- rain ripples: expanding rings where drops hit the bay ------------
  // A small recycled pool (≤12) of flat rings on the water near the
  // player; each grows, fades, and is reused. Cheap: no new meshes per
  // frame, and they only run while it is actually raining.
  const RIPPLE_MAX = 12;
  const ripples = [];
  for (let i = 0; i < RIPPLE_MAX; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0xcfe8f7, transparent: true, opacity: 0, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.visible = false;
    scene.add(ring);
    ripples.push({ mesh: ring, life: 0 });
  }
  let rippleCursor = 0;
  let rippleTimer = 0;

  /** Spawn + grow the rain rings on the bay surface near the player. */
  function updateRainRipples(dt, focusPos) {
    if (weather.rainLevel <= 0.4) {
      for (const r of ripples) { r.life = 0; r.mesh.visible = false; }
      return;
    }
    rippleTimer -= dt;
    if (rippleTimer <= 0) {
      rippleTimer = 0.12 + Math.random() * 0.1;
      const r = ripples[rippleCursor];
      rippleCursor = (rippleCursor + 1) % ripples.length;
      // Drops land on water: keep the ring on the bay (z >= 260), even
      // when Mara herself is standing on the beach or the pier.
      r.mesh.position.set(
        Math.max(-260, Math.min(260, focusPos.x + (Math.random() - 0.5) * 30)),
        0.12,
        Math.max(260, Math.min(460, focusPos.z + (Math.random() - 0.5) * 24)),
      );
      r.mesh.visible = true;
      r.life = 1;
    }
    for (const r of ripples) {
      if (r.life <= 0) continue;
      r.life -= dt * 1.4;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const s = 1 + (1 - r.life) * 3.2;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = 0.55 * r.life * weather.rainLevel;
    }
  }

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

  /**
   * Phase 6: the sea breeze off the bay, 0 (calm) to 1 (storm) — the
   * fishing bobber drifts on it, and the pier feels it before the city.
   */
  function seaBreeze() {
    return { storm: 1, rain: 0.7, clear: 0.3 }[weather.mode] ?? 0.3;
  }

  function iconText() {
    return WEATHER_ICON[weather.mode] ?? '☀ CLEAR';
  }

  /**
   * Phase 7: seconds until the sky changes its mind — the cycle timer
   * counting down — so a driver can tell whether the rain is about to
   * break before the next corner.
   */
  function nextChangeIn() {
    return Math.max(0, Math.round(weather.duration - weather.timer));
  }

  /**
   * Phase 7: what the sky is turning into next — clear follows rain and
   * storms, rain follows clear, and only rain ever turns into a storm.
   */
  function forecast() {
    return { clear: 'rain or clear skies', rain: 'a storm, or clearing up', storm: 'clear skies' }[weather.mode];
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
    // Rings where the rain hits the bay, riding with the player.
    updateRainRipples(dt, focusPos);

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
        // Phase 7: the bolt wanders — each strike relights the sky from
        // a new point over the city, so the strobe never comes from the
        // same corner twice in a row.
        bolt.position.set(-200 + Math.random() * 400, 220, -200 + Math.random() * 400);
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

  Object.assign(weather, { setMode, flashNow, gripFactor, seaBreeze, iconText, nextChangeIn, forecast, update, updateRainRipples });
  weather.raining = false;
  return weather;
}
