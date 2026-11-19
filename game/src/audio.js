// Sound: fully procedural WebAudio for Solmar City — no audio files,
// no network. One lazy AudioContext holds the master gain plus three
// persistent voices (car engine, boat engine + spray, police siren) and
// every one-shot effect is a short oscillator blip. If the browser has
// no audio (headless runs), the context stays null and every call is a
// safe no-op — sound is garnish, it must never break the game.

// The car radio: two stations, each a tempo, a looping bass line and a
// flavour (hats on SOLMAR FM, a slow pad chord on NIGHT TIDE).
const STATIONS = [
  null,
  {
    name: 'SOLMAR FM — Bassline', bpm: 126,
    bass: [55, 0, 65.41, 0, 49, 0, 58.27, 73.42],
    hat: true, pad: null,
  },
  {
    name: 'NIGHT TIDE — Synth', bpm: 84,
    bass: [110, 0, 0, 0, 87.31, 0, 0, 0],
    hat: false, pad: [220, 261.63, 329.63],
  },
];

/** Create the audio system. All state lives on the returned object so
 *  the game can read the engine / siren / radio voices directly. */
export function createAudio() {
  const audio = {
    muted: false,
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    boatEngineOsc: null,
    boatEngineGain: null,
    boatNoiseGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    stepTimer: 0,
    radioStation: 0, // 0 = off, 1 = SOLMAR FM, 2 = NIGHT TIDE
    radioStep: 0,
    radioTimer: 0,
  };

  /** Build (once) the context, the master gain and the three persistent
   *  voices, all silent at first. Resume a suspended context. */
  function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      return audio.ctx;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = audio.muted ? 0 : 0.5;
      master.connect(ctx.destination);

      // Car engine: sawtooth through a low-pass, its own gain.
      const engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      // Boat engine: triangle, plus looped white noise through a
      // band-pass for the spray — two gains, one voice each.
      const boatEngineOsc = ctx.createOscillator();
      boatEngineOsc.type = 'triangle';
      boatEngineOsc.frequency.value = 42;
      const boatEngineGain = ctx.createGain();
      boatEngineGain.gain.value = 0;
      boatEngineOsc.connect(boatEngineGain);
      boatEngineGain.connect(master);
      boatEngineOsc.start();
      const noiseLen = ctx.sampleRate;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const sprayFilter = ctx.createBiquadFilter();
      sprayFilter.type = 'bandpass';
      sprayFilter.frequency.value = 320;
      sprayFilter.Q.value = 0.8;
      const boatNoiseGain = ctx.createGain();
      boatNoiseGain.gain.value = 0;
      noise.connect(sprayFilter);
      sprayFilter.connect(boatNoiseGain);
      boatNoiseGain.connect(master);
      noise.start();

      // Police siren: a sine wobbled by a slow square LFO.
      const sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      const sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      const sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 1.6;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 220;
      sirenLfo.connect(lfoDepth);
      lfoDepth.connect(sirenOsc.frequency);
      sirenLfo.start();

      audio.ctx = ctx;
      audio.master = master;
      audio.engineOsc = engineOsc;
      audio.engineGain = engineGain;
      audio.boatEngineOsc = boatEngineOsc;
      audio.boatEngineGain = boatEngineGain;
      audio.boatNoiseGain = boatNoiseGain;
      audio.sirenOsc = sirenOsc;
      audio.sirenGain = sirenGain;
      audio.sirenLfo = sirenLfo;
      return ctx;
    } catch {
      // No audio here (headless): stay null, every sound stays silent.
      audio.ctx = null;
      return null;
    }
  }

  /** One-shot note: an oscillator with a gain envelope that decays to
   *  silence just after the duration. `when` delays it in seconds. */
  function blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!audio.ctx || !audio.master) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, vol), t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Unlock audio (start button / first keypress — headless screenshot
   *  runs never call this, so they stay silent). */
  function unlock() {
    ensure();
  }

  /** Flip mute, retune the master gain, return the new muted state. */
  function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master && audio.ctx) {
      audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
    }
    return audio.muted;
  }

  // --- one-shot effects (each ensures the context first) ---
  function chime() {
    ensure();
    blip(660, 0.25, 'sine', 0.2);
    blip(990, 0.35, 'sine', 0.2, 0.12);
  }

  function jingle() {
    ensure();
    [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.22, 'triangle', 0.22, i * 0.11));
  }

  function thud() {
    ensure();
    blip(90, 0.18, 'sine', 0.3);
    blip(60, 0.25, 'sine', 0.25, 0.02);
  }

  function gunshot() {
    ensure();
    blip(180, 0.12, 'square', 0.3);
    blip(90, 0.18, 'sawtooth', 0.25, 0.01);
  }

  function dryClick() {
    ensure();
    blip(1200, 0.05, 'square', 0.15);
  }

  function reloadClick() {
    ensure();
    blip(900, 0.06, 'square', 0.18);
    blip(700, 0.06, 'square', 0.18, 0.09);
  }

  function horn() {
    ensure();
    blip(370, 0.25, 'square', 0.2);
    blip(466, 0.25, 'square', 0.2, 0.02);
  }

  function thunder() {
    ensure();
    blip(48, 1.2, 'sine', 0.35);
    blip(62, 1.0, 'sine', 0.25, 0.1);
    blip(38, 1.4, 'sine', 0.3, 0.05);
  }

  function shutter() {
    ensure();
    blip(2200, 0.05, 'square', 0.2);
    blip(1300, 0.05, 'square', 0.2, 0.08);
  }

  function splash() {
    ensure();
    blip(320, 0.2, 'sine', 0.2);
    blip(180, 0.25, 'sine', 0.18, 0.08);
    blip(520, 0.15, 'sine', 0.15, 0.16);
  }

  function dogBark() {
    ensure();
    blip(740, 0.09, 'square', 0.22);
    blip(660, 0.09, 'square', 0.22, 0.14);
  }

  /** Drive the boat engine voice: gain rises with speed, pitch climbs
   *  from 42 Hz, spray follows the wake. Silent (or no boat) is 0.
   *  Every change eases over ~0.15–0.2s. */
  function setBoatEngine(speed01) {
    if (!audio.ctx) return;
    const s = Math.max(0, Math.min(1, speed01 || 0));
    const moving = s > 0.02;
    const t = audio.ctx.currentTime;
    audio.boatEngineGain.gain.setTargetAtTime(moving ? 0.03 + 0.05 * s : 0, t, 0.15);
    audio.boatEngineOsc.frequency.setTargetAtTime(42 + 55 * s, t, 0.15);
    audio.boatNoiseGain.gain.setTargetAtTime(moving ? 0.025 * s : 0, t, 0.2);
  }

  /** Cycle off → SOLMAR FM → NIGHT TIDE → off. Returns the new
   *  station's name ('' when off). */
  function toggleStation() {
    audio.radioStation = (audio.radioStation + 1) % STATIONS.length;
    audio.radioStep = 0;
    audio.radioTimer = 0;
    return stationName();
  }

  /** The current station's name, or '' when the radio is off. */
  function stationName() {
    const st = STATIONS[audio.radioStation];
    return st ? st.name : '';
  }

  /** Play one radio step: the bass note for this step (0s are rests),
   *  a hat tick on odd steps for SOLMAR FM, and the slow pad chord on
   *  the first beat of each bar for NIGHT TIDE. */
  function radioStep() {
    const st = STATIONS[audio.radioStation];
    if (!st) return;
    const note = st.bass[audio.radioStep % st.bass.length];
    if (note) blip(note, 0.22, 'triangle', 0.22);
    if (st.hat && audio.radioStep % 2 === 1) blip(6000, 0.03, 'square', 0.06);
    if (st.pad && audio.radioStep % st.bass.length === 0) {
      for (const f of st.pad) blip(f, 1.6, 'sine', 0.07);
    }
    audio.radioStep += 1;
  }

  /** Per-frame audio: engine hum follows the driven car's speed, the
   *  siren wails while wanted, footsteps tick while Mara walks or runs
   *  on foot, and the radio steps on eighth notes — only while driving.
   *  No context (or muted) means nothing to do. */
  function update(dt, s = {}) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const speed = Math.abs(s.speed || 0);
    const inCar = s.inCar === true;
    const wanted = s.wanted || 0;
    // Engine: a floor of 0.05 plus up to 0.12 with speed, in a car only;
    // pitch climbs 5 Hz per unit of speed from 55 Hz.
    const engineTarget = inCar ? 0.05 + 0.12 * Math.min(1, speed / 30) : 0;
    audio.engineGain.gain.setTargetAtTime(engineTarget, t, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(55 + 5 * speed, t, 0.1);
    // Siren: a steady 0.05 while the law is after Mara.
    audio.sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.05 : 0, t, 0.2);
    // Footsteps on foot: a soft tick every ~0.32s running, ~0.45s walking.
    if (!inCar && s.moving) {
      audio.stepTimer -= dt;
      if (audio.stepTimer <= 0) {
        audio.stepTimer = s.running ? 0.32 : 0.45;
        blip(140, 0.05, 'sine', 0.08);
      }
    }
    // Radio: only while driving, stepped on eighth notes of the tempo.
    if (inCar && audio.radioStation > 0) {
      const eighth = 60 / STATIONS[audio.radioStation].bpm / 2;
      audio.radioTimer -= dt;
      if (audio.radioTimer <= 0) {
        audio.radioTimer += eighth;
        radioStep();
      }
    } else {
      audio.radioTimer = 0;
    }
  }

  audio.unlock = unlock;
  audio.toggleMute = toggleMute;
  audio.chime = chime;
  audio.jingle = jingle;
  audio.thud = thud;
  audio.gunshot = gunshot;
  audio.dryClick = dryClick;
  audio.reloadClick = reloadClick;
  audio.horn = horn;
  audio.setBoatEngine = setBoatEngine;
  audio.thunder = thunder;
  audio.shutter = shutter;
  audio.splash = splash;
  audio.dogBark = dogBark;
  audio.toggleStation = toggleStation;
  audio.stationName = stationName;
  audio.update = update;
  return audio;
}
