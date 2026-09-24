import { possessionTeam } from "./possession.js";
import { unavailable } from "./gameplay-actions.js";
export function updateSecondDefender(m, dt) {
  for (const p of m.players) p.secondPress = false;
  for (const [team, c] of m.controls.entries()) {
    c.pressEnergy = Math.min(1, (c.pressEnergy ?? 1) + dt * 0.16);
    if (
      !c.lastInput.secondPress ||
      possessionTeam(m) === team ||
      m.field.duel
    ) {
      c.secondDefender = null;
      c.pressExhausted = false;
      continue;
    }
    if (c.pressExhausted) continue;
    const valid = (p) =>
      p &&
      p.team === team &&
      !p.keeper &&
      p.id !== c.selected &&
      !unavailable(p);
    let p = m.players[c.secondDefender];
    if (!valid(p))
      p = m.players
        .filter(valid)
        .sort(
          (a, b) =>
            Math.hypot(a.x - m.ball.x, a.z - m.ball.z) -
            Math.hypot(b.x - m.ball.x, b.z - m.ball.z),
        )[0];
    if (!p) {
      c.secondDefender = null;
      continue;
    }
    c.pressEnergy = Math.max(0, c.pressEnergy - dt * 0.4);
    if (c.pressEnergy <= 0) {
      c.pressExhausted = true;
      c.secondDefender = null;
      continue;
    }
    c.secondDefender = p.id;
    p.secondPress = true;
  }
}
export function secondDefenderTarget(m, p) {
  const b = m.ball,
    dir = p.team ? -1 : 1;
  // Close down from the goal side, without taking over the user's player.
  return {
    x: b.x - dir * 0.65 + b.vx * 0.12,
    z: b.z + b.vz * 0.12,
    speed: 6.4,
  };
}
