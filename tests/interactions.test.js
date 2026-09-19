import { test } from "node:test";
import assert from "node:assert/strict";
import { stepBallMotion } from "../src/ball-physics.js";
import {
  planBallReach,
  resolvePlayerContacts,
  deflectBall,
} from "../src/interactions.js";
import { initLocomotion, stepLocomotion } from "../src/locomotion.js";
import { Match } from "../src/simulation.js";
const ball = (speed = 10) => ({
  x: 0,
  y: 0.11,
  z: 0,
  vx: speed,
  vy: 0,
  vz: 0,
  spin: 0,
  owner: null,
});
const player = (x = 0, vx = 0) => {
  const p = { id: 9, x, z: 0, vx, vz: 0, dx: 1, dz: 0, kick: 0 };
  initLocomotion(p);
  return p;
};
test("unopposed rolling balls decelerate monotonically and stop at strength-dependent distances", () => {
  const results = [];
  for (const speed of [5, 10, 20]) {
    const b = ball(speed);
    let previous = speed,
      time = 0;
    while (time < 20 && Math.hypot(b.vx, b.vz) > 0) {
      stepBallMotion(b, 1 / 120);
      time += 1 / 120;
      assert.ok(Math.hypot(b.vx, b.vz) <= previous + 1e-10);
      previous = Math.hypot(b.vx, b.vz);
    }
    assert.equal(b.vx, 0);
    assert.equal(b.vz, 0);
    results.push({ speed, stop: b.x, time });
  }
  assert.ok(results[0].stop < 6);
  assert.ok(results[1].stop > 6 && results[1].stop < 9);
  assert.ok(results[2].stop > results[1].stop * 2);
  console.log("Rolling stopping measurements", results);
});
test("air drag and turf impact dissipate energy without repeated artificial bounce", () => {
  const b = { ...ball(30), y: 2, vy: -3 },
    energy = () => 0.5 * (b.vx * b.vx + b.vy * b.vy) + 9.81 * b.y;
  let before = energy();
  for (let i = 0; i < 2400; i++) {
    stepBallMotion(b, 1 / 120);
    assert.ok(energy() <= before + 0.01);
    before = energy();
  }
  assert.equal(b.y, 0.11);
  assert.equal(b.vy, 0);
  assert.equal(b.vx, 0);
});
test("collision exchanges momentum, loses energy and leaves separating bodies alone", () => {
  const a = player(0, 6),
    b = player(0.65, -2);
  b.id = 10;
  b.locomotion.mass = 95;
  const momentum = () => 78 * a.vx + 95 * b.vx,
    energy = () => 78 * a.vx * a.vx + 95 * b.vx * b.vx;
  const initialMomentum = momentum(),
    initialEnergy = energy();
  resolvePlayerContacts([a, b]);
  assert.ok(Math.abs(momentum() - initialMomentum) < 1e-8);
  assert.ok(energy() < initialEnergy);
  assert.ok(b.vx - a.vx >= 0);
  assert.ok(a.locomotion.impact > 0);
  const v = [a.vx, b.vx];
  resolvePlayerContacts([a, b]);
  assert.deepEqual([a.vx, b.vx], v);
  a.x = b.x = 0;
  resolvePlayerContacts([a, b]);
  assert.ok(b.x > a.x);
});
test("near and medium reach are automatic", () => {
  const p = player(),
    b = { ...ball(0), x: 0.7, z: 0 };
  assert.equal(planBallReach(p, b, {}).kind, "near");
  assert.equal(planBallReach(p, { ...b, x: 1.2 }, {}).kind, "medium");
  assert.equal(planBallReach(p, { ...b, x: 1.2 }, { x: -1 }).kind, "medium");
  assert.equal(
    planBallReach(p, { ...b, x: 1.2 }, { x: 1, z: 0.4 }).kind,
    "medium",
  );
  assert.equal(planBallReach(p, { ...b, x: 5 }, { x: 1 }), null);
  assert.equal(planBallReach(p, { ...b, y: 3 }, { x: 1 }), null);
});
test("intentional close interception reaches with a leg before gaining possession", () => {
  const m = new Match({ random: () => 0 });
  m.start();
  m.players.forEach((p) => {
    if (p.id !== 9) {
      p.x = -40;
      p.z = -25;
    }
  });
  const p = m.players[9];
  p.x = 0;
  p.z = 0;
  initLocomotion(p);
  Object.assign(m.ball, ball(-2), { x: 1.1, z: 0.35 });
  m.kickCooldown = 0;
  let reached = false,
    owned = false;
  for (let i = 0; i < 90; i++) {
    m.update(1 / 120, { x: 0.3, z: 0.1 });
    reached ||= p.locomotion.feet.some((f) => f.special === "reach");
    if (m.ball.owner === 9) {
      owned = true;
      break;
    }
  }
  assert.ok(reached);
  assert.ok(owned);
  assert.equal(m.lastReception.reached, true);
});
test("power preparation decreases cadence and increases actual swing amplitude", () => {
  const samples = [];
  for (const charge of [0.1, 1]) {
    const p = player();
    for (let i = 0; i < 240; i++) stepLocomotion(p, 5.8, 0, 1 / 120);
    let maxForward = -Infinity,
      minForward = Infinity,
      start = p.locomotion.stepCount;
    for (let i = 0; i < 480; i++) {
      stepLocomotion(p, 5.8, 0, 1 / 120, { charging: true, charge });
      if (i > 120)
        for (const f of p.locomotion.feet) {
          maxForward = Math.max(maxForward, f.x - p.x);
          minForward = Math.min(minForward, f.x - p.x);
        }
      assert.ok(p.locomotion.height > 0.6);
    }
    samples.push({
      steps: p.locomotion.stepCount - start,
      amplitude: maxForward - minForward,
      interval: p.locomotion.strideInterval,
    });
  }
  console.log("Preparation gait", samples);
  assert.ok(samples[1].interval > samples[0].interval * 1.2);
  assert.ok(samples[1].amplitude > samples[0].amplitude * 1.05);
  assert.ok(samples[1].steps < samples[0].steps);
});
test("a tap shot settles and stops inside the pitch without any player touching it", () => {
  const m = new Match();
  m.start();
  m.shoot(0);
  for(let i=0;i<120 && !m.lastShot;i++)m.update(1/120,{});
  m.players.forEach((p, i) => {
    p.x = -30 + i * 2;
    p.z = -25;
  });
  for (let i = 0; i < 1200; i++) m.integrateBall(1 / 120);
  assert.equal(m.ball.owner, null);
  assert.equal(m.ball.vx, 0);
  assert.equal(m.ball.vz, 0);
  assert.ok(m.ball.x > 5 && m.ball.x < 18, `tap stopped at ${m.ball.x}`);
  assert.deepEqual(m.score, [0, 0]);
});

test("fast ball rebounds along the contact normal for frontal and lateral impacts", () => {
  const p = player();
  p.team = 0;
  for (const [x, z, vx, vz] of [
    [0.4, 0, -25, 0],
    [0, 0.4, 0, -25],
  ]) {
    const b = { ...ball(), x, z, vx, vz };
    assert.ok(deflectBall(b, p));
    assert.ok(b.vx * x + b.vz * z > 0);
    assert.ok(Math.hypot(b.vx, b.vz) < 25);
    assert.equal(deflectBall(b, p), false);
  }
});
