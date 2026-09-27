import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { receptionOpportunity } from "../src/reception.js";
import { carrySteps } from "../src/walking-carry.js";
const dt = 1 / 120;
test("sprint requests six steps even before the player has accelerated", () => {
  assert.equal(
    carrySteps({
      sprintRequested: true,
      vx: 0,
      vz: 0,
      dribbleIntent: { x: 9, z: 0 },
    }),
    6,
  );
  assert.equal(
    carrySteps({ sprintRequested: false, dribbleIntent: { x: 6, z: 0 } }),
    4,
  );
});
function solo() {
  const m = new Match({ random: () => 0.5 });
  m.start();
  const p = m.players[9];
  p.id = 0;
  p.x = -25;
  m.players = [p];
  m.selected = 0;
  Object.assign(m.ball, { owner: 0, x: -24.2 });
  initLocomotion(p);
  return m;
}
function run(m, seconds, input) {
  let last = m.lastTouch?.time,
    touches = [],
    maxD = 0;
  for (let i = 0; i < seconds * 120; i++) {
    m.update(dt, typeof input === "function" ? input(i / 120) : input);
    const p = m.players[0];
    maxD = Math.max(maxD, Math.hypot(m.ball.x - p.x, m.ball.z - p.z));
    assert.ok(p.locomotion.height > 0.6 && p.locomotion.height < 1.5);
    if (m.lastTouch?.time !== last) {
      last = m.lastTouch?.time;
      if (m.lastTouch) touches.push({ ...m.lastTouch });
    }
  }
  return { touches, maxD };
}
test("unopposed dribble keeps control; sprint has larger travel and more steps between right-foot touches", () => {
  const metrics = [];
  for (const input of [{ x: 0.3 }, { x: 1 }, { x: 1, sprint: true }]) {
    const m = solo();
    const result = run(m, 6, input);
    assert.equal(m.ball.owner, 0);
    assert.ok(result.maxD < (input.sprint ? 4 : 2.1));
    const settled = result.touches.filter((t) => t.time > 2);
    const intervals = settled.slice(1).map((t, i) => t.time - settled[i].time);
    const steps =
      settled.reduce((n, t) => n + t.stepsSince, 0) / settled.length;
    assert.ok(
      settled.filter((t) => t.foot === 0).length / settled.length >=
        (input.x < 0.5 ? 0.35 : input.sprint ? 0.5 : 0.75),
      `preferred-foot share at ${JSON.stringify(input)}: ${settled.filter((t) => t.foot === 0).length}/${settled.length}`,
    );
    metrics.push({
      maxDistance: result.maxD,
      interval: intervals.reduce((a, b) => a + b, 0) / intervals.length,
      steps,
    });
    m.physics.dispose();
  }
  // Sprint opens enough space for six steps; normal and walking use shorter cycles.
  assert.ok(metrics[2].interval > metrics[0].interval + 0.15);
  assert.ok(metrics[2].steps > metrics[0].steps + 1);
  console.log("Dribble gait measurements", metrics);
});
test("right-angle and reverse cuts keep possession and use corrective contacts", () => {
  for (const next of [
    { z: 1, sprint: true },
    { x: -1, sprint: true },
  ]) {
    const m = solo();
    run(m, 2.5, { x: 1, sprint: true });
    const result = run(m, 4, next);
    assert.equal(m.ball.owner, 0);
    assert.ok(result.maxD < 4, JSON.stringify({ next, maxD: result.maxD }));
    assert.ok(result.touches.some((t) => t.kind === "cut"));
    const b = m.players[0].lastDribble;
    assert.ok(next.z ? b.vz > 1 : b.vx < -1);
    m.physics.dispose();
  }
});
test("an overhit dribble triggers a recovery run and touch, without pulling or abandoning the ball", () => {
  const m = solo(),
    p = m.players[0];
  Object.assign(m.ball, { x: p.x + 3, vx: 3 });
  const before = m.ball.x;
  m.update(dt, {});
  assert.equal(m.ball.owner, 0);
  assert.equal(p.dribbleState.mode, "recover");
  assert.ok(m.ball.x > before); // it still rolls away; no snap to the owner
  run(m, 4, {});
  assert.equal(m.ball.owner, 0);
  assert.ok(m.lastTouch);
  assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.12);
  assert.equal(m.ball.vx, 0);
  assert.equal(m.ball.vz, 0);
  m.physics.dispose();
});
test("stopping after a sprint collects and settles the ball", () => {
  const m = solo();
  run(m, 2.5, { x: 1, sprint: true });
  run(m, 4, {});
  assert.equal(m.ball.owner, 0);
  assert.equal(m.ball.vx, 0);
  assert.equal(m.ball.vz, 0);
  assert.ok(Math.hypot(m.players[0].vx, m.players[0].vz) < 0.1);
  m.physics.dispose();
});
test("reception sensing stays active during a previous reach cooldown and includes player motion", () => {
  const p = {
    id: 0,
    team: 0,
    x: 0,
    z: 0,
    vx: 4,
    vz: 0,
    reachCooldown: 0.3,
    kick: 0,
  };
  const b = { x: 3, z: 0, y: 0.11, vx: 0, vz: 0, vy: 0, owner: null, spin: 0 };
  assert.ok(receptionOpportunity(p, b));
});
test("a ball passing within foot reach provokes an actual attempt and reception", () => {
  for (const z of [0.7, 1.05]) {
    const m = solo(),
      p = m.players[0];
    m.random = () => 0;
    p.reachCooldown = 0.3;
    Object.assign(m.ball, { owner: null, x: p.x + 4, z, vx: -12 });
    let reaching = false;
    for (let i = 0; i < 150 && m.ball.owner === null; i++) {
      m.update(dt, {});
      reaching ||= p.locomotion.feet.some((f) => f.special === "reach");
    }
    assert.ok(reaching, `attempt at offset ${z}`);
    assert.equal(m.ball.owner, 0, `reception at offset ${z}`);
    m.physics.dispose();
  }
});
test("continuous attempts retry only after another physical step, not every frame", () => {
  const m = solo();
  let draws = 0;
  m.random = () => (++draws === 1 ? 0.99999 : 0);
  Object.assign(m.ball, { owner: null, x: m.players[0].x + 0.75 });
  run(m, 0.2, {});
  assert.equal(draws, 1);
  run(m, 1, {});
  assert.equal(m.ball.owner, 0);
  assert.equal(draws, 2);
  m.physics.dispose();
});
test("retaining a loose dribble does not make the ball immune to a rival foot", () => {
  const m = solo(),
    p = m.players[0];
  m.random = () => 0;
  const rival = {
    ...p,
    id: 1,
    team: 1,
    x: m.ball.x,
    z: 0,
    vx: 0,
    vz: 0,
    dx: -1,
    dz: 0,
    think: 99,
  };
  initLocomotion(rival);
  m.players.push(rival);
  for (let i = 0; i < 30 && m.ball.owner === 0; i++) m.update(dt, {});
  assert.equal(m.ball.owner, 1);
  m.physics.dispose();
});

