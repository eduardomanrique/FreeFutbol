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
    assert.ok(
      m.score[0] + m.score[1] <= 4,
      "stronger attacks can now win rallies",
    );
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

test("high attack jumps immediately, contacts with head or raised foot, and lands", async () => {
  const { volleyJump } = await import("../src/volley-motion.js");
  for (const [x, kind] of [
    [-3, "head"],
    [-1.3, "high-kick"],
  ]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.selected = 0;
      const p = m.players[0];
      Object.assign(p, { x, z: 0, dx: 1, dz: 0 });
      initLocomotion(p);
      Object.assign(m.ball, {
        x: x + (kind === "high-kick" ? 0.68 : 0),
        z: 0,
        y: 2.7,
        vx: 0,
        vz: 0,
        vy: -1,
      });
      assert.ok(requestVolley(m, "shoot"));
      const a = p.volleyPending;
      assert.equal(a.kind, kind);
      assert.ok(volleyJump(a, m.elapsed + 0.45) > 0.6);
      for (let i = 0; i < 100 && !m.lastTouch; i++) m.update(1 / 120, {});
      assert.equal(m.lastTouch?.kind, kind);
      assert.ok(m.ball.y > 2);
      assert.ok(m.ball.vx > 0);
      assert.equal(volleyJump(a, a.jumpAt + 1), 0);
    } finally {
      m.physics.dispose();
    }
  }
});

test("receiving and setting keep the ball on own side, with a higher set", () => {
  const heights = [];
  for (const type of ["pass", "lob"]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      Object.assign(m.ball, { x: -4, z: 0, y: 1.5 });
      volleyContact(m, m.players[0], action(type));
      heights.push(m.ball.y + m.ball.vy ** 2 / 19.62);
      assert.equal(m.footvolley.receiver, 1);
    } finally {
      m.physics.dispose();
    }
  }
  assert.ok(heights[1] > heights[0] + 1);
});

test("only receive pursues a far ball or starts an emergency dive; set follows manual input", () => {
  for (const type of ["pass", "lob"]) {
    for (const [gap, y, vy] of [
      [6.5, 6, 1],
      [3.8, 2, -1],
    ]) {
      const m = setup();
      try {
        m.footvolley.phase = "rally";
        m.footvolley.humans = [true, true, true, true];
        m.selected = 0;
        const p = m.players[0];
        Object.assign(p, { x: -8, z: 0, dx: 1, dz: 0 });
        initLocomotion(p);
        Object.assign(m.ball, { x: p.x + gap, z: 0, y, vy, vx: 0, vz: 0 });
        assert.ok(requestVolley(m, type, {}, 0));
        assert.equal(!!p.volleyPending.dive, type === "pass" && y === 2);
        for (let i = 0; i < 24; i++) m.update(1 / 120, {});
        if (type === "pass")
          assert.ok(p.x > -7.95, "A starts a real approach beyond six metres");
        else {
          assert.ok(
            Math.abs(p.x + 8) < 0.001,
            "B never starts an automatic approach",
          );
          m.volleyInputs = { 0: { z: 1 } };
          for (let i = 0; i < 20; i++) m.update(1 / 120, {});
          assert.ok(
            p.z > 0.05,
            "manual movement remains available while setting",
          );
        }
      } finally {
        m.physics.dispose();
      }
    }
  }
});

test("ordinary reception is short and low even when teammate is far away", () => {
  const m = setup();
  try {
    m.footvolley.phase = "rally";
    m.players[1].x = -1;
    m.players[1].z = 0;
    Object.assign(m.ball, { x: -8, z: 0, y: 1.5 });
    volleyContact(m, m.players[0], action("pass"));
    const apex = m.ball.y + m.ball.vy ** 2 / 19.62;
    const flight =
      (m.ball.vy + Math.sqrt(m.ball.vy ** 2 + 19.62 * (m.ball.y - 0.11))) /
      9.81;
    assert.ok(apex < 2.1);
    assert.ok(Math.hypot(m.ball.vx, m.ball.vz) * flight < 2.8);
  } finally {
    m.physics.dispose();
  }
});

