import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { dribbleImpulse, guideDribbler } from "../src/dribbling.js";
import { planBicycle } from "../src/gameplay-actions.js";
function runner() {
  const m = new Match({ random: () => 0.99 });
  m.start();
  const p = m.players[9];
  p.id = 0;
  p.x = -25;
  m.players = [p];
  m.selected = 0;
  Object.assign(m.ball, { owner: 0, x: -24.2 });
  initLocomotion(p);
  return { m, p };
}
test("45-degree cuts wait for the ball and retain possession with repeated physical touches", () => {
  for (const sprint of [false, true]) {
    const { m, p } = runner();
    for (let i = 0; i < 240; i++) m.update(1 / 120, { x: 1, sprint });
    const before = Math.hypot(p.vx, p.vz),
      a = (45 * Math.PI) / 180;
    let min = before,
      maxD = 0,
      contacts = 0,
      last = m.lastTouch.time;
    for (let i = 0; i < (sprint ? 420 : 180); i++) {
      m.update(1 / 120, { x: Math.cos(a), z: Math.sin(a), sprint });
      min = Math.min(min, Math.hypot(p.vx, p.vz));
      maxD = Math.max(maxD, Math.hypot(m.ball.x - p.x, m.ball.z - p.z));
      if (m.lastTouch.time !== last) {
        contacts++;
        last = m.lastTouch.time;
      }
    }
    assert.equal(m.ball.owner, 0);
    assert.ok(
      min > before * (sprint ? 0.15 : 0.8),
      JSON.stringify({ sprint, min, before, maxD, contacts }),
    );
    assert.ok(
      maxD < (sprint ? 3.5 : 2.2),
      JSON.stringify({ sprint, maxD, contacts }),
    );
    assert.ok(contacts >= 2);
    m.physics.dispose();
  }
});
test("gentle redirect preserves touch energy; reversal still needs a short braking touch", () => {
  const { m, p } = runner();
  Object.assign(p, {
    vx: 6,
    vz: 0,
    lastDribble: { vx: 9, vz: 0, lead: 0.8 },
    dribbleIntent: { x: 6 * Math.SQRT1_2, z: 6 * Math.SQRT1_2 },
  });
  const cut = dribbleImpulse(p, m.ball);
  assert.ok(Math.hypot(cut.vx, cut.vz) > 8.8);
  assert.ok(Math.abs(cut.vx - cut.vz) < 0.001);
  p.dribbleIntent = { x: -6, z: 0 };
  const reversal = dribbleImpulse(p, m.ball);
  assert.ok(Math.hypot(reversal.vx, reversal.vz) < 4);
  m.physics.dispose();
});
test("beach allows overhead shots side-on and closer to opponents while grass remains restrictive", () => {
  const m = new Match();
  m.start(180, "normal", false, "sand");
  const p = m.players[m.selected];
  for (const q of m.players) {
    q.x = -15;
    q.z = 10;
    initLocomotion(q);
  }
  Object.assign(p, { x: 12, z: 0, dx: 0, dz: 1, vx: 0, vz: 0 });
  initLocomotion(p);
  Object.assign(m.ball, {
    owner: null,
    x: 12.9,
    z: 0,
    y: 2.15,
    vx: -3,
    vz: 0,
    vy: 0,
  });
  const action = { type: "shoot", firstTime: true };
  assert.ok(planBicycle(m, p, action));
  m.variant = "match";
  assert.equal(planBicycle(m, p, action), null);
  m.physics.dispose();
});

test("beach AI attempts a suitable overhead cross and uses the short cooldown", () => {
  const m = new Match({ random: () => 0.99 });
  m.start(180, "normal", false, "sand");
  const p = m.players[1];
  for (const q of m.players) {
    q.x = -15;
    q.z = 10;
    initLocomotion(q);
  }
  Object.assign(p, { x: 12, z: 0, dx: 0, dz: 1, vx: 0, vz: 0 });
  initLocomotion(p);
  Object.assign(m.ball, {
    owner: null,
    lastTeam: 0,
    x: 12.9,
    z: 0,
    y: 2.15,
    vx: -3,
    vz: 0,
    vy: 0,
  });
  m.update(1 / 120, {});
  assert.ok(p.bicycle);
  assert.ok(p.nextBicycle - m.elapsed <= 3.01);
  for (let i = 0; i < 70; i++) m.update(1 / 120, {});
  assert.ok(m.lastShot?.bicycle);
  m.physics.dispose();
});

test("between touches the carrier follows the ball and samples the current stick only at contact", () => {
  for (const speed of [3, 6, 9]) {
    const p = {
      x: 0,
      z: 0,
      vx: speed,
      vz: 0,
      dx: 1,
      dz: 0,
      lastDribble: { vx: speed + 2, vz: 0, lead: 0.8 },
    };
    const b = {
      x: 1.6,
      z: 0,
      y: 0.11,
      vx: speed + 2,
      vz: 0,
      vy: 0,
      spin: 0,
      surface: "grass",
    };
    const before = { ...b };
    const requested = speed * Math.SQRT1_2;
    const pursuit = guideDribbler(p, b, requested, requested);
    assert.ok(pursuit.x > 0);
    assert.ok(Math.abs(pursuit.z) < 1e-9);
    assert.deepEqual(b, before, "guidance cannot redirect the free ball");
    const held = dribbleImpulse(p, b);
    assert.ok(
      Math.abs(held.vx - held.vz) < 1e-9,
      "held direction redirects at contact",
    );
    guideDribbler(p, b, speed, 0);
    const cancelled = dribbleImpulse(p, b);
    assert.equal(cancelled.vz, 0, "a released turn must not remain queued");
  }
});
