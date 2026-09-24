import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { followCamera } from "../src/camera.js";
function fixture(wide = false) {
  const camera = new THREE.PerspectiveCamera(43, 844 / 390, 0.3, 350),
    look = new THREE.Vector3();
  const ball = { x: 0, z: 0, y: 0.11, vx: 0, vz: 0 };
  const state = { ball, playing: true, wide, mobile: true, width: 844 };
  const step = (dt) => {
    followCamera(camera, look, state, dt);
    camera.updateMatrixWorld();
    return new THREE.Vector3(ball.x, ball.y, ball.z).project(camera);
  };
  step(10);
  return { camera, look, ball, state, step };
}
test("mobile keeps fast shots, airborne crosses and both pitch edges visible in both views", () => {
  for (const wide of [false, true])
    for (const fps of [30, 60, 120]) {
      const { ball, camera, step } = fixture(wide);
      let previous = camera.position.clone();
      for (let i = 0; i < fps * 8; i++) {
        const t = i / fps,
          phase = Math.floor(t / 2),
          u = (t % 2) / 2;
        // Continuous zig-zag along the full length/width, including high crosses.
        ball.x =
          phase === 0
            ? 46 * u
            : phase === 1
              ? 46 - 92 * u
              : phase === 2
                ? -46 + 46 * u
                : 0;
        ball.z =
          phase === 0
            ? 30 * u
            : phase === 1
              ? 30 - 60 * u
              : phase === 2
                ? -30 + 60 * u
                : 30 - 30 * u;
        ball.y = 0.11 + 8 * Math.sin(Math.PI * u);
        ball.vx = phase === 0 ? 23 : phase === 1 ? -46 : phase === 2 ? 23 : 0;
        ball.vz = phase === 0 ? 15 : phase === 1 ? -30 : phase === 2 ? 30 : -15;
        const projected = step(1 / fps);
        assert.ok(
          Math.abs(projected.x) < 0.8 && Math.abs(projected.y) < 0.7,
          JSON.stringify({ wide, fps, t, projected }),
        );
        assert.ok(
          camera.position.distanceTo(previous) < 3,
          "continuous camera movement",
        );
        previous.copy(camera.position);
      }
      ball.vx = ball.vz = 0;
      for (let i = 0; i < fps; i++) step(1 / fps);
      const centre = step(1 / fps);
      assert.ok(
        Math.abs(centre.x) < 0.015 && Math.abs(centre.y) < 0.015,
        "settles on ball",
      );
    }
});
test("mobile keeps the close zoom and centres on high balls at corners", () => {
  for (const wide of [false, true]) {
    const { ball, look, camera, step, state } = fixture(wide);
    Object.assign(ball, { x: 46, z: 30, y: 7 });
    step(10);
    const mobileDistance = camera.position.distanceTo(look);
    assert.ok(look.distanceTo(new THREE.Vector3(46, 7, 30)) < 1e-6);
    state.mobile = false;
    step(10);
    assert.ok(
      Math.abs(
        mobileDistance / camera.position.distanceTo(look) -
          (wide ? 0.65 : 0.55),
      ) < 1e-6,
    );
  }
});
