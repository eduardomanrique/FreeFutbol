import { stepBallMotion } from "./ball-physics.js";
// Free-flight estimate. Recomputed during play so bounces/contact move the mark.
export function predictLanding(ball) {
  if (ball.owner != null || ball.y < 0.4 || !Number.isFinite(ball.vy))
    return null;
  const future = { ...ball };
  for (let time = 1 / 60; time <= 6; time += 1 / 60) {
    stepBallMotion(future, 1 / 60);
    if (future.y <= 0.115) return { x: future.x, z: future.z, time };
  }
  return null;
}