test("near-net overhead balls prefer headers; awkward high kick falls and recovers", () => {
  for (const gap of [0, 0.25, 0.68]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.footvolley.humans = [true, true, true, true];
      m.selected = 0;
      const p = m.players[0];
      Object.assign(p, { x: -1.3, z: 0, dx: 1, dz: 0 });
      initLocomotion(p);
      Object.assign(m.ball, {
        x: p.x + gap,
        z: 0,
        y: 2.7,
        vy: -1,
        vx: 0,
        vz: 0,
      });
      requestVolley(m, "shoot", {}, 0);
      assert.equal(p.volleyPending.kind, gap > 0.55 ? "high-kick" : "head");
      if (gap > 0.55) {
        for (let i = 0; i < 110; i++) m.update(1 / 120, {});
        assert.ok(p.altinhaPose.acrobatic);
        assert.equal(requestVolley(m, "lob", {}, 0), false);
        const x = p.x;
        m.volleyInputs = { 0: { x: -1 } };
        for (let i = 0; i < 20; i++) m.update(1 / 120, {});
        assert.equal(p.x, x);
        for (let i = 0; i < 100; i++) m.update(1 / 120, {});
        assert.equal(p.altinhaPose, null);
      }
    } finally {
      m.physics.dispose();
    }
  }
});

test("powered header and foot attack can aim to either corner across the net for both teams", async () => {
  const { stepBallMotion } = await import("../src/ball-physics.js");
  for (const team of [0, 1])
    for (const z of [-1, 1])
      for (const kind of ["head", "high-kick"]) {
        const m = setup();
        try {
          m.footvolley.phase = "rally";
          const p = m.players[team * 2];
          const x = team === 0 ? -1.3 : 1.3;
          Object.assign(p, { x, z: 0 });
          Object.assign(m.ball, { x, z: 0, y: 2.5 });
          volleyContact(m, p, {
            ...action("shoot"),
            kind,
            input: { x: team === 0 ? 1 : -1, z },
            jumpAt: m.elapsed,
            setAttack: true,
          });
          assert.equal(m.lastShot.powered, true);
          assert.ok(m.lastShot.speed > 9);
          assert.ok(m.ball.vz * z > 0);
          const ball = { ...m.ball };
          let crossed = false;
          for (let i = 0; i < 300 && ball.y > 0.111; i++) {
            const before = { ...ball };
            stepBallMotion(ball, 1 / 240);
            if (before.x * ball.x <= 0) {
              assert.ok(ball.y > 2.31);
              crossed = true;
            }
          }
          assert.ok(crossed);
          assert.ok(ball.x * x < 0);
          assert.ok(Math.abs(ball.x) < 9 && Math.abs(ball.z) < 4.5);
        } finally {
          m.physics.dispose();
        }
      }
});

test("a soft reception can be set by a stationary partner even when B is queued early", () => {
  const m = setup();
  try {
    m.footvolley.phase = "rally";
    m.footvolley.humans = [true, true, true, true];
    const p = m.players[0],
      q = m.players[1];
    Object.assign(p, { x: -5, z: 0, dx: 1, dz: 0 });
    Object.assign(q, { x: -3.2, z: 0, dx: -1, dz: 0 });
    initLocomotion(p);
    initLocomotion(q);
    Object.assign(m.ball, { x: -5, z: 0, y: 1.5, vx: 0, vy: 0, vz: 0 });
    volleyContact(m, p, action("pass"));
    assert.ok(Math.hypot(m.ball.vx, m.ball.vz) <= 2.6);
    assert.ok(m.ball.y + m.ball.vy ** 2 / 19.62 <= 1.8);
    assert.ok(requestVolley(m, "lob", {}, 1));
    for (let i = 0; i < 160 && m.lastTouch.player !== 1; i++)
      m.update(1 / 120, {});
    assert.equal(m.lastTouch.player, 1);
    assert.ok(["chest", "thigh", "inside"].includes(m.lastTouch.kind));
    assert.ok(m.ball.y + m.ball.vy ** 2 / 19.62 > 5);
    assert.ok(Math.abs(q.x + 3.2) < 0.01, "B did not move the receiver");
  } finally {
    m.physics.dispose();
  }
});

