import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { legalDuelShot, duelHandPenalty } from "../src/duel.js";
import { chipTrajectory } from "../src/ball-actions.js";
import { stepBallMotion } from "../src/ball-physics.js";
import { updateSecondDefender } from "../src/second-defender.js";
const tick = (m, n, input = {}) => {
  for (let i = 0; i < n; i++) m.update(1 / 120, input);
};
function duel() {
  const m = new Match({ random: () => 0.5 });
  m.start(180, "normal", false, "duel");
  return m;
}
test("duel starts 1v1, dribbles, stops at halfway and releases an actual shot", () => {
  const m = duel();
  assert.equal(m.players.length, 2);
  assert.equal(m.ball.owner, 0);
  assert.ok(m.ball.x < 0);
  tick(m, 450, { x: 1, sprint: true });
  assert.ok(m.players[0].x <= -0.37);
  assert.ok(m.players[1].x >= 0.37);
  const p = m.players[0];
  p.x = -5;
  p.z = 0;
  p.vx = p.vz = 0;
  p.goalkeeping = null;
  initLocomotion(p);
  Object.assign(m.ball, {
    owner: 0,
    x: -4.35,
    z: 0,
    y: 0.11,
    vx: 0,
    vy: 0,
    vz: 0,
  });
  m.cancelAllActions();
  assert.ok(m.shoot(0.7));
  for (let i = 0; i < 300 && !m.lastShot; i++) m.update(1 / 120, {});
  assert.ok(m.lastShot);
  assert.equal(m.ball.owner, null);
  m.physics.dispose();
});
test("duel has no sideline or end restarts and the outside apron is playable", () => {
  const m = duel();
  for (const p of m.players) {
    p.z = 8;
    initLocomotion(p);
  }
  for (const [x, z, vx, vz] of [
    [-6, 10.2, 0, 7],
    [20.5, 7, 8, 0],
  ]) {
    Object.assign(m.ball, { owner: null, x, z, y: 0.11, vx, vz, vy: 0 });
    for (let i = 0; i < 45; i++) m.integrateBall(1 / 120);
    assert.equal(m.pendingRestart, null);
    assert.equal(m.setPiece, null);
    assert.equal(m.mode, "playing");
  }
  const p = m.players[0];
  p.x = -5;
  p.z = 12;
  initLocomotion(p);
  Object.assign(m.ball, { x: -4.4, z: 12, owner: 0 });
  assert.equal(legalDuelShot(p, m.ball), false);
  assert.equal(m.shoot(0.6), false);
  tick(m, 50, { z: -1 });
  assert.ok(p.z < 12, "can retrieve toward painted court");
  m.physics.dispose();
});
test("actual hand contact outside duel area awards penalty; inside it catches", () => {
  for (const x of [-17, -8]) {
    const m = duel(),
      p = m.players[0];
    p.x = x;
    p.z = 0;
    initLocomotion(p);
    Object.assign(m.ball, {
      owner: null,
      lastTeam: 1,
      x: x + 0.45,
      z: 0,
      y: 1.2,
      vx: 0,
      vy: 0,
      vz: 0,
    });
    tick(m, 2, { hands: true });
    if (x === -8) {
      assert.equal(m.setPiece?.type, "penalty");
      assert.equal(m.setPiece.team, 1);
      assert.equal(m.setPiece.wall.length, 0);
    } else {
      assert.equal(m.lastSave?.kind, "catch");
      assert.equal(m.ball.owner, 0);
      tick(m, 70);
      assert.equal(p.goalkeeping, null);
    }
    m.physics.dispose();
  }
});
test("duel penalty is taken physically, then shooter returns to own half", () => {
  const m = duel();
  duelHandPenalty(m, m.players[1]);
  assert.equal(m.setPiece.team, 0);
  tick(m, 150);
  assert.ok(m.shoot(0.65));
  for (let i = 0; i < 360 && !m.lastShot; i++) m.update(1 / 120, {});
  assert.ok(m.lastShot);
  assert.equal(m.setPiece, null);
  assert.ok(m.players[0].duelReturn);
  m.physics.dispose();
});
test("chip flies above a normal keeper reach and descends below the bar", () => {
  for (const d of [8, 15, 25]) {
    const tr = chipTrajectory(d, 0.6),
      b = { x: 0, z: 0, y: 0.11, vx: tr.speed, vz: 0, vy: tr.lift, spin: 0 };
    let peak = 0;
    while (b.x < d) {
      stepBallMotion(b, 1 / 120);
      peak = Math.max(peak, b.y);
      assert.ok(b.x < d + 1);
    }
    assert.ok(peak > 2.5);
    assert.ok(b.y < 1 && b.y > 0.2, `${d}: ${b.y}`);
  }
});
test("second defender presses without changing selection, stops on release and tires", () => {
  const m = new Match();
  m.start();
  m.ball.owner = 20;
  m.ball.lastTeam = 1;
  const selected = m.selected;
  m.controls[0].lastInput = { secondPress: true };
  updateSecondDefender(m, 0.01);
  const helper = m.controls[0].secondDefender;
  assert.notEqual(helper, selected);
  assert.ok(m.players[helper].secondPress);
  tick(m, 60, { secondPress: true });
  assert.equal(m.selected, selected);
  assert.ok(m.players[helper].moveIntent.x || m.players[helper].moveIntent.z);
  m.controls[0].lastInput = {};
  updateSecondDefender(m, 0.01);
  assert.ok(m.players.every((p) => !p.secondPress));
  m.controls[0].lastInput = { secondPress: true };
  for (let i = 0; i < 600; i++) updateSecondDefender(m, 1 / 120);
  assert.equal(m.controls[0].secondDefender, null);
  assert.ok(m.controls[0].pressExhausted);
  m.physics.dispose();
});
test("duel AI advances and shoots, goal resets both players on their own sides", () => {
  const m = duel();
  m.resetPlayers(1);
  for (let i = 0; i < 3000 && !m.lastShot; i++) m.update(1 / 120, {});
  assert.ok(
    m.lastShot,
    "AI must attack, not wait permanently as a regular keeper",
  );
  for (const p of m.players) {
    p.z = 8;
    initLocomotion(p);
  }
  Object.assign(m.ball, {
    owner: null,
    x: 19.8,
    z: 0,
    y: 0.4,
    vx: 15,
    vz: 0,
    vy: 0,
  });
  for (let i = 0; i < 10 && m.mode !== "goal"; i++) m.integrateBall(1 / 120);
  assert.equal(m.score[0], 1);
  tick(m, 370);
  assert.equal(m.players.length, 2);
  assert.ok(m.players[0].x < 0 && m.players[1].x > 0);
  assert.equal(m.ball.owner, 1);
  m.physics.dispose();
});
test("both human duel players stay in their half while sprinting toward centre", () => {
  const m = duel();
  m.multiplayer = true;
  m.ball.owner = null;
  m.ball.x = 0;
  m.ball.z = 8;
  for (let i = 0; i < 500; i++) {
    m.update(1 / 120, { x: 1, sprint: true }, { x: -1, sprint: true });
    assert.ok(m.players[0].x <= -0.37 && m.players[1].x >= 0.37);
  }
  assert.equal(m.tackle(true), false);
  m.physics.dispose();
});
test("online inputs preserve chip and helper controls without accepting client authority", async () => {
  const { parseInput } = await import("../shared/protocol.js");
  const input = parseInput({
    seq: 1,
    x: 0,
    z: 0,
    events: [],
    chip: true,
    secondPress: true,
    hands: true,
    score: [99, 0],
  });
  assert.equal(input.chip, true);
  assert.equal(input.secondPress, true);
  assert.equal(input.hands, true);
  assert.equal(input.score, undefined);
});
