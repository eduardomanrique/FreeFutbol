import { test } from "node:test";
import assert from "node:assert/strict";
import { FootballPhysics } from "../src/physics-world.js";
const ball = (v = {}) => ({
  x: 0,
  y: 0.11,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  spin: 0,
  owner: null,
  ...v,
});
test("Rapier resolves capsule impact with conserved planar momentum and bounded separation", () => {
  const engine = new FootballPhysics();
  const dt = 1 / 120;
  const players = [
    { x: -0.35, z: 10, vx: 4, vz: 0 },
    { x: 0.35, z: 10, vx: -2, vz: 0 },
  ];
  const match = { players, ball: ball() };
  for (let i = 0; i < 12; i++) {
    players.forEach((p) => {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    });
    engine.preparePlayers(players, dt);
    engine.step(match, dt);
  }
  assert.ok(Math.abs(players[0].vx + players[1].vx - 2) < 0.01);
  assert.ok(players[0].vx < 2 && players[1].vx > 0);
  assert.ok(players[1].x - players[0].x > 0.65);
  assert.equal(engine.snapshot().engine, "Rapier");
  engine.dispose();
});
test("CCD catches a shot crossing an entire thin goalpost within one tick", () => {
  const engine = new FootballPhysics();
  const m = { players: [], ball: ball({ x: 45.7, y: 1, z: 3.66, vx: 90 }) };
  for (let i = 0; i < 5; i++) engine.step(m, 1 / 120);
  assert.ok(m.ball.vx < 0);
  assert.ok(m.ball.x < 45.85);
  engine.dispose();
});
test("Rapier grass contact stops low and medium balls without reversing their direction", () => {
  const distances = [];
  for (const speed of [5, 10]) {
    const engine = new FootballPhysics();
    const m = { players: [], ball: ball({ vx: speed }) };
    let previous = speed;
    for (let i = 0; i < 1200; i++) {
      engine.step(m, 1 / 120);
      assert.ok(m.ball.vx >= -1e-5 && m.ball.vx <= previous + 0.015);
      previous = m.ball.vx;
    }
    assert.equal(m.ball.vx, 0);
    assert.equal(m.ball.vz, 0);
    distances.push(m.ball.x);
    engine.dispose();
  }
  assert.ok(distances[0] > 1 && distances[0]<2 && distances[1] < 8 && distances[1] > distances[0] * 2);
  console.log("Rapier stopping distances, 5/10 m/s:", distances);
});

test("root correction changes displacement without accumulating propulsion velocity", () => {
  const engine = new FootballPhysics(),
    dt = 1 / 120;
  const p = { x: 0, z: 10, vx: 0, vz: 0, warpVelocity: { x: 1, z: 0 } };
  const match = { players: [p], ball: ball() };
  for (let i = 0; i < 24; i++) {
    p.x += dt;
    engine.preparePlayers(match.players, dt);
    engine.step(match, dt);
    assert.ok(Math.abs(p.vx) < 1e-5);
  }
  assert.ok(Math.abs(p.x - 0.2) < 1e-5);
  p.warpVelocity.x = 0;
  engine.preparePlayers(match.players, dt);
  engine.step(match, dt);
  assert.ok(Math.abs(p.x - 0.2) < 1e-5);
  engine.dispose();
});