function duel(side = "front") {
  const m = solo(),
    p = m.players[0];
  p.x = 0;
  p.z = 0;
  initLocomotion(p);
  const q = {
    ...p,
    id: 1,
    team: 1,
    x: side === "behind" ? -1 : side === "side" ? 0 : 1,
    z: side === "side" ? 1 : 0,
    dx: -1,
    think: 99,
  };
  initLocomotion(q);
  m.players.push(q);
  Object.assign(m.ball, { x: 0.6, z: 0, owner: 0 });
  m.random = () => 0;
  return m;
}
test("holding protect under pressure triggers free-side contacts and no rapid ownership ping-pong", () => {
  for (const side of ["behind", "side", "front"]) {
    const m = duel(side);
    let owner = 0,
      flips = [],
      shield = false;
    for (let i = 0; i < 360; i++) {
      m.update(dt, { jockey: true });
      shield ||= m.lastTouch?.kind === "shield";
      if (m.ball.owner !== owner) {
        flips.push(m.elapsed);
        owner = m.ball.owner;
      }
    }
    assert.ok(shield);
    assert.equal(m.ball.owner, 0);
    assert.ok(flips.length <= 1);
    const [p, q] = m.players,
      b = m.ball;
    assert.ok((b.x - p.x) * (p.x - q.x) + (b.z - p.z) * (p.z - q.z) > 0.15);
    m.physics.dispose();
  }
});
test("carrier can escape pressure with the ball into requested free space", () => {
  const m = duel();
  run(m, 4, { z: -1, sprint: true });
  assert.equal(m.ball.owner, 0);
  assert.ok(m.players[0].z < -8);
  assert.ok(
    Math.hypot(m.ball.x - m.players[0].x, m.ball.z - m.players[0].z) < 3,
  );
  m.physics.dispose();
});
test("a dispossessed player must recover before trying to receive again", () => {
  const m = duel();
  m.players[0].dispossessedUntil = 0.65;
  Object.assign(m.ball, { owner: null, x: 0.3, z: 0 });
  m.players[1].x = 20;
  initLocomotion(m.players[1]);
  for (let i = 0; i < 60; i++) {
    m.update(dt, {});
    assert.notEqual(m.ball.owner, 0);
  }
  for (let i = 0; i < 90 && m.ball.owner !== 0; i++) m.update(dt, {});
  assert.equal(m.ball.owner, 0);
  m.physics.dispose();
});

