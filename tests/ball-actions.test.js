import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion, startBallMotion } from "../src/locomotion.js";
import {
  passTrajectory,
  shotPrecision,
  strikeStyle,
} from "../src/ball-actions.js";
import { FootballPhysics } from "../src/physics-world.js";
const dt = 1 / 120;
function setup() {
  const m = new Match({ random: () => 0.5 });
  m.start();
  m.players.forEach((p) => {
    if (p.id !== 9) {
      p.x = -35;
      p.z = -25 + p.id * 0.6;
      p.think = 99;
    }
  });
  return m;
}
function contact(m) {
  for (let i = 0; i < 240 && !m.lastShot && !m.lastPass; i++) m.update(dt, {});
  assert.ok(
    m.lastShot || m.lastPass,
    "queued action must reach a real foot contact",
  );
}
test("press holds possession; release waits for a free foot and physical contact", () => {
  const m = setup(),
    p = m.players[9];
  m.beginAction("shoot", {});
  for (let i = 0; i < 60; i++) m.update(dt, {});
  assert.equal(m.ball.owner, 9);
  assert.equal(m.lastShot, null);
  p.ballMotion = null;
  // Just-planted right foot must stay planted; left foot is ready to swing.
  p.locomotion.feet.forEach((f, i) => {
    f.contact = true;
    f.special = null;
    f.age = i === 1 ? 0 : 0.15;
  });
  p.strikePlant = null; // Fixture replaces the prepared stance above.
  m.releaseAction(1);
  assert.equal(m.ball.owner, 9);
  assert.equal(m.lastShot, null);
  contact(m);
  assert.equal(m.lastShot.foot, 0);
  assert.ok(m.lastShot.delay > 0.08);
  assert.equal(m.ball.owner, null);
  assert.equal(m.lastShot.speed, 50);
  assert.equal(m.lastShot.band, "mishit");
  m.physics.dispose();
});
test("aim changes do not redirect locomotion while charging; backward aim produces heel pass", () => {
  const m = setup(),
    p = m.players[9];
  for (let i = 0; i < 80; i++) m.update(dt, { x: 1 });
  m.beginAction("pass", { x: 1 });
  for (let i = 0; i < 30; i++) m.update(dt, { x: -1 });
  assert.ok(p.vx > 0);
  assert.ok(p.dx > 0.9);
  assert.equal(p.ballAction.aim.x, -1);
  m.releaseAction(0.3);
  assert.equal(p.ballAction.style.name, "backheel");
  contact(m);
  assert.equal(m.lastPass.style, "backheel");
  assert.ok(m.ball.vx < 0);
  m.physics.dispose();
});
test("free ball preserves inertia during a direction change, touches are discrete and a loose dribble invites recovery", () => {
  const m = setup();
  let touches = 0,
    freeFrames = 0,
    lastTime = -1,
    lead = [];
  for (let i = 0; i < 260; i++) {
    const before = m.ball.vx,
      previousTouch = m.lastTouch?.time;
    m.update(dt, { x: 1, sprint: true });
    if (m.lastTouch && m.lastTouch.time !== lastTime) {
      touches++;
      lastTime = m.lastTouch.time;
    }
    if (i > 30 && previousTouch === m.lastTouch?.time) {
      freeFrames++;
      assert.ok(
        m.ball.vx <= before + 0.04,
        "no follower acceleration between touches",
      );
    }
    lead.push(m.ball.x - m.players[9].x);
  }
  assert.ok(touches >= 3 && touches < 30, `discrete contacts: ${touches}`);
  assert.ok(freeFrames > 150);
  assert.ok(Math.max(...lead) - Math.min(...lead) > 0.25);
  const before = m.ball.vx;
  m.update(dt, { x: -1 });
  assert.ok(m.ball.vx > before - 0.2);
  m.ball.x = m.players[9].x + 3;
  m.update(dt, {});
  assert.equal(m.ball.owner, 9);
  assert.equal(m.players[9].dribbleState.mode, "recover");
  m.physics.dispose();
});
test("weak and strong ground passes reach near and far target distances under actual Rapier drag", () => {
  for (const distance of [5, 15, 30])
    for (const power of [0, 1]) {
      const { speed, lift } = passTrajectory(distance, power);
      const physics = new FootballPhysics(),
        m = {
          players: [],
          ball: {
            x: 0,
            z: 0,
            y: 0.11,
            vx: speed,
            vy: lift,
            vz: 0,
            spin: 0,
            owner: null,
          },
        };
      for (let i = 0; i < 1200 && m.ball.x < distance && m.ball.vx > 0; i++)
        physics.step(m, dt);
      assert.ok(
        m.ball.x >= distance,
        `${distance}m power${power} stopped at ${m.ball.x}`,
      );
      assert.ok(m.ball.vx > 1);
      physics.dispose();
    }
});
test("lofted pass trajectory is scaled to receiver distance even at minimum charge", () => {
  for (const distance of [2, 5, 15, 30])
    for (const power of [0, 1]) {
      const { speed, lift } = passTrajectory(distance, power, true);
      const physics = new FootballPhysics(),
        m = {
          players: [],
          ball: {
            x: 0,
            z: 0,
            y: 0.11,
            vx: speed,
            vy: lift,
            vz: 0,
            spin: 0,
            owner: null,
          },
        };
      let apex = 0;
      for (let i = 0; i < 1200; i++) {
        const vy = m.ball.vy;
        physics.step(m, dt);
        apex = Math.max(apex, m.ball.y);
        if (i > 30 && vy < 0 && m.ball.vy >= 0) break;
      }
      assert.ok(apex > 2.2, `lob clears athlete height: ${apex}`);
      assert.ok(
        Math.abs(m.ball.x - distance) < 2,
        `${distance}m lob landed ${m.ball.x}`,
      );
      physics.dispose();
    }
});
test("shot precision decreases with distance and power, extreme angles have committed recovery", () => {
  assert.ok(shotPrecision(0.2, 15).index > shotPrecision(0.9, 15).index);
  assert.ok(shotPrecision(0.5, 15).index > shotPrecision(0.5, 35).index);
  const side = strikeStyle(Math.PI / 2, 0, 1, 1, 7, "shoot");
  assert.equal(side.fall, true);
  const heel = strikeStyle(Math.PI / 2, -1, 0, 1, 7, "shoot");
  assert.equal(heel.name, "backheel");
  assert.equal(heel.fall, false);
  const m = setup();
  m.players[9].dx = 0;
  m.players[9].dz = 1;
  initLocomotion(m.players[9]);
  m.beginAction("shoot", {});
  m.aimAction({ z: 1 });
  m.releaseAction(1);
  contact(m);
  assert.ok(m.players[9].recovery > 0.9);
  assert.equal(m.lastShot.style, "turning");
  m.physics.dispose();
});
test("cancel or losing the ball cancels a queued shot without a delayed kick", () => {
  for (const cancel of ["pause", "loss"]) {
    const m = setup();
    m.shoot(0.8);
    if (cancel === "pause") m.cancelAction();
    else m.ball.x = 5;
    for (let i = 0; i < 100; i++) m.update(dt, {});
    assert.equal(m.lastShot, null);
    assert.equal(m.charging, false);
    m.physics.dispose();
  }
});

