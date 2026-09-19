import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";

const step = (match, seconds, input = {}) => {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) match.update(1 / 120, input);
};

test("training keeps every opponent, including the goalkeeper, anchored", () => {
  const match = new Match();
  match.start(0.1, "hard", true);
  const opponents = match.players.filter((p) => p.team === 1);
  const anchors = opponents.map((p) => ({ x: p.x, z: p.z }));
  step(match, 10, { x: 1, z: 0.4, sprint: true });

  assert.equal(match.mode, "playing", "training has no duration limit");
  opponents.forEach((p, i) => {
    assert.deepEqual({ x: p.x, z: p.z }, anchors[i]);
    assert.equal(p.vx, 0);
    assert.equal(p.vz, 0);
  });
  assert.equal(match.snapshot().training, true);
});

test("training opponents remain solid obstacles while the ball is dynamic", () => {
  const match = new Match();
  match.start(90, "normal", true);
  const keeper = match.players.find((p) => p.team === 1 && p.keeper);
  match.ball.owner = null;
  match.ball.x = keeper.x - 2;
  match.ball.z = keeper.z;
  match.ball.vx = 24;
  match.ball.vz = 0;
  const before = { x: keeper.x, z: keeper.z };
  step(match, 0.18);

  assert.deepEqual({ x: keeper.x, z: keeper.z }, before);
  assert.ok(match.ball.vx < 0, "the ball should rebound from the anchored goalkeeper");
  assert.ok(match.ball.x < keeper.x, "the ball must not pass through the goalkeeper");
  assert.equal(match.ball.owner, null);
});

test("training never gives possession to the opposition and restarts for team 0", () => {
  const match = new Match();
  match.start(90, "normal", true);
  const opponent = match.players.find((p) => p.team === 1 && !p.keeper);
  match.ball.owner = opponent.id;
  step(match, 1 / 60);
  assert.equal(match.ball.owner, null);

  match.restart(1, 12, 4, "LATERAL");
  assert.equal(match.ball.owner !== null, true);
  assert.equal(match.players[match.ball.owner].team, 0);
  assert.equal(match.snapshot().training, true);
});

test("normal mode still moves the opposition and can end on its timer", () => {
  const match = new Match();
  match.start(0.05, "normal", false);
  const opponents = match.players.filter((p) => p.team === 1);
  const anchors = opponents.map((p) => ({ x: p.x, z: p.z }));
  step(match, 1, { x: 1, z: 0, sprint: true });
  assert.equal(match.training, false);
  assert.equal(match.mode, "finished");
  assert.ok(opponents.some((p, i) => p.x !== anchors[i].x || p.z !== anchors[i].z));
});
