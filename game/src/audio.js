// All sound is WebAudio, generated live — no audio files, no network. Engine
// hum follows the speed, the siren wails when the police are near, and three
// procedural radio stations (R to switch) play original basslines and melodies.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Original station patterns: chords (midi roots) + bass + sparkle.
const STATIONS = [
  { name: 'Bay FM', bpm: 96, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [45, 41, 36, 43], wave: 'sine' },
  { name: 'Neon Nights', bpm: 118, chords: [[50, 53, 57], [46, 50, 53], [41, 45, 48], [48, 52, 55]], bass: [38, 34, 29, 36], wave: 'square' },
  { name: 'Street Beat', bpm: 128, chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], bass: [40, 36, 43, 38], wave: 'sawtooth' },
];

export function createAudio() {
  const audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, noiseBuf: null,
    station: 0, musicOn: true, muted: false, volume: 0.7,
    nextNote: 0, step16: 0, timer: null, stepAlt: false,

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      // Shared white-noise buffer for shots, steps and hats.
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Engine hum: saw + sub sine through a lowpass.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      const sub = this.ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = 25;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineOsc.connect(lp); sub.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start(); sub.start();
      this.engineSub = sub;
      // Siren: square wave, frequency flipped in update().
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.startRadio();
    },

    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; },
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },

    tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.3, freq = 1200, type = 'bandpass', when = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + when;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t); src.stop(t + dur + 0.02);
    },

    click() { this.tone(880, 0.05, 'square', 0.08); },
    door() { this.noise(0.08, 0.2, 300, 'lowpass'); this.tone(90, 0.1, 'sine', 0.25); },
    step(run) { this.noise(0.05, run ? 0.14 : 0.09, 500 + (this.stepAlt ? 120 : 0), 'bandpass'); this.stepAlt = !this.stepAlt; },
    punch() { this.tone(130, 0.12, 'sine', 0.35, 0, 60); this.noise(0.08, 0.2, 700, 'lowpass'); },
    swing() { this.noise(0.14, 0.08, 1800, 'bandpass'); },
    shot(kind) {
      if (kind === 'smg') { this.noise(0.07, 0.3, 2400, 'highpass'); this.tone(180, 0.06, 'square', 0.14, 0, 70); }
      else { this.noise(0.13, 0.4, 1600, 'bandpass'); this.tone(160, 0.1, 'square', 0.2, 0, 60); }
    },
    reload() { this.tone(1200, 0.04, 'square', 0.1); this.tone(900, 0.04, 'square', 0.1, 0.12); },
    hurt() { this.tone(110, 0.18, 'sine', 0.3, 0, 50); this.noise(0.12, 0.15, 400, 'lowpass'); },
    pickup() { this.tone(660, 0.09, 'sine', 0.18); this.tone(880, 0.14, 'sine', 0.18, 0.09); },
    checkpoint() { this.tone(523, 0.08, 'square', 0.12); this.tone(659, 0.08, 'square', 0.12, 0.08); this.tone(784, 0.12, 'square', 0.12, 0.16); },
    complete() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.16, i * 0.1)); },
    fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.13)); },
    mission() { this.tone(1046, 0.1, 'sine', 0.14); this.tone(1318, 0.16, 'sine', 0.14, 0.1); },
    horn() { this.tone(311, 0.22, 'square', 0.1); this.tone(370, 0.22, 'square', 0.08); },
    sirenBlip() { this.tone(700, 0.16, 'square', 0.1); this.tone(950, 0.16, 'square', 0.1, 0.16); },
    explosion() {
      this.noise(0.7, 0.6, 300, 'lowpass');
      this.tone(120, 0.7, 'sine', 0.5, 0, 28);
    },

    /** Engine pitch follows speed; call every frame. */
    engine(speed, throttle) {
      if (!this.ctx) return;
      const target = throttle > 0 || speed > 20 ? 0.05 + Math.min(0.16, speed / 3200) : 0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
      const f = 42 + speed * 0.32 + throttle * 22;
      this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
      this.engineSub.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.08);
    },
    /** Siren on/off (0/1); the wail alternates by wall time. */
    siren(level) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.sirenGain.gain.setTargetAtTime(level > 0 ? 0.045 : 0, t, 0.2);
      this.sirenOsc.frequency.setTargetAtTime(Math.floor(t * 2.2) % 2 === 0 ? 700 : 950, t, 0.05);
    },

    /** Radio scheduler: 16th notes, lookahead 0.15s. */
    startRadio() {
      if (this.timer || !this.ctx) return;
      this.nextNote = this.ctx.currentTime + 0.1;
      this.step16 = 0;
      this.timer = setInterval(() => this.scheduleRadio(), 40);
    },
    scheduleRadio() {
      if (!this.ctx || !this.musicOn) return;
      const st = STATIONS[this.station];
      const spb = 60 / st.bpm / 4; // 16th note
      while (this.nextNote < this.ctx.currentTime + 0.15) {
        const step = this.step16 % 64;
        const bar = Math.floor(step / 16) % 4;
        const chord = st.chords[bar];
        const t = this.nextNote - this.ctx.currentTime;
        // Bass on beats.
        if (step % 4 === 0) this.note(midi(st.bass[bar]) / 2, spb * 3.6, st.wave, 0.16, t);
        // Chord stab on the off-beat.
        if (step % 8 === 4) for (const n of chord) this.note(midi(n), spb * 1.6, 'triangle', 0.05, t);
        // Sparkle melody: pentatonic walk, deterministic-ish.
        if (step % 2 === 0 && (step * 7 + bar * 3) % 5 < 2) {
          const scale = [0, 3, 5, 7, 10, 12];
          const n = chord[0] + 12 + scale[(step * 3 + bar) % scale.length];
          this.note(midi(n), spb * 1.4, 'sine', 0.05, t);
        }
        // Hat tick.
        if (step % 2 === 1) this.hat(t);
        this.nextNote += spb;
        this.step16 += 1;
      }
    },
    note(freq, dur, type, vol, when) {
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    hat(when) {
      const t = this.ctx.currentTime + when;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f); f.connect(g); g.connect(this.musicGain);
      src.start(t); src.stop(t + 0.05);
    },
    nextStation() {
      this.station = (this.station + 1) % STATIONS.length;
      return STATIONS[this.station].name;
    },
    stationName() { return STATIONS[this.station].name; },
  };
  return audio;
}
