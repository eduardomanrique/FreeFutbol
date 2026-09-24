import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import {
  startSlide,
  stepSpecial,
  slideContacts,
  planBicycle,
} from "../src/gameplay-actions.js";
import { placeFreeKick } from "../src/free-kicks.js";
import { stepBallMotion } from "../src/ball-physics.js";
function fixture(variant = "match", random = () => 0.99) {
  const m = new Match({ random });
  m.start(180, "normal", false, variant);
  for (const p of m.players) {
    p.x = -10;
    p.z = m.field.halfWidth - 2;
    p.think = 99;
    initLocomotion(p);
  }
  return m;
}
function position(p, x, z, dx) {
  Object.assign(p, { x, z, vx: 0, vz: 0, dx, dz: 0 });
  initLocomotion(p);
}
function slideScenario(variant, behind = true, random = () => 0.99) {
  const m = fixture(variant, random),
    p = m.players[m.selected],
    q = m.players.find((q) => q.team === 1 && !q.keeper);
  position(p, 0, 0, 1);
  position(q, 1.6, 0, behind ? 1 : -1);
  Object.assign(m.ball, {
    owner: null,
    x: 8,
    z: 2,
    y: 0.11,
    vx: 0,
    vz: 0,
    vy: 0,
    lastTeam: 1,
  });
  m.tackle(true);
  for (let i = 0; i < 90 && !q.knockdown; i++) {
    stepSpecial(m, p, 1 / 120);
    stepSpecial(m, q, 1 / 120);
    slideContacts(m, p);
  }
  return { m, p, q };
}
test("slide moves along ground, only takes ball on contact and has cooldown", () => {
  const m = fixture("street"),
    p = m.players[m.selected];
  position(p, 0, 0, 1);
  Object.assign(m.ball, {
    owner: null,
    lastTeam: 1,
    x: 2,
    z: 0,
    y: 0.11,
    vx: 0,
    vz: 0,
    vy: 0,
  });
  m.tackle();
  assert.equal(m.ball.lastTeam, 1);
  for (let i = 0; i < 60 && !p.slide.hitBall; i++) {
    stepSpecial(m, p, 1 / 120);
    slideContacts(m, p);
  }
  assert.ok(p.x > 0.3);
  assert.equal(m.ball.lastTeam, 0);
  assert.ok(m.ball.vx > 0);
  assert.equal(startSlide(m, p), false);
  m.physics.dispose();
});
test("late/back tackles knock down victim and give foul outside street; street plays on", () => {
  for (const variant of ["match", "sand", "court", "street"]) {
    const { m, q } = slideScenario(variant);
    assert.ok(q.knockdown?.behind);
    assert.equal(!!m.foul, variant !== "street");
    assert.equal(m.lastTackle.ballFirst, false);
    m.physics.dispose();
  }
});
test("front-on receiver attempts a jump: both escape and failed jump are possible", () => {
  const escaped = slideScenario("street", false, () => 0);
  assert.equal(escaped.q.knockdown, undefined);
  assert.ok(
    escaped.p.slide === null || escaped.p.slide.attempts.includes(escaped.q.id),
  );
  escaped.m.physics.dispose();
  const failed = slideScenario("street", false, () => 0.99);
  assert.ok(failed.q.knockdown);
  failed.m.physics.dispose();
});
test("near-area foul builds wall, area foul gives penalty, free kick can be released", () => {
  const m = fixture(),
    victim = m.players[9];
  placeFreeKick(m, { team: 0, victim: 9, x: 25, z: 0 });
  assert.equal(m.setPiece.type, "free");
  assert.equal(m.setPiece.wall.length, 3);
  for (const id of m.setPiece.wall)
    assert.ok(Math.hypot(m.players[id].x - 25, m.players[id].z) >= 9.1);
  m.beginAction("shoot", {});
  m.releaseAction(0.6);
  for (let i = 0; i < 240 && m.setPiece; i++) m.update(1 / 120, {});
  assert.equal(m.setPiece, null);
  assert.equal(m.lastShot?.type, undefined);
  assert.ok(m.lastShot);
  placeFreeKick(m, { team: 0, victim: victim.id, x: 40, z: 0 });
  assert.equal(m.setPiece.type, "penalty");
  assert.equal(m.setPiece.wall.length, 0);
  m.physics.dispose();
});
test("bicycle eligibility requires back to goal, descending cross, clear space and cooldown", () => {
  const m = fixture(),
    p = m.players[m.selected];
  position(p, 36, 0, -1);
  Object.assign(m.ball, {
    owner: null,
    x: 36.9,
    z: 0,
    y: 2.15,
    vx: -3,
    vz: 0,
    vy: 0,
  });
  const a = { type: "shoot", firstTime: true };
  assert.ok(planBicycle(m, p, a));
  p.dx = 1;
  assert.equal(planBicycle(m, p, a), null);
  p.dx = -1;
  p.nextBicycle = 10;
  assert.equal(planBicycle(m, p, a), null);
  p.nextBicycle = 0;
  m.players[2].x = p.x + 0.5;
  m.players[2].z = p.z;
  assert.equal(planBicycle(m, p, a), null);
  m.physics.dispose();
});
test("goal celebration keeps both teams planted and then restores kickoff", () => {
  const m = fixture("street");
  m.mode = "goal";
  m.score = [1, 0];
  m.restartTeam = 1;
  m.lastGoalTeam = 0;
  m.restartTimer = 3;
  const positions = m.players.map((p) => p.x);
  for (let i = 0; i < 120; i++) m.update(1 / 120, {});
  assert.ok(
    m.players.every((p, i) => p.x === positions[i] && p.vx === 0 && p.vz === 0),
  );
  assert.ok(
    m.players.filter((p) => p.team === 0).every((p) => p.celebration.won),
  );
  assert.ok(
    m.players.filter((p) => p.team === 1).every((p) => !p.celebration.won),
  );
  for (let i = 0; i < 250; i++) m.update(1 / 120, {});
  assert.equal(m.mode, "playing");
  assert.ok(m.players.every((p) => !p.celebration));
  m.physics.dispose();
});
test("surface predictions: sand stops early and quenches slow rolls; hard surfaces roll and bounce more", () => {
  const distances = {},
    bounces = {};
  for (const surface of ["grass", "sand", "court", "street"]) {
    const b = { x: 0, z: 0, y: 0.11, vx: 10, vz: 0, vy: 0, spin: 0, surface };
    for (let i = 0; i < 1200; i++) stepBallMotion(b, 1 / 120);
    distances[surface] = b.x;
    Object.assign(b, { x: 0, y: 2, vx: 0, vy: 0 });
    let impact = false,
      max = 0;
    for (let i = 0; i < 240; i++) {
      stepBallMotion(b, 1 / 120);
      if (b.vy > 0) impact = true;
      if (impact) max = Math.max(max, b.y);
    }
    bounces[surface] = max;
  }
  assert.ok(
    distances.sand < distances.grass &&
      distances.street > distances.grass &&
      distances.court > distances.street,
  );
  assert.ok(
    bounces.sand < bounces.grass &&
      bounces.street > bounces.grass &&
      bounces.court > bounces.street,
  );
});

