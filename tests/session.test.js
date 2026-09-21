import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MatchSession,
  verifyReplay,
  SIMULATION_VERSION,
  TICK_RATE,
} from "../src/core/session.js";
import { RootMotionWarp } from "../src/core/root-motion-warp.js";

const dt = 1 / TICK_RATE;

function inputAt(t) {
  return {
    x: Math.sin(t * 0.17) * 0.8,
    z: Math.cos(t * 0.11) * 0.65,
    sprint: t % 47 < 19,
    jockey: t % 71 >= 56,
  };
}

function runTicks(session, from, count) {
  for (let i = from; i < from + count; i++) session.step(inputAt(i), {});
}

function clone(value) {
  return structuredClone(value);
}

test("seeded sessions export a replay that reproduces the final checkpoint", () => {
  const session = new MatchSession({ seed: 0x12345678 });
  try {
    session.start(20, "normal");
    for (let i = 0; i < 180; i++) {
      if (i === 18) session.action("beginAction", ["pass", { x: 1, z: 0 }]);
      if (i === 42) session.action("releaseAction", [0.72]);
      if (i === 96) session.action("switchPlayer");
      session.step(inputAt(i), {});
    }
    const replay = session.exportReplay();
    const result = verifyReplay(replay);
    assert.equal(result.checksum, replay.final);
    assert.equal(result.tick, session.tick);
  } finally {
    session.dispose();
  }
});

test("checkpoint restores movement and Rapier continuation tick for tick", () => {
  const session = new MatchSession({ seed: 0x0badcafe });
  try {
    session.start(20, "normal");
    runTicks(session, 0, 84);
    const checkpoint = session.checkpoint();
    const identity = session.match;
    const expected = [];
    for (let i = 84; i < 264; i++) {
      session.step(inputAt(i), {});
      expected.push(session.checkpoint().checksum);
    }

    session.restore(checkpoint);
    assert.strictEqual(session.match, identity);
    const actual = [];
    for (let i = 84; i < 264; i++) {
      session.step(inputAt(i), {});
      actual.push(session.checkpoint().checksum);
    }
    assert.deepEqual(actual, expected);
  } finally {
    session.dispose();
  }
});

test("checkpoint preserves an in-flight charge and strike continuation", () => {
  const session = new MatchSession({ seed: 0x44aa7711 });
  try {
    session.start(20, "normal");
    session.action("beginAction", ["shoot", { x: 1, z: 0 }]);
    for (let i = 0; i < 23; i++)
      session.step({ x: 0.1, z: 0, sprint: false }, {});
    const checkpoint = session.checkpoint();
    const player = session.match.players[session.match.selected];
    assert.equal(session.match.charging, true);
    assert.ok(player.ballAction || session.match.controls[0].bufferedAction);
    const expected = [];
    for (let i = 23; i < 160; i++) {
      if (i === 67) session.action("releaseAction", [0.83]);
      session.step(inputAt(i), {});
      expected.push(session.checkpoint().checksum);
    }

    session.restore(checkpoint);
    assert.equal(session.match.charging, true);
    for (let i = 23; i < 160; i++) {
      if (i === 67) session.action("releaseAction", [0.83]);
      session.step(inputAt(i), {});
      assert.equal(session.checkpoint().checksum, expected[i - 23]);
    }
  } finally {
    session.dispose();
  }
});

test("restore keeps RootMotionWarp prototypes and aliases in the state graph", () => {
  const session = new MatchSession({ seed: 9 });
  try {
    session.start(20, "normal");
    const player = session.match.players[9];
    const warp = new RootMotionWarp(
      { x: player.x, z: player.z },
      { x: player.x + 0.12, z: player.z + 0.08 },
    );
    player.rootWarp = warp;
    player.dribbleIntent = { x: 1, z: 0 };
    player.turnIntent = player.dribbleIntent;
    const checkpoint = session.checkpoint();
    session.restore(checkpoint);
    const restored = session.match.players[9];
    assert.ok(restored.rootWarp instanceof RootMotionWarp);
    assert.strictEqual(restored.turnIntent, restored.dribbleIntent);
    assert.deepEqual(restored.rootWarp.start, warp.start);
    assert.deepEqual(restored.rootWarp.offset, warp.offset);
  } finally {
    session.dispose();
  }
});

test("corrupt or incompatible checkpoints are rejected without mutating the session", () => {
  const session = new MatchSession({ seed: 7 });
  try {
    session.start(20, "normal");
    runTicks(session, 0, 12);
    const original = session.checkpoint();
    const identity = session.match;
    const corrupt = clone(original);
    corrupt.physics.world[0] ^= 1;
    assert.throws(
      () => session.restore(corrupt),
      /Incompatible or damaged checkpoint/,
    );
    assert.strictEqual(session.match, identity);
    assert.equal(session.checkpoint().checksum, original.checksum);

    const incompatible = clone(original);
    incompatible.version = `${SIMULATION_VERSION}-old`;
    assert.throws(
      () => session.restore(incompatible),
      /Incompatible or damaged checkpoint/,
    );
    assert.strictEqual(session.match, identity);
    assert.equal(session.checkpoint().checksum, original.checksum);
  } finally {
    session.dispose();
  }
});

test("replay tampering is detected by the final checkpoint checksum", () => {
  const session = new MatchSession({ seed: 0x55aa });
  try {
    session.start(20, "normal");
    runTicks(session, 0, 100);
    const replay = session.exportReplay();
    const tampered = clone(replay);
    const command = tampered.commands.find((entry) => entry.step);
    command.step[0].x = command.step[0].x === 0 ? 0.9 : 0;
    assert.throws(() => verifyReplay(tampered), /Replay diverged/);
  } finally {
    session.dispose();
  }
});

test("visual controllers can be attached without entering the serializable core state", () => {
  const session = new MatchSession({ seed: 21 });
  const plain = new MatchSession({ seed: 21 });
  const library = {
    createController(id) {
      return { id, update() {} };
    },
  };
  try {
    session.start(20, "normal");
    plain.start(20, "normal");
    session.match.attachMotionLibrary(library);
    for (let i = 0; i < 64; i++) {
      const input = inputAt(i);
      session.step(input, {});
      plain.step(input, {});
      assert.equal(session.checkpoint().checksum, plain.checkpoint().checksum);
    }
    const checkpoint = session.checkpoint();
    const identity = session.match;
    session.restore(checkpoint);
    assert.strictEqual(session.match, identity);
    assert.strictEqual(session.match.motionLibrary, library);
    assert.equal(session.match.players[9].motion.id, 9);
    for (let i = 64; i < 88; i++) {
      const input = inputAt(i);
      session.step(input, {});
      plain.step(input, {});
      assert.equal(session.checkpoint().checksum, plain.checkpoint().checksum);
    }
  } finally {
    session.dispose();
    plain.dispose();
  }
});
