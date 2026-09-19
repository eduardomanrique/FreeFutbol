import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
export function chance(distance, power, aim, random = 0.5) {
  const m = new Match({ random: () => random });
  m.start();
  for (const p of m.players) {
    p.x = -35;
    p.z = 25;
    p.think = 99;
    initLocomotion(p);
  }
  const p = m.players[9],
    g = m.players[11];
  p.x = 46 - distance - 0.65;
  p.z = 0;
  g.x = 43.6;
  g.z = 0;
  initLocomotion(p);
  initLocomotion(g);
  Object.assign(m.ball, { x: 46 - distance, z: 0, owner: 9 });
  m.beginAction("shoot", {});
  m.aimAction({ z: aim });
  m.releaseAction(power);
  for (let i = 0; i < 480; i++) {
    m.update(1 / 120, {});
    if (
      m.mode === "goal" ||
      m.lastSave ||
      (m.lastShot && m.ball.owner !== null)
    )
      break;
  }
  const r = {
    distance,
    power,
    aim,
    random,
    goal: m.score[0] === 1,
    save: m.lastSave?.kind ?? null,
    shot: !!m.lastShot,
  };
  m.physics.dispose();
  return r;
}
if (process.argv[1]?.endsWith("scoring-balance.js")) {
  const results = [];
  for (const distance of [12, 18, 24])
    for (const power of [0.35, 0.65, 1])
      for (const aim of [0, 0.75, 1])
        for (const random of [0.1, 0.5, 0.9])
          results.push(chance(distance, power, aim, random));
  console.log(
    JSON.stringify(
      {
        goals: results.filter((r) => r.goal).length,
        saves: results.filter((r) => r.save).length,
        total: results.length,
        byDistance: [12, 18, 24].map((d) => ({
          distance: d,
          goals: results.filter((r) => r.distance === d && r.goal).length,
        })),
        results,
      },
      null,
      2,
    ),
  );
}
