import { ROLL_DECELERATION, stepBallMotion } from "./ball-physics.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapAngle = (v) => Math.atan2(Math.sin(v), Math.cos(v));
export function goalAim(player, ball, northSouth = 0) {
  const x = player.team === 0 ? 46 : -46;
  const z = clamp(northSouth, -1, 1) * 3.2;
  const d = Math.hypot(x - ball.x, z - ball.z) || 1;
  return { targetZ: z, aim: { x: (x - ball.x) / d, z: (z - ball.z) / d } };
}
export function strikeStyle(heading, dx, dz, power, speed, type) {
  const turn = wrapAngle(Math.atan2(dx, dz) - heading),
    magnitude = Math.abs(turn);
  const heel = magnitude > Math.PI * 0.86;
  const difficulty = heel ? 0.18 : Math.max(0, Math.sin(magnitude / 2));
  return {
    name: heel ? "backheel" : magnitude > 0.7 ? "turning" : "instep",
    turn: heel ? 0 : turn,
    imbalance: heel
      ? 0.08
      : clamp(difficulty * (speed / 10 + power * 0.45), 0, 1),
    fall:
      !heel &&
      type === "shoot" &&
      power > 0.8 &&
      magnitude > 1.1 &&
      magnitude < 2.65,
  };
}
export function shotPrecision(
  power,
  distance,
  { finesse = false, committed = false } = {},
) {
  // Gameplay index, not a measured real-world probability of scoring.
  const index = clamp(
    0.985 -
      0.14 * power * power -
      0.0045 * Math.max(0, distance - 16) +
      (finesse ? 0.07 : 0) +
      (committed ? 0.06 : 0),
    0.35,
    0.99,
  );
  return { index, spread: (1 - index) * (0.7 + distance * 0.08) };
}
export function selectPassTarget(players, p, aim) {
  const candidates = players.filter((q) => q.team === p.team && q.id !== p.id);
  const ranked = candidates
    .map((q) => {
      const dx = q.x - p.x,
        dz = q.z - p.z,
        d = Math.hypot(dx, dz);
      const alignment = (dx * aim.x + dz * aim.z) / Math.max(0.001, d);
      return { q, cost: (1 - alignment) * 45 + d * 0.12 + (q.keeper ? 5 : 0) };
    })
    .sort((a, b) => a.cost - b.cost);
  return ranked[0]?.q;
}
export function passTrajectory(distance, power, lob = false) {
  distance = Math.max(0.5, distance);
  if (lob) {
    const flight = clamp(distance / (11 + power * 10), 0.65, 2.35);
    const lift = 9.81 * flight * 0.5;
    // Air drag compensated by solving the same predictor used for interceptions.
    let lo = 0,
      hi = 80;
    for (let n = 0; n < 18; n++) {
      const speed = (lo + hi) / 2,
        b = { x: 0, z: 0, y: 0.11, vx: speed, vz: 0, vy: lift, spin: 0 };
      for (let t = 0; t < flight; t += 1 / 120)
        stepBallMotion(b, Math.min(1 / 120, flight - t));
      if (b.x < distance) lo = speed;
      else hi = speed;
    }
    return { speed: (lo + hi) / 2, lift };
  }
  const arrival = 2.6 + power * 6.5;
  // Constant rolling resistance plus speed drag, integrate backward in distance.
  let speed = arrival;
  for (let x = 0; x < distance; x += 0.1) {
    const dx = Math.min(0.1, distance - x);
    speed = Math.sqrt(
      speed * speed + 2 * (ROLL_DECELERATION + 0.085 * speed) * dx,
    );
  }
  // Allow for initial sliding-to-rolling loss in the rigid-body contact solver.
  return { speed: speed * 1.12, lift: 0 };
}
export function footBallDistance(foot, b, previous = foot) {
  const dx = foot.x - previous.x,
    dz = foot.z - previous.z,
    dy = foot.y - previous.y;
  const rx = b.x - previous.x,
    rz = b.z - previous.z,
    ry = b.y - (previous.y - 0.04);
  const t = clamp(
    (rx * dx + rz * dz + ry * dy) / Math.max(1e-8, dx * dx + dz * dz + dy * dy),
    0,
    1,
  );
  return Math.hypot(rx - dx * t, rz - dz * t, ry - dy * t);
}