test("near-ball first touch follows diagonal input from rest and while walking", () => {
  for (const walking of [false, true]) {
    for (const sign of [-1, 1]) {
      const m = solo(),
        p = m.players[0];
      if (walking) run(m, 0.7, { x: 0.3 });
      // A reachable ball and a fresh change of direction, with old body momentum.
      Object.assign(m.ball, { x: p.x + 0.4, z: p.z, vx: 0, vz: 0, owner: 0 });
      p.ballMotion = null;
      const before = m.lastTouch?.time;
      for (let i = 0; i < 100; i++) {
        m.update(dt, { x: 0.25, z: sign * 0.25 });
        if (m.lastTouch && m.lastTouch.time !== before) break;
      }
      assert.notEqual(
        m.lastTouch?.time,
        before,
        "must initiate a physical touch",
      );
      const touch = p.lastDribble;
      assert.ok(touch.vx > 0 && touch.vz * sign > 0);
      assert.ok(
        Math.abs(touch.vz / touch.vx - sign) < 0.25,
        "ball follows 45 degree input",
      );
      m.physics.dispose();
    }
  }
});

test("sprint departure leans and accelerates progressively with a natural first contact", () => {
  const metrics = [];
  for (const sprint of [false, true]) {
    const m = solo(),
      p = m.players[0];
    let first = null;
    for (let i = 0; i < 120; i++) {
      m.update(dt, { x: 1, sprint });
      if (m.lastTouch && !first) first = { ...m.lastTouch };
      if (i === 17)
        metrics.push({
          speed: Math.hypot(p.vx, p.vz),
          lean: p.locomotion.leanX,
        });
    }
    assert.ok(first);
    metrics.at(-1).touchSpeed = first.speed;
    assert.ok(Math.hypot(p.vx, p.vz) < (sprint ? 9.775 : 6.67));
    run(m, 1, { x: 1, sprint });
    assert.equal(p.sprintLaunch, 0, "launch phase ends");
    m.physics.dispose();
  }
  assert.ok(metrics[1].speed > metrics[0].speed);
  assert.ok(metrics[1].lean > metrics[0].lean + 0.01);
  assert.ok(metrics.every((m) => m.touchSpeed > 0));
});

