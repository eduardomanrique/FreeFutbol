// Gameplay-calibrated SI units. Ground resistance is contact-only, distinct
// from quadratic aerodynamic drag. Shared by live physics and reach prediction.
export const BALL_RADIUS = 0.11;
export const ROLL_DECELERATION = 5.8;
export function stepBallMotion(b, dt) {
  const grounded = b.y <= BALL_RADIUS + 1e-6 && b.vy <= 0;
  const speed = Math.hypot(b.vx, b.vz);
  // Rotate velocity for curve without introducing energy.
  const turn = b.spin * 0.012 * dt,
    c = Math.cos(turn),
    s = Math.sin(turn);
  const vx = b.vx;
  b.vx = vx * c - b.vz * s;
  b.vz = vx * s + b.vz * c;
  if (grounded) {
    const next = Math.max(0, speed - (ROLL_DECELERATION + 0.085 * speed) * dt);
    const factor = speed > 0 ? next / speed : 0;
    b.vx *= factor;
    b.vz *= factor;
    b.vy = 0;
    b.y = BALL_RADIUS;
  } else {
    const drag = 1 / (1 + 0.0045 * Math.hypot(speed, b.vy) * dt);
    b.vx *= drag;
    b.vz *= drag;
    b.vy = b.vy * drag - 9.81 * dt;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.y += b.vy * dt;
  if (b.y < BALL_RADIUS) {
    const impact = Math.max(0, -b.vy);
    b.y = BALL_RADIUS;
    b.vy = impact > 1 ? impact * 0.48 : 0;
    // Grass impact dissipates tangential energy too, but a settled ball isn't
    // charged this impact loss again every frame.
    const retention = 1 - Math.min(0.18, impact * 0.018);
    b.vx *= retention;
    b.vz *= retention;
  }
  if (grounded && Math.hypot(b.vx, b.vz) < 0.025) b.vx = b.vz = 0;
  b.spin *= Math.exp(-dt * (grounded ? 1.7 : 0.45));
}
