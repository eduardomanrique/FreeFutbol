import { stepBallMotion } from "./ball-physics.js";
import { ease } from "./movement-phases.js";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const HEAD_HEIGHT = 1.76;
// Redirect the arriving ball with a modest neck/body impulse, not shot power.
export function headerSpeed(incomingSpeed, power, shooting = true) {
  return clamp(
    incomingSpeed * (shooting ? 0.78 : 0.62) + 1.8 + clamp(power, 0, 1) * 2.2,
    2,
    shooting ? 22 : 17,
  );
}
export function headPosition(p) {
  const heading = p.locomotion?.heading || 0;
  return {
    x: p.x + Math.sin(heading) * 0.1,
    y: HEAD_HEIGHT + (p.header?.height || 0) - (p.header?.crouch || 0),
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
    if (time < jumpTime + 0.14) continue;
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
  const preparation = Math.max(0.08, h.launchAt - h.startedAt);
  const loadPhase = clamp((time - h.startedAt) / preparation, 0, 1);
  h.load = time < h.launchAt ? Math.sin(Math.PI * loadPhase) : 0;
  h.crouch = 0.19 * h.load;
  h.armDrive =
    time < h.launchAt
      ? -h.load
      : Math.sin(Math.PI * clamp((time - h.launchAt) / 0.5, 0, 1));
  if (time >= h.launchAt && h.jumpVelocity > 0) {
    const t = time - h.launchAt;
    h.height = Math.max(0, h.jumpVelocity * t - 4.905 * t * t);
    h.mode = h.height > 0 ? "airborne" : "recover";
    const landed = time - h.launchAt - (2 * h.jumpVelocity) / 9.81;
    if (landed >= 0)
      h.crouch = 0.15 * ease(landed / 0.05) * (1 - ease((landed - 0.06) / 0.2));
  }
  if (time > h.contactAt + 0.55 && h.height === 0) {
    p.header = null;
    return;
  }
  h.fold =
    h.load * 0.28 +
    (h.hit
      ? 0.3 * Math.max(0, 1 - (time - h.hitAt) / 0.45)
      : -0.1 * Math.min(1, (time - h.startedAt) / 0.12) * (1 - h.load));
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
