import { initLocomotion } from "../src/locomotion.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import {
  requestVolley,
  volleyContact,
  volleyPoint,
} from "../src/footvolley.js";
function setup() {
  const m = new Match({ random: () => 0.5 });
  m.start(360, "normal", false, "futevolei");
  return m;
}
function action(type = "pass") {
  return { kind: "head", type, input: {}, startedAt: 0 };
}
test("futevolei starts with two barefoot teams and a human serve, no goalkeepers", () => {
  const m = setup();
  try {
    assert.equal(m.players.length, 4);
    assert.ok(m.players.every((p) => !p.keeper));
    assert.deepEqual(
      m.players.map((p) => p.team),
      [0, 0, 1, 1],
    );
    assert.equal(m.field.surface, "sand");
    assert.equal(m.field.goalHalf, 0);
    assert.equal(requestVolley(m, "shoot"), true);
    for (let i = 0; i < 40; i++) m.update(1 / 120, {});
    assert.equal(m.footvolley.phase, "rally");
    assert.ok(m.ball.vy > 0);
  } finally {
    m.physics.dispose();
  }
});
test("point is awarded once, score requires two-point lead, restart belongs to winning team", () => {
  const m = setup();
  try {
    m.score = [14, 14];
    assert.ok(volleyPoint(m, 0, "AREIA"));
    assert.equal(volleyPoint(m, 0, "AREIA"), false);
    assert.equal(m.mode, "playing");
    for (let i = 0; i < 270; i++) m.update(1 / 120);
    assert.equal(m.footvolley.serving, 0);
    assert.equal(m.footvolley.phase, "serve");
    volleyPoint(m, 0, "FORA");
    assert.equal(m.mode, "finished");
    assert.deepEqual(m.score, [16, 14]);
  } finally {
    m.physics.dispose();
  }
});
test("consecutive contact, fourth contact and hands award opposing team", () => {
  for (const foul of ["double", "fourth", "hand"]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.ball.x = -3;
      const p = m.players[0];
      if (foul === "double") m.footvolley.lastPlayer = 0;
      if (foul === "fourth") m.footvolley.touches[0] = 3;
      volleyContact(m, p, {
        ...action(),
        kind: foul === "hand" ? "hand" : "head",
      });
      assert.deepEqual(m.score, [0, 1]);
    } finally {
      m.physics.dispose();
    }
  }
});
test("ball on sand and outside use landing side and last touch respectively", () => {
  for (const [x, z, last, winner] of [
    [-3, 0, 1, 1],
    [3, 0, 0, 0],
    [10, 0, 0, 1],
    [2, 5, 1, 0],
  ]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.footvolley.lastTeam = last;
      Object.assign(m.ball, { x, z, y: 0.112, vy: -2, vx: 0, vz: 0 });
      m.update(1 / 120);
      assert.equal(m.score[winner], 1);
    } finally {
      m.physics.dispose();
    }
  }
});
test("crossing below net loses point; crossing above resets touch allowance", () => {
  for (const y of [1, 3]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.footvolley.lastTeam = 0;
      m.footvolley.lastPlayer = 0;
      m.footvolley.touches = [3, 0];
      Object.assign(m.ball, { x: -0.02, z: 0, y, vx: 6, vz: 0, vy: 0 });
      m.update(1 / 120);
      if (y === 1) assert.equal(m.score[1], 1);
      else {
        assert.deepEqual(m.footvolley.touches, [0, 0]);
        assert.equal(m.footvolley.lastPlayer, null);
      }
    } finally {
      m.physics.dispose();
    }
  }
});
test("AI coordinates legal three-touch rallies and movements stay on own side", () => {
  const m = setup();
  try {
    m.footvolley.humans = [false, false, false, false];
    let touches = 0,
      last = null;
    for (let i = 0; i < 2400; i++) {
      m.update(1 / 120);
      if (m.lastTouch?.time !== last) {
        last = m.lastTouch?.time;
        if (last) touches++;
      }
      assert.ok(m.players.every((p) => (p.team === 0 ? p.x < 0 : p.x > 0)));
      assert.ok(m.footvolley.touches.every((n) => n <= 3));
    }
    assert.ok(touches > 9);
    assert.deepEqual(m.score, [0, 0]);
  } finally {
    m.physics.dispose();
  }
});
test("unreachable human request cannot teleport into contact; switch changes only own teammate", () => {
  const m = setup();
  try {
    m.footvolley.phase = "rally";
    const p = m.players[m.selected];
    Object.assign(m.ball, { x: -1, z: 4, y: 2, vy: -1, vx: 0, vz: 0 });
    requestVolley(m, "shoot");
    for (let i = 0; i < 15; i++) m.update(1 / 120);
    assert.equal(m.lastTouch, null);
    const selected = m.selected;
    requestVolley(m, "switch");
    assert.equal(m.selected, selected ^ 1);
  } finally {
    m.physics.dispose();
  }
});

