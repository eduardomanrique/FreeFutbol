import { strikePosture } from "./body-expression.js";
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
export function shotFacing(heading, aim) {
  const angle = Math.abs(wrapAngle(Math.atan2(aim.x, aim.z) - heading));
  const difficulty = clamp(angle / (Math.PI * 0.86), 0, 1);
  return { speedScale: 0.6 - 0.45 * difficulty, difficulty };
}
export function shotPrecision(
  power,
  distance,
  { finesse = false, committed = false, facing = 0 } = {},
) {
  // Gameplay index, not a measured real-world probability of scoring.
  const index = clamp(
    0.985 -
      0.14 * power * power -
      0.4 * facing -
      0.0045 * Math.max(0, distance - 16) +
      (finesse ? 0.07 : 0) +
      (committed ? 0.06 : 0),
    0.35,
    0.99,
  );
  return { index, spread: (1 - index) * (0.7 + distance * 0.08) };
}
// Total cone aperture: 120° up to 6m, tapering to 20° at 22m.
export function shortPassHalfAngle(distance) {
  return ((60 - 50 * clamp((distance - 6) / 16, 0, 1)) * Math.PI) / 180;
}
export function selectPassTarget(players, p, aim, power = 1, type = "pass") {
  const candidates = players.filter((q) => q.team === p.team && q.id !== p.id);
  const ranked = candidates
    .map((q) => {
      const dx = q.x - p.x,
        dz = q.z - p.z,
        d = Math.hypot(dx, dz);
      const alignment = (dx * aim.x + dz * aim.z) / Math.max(0.001, d);
      return {
        q,
        d,
        alignment,
        cost: (1 - alignment) * 45 + d * 0.12 + (q.keeper ? 5 : 0),
      };
    })
    .sort((a, b) => a.cost - b.cost);
  if (type === "pass" && power <= 0.4) {
    // Nearby options tolerate lateral aim; longer passes need tighter alignment.
    const inCone = ranked.filter(
      ({ d, alignment }) => alignment >= Math.cos(shortPassHalfAngle(d)),
    );
    const short = inCone.filter(({ d }) => d <= 22);
    short.sort(
      (a, b) => a.d + (1 - a.alignment) * 5 - (b.d + (1 - b.alignment) * 5),
    );
    if (short.length) return short[0].q;
    if (inCone.length) return inCone[0].q;
  }
  return ranked[0]?.q;
}
export function passTrajectory(distance, power, lob = false) {
  distance = Math.max(0.5, distance);
  if (lob) {
    const flight = clamp(distance / (11 + power * 10), 1.5, 2.35);
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

// Earliest reachable point on the incoming trajectory, followed by an arrival
// velocity. Uses stance acceleration in locomotion; never moves player or ball.
export function actionApproach(p, ball, action) {
  const incoming = Math.hypot(ball.vx, ball.vz);
  const forward =
    action.firstTime && incoming > 0.5
      ? { x: -ball.vx / incoming, z: -ball.vz / incoming }
      : { x: Math.sin(action.heading), z: Math.cos(action.heading) };
  const behind = action.firstTime ? 0.45 : strikePosture(action).behind;
  // Track a moving ball with its velocity rather than braking to a stationary
  // point behind it. Stance forces still bound all changes in body momentum.
  if (!action.firstTime && incoming > 0.5) {
    const future = { ...ball };
    const horizon = 0.24;
    for (let t = 0; t < horizon; t += 1 / 120) stepBallMotion(future, 1 / 120);
    const runningOffset = 0.12;
    const errorX = future.x - forward.x * runningOffset - p.x - p.vx * horizon;
    const errorZ = future.z - forward.z * runningOffset - p.z - p.vz * horizon;
    const vx = ball.vx + errorX * 5;
    const vz = ball.vz + errorZ * 5;
    const speed = Math.hypot(vx, vz);
    const cap = Math.max(7.5, Math.min(9.775, action.approachSpeed || 0));
    const scale = speed > cap ? cap / speed : 1;
    return { x: vx * scale, z: vz * scale };
  }
  const future = { ...ball };
  let target = {
    x: ball.x - forward.x * behind,
    z: ball.z - forward.z * behind,
  };
  let horizon = 0.12;
  for (let t = 1 / 60; t <= 0.85; t += 1 / 60) {
    stepBallMotion(future, 1 / 60);
    target = {
      x: future.x - forward.x * behind,
      z: future.z - forward.z * behind,
    };
    horizon = Math.max(0.12, t);
    if (
      Math.hypot(target.x - p.x, target.z - p.z) <=
      0.18 + Math.hypot(p.vx, p.vz) * t + 3 * t * t
    )
      break;
  }
  const dx = target.x - p.x,
    dz = target.z - p.z,
    distance = Math.hypot(dx, dz);
  const speed = Math.min(7.5, distance / horizon, Math.sqrt(12 * distance));
  return {
    x: distance ? (dx / distance) * speed : 0,
    z: distance ? (dz / distance) * speed : 0,
  };
}
