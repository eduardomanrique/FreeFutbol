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
test("keepers launch to either side and parry reachable shots at bounded hand contact at low/mid/high heights", () => {
  for (const team of [0, 1])
    for (const z of [-2, 2])
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
  for (const aim of [-0.9, 0.9])
    for (const random of [0.1, 0.5, 0.9])
      goals += Number(chance(12, 0.9, aim, random).goal);
  assert.ok(goals >= 4, `${goals}/6 well-placed close shots converted`);
  assert.ok(chance(12, 0.35, 0).save);
});
test("holding keeper rush closes down the ball and release returns toward goal", () => {
  const { m, p } = setup(0, 0.11, 0, 20, 0);
  Object.assign(m.ball, { x: -18, z: 0, vx: 0, vz: 0, vy: 0, lastTeam: 1 });
  const start = p.x;
  for (let i = 0; i < 120; i++) m.update(1 / 120, { keeperRush: true });
  assert.ok(p.goalkeeping.rushing);
  assert.ok(p.x > start + 3);
  const advanced = p.x;
  for (let i = 0; i < 200; i++) m.update(1 / 120, {});
  assert.equal(p.goalkeeping.rushing, false);
  assert.ok(p.x < advanced);
  m.physics.dispose();
});
test("human keeper keeps a catch, takes control and releases only on throw or punt command", () => {
  for (const action of ["pass", "shoot"]) {
    const { m, p } = setup(0, 1.1, 10, 38, 0);
    for (let i = 0; i < 240 && !m.lastSave; i++) m.update(1 / 120, {});
    assert.equal(m.lastSave?.kind, "catch");
    assert.equal(m.selected, p.id);
    for (let i = 0; i < 600; i++) m.update(1 / 120, {});
    assert.equal(m.ball.owner, p.id);
    assert.ok(p.goalkeeping.holding);
    assert.equal(m.lastPass, null);
    assert.equal(m.beginAction(action, { x: 1 }), true);
    assert.equal(m.releaseAction(0.65), true);
    for (let i = 0; i < 100 && !m.lastPass; i++) m.update(1 / 120, {});
    assert.equal(
      m.lastPass?.style,
      action === "pass" ? "keeper-throw" : "keeper-punt",
    );
    assert.equal(p.goalkeeping.holding, false);
    assert.equal(m.ball.owner, null);
    assert.ok(m.ball.vx > 0, `${action}: ${JSON.stringify(m.ball)}`);
    assert.notEqual(m.selected, p.id);
    m.physics.dispose();
  }
});
test("carried ball stays inside each own penalty area and sand uses a full-width 9m area", async () => {
  const { inKeeperArea, constrainKeeperCarry } =
    await import("../src/keeper-possession.js");
  const { modeConfig } = await import("../src/modes.js");
  for (const variant of ["match", "sand", "court"])
    for (const team of [0, 1]) {
      const field = modeConfig(variant),
        p = {
          id: 0,
          team,
          x: 0,
          z: field.halfWidth,
          vx: 10,
          vz: 10,
          dx: 1,
          dz: 0,
        };
      initLocomotion(p);
      constrainKeeperCarry(p, field);
      assert.ok(inKeeperArea(field, team, p));
      const dir = team === 0 ? 1 : -1;
      assert.ok(inKeeperArea(field, team, { x: p.x + dir * 0.7, z: p.z }));
    }
  const sand = modeConfig("sand");
  assert.ok(
    inKeeperArea(sand, 0, {
      x: -sand.halfLength + 8.99,
      z: sand.halfWidth - 0.1,
    }),
  );
  assert.ok(!inKeeperArea(sand, 0, { x: -sand.halfLength + 9.01, z: 0 }));
});
test("manual keeper movement cannot take the held ball outside the area", async () => {
  const { inKeeperArea } = await import("../src/keeper-possession.js");
  const { m, p } = setup(0, 1.1, 10, 38, 0);
  for (let i = 0; i < 240 && !m.lastSave; i++) m.update(1 / 120, {});
  for (let i = 0; i < 900; i++) {
    m.update(1 / 120, { x: 1, z: 1, sprint: true });
    assert.equal(m.ball.owner, p.id);
    assert.ok(inKeeperArea(m.field, p.team, m.ball), `${m.ball.x},${m.ball.z}`);
  }
  assert.ok(p.x > -40, "player can move while holding");
  m.physics.dispose();
});
