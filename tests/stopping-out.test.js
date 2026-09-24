import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { stepBallMotion } from "../src/ball-physics.js";
import { SURFACES } from "../src/surfaces.js";
test("sprint release brakes body and ball together across surfaces and touch phases", () => {
  for (const mode of ["match", "sand", "street", "court"])
    for (const frames of [180, 220, 260, 300]) {
      const m = new Match({ random: () => 0.99 });
      m.start(180, "normal", false, mode);
      const p = m.players[m.selected];
      p.id = 0;
      p.x = -m.field.halfLength + 2;
      p.z = 0;
      m.players = [p];
      m.selected = 0;
      Object.assign(m.ball, { owner: 0, x: p.x + 0.7, z: 0 });
      initLocomotion(p);
      for (let i = 0; i < frames; i++)
        m.update(1 / 120, { x: 1, sprint: true });
      let behind = 0;
      for (let i = 0; i < 480; i++) {
        m.update(1 / 120, {});
        behind = Math.min(behind, m.ball.x - p.x);
      }
      assert.ok(behind > -0.15, `${mode}/${frames}: ball behind ${behind}`);
      assert.equal(m.ball.owner, 0);
      assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.15);
      assert.ok(Math.hypot(p.vx, p.vz) < 0.1);
      assert.ok(Math.hypot(m.ball.vx, m.ball.vz) < 0.1);
      m.physics.dispose();
    }
});
test("sand rolls farther after retuning while remaining shorter than grass", () => {
  function roll(surface) {
    const b = { x: 0, z: 0, y: 0.11, vx: 8, vz: 0, vy: 0, spin: 0, surface };
    for (let i = 0; i < 360; i++) stepBallMotion(b, 1 / 120);
    return b.x;
  }
  const range = roll("sand");
  assert.ok(range > 1.7 && range < roll("grass"));
  assert.equal(SURFACES.sand.bounce, 0.08);
});
test("out-of-play ball remains dynamic for two seconds before repositioning in each pitch mode", () => {
  for (const mode of ["match", "sand", "court"]) {
    const m = new Match();
    m.start(180, "normal", false, mode);
    const W = m.field.halfWidth;
    Object.assign(m.ball, {
      owner: null,
      lastTeam: 0,
      x: 0,
      z: W + 0.05,
      y: 0.3,
      vx: 0,
      vz: 8,
      vy: 0,
    });
    m.integrateBall(1 / 60);
    assert.equal(m.pendingRestart.message, "LATERAL");
    assert.equal(m.setPiece, null);
    const exitZ = m.ball.z;
    assert.equal(m.beginAction("pass", {}), false);
    for (let i = 0; i < 180; i++) m.update(1 / 120, {});
    assert.ok(m.ball.z > exitZ + 0.5);
    assert.ok(m.pendingRestart);
    assert.equal(m.setPiece, null);
    assert.equal(m.ball.owner, null);
    for (let i = 0; i < 65; i++) m.update(1 / 120, {});
    assert.equal(m.pendingRestart, null);
    assert.equal(m.setPiece.team, 1);
    assert.ok(m.setPiece.readyAt > m.elapsed);
    m.physics.dispose();
  }
});
