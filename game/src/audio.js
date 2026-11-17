// Synthesised sound: every effect is an oscillator or a noise burst
// shaped by hand, so the game ships zero audio assets. The context is
// created lazily on the first user gesture (browser autoplay policy).

export class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.ambientNodes = null;
    this.lastShootAt = 0;
  }

  // Call from a click or key handler; safe to call repeatedly.
  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.context.destination);
    const length = this.context.sampleRate * 1;
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.02);
    }
  }

  // A slow two-oscillator pad that sits under the action like deep
  // space hum; an LFO breathes its filter so it never feels static.
  startAmbient() {
    if (!this.context || this.ambientNodes) return;
    const ctx = this.context;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 2;
    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 82.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    lfo.start();
    this.ambientNodes = { gain, oscA, oscB, lfo };
  }

  tone({ type = 'square', from = 440, to = null, duration = 0.12, volume = 0.2, delay = 0 }) {
    if (!this.context) return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  noise({ duration = 0.3, volume = 0.3, filterFrom = 2400, filterTo = 120, delay = 0 }) {
    if (!this.context) return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, filterTo), start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start, Math.random());
    source.stop(start + duration + 0.02);
  }

  shoot() {
    if (!this.context) return;
    // Throttle: at full auto-fire a tone per bullet is a buzz saw.
    const now = performance.now();
    if (now - this.lastShootAt < 45) return;
    this.lastShootAt = now;
    this.tone({ type: 'square', from: 880, to: 220, duration: 0.09, volume: 0.07 });
  }

  explosion(size = 1) {
    this.noise({ duration: 0.25 + 0.2 * size, volume: 0.16 + 0.1 * size, filterFrom: 1800, filterTo: 90 });
    this.tone({ type: 'sine', from: 160, to: 40, duration: 0.3, volume: 0.16 });
  }

  playerHit() {
    this.tone({ type: 'sawtooth', from: 300, to: 70, duration: 0.25, volume: 0.22 });
    this.noise({ duration: 0.18, volume: 0.14, filterFrom: 3000, filterTo: 300 });
  }

  coreHit() {
    this.tone({ type: 'sine', from: 120, to: 45, duration: 0.4, volume: 0.3 });
    this.noise({ duration: 0.3, volume: 0.2, filterFrom: 900, filterTo: 60 });
  }

  dash() {
    this.noise({ duration: 0.16, volume: 0.08, filterFrom: 500, filterTo: 3200 });
  }

  nova() {
    this.tone({ type: 'sine', from: 90, to: 900, duration: 0.5, volume: 0.22 });
    this.noise({ duration: 0.7, volume: 0.3, filterFrom: 400, filterTo: 5000 });
  }

  pickup() {
    this.tone({ type: 'sine', from: 620, duration: 0.09, volume: 0.14 });
    this.tone({ type: 'sine', from: 930, duration: 0.12, volume: 0.14, delay: 0.07 });
  }

  waveStart() {
    this.tone({ type: 'triangle', from: 196, duration: 0.16, volume: 0.16 });
    this.tone({ type: 'triangle', from: 294, duration: 0.16, volume: 0.16, delay: 0.12 });
    this.tone({ type: 'triangle', from: 392, duration: 0.24, volume: 0.16, delay: 0.24 });
  }

  bossWarning() {
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'sawtooth', from: 110, to: 98, duration: 0.22, volume: 0.16, delay: i * 0.3 });
    }
  }

  victory() {
    const notes = [392, 494, 587, 784, 587, 784];
    notes.forEach((frequency, i) => {
      this.tone({ type: 'triangle', from: frequency, duration: 0.3, volume: 0.16, delay: i * 0.14 });
    });
  }

  gameOver() {
    const notes = [330, 262, 196, 131];
    notes.forEach((frequency, i) => {
      this.tone({ type: 'triangle', from: frequency, duration: 0.4, volume: 0.18, delay: i * 0.2 });
    });
  }

  uiClick() {
    this.tone({ type: 'sine', from: 700, duration: 0.06, volume: 0.1 });
  }
}
