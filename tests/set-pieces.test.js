import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { possessionTeam } from "../src/possession.js";
test("throw-in is stationary at the exit line, uses hands and releases inside to a teammate", () => {
  for (const team of [0, 1])
    for (const side of [-1, 1]) {
      const m = new Match({ multiplayer: true, random: () => 0 });
      m.start();
      m.restart(team, 8, side * 30, "LATERAL");
      const sp = m.setPiece,
        p = m.players[sp.taker];
      assert.equal(sp.type, "throw");
      assert.ok(p.throwIn);
      for (const q of m.players.filter((q) => q.team !== team))
        assert.ok(Math.hypot(q.x - 8, q.z - side * 30) >= 2);
      for (let i = 0; i < 50; i++) m.update(1 / 120, { x: 1 }, { x: -1 });
      assert.ok(Math.abs(p.z) >= 30);
      assert.ok(m.ball.y > 1.8);
      assert.equal(m.ball.vx, 0);
      m.withTeam(team, () => {
        m.beginAction("pass", { z: -side });
        m.releaseAction(0.4);
      });
      for (let i = 0; i < 100 && m.setPiece; i++) m.update(1 / 120, {}, {});
      assert.equal(m.setPiece, null);
      assert.equal(m.lastPass?.style, "throw-in");
      assert.ok(m.ball.vz * side < 0);
      assert.equal(m.ball.owner, null);
      assert.equal(possessionTeam(m), team);
      assert.equal(m.restartRestriction.player, p.id);
      m.physics.dispose();
    }
});
test("corner waits for a foot strike from the corner area and keeps opponents at distance", () => {
  for (const team of [0, 1])
    for (const side of [-1, 1]) {
      const m = new Match({ multiplayer: true, random: () => 0 });
      m.start();
      const end = team ? -1 : 1;
      // An opponent just outside the corner must also move far enough inward.
      Object.assign(m.players.find((q) => q.team !== team && !q.keeper), {
        x: end * 46.2,
        z: side * 30.2,
      });
      m.restart(team, end * 45, side * 29, "ESCANTEIO");
      const sp = m.setPiece,
        p = m.players[sp.taker];
      assert.ok(Math.hypot(m.ball.x - end * 46, m.ball.z - side * 30) < 1);
      for (const q of m.players.filter((q) => q.team !== team))
        assert.ok(Math.hypot(q.x - end * 46, q.z - side * 30) >= 9.15);
      const position = { x: m.ball.x, z: m.ball.z };
      for (let i = 0; i < 30; i++) m.update(1 / 120, {}, {});
      assert.equal(m.ball.x, position.x);
      assert.equal(m.ball.z, position.z);
      m.withTeam(team, () => {
        m.beginAction("lob", { x: -end * 0.3, z: -side });
        m.releaseAction(0.6);
      });
      for (let i = 0; i < 240 && m.setPiece; i++) m.update(1 / 120, {}, {});
      assert.equal(
        m.setPiece,
        null,
        JSON.stringify({ sp, p: p.ballAction, motion: p.ballMotion }),
      );
      assert.equal(m.lastPass?.type, "lob");
      assert.equal(m.lastKicker, p.id);
      assert.equal(m.restartRestriction.type, "corner");
      m.physics.dispose();
    }
});
test("possession persists in flight and transfers on a physical opponent touch", () => {
  const m = new Match();
  m.start();
  m.ball.owner = null;
  m.ball.lastTeam = 0;
  m.elapsed = 12;
  assert.equal(possessionTeam(m), 0);
  m.recordBallTouch(m.players[12]);
  assert.equal(possessionTeam(m), 1);
  const selected = m.selected;
  m.switchPlayer();
  assert.notEqual(m.selected, selected);
  m.ball.lastTeam = 0;
  const next = m.selected;
  m.switchPlayer();
  assert.equal(m.selected, next);
  m.physics.dispose();
});

test("the whole ball must cross the line; physical deflections decide the awarded restart", () => {
  const m = new Match();
  m.start();
  for (const p of m.players) {
    p.x = -30;
    p.z = -20;
  }
  Object.assign(m.players[12], { x: 0, z: 0, vx: 0, vz: 0 });
  Object.assign(m.ball, {
    owner: null,
    lastTeam: 0,
    x: 0.35,
    z: 0,
    y: 0.6,
    vx: -5,
    vz: 0,
    vy: 0,
  });
  m.physics.preparePlayers(m.players, 1 / 120);
  m.integrateBall(1 / 120);
  assert.equal(m.ball.lastTeam, 1);
  Object.assign(m.ball, {
    x: 12,
    z: 30.05,
    y: 0.11,
    vx: 0,
    vz: 0,
    vy: 0,
    owner: null,
  });
  m.integrateBall(1 / 120);
  assert.equal(m.setPiece, null);
  m.ball.z = 30.2;
  m.integrateBall(1 / 120);
  assert.equal(m.setPiece?.type, "throw");
  assert.equal(m.setPiece.team, 0);
  m.physics.dispose();
});
test("throw-in cannot score directly and second touch is penalised", () => {
  const m = new Match();
  m.start();
  for (const p of m.players) {
    p.x = -30;
    p.z = -20;
  }
  m.restartRestriction = { type: "throw", team: 0, player: 9 };
  Object.assign(m.ball, {
    owner: null,
    lastTeam: 0,
    x: 46.05,
    z: 0,
    y: 1,
    vx: 20,
    vz: 0,
    vy: 0,
  });
  m.integrateBall(1 / 120);
  assert.equal(m.score[0], 0);
  assert.equal(m.event, "TIRO DE META");
  m.restartRestriction = { type: "corner", team: 0, player: 9 };
  m.kickReleasedAt = 0;
  m.elapsed = 1;
  m.recordBallTouch(m.players[9]);
  m.integrateBall(1 / 120);
  assert.equal(m.event, "TIRO LIVRE INDIRETO");
  assert.equal(possessionTeam(m), 1);
  m.physics.dispose();
});