test("a queued stationary shot takes a placement step to a ball that rolled ahead", () => {
  const m = setup();
  m.ball.x = m.players[9].x + 1.65;
  m.shoot(0.5);
  contact(m);
  assert.ok(m.players[9].x > -0.75);
  assert.equal(m.lastShot.power, 0.5);
  m.physics.dispose();
});

test("shots always target opponent goal, including backheel shots for either team", () => {
  for (const team of [0, 1]) {
    const m = setup(),
      p = m.players[9],
      dir = team === 0 ? 1 : -1;
    p.team = team;
    p.x = dir * 20;
    p.z = 0;
    p.dx = -dir;
    p.dz = 0;
    initLocomotion(p);
    Object.assign(m.ball, { x: p.x + dir * 0.65, z: 0, lastTeam: team });
    m.beginAction("shoot", {});
    m.aimAction({ x: -dir, z: 0 });
    m.releaseAction(0.6);
    assert.equal(p.ballAction.style.name, "backheel");
    assert.equal(m.lastShot, null);
    contact(m);
    assert.equal(m.lastShot.target.x, dir * 46);
    assert.equal(m.lastShot.target.z, 0);
    assert.ok(m.ball.vx * dir > 0);
    assert.equal(m.lastShot.style, "backheel");
    m.physics.dispose();
  }
});
test("shot north-south axis alone sets target; east-west and facing cannot redirect it", () => {
  const m = setup(),
    p = m.players[9];
  m.beginAction("shoot", {});
  for (const z of [-1, -0.5, 0, 0.5, 1]) {
    m.aimAction({ x: -1, z });
    const left = { ...p.ballAction.aim },
      target = p.ballAction.targetZ;
    m.aimAction({ x: 1, z });
    assert.deepEqual(p.ballAction.aim, left);
    assert.equal(target, z * 3.2);
  }
  m.aimAction({});
  assert.equal(p.ballAction.targetZ, 0);
  m.physics.dispose();
});

