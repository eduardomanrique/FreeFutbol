import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { shotBand, advanceShotCharge } from "../src/ball-actions.js";
function solo(mode = "match") {
  const m = new Match({ random: () => 0.5 });
  m.start(180, "normal", false, mode);
  const p = m.players[m.selected];
  p.id = 0;
  p.x = -5;
  p.z = 0;
  m.players = [p];
  m.selected = 0;
  Object.assign(m.ball, { x: p.x + 0.6, z: 0, owner: 0, lastTeam: 0 });
  initLocomotion(p);
  return { m, p };
}
test("shot band boundaries are exact, including a valid 90 percent shot", () => {
  for (const [p, band] of [
    [0.8499, "normal"],
    [0.85, "long-range"],
    [0.87, "long-range"],
    [0.9, "long-range"],
    [0.9001, "mishit"],
    [1, "mishit"],
  ])
    assert.equal(shotBand(p), band);
});
test("long shots score unopposed; excessive power misses the goal on all surfaces", () => {
  for (const mode of ["match", "sand", "court", "street"])
    for (const power of [0.85, 0.9, 0.9001, 1]) {
      const { m, p } = solo(mode);
      // Isolated fixture has no opponent available to take a street restart.
      if (mode === "street")
        m.restart = (team) => {
          m.setPiece = { team };
        };
      p.x = m.field.halfLength - 24;
      m.ball.x = p.x + 0.6;
      initLocomotion(p);
      m.shoot(power);
      for (let i = 0; i < 360 && !m.lastShot; i++) m.update(1 / 120, {});
      assert.ok(m.lastShot, `${mode} ${power} contact`);
      for (
        let i = 0;
        i < 480 && m.mode === "playing" && !m.pendingRestart && !m.setPiece;
        i++
      )
        m.integrateBall(1 / 120);
      assert.equal(
        m.score[0],
        power <= 0.9 ? 1 : 0,
        `${mode} ${power}: ${JSON.stringify(m.ball)}`,
      );
      if (power > 0.9)
        assert.ok(m.pendingRestart || m.setPiece, "miss must leave play");
      m.physics.dispose();
    }
});
test("player follows a loose own touch to complete the released shot with actual foot contact", () => {
  for (const free of [false, true]) {
    const { m, p } = solo();
    for (let i = 0; i < 70; i++) m.update(1 / 120, { x: 1, sprint: true });
    m.beginAction("shoot", { x: 1 });
    m.releaseAction(0.7);
    Object.assign(m.ball, {
      x: p.x + 2.2,
      z: p.z,
      vx: 8,
      vz: 0,
      owner: free ? null : 0,
    });
    let effort = false;
    for (let i = 0; i < 360 && !m.lastShot; i++) {
      m.update(1 / 120, {});
      effort ||= !!p.ballAction?.scramble;
    }
    assert.ok(effort);
    assert.ok(m.lastShot, `free=${free}`);
    assert.equal(m.lastShot.style, "stretch-shot");
    assert.equal(p.followStyle.fall, true);
    const shot = m.lastShot;
    for (let i = 0; i < 100; i++) m.update(1 / 120, {});
    assert.equal(m.lastShot, shot, "no automatic second shot");
    m.physics.dispose();
  }
});
test("effort ends when ball escapes or an opponent touches it", () => {
  for (const reason of ["distance", "opponent", "timeout"]) {
    const { m, p } = solo();
    m.shoot(0.7);
    Object.assign(m.ball, { x: p.x + 2, owner: null, vx: 0, lastTeam: 0 });
    if (reason === "distance") m.ball.x = p.x + 7;
    if (reason === "opponent") m.ball.lastTeam = 1;
    if (reason === "timeout") p.ballAction.releasedAt = m.elapsed - 3;
    m.update(1 / 120, {});
    assert.equal(p.ballAction, null);
    assert.equal(m.lastShot, null);
    m.physics.dispose();
  }
});

test("narrow long-shot band lasts 120ms and charge timing is frame-rate independent", () => {
  assert.ok(Math.abs(advanceShotCharge(0.85, 0.12) - 0.9) < 1e-9);
  for (const hz of [30, 60, 120]) {
    let charge = 0;
    for (let i = 0; i < hz / 2; i++) charge = advanceShotCharge(charge, 1 / hz);
    assert.equal(charge, 1);
  }
});