test("automatic selection follows landing, excludes last toucher and leaves online seats fixed", () => {
  for (const online of [false, true]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.selected = 0;
      Object.assign(m.players[0], { x: -8, z: -3 });
      Object.assign(m.players[1], { x: -3, z: 3 });
      Object.assign(m.ball, { x: -3, z: 3, y: 3, vx: 0, vz: 0, vy: 0 });
      if (online) m.footvolley.humans = [true, false, true, false];
      m.update(1 / 120, {});
      assert.equal(m.selected, online ? 0 : 1);
      if (!online) {
        m.footvolley.lastPlayer = 1;
        m.footvolley.selectionAt = -2;
        m.update(1 / 120, {});
        assert.equal(m.selected, 0);
      }
    } finally {
      m.physics.dispose();
    }
  }
});
test("requested distant rescue dives into actual contact at multiple frame rates; far ball stays unreachable", () => {
  for (const hz of [30, 60, 120])
    for (const gap of [3.8, 8]) {
      const m = setup();
      try {
        m.footvolley.phase = "rally";
        m.selected = 0;
        const p = m.players[0];
        Object.assign(p, { x: -8, z: 0, dx: 1, dz: 0 });
        initLocomotion(p);
        Object.assign(m.ball, {
          x: -8 + gap,
          z: 0,
          y: 2,
          vx: 0,
          vz: 0,
          vy: -1,
        });
        requestVolley(m, "pass");
        assert.ok(p.volleyPending.dive);
        for (
          let i = 0;
          i < hz && !m.lastTouch && m.footvolley.phase === "rally";
          i++
        )
          m.update(1 / hz, {});
        if (gap === 3.8) {
          assert.equal(m.lastTouch?.rescue, true);
          assert.equal(m.lastTouch.player, 0);
          assert.ok(p.x > -7);
          assert.ok(m.ball.vy > 8.5);
          assert.ok(p.altinhaPose.dive);
          assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 0.9);
        } else assert.equal(m.lastTouch, null);
      } finally {
        m.physics.dispose();
      }
    }
});
test("rescue has moderate spread near its target", () => {
  const landings = [];
  for (const random of [0, 0.5, 0.999]) {
    const m = setup();
    try {
      m.random = () => random;
      m.footvolley.phase = "rally";
      m.players[1].z = 0;
      Object.assign(m.ball, { x: -5, z: 0, y: 0.76 });
      const a = {
        ...action(),
        kind: "inside",
        dive: { at: 0, x: 1, z: 0, speed: 5 },
      };
      volleyContact(m, m.players[0], a);
      const flight =
        (m.ball.vy + Math.sqrt(m.ball.vy ** 2 + 19.62 * (m.ball.y - 0.11))) /
        9.81;
      landings.push(m.ball.z + (m.ball.vz * flight) / 1.07);
      assert.ok(m.ball.vy > 8.5);
    } finally {
      m.physics.dispose();
    }
  }
  assert.ok(landings[0] >= -1.5 && landings[2] <= 1.5);
  assert.ok(landings[0] < -1 && landings[2] > 1);
  assert.equal(landings[1], 0);
});

test("normal reach and high early balls do not trigger a dive", () => {
  for (const [gap, y, vy] of [
    [2.5, 2, -1],
    [3.1, 2, -1],
    [4, 4.5, 3],
    [3.8, 4, -1],
  ]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.selected = 0;
      const p = m.players[0];
      Object.assign(p, { x: -8, z: 0 });
      initLocomotion(p);
      Object.assign(m.ball, { x: -8 + gap, z: 0, y, vy, vx: 0, vz: 0 });
      requestVolley(m, "pass");
      assert.ok(!p.volleyPending.dive, JSON.stringify({ gap, y, vy }));
      m.update(1 / 120, {});
      assert.ok(p.moveIntent.x > 0, "approaches normally rather than waiting");
    } finally {
      m.physics.dispose();
    }
  }
});