test("moving passes and shots plant beside the ball before the opposite foot strikes", () => {
  for (const type of ["pass", "lob", "shoot"])
    for (const sprint of [false, true]) {
      const m = setup(),
        p = m.players[9];
      for (let i = 0; i < 60; i++) m.update(dt, { x: 1, sprint });
      m.beginAction(type, { x: 1, sprint });
      let sawSwing = false,
        sawSupport = false,
        hit = false;
      for (let i = 0; i < 24; i++) {
        m.update(dt, { x: 1, sprint });
        const plant = p.strikePlant;
        if (plant) {
          const support = p.locomotion.feet[plant.foot];
          sawSwing ||= !support.contact || plant.reused;
          sawSupport ||= support.contact;
        }
      }
      m.releaseAction(0.45);
      assert.equal(p.ballAction.requiresPlant, true);
      for (let i = 0; i < 360; i++) {
        m.update(dt, {});
        const plant = p.strikePlant;
        if (plant) {
          const support = p.locomotion.feet[plant.foot];
          if (!support.contact || plant.reused) sawSwing = true;
          if (support.contact) sawSupport = true;
          if (p.ballMotion?.kind === "strike") {
            assert.ok(support.contact);
            assert.notEqual(p.ballMotion.foot, plant.foot);
          }
        }
        if (m.lastPass || m.lastShot) {
          assert.ok(plant);
          const f = p.locomotion.feet[plant.foot];
          assert.ok(Math.hypot(f.x - m.ball.x, f.z - m.ball.z) < 0.8);
          hit = true;
          break;
        }
      }
      assert.ok(
        sawSwing && sawSupport && hit,
        `${type}: support step then contact`,
      );
      m.physics.dispose();
    }
});

test("standing strike reuses a valid support but adjusts a misplaced one", () => {
  for (const ready of [true, false]) {
    const m = setup(),
      p = m.players[9];
    p.ballAction = { requiresPlant: true, style: { name: "normal" } };
    const [strike, support] = p.locomotion.feet;
    for (const f of [strike, support]) {
      f.contact = true;
      f.special = null;
      f.age = 0.2;
    }
    const target = { x: p.x + 0.4, z: p.z };
    support.x = ready ? target.x : p.x - 1;
    support.z = target.z + 0.28;
    strike.x = p.x - 1;
    strike.z = p.z - 0.2;
    const started = startBallMotion(p, target, "strike", 0.5);
    assert.equal(started, ready);
    assert.equal(!!p.strikePlant.reused, ready);
    assert.equal(support.contact, ready);
    assert.equal(p.ballMotion?.foot, ready ? 0 : undefined);
    m.physics.dispose();
  }
});

