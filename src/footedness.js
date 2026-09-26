// Physical feet are [right, left]; the skinned rig stores [left, right].
export const FOOTEDNESS = ["right", "left", "both"];
export const preferredFoot = (p, available = 0) =>
  p.footedness === "both" ? available : p.footedness === "left" ? 1 : 0;
export const rigFoot = (physicalFoot) => 1 - physicalFoot;
