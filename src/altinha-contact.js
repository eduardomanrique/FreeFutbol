const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const bodyTouch = (a) =>
  a && ["head", "shoulder", "chest"].includes(a.kind);
export function shoulderMotion(a, b, time) {
  const enter = clamp((time - a.startedAt) / 0.18, 0, 1);
  const age = a.hitAt == null ? null : time - a.hitAt;
  const release = age == null ? 1 : Math.max(0, 1 - age / 0.4);
  const impulse =
    age == null ? clamp((1.85 - b.y) / 0.45, 0, 1) : Math.exp(-age * 12);
  return {
    center: 0.055 * enter * release,
    lift: 0.045 * impulse * enter * release,
    roll: 0.12 * enter * release + 0.08 * impulse * release,
  };
}
export function bodySurface(p, a, b, time) {
  const h = a.heading ?? p.locomotion.heading,
    right = { x: Math.cos(h), z: -Math.sin(h) },
    forward = { x: Math.sin(h), z: Math.cos(h) };
  const scale = 1.025 + ((p.renderId ?? p.id) % 4) * 0.01;
  if (a.rescue) {
    const t = clamp((time - a.rescue.at) / 0.14, 0, 1);
    const w = t * t * (3 - 2 * t);
    const fold = a.rescue.fold * w;
    return {
      x: p.x + forward.x * (0.04 + Math.sin(fold) * 0.86),
      y: 0.88 + Math.cos(fold) * 0.86 - (a.crouch || 0),
      z: p.z + forward.z * (0.04 + Math.sin(fold) * 0.86),
    };
  }
  const shoulder = a.kind === "shoulder",
    head = a.kind === "head";
  const motion = shoulder ? shoulderMotion(a, b, time) : null;
  const side = shoulder ? a.side * (0.205 * scale - motion.center) : 0,
    front = shoulder ? 0 : (head ? 0.04 : 0.13) * scale;
  const nominal = {
    x: p.x + right.x * side + forward.x * front,
    y:
      (head ? 1.78 : shoulder ? 1.48 : 1.46) * scale -
      0.08 -
      (a.crouch || 0) +
      (motion?.lift || 0),
    z: p.z + right.z * side + forward.z * front,
  };
  const dx = b.x - nominal.x,
    dz = b.z - nominal.z,
    len = Math.hypot(dx, dz),
    reach = Math.min(1, 0.17 / Math.max(0.001, len));
  const t = clamp((time - a.startedAt) / 0.18, 0, 1),
    weight = t * t * (3 - 2 * t);
  return {
    x: nominal.x + dx * reach * weight,
    y: nominal.y,
    z: nominal.z + dz * reach * weight,
  };
}
export const PICKUPS = ["sole", "scoop", "cross"];
export function pickupFoot(p, a, b, time) {
  const t = time - a.startedAt,
    h = a.heading,
    rx = Math.cos(h),
    rz = -Math.sin(h),
    fx = Math.sin(h),
    fz = Math.cos(h);
  const pre = Math.max(0, 1 - t / a.rollAt);
  // Approach first; then the sole follows the rolling ball and the instep lifts it.
  const u = clamp((t - a.liftAt + 0.16) / 0.16, 0, 1),
    underneath = u * u * (3 - 2 * u);
  return {
    x: b.x + rx * a.side * 0.04 * pre - fx * (0.15 * pre + 0.08 * underneath),
    y:
      (a.pickup === "scoop" ? 0.035 : 0.21) * (1 - underneath) +
      0.035 * underneath,
    z: b.z + rz * a.side * 0.04 * pre - fz * (0.15 * pre + 0.08 * underneath),
  };
}
