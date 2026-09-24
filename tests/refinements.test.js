import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { passReceptionProbability } from "../src/reception.js";
import { stepBallMotion } from "../src/ball-physics.js";

test("release movement traps the rolling ball nearby without automatic protection", () => {
  const m = new Match({ random: () => 0.99 });
  m.start();
  m.multiplayer = true;
  const p = m.players[m.selected];
  for (const q of m.players) {
    q.x = -30;
    q.z = 20;
    initLocomotion(q);
  }
  Object.assign(p, { x: 0, z: 0, vx: 0, vz: 0, dx: 1, dz: 0 });
  initLocomotion(p);
  Object.assign(m.ball, {
    owner: p.id,
    x: 0.65,
    z: 0,
    y: 0.11,
    vx: 4,
    vz: 0,
    vy: 0,
  });
  for (let i = 0; i < 360; i++) m.update(1 / 120, {});
  assert.equal(p.shield, null);
  assert.equal(m.ball.owner, p.id);
  assert.ok(Math.hypot(m.ball.vx, m.ball.vz) < 0.1);
  assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.15);
  const q = m.players[20];
  Object.assign(q, { x: p.x - 0.8, z: p.z });
  initLocomotion(q);
  m.update(1 / 120, {});
  assert.equal(p.shield, null);
  m.update(1 / 120, { jockey: true });
  assert.ok(p.shield);
  m.update(1 / 120, {});
  assert.equal(p.shield, null);
  m.physics.dispose();
});
test("sand has a keeper and four outfield players per team and short rolling range", () => {
  const m = new Match();
  m.start(180, "normal", false, "sand");
  for (const team of [0, 1]) {
    assert.equal(
      m.players.filter((p) => p.team === team && !p.keeper).length,
      4,
    );
    assert.equal(
      m.players.filter((p) => p.team === team && p.keeper).length,
      1,
    );
  }
  const b = {
    x: 0,
    z: 0,
    y: 0.11,
    vx: 8,
    vz: 0,
    vy: 0,
    spin: 0,
    surface: "sand",
  };
  for (let i = 0; i < 240; i++) stepBallMotion(b, 1 / 120);
  assert.ok(b.x < 2.5);
  assert.ok(Math.abs(b.vx) < 0.01);
  m.physics.dispose();
});
test("passing assists favour teammates and require active defensive anticipation", () => {
  const p = { team: 1, x: 0, z: 0 },
    o = { x: 0, z: 1, kind: "near", probability: 0.98 };
  assert.equal(passReceptionProbability(p, o, {}, 0), 0.98 * 0.2);
  assert.equal(passReceptionProbability(p, o, { z: 1 }, 0), 1);
  assert.equal(passReceptionProbability(p, o, { z: -1 }, 0), 0.98 * 0.2);
  assert.equal(passReceptionProbability(p, o, {}, 1), 1 - 0.02 * 0.2);
  assert.equal(
    passReceptionProbability(p, { ...o, kind: "body" }, {}, 0),
    0.98,
  );
});
test("all modes pause restarts, move into shape and permit a pass once ready", () => {
  for (const mode of ["match", "street", "sand", "court"]) {
    const m = new Match({ multiplayer: true });
    m.start(180, "normal", false, mode);
    m.multiplayer = true;
    m.restart(0, 0, m.field.halfWidth, "LATERAL");
    const sp = m.setPiece;
    const r = sp.reposition.find(
      (r) => Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) > 1,
    );
    assert.ok(r);
    assert.equal(m.beginAction("pass", {}), false);
    for (let i = 0; i < 120; i++) m.update(1 / 120, {}, {});
    assert.ok(
      Math.hypot(m.players[r.id].x - r.from.x, m.players[r.id].z - r.from.z) >
        0.1,
    );
    assert.equal(m.lastPass, null);
    for (let i = 0; i < 150; i++) m.update(1 / 120, {}, {});
    assert.ok(m.beginAction("pass", {}));
    m.releaseAction(0.5);
    for (let i = 0; i < 240 && m.setPiece; i++) m.update(1 / 120, {}, {});
    assert.equal(m.setPiece, null, mode);
    assert.equal(m.lastPass.team, 0);
    m.physics.dispose();
  }
});
test("keeper distribution selects an actual teammate and aims at him", () => {
  const m = new Match();
  m.start();
  m.update(1 / 120, {});
  const p = m.players[0];
  Object.assign(p.goalkeeping, { holding: true, mode: "set", holdUntil: 0 });
  m.elapsed = 10;
  m.ball.owner = p.id;
  m.ball.lastTeam = 0;
  m.updateGoalkeepers(1 / 120);
  const pass = m.lastPass,
    q = m.players[pass.target];
  assert.equal(q.team, p.team);
  assert.notEqual(q.id, p.id);
  const tx = q.x - m.ball.x,
    tz = q.z - m.ball.z;
  assert.ok(
    (tx * m.ball.vx + tz * m.ball.vz) /
      (Math.hypot(tx, tz) * Math.hypot(m.ball.vx, m.ball.vz)) >
      0.99,
  );
  m.physics.dispose();
});