test("bicycle goes from buffered shot through aerial contact to recovery, without triggering on ground balls", () => {
  const m = fixture(),
    p = m.players[m.selected];
  position(p, 36, 0, -1);
  Object.assign(m.ball, {
    owner: null,
    lastTeam: 0,
    x: 36.9,
    z: 0,
    y: 2.15,
    vx: -3,
    vz: 0,
    vy: 0,
  });
  m.beginAction("shoot", {});
  m.releaseAction(0.7);
  let seen = false;
  for (let i = 0; i < 100; i++) {
    m.update(1 / 120, {});
    seen ||= !!p.bicycle;
    if (m.lastShot?.bicycle) break;
  }
  assert.ok(seen);
  assert.ok(m.lastShot?.bicycle, JSON.stringify(m.snapshot()));
  for (let i = 0; i < 180; i++) m.update(1 / 120, {});
  assert.equal(p.bicycle, null);
  assert.ok(p.nextBicycle > m.elapsed);
  m.physics.dispose();
});
test("keeper closes down a nearby opponent and claims with hands", () => {
  const m = fixture(),
    k = m.players[11],
    a = m.players[9];
  position(k, 43.5, 0, -1);
  position(a, 39, 0, 1);
  m.selected = 9;
  Object.assign(m.ball, {
    owner: a.id,
    lastTeam: 0,
    x: 39.7,
    z: 0,
    y: 0.11,
    vx: 0,
    vz: 0,
    vy: 0,
  });
  let rushed = false,
    lowHands = false;
  for (let i = 0; i < 300 && !m.lastSave; i++) {
    m.update(1 / 120, {});
    rushed ||= !!k.goalkeeping?.smother && k.x < 43;
    lowHands ||= k.goalkeeping?.hands.some((h) => h.y < 0.5);
  }
  assert.ok(rushed);
  assert.ok(lowHands);
  assert.equal(m.lastSave?.kind, "catch");
  assert.equal(m.ball.owner, k.id);
  m.physics.dispose();
});
test("Rapier uses matching surface rankings for rollout and bounce", () => {
  const results = {};
  for (const variant of ["match", "sand", "court", "street"]) {
    const m = fixture(variant);
    Object.assign(m.ball, {
      owner: null,
      x: 0,
      z: 0,
      y: 0.11,
      vx: 8,
      vy: 0,
      vz: 0,
    });
    for (let i = 0; i < 900; i++) m.integrateBall(1 / 120);
    const roll = m.ball.x;
    Object.assign(m.ball, { x: 0, z: 0, y: 2, vx: 0, vy: 0, vz: 0 });
    let bouncing = false,
      height = 0;
    for (let i = 0; i < 240; i++) {
      m.integrateBall(1 / 120);
      bouncing ||= m.ball.vy > 0;
      if (bouncing) height = Math.max(height, m.ball.y);
    }
    results[variant] = { roll, height };
    m.physics.dispose();
  }
  assert.ok(results.sand.roll < results.match.roll, JSON.stringify(results));
  assert.ok(results.court.roll > results.match.roll);
  assert.ok(results.street.roll > results.match.roll);
  assert.ok(results.sand.height < results.match.height);
  assert.ok(results.court.height > results.match.height);
  assert.ok(results.street.height > results.match.height);
});
