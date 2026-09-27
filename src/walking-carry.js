import { motionAction } from "./action-state.js";
import { stepBallMotion } from "./ball-physics.js";
import { preferredFoot } from "./footedness.js";

export function walkingGait(p) {
  const turn = p.turnAction;
  return (
    !!p.walkRequested &&
    !p.shield &&
    (!turn || (turn.kind === "cut" && Math.abs(turn.delta) < 1.05))
  );
}

export function naturalGait(p) {
  return (
    !p.shield &&
    !p.keeper &&
    !p.field?.altinha &&
    !p.field?.footvolley &&
    !motionAction(p) &&
    (p.walkRequested ||
      Math.hypot(p.dribbleIntent?.x || 0, p.dribbleIntent?.z || 0) > 0.1) &&
    (!p.turnAction ||
      walkingGait(p) ||
      (p.turnAction.kind === "cut" &&
        Math.abs(p.turnAction.delta) < 1.05 &&
        p.turnAction.phase === "exit"))
  );
}

export function carrySteps(p) {
  return p.walkRequested ||
    Math.hypot(p.dribbleIntent?.x || 0, p.dribbleIntent?.z || 0) < 3
    ? 2
    : p.sprintRequested
      ? 6
      : 4;
}

export function naturalCarry(p) {
  return (
    !!p.locomotion &&
    naturalGait(p) &&
    (!p.lastDribble ||
      walkingGait(p) ||
      p.dribbleIntent.x * p.lastDribble.vx +
        p.dribbleIntent.z * p.lastDribble.vz >=
        0.94 *
          Math.hypot(p.dribbleIntent.x, p.dribbleIntent.z) *
          Math.hypot(p.lastDribble.vx, p.lastDribble.vz)) &&
    Math.hypot(p.dribbleIntent?.x || 0, p.dribbleIntent?.z || 0) > 0.1
  );
}

// Solve the *contact impulse*, not the ball position between contacts.
// The next encounter follows the gait cycle and the player's intended pace.
export function naturalImpulse(p, b, forecast = null) {
  const intent = p.dribbleIntent;
  const requested = Math.hypot(intent.x, intent.z);
  const dx = intent.x / requested,
    dz = intent.z / requested;
  const period =
    forecast?.period ??
    Math.max(
      0.36,
      carrySteps(p) *
        (p.locomotion.actualStrideInterval ||
          p.locomotion.strideInterval ||
          0.25),
    );
  const side = preferredFoot(p) === 0 ? -1 : 1;
  const pace = Math.min(
    requested,
    Math.max(
      0.3,
      Math.hypot(p.vx, p.vz) + (p.walkRequested ? 0 : period * 2.5),
    ),
  );
  const target = forecast?.target ?? {
    x: p.x + dx * (pace * period + 0.25) + dz * side * 0.13,
    z: p.z + dz * (pace * period + 0.25) - dx * side * 0.13,
  };
  const rx = target.x - b.x,
    rz = target.z - b.z;
  const distance = Math.hypot(rx, rz);
  let lo = 0,
    hi = 30;
  for (let n = 0; n < 16; n++) {
    const speed = (lo + hi) / 2;
    const probe = {
      ...b,
      x: 0,
      z: 0,
      y: 0.11,
      vx: speed,
      vz: 0,
      vy: 0,
      spin: 0,
    };
    for (let t = 0; t < period; t += 1 / 120)
      stepBallMotion(probe, Math.min(1 / 120, period - t));
    if (probe.x < distance) lo = speed;
    else hi = speed;
  }
  const speed = (lo + hi) / 2;
  return {
    vx: distance > 0.001 ? (rx / distance) * speed : 0,
    vz: distance > 0.001 ? (rz / distance) * speed : 0,
    interval: period * 0.8,
    lead: 0.25,
    kind: "push",
    walkingPlan: { target, period, pace, requested, steps: carrySteps(p) },
  };
}

// Shared by the live dribbler and the forecast after a cut.
export function naturalCarryVelocity(p, b, vx, vz) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const length = Math.hypot;
  const requested = length(vx, vz);
  const direction = { x: vx / requested, z: vz / requested };
  const side = preferredFoot(p) === 0 ? -1 : 1;
  const lane = p.lastDribble?.walkingPlan?.lane ?? side * 0.13;
  const along = (b.x - p.x) * direction.x + (b.z - p.z) * direction.z;
  const across = (b.x - p.x) * direction.z - (b.z - p.z) * direction.x;
  if (!p.lastDribble && Math.abs(across - lane) > 0.3) {
    const tx = b.x - direction.x * 0.25 - direction.z * side * 0.13 - p.x;
    const tz = b.z - direction.z * 0.25 + direction.x * side * 0.13 - p.z;
    const d = Math.hypot(tx, tz),
      v = Math.min(requested, d * 5);
    return { x: (tx / (d || 1)) * v, z: (tz / (d || 1)) * v };
  }
  const plan = p.lastDribble?.walkingPlan;
  // An acceleration request cannot change the impulse already given to the
  // ball. Keep the old pace until the next foot contact can launch it again.
  const carryPace = Math.min(requested, plan?.requested ?? requested);
  const pace =
    p.lastDribble && along < -0.2
      ? clamp((along - 0.25) * 4, -1.5, carryPace)
      : p.walkRequested
        ? clamp(requested + (along - 0.25) * 1.5, 0, requested * 1.15)
        : plan || (p.lastDribble && length(b.vx, b.vz) > 0.3)
          ? clamp(carryPace + Math.min(0, along - 0.25) * 8, -1.5, carryPace)
          : clamp(
              (along - 0.1) * 4,
              p.lastDribble?.kind === "stop" ? 0.6 : -1.5,
              requested,
            );
  const lateralSpeed =
    p.walkRequested || !p.lastDribble
      ? clamp((across - lane) * 3, -0.6, 0.6)
      : clamp((across - lane) * 6, -2.5, 2.5);
  if (p.dribbleState) p.dribbleState.mode = "carry";
  return {
    x: direction.x * pace + direction.z * lateralSpeed,
    z: direction.z * pace - direction.x * lateralSpeed,
  };
}