test("finesse through 65 percent stays on the ground; above it and chips retain lift", () => {
  for (const mode of ["match", "sand", "court", "street", "duel"])
    for (const [power, finesse, chip] of [
      [0.2, true, false],
      [0.4999, true, false],
      [0.5, true, false],
      [0.65, true, false],
      [0.6501, true, false],
      [0.35, false, false],
      [0.35, true, true],
    ]) {
      const { m, p } = solo(mode);
      p.x = mode === "duel" ? -8 : m.field.halfLength - 12;
      p.dx = 1;
      p.dz = 0;
      Object.assign(m.ball, {
        x: p.x + 0.6,
        z: 0,
        y: 0.11,
        vx: 0,
        vz: 0,
        vy: 0,
      });
      initLocomotion(p);
      m.beginAction("shoot", { x: 1 });
      m.releaseAction(power, finesse, chip);
      for (let i = 0; i < 360 && !m.lastShot; i++) m.update(1 / 120, {});
      assert.ok(m.lastShot, `${mode} contact`);
      const low = finesse && !chip && power <= 0.65;
      assert.equal(m.lastShot.lowFinesse, low);
      assert.ok(
        low ? m.lastShot.lift === 0 : m.lastShot.lift > 0,
        `${mode} ${power} lift`,
      );
      if (low) {
        let maxY = m.ball.y;
        for (let i = 0; i < 40 && m.mode === "playing"; i++) {
          m.integrateBall(1 / 120);
          maxY = Math.max(maxY, m.ball.y);
        }
        assert.ok(maxY < 0.17, `${mode} low ball y=${maxY}`);
      }
      m.physics.dispose();
    }
});

test("finesse charge advances 15 percent slower, including the long-shot band, at every frame rate", () => {
  for (const hz of [30, 60, 120]) {
    let normal = 0,
      placed = 0;
    for (let i = 0; i < hz / 2; i++) normal = advanceShotCharge(normal, 1 / hz);
    for (let i = 0; i < hz / 2; i++)
      placed = advanceShotCharge(placed, 1 / hz / 0.85, true);
    assert.ok(Math.abs(normal - placed) < 1e-8);
    assert.equal(placed, 1);
  }
  assert.ok(Math.abs(advanceShotCharge(0.85, 0.12 / 0.85, true) - 0.9) < 1e-8);
  const charges = [];
  for (const finesse of [false, true]) {
    const { m } = solo();
    m.beginAction("shoot", { x: 1, finesse });
    for (let i = 0; i < 12; i++) m.update(1 / 120, { x: 1, finesse });
    charges.push(m.charge);
    m.physics.dispose();
  }
  assert.ok(Math.abs(charges[1] / 0.85 - charges[0]) < 1e-8);
});

test("low finesse stays grounded and can stop short from long distance", () => {
  for (const distance of [20, 24, 45]) {
    const { m, p } = solo("match");
    p.x = m.field.halfLength - distance;
    p.dx = 1;
    p.dz = 0;
    initLocomotion(p);
    Object.assign(m.ball, { x: p.x + 0.6, z: 0, y: 0.11, vx: 0, vz: 0, vy: 0 });
    m.beginAction("shoot", { x: 1, finesse: true });
    m.releaseAction(0.5, true);
    for (let i = 0; i < 360 && !m.lastShot; i++) m.update(1 / 120, {});
    assert.ok(m.lastShot);
    assert.equal(m.lastShot.lift, 0);
    assert.ok(m.lastShot.speed <= 24);
    let peak = m.ball.y;
    for (let i = 0; i < 720 && m.mode === "playing"; i++) {
      m.integrateBall(1 / 120);
      peak = Math.max(peak, m.ball.y);
    }
    assert.equal(
      m.score[0],
      distance <= 24 ? 1 : 0,
      `${distance}m ${JSON.stringify(m.ball)}`,
    );
    assert.ok(peak < 0.17);
    m.physics.dispose();
  }
});

test("grounded finesse remains slower than a strong aligned shot", () => {
  const speeds = [];
  for (const [power, finesse] of [
    [0.5, true],
    [0.65, true],
    [0.85, false],
  ]) {
    const { m, p } = solo();
    try {
      p.dx = 1;
      p.dz = 0;
      initLocomotion(p);
      m.beginAction("shoot", { x: 1, finesse });
      m.releaseAction(power, finesse);
      for (let i = 0; i < 360 && !m.lastShot; i++) m.update(1 / 120, {});
      assert.ok(m.lastShot);
      speeds.push(m.lastShot.speed);
    } finally {
      m.physics.dispose();
    }
  }
  assert.ok(speeds[2] > Math.max(speeds[0], speeds[1]) * 1.25);
});
