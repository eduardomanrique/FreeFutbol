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
test("moving shots retain momentum through support and contact, then brake after landing", () => {
  for (const input of [
    { x: 0.3, jockey: true },
    { x: 1 },
    { x: 1, sprint: true },
  ]) {
    const { m, p } = solo();
    for (let i = 0; i < 80; i++) m.update(1 / 120, input);
    m.beginAction("shoot", input);
    m.releaseAction(0.8);
    const approachSpeed = Math.hypot(p.vx, p.vz);
    let minSpeed = approachSpeed,
      landingSpeed = 0,
      contact = false;
    for (let i = 0; i < 360; i++) {
      const active = !!p.movingStrike;
      m.update(1 / 120, {});
      if (active && p.movingStrike)
        minSpeed = Math.min(minSpeed, Math.hypot(p.vx, p.vz));
      if (p.movingStrike?.stage === "follow")
        assert.ok(
          Math.abs(p.locomotion.heading - p.movingStrike.heading) < 0.2,
          "no defensive turn during follow-through",
        );
      contact ||= !!m.lastShot;
      if (p.locomotion.lastMovingStrike) {
        landingSpeed = Math.hypot(p.vx, p.vz);
        break;
      }
    }
    assert.ok(contact, "actual ball contact");
    assert.ok(
      landingSpeed > 0,
      `kick foot lands ${JSON.stringify(input)} ${JSON.stringify(m.lastShot)}`,
    );
    assert.ok(
      minSpeed >= approachSpeed * 0.93,
      `${minSpeed}/${approachSpeed}: no stop before landing`,
    );
    assert.ok(minSpeed < approachSpeed * 0.99, "small support deceleration");
    for (let i = 0; i < 90; i++) m.update(1 / 120, {});
    assert.ok(
      Math.hypot(p.vx, p.vz) < landingSpeed * 0.6,
      "normal braking after landing",
    );
    m.physics.dispose();
  }
});
test("placed shots open the kicking foot outwards and recover after medial contact", () => {
  for (const footedness of ["right", "left"]) {
    const { m, p } = solo();
    p.footedness = footedness;
    m.beginAction("shoot", { x: 1 });
    m.releaseAction(0.55, true);
    let opened = false,
      followed = false;
    for (let i = 0; i < 300; i++) {
      m.update(1 / 120, {});
      const motion = p.ballMotion;
      if (motion?.kind !== "strike") continue;
      assert.equal(motion.finesse, true);
      const f = p.locomotion.feet[motion.foot];
      const angle = Math.atan2(
        Math.sin(f.heading - p.locomotion.heading),
        Math.cos(f.heading - p.locomotion.heading),
      );
      if (Math.abs(angle) > 1) {
        opened = true;
        assert.equal(Math.sign(angle), f.side);
      }
      if (motion.hit) followed = true;
    }
    assert.ok(opened && followed, footedness);
    assert.equal(m.lastShot.finesse, true);
    assert.equal(m.lastShot.foot, footedness === "right" ? 0 : 1);
    m.physics.dispose();
  }
});