test("charge plants support and winds up the opposite foot; overholding auto-kicks once", () => {
  for (const type of ["pass", "lob"]) {
    const m = setup(),
      p = m.players[9];
    m.beginAction(type, {});
    let prepared = false;
    for (let i = 0; i < 110; i++) {
      m.update(dt, {});
      if (p.strikePlant) {
        const support = p.locomotion.feet[p.strikePlant.foot];
        const other = p.locomotion.feet[1 - p.strikePlant.foot];
        if (other.special === "windup") {
          assert.ok(support.contact);
          prepared = true;
        }
      }
    }
    assert.ok(prepared);
    assert.equal(m.lastShot || m.lastPass, null);
    for (let i = 0; i < 220 && !m.lastShot && !m.lastPass; i++)
      m.update(dt, {});
    const result = m.lastShot || m.lastPass;
    assert.ok(result?.overcharged);
    assert.equal(result.speed, type === "shoot" ? 27 : 45);
    assert.equal(result.lift, type === "shoot" ? 7.199999999999999 : 12);
    assert.equal(m.releaseAction(), false);
    m.physics.dispose();
  }
});

test("weak stationary tap skips planting and uses a short contact gesture", () => {
  const m = setup(),
    p = m.players[9];
  m.beginAction("pass", {});
  m.update(dt, {});
  m.releaseAction(0.1);
  assert.equal(p.ballAction.quickTouch, true);
  assert.equal(p.ballAction.requiresPlant, false);
  contact(m);
  assert.ok(m.lastPass.delay < 0.3);
  m.physics.dispose();
});

test("charge reaches long-shot window near 315ms; held running shot keeps dribbling", () => {
  const m = setup(),
    p = m.players[9];
  p.vx = 5;
  p.vz = 0;
  Object.assign(m.ball, { x: p.x + 0.65, z: p.z, vx: 5, vz: 0 });
  m.beginAction("shoot", { x: 1, sprint: true });
  let previous = m.ball.vx;
  for (let i = 0; i < 38; i++) {
    const previousTouch = m.lastTouch?.time;
    m.update(dt, { x: 1, sprint: true });
    if (previousTouch === m.lastTouch?.time)
      assert.ok(
        m.ball.vx <= previous + 0.02 && m.ball.vx >= previous - 0.15,
        "only natural rolling deceleration before kick",
      );
    assert.ok(p.moveIntent.x >= -1e-6, "no backward recovery command");
    previous = m.ball.vx;
  }
  assert.ok(m.charge >= 0.85 && m.charge <= 0.9);
  assert.equal(m.lastShot, null);
  m.releaseAction(0.8);
  contact(m);
  assert.ok(m.lastShot);
  m.physics.dispose();
});

test("shot strength and precision depend on facing, with 40% front and 85% back reductions", () => {
  const shots = [];
  for (const heading of [Math.PI / 2, 0, -Math.PI / 2]) {
    const m = setup(),
      p = m.players[9];
    p.dx = Math.sin(heading);
    p.dz = Math.cos(heading);
    initLocomotion(p);
    m.shoot(0.8);
    contact(m);
    shots.push(m.lastShot);
    m.physics.dispose();
  }
  assert.equal(shots[0].speed, (9 + 0.8 ** 0.75 * 36) * 0.6);
  assert.ok(Math.abs(shots[2].speed - (9 + 0.8 ** 0.75 * 36) * 0.15) < 1e-8);
  assert.ok(shots[0].speed > shots[1].speed && shots[1].speed > shots[2].speed);
  assert.ok(
    shots[0].precision > shots[1].precision &&
      shots[1].precision > shots[2].precision,
  );
  assert.ok(shots[2].lift < shots[0].lift);
});

test("first-time actions execute once without a trapping reception", () => {
  for (const type of ["pass", "lob", "through", "shoot"]) {
    const m = setup(),
      p = m.players[9];
    Object.assign(m.ball, { owner: null, x: p.x + 0.5, z: p.z, vx: 0, vz: 0 });
    assert.equal(m.beginAction(type, { x: 1 }), true);
    assert.equal(m.releaseAction(0.35), true);
    assert.equal(p.ballAction, undefined);
    contact(m);
    assert.equal(m.lastReception, null);
    assert.equal((m.lastShot || m.lastPass).firstTime, true);
    assert.equal((m.lastShot || m.lastPass).power, 0.35);
    assert.equal(m.controls[0].bufferedAction, null);
    const result = m.lastShot || m.lastPass;
    for (let i = 0; i < 60; i++) m.update(dt, {});
    assert.equal(m.lastShot || m.lastPass, result);
    m.physics.dispose();
  }
});

