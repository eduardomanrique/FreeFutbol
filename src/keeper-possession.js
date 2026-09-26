export function keeperArea(field) {
  if (field.surface === "sand") return { depth: 9, width: field.halfWidth };
  if (field.surface === "court") return { depth: 6, width: 6, round: true };
  return {
    depth: Math.min(16.5, field.halfLength),
    width: Math.min(20.16, field.halfWidth),
  };
}
export function inKeeperArea(field, team, point) {
  const a = keeperArea(field),
    u = field.halfLength + point.x * (team === 0 ? 1 : -1);
  return (
    u >= 0 &&
    u <= a.depth &&
    Math.abs(point.z) <= a.width &&
    (!a.round || u * u + point.z * point.z <= 36)
  );
}
export function constrainKeeperCarry(p, field) {
  const a = keeperArea(field),
    dir = p.team === 0 ? 1 : -1,
    margin = 0.85;
  const u = Math.max(
    margin,
    Math.min(a.depth - margin, field.halfLength + p.x * dir),
  );
  const width = a.round
    ? Math.sqrt(Math.max(0, (6 - margin) ** 2 - u * u))
    : a.width - margin;
  const x = dir * (u - field.halfLength),
    z = Math.max(-width, Math.min(width, p.z));
  const dx = x - p.x,
    dz = z - p.z;
  if (dx) p.vx = 0;
  if (dz) p.vz = 0;
  p.x = x;
  p.z = z;
  for (const f of p.locomotion.feet) {
    f.x += dx;
    f.z += dz;
    f.from.x += dx;
    f.from.z += dz;
    f.to.x += dx;
    f.to.z += dz;
  }
}
