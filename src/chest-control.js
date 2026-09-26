import { stepBallMotion } from "./ball-physics.js";
import { ease } from "./movement-phases.js";
export function chestPosition(p) {
  const h = p.locomotion?.heading ?? Math.atan2(p.dx, p.dz);
  return { x: p.x + Math.sin(h) * 0.2, y: 1.46, z: p.z + Math.cos(h) * 0.2 };
}
export function stepChestControl(p, ball, time) {
  const a = p.chestTrap;
  if (a && (time > a.expiresAt || p.ballAction?.firstTime || p.header))
    p.chestTrap = null;
  if (
    p.chestTrap ||
    (p.keeper && !p.field?.duel) ||
    p.ballAction ||
    ball.owner !== null ||
    ball.y < 1.12
  )
    return;
  const f = { ...ball };
  for (let i = 0; i < 66; i++) {
    const t = i / 120;
    if (
      f.y >= 1.18 &&
      f.y <= 1.76 &&
      Math.hypot(f.x - p.x - p.vx * t, f.z - p.z - p.vz * t) < 0.65
    ) {
      p.chestTrap = {
        startedAt: time,
        contactAt: time + t,
        expiresAt: time + t + 0.65,
        heading: Math.atan2(ball.x - p.x, ball.z - p.z),
        hitAt: null,
      };
      return;
    }
    stepBallMotion(f, 1 / 120);
  }
}
export function chestContact(p, ball, dt) {
  if (!p.chestTrap || p.chestTrap.hitAt != null) return false;
  const c = chestPosition(p);
  const rx = ball.x - c.x,
    ry = ball.y - c.y,
    rz = ball.z - c.z;
  const dx = (ball.vx - p.vx) * dt,
    dy = ball.vy * dt,
    dz = (ball.vz - p.vz) * dt;
  const t = Math.max(
    0,
    Math.min(
      1,
      -(rx * dx + ry * dy + rz * dz) /
        Math.max(1e-9, dx * dx + dy * dy + dz * dz),
    ),
  );
  return Math.hypot(rx + dx * t, (ry + dy * t) * 0.8, rz + dz * t) < 0.34;
}
export function chestPose(p, time) {
  const a = p.chestTrap;
  if (!a) return { weight: 0, fold: 0 };
  const load = ease((time - a.startedAt) / 0.12);
  const after = a.hitAt == null ? 0 : ease((time - a.hitAt) / 0.16);
  const release =
    a.hitAt == null ? 1 : 1 - ease((time - a.hitAt - 0.18) / 0.42);
  return {
    weight: load * release,
    fold: (-0.22 + 0.42 * after) * load * release,
  };
}
