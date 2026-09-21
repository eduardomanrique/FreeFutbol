const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Add a bounded root-trajectory correction over the interaction window.
// The correction is differentiable at both ends; physical collision resolution
// is applied after this desired displacement, so a wall can prevent reaching it.
export class RootMotionWarp {
  constructor(start, target, duration = 0.24) {
    this.start = { ...start };
    const dx = target.x - start.x,
      dz = target.z - start.z,
      d = Math.hypot(dx, dz),
      scale = Math.min(1, 0.24 / Math.max(0.001, d));
    this.offset = { x: dx * scale, z: dz * scale };
    this.duration = duration;
    this.time = 0;
  }
  step(dt) {
    const smooth = (t) => t * t * (3 - 2 * t),
      a = smooth(clamp(this.time / this.duration, 0, 1));
    this.time += dt;
    const b = smooth(clamp(this.time / this.duration, 0, 1));
    return { x: this.offset.x * (b - a), z: this.offset.z * (b - a) };
  }
  get done() {
    return this.time >= this.duration;
  }
}
