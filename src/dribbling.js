import { motionAction } from "./action-state.js";
import { rollingResistance } from "./surfaces.js";
import { ROLL_DECELERATION, stepBallMotion } from "./ball-physics.js";
import { planTurn } from "./turning.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const length = Math.hypot;
export const DRIBBLE = {
  preferredFoot: 0,
  recoveryDistance: 1.35,
};
export function predictBall(b, time) {
  const future = { ...b };
  for (let t = 0; t < time; t += 1 / 60)
    stepBallMotion(future, Math.min(1 / 60, time - t));
  return future;
}
export function touchRhythm(speed, sprint = false) {
  // Faster running permits more steps between touches. The ball travels
  // freely between contacts; no speed or position follower is applied.
  return {
    interval: (0.42 + 0.38 * clamp(speed / 9.775, 0, 1)) * (sprint ? 1.08 : 1),
    lead: (0.45 + 0.055 * speed) * (sprint ? 1.3 : 1),
  };
}
export function guideDribbler(p, b, vx, vz) {
  const turnPlan = planTurn(p, b, vx, vz);
  vx = turnPlan.x;
  vz = turnPlan.z;
  const speed = length(p.vx, p.vz),
    requested = length(vx, vz),
    distance = length(b.x - p.x, b.z - p.z);
  const direction =
    requested > 0.1
      ? { x: vx / requested, z: vz / requested }
      : { x: p.dx, z: p.dz };
  const future = predictBall(b, 0.18);
  const rx = future.x - (p.x + p.vx * 0.18),
    rz = future.z - (p.z + p.vz * 0.18);
  const ahead = rx * direction.x + rz * direction.z;
  const lateral = Math.abs(rx * direction.z - rz * direction.x);
  const turn =
    requested > 0.1 && speed > 0.5
      ? (vx * p.vx + vz * p.vz) / (requested * speed)
      : 1;
  const stopping = requested < 0.1;
  const wasRecovering = ["turn", "recover"].includes(p.dribbleState?.mode);
  const recovering =
    (wasRecovering &&
      (distance > 1.05 || ahead < 0.3 || lateral > 0.25 || turn < 0.85)) ||
    distance > DRIBBLE.recoveryDistance ||
    ahead < 0.18 ||
    lateral > 0.55 ||
    turn < 0.75 ||
    (stopping && distance > 0.6);
  p.dribbleIntent = { x: vx, z: vz };
  if (p.turnAction?.phase === "approach") {
    const tx = future.x - p.x,
      tz = future.z - p.z;
    const d = length(tx, tz);
    const chaseSpeed = Math.max(speed, requested);
    p.dribbleState = {
      mode: "recover",
      distance,
      ahead,
      lateral,
      pursuingTouch: true,
    };
    return { x: (tx / (d || 1)) * chaseSpeed, z: (tz / (d || 1)) * chaseSpeed };
  }
  if (p.turnAction?.phase === "settle") {
    p.dribbleState = { mode: "turn", distance, ahead, lateral };
    return { x: p.vx * 0.15, z: p.vz * 0.15 };
  }
  if (p.shield && !motionAction(p)) {
    const sh = p.shield;
    p.dribbleState = {
      mode: "shield",
      distance,
      ahead,
      lateral,
      rival: sh.rival,
    };
    // Stay behind the ball on its exposed side; input still picks the escape route.
    // Lateral room avoids running directly into the challenger when pressed.
    const dot = vx * sh.x + vz * sh.z;
    let ex = vx,
      ez = vz;
    if (dot < 0) {
      ex -= sh.x * dot * sh.pressure;
      ez -= sh.z * dot * sh.pressure;
      const side = vx * -sh.z + vz * sh.x >= 0 ? 1 : -1;
      ex += -sh.z * side * requested * 0.55 * sh.pressure;
      ez += sh.x * side * requested * 0.55 * sh.pressure;
    }
    p.dribbleIntent = { x: ex, z: ez };
    if (distance > 1.15) {
      const tx = future.x - sh.x * 0.55 - p.x;
      const tz = future.z - sh.z * 0.55 - p.z;
      return { x: tx * 4, z: tz * 4 };
    }
    return { x: ex, z: ez };
  }
  p.dribbleState = {
    mode: recovering
      ? turn < 0.75
        ? "turn"
        : "recover"
      : stopping
        ? "settle"
        : "carry",
    distance,
    ahead,
    lateral,
  };
  if (stopping && length(b.vx, b.vz) < 0.08 && distance <= 1.12)
    return { x: 0, z: 0 };
  if (
    stopping &&
    speed > 0.8 &&
    (distance < 1.35 || p.lastDribble?.kind === "brake")
  )
    return { x: 0, z: 0 };
  if (
    requested > 0.1 &&
    p.lastDribble &&
    distance < 3.5 &&
    !(
      p.lastDribble.kind === "cut" &&
      length(p.lastDribble.vx, p.lastDribble.vz) < 4
    )
  ) {
    // The stick chooses the next shoe impulse, not a route away from the ball.
    // Follow its existing trajectory until contact actually redirects it.
    const ballSpeed = length(b.vx, b.vz);
    const route =
      ballSpeed > 0.2
        ? { x: b.vx / ballSpeed, z: b.vz / ballSpeed }
        : {
            x: (b.x - p.x) / (distance || 1),
            z: (b.z - p.z) / (distance || 1),
          };
    const tx = future.x - route.x * 0.45 - p.x;
    const tz = future.z - route.z * 0.45 - p.z;
    const d = length(tx, tz);
    let cap = Math.min(
      Math.max(requested, speed),
      ballSpeed + Math.sqrt(12 * d),
    );
    if (
      p.sprintRequested &&
      turn < 0.85 &&
      vx * b.vx + vz * b.vz < 0.9 * requested * ballSpeed
    )
      cap = Math.min(cap, Math.max(4, speed * 0.75));
    if (turn < 0.5) cap = Math.min(cap, Math.max(2.6, speed * 0.65));
    const v = Math.min(cap, d * 5);
    p.dribbleState.pursuingTouch = true;
    return { x: d ? (tx / d) * v : 0, z: d ? (tz / d) * v : 0 };
  }
  // Gentle cuts keep running momentum while closing the gap to the next
  // physical shoe contact. Hard reversals still use the braking path below.
  if (
    requested > 3 &&
    turn > 0.4 &&
    distance < 3.5 &&
    length(b.vx, b.vz) > 0.5
  ) {
    const tx = future.x - direction.x * 0.45 - p.x,
      tz = future.z - direction.z * 0.45 - p.z;
    const d = length(tx, tz);
    if (d > 0.5 && ahead > 0.3 && (distance > 1.05 || lateral > 0.35)) {
      const v = Math.max(
        requested * 0.94,
        Math.min(Math.max(requested, speed), d * 5),
      );
      const blend = distance < 1.6 ? 0.4 : 0.15;
      const hx = (tx / d) * (1 - blend) + direction.x * blend,
        hz = (tz / d) * (1 - blend) + direction.z * blend,
        h = length(hx, hz);
      return { x: (hx / h) * v, z: (hz / h) * v };
    }
    return { x: vx, z: vz };
  }
  if (!recovering) return { x: vx, z: vz };
  // Move the athlete to the next contact, not the ball toward the athlete.
  // During a cut, braking/catching the old trajectory precedes the new direction.
  const tx = future.x - direction.x * 0.38 - p.x,
    tz = future.z - direction.z * 0.38 - p.z,
    d = length(tx, tz);
  let cap = Math.max(requested, speed, 3.2);
  // Catch an escaping ball before braking into the requested turn.
  // Capping pursuit speed here lets a sprint touch outrun its own receiver.
  if (turn < 0.5 && distance < 1.85)
    cap = Math.min(cap, Math.max(2.6, speed * 0.65));
  // Arrive at a cut ball with enough room to stop; a full-speed pursuit
  // oscillates past a ball that has just been placed behind the runner.
  const ballApproachSpeed = d ? Math.max(0, (b.vx * tx + b.vz * tz) / d) : 0;
  if (requested > 0.1 || p.lastDribble?.kind === "cut")
    cap = Math.min(cap, ballApproachSpeed + Math.sqrt(2 * 6 * d));
  const v = Math.min(cap, d * 5);
  return { x: d ? (tx / d) * v : 0, z: d ? (tz / d) * v : 0 };
}
export function dribbleImpulse(p, b) {
  const speed = length(p.vx, p.vz),
    intent = p.dribbleIntent || p.moveIntent || { x: 0, z: 0 };
  const requested = length(intent.x, intent.z),
    rhythm = p.closeControl
      ? { interval: 0.25 + Math.min(speed, 4) * 0.02, lead: 0.3 }
      : touchRhythm(speed, p.sprintRequested);
  const turn =
    requested > 0.1 && speed > 0.5
      ? (intent.x * p.vx + intent.z * p.vz) / (requested * speed)
      : 1;
  const previous = p.lastDribble;
  const previousSpeed = previous ? length(previous.vx, previous.vz) : 0;
  const changedDirection =
    requested > 0.1 &&
    previousSpeed > 0.1 &&
    (intent.x * previous.vx + intent.z * previous.vz) /
      (requested * previousSpeed) <
      0.94;
  // A new sprint request arms an escape touch, even while walking.
  // Its contact follows input even if the body still faces the old route.
  // Once consumed, direction changes use the usual short corrective cuts.
  const correcting =
    !p.sprintFirstTouch &&
    (changedDirection || turn < 0.75 || p.dribbleState?.lateral > 0.55);
  const interval = correcting
    ? p.closeControl
      ? 0.24
      : 0.34
    : rhythm.interval;
  const directionDot =
    previousSpeed > 0.1 && requested > 0.1
      ? (intent.x * previous.vx + intent.z * previous.vz) /
        (requested * previousSpeed)
      : turn;
  if (
    !p.shield &&
    correcting &&
    requested > 3 &&
    directionDot > 0.45 &&
    previousSpeed > 2
  ) {
    // Redirect at actual contact, retaining the preceding touch's travel length.
    let launch =
      previousSpeed *
      (0.98 + 0.02 * clamp(directionDot, 0, 1)) *
      (p.sprintRequested ? 1 - 0.35 * (1 - directionDot) : 1);
    if (p.turnAction) launch = Math.min(launch, Math.max(3, speed + 2));
    return {
      vx: (intent.x / requested) * launch,
      vz: (intent.z / requested) * launch,
      interval: rhythm.interval,
      lead: previous.lead,
      kind: "cut",
    };
  }
  if (p.shield && !motionAction(p)) {
    const sh = p.shield,
      interval = 0.32;
    const tx = p.x + p.vx * interval + sh.x * 0.78 + intent.x * 0.14;
    const tz = p.z + p.vz * interval + sh.z * 0.78 + intent.z * 0.14;
    const rx = tx - b.x,
      rz = tz - b.z,
      d = length(rx, rz);
    const launch =
      d < 0.12
        ? 0
        : Math.min(
            12,
            speed > 2
              ? d / interval + 0.5 * ROLL_DECELERATION * interval
              : Math.sqrt(2 * ROLL_DECELERATION * d),
          );
    return {
      vx: d ? (rx / d) * launch : 0,
      vz: d ? (rz / d) * launch : 0,
      interval,
      lead: 0.78,
      kind: "shield",
    };
  }
  if (requested < 0.1) {
    if (p.ballMotion?.style === "sole-stop")
      return { vx: 0, vz: 0, interval: 0.2, kind: "stop", lead: 0 };
    if (speed < 0.8)
      return { vx: 0, vz: 0, interval: 0.2, kind: "stop", lead: 0 };
    // Place the ball beyond the body's predicted braking point, rather than
    // pinning it under a runner who still has forward momentum.
    const hard = b.surface === "court" || b.surface === "street";
    const brakingDistance =
      (speed * speed) / (2 * (b.surface === "sand" ? 7.5 : hard ? 5.5 : 7));
    const dx = p.vx / speed,
      dz = p.vz / speed;
    const travel = Math.max(
      0,
      (p.x - b.x) * dx +
        (p.z - b.z) * dz +
        brakingDistance +
        (b.surface === "sand" ? 0.6 : 0.8),
    );
    const launch = Math.sqrt(
      2 * rollingResistance(b, Math.max(1, speed * 0.55)) * travel,
    );
    return {
      vx: dx * launch,
      vz: dz * launch,
      interval: 0.18,
      kind: "brake",
      lead: travel,
    };
  }
  // At close reach, steer from the ball itself: a change of stick direction
  // must not inherit the old body trajectory, including at sprint speed.
  // A cut is a short placement; the body still brakes through stance forces.
  // Applied only at shoe contact.
  if (
    requested > 0.1 &&
    (correcting ||
      p.sprintFirstTouch ||
      (speed < 4 && (requested < 3.5 || speed < 1.8))) &&
    (correcting || length(b.x - p.x, b.z - p.z) <= 1.12)
  ) {
    const launching = !correcting && p.sprintFirstTouch;
    // Compare identical stick magnitude: sprint max9.775 vs normal6.67m/s.
    const walkRequest = launching ? requested * (5.8 / 8.5) : requested;
    const travel = correcting
      ? clamp(0.28 + requested * 0.045, 0.3, 0.72)
      : clamp(0.28 + walkRequest * 0.12, 0.3, 1.5) * (launching ? 3 : 1);
    const launch = Math.sqrt(2 * ROLL_DECELERATION * travel);
    return {
      vx: (intent.x / requested) * launch,
      vz: (intent.z / requested) * launch,
      interval: launching ? 0.44 : 0.26,
      lead: travel,
      kind: correcting ? "cut" : launching ? "launch" : "steer",
    };
  }
  let ax = (intent.x - p.vx) / interval,
    az = (intent.z - p.vz) / interval;
  const accel = length(ax, az),
    limit = requested < speed ? 8 : 5.5;
  if (accel > limit) {
    ax *= limit / accel;
    az *= limit / accel;
  }
  const dx = requested > 0.1 ? intent.x / requested : p.dx,
    dz = requested > 0.1 ? intent.z / requested : p.dz;
  const lead = correcting ? 0.38 : rhythm.lead;
  const targetX =
    p.x + p.vx * interval + 0.5 * ax * interval * interval + dx * lead;
  const targetZ =
    p.z + p.vz * interval + 0.5 * az * interval * interval + dz * lead;
  const rx = targetX - b.x,
    rz = targetZ - b.z,
    d = length(rx, rz);
  const nominal =
    d / interval + 0.5 * (ROLL_DECELERATION + 0.085 * speed) * interval;
  const launch = Math.min(15.5, nominal);
  return {
    vx: requested > 0.1 ? dx * launch : d ? (rx / d) * launch : 0,
    vz: requested > 0.1 ? dz * launch : d ? (rz / d) * launch : 0,
    interval,
    lead,
    kind: correcting ? "cut" : "push",
  };
}
export function touchDue(p, b, time, horizon) {
  if (!p.lastDribble) return true;
  const future = predictBall(b, horizon);
  const relative = length(
    future.x - p.x - p.vx * horizon,
    future.z - p.z - p.vz * horizon,
  );
  const requested = length(p.dribbleIntent?.x || 0, p.dribbleIntent?.z || 0);
  const intent = p.dribbleIntent;
  const lastSpeed = length(p.lastDribble.vx, p.lastDribble.vz);
  const changedDirection =
    requested > 0.1 &&
    lastSpeed > 0.1 &&
    (intent.x * p.lastDribble.vx + intent.z * p.lastDribble.vz) /
      (requested * lastSpeed) <
      0.94 &&
    length(b.x - p.x, b.z - p.z) <= 1.12;
  const urgent =
    changedDirection ||
    p.dribbleState?.mode === "shield" ||
    p.dribbleState?.mode === "turn" ||
    p.dribbleState?.mode === "recover" ||
    (requested < 0.1 && length(b.vx, b.vz) > 0.3);
  const next = p.lastDribble.time + p.lastDribble.interval;
  return (
    time + horizon >= next ||
    (urgent && time - p.lastDribble.time > 0.15) ||
    (relative < 0.22 && time - p.lastDribble.time > 0.23)
  );
}

