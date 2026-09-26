const clamp = (v) => Math.max(0, Math.min(1, v));
export const ease = (v) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
export const SLIDE_DURATION = 1.38;
export const FALL_DURATION = 1.6;
export const bicycleDuration = (contactAt = 0.42) => contactAt + 1.35;

// Shared clocks: contact, landing and the push from the hands are visible phases.
export function slidePose(time) {
  const enter = ease(time / 0.14),
    sit = ease((time - 0.5) / 0.25);
  const rise = ease((time - 0.86) / 0.52);
  return {
    phase: time < 0.5 ? "slide" : time < 0.86 ? "sit" : "push-up",
    pelvis: mix(1.02 - 0.78 * enter - 0.16 * sit, 1.02, rise),
    pitch: -0.45 * enter * (1 - rise),
    head: 0.32 * enter * (1 - rise),
    reach: mix(0.94, 0.06, rise),
    other: mix(0.34, 0.06, rise),
    hands: sit * (1 - ease((time - 0.93) / 0.16)),
    rise,
  };
}
export function fallPose(time) {
  const fall = ease(time / 0.22),
    push = ease((time - 0.48) / 0.4);
  const stand = ease((time - 1.02) / 0.58);
  return {
    phase: time < 0.48 ? "fall" : time < 1.02 ? "push-up" : "stand",
    pelvis: mix(mix(1.02, 0.3, fall) + 0.1 * push, 1.02, stand),
    pitch: (1.35 * fall - 0.2 * push) * (1 - stand),
    hands: fall * (1 - ease((time - 1.12) / 0.25)),
    stand,
  };
}
export function bicyclePose(time, contactAt = 0.42) {
  const load = ease(time / Math.max(0.08, contactAt * 0.45));
  const launch = ease(
    (time - contactAt * 0.45) / Math.max(0.08, contactAt * 0.55),
  );
  const land = ease((time - contactAt - 0.08) / 0.48);
  const rise = ease((time - contactAt - 0.76) / 0.59);
  const roll = ease((time - contactAt - 0.62) / 0.3);
  return {
    phase:
      time < contactAt * 0.45
        ? "load"
        : time < contactAt
          ? "launch"
          : land < 1
            ? "fall"
            : rise < 0.01
              ? "back"
              : "stand",
    pitch: mix(-1.48 * load, -0.12, roll) * (1 - rise),
    pelvis: mix(
      mix(1.02 - 0.22 * load + 0.42 * launch, 0.24, land),
      1.02,
      rise,
    ),
    strikeHeight:
      mix(0.12 + 1.88 * launch, 0.12, land) * (1 - rise) + 0.08 * rise,
    otherHeight: mix(0.12 + 1.08 * load, 0.1, land),
    hands:
      ease((time - contactAt) / 0.28) *
      (1 - ease((time - contactAt - 1.08) / 0.2)),
    rise,
    land,
    launch,
    load,
  };
}
