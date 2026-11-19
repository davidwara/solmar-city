// audio.js — fully procedural WebAudio sound for Solmar City.
//
// No audio files, no network: every sound is synthesized. The context is
// created lazily on the first unlock, and if the browser has no audio at
// all (headless screenshots) every call stays a safe no-op — sound is
// garnish and must never break the game.

const STATIONS = {
  1: { name: 'SOLMAR FM — Bassline', bpm: 126, bass: [55, 0, 65.41, 0, 49, 0, 58.27, 73.42] },
  2: { name: 'NIGHT TIDE — Synth', bpm: 84, bass: [110, 0, 0, 0, 87.31, 0, 0, 0], pad: [220, 261.63, 329.63] },
};

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
    radioStation: 0,
    radioStep: 0,
    radioTimer: 0,
    unlock,
    toggleMute,
    chime,
    jingle,
    thud,
    gunshot,
    dryClick,
    reloadClick,
    horn,
    setBoatEngine,
    thunder,
    shutter,
    splash,
    dogBark,
    toggleStation,
    stationName,
    radioStep,
    update,
  };

  /**
   * Build the AudioContext and the three persistent voices on first use:
   * the car engine (sawtooth through a low-pass), the boat engine
   * (triangle plus looped spray noise through a band-pass), and the
   * police siren (a sine wobbled by a slow square LFO). All start silent.
   */
  function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctor();
      audio.ctx = ctx;
      audio.master = ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(ctx.destination);

      // Car engine: sawtooth 55 Hz -> 420 Hz low-pass -> its own gain.
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      audio.engineGain = ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc = ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineOsc.connect(engineFilter);
      engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();

      // Boat engine: triangle 42 Hz -> its own gain.
      audio.boatEngineGain = ctx.createGain();
      audio.boatEngineGain.gain.value = 0;
      audio.boatEngineOsc = ctx.createOscillator();
      audio.boatEngineOsc.type = 'triangle';
      audio.boatEngineOsc.frequency.value = 42;
      audio.boatEngineOsc.connect(audio.boatEngineGain);
      audio.boatEngineGain.connect(audio.master);
      audio.boatEngineOsc.start();

      // Boat spray: looped white noise -> 320 Hz band-pass -> its own gain.
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const samples = noiseBuf.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const sprayFilter = ctx.createBiquadFilter();
      sprayFilter.type = 'bandpass';
      sprayFilter.frequency.value = 320;
      sprayFilter.Q.value = 0.8;
      audio.boatNoiseGain = ctx.createGain();
      audio.boatNoiseGain.gain.value = 0;
      noise.connect(sprayFilter);
      sprayFilter.connect(audio.boatNoiseGain);
      audio.boatNoiseGain.connect(audio.master);
      noise.start();

      // Siren: sine 750 Hz wobbled +-220 Hz by a 1.6 Hz square LFO.
      audio.sirenGain = ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc = ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 750;
      audio.sirenLfo = ctx.createOscillator();
      audio.sirenLfo.type = 'square';
      audio.sirenLfo.frequency.value = 1.6;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 220;
      audio.sirenLfo.connect(lfoDepth);
      lfoDepth.connect(audio.sirenOsc.frequency);
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.sirenLfo.start();
      return true;
    } catch (err) {
      audio.ctx = null;
      return false;
    }
  }

  /** One short note: oscillator + gain envelope decaying to silence. */
  function blip(freq, dur, type = 'sine', vol = 0.1, when = 0) {
    if (!audio.ctx || !audio.master) return;
    try {
      const t = audio.ctx.currentTime + when;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (err) {
      // A failed blip is never worth breaking the game over.
    }
  }

  function unlock() {
    ensure();
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    return audio.muted;
  }

  function chime() {
    if (!ensure()) return;
    blip(660, 0.25, 'sine', 0.12);
    blip(990, 0.35, 'sine', 0.12, 0.12);
  }

  function jingle() {
    if (!ensure()) return;
    [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.3, 'triangle', 0.12, i * 0.11));
  }

  function thud() {
    if (!ensure()) return;
    blip(90, 0.18, 'sine', 0.2);
    blip(60, 0.25, 'sine', 0.18, 0.02);
  }

  function gunshot() {
    if (!ensure()) return;
    blip(180, 0.12, 'square', 0.25);
    blip(90, 0.16, 'sawtooth', 0.2, 0.01);
  }

  function dryClick() {
    if (!ensure()) return;
    blip(1200, 0.05, 'square', 0.12);
  }

  function reloadClick() {
    if (!ensure()) return;
    blip(900, 0.06, 'square', 0.12);
    blip(700, 0.07, 'square', 0.12, 0.09);
  }

  function horn() {
    if (!ensure()) return;
    blip(370, 0.28, 'square', 0.1);
    blip(466, 0.28, 'square', 0.1, 0.02);
  }

  function thunder() {
    if (!ensure()) return;
    blip(48, 1.2, 'sine', 0.22);
    blip(62, 1.1, 'sine', 0.16, 0.05);
    blip(38, 1.3, 'sine', 0.2, 0.1);
  }

  function shutter() {
    if (!ensure()) return;
    blip(2200, 0.05, 'square', 0.1);
    blip(1300, 0.06, 'square', 0.1, 0.07);
  }

  function splash() {
    if (!ensure()) return;
    blip(320, 0.2, 'sine', 0.12);
    blip(180, 0.25, 'sine', 0.1, 0.08);
    blip(520, 0.15, 'sine', 0.08, 0.16);
  }

  function dogBark() {
    if (!ensure()) return;
    blip(740, 0.09, 'square', 0.14);
    blip(660, 0.1, 'square', 0.14, 0.12);
  }

  /** Boat throttle: engine hum + pitch rise with speed, spray on top. */
  function setBoatEngine(speed01) {
    if (!ensure()) return;
    const s = Math.max(0, Math.min(1, speed01 || 0));
    const t = audio.ctx.currentTime;
    audio.boatEngineGain.gain.setTargetAtTime(s > 0 ? 0.03 + 0.05 * s : 0, t, 0.15);
    audio.boatEngineOsc.frequency.setTargetAtTime(42 + 55 * s, t, 0.15);
    audio.boatNoiseGain.gain.setTargetAtTime(s > 0 ? 0.025 * s : 0, t, 0.15);
  }

  function toggleStation() {
    audio.radioStation = (audio.radioStation + 1) % 3;
    audio.radioStep = 0;
    audio.radioTimer = 0;
    return stationName();
  }

  function stationName() {
    const station = STATIONS[audio.radioStation];
    return station ? station.name : '';
  }

  /** Play one sequencer step: bass note, hat tick, pad chord. */
  function radioStep() {
    if (!audio.ctx || audio.radioStation === 0) return;
    const station = STATIONS[audio.radioStation];
    const step = audio.radioStep % 8;
    const bass = station.bass[step];
    if (bass) blip(bass, 0.22, audio.radioStation === 2 ? 'sawtooth' : 'triangle', 0.14);
    if (audio.radioStation === 1 && step % 2 === 1) blip(6500, 0.03, 'sine', 0.04);
    if (audio.radioStation === 2 && step === 0 && station.pad) {
      for (const f of station.pad) blip(f, 1.4, 'sine', 0.045);
    }
    audio.radioStep += 1;
  }

  /**
   * Per-frame voice mix. `s` carries inCar, speed, wanted, moving and
   * running from the main loop. Silent without a context or while muted.
   */
  function update(dt, s = {}) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const inCar = !!s.inCar;
    const speed = s.speed || 0;

    // Engine hum follows road speed; silent on foot.
    const engineTarget = inCar ? 0.05 + 0.12 * Math.min(1, speed / 30) : 0;
    audio.engineGain.gain.setTargetAtTime(engineTarget, t, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(55 + 5 * Math.min(speed, 30), t, 0.1);

    // Siren wails while any heat is on.
    audio.sirenGain.gain.setTargetAtTime((s.wanted || 0) > 0 ? 0.05 : 0, t, 0.1);

    // Footsteps on foot: quicker ticks while running.
    if (!inCar && s.moving) {
      audio.stepTimer += dt;
      const interval = s.running ? 0.32 : 0.45;
      if (audio.stepTimer >= interval) {
        audio.stepTimer = 0;
        blip(190, 0.05, 'sine', 0.06);
      }
    } else {
      audio.stepTimer = 0;
    }

    // Radio only while driving, stepped on eighth notes of the tempo.
    if (inCar && audio.radioStation > 0) {
      const station = STATIONS[audio.radioStation];
      const stepDur = 60 / station.bpm / 2;
      audio.radioTimer += dt;
      while (audio.radioTimer >= stepDur) {
        audio.radioTimer -= stepDur;
        radioStep();
      }
    } else {
      audio.radioTimer = 0;
    }
  }

  return audio;
}
