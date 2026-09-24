import { motionAction } from "./action-state.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Gameplay calibration informed by support-leg braking and trunk/pelvis
// coordination, not a universal anatomical angle or measured mocap sequence.
export function strikePosture(action) {
  const running = clamp((action?.approachSpeed || 0) / 8.5, 0, 1);
  const conventional =
    action && !["backheel", "overhead"].includes(action.style?.name);
  const amount = conventional ? running : 0;
  return {
    behind: 0.4,
    lean: 0.008 + 0.022 * amount,
    hipBack: 0,
  };
}

export function stepBodyExpression(p, dt) {
  const l = p.locomotion;
  const e = (l.expression ||= {
    shift: 0,
    twist: 0,
    lean: 0,
    arms: 0,
    hipBack: 0,
    strikeLean: 0,
    crouch: 0,
    fold: 0,
    strikeArms: 0,
  });
  const speed = Math.hypot(p.vx, p.vz);
  const intent = p.turnIntent || p.dribbleIntent;
  const wanted =
    intent && Math.hypot(intent.x, intent.z) > 0.1
      ? Math.atan2(intent.x, intent.z)
      : l.heading;
  const error = Math.atan2(
    Math.sin(wanted - l.heading),
    Math.cos(wanted - l.heading),
  );
  const turning = clamp(error / 1.2, -1, 1);
  const active =
    p.dribbleState && !motionAction(p) && !p.recovery && !p.shield
      ? clamp(speed / 0.8, 0, 1)
      : 0;
  // Transfer weight with actual supports. No idle dance or input delay.
  const transfer = -(l.loadShift || 0);
  const softness = 1 - 0.55 * clamp(speed / 9, 0, 1);
  const sway = active * (turning * 0.8 + transfer * 0.25 * softness);
  const action = motionAction(p);
  const follow = l.strikeFollow;
  if (follow) {
    follow.time += dt;
    if (follow.time >= 0.7 || action || p.recovery || p.keeper)
      l.strikeFollow = null;
  }
  const followActive = l.strikeFollow;
  const progress = followActive ? clamp(followActive.time / 0.7, 0, 1) : 0;
  // The release continues past neutral: peak forward projection after contact,
  // then a gradual return. No extra horizontal impulse is injected.
  const followWave = followActive
    ? Math.sin(Math.PI * Math.pow(progress, 0.65))
    : 0;
  const followAmount = followActive
    ? (0.45 +
        0.3 * clamp(followActive.approachSpeed / 8.5, 0, 1) +
        0.25 * followActive.power) *
      followWave
    : 0;
  const posture = strikePosture(action);
  const plant = p.strikePlant && l.feet[p.strikePlant.foot].contact;
  const phase =
    p.ballMotion?.kind === "strike" ? l.feet[p.ballMotion.foot].phase : 0;
  // Load behind the planted support, then follow through toward the ball.
  const loading =
    action && !action.firstTime
      ? plant
        ? 1 - clamp((phase - 0.4) / 0.6, 0, 1)
        : 0.45
      : 0;
  const doubleSupport = l.feet.every((f) => f.contact) ? 1 : 0;
  const ginga =
    active * clamp(Math.abs(turning) * 0.8 + (l.cutBlend || 0) * 0.4, 0, 1);
  const targets = {
    shift: 0.055 * sway,
    twist: active * (0.32 * turning + transfer * 0.05 * softness),
    lean: 0.22 * sway,
    arms:
      active * (Math.abs(turning) * 0.32 + Math.abs(transfer) * 0.04) +
      (action ? 0.12 + 0.3 * clamp(action.approachSpeed / 8.5, 0, 1) : 0) *
        loading,
    strikeArms:
      (action ? 0.18 + 0.42 * clamp(action.approachSpeed / 8.5, 0, 1) : 0) *
        loading -
      0.3 * followAmount,
    crouch: ginga * (0.11 + 0.04 * doubleSupport),
    fold: ginga * 0.34,
    hipBack: posture.hipBack * loading - 0.16 * followAmount,
    strikeLean: posture.lean * loading - 0.38 * followAmount,
  };
  for (const key of Object.keys(targets)) e[key] ??= 0;
  for (const key of Object.keys(targets))
    e[key] +=
      (targets[key] - e[key]) *
      (1 -
        Math.exp(
          -dt *
            (followActive && (key === "hipBack" || key === "strikeLean")
              ? 18
              : key === "twist"
                ? 10
                : 8),
        ));
  return e;
}