test("buffer expires after 1 second and cancels on reset, cancel or selection change", () => {
  for (const reason of ["expiry", "cancel", "switch", "reset"]) {
    const m = setup();
    Object.assign(m.ball, { owner: null, x: 20, z: 20 });
    m.beginAction("shoot", {});
    m.releaseAction(0.7);
    if (reason === "expiry") for (let i = 0; i < 121; i++) m.update(dt, {});
    if (reason === "cancel") m.cancelAction();
    if (reason === "switch") {
      m.selected = 8;
      m.update(dt, {});
      m.selected = 9;
    }
    if (reason === "reset") m.start();
    assert.equal(m.controls[0].bufferedAction, null, reason);
    Object.assign(m.ball, {
      owner: 9,
      x: m.players[9].x + 0.6,
      z: m.players[9].z,
    });
    for (let i = 0; i < 90; i++) m.update(dt, {});
    assert.equal(m.lastShot, null, reason);
    m.physics.dispose();
  }
});

test("held shot keeps its buffer alive while the other team expires independently", () => {
  const m = setup();
  m.multiplayer = true;
  Object.assign(m.ball, { owner: null, x: 30, z: 20 });
  m.beginAction("shoot", {});
  m.withTeam(1, () => m.beginAction("lob", { x: -1 }));
  for (let i = 0; i < 110; i++) m.update(dt, {});
  m.releaseAction(1);
  for (let i = 0; i < 11; i++) m.update(dt, {});
  assert.ok(m.controls[0].bufferedAction);
  for (let i = 0; i < 121; i++) m.update(dt, {});
  assert.equal(m.controls[0].bufferedAction, null);
  assert.equal(m.controls[1].bufferedAction, null);
  assert.equal(m.charging, false);
  m.physics.dispose();
});

test("buffer accepts reception just before deadline and rejects just after for either team", () => {
  for (const team of [0, 1])
    for (const receivedAt of [0.999, 1.001]) {
      const m = setup();
      m.multiplayer = true;
      m.ball.owner = null;
      m.withTeam(team, () => {
        m.beginAction("shoot", {});
        m.releaseAction(0.5);
      });
      m.elapsed = receivedAt;
      m.ball.owner = m.controls[team].selected;
      m.withTeam(team, () => m.consumeBufferedAction());
      assert.equal(!!m.players[m.ball.owner].ballAction, receivedAt < 1);
      assert.equal(m.controls[1 - team].bufferedAction, null);
      m.physics.dispose();
    }
});

test("incoming passes are struck first time without possession or a trapping impulse", () => {
  for (const type of ["pass", "lob", "through", "shoot"]) {
    for (const offset of [0, 0.35]) {
      const m = setup(),
        p = m.players[9];
      Object.assign(m.ball, {
        owner: null,
        x: p.x + 4,
        z: p.z + offset,
        vx: -12,
        vz: 0,
      });
      m.beginAction(type, { x: 1 });
      m.releaseAction(0.5);
      let received = false;
      for (let i = 0; i < 120 && !m.lastShot && !m.lastPass; i++) {
        m.update(dt, { x: -1 }); // Assistance overrides this movement until contact.
        received ||= m.ball.owner === p.id || m.lastReception?.player === p.id;
      }
      const hit = m.lastShot || m.lastPass;
      assert.ok(
        hit?.firstTime,
        `${type} offset${offset}: real first-time strike`,
      );
      assert.equal(received, false, "no intervening trap/ownership");
      assert.ok(hit.incomingSpeed > 1, "ball is still rolling when struck");
      assert.equal(m.controls[0].bufferedAction, null);
      m.update(dt, { x: -1 });
      if (type === "shoot")
        assert.ok(
          m.players[m.selected].moveIntent.x < 0,
          "shot releases first-time assistance back to input",
        );
      else
        assert.ok(
          m.players[m.selected].receiveAssist,
          "new pass recipient uses reception assistance after the first-time strike",
        );
      m.physics.dispose();
    }
  }
});

