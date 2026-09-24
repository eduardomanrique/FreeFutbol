// Holding Shoot is only a power/aim input. Body preparation begins on release.
export const motionAction = (p) =>
  p.ballAction?.type === "shoot" && p.ballAction.stage === "charging"
    ? null
    : p.ballAction;
