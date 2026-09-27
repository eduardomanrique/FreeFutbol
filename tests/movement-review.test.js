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

test("normal right cut plants left of the COM and strikes during the descending right step", () => {
  const { m, p } = fixture();
  step(m, 144, { x: 0.35, jockey: false });
  let anchor = null,
    folded = false,
    contact = false,
    diagonalSamples = 0;
  for (let i = 0; i < 240; i++) {
    m.update(dt, {
      x: 0.35 * Math.SQRT1_2,
      z: 0.35 * Math.SQRT1_2,
      jockey: false,
    });
    const a = p.turnAction,
      motion = p.ballMotion;
    if (!a?.strideTouch) continue;
    const left = p.locomotion.feet[1],
      right = p.locomotion.feet[0];
    if (left.special === "turn-support" && left.contact) {
      if (!anchor) {
        anchor = { x: left.x, z: left.z };
        const lateral =
          (left.x - p.x) * Math.cos(a.origin) -
          (left.z - p.z) * Math.sin(a.origin);
        assert.ok(lateral > 0.2, `left support offset ${lateral}`);
      }
      assert.ok(Math.hypot(left.x - anchor.x, left.z - anchor.z) < 1e-8);
    }
    if (motion?.strideTouch && right.y > 0.32 && !motion.hit) {
      folded = true;
      const ballSide =
        (m.ball.x - p.x) * Math.cos(a.origin) -
        (m.ball.z - p.z) * Math.sin(a.origin);
      assert.ok(
        ballSide < -0.08,
        `ball must already be to the right: ${ballSide}`,
      );
    }
    if (motion?.strideTouch && right.phase > 0.32 && right.phase < 0.6) {
      const dx = right.x - right.previous.x,
        dz = right.z - right.previous.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        assert.ok(
          (dx * Math.sin(a.exitHeading) + dz * Math.cos(a.exitHeading)) / d >
            0.995,
          "the extending foot must already travel along the exit diagonal before contact",
        );
        diagonalSamples++;
      }
    }
    if (motion?.strideTouch && motion.hit) {
      assert.equal(motion.foot, 0);
      assert.ok(right.phase >= 0.6);
      assert.ok(right.y < 0.2);
      contact = true;
      break;
    }
  }
  assert.ok(
    anchor && folded && contact && diagonalSamples > 2,
    JSON.stringify({ anchor, folded, contact }),
  );
  assert.equal(m.ball.owner, 0);
  m.physics.dispose();
});

test("stride cut is reserved for normal movement, excluding LT and RT", () => {
  for (const mode of ["normal", "LT", "RT"]) {
    const { m, p } = fixture();
    Object.assign(p, {
      vx: 2,
      vz: 0,
      lastDribble: { vx: 2, vz: 0 },
      walkRequested: mode === "LT",
      jockey: mode === "LT",
      sprintRequested: mode === "RT",
    });
    Object.assign(m.ball, { vx: 2, vz: 0 });
    p.locomotion.time = 0.1;
    planTurn(p, m.ball, 2, 2);
    assert.equal(p.turnAction.strideTouch, mode === "normal");
    m.physics.dispose();
  }
});

test("LT walking touches only with the dominant foot after two steps", () => {
  for (const footedness of ["right", "left"]) {
    const { m, p } = fixture("match", footedness);
    let previous = null,
      touches = 0;
    for (let i = 0; i < 600; i++) {
      m.update(dt, { x: 0.35, jockey: true });
      if (m.lastTouch && m.lastTouch.time !== previous) {
        previous = m.lastTouch.time;
        assert.equal(m.lastTouch.foot, footedness === "right" ? 0 : 1);
        if (touches)
          assert.ok(
            m.lastTouch.stepsSince >= 2,
            `steps since touch: ${m.lastTouch.stepsSince}`,
          );
        touches++;
      }
    }
    assert.ok(touches >= 3, `${footedness}: ${touches} touches`);
    assert.equal(m.ball.owner, 0);
    m.physics.dispose();
  }
});

test("walking contacts keep ordinary stride reach and plan the next rolling encounter", () => {
  const { m, p } = fixture();
  let naturalFrames = 0,
    plans = 0,
    lastTime = null,
    maxGap = 0;
  for (let i = 0; i < 720; i++) {
    m.update(dt, { x: 0.35, jockey: true });
    if (p.ballMotion?.naturalCarry) {
      naturalFrames++;
      const f = p.locomotion.feet[p.ballMotion.foot];
      assert.ok(
        (f.x - p.x) * Math.sin(p.locomotion.heading) +
          (f.z - p.z) * Math.cos(p.locomotion.heading) <
          0.35,
        "walking must not extend forward to reach a distant ball",
      );
    }
    if (p.lastDribble?.walkingPlan && p.lastDribble.time !== lastTime) {
      if (lastTime != null)
        maxGap = Math.max(maxGap, p.lastDribble.time - lastTime);
      lastTime = p.lastDribble.time;
      plans++;
    }
  }
  assert.ok(
    naturalFrames > 30 && plans >= 5,
    JSON.stringify({ naturalFrames, plans }),
  );
  assert.ok(maxGap < 1.2, `lost gait rhythm: ${maxGap}`);
  assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 0.9);
  m.physics.dispose();
});