// Choose the free side without changing ball position or granting invulnerability.
export function shielding(p, players) {
  let nearest = null,
    distance = 2.1;
  for (const q of players) {
    if (q.team === p.team) continue;
    const d = length(q.x - p.x, q.z - p.z);
    if (d < distance) {
      nearest = q;
      distance = d;
    }
  }
  if (!nearest) return null;
  const d = Math.max(distance, 0.001);
  return {
    rival: nearest.id,
    x: (p.x - nearest.x) / d,
    z: (p.z - nearest.z) / d,
    pressure: clamp((2.1 - distance) / 0.9, 0, 1),
  };
}

export function canContestBall(challenger, owner, ball, time) {
  if (time < (challenger.dispossessedUntil || 0)) return false;
  if (!owner) return true;
  if (owner.keeper && owner.goalkeeping?.holding) return false;
  // A foot cannot collect a protected ball through the carrier's torso/hips.
  const dx = ball.x - challenger.x,
    dz = ball.z - challenger.z;
  const t =
    ((owner.x - challenger.x) * dx + (owner.z - challenger.z) * dz) /
    Math.max(0.0001, dx * dx + dz * dz);
  return !(
    t > 0 &&
    (t < 1 ||
      (challenger.x - owner.x) * (owner.dx || 0) +
        (challenger.z - owner.z) * (owner.dz || 0) <
        0) &&
    length(
      challenger.x + dx * Math.min(1, t) - owner.x,
      challenger.z + dz * Math.min(1, t) - owner.z,
    ) < 0.5
  );
}
