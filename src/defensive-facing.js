const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Close marking only; hysteresis avoids flickering at the distance boundary.
export function defensiveFacing(
  p,
  ball,
  dt,
  { enabled, sprint = false, x = 0, z = 0 },
) {
  const l = p.locomotion;
  const ballHeading = Math.atan2(ball.x - p.x, ball.z - p.z);
  const look = enabled
    ? Math.max(-0.9, Math.min(0.9, wrap(ballHeading - l.heading)))
    : 0;
  p.ballLookYaw =
    (p.ballLookYaw || 0) +
    (look - (p.ballLookYaw || 0)) * (1 - Math.exp(-dt * 9));
  if (!enabled) {
    l.defensiveFacing = null;
    return undefined;
  }
  const gap = Math.hypot(ball.x - p.x, ball.z - p.z);
  const wasMarking = l.defensiveFacing?.marking;
  const marking = !sprint && gap <= (wasMarking ? 3.6 : 3);
  l.defensiveFacing = { marking };
  return marking ? ballHeading : undefined;
}
