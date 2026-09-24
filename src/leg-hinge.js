import * as T from "three";
const frame = (normal, upper) =>
  new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(
      normal,
      upper,
      new T.Vector3().crossVectors(normal, upper).normalize(),
    ),
  );
export function bindKneeHinge(
  hip,
  shin,
  foot,
  forward = new T.Vector3(0, 0, 1),
) {
  hip.updateWorldMatrix(true, true);
  const h = hip.getWorldPosition(new T.Vector3()),
    k = shin.getWorldPosition(new T.Vector3()),
    f = foot.getWorldPosition(new T.Vector3());
  const upper = k.clone().sub(h).normalize(),
    lower = f.clone().sub(k).normalize();
  let normal = new T.Vector3().crossVectors(upper, lower);
  const right = new T.Vector3().crossVectors(forward, upper).normalize();
  if (normal.lengthSq() < 1e-6) normal.copy(right);
  else {
    normal.normalize();
    if (normal.dot(right) < 0) normal.negate();
  }
  const hipWorld = hip.getWorldQuaternion(new T.Quaternion());
  return {
    axis: normal.clone().applyQuaternion(hipWorld.clone().invert()),
    shinRest: shin.quaternion.clone(),
    hipFrameOffset: frame(normal, upper).invert().multiply(hipWorld),
    restFlex: Math.atan2(
      new T.Vector3().crossVectors(upper, lower).dot(normal),
      upper.dot(lower),
    ),
  };
}
export function solveKneeHinge(hip, shin, foot, knee, goal, hinge) {
  const h = hip.getWorldPosition(new T.Vector3());
  const upper = knee.clone().sub(h).normalize(),
    lower = goal.clone().sub(knee).normalize();
  const normal = new T.Vector3().crossVectors(upper, lower).normalize();
  const flex = Math.acos(T.MathUtils.clamp(upper.dot(lower), -1, 1));
  const hipWorld = frame(normal, upper).multiply(hinge.hipFrameOffset);
  const parentWorld = hip.parent.getWorldQuaternion(new T.Quaternion());
  hip.quaternion.copy(parentWorld.invert()).multiply(hipWorld);
  // The only degree of freedom below the femur is knee flexion. All steering
  // of the bend plane is carried by the hip, never by tibial axial rotation.
  shin.quaternion
    .setFromAxisAngle(hinge.axis, flex - hinge.restFlex)
    .multiply(hinge.shinRest);
  hip.updateWorldMatrix(false, true);
}