test("stationary partners face one another during their own exchange", () => {
  const m = setup();
  try {
    m.footvolley.phase = "rally";
    m.footvolley.lastTeam = 0;
    m.footvolley.humans = [true, true, true, true];
    const p = m.players[0],
      q = m.players[1];
    Object.assign(p, { x: -5, z: -1, dx: 1, dz: 0 });
    Object.assign(q, { x: -5, z: 1, dx: 1, dz: 0 });
    initLocomotion(p);
    initLocomotion(q);
    Object.assign(m.ball, { x: -5, z: 0, y: 5, vy: 0, vx: 0, vz: 0 });
    for (let i = 0; i < 65; i++) m.update(1 / 120, {});
    assert.ok(p.dz > 0.9 && q.dz < -0.9);
  } finally {
    m.physics.dispose();
  }
});

test("set chooses foot, knee, chest or head according to ball height", () => {
  for (const [y, kind] of [
    [0.65, "inside"],
    [1.05, "thigh"],
    [1.65, "chest"],
    [2.6, "head"],
  ]) {
    const m = setup();
    try {
      m.footvolley.phase = "rally";
      m.ball.y = y;
      requestVolley(m, "lob");
      assert.equal(m.players[m.selected].volleyPending.kind, kind);
    } finally {
      m.physics.dispose();
    }
  }
});

test("jump loads the knees on the ground, takes off, and absorbs the landing", async () => {
  const { volleyJumpPose, VOLLEY_PREPARE, VOLLEY_LANDING } =
    await import("../src/volley-motion.js");
  const a = { jumpAt: 2 };
  const load = volleyJumpPose(a, 2.1);
  assert.equal(load.phase, "prepare");
  assert.equal(load.height, 0);
  assert.ok(load.crouch > 0.18 && load.lean > 0.2);
  assert.ok(Math.abs(volleyJumpPose(a, 2 + VOLLEY_PREPARE).height) < 1e-10);
  assert.ok(volleyJumpPose(a, 2.5).height > 0.65);
  const landing = volleyJumpPose(a, 2 + VOLLEY_LANDING + 0.06);
  assert.equal(landing.height, 0);
  assert.ok(landing.crouch > 0.13);
  assert.equal(volleyJumpPose(a, 2 + VOLLEY_LANDING + 0.3).crouch, 0);
});

test("controlled A owns reception while a closer AI partner opens a passing lane", () => {
  const m = setup();
  try {
    m.footvolley.phase = "rally";
    m.selected = 0;
    const p = m.players[0],
      q = m.players[1];
    Object.assign(p, { x: -6, z: 0, dx: 1, dz: 0 });
    Object.assign(q, { x: -4.6, z: 0.2, dx: 1, dz: 0 });
    initLocomotion(p);
    initLocomotion(q);
    Object.assign(m.ball, { x: -4.5, z: 0, y: 4.3, vy: 0, vx: 0, vz: 0 });
    // AI had already prepared its own touch before the human requested A.
    assert.ok(requestVolley(m, "pass", {}, 1));
    assert.ok(requestVolley(m, "pass", {}, 0));
    assert.equal(q.volleyPending, null);
    let minGap = Infinity;
    for (let i = 0; i < 65 && !m.lastTouch; i++) {
      m.update(1 / 120, {});
      assert.equal(m.footvolley.receiver, 0);
      assert.equal(q.volleyPending, null);
      minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.z - q.z));
    }
    assert.ok(q.z > 0.65, "partner opens a lateral receiving lane");
    assert.ok(minGap > 1, "partner stays outside the controlled receiver");
    assert.equal(q.volleySupport.receiver, 0);
    assert.ok(Math.abs(q.volleySupport.z) > 1.5);
  } finally {
    m.physics.dispose();
  }
});
