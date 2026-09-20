import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { initLocomotion } from "../src/locomotion.js";
import { renderState, encodeState } from "../shared/protocol.js";
function fixture(team = 0, y = 2, offset = 0) {
  const m = new Match({ multiplayer: true, random: () => 0.5 });
  m.start();
  for (const p of m.players) {
    p.x = -35;
    p.z = 25;
    p.think = 99;
    initLocomotion(p);
  }
  const p = m.players[team * 11 + 9],
    dir = team ? -1 : 1;
  Object.assign(p, { x: dir * 34, z: 0, dx: dir, dz: 0 });
  initLocomotion(p);
  m.selectForTeam(p);
  Object.assign(m.ball, {
    x: p.x + offset,
    z: -5,
    y,
    vx: 0,
    vz: 10,
    vy: 2.8,
    spin: 0,
    owner: null,
  });
  return { m, p };
}
test("crosses can be headed at goal with real head contact, no trap, and a landing", () => {
  for (const team of [0, 1]) {
    const { m, p } = fixture(team);
    m.withTeam(team, () => {
      m.beginAction("shoot", { z: 0.5 });
      m.releaseAction(0.8);
    });
    let jumped = false,
      trapped = false;
    for (let i = 0; i < 120 && !m.lastShot; i++) {
      m.update(1 / 120, {}, {});
      jumped ||= p.header?.height > 0.1;
      trapped ||= m.ball.owner === p.id;
    }
    assert.equal(
      m.lastShot?.style,
      "header",
      JSON.stringify({ ball: m.ball, header: p.header, action: p.ballAction }),
    );
    assert.ok(jumped);
    assert.equal(trapped, false);
    assert.ok(m.ball.vx * (team ? -1 : 1) > 10);
    assert.ok(
      Math.hypot(
        m.lastShot.contact.x - m.lastShot.head.x,
        m.lastShot.contact.y - m.lastShot.head.y,
        m.lastShot.contact.z - m.lastShot.head.z,
      ) < 0.4,
    );
    assert.equal(m.lastReception, null);
    const state = JSON.parse(encodeState(renderState(m, 1, [0, 0])));
    assert.ok(state.state.players[p.id].header.hit);
    for (let i = 0; i < 120; i++) m.update(1 / 120, {}, {});
    assert.equal(p.header, null);
    m.physics.dispose();
  }
});
test("header pass selects a teammate; unreachable high or wide balls do not produce a header", () => {
  const { m, p } = fixture();
  Object.assign(m.players[7], { x: 25, z: 0 });
  initLocomotion(m.players[7]);
  m.beginAction("pass", { x: -1 });
  m.releaseAction(0.4);
  for (let i = 0; i < 120 && !m.lastPass; i++) m.update(1 / 120, {});
  assert.equal(m.lastPass?.style, "header");
  assert.equal(m.lastPass.target, 7);
  assert.equal(m.selected, 7);
  m.physics.dispose();
  for (const [y, offset] of [
    [4, 0],
    [2, 5],
  ]) {
    const { m } = fixture(0, y, offset);
    m.beginAction("shoot", {});
    m.releaseAction(0.8);
    for (let i = 0; i < 130; i++) m.update(1 / 120, {});
    assert.notEqual(m.lastShot?.style, "header");
    m.physics.dispose();
  }
});

test("an actual lofted cross can be finished with a header into the goal", () => {
  const { m, p } = fixture();
  const winger = m.players[7];
  Object.assign(winger, { x: 30, z: -16, dx: 0, dz: 1 });
  initLocomotion(winger);
  m.selected = 7;
  Object.assign(m.ball, {
    x: 30,
    z: -15.4,
    y: 0.11,
    vx: 0,
    vz: 0,
    vy: 0,
    owner: 7,
  });
  m.kickCooldown = 0;
  m.beginAction("lob", { x: 4, z: 16 });
  m.releaseAction(0.4);
  for (let i = 0; i < 180 && !m.lastPass; i++) m.update(1 / 120, {});
  assert.equal(m.lastPass?.target, p.id);
  for (let i = 0; i < 180; i++) {
    if (
      m.ball.vy < 0 &&
      m.ball.y < 3 &&
      Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 8
    )
      break;
    m.update(1 / 120, {});
  }
  m.beginAction("shoot", { z: 0.4 });
  m.releaseAction(0.8);
  for (let i = 0; i < 120 && !m.lastShot; i++) m.update(1 / 120, {});
  assert.equal(
    m.lastShot?.style,
    "header",
    JSON.stringify({ ball: m.ball, p: { x: p.x, z: p.z }, header: p.header }),
  );
  for (let i = 0; i < 180 && m.mode === "playing"; i++) m.update(1 / 120, {});
  assert.equal(m.score[0], 1);
  m.physics.dispose();
});

test("cancelling before takeoff clears the header and cannot create a delayed strike", () => {
  const { m, p } = fixture();
  m.beginAction("shoot", {});
  m.releaseAction(0.8);
  m.update(1 / 120, {});
  assert.ok(p.header);
  assert.equal(p.header.height, 0);
  m.cancelAction();
  assert.equal(p.header, null);
  for (let i = 0; i < 130; i++) m.update(1 / 120, {});
  assert.equal(m.lastShot, null);
  m.physics.dispose();
});