test("sharp cuts lower the centre of mass and rotate the body while redirecting the ball", () => {
  for (const direction of [
    { x: -1, z: 0 },
    { x: 0, z: 1 },
  ]) {
    const m = solo(),
      p = m.players[0];
    run(m, 2, { x: 1, sprint: true });
    const initialHeading = p.locomotion.heading;
    const oldTouch = m.lastTouch?.time;
    let rotated = false,
      touched = false,
      minHeight = Infinity,
      peakCut = 0;
    for (let i = 0; i < 480; i++) {
      m.update(dt, { ...direction, sprint: true });
      const l = p.locomotion;
      const yaw = Math.abs(
        Math.atan2(
          Math.sin(l.heading - initialHeading),
          Math.cos(l.heading - initialHeading),
        ),
      );
      if (yaw > 0.1) rotated = true;
      if (
        m.lastTouch?.time !== oldTouch &&
        p.lastDribble &&
        p.lastDribble.vx * direction.x + p.lastDribble.vz * direction.z > 0
      )
        touched = true;
      minHeight = Math.min(minHeight, l.height);
      peakCut = Math.max(peakCut, l.cutBlend || 0);
    }
    assert.ok(rotated, "body rotates during the cut");
    assert.ok(touched, "ball is redirected through contact");
    assert.ok(peakCut > 0.15);
    assert.ok(
      minHeight < 1.06,
      `cut lowers the 1.1m standing COM: ${minHeight}`,
    );
    assert.equal(m.ball.owner, 0);
    m.physics.dispose();
  }
});

test("body blocks an automatic challenge from diagonally behind but exposed balls remain contestable", async () => {
  const { canContestBall } = await import("../src/dribbling.js");
  const owner = { id: 9, x: 0, z: 0 };
  // Ray passes 0.45m from the carrier: previously outside the 0.38m mask.
  const challenger = { x: -0.3, z: 0.45 };
  assert.equal(
    canContestBall(challenger, owner, { x: 0.3, z: 0.45 }, 1),
    false,
  );
  assert.equal(
    canContestBall({ x: 0.7, z: 0.8 }, owner, { x: 0.7, z: 0.3 }, 1),
    true,
  );
  assert.equal(canContestBall(challenger, null, { x: 0.3, z: 0.45 }, 1), true);
});

test("forward pass escapes a marker on the back even with ball underneath the carrier", () => {
  for (const ballX of [-0.2, 0, 0.2])
    for (const side of [-0.4, 0, 0.4]) {
      const m = new Match({ random: () => 0 });
      m.start();
      for (const p of m.players) {
        p.x = p.team ? 40 : -40;
        p.z = -24 + (p.id % 11) * 4;
        p.keeper = true;
        p.think = 99;
        initLocomotion(p);
      }
      Object.assign(m.players[9], { x: 0, z: 0, keeper: false });
      Object.assign(m.players[20], { x: -0.6, z: side, keeper: false });
      Object.assign(m.players[10], { x: 12, z: 0 });
      for (const id of [9, 20, 10]) initLocomotion(m.players[id]);
      Object.assign(m.ball, { x: ballX, z: 0, owner: 9 });
      assert.equal(m.beginAction("pass", { x: 1, z: 0 }), true);
      for (let i = 0; i < 10; i++) m.update(dt, { x: 1, z: 0 });
      assert.equal(m.releaseAction(), true);
      for (let i = 0; i < 120 && !m.lastPass; i++) m.update(dt, { x: 1, z: 0 });
      assert.ok(m.lastPass, "pass must make contact");
      for (let i = 0; i < 36; i++) {
        m.update(dt, {});
        assert.notEqual(
          m.ball.owner,
          20,
          `rear marker cannot collect through passer: ${ballX}/${side}`,
        );
      }
      assert.ok(m.ball.x > 2, "verify forward travel, not only the kick event");
      m.physics.dispose();
    }
});

