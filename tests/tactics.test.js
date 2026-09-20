import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { formationTarget, supportTargets, activePass } from "../src/tactics.js";

test("both teams advance in possession and retreat/narrow toward either flank without abandoning anchors", () => {
  const m = new Match();
  for (const p of m.players.filter((p) => !p.keeper)) {
    const dir = p.team ? -1 : 1;
    for (const z of [-25, 25]) {
      const b = { x: 0, z };
      const attack = formationTarget(p, b, true);
      const defence = formationTarget(p, b, false);
      assert.ok((attack.x - p.homeX) * dir > 0);
      assert.ok((defence.x - p.homeX) * dir < 0);
      assert.ok((defence.z - p.homeZ) * z > 0);
      assert.ok(Math.abs(defence.z - p.homeZ) <= 8);
    }
  }
  const b = { x: 0, z: 0 };
  const support = supportTargets(m.players, m.players[9], b);
  assert.equal(support.size, 3);
  for (const [id, target] of support) {
    const base = formationTarget(m.players[id], b, true);
    assert.ok(Math.hypot(target.x, target.z) < Math.hypot(base.x, base.z));
    assert.ok(Math.abs(target.x - base.x) <= 10);
  }
  m.physics.dispose();
});

test("pass recipient pursues while passer holds shape; expiry and interception release assignment", () => {
  for (const team of [0, 1]) {
    const m = new Match({ multiplayer: true });
    m.start();
    const passer = m.players[team * 11 + 9],
      receiver = m.players[team * 11 + 8];
    const dir = team ? -1 : 1;
    Object.assign(passer, { x: 0, z: 0 });
    Object.assign(receiver, { x: dir * 12, z: -8 });
    m.kick(passer, receiver.x, receiver.z, 14, 0.3);
    m.lastPass = {
      target: receiver.id,
      team,
      flight: m.ballFlight,
      contactAt: m.elapsed,
      receiveWindow: 3,
    };
    m.selectForTeam(receiver);
    Object.assign(m.ball, { x: dir * 2, z: -1 });
    m.update(1 / 120, {}, {});
    assert.ok(
      passer.moveIntent.x * dir > 0,
      "passer advances into his attacking position",
    );
    assert.ok(
      Math.abs(passer.moveIntent.z) < 1,
      "passer holds central position instead of chasing toward the wing",
    );
    assert.equal(passer.reach, null);
    assert.ok(receiver.moveIntent.x * dir < 0, "receiver meets pass");
    m.ball.owner = 1 - team ? 11 : 0;
    assert.equal(activePass(m), null);
    m.ball.owner = null;
    m.elapsed = 4;
    assert.equal(activePass(m), null);
    m.elapsed = 0;
    m.ballFlight++;
    assert.equal(activePass(m), null);
    m.physics.dispose();
  }
});

test("forwards stay level or ahead when the carrier advances; support closes to short-pass distance", () => {
  const m = new Match();
  for (const team of [0, 1]) {
    const dir = team ? -1 : 1;
    const ball = { x: dir * 28, z: 10 };
    const support = supportTargets(m.players, m.players[team * 11 + 7], ball);
    for (const p of m.players.filter(
      (p) => p.team === team && p.homeX * dir >= -4,
    )) {
      const target = support.get(p.id) ?? formationTarget(p, ball, true);
      assert.ok(target.x * dir >= ball.x * dir);
    }
    assert.ok(
      [...support.values()].filter(
        (t) => Math.hypot(t.x - ball.x, t.z - ball.z) < 12,
      ).length >= 2,
    );
  }
  m.physics.dispose();
});

test("switching is defensive only, with a close-ball exception and pass-flight protection", () => {
  for (const team of [0, 1]) {
    const m = new Match({ multiplayer: true });
    m.start();
    const selected = team * 11 + 9,
      cover = team * 11 + 2,
      behind = team * 11 + 8;
    const dir = team ? -1 : 1;
    m.withTeam(team, () => {
      m.selected = selected;
      m.ball.owner = selected;
      m.switchPlayer();
      assert.equal(m.selected, selected);
      for (const p of m.players.filter((p) => p.team === team)) {
        p.x = -dir * 35;
        p.z = 25;
      }
      Object.assign(m.ball, { owner: null, x: 0, z: 0, lastTeam: 1 - team });
      Object.assign(m.players[cover], { x: -dir * 7, z: 0 });
      Object.assign(m.players[behind], { x: dir * 5, z: 0 });
      m.switchPlayer();
      assert.equal(m.selected, cover);
      m.selected = selected;
      m.players[behind].x = dir * 2;
      m.switchPlayer();
      assert.equal(m.selected, behind);
      m.selected = selected;
      m.ball.lastTeam = team;
      m.lastPass = {
        team,
        target: behind,
        flight: m.ballFlight,
        contactAt: m.elapsed,
        receiveWindow: 2,
      };
      m.switchPlayer();
      assert.equal(m.selected, selected);
    });
    m.physics.dispose();
  }
});

test("receiver follows predicted trajectory despite held input, then returns control after reception", async () => {
  const { initLocomotion } = await import("../src/locomotion.js");
  for (const team of [0, 1])
    for (const input of [
      { x: 1 },
      { x: -1, z: 0.6 },
      { z: 1 },
      { x: 1, sprint: true },
    ]) {
      const m = new Match({ multiplayer: true, random: () => 0 });
      m.start();
      const dir = team ? -1 : 1,
        receiver = m.players[team * 11 + 8],
        passer = m.players[team * 11 + 9];
      for (const p of m.players) {
        p.x = -dir * 35;
        p.z = 25;
        p.think = 99;
        initLocomotion(p);
      }
      Object.assign(passer, { x: 0, z: 0 });
      initLocomotion(passer);
      Object.assign(receiver, { x: dir * 12, z: 3 });
      initLocomotion(receiver);
      receiver.vx = dir * 3;
      Object.assign(m.ball, { x: dir * 0.6, z: 0, y: 0.11, owner: passer.id });
      m.kick(passer, receiver.x, receiver.z, 16, 0);
      m.ball.lastTeam = team;
      m.lastPass = {
        team,
        target: receiver.id,
        flight: m.ballFlight,
        contactAt: m.elapsed,
        receiveWindow: 4,
      };
      m.selectForTeam(receiver);
      const movement = { ...input, x: (input.x || 0) * dir };
      let assisted = false,
        furthest = receiver.x * dir;
      for (let i = 0; i < 450 && m.ball.owner === null; i++) {
        m.update(
          1 / 120,
          team === 0 ? movement : {},
          team === 1 ? movement : {},
        );
        assisted ||= !!receiver.receiveAssist;
        furthest = Math.max(furthest, receiver.x * dir);
      }
      assert.ok(assisted);
      assert.equal(
        m.ball.owner,
        receiver.id,
        JSON.stringify({
          team,
          input,
          ball: m.ball,
          p: { x: receiver.x, z: receiver.z },
        }),
      );
      assert.ok(
        furthest < 14,
        "receiver brakes instead of running beyond the pass",
      );
      m.update(1 / 120, team === 0 ? movement : {}, team === 1 ? movement : {});
      assert.equal(receiver.receiveAssist, null);
      m.physics.dispose();
    }
});
