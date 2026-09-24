import * as THREE from "three";

export function followCamera(
  camera,
  look,
  { ball, playing, wide, mobile, width },
  dt,
) {
  const target = new THREE.Vector3(),
    cam = new THREE.Vector3();
  if (playing) {
    const leadX = THREE.MathUtils.clamp(ball.vx * 0.12, -3, 3);
    const leadZ = THREE.MathUtils.clamp(ball.vz * 0.12, -2, 2);
    const groundHeight = wide ? 0 : Math.min(1.5, ball.y * 0.25);
    if (mobile) {
      // Frame the ball itself, including lofted crosses and the touchlines.
      // The tactical overview's centre/field clamps don't suit a close view.
      target.set(ball.x + leadX, ball.y, ball.z + leadZ);
      cam
        .set(3, (wide ? 69 : 25) - groundHeight, wide ? 66 : 31)
        .multiplyScalar(wide ? 0.65 : 0.55)
        .add(target);
    } else {
      const bx = THREE.MathUtils.clamp(
        wide ? ball.x * 0.7 : ball.x + leadX,
        wide ? -29 : -42,
        wide ? 29 : 42,
      );
      const bz = THREE.MathUtils.clamp(
        wide ? ball.z * 0.36 : ball.z + leadZ,
        wide ? -10 : -25,
        wide ? 10 : 25,
      );
      target.set(bx, groundHeight, bz);
      cam.set(bx + 3, wide ? 69 : 25, bz + (wide ? 66 : 31));
      if (width < 650) {
        cam.y *= wide ? 1.35 : 1.16;
        cam.z += wide ? 12 : 5;
      }
    }
  } else {
    target.set(2, 0, -3);
    cam.set(53, 74, 81);
    if (width < 650) cam.set(70, 110, 105);
  }
  // Exponential following stays continuous and independent of frame rate.
  // Mobile catches up sooner so a fast pass cannot outrun the tighter view.
  const blend =
    1 - Math.exp(-Math.max(0, dt) * (playing ? (mobile ? 6 : 3) : 1.7));
  camera.position.lerp(cam, blend);
  look.lerp(target, blend);
  camera.lookAt(look);
}
