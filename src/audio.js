// Original procedural Foley: no downloads, media requests or sample licenses.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Observe completed physics steps, not input buttons. Works with local and
// replicated matches, and keeps browser audio out of the simulation/server.
export class SoundEvents {
  reset(m) {
    const changedPlayers = this.players !== m.players;
    this.ball = Object.assign(this.ball || {}, m.ball);
    this.score = m.score.slice();
    this.players = m.players;
    this.elapsed = m.elapsed;
    this.variant = m.variant;
    this.kick = m.kickReleasedAt;
    this.touch = m.altinha?.lastTouch?.at ?? m.lastTouch?.time;
    if (!this.feet || changedPlayers) this.feet = new Map();
    for (const p of m.players) {
      let counts = this.feet.get(p.id);
      if (!counts) this.feet.set(p.id, (counts = []));
      const feet = p.locomotion?.feet || [];
      for (let i = 0; i < feet.length; i++) counts[i] = feet[i].landings;
    }
  }
  update(m) {
    const events = [];
    if (
      !this.ball ||
      (this.players !== m.players && !m.multiplayer) ||
      this.variant !== m.variant ||
      m.elapsed < this.elapsed
    ) {
      this.reset(m);
      return events;
    }
    const b = m.ball,
      old = this.ball;
    if (m.score.some((s, i) => s > this.score[i]))
      events.push({ kind: "celebrate", x: b.x, z: b.z });
    if (m.mode === "playing") {
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const impulse = Math.hypot(b.vx - old.vx, b.vy - old.vy, b.vz - old.vz);
      const touch = m.altinha?.lastTouch?.at ?? m.lastTouch?.time;
      const kicked = m.kickReleasedAt !== this.kick || touch !== this.touch;
      const bounced = !kicked && old.vy < -1 && b.vy >= 0 && b.y < 0.3;
      // Ignore ball placement/teleports at restarts.
      const nearby = Math.hypot(b.x - old.x, b.z - old.z) < 2;
      if (nearby && (kicked || bounced || impulse > 2.4)) {
        events.push({
          kind: bounced ? "bounce" : "impact",
          power: kicked ? speed : impulse,
          x: b.x,
          z: b.z,
        });
      }
      for (const p of m.players) {
        const feet = p.locomotion?.feet || [];
        const before = this.feet.get(p.id) || [];
        feet.forEach((f, i) => {
          if (
            f.landings > (before[i] ?? f.landings) &&
            Math.hypot(p.vx, p.vz) > 0.65
          )
            events.push({
              kind: "step",
              power: Math.hypot(p.vx, p.vz),
              x: p.x,
              z: p.z,
              selected: p.id === m.selected,
              skid: Math.hypot(p.locomotion.ax || 0, p.locomotion.az || 0) > 7,
            });
        });
      }
    }
    this.reset(m);
    return events;
  }
}

