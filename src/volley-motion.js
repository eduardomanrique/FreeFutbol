export const VOLLEY_PREPARE = 0.16;
export const VOLLEY_AIR_TIME = 3.7 / 4.905;
export const VOLLEY_LANDING = VOLLEY_PREPARE + VOLLEY_AIR_TIME;
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
// Preparation, flight and landing share one clock with the contact surface.
export function volleyJumpPose(action, time) {
  if (action?.jumpAt == null)
    return { height: 0, crouch: 0, lean: 0, phase: "ground" };
  const age = Math.max(0, time - action.jumpAt);
  const t = age - VOLLEY_PREPARE;
  if (t < 0) {
    const load = age < 0.1 ? smooth(age / 0.1) : 1 - smooth((age - 0.1) / 0.06);
    return {
      height: 0,
      crouch: 0.19 * load,
      lean: 0.22 * load,
      phase: "prepare",
    };
  }
  if (age < VOLLEY_LANDING)
    return {
      height: Math.max(0, 3.7 * t - 4.905 * t * t),
      crouch: 0,
      lean: 0,
      phase: "air",
    };
  const landed = age - VOLLEY_LANDING;
  const absorb = smooth(landed / 0.06) * (1 - smooth((landed - 0.06) / 0.22));
  return {
    height: 0,
    crouch: 0.14 * absorb,
    lean: 0.13 * absorb,
    phase: landed < 0.28 ? "land" : "ground",
  };
}
export function volleyJump(action, time) {
  return volleyJumpPose(action, time).height;
}
export function volleyFootSurface(player, action, time) {
  const h = action.heading;
  return {
    x: player.x + Math.sin(h) * 0.38,
    z: player.z + Math.cos(h) * 0.38,
    y: 1.68 + volleyJump(action, time),
  };
}
