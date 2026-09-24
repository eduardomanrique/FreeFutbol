import { initLocomotion } from "./locomotion.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function placeFreeKick(m, foul) {
  const { halfLength: L, halfWidth: W } = m.field,
    dir = foul.team === 0 ? 1 : -1;
  const areaDepth = m.variant === "match" ? 16.5 : m.variant === "sand" ? 9 : 6;
  const inArea =
    foul.penalty ||
    (foul.x * dir > L - areaDepth &&
      Math.abs(foul.z) <
        (m.variant === "match" ? 20.16 : m.variant === "sand" ? W : 6));
  const x = inArea
    ? dir * (L - (m.variant === "match" ? 11 : m.variant === "sand" ? 9 : 6))
    : clamp(foul.x, -L + 1, L - 1);
  const z = inArea ? 0 : clamp(foul.z, -W + 0.8, W - 0.8);
  const p = m.players[foul.victim],
    goalX = dir * L,
    d = Math.hypot(goalX - x, z) || 1,
    ax = (goalX - x) / d,
    az = -z / d;
  m.cancelAllActions();
  for (const q of m.players) {
    q.slide =
      q.knockdown =
      q.evade =
      q.bicycle =
      q.ballAction =
      q.ballMotion =
      q.header =
      q.rootWarp =
        null;
    q.sliding = false;
    q.vx = q.vz = 0;
  }
  Object.assign(p, {
    x: x - ax * 0.65,
    z: z - az * 0.65,
    dx: ax,
    dz: az,
    think: 1,
  });
  const wall = [];
  const spacing = m.variant === "match" ? 9.15 : 5;
  const defenders = m.players.filter((q) => q.team !== p.team && !q.keeper);
  if (!inArea && d < Math.min(32, L * 1.3)) {
    defenders.slice(0, Math.min(3, defenders.length)).forEach((q, i, all) => {
      q.x = clamp(
        x + ax * spacing - az * (i - (all.length - 1) / 2) * 0.75,
        -L + 0.8,
        L - 0.8,
      );
      q.z = clamp(
        z + az * spacing + ax * (i - (all.length - 1) / 2) * 0.75,
        -W + 0.8,
        W - 0.8,
      );
      q.dx = -ax;
      q.dz = -az;
      wall.push(q.id);
    });
  }
  for (const q of m.players) {
    if (
      q !== p &&
      !q.keeper &&
      !wall.includes(q.id) &&
      Math.hypot(q.x - x, q.z - z) < spacing
    ) {
      q.x = clamp(x - dir * (spacing + 1), -L + 1, L - 1);
      q.z = clamp(z + (q.id % 2 ? 1 : -1) * 3, -W + 1, W - 1);
    }
    if (inArea && q !== p && !q.keeper)
      q.x = clamp(x - dir * (spacing + 1), -L + 1, L - 1);
    if (inArea && q.keeper && q !== p) {
      q.x = goalX - dir * 0.5;
      q.z = 0;
      q.dx = -dir;
      q.dz = 0;
      q.goalkeeping = null;
    }
    q.duelReturn = false;
    initLocomotion(q);
  }
  Object.assign(m.ball, {
    x,
    z,
    y: 0.11,
    vx: 0,
    vy: 0,
    vz: 0,
    owner: p.id,
    lastTeam: p.team,
  });
  m.setPiece = {
    type: inArea ? "penalty" : "free",
    team: p.team,
    taker: p.id,
    x,
    z,
    wall,
    startedAt: m.elapsed,
    readyAt: m.elapsed + (inArea ? 1.2 : 0),
  };
  m.restartRestriction = null;
  m.selectForTeam(p);
  m.kickCooldown = 0;
  m.ballFlight++;
  m.lastPass = null;
  m.announce(
    inArea
      ? "PÊNALTI!"
      : wall.length
        ? "FALTA · BARREIRA ARMADA"
        : "TIRO LIVRE",
    3,
  );
  m.distributed?.reset();
}
