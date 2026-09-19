import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { receptionOpportunity } from "../src/reception.js";
const dt = 1 / 120;
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
    assert.ok(result.maxD < (input.sprint ? 2.1 : 1.85));
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
  assert.ok(metrics[2].maxDistance > metrics[0].maxDistance + 0.45);
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
    assert.ok(result.maxD < 2.2);
    assert.ok(result.touches.some((t) => t.kind === "cut"));
    const b = m.ball;
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
test("pressure triggers free-side contacts and no rapid ownership ping-pong", () => {
  for (const side of ["behind", "side", "front"]) {
    const m = duel(side);
    let owner = 0,
      flips = [],
      shield = false;
    for (let i = 0; i < 360; i++) {
      m.update(dt, {});
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
  run(m, 3, { z: -1, sprint: true });
  assert.equal(m.ball.owner, 0);
  assert.ok(m.players[0].z < -8);
  assert.ok(
    Math.hypot(m.ball.x - m.players[0].x, m.ball.z - m.players[0].z) < 2,
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
        Math.abs(touch.vz / touch.vx - sign) < 0.02,
        "ball follows 45 degree input",
      );
      m.physics.dispose();
    }
  }
});

test("sprint departure leans, accelerates progressively and pushes farther than walking", () => {
  const metrics = [];
  for (const sprint of [false, true]) {
    const m = solo(),
      p = m.players[0];
    let first = null;
    for (let i = 0; i < 60; i++) {
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
  assert.ok(metrics[1].touchSpeed > metrics[0].touchSpeed);
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
    for (let i = 0; i < 180; i++) {
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
      assert.ok(
        (touch.vx * input.x + touch.vz * input.z) / speed > 0.999,
        `${degrees}: first contact follows input`,
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

test("first sprint touch travels three times the same-stick normal departure", () => {
  const travel = [];
  for (const sprint of [false, true]) {
    const m = solo();
    for (let i = 0; i < 90 && !m.lastTouch; i++) m.update(dt, { x: 1, sprint });
    assert.ok(m.lastTouch);
    const p = m.players[0],
      lead = p.lastDribble.lead;
    const x = m.ball.x,
      z = m.ball.z;
    p.x = -40;
    p.z = 20;
    m.ball.owner = null;
    for (let i = 0; i < 300 && Math.hypot(m.ball.vx, m.ball.vz) > 0.01; i++)
      m.physics.step(m, dt);
    travel.push({ lead, distance: Math.hypot(m.ball.x - x, m.ball.z - z) });
    m.physics.dispose();
  }
  assert.ok(Math.abs(travel[1].lead / travel[0].lead - 3) < 1e-8);
  assert.ok(
    Math.abs(travel[1].distance / travel[0].distance - 3) < 0.12,
    JSON.stringify(travel),
  );
  console.log("First touch free-roll distances", travel);
});

test("standing sprint departure uses a long first touch in every direction", () => {
  for (const previousTouch of [false, true]) {
    for (const degrees of [0, 45, -45, 90, -90, 135, -135, 180]) {
      const m = solo();
      if (previousTouch) m.players[0].lastDribble = { vx: 3, vz: 0, time: -2, interval: 0.4, landings: 0 };
      const angle = degrees * Math.PI / 180;
      const input = { x: Math.cos(angle), z: Math.sin(angle), sprint: true };
      for (let i = 0; i < 180 && !m.lastTouch; i++) m.update(dt, input);
      const touch = m.players[0].lastDribble;
      assert.ok(touch, `contact at ${degrees} degrees`);
      assert.equal(touch.kind, "launch", `departure at ${degrees} degrees`);
      assert.ok(touch.lead > 3, `long touch at ${degrees} degrees`);
      const alignment = (touch.vx * input.x + touch.vz * input.z) / Math.hypot(touch.vx, touch.vz);
      assert.ok(alignment > 0.999, `requested direction at ${degrees} degrees`);
      assert.equal(m.players[0].sprintFirstTouch, false);
      m.physics.dispose();
    }
  }
});

test("switching from walking or jogging to sprint launches in any direction and recovers", () => {
  for (const pace of [0.3, 1]) {
    for (const degrees of [0, 45, -45, 90, -90, 135, 180]) {
      const m = solo(), p = m.players[0];
      run(m, 1.5, { x: pace });
      assert.ok(Math.hypot(p.vx, p.vz) > 1.2);
      const previous = m.lastTouch.time;
      const angle = degrees * Math.PI / 180;
      const input = { x: Math.cos(angle), z: Math.sin(angle), sprint: true };
      let first;
      for (let i = 0; i < 240; i++) {
        m.update(dt, input);
        if (m.lastTouch.time !== previous) { first = p.lastDribble; break; }
      }
      assert.equal(first?.kind, "launch", `${pace}/${degrees}`);
      assert.ok(first.lead > 3);
      assert.ok((first.vx * input.x + first.vz * input.z) / Math.hypot(first.vx, first.vz) > 0.999);
      assert.equal(p.sprintLaunch, 0, "no extra acceleration boost when already moving");
      let recovered = false;
      for (let i = 0; i < 600; i++) {
        m.update(dt, input);
        if (p.lastDribble.time > first.time && Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.35) {
          recovered = true;
          break;
        }
      }
      assert.ok(recovered, `automatic pursuit reaches next contact: ${pace}/${degrees}`);
      assert.equal(m.ball.owner, 0);
      m.physics.dispose();
    }
  }
});

test("direction changes keep steering the ball while the athlete recovers without countersteering", () => {
  for (const sprint of [false, true]) {
    const m = solo(), p = m.players[0];
    run(m, 1.5, { x: 1, sprint });
    for (const degrees of [135, -45, 180, 90]) {
      const angle = degrees * Math.PI / 180;
      const input = { x: Math.cos(angle), z: Math.sin(angle), sprint };
      const previous = m.lastTouch.time;
      let contacts = 0, last = previous;
      for (let i = 0; i < 600; i++) {
        m.update(dt, input);
        if (m.lastTouch.time !== last) {
          last = m.lastTouch.time;
          contacts++;
          const t = p.lastDribble;
          assert.ok((t.vx * input.x + t.vz * input.z) / Math.hypot(t.vx, t.vz) > 0.999);
        }
        if (contacts >= 2 && Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.2) break;
      }
      assert.ok(contacts >= 2, `regained contact after ${degrees} degrees, sprint=${sprint}`);
      assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.2);
      assert.equal(m.ball.owner, 0);
    }
    m.physics.dispose();
  }
});
