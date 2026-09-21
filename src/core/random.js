// Mulberry32: explicit uint32 state, independent of the host clock and Math.random.
export class MatchRandom {
  constructor(seed) {
    this.restore(seed);
  }
  restore(state) {
    if (!Number.isInteger(state) || state < 0 || state > 0xffffffff)
      throw new Error("Invalid random state");
    this.state = state >>> 0;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