export class GameAudio {
  constructor() {
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem("campo-sound") !== "off";
    } catch {
      /* Private browsing. */
    }
    this.events = new SoundEvents();
    this.voices = new Set();
    this.counts = {};
    this.cooldowns = {};
    this.ambient = [];
    this.surface = null;
  }
  unlock() {
    if (!this.enabled) return;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!this.ctx) {
        this.ctx = new Audio();
        const c = this.ctx;
        this.master = c.createGain();
        this.master.gain.value = 0;
        const compressor = c.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        this.master.connect(compressor).connect(c.destination);
        this.noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch {
      /* Audio is optional on unsupported devices. */
    }
  }
  setEnabled(value) {
    this.enabled = value;
    try {
      localStorage.setItem("campo-sound", value ? "on" : "off");
    } catch {
      /* Optional preference. */
    }
    if (value) this.unlock();
    if (this.master)
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.025);
    if (!value) this.stopVoices();
  }
  stopVoices() {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
  }
  // Short envelopes start at zero, avoiding clicks. Every source disconnects.
  voice({
    noise = false,
    frequency = 160,
    end = frequency,
    duration = 0.12,
    gain = 0.1,
    pan = 0,
    filter = "lowpass",
    cutoff = 1800,
    delay = 0,
    type = "sine",
  }) {
    if (!this.ctx || this.voices.size >= 64) return;
    const c = this.ctx,
      t = c.currentTime + delay;
    const source = noise ? c.createBufferSource() : c.createOscillator();
    if (noise) source.buffer = this.noise;
    else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, t);
      source.frequency.exponentialRampToValueAtTime(
        Math.max(20, end),
        t + duration,
      );
    }
    const tone = c.createBiquadFilter();
    tone.type = filter;
    tone.frequency.value = cutoff;
    tone.Q.value = filter === "bandpass" ? 1.3 : 0.7;
    const envelope = c.createGain();
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(
      gain,
      t + Math.min(0.018, duration / 5),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const stereo = c.createStereoPanner();
    stereo.pan.value = clamp(pan, -1, 1);
    source.connect(tone).connect(envelope).connect(stereo).connect(this.master);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      tone.disconnect();
      envelope.disconnect();
      stereo.disconnect();
    };
    if (noise) source.start(t, Math.random() * 2);
    else source.start(t);
    source.stop(t + duration + 0.02);
  }
  atmosphere(surface) {
    for (const layer of this.ambient) {
      layer.source.stop();
      layer.source.disconnect();
      layer.filter.disconnect();
      layer.gain.disconnect();
    }
    this.ambient = [];
    this.surface = surface;
    for (const cutoff of [320, surface === "sand" ? 1800 : 850]) {
      const source = this.ctx.createBufferSource(),
        filter = this.ctx.createBiquadFilter(),
        gain = this.ctx.createGain();
      source.buffer = this.noise;
      source.loop = true;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master);
      source.start(0, Math.random() * 2);
      this.ambient.push({ source, filter, gain });
    }
    this.nextBird = this.ctx.currentTime + 1;
  }
  play(event, m) {
    const c = this.ctx,
      kind = event.kind;
    const now = c.currentTime;
    const cooldown = kind === "step" ? 0.065 : kind === "celebrate" ? 1 : 0.045;
    if (now < (this.cooldowns[kind] ?? -1)) return;
    this.cooldowns[kind] = now + cooldown;
    this.counts[kind] = (this.counts[kind] || 0) + 1;
    const listener = m.players[m.selected] || m.ball;
    const distance = Math.hypot(event.x - listener.x, event.z - listener.z);
    const pan = clamp((event.x - listener.x) / 24, -0.8, 0.8);
    const level = 1 / (1 + distance * 0.07);
    const surface = m.field.surface;
    const v = (options) => this.voice({ pan, ...options });
    if (kind === "impact" || kind === "bounce") {
      const strength = clamp(event.power / 38, 0.07, 1);
      const soft = kind === "bounce" && surface === "sand";
      v({
        frequency: (soft ? 110 : 175) + Math.random() * 35,
        end: soft ? 48 : 62,
        duration: 0.07 + strength * 0.15,
        gain: level * (0.075 + strength * 0.3) * (soft ? 0.45 : 1),
      });
      v({
        noise: true,
        cutoff: soft ? 650 : 1500 + strength * 3500,
        duration: 0.035 + strength * 0.055,
        gain: level * (0.035 + strength * 0.24),
      });
      if (strength > 0.72)
        v({
          noise: true,
          filter: "bandpass",
          cutoff: 950,
          duration: 0.16,
          gain: level * 0.065,
          delay: 0.035,
        });
    } else if (kind === "step") {
      const hard = surface === "court" || surface === "street";
      const gain =
        level *
        (event.selected ? 0.08 : 0.032) *
        clamp(event.power / 5, 0.3, 1.3);
      v({
        noise: true,
        cutoff: hard ? 2200 : surface === "sand" ? 1200 : 800,
        duration: hard ? 0.045 : 0.12,
        gain,
      });
      v({
        frequency: hard ? 125 : 85,
        end: 48,
        duration: 0.06,
        gain: gain * 0.6,
      });
      if (surface === "court" && event.skid && now > (this.nextSqueak || 0)) {
        this.nextSqueak = now + 0.32;
        v({
          frequency: 750 + Math.random() * 500,
          end: 1600,
          duration: 0.09,
          type: "triangle",
          filter: "bandpass",
          cutoff: 1400,
          gain: gain * 0.7,
        });
        this.counts.squeak = (this.counts.squeak || 0) + 1;
      }
    } else if (kind === "celebrate") {
      // Layered rising vowel-like crowd, hand claps and a short whistle.
      const stadium = surface === "grass";
      for (let i = 0; i < 8; i++) {
        const delay = i * 0.07;
        v({
          noise: true,
          filter: "bandpass",
          cutoff: 650 + i * 180,
          duration: stadium ? 2.5 : 1.6,
          gain: stadium ? 0.12 : 0.065,
          delay,
          pan: (i - 3.5) / 5,
        });
        v({
          frequency: 180 + i * 23,
          end: 280 + i * 27,
          type: "sawtooth",
          filter: "bandpass",
          cutoff: 800,
          duration: 0.7 + i * 0.08,
          gain: 0.014,
          delay,
          pan: (i - 3.5) / 5,
        });
      }
      for (let i = 0; i < 10; i++)
        v({
          noise: true,
          filter: "bandpass",
          cutoff: 1400,
          duration: 0.055,
          gain: 0.09,
          delay: 0.3 + i * 0.17,
          pan: Math.sin(i * 7) * 0.75,
        });
      v({
        frequency: 2300,
        end: 2700,
        duration: 0.38,
        gain: 0.035,
        delay: 0.18,
      });
    }
  }
  update(m, hidden = false) {
    const events = this.events.update(m);
    if (!this.ctx) return;
    const active =
      this.enabled && !hidden && ["playing", "goal"].includes(m.mode);
    if (this.active !== active) {
      this.active = active;
      this.master.gain.setTargetAtTime(
        active ? 0.7 : 0,
        this.ctx.currentTime,
        0.06,
      );
      if (!active) this.stopVoices();
    }
    if (!active || this.ctx.state !== "running") return;
    const surface = m.field.surface;
    if (surface !== this.surface) this.atmosphere(surface);
    const t = this.ctx.currentTime;
    const wave = Math.pow((Math.sin(t * 0.68) + 1) / 2, 2);
    this.ambient.forEach((layer, i) => {
      const volume =
        surface === "sand"
          ? i
            ? 0.014 + wave * 0.06
            : 0.035 + wave * 0.1
          : surface === "grass"
            ? i
              ? 0.025
              : 0.04
            : surface === "street"
              ? 0.012
              : 0.004;
      layer.gain.gain.setTargetAtTime(volume, t, 0.25);
    });
    if ((surface === "street" || surface === "sand") && t > this.nextBird) {
      this.nextBird = t + 5 + Math.random() * 8;
      const beach = surface === "sand",
        pan = Math.random() * 1.6 - 0.8;
      for (let i = 0; i < (beach ? 2 : 3); i++)
        this.voice({
          frequency: beach ? 1250 : 2600 + i * 300,
          end: beach ? 780 : 3800 - i * 170,
          duration: beach ? 0.42 : 0.11,
          gain: beach ? 0.009 : 0.022,
          cutoff: 5000,
          pan,
          delay: i * (beach ? 0.5 : 0.16),
        });
      this.counts.bird = (this.counts.bird || 0) + 1;
    }
    // Nearby/controlled footsteps win when multiple athletes land together.
    events.sort((a, b) => Number(!!b.selected) - Number(!!a.selected));
    for (const event of events) this.play(event, m);
  }
  snapshot() {
    return {
      enabled: this.enabled,
      state: this.ctx?.state || "locked",
      active: !!this.active,
      surface: this.surface,
      voices: this.voices.size,
      events: { ...this.counts },
    };
  }
}
