// Audio: fully procedural WebAudio sound — no audio files, no network.
// Engine hum follows the car's speed, a two-tone siren wails while the
// player is wanted, and pickups / mission completions play little jingles.
// The context is created lazily on the first user gesture (the start
// button), so headless screenshot runs stay silent. M toggles mute.
export function createAudio() {
  const audio = {
    muted: false,
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    stepTimer: 0,
    // Phase 4 — car radio: 0 off, 1 SOLMAR FM (bassline + hats), 2 NIGHT
    // TIDE (slow synth pads). Q cycles the station while driving.
    radioStation: 0,
    radioStep: 0,
    radioTimer: 0,
  };

  // Radio stations: name, tempo, and the notes each one leans on.
  const RADIO = [
    null,
    { name: 'SOLMAR FM — Bassline', bpm: 126, bass: [55, 0, 65.41, 0, 49, 0, 58.27, 73.42] },
    { name: 'NIGHT TIDE — Synth', bpm: 84, bass: [110, 0, 0, 0, 87.31, 0, 0, 0], pad: [220, 261.63, 329.63] },
  ];

  function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const engineFilter = audio.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      audio.engineOsc.connect(engineFilter);
      engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      // Siren: a sine that wails between two tones via an LFO.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 750;
      audio.sirenLfo = audio.ctx.createOscillator();
      audio.sirenLfo.type = 'square';
      audio.sirenLfo.frequency.value = 1.6;
      const lfoGain = audio.ctx.createGain();
      lfoGain.gain.value = 220;
      audio.sirenLfo.connect(lfoGain);
      lfoGain.connect(audio.sirenOsc.frequency);
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.sirenLfo.start();
    } catch {
      audio.ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.25, when = 0) {
    if (!audio.ctx) return;
    try {
      const t = audio.ctx.currentTime + when;
      const osc = audio.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = audio.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* sound is garnish, never fatal */ }
  }

  /** Call on the start button / first keypress: unlocks the context. */
  function unlock() { ensure(); }

  function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    return audio.muted;
  }

  /** Cash pickup / small reward chime: two rising notes. */
  function chime() {
    ensure();
    blip(660, 0.12);
    blip(990, 0.18, 'sine', 0.25, 0.1);
  }

  /** Mission complete jingle: a four-note rising arpeggio. */
  function jingle() {
    ensure();
    [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.22, 'triangle', 0.28, i * 0.11));
  }

  /** Dull thud for a crash or a punch landing. */
  function thud() {
    ensure();
    blip(90, 0.18, 'sine', 0.4);
    blip(60, 0.22, 'triangle', 0.3, 0.02);
  }

  /** Pistol shot: a sharp crack (noise burst via a fast square blip). */
  function gunshot() {
    ensure();
    blip(180, 0.09, 'square', 0.4);
    blip(90, 0.14, 'sawtooth', 0.3, 0.01);
  }

  /** Dry click when the magazine is empty. */
  function dryClick() {
    ensure();
    blip(1200, 0.04, 'square', 0.12);
  }

  /** Reload click-clack: two short metallic ticks. */
  function reloadClick() {
    ensure();
    blip(900, 0.05, 'square', 0.15);
    blip(700, 0.05, 'square', 0.15, 0.18);
  }

  /** Car horn: two-tone beep, the sound of Solmar traffic losing patience. */
  function horn() {
    ensure();
    blip(370, 0.28, 'square', 0.16);
    blip(466, 0.28, 'square', 0.14);
  }

  /** Thunder: a low rumble that follows a lightning strike (storms). */
  function thunder() {
    ensure();
    blip(48, 1.4, 'sawtooth', 0.32);
    blip(62, 1.1, 'triangle', 0.22, 0.12);
    blip(38, 1.8, 'sine', 0.25, 0.3);
  }

  /** Camera shutter click for the Shutterbug job (C key). */
  function shutter() {
    ensure();
    blip(2200, 0.04, 'square', 0.18);
    blip(1300, 0.06, 'square', 0.14, 0.07);
  }

  /** Cycle the car radio: off -> SOLMAR FM -> NIGHT TIDE -> off. */
  function toggleStation() {
    ensure();
    audio.radioStation = (audio.radioStation + 1) % RADIO.length;
    audio.radioStep = 0;
    audio.radioTimer = 0;
    return stationName();
  }

  /** Current station name for the HUD ('' means the radio is off). */
  function stationName() {
    const st = RADIO[audio.radioStation];
    return st ? st.name : '';
  }

  /** One radio step: a bass note, a hat tick, or a pad chord. */
  function radioStep() {
    const st = RADIO[audio.radioStation];
    if (!st) return;
    const i = audio.radioStep % st.bass.length;
    const bassNote = st.bass[i];
    if (bassNote > 0) blip(bassNote, 0.22, 'triangle', 0.2);
    // Hats on the off-beats keep the bassline moving.
    if (audio.radioStation === 1 && audio.radioStep % 2 === 1) blip(6000, 0.03, 'square', 0.045);
    // NIGHT TIDE lays a slow pad over the first beat of each bar.
    if (audio.radioStation === 2 && audio.radioStep % 8 === 0 && st.pad) {
      for (const f of st.pad) blip(f, 1.6, 'sine', 0.05);
    }
    audio.radioStep += 1;
  }

  /**
   * Per-frame sound: engine pitch from speed, siren while wanted,
   * soft footsteps while Mara runs on foot.
   */
  function update(dt, s) {
    if (!audio.ctx || audio.muted) return;
    try {
      if (audio.engineOsc) {
        const target = s.inCar ? 0.05 + Math.min(0.12, Math.abs(s.speed) * 0.004) : 0;
        audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
        audio.engineOsc.frequency.setTargetAtTime(55 + Math.abs(s.speed) * 5, audio.ctx.currentTime, 0.1);
      }
      if (audio.sirenGain) {
        audio.sirenGain.gain.setTargetAtTime(s.wanted > 0 ? 0.05 : 0, audio.ctx.currentTime, 0.3);
      }
      if (s.moving && !s.inCar) {
        audio.stepTimer -= dt;
        if (audio.stepTimer <= 0) {
          audio.stepTimer = s.running ? 0.32 : 0.45;
          blip(140 + Math.random() * 40, 0.05, 'sine', 0.07);
        }
      }
      // Radio: only while driving, stepped on the station's tempo.
      if (s.inCar && audio.radioStation > 0) {
        const st = RADIO[audio.radioStation];
        audio.radioTimer -= dt;
        if (audio.radioTimer <= 0) {
          audio.radioTimer += 60 / st.bpm / 2; // eighth notes
          radioStep();
        }
      }
    } catch { /* never break the game for sound */ }
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
  audio.thunder = thunder;
  audio.shutter = shutter;
  audio.toggleStation = toggleStation;
  audio.stationName = stationName;
  audio.update = update;
  return audio;
}
