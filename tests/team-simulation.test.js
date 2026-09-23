import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { TeamSimulation } from "../src/network/team-simulation.js";
import { TeamRelay } from "../server/team-relay.js";
import {
  packPlayer,
  worldState,
  encodeTeamMessage,
} from "../shared/team-protocol.js";
import { createPair } from "./helpers/team-pair.js";
for (const delay of [0, 0.08, 0.15])
  test(`team simulation: independent ownership, movement, kick and bounded error at ${delay * 1000}ms RTT`, () => {
    const p = createPair(delay);
    try {
      const start = p.matches[1].players[20].x;
      p.step(240, [
        { x: 0, z: 0 },
        { x: -1, z: 0, sprint: true },
      ]);
      assert.ok(p.matches[1].players[20].x < start - 2);
      assert.equal(p.matches[0].activeTeam, 0);
      assert.equal(p.matches[1].activeTeam, 1);
      // Observer never runs opposition decision making; commands drive its replicas.
      assert.equal(p.matches[0].players[20].think, 0);
      assert.ok(p.matches[1].players[20].think < 0);
      const remote = p.matches[0].players[20],
        own = p.matches[1].players[20];
      assert.ok(Math.hypot(remote.x - own.x, remote.z - own.z) < 2);
      p.sessions[0].action("begin", "shoot");
      p.step(20);
      p.sessions[0].action("release");
      p.step(150);
      assert.ok(p.matches[0].lastShot);
      assert.ok(p.matches[1].lastShot);
      assert.equal(p.matches[1].lastShot.power, p.relay.ball.lastShot.power);
      assert.ok(p.sessions.every((s) => s.stats.sentBytes > 0));
      assert.ok(
        p.matches.every((m) =>
          m.players.every((q) => Number.isFinite(q.x) && Number.isFinite(q.z)),
        ),
      );
    } finally {
      p.dispose();
    }
  });
test("relay validates team ownership and serializes competing contact claims", () => {
  const p = createPair();
  try {
    p.step(20);
    const epoch = p.relay.epoch;
    const msg = (t) => ({
      type: "team",
      version: 1,
      seq: 100,
      at: p.relay.time(),
      selected: t * 11 + 9,
      commands: [],
      ball: { epoch, kind: "claim", state: worldState(p.matches[t]) },
    });
    assert.ok(p.relay.receive(1, msg(1)).ball);
    assert.equal(p.relay.authority, 1);
    assert.ok(p.relay.receive(0, msg(0)).rejected);
    assert.equal(p.relay.authority, 1);
    assert.equal(p.relay.receive(1, msg(1)), null);
    assert.throws(() =>
      p.relay.receive(1, {
        ...msg(1),
        seq: 101,
        commands: [packPlayer(p.matches[1].players[0])],
      }),
    );
    assert.throws(() =>
      p.relay.receive(0, { ...msg(0), seq: 101, commands: [[9, NaN]] }),
    );
  } finally {
    p.dispose();
  }
});
test("delayed small backwards anchor is ignored, larger corrections converge, teleport resets", () => {
  const p = createPair();
  try {
    const s = p.sessions[0],
      q = p.matches[0].players[20];
    q.x = 10;
    q.vx = 4;
    const row = packPlayer(q);
    row[1] = 9.8;
    s.applyRow(row, p.matches[0].elapsed);
    assert.equal(q.x, 10);
    assert.equal(s.stats.ignoredCorrections, 1);
    row[1] = 11;
    s.applyRow(row, p.matches[0].elapsed);
    assert.equal(q.x, 10);
    assert.ok(s.remote.get(20).correction.x > 0);
    row[1] = 20;
    s.applyRow(row, p.matches[0].elapsed);
    assert.equal(q.x, 20);
  } finally {
    p.dispose();
  }
});
test("ball reception transfers authority; stale holder cannot overwrite the accepted contact", () => {
  const p = createPair();
  try {
    p.step(20);
    const s = p.sessions[1],
      m = p.matches[1];
    m.ball.owner = 20;
    m.ball.lastTeam = 1;
    m.ball.x = m.players[20].x;
    m.ball.z = m.players[20].z;
    s.contact(m.players[20], "contact");
    s.publish();
    p.step(20);
    assert.equal(p.relay.authority, 1);
    assert.equal(p.sessions[0].authority, 1);
    assert.equal(p.matches[0].ball.owner, 20);
  } finally {
    p.dispose();
  }
});
test("goal, kickoff and throw-in resets have one decision and synchronize both teams", () => {
  const p = createPair();
  try {
    p.step(30);
    const m = p.matches[0];
    Object.assign(m.ball, {
      x: 46.05,
      y: 0.5,
      z: 0,
      vx: 15,
      vy: 0,
      vz: 0,
      owner: null,
      lastTeam: 0,
    });
    p.step(100);
    assert.deepEqual(p.matches[0].score, [1, 0]);
    assert.deepEqual(p.matches[1].score, [1, 0]);
    p.step(400);
    assert.equal(p.matches[0].mode, "playing");
    assert.equal(p.matches[1].mode, "playing");
    assert.equal(p.relay.authority, 1);
    const host = p.matches[1];
    host.restart(0, 8, 30, "LATERAL");
    p.step(40);
    assert.equal(p.relay.authority, 0);
    assert.equal(p.matches[0].setPiece.type, "throw");
    assert.equal(p.matches[1].setPiece.type, "throw");
    assert.equal(p.matches[0].setPiece.taker, p.matches[1].setPiece.taker);
    const taker = p.matches[0].setPiece.taker;
    assert.ok(
      Math.abs(p.matches[0].players[taker].x - p.matches[1].players[taker].x) <
        0.01,
    );
  } finally {
    p.dispose();
  }
});

