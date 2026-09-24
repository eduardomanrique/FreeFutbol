import * as T from "three";
import { solveKneeHinge } from "./leg-hinge.js";

const smooth = (v) => (v = T.MathUtils.clamp(v, 0, 1)) * v * (3 - 2 * v);
// Hip flexion, knee flexion, hip abduction. The thigh does the lifting;
// the knee stays folded and opens only about 18 degrees over the low ball.
const keys = [
  [0, 1.25, 1.75, 0],
  [0.22, 2.1, 2.04, 0.42],
  [0.43, 2.75, 1.72, 0.22],
  [0.57, 2.75, 1.72, -0.2],
  [0.77, 1.95, 2.02, -0.3],
  [1, 1.25, 1.75, 0],
];
export function aroundJoints(phase) {
  phase = T.MathUtils.clamp(phase, 0, 1);
  const i = Math.max(
    1,
    keys.findIndex((k) => k[0] >= phase),
  );
  const a = keys[i - 1],
    b = keys[i];
  const t = smooth((phase - a[0]) / (b[0] - a[0]));
  return {
    hip: T.MathUtils.lerp(a[1], b[1], t),
    knee: T.MathUtils.lerp(a[2], b[2], t),
    abduction: T.MathUtils.lerp(a[3], b[3], t),
    weight: smooth(phase / 0.2) * smooth((1 - phase) / 0.2),
  };
}
export function poseAroundLeg(leg, forward, side, phase, weight) {
  const pose = aroundJoints(phase),
    hinge = leg.hip.userData.kneeHinge;
  const h = leg.hip.getWorldPosition(new T.Vector3());
  const k = leg.shin.getWorldPosition(new T.Vector3());
  const f = leg.foot.getWorldPosition(new T.Vector3());
  const hipBase = leg.hip.quaternion.clone(),
    shinBase = leg.shin.quaternion.clone();
  const ankleWorld = leg.foot.getWorldQuaternion(new T.Quaternion());
  const direction = (angle) =>
    forward
      .clone()
      .multiplyScalar(Math.sin(angle))
      .add(new T.Vector3(0, -Math.cos(angle), 0))
      .applyAxisAngle(forward, pose.abduction * side);
  const knee = h.clone().addScaledVector(direction(pose.hip), h.distanceTo(k));
  const ankle = knee
    .clone()
    .addScaledVector(direction(pose.hip - pose.knee), k.distanceTo(f));
  solveKneeHinge(leg.hip, leg.shin, leg.foot, knee, ankle, hinge);
  const amount = pose.weight * weight;
  leg.hip.quaternion.slerpQuaternions(
    hipBase,
    leg.hip.quaternion.clone(),
    amount,
  );
  // Both endpoints rotate about the same hinge: interpolation cannot add twist.
  leg.shin.quaternion.slerpQuaternions(
    shinBase,
    leg.shin.quaternion.clone(),
    amount,
  );
  leg.hip.updateWorldMatrix(false, true);
  leg.foot.quaternion
    .copy(leg.shin.getWorldQuaternion(new T.Quaternion()).invert())
    .multiply(ankleWorld);
  leg.foot.updateWorldMatrix(false, true);
}