test("a pass to the selected receiver can be returned first time before one second", () => {
  const m = setup();
  const receiver = m.players[10];
  Object.assign(receiver, { x: 7, z: 0, vx: 0, vz: 0, think: 99 });
  initLocomotion(receiver);
  m.beginAction("pass", { x: 1 });
  m.releaseAction(0.4);
  contact(m);
  const first = m.lastPass;
  assert.equal(m.selected, 10);
  assert.equal(m.beginAction("pass", { x: -1 }), true);
  m.releaseAction(0.3);
  for (let i = 0; i < 120 && m.lastPass === first; i++) m.update(dt, {});
  assert.notEqual(m.lastPass, first);
  assert.equal(m.lastPass.firstTime, true);
  assert.ok(m.lastPass.incomingSpeed > 1, JSON.stringify(m.lastPass));
  assert.notEqual(m.lastReception?.player, 10);
  m.physics.dispose();
});

test("action assistance approaches the ball independently of stick and restores movement", () => {
  const m = setup(),
    p = m.players[9];
  Object.assign(m.ball, { x: p.x + 0.8, z: p.z + 0.65 });
  m.beginAction("pass", { x: 1 });
  m.update(dt, { x: -1, z: -1 });
  assert.ok(
    p.moveIntent.z > 0,
    "assist moves toward lateral ball during charge",
  );
  m.releaseAction(0.25);
  contact(m);
  m.update(dt, { x: 0, z: -1 });
  assert.ok(p.moveIntent.z < 0, "input steers again after contact");
  m.physics.dispose();
});

test("a completed strike projects the body forward, follows with the foot and settles", () => {
  for (const type of ["pass", "shoot"]) {
    const m = setup(),
      p = m.players[9];
    m.beginAction(type, { x: 1 });
    for (let i = 0; i < 24; i++) m.update(dt, { x: 1 });
    assert.ok(
      type === "shoot"
        ? Math.abs(p.locomotion.expression.strikeLean) < 0.001
        : p.locomotion.expression.strikeLean > 0,
      "shoot preparation waits for release; passes retain their windup",
    );
    m.releaseAction(0.6);
    contact(m);
    assert.ok(
      p.locomotion.strikeFollow,
      "actual contact starts the follow-through",
    );
    const foot = p.ballMotion.foot;
    const target = { ...p.ballMotion.target };
    let forwardLean = 0,
      forwardHip = 0,
      footAdvance = 0;
    for (let i = 0; i < 120; i++) {
      m.update(dt, {});
      const e = p.locomotion.expression;
      forwardLean = Math.min(forwardLean, e.strikeLean);
      forwardHip = Math.min(forwardHip, e.hipBack);
      if (p.ballMotion) {
        const f = p.locomotion.feet[foot];
        footAdvance = Math.max(
          footAdvance,
          (f.x - target.x) * Math.sin(p.ballMotion.heading) +
            (f.z - target.z) * Math.cos(p.ballMotion.heading),
        );
      }
    }
    assert.ok(forwardLean < -0.15, `${type}: trunk passes through neutral`);
    assert.ok(forwardHip < -0.05, `${type}: hip follows forward`);
    assert.ok(
      footAdvance > 0.04,
      `${type}: kicking foot continues beyond contact`,
    );
    assert.equal(p.locomotion.strikeFollow, null);
    for (let i = 0; i < 120; i++) m.update(dt, {});
    assert.ok(Math.abs(p.locomotion.expression.strikeLean) < 0.001);
    m.physics.dispose();
  }
});

