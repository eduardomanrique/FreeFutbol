import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { MODES } from "../src/modes.js";
for (const variant of ["street", "sand", "court"]) {
  test(`${variant}: teams, simulation, restarts and small-goal scoring`, () => {
    const m = new Match({ random: () => 0.5 });
    m.start(180, "normal", false, variant);
    const c = MODES[variant];
    assert.equal(m.players.length, c.players * 2);
    assert.ok(m.players.every((p, i) => p.id === i));
    assert.equal(
      m.players.filter((p) => p.keeper).length,
      variant === "street" ? 0 : 2,
    );
    for (let i = 0; i < 600; i++) m.update(1 / 120, { x: 1, z: -1 });
    assert.ok(
      m.players.every(
        (p) =>
          Number.isFinite(p.x) &&
          Math.abs(p.x) <= c.halfLength + 0.5 &&
          Math.abs(p.z) <= c.halfWidth + 0.5,
      ),
    );
    for (const p of m.players.filter((p) => p.keeper))
      assert.ok(
        Math.abs(p.x) > c.halfLength - 4 && Math.abs(p.x) < c.halfLength,
      );
    m.restart(0, 0, c.halfWidth, "LATERAL");
    assert.equal(m.setPiece.type, "kickin");
    assert.ok(m.setPiece.readyAt > m.elapsed);
    m.setPiece=null;
    assert.equal(m.ball.y, 0.11);
    // Isolate the ball from athletes and cross the actual small goal line.
    for (const p of m.players) {
      p.x = 0;
      p.z = c.halfWidth - 2;
    }
    Object.assign(m.ball, {
      x: c.halfLength - 0.3,
      z: 0,
      y: 0.11,
      vx: 12,
      vy: 0,
      vz: 0,
      owner: null,
      lastTeam: 0,
    });
    for (let i = 0; i < 12 && m.mode !== "goal"; i++) m.integrateBall(1 / 120);
    assert.equal(m.mode, "goal");
    assert.equal(m.score[0], 1);
    m.resetPlayers(1);
    assert.equal(m.players[m.ball.owner].team, 1);
    m.mode = "playing";
    Object.assign(m.ball, {
      x: c.halfLength - 0.3,
      z: c.goalHalf + 1,
      y: 0.11,
      vx: 12,
      vy: 0,
      vz: 0,
      owner: null,
      lastTeam: 0,
    });
    for (let i = 0; i < 12; i++) m.integrateBall(1 / 120);
    assert.equal(m.score[0], 1);
    assert.equal(m.mode, "playing");
    m.start();
    assert.equal(m.players.length, 22);
    assert.equal(m.field.halfLength, 46);
    m.physics.world.free();
  });
}

for (const variant of ["sand", "court"]) {
  test(`${variant}: goalkeeper catches a central shot inside the compact area`, () => {
    const m = new Match({ random: () => 0.5 });
    m.start(180, "normal", false, variant);
    const keeper = m.players.find((p) => p.team === 1 && p.keeper);
    for (const p of m.players) {
      p.x = 0;
      p.z = m.field.halfWidth - 2;
      p.think = 99;
    }
    keeper.x = m.field.halfLength - 2;
    keeper.z = 0;
    Object.assign(m.ball, {
      owner: null,
      x: keeper.x - 5,
      z: 0,
      y: 1.1,
      vx: 10,
      vz: 0,
      vy: 2.4,
    });
    for (let i = 0; i < 180 && !m.lastSave; i++) m.update(1 / 120, {});
    assert.equal(m.lastSave?.player, keeper.id);
    assert.equal(m.lastSave?.kind, "catch");
    assert.equal(m.ball.owner, keeper.id);
    m.physics.dispose();
  });
}

test("street curb rebounds ground shots but lofted balls give the opponent a lateral", () => {
  for (const side of [-1, 1])
    for (const speed of [5, 20, 45]) {
      const m = new Match();
      m.start(180, "normal", false, "street");
      assert.equal(m.field.halfLength * 2, 38.4);
      assert.equal(m.field.halfWidth * 2, 10.35);
      for (const p of m.players) {
        p.x = -10;
        p.z = 0;
      }
      Object.assign(m.ball, {
        x: 0,
        z: side * (m.field.halfWidth - 0.6),
        y: 0.11,
        vx: 0,
        vz: side * speed,
        vy: 0,
        owner: null,
        lastTeam: 0,
      });
      const sequence = m.sequence;
      let rebounded = false;
      for (let i = 0; i < 90; i++) {
        m.integrateBall(1 / 120);
        rebounded ||= m.ball.vz * side < -0.1;
        assert.ok(Math.abs(m.ball.z) < m.field.halfWidth);
      }
      assert.ok(rebounded, `side ${side}, speed ${speed}`);
      assert.equal(m.sequence, sequence, "curb contact must not restart play");
      assert.equal(m.ball.lastTeam, 0, "curb does not change last toucher");
      Object.assign(m.ball, {
        x: 0,
        z: side * (m.field.halfWidth - 0.6),
        y: 1.5,
        vx: 0,
        vz: side * speed,
        vy: 1,
        owner: null,
        lastTeam: 0,
      });
      for (let i = 0; i < 90 && m.sequence === sequence; i++)
        m.integrateBall(1 / 120);
      assert.equal(m.event, "LATERAL");
      assert.equal(m.players[m.ball.owner].team, 1);
      m.physics.dispose();
    }
});

test("sand and court still give a lateral for ground balls", () => {
  for (const variant of ["sand", "court"]) {
    const m = new Match();
    m.start(180, "normal", false, variant);
    for (const p of m.players) {
      p.x = -10;
      p.z = 0;
    }
    Object.assign(m.ball, {
      x: 0,
      z: m.field.halfWidth - 0.4,
      y: 0.11,
      vx: 0,
      vz: 10,
      vy: 0,
      owner: null,
      lastTeam: 0,
    });
    for (let i = 0; i < 30 && m.event !== "LATERAL"; i++)
      m.integrateBall(1 / 120);
    assert.equal(m.event, "LATERAL");
    m.physics.dispose();
  }
});
