import { stepBallMotion } from "./ball-physics.js";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const HEAD_HEIGHT = 1.76;
export function headPosition(p) {
  const heading = p.locomotion?.heading || 0;
  return {
    x: p.x + Math.sin(heading) * 0.1,
    y: HEAD_HEIGHT + (p.header?.height || 0),
    z: p.z + Math.cos(heading) * 0.1,
  };
}
export function planHeader(p, ball, horizon = 0.9) {
  if (ball.owner !== null || p.keeper) return null;
  const future = { ...ball };
  for (let i = 1; i <= Math.floor(horizon * 120); i++) {
    stepBallMotion(future, 1 / 120);
    const time = i / 120;
    if (future.y < 1.45 || future.y > 2.55) continue;
    const height = clamp(future.y - HEAD_HEIGHT, 0, 0.62);
    // Jump reaches the contact height near its apex. Leave time to load.
    const jumpTime = Math.sqrt((2 * height) / 9.81);
    if (time < jumpTime + 0.07) continue;
    const distance = Math.hypot(
      future.x - p.x - p.vx * time * 0.35,
      future.z - p.z - p.vz * time * 0.35,
    );
    if (distance > 0.24 + Math.min(5 * time, 2.8 * time * time)) continue;
    return { x: future.x, z: future.z, y: future.y, time, height, jumpTime };
  }
  return null;
}
export function stepHeader(p, ball, action, time, dt, horizon = 0.9) {
  if (!p.header && action?.firstTime) {
    const plan = planHeader(p, ball, horizon);
    if (plan) {
      p.header = {
        ...plan,
        startedAt: time,
        contactAt: time + plan.time,
        launchAt: time + plan.time - plan.jumpTime,
        jumpVelocity: Math.sqrt(2 * 9.81 * plan.height),
        height: 0,
        mode: "prepare",
        hit: false,
      };
      action.header = true;
      p.ballMotion = null;
      p.strikePlant = null;
      for (const f of p.locomotion.feet) f.special = null;
    }
  }
  const h = p.header;
  if (!h) return;
  h.previousHead = headPosition(p);
  if (time >= h.launchAt && h.jumpVelocity > 0) {
    const t = time - h.launchAt;
    h.height = Math.max(0, h.jumpVelocity * t - 4.905 * t * t);
    h.mode = h.height > 0 ? "airborne" : "recover";
  }
  if (time > h.contactAt + 0.55 && h.height === 0) {
    p.header = null;
    return;
  }
  h.fold = h.hit
    ? 0.3 * Math.max(0, 1 - (time - h.hitAt) / 0.45)
    : -0.12 * Math.min(1, (time - h.startedAt) / 0.12);
}
export function headerContact(p, ball, dt) {
  const h = p.header;
  if (!h || h.hit || ball.y < 1.35) return false;
  const head = headPosition(p),
    previous = h.previousHead || head;
  const rx = ball.x - head.x,
    ry = ball.y - head.y,
    rz = ball.z - head.z;
  const dx = ball.vx * dt - (head.x - previous.x),
    dy = ball.vy * dt - (head.y - previous.y),
    dz = ball.vz * dt - (head.z - previous.z);
  const t = clamp(
    -(rx * dx + ry * dy + rz * dz) /
      Math.max(1e-9, dx * dx + dy * dy + dz * dz),
    0,
    1,
  );
  return Math.hypot(rx + dx * t, ry + dy * t, rz + dz * t) <= 0.29;
}
