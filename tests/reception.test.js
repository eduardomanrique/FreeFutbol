import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECEPTION,
  receptionOpportunity,
  receptionRoll,
} from "../src/reception.js";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
const p = { x: 0, z: 0, vx: 0, vz: 0, kick: 0, reachCooldown: 0 };
const ball = (x, z = 0, vx = 0) => ({
  x,
  z,
  y: 0.11,
  vx,
  vz: 0,
  vy: 0,
  spin: 0,
  owner: null,
});
test("all zones invite reception automatically, even at rest or with opposite input", () => {
  assert.equal(receptionOpportunity(p, ball(2, 0, -10), {}).kind, "body");
  assert.equal(receptionOpportunity(p, ball(2, 0.7, -10), {}).kind, "near");
  for (const [x, kind] of [
    [1.15, "medium"],
    [2, "far"],
  ]) {
    assert.equal(receptionOpportunity(p, ball(x), {}).kind, kind);
    assert.equal(receptionOpportunity(p, ball(x), { x: -1 }).kind, kind);
    assert.equal(receptionOpportunity(p, ball(x), { x: 1, z: 1 }).kind, kind);
  }
  assert.equal(receptionOpportunity({ ...p, vx: 0 }, ball(2), {}).kind, "far");
});
test("single-attempt probability thresholds yield 99.9%,98%,95%,90%", () => {
  for (const [kind, rate] of Object.entries(RECEPTION)) {
    let wins = 0;
    for (let i = 0; i < 10000; i++)
      wins += receptionRoll(rate, () => (i + 0.5) / 10000);
    assert.equal(wins, rate.probability * 10000, kind);
  }
});
function match(random = () => 0) {
  const m = new Match({ random });
  m.start();
  m.selected = 9;
  m.players.forEach((p) => {
    p.x = -38;
    p.z = -25 + p.id * 2;
  });
  Object.assign(m.players[9], { x: 0, z: 0, vx: 0, vz: 0 });
  initLocomotion(m.players[9]);
  m.kickCooldown = 0;
  return m;
}
test("live fast body and near passes are trapped without any control input before Rapier rebounds them", () => {
  for (const z of [0, 0.7]) {
    const m = match();
    Object.assign(m.ball, ball(2, z, -28));
    for (let i = 0; i < 30 && m.ball.owner === null; i++) m.update(1 / 120, {});
    assert.equal(m.ball.owner, 9);
    assert.equal(m.lastReception.kind, z ? "near" : "body");
    m.physics.dispose();
  }
});
test("failed attempt rolls only once even if ball becomes a body contact", () => {
  let draws = 0;
  const m = match(() => {
    draws++;
    return 0.99999;
  });
  Object.assign(m.ball, ball(0.75));
  for (let i = 0; i < 20; i++) m.update(1 / 120, {});
  assert.equal(m.ball.owner, null);
  assert.equal(draws, 1);
  assert.equal(m.players[9].receptionAttempt.kind, "near");
  m.physics.dispose();
});
test("far reception starts an automatic approach and preserves its 90% attempt category", () => {
  const m = match();
  Object.assign(m.ball, ball(2.1));
  for (let i = 0; i < 5; i++) m.update(1 / 120, {});
  assert.equal(m.ball.owner, null);
  let steps = 0;
  for (; steps < 180 && m.ball.owner === null; steps++) m.update(1 / 120, {});
  assert.equal(m.ball.owner, 9);
  assert.equal(m.lastReception.kind, "far");
  assert.equal(m.lastReception.probability, 0.9);
  assert.ok(steps > 10);
  assert.ok(m.players[9].x > 0.6);
  m.physics.dispose();
});
test("medium reception works without input and turns a stationary receiver", () => {
  const m = match();
  Object.assign(m.ball, ball(1.2));
  m.update(1 / 120, {});
  assert.equal(m.ball.owner, null);
  for (let i = 0; i < 60 && m.ball.owner === null; i++) m.update(1 / 120, {});
  assert.equal(m.ball.owner, 9);
  assert.equal(m.lastReception.kind, "medium");
  m.physics.dispose();
});

test("owned ball requires close current distance, while free ball keeps full predictive reach", () => {
  const challenger = { ...p, id: 20, team: 1 };
  for (const distance of [0.71, 0.85, 1.2, 2.1]) {
    const b = { ...ball(distance, 0, -8), owner: 9, lastTeam: 0 };
    assert.equal(receptionOpportunity(challenger, b), null);
    assert.ok(receptionOpportunity(challenger, { ...b, owner: null }));
  }
  const close = receptionOpportunity(challenger, {
    ...ball(0.6),
    owner: 9,
    lastTeam: 0,
  });
  assert.equal(close.time, 0);
  assert.equal(close.kind, "near");
  assert.equal(close.maxReach, 0.55);
});

test("free-ball far attempt is replaced when a rival takes possession", () => {
  const m = match(),
    q = m.players[20];
  Object.assign(q, { x: 0.6, z: 0, vx: 0, vz: 0 });
  initLocomotion(q);
  Object.assign(m.players[9], { x: -1.5, z: 0 });
  initLocomotion(m.players[9]);
  Object.assign(m.ball, ball(0));
  q.receptionAttempt = {
    flight: m.ballFlight,
    owner: null,
    kind: "far",
    success: true,
    startedAt: 0,
    lastSeen: 0,
    landings: 0,
  };
  Object.assign(m.ball, { owner: 9, lastTeam: 0 });
  m.tryAutomaticReception({}, 1 / 120);
  assert.equal(q.receptionAttempt.kind, "near");
  assert.equal(q.receptionAttempt.owner, 9);
  assert.equal(q.reach.maxReach, 0.55);
  m.physics.dispose();
});
