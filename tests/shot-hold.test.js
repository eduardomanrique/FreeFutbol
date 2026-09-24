import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion, strikePlantDuration } from "../src/locomotion.js";
function solo() {
  const m = new Match({ random: () => 0.99 });
  m.start();
  const p = m.players[9];
  p.id = 0;
  p.x = -30;
  p.z = 0;
  m.players = [p];
  m.selected = 0;
  Object.assign(m.ball, { owner: 0, x: -29.3, z: 0 });
  initLocomotion(p);
  return { m, p };
}
test("holding shoot for several seconds leaves sprint, turns and dribble touches unchanged until release", () => {
  const a = solo(),
    b = solo();
  for (let i = 0; i < 80; i++) {
    a.m.update(1 / 120, { x: 1, sprint: true });
    b.m.update(1 / 120, { x: 1, sprint: true });
  }
  a.m.beginAction("shoot", { x: 1, sprint: true });
  for (let i = 0; i < 300; i++) {
    const input =
      i < 150 ? { x: 1, sprint: true } : { x: 0.96, z: 0.26, sprint: true };
    a.m.update(1 / 120, input);
    b.m.update(1 / 120, input);
    assert.ok(Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) < 0.001);
    assert.ok(
      Math.hypot(a.m.ball.x - b.m.ball.x, a.m.ball.z - b.m.ball.z) < 0.001,
    );
    assert.equal(a.p.strikePlant, undefined);
    assert.notEqual(a.p.ballMotion?.kind, "strike");
  }
  assert.equal(a.m.lastShot, null);
  assert.equal(a.m.charge, 1);
  assert.equal(a.p.ballAction.stage, "charging");
  a.m.releaseAction(1);
  for (let i = 0; i < 360 && !a.m.lastShot; i++) a.m.update(1 / 120, {});
  assert.ok(a.m.lastShot);
  assert.ok(!a.m.lastShot.overcharged);
  a.m.physics.dispose();
  b.m.physics.dispose();
});
test("strong released shot has a longer preparation step than a light shot", () => {
  const results = [];
  for (const power of [0.3, 1]) {
    const { m, p } = solo();
    for (let i = 0; i < 80; i++) m.update(1 / 120, { x: 1 });
    m.beginAction("shoot", { x: 1 });
    m.releaseAction(power);
    const duration = strikePlantDuration(p);
    let reach = 0,
      lean = 0;
    for (let i = 0; i < 360 && !m.lastShot; i++) {
      m.update(1 / 120, {});
      reach = Math.max(reach, p.locomotion.strideReach);
      lean = Math.max(lean, p.locomotion.expression.strikeLean);
    }
    assert.ok(m.lastShot);
    assert.ok(lean > 0);
    results.push({ duration, reach });
    m.physics.dispose();
  }
  assert.ok(results[1].duration > results[0].duration);
  assert.ok(results[1].reach > results[0].reach + 0.05);
});
