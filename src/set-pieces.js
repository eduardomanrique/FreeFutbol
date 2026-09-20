import { initLocomotion, stepLocomotion } from "./locomotion.js";
import { selectPassTarget } from "./ball-actions.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function placeSetPiece(m, team, x, z, type) {
  const ball = m.ball,
    side = Math.sign(z) || 1,
    end = Math.sign(x) || 1;
  const p = m.players
    .filter((p) => p.team === team && !p.keeper)
    .sort(
      (a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z),
    )[0];
  if (type === "corner") {
    x = end * 45.6;
    z = side * 29.6;
  } else z = side * 30;
  const inward =
    type === "throw"
      ? { x: 0, z: -side }
      : { x: -end * 0.32, z: -side * 0.9474 };
  for (const q of m.players) {
    q.vx = q.vz = 0;
    q.ballAction = q.ballMotion = q.header = q.throwIn = q.rootWarp = null;
  }
  Object.assign(p, {
    x: x - inward.x * 0.55,
    z: z - inward.z * (type === "throw" ? 0.05 : 0.55),
    dx: inward.x,
    dz: inward.z,
  });
  const mates = m.players
    .filter((q) => q.team === team && !q.keeper && q !== p)
    .sort(
      (a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z),
    );
  mates.slice(0, 3).forEach((q, i) => {
    q.x =
      type === "corner" ? end * (36 + i * 2) : clamp(x + (i - 1) * 6, -43, 43);
    q.z = type === "corner" ? (i - 1) * 6 : side * (22 - i * 2);
  });
  for (const q of m.players) {
    if (q !== p) {
      const radius = q.team !== team ? (type === "corner" ? 10.2 : 2.2) : 2;
      let dx = q.x - x,
        dz = q.z - z,
        d = Math.hypot(dx, dz);
      if (d < radius) {
        // Keep the displacement inside the field, including players beyond
        // the corner whose outward vector would be shortened by clamping.
        if (type === "corner") dx = -end * Math.abs(dx);
        dz = -side * Math.abs(dz);
        if (d < 0.01) {
          dx = inward.x;
          dz = inward.z;
          d = 1;
        }
        q.x = clamp(x + (dx / d) * radius, -44, 44);
        q.z = clamp(z + (dz / d) * radius, -28, 28);
      }
    }
    initLocomotion(q);
  }
  m.setPiece = { type, team, taker: p.id, x, z, startedAt: m.elapsed };
  m.restartRestriction = null;
  m.ballFlight++;
  m.lastPass = null;
  m.lastKicker = null;
  Object.assign(ball, {
    x,
    y: type === "throw" ? 2.03 : 0.11,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    owner: p.id,
    lastTeam: team,
  });
  if (type === "throw")
    p.throwIn = {
      phase: 0,
      ball: { x: p.x - inward.x * 0.18, y: 2.03, z: p.z - inward.z * 0.18 },
    };
  m.selectForTeam(p);
  m.kickCooldown = 0;
  p.think = 0.8;
}
export function updateSetPiece(m, dt) {
  const sp = m.setPiece,
    p = m.players[sp.taker];
  if (!m.isControlled(p) && m.elapsed - sp.startedAt > 1 && !p.ballAction) {
    const q = m.players
      .filter((q) => q.team === sp.team && !q.keeper && q !== p)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )[0];
    m.queueAIAction(p, sp.type === "corner" ? "lob" : "pass", q.x, q.z, 0.45);
  }
  const a = p.ballAction;
  if (sp.type === "throw") {
    const phase =
      a?.stage === "pending"
        ? clamp((m.elapsed - a.releasedAt) / 0.35, 0, 1)
        : 0;
    p.throwIn = {
      phase,
      ball: {
        x: p.x + p.dx * (-0.18 + phase * 0.4),
        y: 2.03 + Math.sin(phase * Math.PI) * 0.12,
        z: p.z + p.dz * (-0.18 + phase * 0.4),
      },
    };
    Object.assign(m.ball, p.throwIn.ball, { vx: 0, vy: 0, vz: 0 });
    if (phase >= 1) {
      const mates = m.players.filter(
        (q) =>
          q.team === p.team &&
          q.id !== p.id &&
          Math.abs(q.z) < 29 &&
          Math.abs(q.x) < 45,
      );
      const q = selectPassTarget(mates, p, a.aim, a.power, "pass");
      if (q) {
        const d = Math.hypot(q.x - m.ball.x, q.z - m.ball.z),
          flight = clamp(0.75 + d / 30, 0.85, 1.65);
        const speed = (d / flight) * 1.07,
          lift = (0.65 - m.ball.y) / flight + 4.905 * flight;
        m.withTeam(p.team, () => m.kick(p, q.x, q.z, speed, lift));
        p.kick = 0;
        p.throwIn.releasedAt = m.elapsed;
        m.lastPass = {
          type: "throw",
          style: "throw-in",
          power: a.power,
          target: q.id,
          flight: m.ballFlight,
          team: p.team,
          contactAt: m.elapsed,
          receiveWindow: flight * 2 + 0.8,
          speed,
          lift,
        };
        m.lastAction = "throw";
        m.selectForTeam(q);
        p.ballAction = null;
        m.controls[p.team].actionPlayer = null;
        m.controls[p.team].charging = false;
      }
    }
  } else {
    // Ordinary shoe contact performs the corner; no dribbling before release.
    if (a) {
      stepLocomotion(p, 0, 0, dt, {
        charging: a.stage === "charging",
        charge: m.controls[p.team].charge,
      });
      m.withTeam(p.team, () => m.updateBallControl(dt));
    }
  }
  for (const q of m.players)
    m.withTeam(q.team, () => q.motion?.update(q, m, dt));
}