import { initLocomotion } from "../src/locomotion.js";
function fixture(pair, configure) {
  pair.step(30);
  for (const m of pair.matches) {
    for (const q of m.players) {
      q.x = -35 + q.id * 2;
      q.z = 23;
      q.vx = q.vz = 0;
      q.think = 99;
      initLocomotion(q);
    }
    m.ball.owner = null;
    m.lastKicker = null;
    m.kickCooldown = 0;
    configure(m);
  }
  pair.sessions.forEach((s) => {
    s.sent.clear();
  });
  pair.sessions[0].contactDirty = true;
  pair.sessions[0].publish();
}
for (const delay of [0, 0.15])
  test(`physical reception and goalkeeper save transfer ball at ${delay * 1000}ms RTT`, () => {
    const p = createPair(delay);
    try {
      fixture(p, (m) => {
        Object.assign(m.players[20], { x: 0, z: 0, vx: 0, vz: 0 });
        initLocomotion(m.players[20]);
        Object.assign(m.ball, {
          x: 2,
          z: 0,
          y: 0.11,
          vx: -28,
          vz: 0,
          vy: 0,
          lastTeam: 0,
        });
      });
      p.step(100);
      assert.equal(p.relay.authority, 1);
      assert.equal(p.matches[1].lastReception?.player, 20);
      assert.equal(p.matches[0].lastReception?.player, 20);
    } finally {
      p.dispose();
    }
    const q = createPair(delay);
    try {
      fixture(q, (m) => {
        Object.assign(m.players[11], { x: 43, z: 0, vx: 0, vz: 0 });
        initLocomotion(m.players[11]);
        const t = (42.65 - 38) / 10;
        Object.assign(m.ball, {
          x: 38,
          z: 0,
          y: 1.1,
          vx: 10,
          vz: 0,
          vy: 4.9 * t,
          lastTeam: 0,
        });
      });
      q.step(150);
      assert.equal(q.relay.authority, 1);
      assert.equal(q.matches[1].lastSave?.kind, "catch");
      assert.equal(q.matches[0].lastSave?.kind, "catch");
    } finally {
      q.dispose();
    }
  });
test("opposing bodies collide without either client changing the other owner's simulation", () => {
  const p = createPair(0.08);
  try {
    fixture(p, (m) => {
      Object.assign(m.players[9], { x: -1, z: 0, vx: 0, vz: 0 });
      initLocomotion(m.players[9]);
      Object.assign(m.players[20], { x: 1, z: 0, vx: 0, vz: 0 });
      initLocomotion(m.players[20]);
      Object.assign(m.ball, { x: 0, z: -25, y: 0.11, vx: 0, vz: 0, vy: 0 });
    });
    p.step(40); // Drain the deliberately teleported fixture before measuring contacts.
    p.sessions.forEach((s) => (s.stats.hardCorrections = 0));
    p.step(120, [{ x: 1 }, { x: -1 }]);
    const a = p.matches[0].players[9],
      b = p.matches[1].players[20];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.5);
    assert.ok(a.x < 0.5 && b.x > -0.5);
    assert.ok(p.sessions.every((s) => s.stats.hardCorrections === 0));
  } finally {
    p.dispose();
  }
});
