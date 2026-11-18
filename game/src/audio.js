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
  };

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
    } catch { /* never break the game for sound */ }
  }

  audio.unlock = unlock;
  audio.toggleMute = toggleMute;
  audio.chime = chime;
  audio.jingle = jingle;
  audio.thud = thud;
  audio.update = update;
  return audio;
}
