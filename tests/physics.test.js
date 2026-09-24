import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
const isolate = (m) =>
  m.players.forEach((p, i) => {
    p.x = -30 + i * 2;
    p.z = -25;
  });
const strike = (m) => {
  for (let i = 0; i < 240 && !m.lastShot && !m.lastPass; i++)
    m.update(1 / 120, {});
  assert.ok(m.lastShot || m.lastPass);
};
const tick = (m, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) m.update(1 / 120, input);
};
test("movement, sprint and stamina are frame independent", () => {
  let a = new Match(),
    b = new Match();
  a.start();
  b.start();
  for (const m of [a, b])
    m.players.forEach((p) => {
      if (p.id !== 9) {
        p.x = -38;
        p.z = -25 + p.id * 2;
      }
    });
  tick(a, 2, { x: 1, sprint: false });
  tick(b, 2, { x: 1, sprint: true });
  assert.ok(b.players[9].x > a.players[9].x + 0.1);
  assert.ok(b.players[9].stamina < a.players[9].stamina);
  assert.ok(a.ball.x > 0);
});
test("overpowered shot releases possession with greater speed and an inaccurate flight", () => {
  let a = new Match(),
    b = new Match();
  a.start();
  b.start();
  a.shoot(0.1);
  b.shoot(1);
  strike(a);
  strike(b);
  assert.equal(b.ball.owner, null);
  assert.ok(b.ball.vx > a.ball.vx);
  assert.ok(b.ball.vy > 0);
  assert.equal(b.lastShot.power, 1);
  assert.equal(b.lastShot.speed, 50);
  assert.equal(b.lastShot.band, "mishit");
  tick(b, 0.2);
  assert.ok(b.ball.y > 0.11);
});
test("passes release ball and select receiver", () => {
  let m = new Match();
  m.start();
  assert.equal(m.pass(), true);
  assert.equal(m.ball.owner, 9);
  strike(m);
  assert.notEqual(m.selected, 9);
  assert.equal(m.ball.owner, null);
  assert.equal(m.lastAction, "pass");
});
test("rolling friction and bounce dissipate energy", () => {
  let m = new Match();
  m.start();
  Object.assign(m.ball, {
    x: 0,
    z: 0,
    y: 2,
    vy: -3,
    vx: 10,
    vz: 0,
    owner: null,
  });
  for (let i = 0; i < 120; i++) m.integrateBall(1 / 120);
  assert.ok(m.ball.vx < 10);
  assert.ok(m.ball.y >= 0.11);
  assert.ok(m.ball.y < 2);
});
test("goal counts once and kicks off for conceding team", () => {
  let m = new Match();
  m.start();
  Object.assign(m.ball, {
    x: 46.1,
    y: 0.4,
    z: 0,
    vx: 20,
    vy: 0,
    vz: 0,
    owner: null,
  });
  m.integrateBall(1 / 120);
  assert.deepEqual(m.score, [1, 0]);
  assert.equal(m.mode, "goal");
  tick(m, 3.1);
  assert.deepEqual(m.score, [1, 0]);
  assert.equal(m.mode, "playing");
  assert.equal(m.ball.lastTeam, 1);
});
test("shots above crossbar and wide do not score", () => {
  for (let [y, z] of [
    [4, 0],
    [0.4, 6],
  ]) {
    let m = new Match();
    m.start();
    Object.assign(m.ball, {
      x: 46.1,
      y,
      z,
      vx: 25,
      vy: 0,
      vz: 0,
      owner: null,
      lastTeam: 0,
    });
    m.integrateBall(1 / 120);
    assert.deepEqual(m.score, [0, 0]);
    assert.equal(m.event, "TIRO DE META");
    assert.equal(m.pendingRestart.team, 1);
    tick(m, 2.05);
    assert.equal(m.ball.lastTeam, 1);
  }
});
test("goalpost reflects ball", () => {
  let m = new Match();
  m.start();
  Object.assign(m.ball, {
    x: 45.7,
    y: 1,
    z: 3.66,
    vx: 20,
    vy: 0,
    vz: 0,
    owner: null,
  });
  for (let i = 0; i < 4; i++) m.integrateBall(1 / 120);
  assert.ok(m.ball.vx < 0);
  assert.equal(m.score[0], 0);
});
test("touchline awards other team possession", () => {
  let m = new Match();
  m.start();
  Object.assign(m.ball, {
    x: 4,
    y: 0.11,
    z: 30.2,
    vz: 10,
    vx: 0,
    owner: null,
    lastTeam: 0,
  });
  m.integrateBall(1 / 120);
  assert.equal(m.event, "LATERAL");
  assert.equal(m.pendingRestart.team, 1);
  tick(m, 2.05);
  assert.equal(m.ball.lastTeam, 1);
});
test("pause freezes simulation and duration ends match", () => {
  let m = new Match();
  m.start(1);
  m.mode = "paused";
  tick(m, 2);
  assert.equal(m.elapsed, 0);
  m.mode = "playing";
  tick(m, 1.1);
  assert.equal(m.mode, "finished");
});
test("long autonomous simulation remains finite and on field", () => {
  let seed = 8;
  let m = new Match({
    random: () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    },
  });
  m.start(360);
  for (let i = 0; i < 120 * 100; i++) {
    m.update(1 / 120, {
      x: Math.sin(i / 160),
      z: Math.cos(i / 170),
      sprint: i % 200 < 100,
    });
    for (const p of m.players)
      assert.ok(
        p.locomotion.height > 0.6 && p.locomotion.height < 1.5,
        `COM unstable at frame ${i}, player ${p.id}`,
      );
  }
  for (let p of m.players) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(Math.abs(p.x) < 47 && Math.abs(p.z) < 31);
  }
  assert.ok(Number.isFinite(m.ball.y));
  assert.ok(m.ball.y >= 0.11);
});

