import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion, stepLocomotion } from "../src/locomotion.js";
function setup(z = 3, y = 1.2, speed = 20, x = 32, team = 1) {
  const m = new Match({ random: () => 0.5 });
  m.start();
  for (const p of m.players) {
    p.x = 0;
    p.z = 20;
    p.think = 99;
    initLocomotion(p);
  }
  const p = m.players[team === 1 ? 11 : 0],
    sign = team === 1 ? 1 : -1;
  p.x = sign * 43;
  p.z = 0;
  initLocomotion(p);
  const time = (42.65 - x) / speed;
  Object.assign(m.ball, {
    owner: null,
    x: sign * x,
    z: 0,
    y,
    vx: sign * speed,
    vz: z / time,
    vy: y > 0.2 ? 4.9 * time : 0,
  });
  return { m, p };
}
test("keepers launch toward both corners and parry at bounded hand contact at low/mid/high heights", () => {
  for (const team of [0, 1])
    for (const z of [-3, 3])
      for (const y of [0.11, 1.2, 2.2]) {
        const { m, p } = setup(z, y, 20, 30, team);
        let airborne = false;
        for (let i = 0; i < 150 && !m.lastSave; i++) {
          m.update(1 / 120, {});
          airborne ||=
            p.goalkeeping.mode === "dive" && Math.abs(p.goalkeeping.roll) > 0.5;
        }
        assert.ok(airborne, `${team}/${z}/${y}`);
        assert.equal(m.lastSave?.kind, "parry");
        assert.equal(m.lastSave.player, p.id);
        assert.equal(m.score[0] + m.score[1], 0);
        assert.ok(m.ball.vx * (team === 0 ? 1 : -1) > 0);
        assert.ok(m.ball.vz * z > 0);
        assert.ok(Math.abs(p.goalkeeping.vz) <= 4.9);
        m.physics.dispose();
      }
});
test("a close powerful corner shot can beat the keeper, without teleporting the hands", () => {
  const { m, p } = setup(3.4, 1.2, 40, 40);
  Object.assign(m.ball, { z: 3.2, vz: 0 });
  for (let i = 0; i < 100 && m.mode === "playing"; i++) m.update(1 / 120, {});
  assert.equal(m.lastSave, null);
  assert.equal(m.score[0], 1);
  m.physics.dispose();
});
test("manageable central shot is held, then distributed after recovery", () => {
  const { m, p } = setup(0, 1.1, 10, 38);
  for (let i = 0; i < 180 && !m.lastSave; i++) m.update(1 / 120, {});
  assert.equal(m.lastSave?.kind, "catch");
  assert.equal(m.ball.owner, p.id);
  for (let i = 0; i < 60; i++) {
    m.update(1 / 120, {});
    assert.equal(m.ball.owner, p.id);
  }
  for (let i = 0; i < 300 && m.ball.owner === p.id; i++) m.update(1 / 120, {});
  assert.equal(m.ball.owner, null);
  assert.ok(m.ball.vx < 0);
  m.physics.dispose();
});
test("close control turns toward new input sooner using shorter grounded steps", () => {
  const results = [];
  for (const agile of [false, true]) {
    const p = {
      id: 9,
      x: 0,
      z: 0,
      vx: 1.8,
      vz: 0,
      dx: 1,
      dz: 0,
      closeControl: agile,
    };
    initLocomotion(p);
    for (let i = 0; i < 24; i++) stepLocomotion(p, 0, 1.8, 1 / 120);
    results.push({
      heading: Math.abs(p.locomotion.heading),
      interval: p.locomotion.strideInterval,
    });
    assert.ok(p.locomotion.height > 0.8);
    assert.ok(
      Math.hypot(p.locomotion.fx, p.locomotion.fz) <=
        p.locomotion.frictionLimit + 0.01,
    );
  }
  assert.ok(results[1].heading < results[0].heading * 0.6);
  assert.ok(results[1].interval < results[0].interval * 0.85);
});

test("good close chances beat the keeper while weak central shots remain defendable", async () => {
  const { chance } = await import("./scoring-balance.js");
  let goals = 0;
  for (const aim of [-0.75, 0.75])
    for (const random of [0.1, 0.5, 0.9])
      goals += Number(chance(12, 0.65, aim, random).goal);
  assert.ok(goals >= 4, `${goals}/6 well-placed close shots converted`);
  assert.ok(chance(12, 0.35, 0).save);
});
