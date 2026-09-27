import { stepLocomotion } from "./locomotion.js";
import { preferredFoot } from "./footedness.js";
import { naturalCarryVelocity } from "./walking-carry.js";
import { stepBallMotion } from "./ball-physics.js";

// Forecast the same unopposed gait, without moving the live player or ball.
export function nextStrideContact(p, steps, ball = null) {
  const q = {
    ...p,
    locomotion: structuredClone(p.locomotion),
    dribbleState: structuredClone(p.dribbleState),
    // A cut still has a follow-through before ordinary strides resume. Keep
    // that phase in the forecast; replacing it with a normal swing changes
    // the time of the next dominant-foot contact.
    ballMotion: p.ballMotion?.naturalCarry
      ? null
      : structuredClone(p.ballMotion),
  };
  const rolling = ball && { ...ball };
  const index = preferredFoot(p);
  const start = q.locomotion.feet.reduce((n, f) => n + f.landings, 0);
  const phase = ball ? 0.85 : 0.7;
  const dt = 1 / 120;
  for (let time = dt; time < 2.5; time += dt) {
    if (rolling && time > 0.55) q.faceHeading = undefined;
    q.sprintLaunch = Math.max(0, (p.sprintLaunch || 0) - time / 0.65);
    const velocity = rolling
      ? naturalCarryVelocity(q, rolling, p.dribbleIntent.x, p.dribbleIntent.z)
      : p.dribbleIntent;
    stepLocomotion(q, velocity.x, velocity.z, dt);
    if (rolling) stepBallMotion(rolling, dt);
    const f = q.locomotion.feet[index];
    const landings = q.locomotion.feet.reduce(
      (n, foot) => n + foot.landings,
      0,
    );
    if (landings - start >= steps && !f.contact && f.phase >= phase) {
      const speed = Math.hypot(p.dribbleIntent.x, p.dribbleIntent.z);
      const dx = p.dribbleIntent.x / speed,
        dz = p.dribbleIntent.z / speed;
      const side = index === 0 ? -1 : 1;
      return {
        period: time,
        ball: rolling,
        target: {
          x: rolling ? f.x : q.x + dx * 0.25 + dz * side * 0.13,
          z: rolling ? f.z : q.z + dz * 0.25 - dx * side * 0.13,
        },
      };
    }
  }
  return null;
}

// Solve against the same ball-following gait used in the game. This matters
// after a cut, when the body must first close a lateral offset to the ball.
export function cutCarryImpulse(p, b, heading, steps) {
  const dx = Math.sin(heading),
    dz = Math.cos(heading);
  const requested = Math.hypot(p.dribbleIntent.x, p.dribbleIntent.z);
  const speed = Math.hypot(p.vx, p.vz) * 0.94;
  const exiting = {
    ...p,
    turnAction: null,
    faceHeading: heading,
    turnIntent: p.dribbleIntent,
    vx: dx * speed,
    vz: dz * speed,
    lastDribble: { kind: "cut", vx: dx, vz: dz, walkingPlan: { requested } },
  };
  let lane = (preferredFoot(p) === 0 ? -1 : 1) * 0.13;
  let launch, forecast;
  for (let pass = 0; pass < 3; pass++) {
    exiting.lastDribble.walkingPlan.lane = lane;
    let lo = 0,
      hi = 30;
    for (let i = 0; i < 12; i++) {
      launch = (lo + hi) / 2;
      const trial = nextStrideContact(exiting, steps, {
        ...b,
        vx: dx * launch,
        vz: dz * launch,
      });
      if (
        !trial ||
        (trial.ball.x - trial.target.x) * dx +
          (trial.ball.z - trial.target.z) * dz <
          0
      )
        lo = launch;
      else hi = launch;
      if (trial) forecast = trial;
    }
    if (pass < 2 && forecast) {
      const error =
        (forecast.ball.x - forecast.target.x) * dz -
        (forecast.ball.z - forecast.target.z) * dx;
      lane = Math.max(-0.35, Math.min(0.35, lane - error));
    }
  }
  const period = forecast?.period ?? 0.8;
  return {
    vx: dx * launch,
    vz: dz * launch,
    kind: "cut",
    lead: 0.25,
    interval: period * 0.8,
    walkingPlan: {
      target: forecast?.target,
      period,
      pace: requested,
      requested,
      steps,
      lane,
    },
  };
}