test("recent passer only screens a blocked path, not a defender in front", async () => {
  const { canContestBall } = await import("../src/dribbling.js");
  const m = new Match();
  m.start();
  Object.assign(m.players[9], { x: 0, z: 0 });
  m.lastKicker = 9;
  m.kickReleasedAt = m.elapsed;
  const b = { x: 0.2, z: 0 };
  assert.equal(
    canContestBall({ x: -0.6, z: 0 }, m.recentKickScreen(), b, m.elapsed),
    false,
  );
  assert.equal(
    canContestBall({ x: 0.7, z: 0 }, m.recentKickScreen(), b, m.elapsed),
    true,
  );
  m.elapsed += 0.36;
  assert.equal(m.recentKickScreen(), null);
  m.physics.dispose();
});

test("45, 90 and 180 degree sprint cuts redirect at contact while body retains momentum", () => {
  for (const degrees of [45, 90, 180]) {
    const m = solo(),
      p = m.players[0];
    run(m, 2, { x: 1, sprint: true });
    // Isolate a change with the ball in reach, rather than a long sprint push.
    Object.assign(m.ball, { x: p.x + 0.55, z: p.z, vx: p.vx, vz: p.vz });
    p.ballMotion = null;
    const angle = (degrees * Math.PI) / 180;
    const input = { x: Math.cos(angle), z: Math.sin(angle), sprint: true };
    const previousTouch = m.lastTouch.time;
    let contact = false;
    for (let i = 0; i < 120; i++) {
      const oldX = m.ball.x,
        oldZ = m.ball.z;
      m.update(dt, input);
      assert.ok(
        Math.hypot(m.ball.x - oldX, m.ball.z - oldZ) < 0.15,
        "no ball teleport",
      );
      if (m.lastTouch.time === previousTouch) continue;
      const touch = p.lastDribble;
      assert.equal(touch.kind, "cut");
      const speed = Math.hypot(touch.vx, touch.vz);
      const firstAngle = ((degrees === 90 ? 45 : degrees) * Math.PI) / 180;
      assert.ok(
        (touch.vx * Math.cos(firstAngle) + touch.vz * Math.sin(firstAngle)) /
          speed >
          0.999,
        `${degrees}: a running right-angle change begins with a 45-degree contact`,
      );
      assert.ok(p.vx > 2, `${degrees}: body retains forward momentum`);
      const x = p.x;
      m.update(dt, input);
      assert.ok(
        p.x > x,
        "body still advances after the ball changes direction",
      );
      contact = true;
      break;
    }
    assert.ok(contact, `${degrees}: reachable correction within one second`);
    run(m, 3, input);
    assert.equal(m.ball.owner, 0);
    m.physics.dispose();
  }
});

test("successive opposite cuts remain contact driven and recoverable", () => {
  const m = solo();
  run(m, 1, { x: 0.4 });
  for (const input of [{ z: 0.4 }, { z: -0.4 }, { x: -0.4 }, { x: 0.4 }]) {
    const result = run(m, 0.8, input);
    assert.ok(result.touches.length > 0);
    assert.ok(result.maxD < 1.5);
    assert.equal(m.ball.owner, 0);
  }
  m.physics.dispose();
});

test("the carry impulse predicts a real rolling encounter instead of a fixed launch multiplier", () => {
  for (const sprint of [false, true]) {
    const m = solo();
    run(m, 4.5, { x: 1, sprint });
    const p = m.players[0];
    assert.ok(p.lastDribble.walkingPlan);
    assert.equal(p.lastDribble.kind, "push");
    assert.equal(p.lastDribble.walkingPlan.steps, sprint ? 6 : 4);
    assert.ok(p.lastDribble.walkingPlan.period > 0.3);
    m.physics.dispose();
  }
});

test("changing straight carrying speed keeps the natural dominant-foot swing", () => {
  const m = solo(),
    p = m.players[0];
  for (const input of [
    { x: 0.35, jockey: true },
    { x: 1 },
    { x: 1, sprint: true },
  ]) {
    let touches = 0,
      last = m.lastTouch?.time;
    for (let i = 0; i < 360; i++) {
      m.update(dt, input);
      if (m.lastTouch?.time !== last) {
        last = m.lastTouch?.time;
        assert.equal(m.lastTouch.foot, 0);
        assert.ok(p.ballMotion?.naturalCarry);
        touches++;
      }
    }
    assert.ok(touches >= 2);
    assert.equal(m.ball.owner, 0);
  }
  m.physics.dispose();
});

