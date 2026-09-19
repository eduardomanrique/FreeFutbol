const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Near/body reception needs no input; longer reaches use the intentional cone.
export { receptionOpportunity as planBallReach } from "./reception.js";
export function resolvePlayerContacts(players) {
  // Two sequential impulse passes over 231 pairs. Capsule footprints on a
  // level pitch; mass-aware normal impulse, capped tangential friction.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i],
          b = players[j];
        let dx = b.x - a.x,
          dz = b.z - a.z,
          d = Math.hypot(dx, dz);
        if (d >= 0.72) continue;
        if (d < 1e-8) {
          dx = 1;
          dz = 0;
          d = 0;
        }
        const nx = d ? dx / d : 1,
          nz = d ? dz / d : 0;
        const ia = 1 / (a.locomotion?.mass || 78),
          ib = 1 / (b.locomotion?.mass || 78),
          inv = ia + ib;
        const rvx = b.vx - a.vx,
          rvz = b.vz - a.vz,
          vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          const impulse = (-(1 + 0.03) * vn) / inv;
          const tangent = clamp(
            -(rvx * -nz + rvz * nx) / inv,
            -0.28 * impulse,
            0.28 * impulse,
          );
          const jx = impulse * nx - tangent * nz,
            jz = impulse * nz + tangent * nx;
          a.vx -= jx * ia;
          a.vz -= jz * ia;
          b.vx += jx * ib;
          b.vz += jz * ib;
          for (const [p, sign, m] of [
            [a, -1, ia],
            [b, 1, ib],
          ])
            if (p.locomotion) {
              p.locomotion.leanVX += sign * jx * m * 0.12;
              p.locomotion.leanVZ += sign * jz * m * 0.12;
              p.locomotion.impact = Math.max(
                p.locomotion.impact || 0,
                Math.min(1, (impulse * m) / 4),
              );
            }
        }
        const correction =
          Math.min(0.12, Math.max(0, 0.72 - d - 0.002) * 0.7) / inv;
        a.x -= nx * correction * ia;
        a.z -= nz * correction * ia;
        b.x += nx * correction * ib;
        b.z += nz * correction * ib;
      }
}

export function footBallDistance(f, b) {
  // Centre of the rendered shoe, rather than an invisible ring around the body.
  return Math.hypot(
    f.x + Math.sin(f.heading) * 0.075 - b.x,
    f.y - 0.025 - b.y,
    f.z + Math.cos(f.heading) * 0.075 - b.z,
  );
}

export function deflectBall(b, p) {
  // Relative normal response works for frontal and lateral hits alike.
  const dx = b.x - p.x,
    dz = b.z - p.z,
    d = Math.hypot(dx, dz) || 1;
  const nx = dx / d,
    nz = dz / d,
    rx = b.vx - p.vx,
    rz = b.vz - p.vz;
  const vn = rx * nx + rz * nz;
  if (vn >= 0) return false;
  const tx = rx - vn * nx,
    tz = rz - vn * nz;
  b.vx = p.vx - 0.4 * vn * nx + 0.8 * tx;
  b.vz = p.vz - 0.4 * vn * nz + 0.8 * tz;
  b.vy = Math.max(b.vy, 0.8);
  b.lastTeam = p.team;
  return true;
}
