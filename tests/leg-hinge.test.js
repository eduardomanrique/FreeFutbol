import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { bindKneeHinge, solveKneeHinge } from "../src/leg-hinge.js";
test("knee bends about one local axis while the hip steers a complete circle", () => {
  const root = new T.Group(),
    hip = new T.Bone(),
    shin = new T.Bone(),
    foot = new T.Bone();
  root.add(hip);
  hip.add(shin);
  shin.add(foot);
  hip.position.y = 1;
  shin.position.y = foot.position.y = -0.45;
  root.rotation.y = 0.7;
  root.updateMatrixWorld(true);
  const hinge = bindKneeHinge(hip, shin, foot),
    h = hip.getWorldPosition(new T.Vector3());
  for (let i = 0; i < 121; i++) {
    const angle = (i / 120) * Math.PI * 2,
      steer = new T.Quaternion().setFromEuler(
        new T.Euler(-0.9, angle, 0.2 * Math.sin(angle)),
      );
    const upper = new T.Vector3(0, -0.45, 0).applyQuaternion(steer);
    const lower = new T.Vector3(0, -0.45, 0)
      .applyAxisAngle(new T.Vector3(1, 0, 0), 1.1)
      .applyQuaternion(steer);
    const knee = h.clone().add(upper),
      goal = knee.clone().add(lower);
    solveKneeHinge(hip, shin, foot, knee, goal, hinge);
    assert.ok(foot.getWorldPosition(new T.Vector3()).distanceTo(goal) < 1e-7);
    const delta = shin.quaternion
      .clone()
      .multiply(hinge.shinRest.clone().invert());
    const v = new T.Vector3(delta.x, delta.y, delta.z),
      off = v.clone().addScaledVector(hinge.axis, -v.dot(hinge.axis));
    assert.ok(off.length() < 1e-8, "no twisting or side-bending at the knee");
  }
});
