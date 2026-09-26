import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { parseInput, renderState, encodeState } from "../shared/protocol.js";
test("two teams move independently, selection and cancellation belong to one team", () => {
  const m = new Match({ multiplayer: true });
  m.start();
  m.ball.owner = null;
  m.ball.x = 40;
  m.ball.z = 25;
  const x0 = m.players[9].x,
    x1 = m.players[20].x;
  for (let i = 0; i < 120; i++) m.update(1 / 120, { x: 1 }, { x: -1 });
  assert.ok(m.players[9].x > x0 + 1);
  assert.ok(m.players[20].x < x1 - 1);
  m.withTeam(1, () => m.switchPlayer());
  assert.equal(m.controls[0].selected, 9);
  assert.ok(m.controls[1].selected >= 11);
  const player = m.players[m.controls[1].selected];
  m.ball.owner = player.id;
  Object.assign(m.ball, {
    x: player.x + player.dx * 0.5,
    z: player.z,
    vx: 0,
    vz: 0,
  });
  assert.equal(
    m.withTeam(1, () => m.beginAction("shoot", { x: -1 })),
    true,
  );
  m.withTeam(0, () => m.cancelAction());
  assert.equal(m.controls[1].charging, true);
  m.update(1 / 120, {}, {});
  assert.ok(m.controls[1].charge > 0);
  assert.equal(m.controls[0].charge, 0);
  m.withTeam(1, () => m.cancelAction());
  assert.equal(player.ballAction, null);
  m.physics.dispose();
});
test("team one shots aim at the left goal and tackles retain correct last team", () => {
  const m = new Match({ multiplayer: true });
  m.start();
  m.ball.owner = 20;
  Object.assign(m.ball, { x: m.players[20].x, z: m.players[20].z });
  m.withTeam(1, () => {
    assert.equal(m.beginAction("shoot", {}), true);
    assert.ok(m.players[20].ballAction.aim.x < 0);
    m.cancelAction();
    m.ball.owner = null;
    m.ball.lastTeam = 0;
    const p = m.players[m.selected];
    Object.assign(m.ball, { x: p.x + p.dx * 1.5, z: p.z + p.dz * 1.5 });
    m.tackle();
  });
  for (let i = 0; i < 30 && m.ball.lastTeam !== 1; i++)
    m.update(1 / 120, {}, {});
  assert.equal(m.ball.lastTeam, 1);
  m.physics.dispose();
});
test("input protocol rejects invalid axes/events and strips client authority", () => {
  const input = {
    seq: 1,
    x: 1,
    z: 0,
    events: [],
    score: [99, 0],
    power: 999,
    team: 1,
  };
  assert.deepEqual(parseInput(input), {
    seq: 1,
    x: 1,
    z: 0,
    sprint: false,
    jockey: false,
    finesse: false,
    chip: false,
    secondPress: false,
    hands: false,
    keeperRush: false,
    events: [],
  });
  for (const patch of [
    { x: NaN },
    { x: 2 },
    { seq: -1 },
    { events: [{ type: "teleport" }] },
    { events: [{ type: "begin", action: "goal" }] },
  ])
    assert.equal(parseInput({ ...input, ...patch }), null);
});
test("render state contains both controls and physical feet, without server internals", () => {
  const m = new Match({ multiplayer: true, headless: true });
  m.start();
  m.update(1 / 120, {}, {});
  const state = JSON.parse(encodeState(renderState(m, 1, [0, 0]))).state;
  assert.equal(state.players.length, 22);
  assert.equal(state.controls.length, 2);
  assert.ok(state.players[9].locomotion.feet.length === 2);
  assert.equal(state.physics, undefined);
  assert.equal(state.players[0].motion, undefined);
  assert.equal(state.players[0].rootWarp, undefined);
  m.physics.dispose();
});