test("natural carrying uses the dominant stride every 2, 4 and 6 steps", () => {
  for (const footedness of ["right", "left"]) {
    for (const [input, expected] of [
      [{ x: 0.35, jockey: true }, 2],
      [{ x: 1 }, 4],
      [{ x: 1, sprint: true }, 6],
    ]) {
      const { m, p } = fixture("match", footedness);
      p.x = -40;
      m.ball.x = -39.4;
      initLocomotion(p);
      let last = null,
        contacts = 0;
      for (let i = 0; i < 900; i++) {
        m.update(dt, input);
        if (p.ballMotion?.naturalCarry) {
          assert.equal(
            p.locomotion.feet[p.ballMotion.foot].special ?? null,
            null,
            "a touch must not change the gait's physical swing or support",
          );
        }
        if (i > 600 && m.lastTouch?.time !== last) {
          if (last != null) {
            assert.equal(m.lastTouch.foot, footedness === "right" ? 0 : 1);
            assert.equal(m.lastTouch.stepsSince, expected);
            assert.ok(p.lastDribble.walkingPlan);
            contacts++;
          }
          last = m.lastTouch?.time;
        }
      }
      assert.ok(contacts >= 2, `${footedness}/${expected}: ${contacts}`);
      assert.equal(m.ball.owner, 0);
      m.physics.dispose();
    }
  }
});

test("walking 180 stops under the dominant sole, rolls back, then plants right-left before carrying", () => {
  const { m, p } = fixture();
  step(m, 144, { x: 0.3, jockey: true });
  let stopped = null,
    pulled = false,
    resumed = false,
    last = null;
  let landings = p.locomotion.feet.map((f) => f.landings);
  const order = [];
  for (let i = 0; i < 480; i++) {
    m.update(dt, { x: -0.35, jockey: true });
    if (p.lastDribble?.kind === "sole-stop" && !stopped) {
      assert.ok(
        p.turnAction.delta < 0,
        "right-foot sole turn rotates toward the player’s right",
      );
      stopped = { x: m.ball.x, z: m.ball.z, time: p.lastDribble.time };
      landings = p.locomotion.feet.map((f) => f.landings);
      assert.ok(Math.hypot(m.ball.vx, m.ball.vz) < 0.01);
    }
    if (stopped && p.turnAction?.soleRoll) {
      pulled ||= m.ball.x < stopped.x - 0.4;
      p.locomotion.feet.forEach((f, index) => {
        if (f.landings > landings[index]) order.push(index);
      });
      landings = p.locomotion.feet.map((f) => f.landings);
    }
    if (stopped && !p.turnAction && m.lastTouch?.time > stopped.time) {
      assert.equal(m.lastTouch.foot, 0);
      assert.ok(p.ballMotion?.naturalCarry);
      assert.ok(Math.cos(p.locomotion.heading - Math.PI * 1.5) > 0.9);
      resumed = true;
      break;
    }
  }
  assert.ok(stopped && pulled && resumed);
  assert.deepEqual(order.slice(0, 2), [0, 1]);
  assert.equal(m.ball.owner, 0);
  m.physics.dispose();
});

test("defensive posture requires an opponent ahead toward the protected goal; volley uses team possession", async () => {
  const { defensivePosture } = await import("../src/defensive-posture.js");
  const p = {
    id: 0,
    team: 0,
    x: -10,
    z: 0,
    locomotion: { heading: Math.PI / 2 },
  };
  const q = { id: 1, team: 1, x: -7, z: 0 };
  const m = { field: { halfLength: 46 }, ball: { owner: 1 }, players: [p, q] };
  const before = structuredClone(p);
  assert.equal(defensivePosture(p, m), 1);
  assert.deepEqual(p, before, "pose selection never changes movement state");
  q.x = -17;
  assert.equal(defensivePosture(p, m), 0, "opponent behind");
  q.x = -2;
  assert.equal(defensivePosture(p, m), 0, "opponent distant");
  q.x = -7;
  q.team = 0;
  assert.equal(defensivePosture(p, m), 0, "own team has possession");
  m.field.footvolley = true;
  m.footvolley = { phase: "serve", serving: 1, lastTeam: null };
  m.ball.owner = null;
  assert.equal(defensivePosture(p, m), 1, "ready before opponent serves");
  m.footvolley = { phase: "rally", lastTeam: 1 };
  assert.equal(
    defensivePosture(p, m),
    1,
    "receiving team stays ready anywhere",
  );
  m.footvolley.lastTeam = 0;
  assert.equal(defensivePosture(p, m), 0);
  m.footvolley.lastTeam = 1;
  p.altinhaPose = { kind: "head" };
  assert.equal(
    defensivePosture(p, m),
    0,
    "preserve the reception/jump gesture",
  );
});
