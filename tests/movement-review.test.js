import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { packPlayer, validPlayer } from "../shared/team-protocol.js";
import { planTurn } from "../src/turning.js";
import { stepBodyExpression } from "../src/body-expression.js";
import { celebrate } from "../src/gameplay-actions.js";
import { rollingResistance } from "../src/surfaces.js";
const dt = 1 / 120;
function fixture(variant = "match", footedness = "right") {
  const m = new Match({ random: () => 0.5 });
  m.start(180, "normal", false, variant);
  const p = m.players.find((p) => !p.keeper) || m.players[0];
  Object.assign(p, {
    id: 0,
    x: -5,
    z: 0,
    dx: 1,
    dz: 0,
    vx: 0,
    vz: 0,
    footedness,
  });
  initLocomotion(p);
  m.players = [p];
  m.selected = 0;
  m.kickCooldown = 0;
  Object.assign(m.ball, {
    owner: 0,
    x: -4.4,
    y: 0.11,
    z: 0,
    vx: 0,
    vz: 0,
    vy: 0,
  });
  return { m, p };
}
const step = (m, n, input = {}) => {
  for (let i = 0; i < n; i++) m.update(dt, input);
};
test("sand rolls more freely but remains slower than grass", () => {
  for (const speed of [1, 3, 6, 12]) {
    const previous = 9 + 0.085 * speed + 12 / (1 + (speed / 3) ** 2);
    const current = rollingResistance({ surface: "sand" }, speed);
    assert.ok(current < previous * 0.85 && current > previous * 0.7);
    assert.ok(current > rollingResistance({ surface: "grass" }, speed));
  }
});
test("header strength mostly comes from the arriving ball, including full charge", () => {
  const results = [];
  for (const incoming of [2, 10, 20]) {
    const { m, p } = fixture();
    Object.assign(m.ball, {
      owner: null,
      x: p.x + 0.1,
      y: 1.76,
      z: p.z,
      vx: -incoming,
      vz: 0,
      vy: 0,
    });
    p.header = { height: 0, crouch: 0 };
    m.executeHeader(p, {
      type: "shoot",
      power: 1,
      targetZ: 0,
      releasedAt: m.elapsed,
    });
    results.push(m.lastShot.speed);
    assert.ok(Math.hypot(m.ball.vx, m.ball.vy, m.ball.vz) < incoming + 5);
    m.physics.dispose();
  }
  assert.ok(results[0] < 6);
  assert.ok(results[2] > results[0] + 12);
});
test("shoot and steering in either input order produce a shot without a cut", () => {
  for (const order of ["turn-first", "shoot-first"]) {
    const { m, p } = fixture();
    step(m, 180, { x: 1 });
    Object.assign(m.ball, { owner: 0, x: p.x + 0.7, z: p.z, vx: p.vx, vz: 0 });
    p.ballMotion = null;
    const input = { z: 1 },
      heading = p.locomotion.heading;
    const previousTouch = m.lastTouch?.time;
    if (order === "turn-first") step(m, 4, input);
    assert.ok(m.beginAction("shoot", input));
    step(m, 5, input);
    m.releaseAction(0.6);
    assert.equal(p.turnAction, null);
    assert.equal(p.ballAction.noTurn, true);
    assert.ok(p.ballAction.targetZ > 0);
    for (let i = 0; i < 240 && !m.lastShot; i++) {
      m.update(dt, input);
      assert.equal(p.turnAction, null);
      assert.ok(
        Math.abs(
          Math.atan2(
            Math.sin(p.locomotion.heading - heading),
            Math.cos(p.locomotion.heading - heading),
          ),
        ) < 0.18,
      );
      if (m.lastTouch?.time !== previousTouch)
        assert.notEqual(m.lastTouch?.kind, "cut");
    }
    assert.ok(m.lastShot, order);
    assert.ok(m.lastShot.target.z > 0);
    m.physics.dispose();
  }
});
test("180-degree reversal reaches the ball before braking into the cut", () => {
  const { m, p } = fixture();
  step(m, 180, { x: 1, sprint: true });
  Object.assign(m.ball, {
    owner: 0,
    x: p.x + 2.1,
    z: p.z,
    vx: p.vx * 0.65,
    vz: 0,
  });
  p.ballMotion = null;
  const initialSpeed = Math.hypot(p.vx, p.vz),
    startX = p.x;
  let approached = false,
    cut = false;
  for (let i = 0; i < 300 && !cut; i++) {
    m.update(dt, { x: -1, sprint: true });
    if (p.turnAction?.phase === "approach") {
      approached = true;
      assert.ok(
        p.vx > initialSpeed * 0.85,
        "keep advancing while the ball is out of reach",
      );
      assert.ok(p.locomotion.cutBlend < 0.08);
    }
    cut = p.lastDribble?.kind === "cut" && p.lastDribble.time > 1.5;
  }
  assert.ok(approached);
  assert.ok(p.x > startX + 0.5);
  assert.ok(cut, "the approach ends in an actual ball contact");
  m.physics.dispose();
});
test("all players default to right; footedness and turn/chest phases survive validated team packets", () => {
  const m = new Match();
  m.start();
  assert.ok(m.players.every((p) => p.footedness === "right"));
  for (const footedness of ["right", "left", "both"]) {
    const p = m.players[9];
    p.footedness = footedness;
    p.chestTrap = { hitAt: null, startedAt: 1 };
    p.turnAction = { phase: "plant", touchFoot: 0 };
    assert.ok(validPlayer(packPlayer(p), 0));
  }
  m.players[9].footedness = "invalid";
  assert.equal(validPlayer(packPlayer(m.players[9]), 0), false);
  m.physics.dispose();
});
test("stationary shots plant the opposite foot and strike with the preferred one", () => {
  for (const footedness of ["right", "left"]) {
    const { m, p } = fixture("match", footedness);
    m.beginAction("shoot", { x: 1 });
    m.releaseAction(0.7);
    let foot, plant;
    for (let i = 0; i < 180 && !m.lastShot; i++) {
      m.update(dt, {});
      if (p.ballMotion?.kind === "strike") {
        foot = p.ballMotion.foot;
        plant = p.strikePlant?.foot;
      }
    }
    assert.ok(m.lastShot);
    assert.equal(foot, footedness === "right" ? 0 : 1);
    assert.equal(plant, 1 - foot);
    m.physics.dispose();
  }
});
test("running 90 degree turn has two separate preferred-foot contacts before reaching the final heading", () => {
  const { m, p } = fixture();
  step(m, 240, { x: 1, sprint: true });
  Object.assign(m.ball, { x: p.x + 0.55, z: p.z, vx: p.vx, vz: p.vz });
  p.ballMotion = null;
  let old = m.lastTouch.time;
  const touches = [];
  for (let i = 0; i < 360 && touches.length < 2; i++) {
    m.update(dt, { z: 1, sprint: true });
    if (m.lastTouch.time !== old) {
      old = m.lastTouch.time;
      if (p.lastDribble?.kind === "cut")
        touches.push({
          angle: Math.atan2(p.lastDribble.vz, p.lastDribble.vx),
          foot: m.lastTouch.foot,
          time: old,
        });
    }
  }
  assert.equal(touches.length, 2);
  assert.ok(Math.abs(touches[0].angle - Math.PI / 4) < 0.03);
  assert.ok(Math.abs(touches[1].angle - Math.PI / 2) < 0.03);
  assert.ok(touches[1].time - touches[0].time > 0.1);
  assert.ok(touches.every((t) => t.foot === 0));
  m.physics.dispose();
});
test("reverse pivots mirror the dominant foot and wait for two short steps at speed", () => {
  for (const footedness of ["right", "left"]) {
    const { m, p } = fixture("match", footedness);
    p.vx = 7;
    p.lastDribble = {};
    p.locomotion.time = 1;
    Object.assign(m.ball, { vx: 7 });
    planTurn(p, m.ball, -7, 0);
    const a = p.turnAction;
    assert.equal(a.kind, "reverse");
    assert.equal(a.touchFoot, footedness === "right" ? 0 : 1);
    assert.equal(a.supportFoot, 1 - a.touchFoot);
    assert.equal(Math.sign(a.delta), footedness === "right" ? 1 : -1);
    a.phase = "settle";
    a.contactAt = 1;
    a.contactLandings = 0;
    p.locomotion.feet.forEach((f) => {
      f.landings = 0;
      f.contact = true;
    });
    planTurn(p, m.ball, -7, 0);
    assert.equal(a.phase, "settle");
    p.locomotion.feet[0].landings = 1;
    planTurn(p, m.ball, -7, 0);
    assert.equal(a.phase, "settle");
    p.locomotion.feet[1].landings = 1;
    planTurn(p, m.ball, -7, 0);
    assert.equal(a.phase, "pivot");
    m.physics.dispose();
  }
});
test("header loads the knees and arms before leaving the ground", () => {
  const { m, p } = fixture();
  Object.assign(m.ball, {
    owner: null,
    x: p.x,
    z: -5,
    y: 2,
    vx: 0,
    vz: 10,
    vy: 2.8,
  });
  m.beginAction("shoot", {});
  m.releaseAction(0.7);
  let loaded = false,
    air = false;
  for (let i = 0; i < 120; i++) {
    m.update(dt, {});
    if (p.header?.mode === "prepare" && p.header.crouch > 0.15) {
      loaded = true;
      assert.equal(p.header.height, 0);
      assert.ok(p.header.armDrive < -0.7);
      assert.ok(p.header.fold > 0.15);
    }
    if (p.header?.height > 0.1) {
      assert.ok(loaded);
      air = true;
    }
  }
  assert.ok(air);
  assert.equal(m.lastShot?.style, "header");
  m.physics.dispose();
});
test("high balls can be cushioned on the chest across football surfaces", () => {
  for (const variant of ["match", "street", "court", "sand", "duel"]) {
    const { m, p } = fixture(variant);
    Object.assign(m.ball, {
      owner: null,
      x: p.x + 2,
      z: 0,
      y: 1.85,
      vx: -5,
      vz: 0,
      vy: 0.2,
      lastTeam: 1,
    });
    let last = { ...m.ball };
    for (let i = 0; i < 150 && !m.lastReception; i++) {
      m.update(dt, {});
      assert.ok(
        Math.hypot(m.ball.x - last.x, m.ball.y - last.y, m.ball.z - last.z) <
          0.12,
      );
      last = { ...m.ball };
    }
    assert.equal(m.lastReception?.bodyPart, "chest", variant);
    assert.equal(m.ball.owner, p.id);
    assert.ok(m.ball.vy < 0);
    m.physics.dispose();
  }
});
test("arm amplitude grows with locomotion and a goal preserves the bicycle landing", () => {
  const { m, p } = fixture();
  const amplitudes = [];
  for (const speed of [0, 2, 8]) {
    p.vx = speed;
    for (let i = 0; i < 120; i++) stepBodyExpression(p, dt);
    amplitudes.push(p.locomotion.expression.armAmplitude);
  }
  assert.ok(amplitudes[2] > amplitudes[1] * 1.8);
  assert.equal(amplitudes[0], 0);
  p.bicycle = { time: 0.4, contactAt: 0.25, heading: Math.PI / 2 };
  m.lastGoalTeam = 0;
  celebrate(m, 0.1);
  assert.ok(p.bicycle);
  assert.equal(p.celebration, undefined);
  for (let i = 0; i < 200; i++) celebrate(m, dt);
  assert.equal(p.bicycle, null);
  assert.ok(p.celebration);
  m.physics.dispose();
});
test("distant off-ball movement follows travel direction", () => {
  for (const variant of ["match", "sand", "court", "street", "duel"]) {
    for (const sprint of [false, true]) {
      const { m, p } = fixture(variant);
      Object.assign(m.ball, { owner: null, x: p.x - 2, z: 3, lastTeam: 1 });
      step(m, sprint ? 90 : 180, { x: sprint ? 1 : 0.35, sprint });
      const target = Math.PI / 2;
      const error = Math.abs(
        Math.atan2(
          Math.sin(p.locomotion.heading - target),
          Math.cos(p.locomotion.heading - target),
        ),
      );
      assert.ok(error < 0.3, `${variant} sprint=${sprint} error=${error}`);
      assert.ok(p.vx > 0.5, `${variant}/${sprint}: ${p.vx}`);
      m.physics.dispose();
    }
  }
});

test("body faces the ball only for close marking, never at a distance", async () => {
  const { defensiveFacing } = await import("../src/defensive-facing.js");
  const { m, p } = fixture();
  const b = { x: p.x + 2, z: p.z };
  const options = { enabled: true, x: 1, z: 0 };
  assert.ok(Number.isFinite(defensiveFacing(p, b, dt, options)));
  p.locomotion.feet.forEach((f) => (f.landings += 8));
  assert.ok(
    Number.isFinite(defensiveFacing(p, b, dt, options)),
    "keeps marking while close",
  );
  b.x = p.x + 3.3;
  assert.ok(Number.isFinite(defensiveFacing(p, b, dt, options)), "hysteresis");
  b.x = p.x + 4;
  assert.equal(defensiveFacing(p, b, dt, options), undefined);
  assert.equal(
    defensiveFacing(p, b, dt, { enabled: true }),
    undefined,
    "standing far away does not turn body",
  );
  b.x = p.x + 2;
  assert.equal(
    defensiveFacing(p, b, dt, { ...options, sprint: true }),
    undefined,
  );
  defensiveFacing(p, b, dt, { enabled: false });
  assert.equal(p.locomotion.defensiveFacing, null);
  m.physics.dispose();
});