test("moving strike predicts support placement and carries momentum through contact", () => {
  for (const type of ["pass", "shoot"]) {
    const m = setup(),
      p = m.players[9];
    for (let i = 0; i < 180; i++) m.update(dt, { x: 1, sprint: true });
    Object.assign(m.ball, { x: p.x + 0.8, z: p.z, vx: p.vx, vz: p.vz });
    m.physics.ball.setAngvel(
      { x: m.ball.vz / 0.11, y: 0, z: -m.ball.vx / 0.11 },
      true,
    );
    Object.assign(m.players[10], { x: p.x + 18, z: p.z });
    const initialSpeed = p.vx;
    m.beginAction(type, { x: 1, sprint: true });
    m.releaseAction(0.6);
    let anchor,
      landedAhead,
      hit = false,
      maxArms = 0,
      minSpeed = initialSpeed;
    for (let i = 0; i < 108; i++) {
      const before = { vx: p.vx, vz: p.vz };
      m.update(dt, { x: 1 });
      assert.ok(
        Math.hypot(p.vx - before.vx, p.vz - before.vz) < 0.15,
        "no velocity reset or kick boost",
      );
      minSpeed = Math.min(minSpeed, p.vx);
      maxArms = Math.max(maxArms, p.locomotion.expression.strikeArms);
      assert.ok(
        p.locomotion.expression.strikeLean < 0.035,
        "minimal backward lean",
      );
      assert.ok(
        p.locomotion.expression.hipBack <= 0.001,
        "no artificial hip retreat",
      );
      const plant = p.strikePlant;
      if (plant && p.locomotion.feet[plant.foot].contact) {
        const f = p.locomotion.feet[plant.foot];
        if (!anchor) {
          anchor = { x: f.x, z: f.z };
          landedAhead = f.x - m.ball.x;
        }
        assert.ok(
          Math.hypot(f.x - anchor.x, f.z - anchor.z) < 1e-6,
          "support remains planted",
        );
      }
      if (m.lastPass || m.lastShot) {
        assert.ok(anchor);
        assert.ok(
          Math.hypot(anchor.x - p.strikeTarget.x, anchor.z - p.strikeTarget.z) <
            0.5,
          "ball arrives beside the fixed support at impact",
        );
        hit = true;
        break;
      }
    }
    assert.ok(hit, type);
    assert.ok(landedAhead > 0.1, "support anticipates the rolling ball");
    assert.ok(
      minSpeed > initialSpeed * 0.5,
      "no stop-and-restart before impact",
    );
    assert.ok(maxArms > 0.15, "arms counterbalance the preparation step");
    m.physics.dispose();
  }
});

test("short taps prefer a nearby teammate in the aim cone while strong passes keep directional reach", async () => {
  const { selectPassTarget } = await import("../src/ball-actions.js");
  for (const team of [0, 1]) {
    const dir = team ? -1 : 1;
    const p = { id: 0, team, x: 0, z: 0 };
    const near = { id: 1, team, x: dir * 7, z: 3 };
    const far = { id: 2, team, x: dir * 25, z: 0 };
    const wrong = { id: 3, team, x: -dir * 2, z: 0 };
    const players = [p, near, far, wrong];
    const aim = { x: dir, z: 0 };
    assert.equal(selectPassTarget(players, p, aim, 0.1).id, 1);
    assert.equal(selectPassTarget(players, p, aim, 0.8).id, 2);
    assert.equal(selectPassTarget(players, p, aim, 0.1, "through").id, 2);
    assert.equal(selectPassTarget([p, far, wrong], p, aim, 0.1).id, 2);
  }
});

test("short-pass cone tapers from 120 to 20 total degrees with distance", async () => {
  const { selectPassTarget, shortPassHalfAngle } =
    await import("../src/ball-actions.js");
  const p = { id: 0, team: 0, x: 0, z: 0 },
    far = { id: 2, team: 0, x: 30, z: 0 };
  for (const [distance, halfAngle] of [
    [5, 60],
    [14, 35],
    [22, 10],
  ]) {
    assert.ok(
      Math.abs((shortPassHalfAngle(distance) * 180) / Math.PI - halfAngle) <
        1e-8,
    );
    for (const offset of [-0.1, 0.1]) {
      const angle = ((halfAngle + offset) * Math.PI) / 180;
      const near = {
        id: 1,
        team: 0,
        x: distance * Math.cos(angle),
        z: distance * Math.sin(angle),
      };
      assert.equal(
        selectPassTarget([p, near, far], p, { x: 1, z: 0 }, 0.1).id,
        offset < 0 ? 1 : 2,
      );
    }
  }
});

test("ground passes have a speed ceiling even for distant targets on sand", () => {
  for (const surface of ["grass", "sand", "court", "street"]) {
    for (const distance of [5, 15, 30, 60, 90]) {
      const pass = passTrajectory(distance, 1, false, surface);
      assert.equal(pass.lift, 0);
      assert.ok(pass.speed <= 26);
    }
  }
});
