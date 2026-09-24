import { keeperControl } from "./goalkeeper.js";
import { initLocomotion } from "./locomotion.js";
import { placeFreeKick } from "./free-kicks.js";
export const inOwnArea = (p, b = p) => {
  const f = p.field,
    dir = p.team ? -1 : 1;
  return (
    b.x * dir >= -f.halfLength &&
    b.x * dir <= -f.halfLength + 6 &&
    Math.abs(b.z) <= 6
  );
};
export const legalDuelShot = (p, b) => {
  const f = p.field,
    dir = p.team ? -1 : 1;
  return (
    p.x * dir <= 0 &&
    b.x * dir <= 0.12 &&
    Math.abs(p.x) <= f.halfLength &&
    Math.abs(p.z) <= f.halfWidth &&
    Math.abs(b.x) <= f.halfLength &&
    Math.abs(b.z) <= f.halfWidth
  );
};
export function constrainDuelPlayer(m, p) {
  if (!m.field.duel || m.setPiece?.type === "penalty" || p.duelReturn) return;
  const dir = p.team ? -1 : 1;
  if (p.x * dir > -0.38) {
    p.x = -dir * 0.38;
    p.vx = Math.min(0, p.vx * dir) * dir;
  }
}
export function duelKeeperPose(m, p) {
  const b = m.ball,
    input = m.controls[p.team].lastInput;
  if (b.owner === p.id && !p.goalkeeping?.holding) {
    p.goalkeeping = null;
    return;
  }
  if (p.duelReturn || (!inOwnArea(p) && !input.hands) || p.ballAction) {
    p.goalkeeping = null;
    return;
  }
  keeperControl(p, b, m.elapsed);
  const g = p.goalkeeping;
  if (
    input.hands &&
    b.owner !== p.id &&
    Math.hypot(b.x - p.x, b.z - p.z) < 1.65
  ) {
    g.smother = true;
    g.mode = "set";
    g.result = null;
  }
}
export function duelAI(m, p) {
  const b = m.ball,
    dir = p.team ? -1 : 1;
  if (b.owner === p.id) {
    if (p.think <= 0 && p.x * dir > -5 && legalDuelShot(p, b)) {
      m.queueAIAction(
        p,
        "shoot",
        dir * m.field.halfLength,
        Math.sin(m.elapsed * 1.9) * m.field.goalHalf * 0.65,
        0.68,
      );
      p.ballAction.chip =
        Math.abs(m.players[1 - p.id].x) > 0 &&
        Math.abs(m.players[1 - p.id].x) < m.field.halfLength - 7;
      p.think = 1;
    }
    return { x: -dir * 1.5, z: Math.max(-5, Math.min(5, p.z * 0.8)), speed: 5 };
  }
  if (
    b.x * dir < 0 &&
    b.owner === null &&
    (!p.goalkeeping || p.goalkeeping.mode === "set")
  )
    return { x: b.x + b.vx * 0.12, z: b.z + b.vz * 0.12, speed: 6 };
  return keeperControl(p, b, m.elapsed);
}
export function duelHandPenalty(m, p) {
  const victim = m.players.find((q) => q.team !== p.team);
  placeFreeKick(m, {
    team: victim.team,
    victim: victim.id,
    x: p.x,
    z: p.z,
    penalty: true,
  });
  m.announce("MÃO FORA DA ÁREA · PÊNALTI!", 3);
}
export function dropDuelBall(m, p) {
  const g = p.goalkeeping;
  g.holding = false;
  g.result = null;
  g.cooldown = m.elapsed + 0.7;
  m.ball.vx = (p.team ? -1 : 1) * 1.1;
  m.ball.vz = 0;
  m.ball.vy = -1;
  p.goalkeeping = null;
  p.think = 0.7;
}
export function resetDuelKickoff(m, kickTeam) {
  for (const p of m.players) {
    const dir = p.team ? -1 : 1;
    p.x =
      -dir *
      (p.team === kickTeam ? m.field.halfLength - 6 : m.field.halfLength - 1.5);
    p.homeX = -dir * (m.field.halfLength - 1.5);
    p.z = 0;
    initLocomotion(p);
  }
  const p = m.players[kickTeam];
  m.ball.x = p.x + (kickTeam ? -1 : 1) * 0.65;
}