test("85–90% shot from edge of box reaches goal below crossbar with pace", () => {
  const m = new Match({ random: () => 0.5 });
  m.start();
  isolate(m);
  m.players[9].z = 0;
  m.players[9].x = 25;
  m.ball.x = 25.7;
  m.shoot(0.87);
  strike(m);
  let speedAtLine = 0;
  for (let i = 0; i < 120; i++) {
    m.integrateBall(1 / 120);
    if (m.mode === "goal") {
      speedAtLine = Math.hypot(m.ball.vx, m.ball.vz);
      break;
    }
  }
  assert.equal(m.score[0], 1);
  assert.ok(speedAtLine > 28 && speedAtLine < 39);
});
test("rolling ball does not lose most of its speed in one second", () => {
  const m = new Match();
  m.start();
  isolate(m);
  Object.assign(m.ball, {
    x: 0,
    z: 20,
    y: 0.11,
    vx: 25,
    vz: 0,
    vy: 0,
    owner: null,
  });
  for (let i = 0; i < 120; i++) m.integrateBall(1 / 120);
  assert.ok(m.ball.vx > 16 && m.ball.vx < 18, `rolling speed ${m.ball.vx}`);
});

test("short shot charges stop in live Rapier and remain at rest without a touch", () => {
  const distances = [];
  for (const power of [0, 0.1, 0.25]) {
    const m = new Match();
    m.start();
    m.players[9].x = -25;
    m.ball.x = -24.3;
    m.shoot(power);
    strike(m);
    isolate(m);
    const start = m.ball.x;
    let stopped = null;
    for (let i = 0; i < 1200; i++) {
      m.integrateBall(1 / 120);
      if (i > 120 && Math.hypot(m.ball.vx, m.ball.vz) === 0 && !stopped)
        stopped = { x: m.ball.x, z: m.ball.z };
      if (stopped)
        assert.ok(
          Math.hypot(m.ball.x - stopped.x, m.ball.z - stopped.z) < 0.0001,
        );
    }
    assert.ok(stopped);
    assert.equal(m.ball.owner, null);
    distances.push(stopped.x - start);
    m.physics.dispose();
  }
  assert.ok(distances[0] < 16 && distances[1] < 40 && distances[2] < 68);
  assert.ok(distances[0] < distances[1] && distances[1] < distances[2]);
});