test("direction changes keep steering the ball while the athlete recovers without countersteering", () => {
  for (const sprint of [false, true]) {
    const m = solo(),
      p = m.players[0];
    run(m, 1.5, { x: 1, sprint });
    for (const degrees of [135, -45, 180, 90]) {
      const angle = (degrees * Math.PI) / 180;
      const input = { x: Math.cos(angle), z: Math.sin(angle), sprint };
      const previous = m.lastTouch.time;
      let contacts = 0,
        last = previous;
      for (let i = 0; i < 600; i++) {
        m.update(dt, input);
        if (m.lastTouch.time !== last) {
          last = m.lastTouch.time;
          contacts++;
          const t = p.lastDribble;
          const intent = p.dribbleIntent;
          assert.ok(
            (t.vx * intent.x + t.vz * intent.z) /
              (Math.hypot(t.vx, t.vz) * Math.hypot(intent.x, intent.z)) >
              0.999,
          );
        }
        if (
          contacts >= 2 &&
          !["plant", "touch", "settle"].includes(p.turnAction?.phase) &&
          Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.2
        )
          break;
      }
      assert.ok(
        contacts >= 2,
        `regained contact after ${degrees} degrees, sprint=${sprint}`,
      );
      assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.2);
      assert.equal(m.ball.owner, 0);
    }
    m.physics.dispose();
  }
});

test("departures and pace transitions keep producing contacts, without overtaking and stalling", () => {
  for (const footedness of ["right", "left"])
    for (const offset of [0.25, 0.65, 1])
      for (const switchAt of [1, 1.6, 2])
        for (const mode of [
          "normal",
          "sprint",
          "walk-normal",
          "walk-sprint",
          "normal-sprint",
          "stop-go",
        ]) {
          const m = solo(),
            p = m.players[0];
          Object.assign(p, {
            x: -35,
            z: 0,
            dx: 1,
            dz: 0,
            vx: 0,
            vz: 0,
            footedness,
          });
          initLocomotion(p);
          Object.assign(m.ball, { x: p.x + offset, z: 0, vx: 0, vz: 0 });
          const context = JSON.stringify({
            footedness,
            offset,
            switchAt,
            mode,
          });
          try {
            const result = run(m, 6, (time) => {
              const walk = mode.startsWith("walk-") && time < switchAt;
              if (mode === "stop-go" && time >= switchAt && time < switchAt + 1)
                return {};
              return {
                x: walk ? 0.35 : 1,
                jockey: walk,
                sprint:
                  mode === "sprint" ||
                  ((mode === "walk-sprint" || mode === "normal-sprint") &&
                    time >= switchAt) ||
                  (mode === "stop-go" && time >= switchAt + 1),
              };
            });
            assert.equal(m.ball.owner, 0, context);
            assert.ok(p.vx > 5, `must resume forward movement: ${context}`);
            assert.ok(
              m.elapsed - (p.lastDribble?.time || 0) < 1.5,
              `must keep touching the ball: ${context}`,
            );
            assert.ok(
              result.maxD <
                (mode.includes("sprint") || mode === "stop-go" ? 4.25 : 3),
              `ball stays recoverable (${result.maxD} m): ${context}`,
            );
          } finally {
            m.physics.dispose();
          }
        }
});

test("first sprint contact launches farther than normal and reaches sprint speed", () => {
  const impulses = [];
  for (const sprint of [false, true]) {
    const m = solo(),
      p = m.players[0];
    try {
      while (!p.lastDribble && m.elapsed < 2) m.update(dt, { x: 1, sprint });
      assert.ok(p.lastDribble);
      assert.equal(p.lastDribble.walkingPlan.steps, sprint ? 6 : 4);
      impulses.push(Math.hypot(p.lastDribble.vx, p.lastDribble.vz));
      const result = run(m, 3.5, { x: 1, sprint });
      assert.ok(result.touches.length >= 2);
      assert.ok(p.vx > (sprint ? 8 : 5));
    } finally {
      m.physics.dispose();
    }
  }
  assert.ok(impulses[1] > impulses[0] + 1);
});

test("45 degree exits reunite the dominant foot and ball across both sides and stride phases", () => {
  for (const footedness of ["right", "left"])
    for (const sprint of [false, true])
      for (const sign of [-1, 1])
        for (const at of [0.9, 1.2, 1.8, 2.4, 3, 3.6, 4.2]) {
          const m = solo(),
            p = m.players[0];
          Object.assign(p, {
            x: -40,
            z: -sign * 15,
            dx: 1,
            dz: 0,
            vx: 0,
            vz: 0,
            footedness,
          });
          initLocomotion(p);
          Object.assign(m.ball, { x: -39.35, z: -sign * 15, vx: 0, vz: 0 });
          const context = JSON.stringify({ footedness, sprint, sign, at });
          try {
            run(m, at, { x: 1, sprint });
            const result = run(m, 5.5, {
              x: Math.SQRT1_2,
              z: sign * Math.SQRT1_2,
              sprint,
            });
            const cut = result.touches.find((t) => t.kind === "cut");
            assert.ok(cut, `cut contact: ${context}`);
            assert.ok(
              result.touches.filter((t) => t.time > cut.time).length >= 2,
              `resume repeated contacts: ${context}`,
            );
            assert.ok(result.maxD < 4.25, `recoverable lead: ${context}`);
            assert.ok(
              Math.hypot(p.vx, p.vz) > (sprint ? 6.5 : 5),
              `exit speed: ${context}`,
            );
            assert.ok(
              m.elapsed - p.lastDribble.time < 1.5,
              `recent contact: ${context}`,
            );
            const speed = Math.hypot(p.vx, p.vz);
            assert.ok(
              ((p.vx + sign * p.vz) * Math.SQRT1_2) / speed > 0.98,
              `body follows input: ${context}`,
            );
            assert.equal(m.ball.owner, 0, context);
          } finally {
            m.physics.dispose();
          }
        }
});

test("returning to an escaped ball turns the body instead of backing up under a stale turn plan", () => {
  for (const gap of [0.5, 1.5, 2.5])
    for (const pace of ["walk", "normal", "sprint"])
      for (const owned of [false, true]) {
        const m = solo(),
          p = m.players[0];
        Object.assign(p, { x: 0, z: 0, dx: 1, dz: 0, vx: 0, vz: 0 });
        initLocomotion(p);
        Object.assign(m.ball, { x: 0.65, z: 0, vx: 0, vz: 0 });
        try {
          run(m, 2, { x: 1 });
          Object.assign(m.ball, {
            x: p.x - gap,
            z: p.z,
            vx: 0,
            vz: 0,
            owner: owned ? 0 : null,
            lastTeam: 0,
          });
          let backwards = 0,
            longest = 0;
          const input = {
            x: pace === "walk" ? -0.35 : -1,
            jockey: pace === "walk",
            sprint: pace === "sprint",
          };
          for (let i = 0; i < 720; i++) {
            m.update(dt, input);
            const speed = Math.hypot(p.vx, p.vz);
            const facing =
              (Math.sin(p.locomotion.heading) * p.vx +
                Math.cos(p.locomotion.heading) * p.vz) /
              (speed || 1);
            backwards =
              i > 60 && speed > 0.5 && facing < -0.5 ? backwards + dt : 0;
            longest = Math.max(longest, backwards);
          }
          const context = JSON.stringify({ gap, pace, owned });
          assert.ok(longest < 0.4, `no prolonged backpedalling: ${context}`);
          assert.ok(
            m.elapsed - p.lastDribble.time < 1.5,
            `resumes real contacts: ${context}`,
          );
          assert.ok(p.vx < -0.5, `continues requested direction: ${context}`);
          assert.equal(m.ball.owner, 0, context);
        } finally {
          m.physics.dispose();
        }
      }
});
