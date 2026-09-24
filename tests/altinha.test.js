import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/simulation.js";
import { ALTINHA_RECORD_KEY } from "../src/altinha.js";
function game() {
  const m = new Match({ random: () => 0.5 });
  m.start(1, "normal", false, "altinha");
  return m;
}
const tick = (m, n, input = {}) => {
  for (let i = 0; i < n; i++) m.update(1 / 120, input);
};
function serve(m) {
  m.altinhaAction("keep");
  tick(m, 90);
}
function touch(m, type = "style", input = {}) {
  const s = m.altinha,
    p = m.players[m.selected];
  s.phase = "playing";
  s.pending = null;
  s.cooldown = 0;
  Object.assign(m.ball, {
    x: p.x,
    z: p.z + p.dz * 0.48,
    y: type === "trick" ? 2.5 : 1.05,
    vy: type === "trick" ? -0.1 : -1,
    vx: 0,
    vz: 0,
  });
  const before = s.touches;
  assert.ok(m.altinhaAction(type, input));
  for (let i = 0; i < 240 && s.touches === before && s.phase === "playing"; i++)
    m.update(1 / 120, {});
  assert.ok(s.touches > before, `${type} must make a contact`);
  return s.lastTouch;
}
test("altinha has four cooperative players and is untimed; normal touches keep ball up without points", () => {
  const m = game();
  assert.equal(m.players.length, 4);
  assert.equal(m.altinha.phase, "ready");
  assert.ok(m.altinhaAction("keep"));
  assert.equal(m.altinha.points, 0);
  for (let i = 0; i < 6; i++) {
    const t = touch(m, "keep");
    assert.equal(t.award, 0);
    assert.ok(m.ball.vy > 0);
  }
  assert.equal(m.mode, "playing");
  assert.equal(m.altinha.points, 0);
  assert.equal(m.beginAction("shoot"), false);
  m.physics.dispose();
});
test("style rewards variety, repeating diminishes to zero; every award changes its effect", () => {
  const m = game();
  const a = touch(m),
    fx = m.altinha.effect;
  const b = touch(m);
  assert.ok(a.award > b.award && b.award > 0);
  assert.notEqual(m.altinha.effect.hue, fx.hue);
  const c = touch(m);
  assert.equal(c.award, 0);
  const d = touch(m, "style", { x: 1 });
  assert.ok(d.award > 0);
  assert.equal(d.kind, "outside");
  const e = touch(m, "style", { z: 1 });
  assert.equal(e.kind, "heel");
  assert.ok(m.altinha.combo >= 2);
  m.physics.dispose();
});
test("trick needs height/time and actual reachable contact; cannot spam or touch from far away", () => {
  const m = game();
  serve(m);
  Object.assign(m.ball, { y: 0.4, vy: -1 });
  assert.equal(m.altinhaAction("trick"), false);
  assert.ok(touch(m, "trick").award >= 25);
  assert.equal(m.altinha.lastTouch.kind, "around");
  m.altinha.cooldown = 0;
  Object.assign(m.ball, { x: 5, y: 1, vy: -1 });
  assert.ok(m.altinhaAction("style"));
  assert.equal(m.altinhaAction("style"), false);
  tick(m, 120);
  assert.equal(m.altinha.points, 0);
  assert.ok(["failed", "ready"].includes(m.altinha.phase));
  m.physics.dispose();
});
test("ground ends attempt and resets points/combo; record persists through retry and a new match", () => {
  const previous = globalThis.localStorage,
    values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  try {
    const m = game();
    touch(m);
    const best = m.altinha.points;
    Object.assign(m.ball, { y: 0.12, vy: -3 });
    tick(m, 2);
    assert.equal(m.altinha.phase, "failed");
    assert.equal(m.altinha.points, 0);
    assert.equal(m.altinha.combo, 0);
    assert.equal(m.altinha.lastAttempt, best);
    assert.equal(m.altinhaAction("style"), false);
    tick(m, 170);
    assert.equal(m.altinha.phase, "ready");
    assert.equal(m.altinha.attempt, 2);
    assert.equal(Number(values.get(ALTINHA_RECORD_KEY)), best);
    const next = game();
    assert.equal(next.altinha.best, best);
    next.physics.dispose();
    m.physics.dispose();
  } finally {
    globalThis.localStorage = previous;
  }
});
test("pause freezes ball, queued move and attempt timer", () => {
  const m = game();
  serve(m);
  tick(m, 20);
  m.altinhaAction("style");
  m.mode = "paused";
  const old = JSON.stringify([m.ball, m.altinha, m.elapsed]);
  tick(m, 500);
  assert.equal(JSON.stringify([m.ball, m.altinha, m.elapsed]), old);
  assert.equal(m.altinhaAction("style"), false);
  m.physics.dispose();
});
test("passing transfers movement and actions to the receiver; first-time return stays manual", () => {
  const m = game();
  touch(m, "pass", { x: -1, z: -1 });
  assert.equal(m.selected, 1);
  assert.equal(m.altinha.receiver, 1);
  const old = m.players[0],
    receiver = m.players[1],
    x = receiver.x;
  tick(m, 12);
  assert.ok(m.altinhaAction("pass", { x: 1, z: 1 }));
  for (
    let i = 0;
    i < 240 && m.selected === 1 && m.altinha.phase === "playing";
    i++
  )
    tick(m, 1);
  assert.equal(m.altinha.phase, "playing");
  assert.notEqual(m.selected, 1);
  assert.equal(m.altinha.passes, 2);
  assert.equal(m.altinha.lastTouch.player, 1);
  assert.equal(m.altinha.points, 0);
  const controlled = m.players[m.selected],
    start = controlled.x;
  tick(m, 50, { x: 1 });
  assert.ok(controlled.x > start + 0.2);
  assert.notEqual(controlled, receiver);
  const lastPlayer = m.altinha.lastTouch.player;
  Object.assign(m.ball, { y: 0.12, vy: -3 });
  tick(m, 2);
  tick(m, 170);
  assert.equal(m.selected, lastPlayer);
  assert.equal(m.altinha.receiver, lastPlayer);
  assert.ok(
    Math.hypot(
      m.ball.x - m.players[lastPlayer].x,
      m.ball.z - m.players[lastPlayer].z,
    ) < 0.5,
  );
  assert.equal(m.altinha.phase, "ready");
  m.physics.dispose();
});
test("grounded carrying moves by short touches and follows changes of direction", () => {
  const m = game(),
    p = m.players[0],
    z = p.z;
  tick(m, 240, { x: 1, z: -1 });
  assert.ok(p.x > 1 && p.z < z - 1);
  assert.ok(p.lastDribble);
  assert.ok(Math.sin(p.locomotion.heading) > 0.4);
  tick(m, 240, { x: 0, z: 1 });
  assert.ok(p.z > z - 1.3);
  assert.ok(Math.cos(p.locomotion.heading) > 0.8);
  m.physics.dispose();
});
test("around-the-world first lifts a low ball, then completes a second contact to score", () => {
  const m = game(),
    p = m.players[m.selected];
  serve(m);
  Object.assign(m.ball, { x: p.x, z: p.z - 0.45, y: 1, vy: -1 });
  m.altinhaAction("trick");
  for (let i = 0; i < 120 && m.altinha.pending?.stage !== "orbit"; i++)
    tick(m, 1);
  assert.equal(m.altinha.pending?.stage, "orbit");
  assert.equal(m.altinha.points, 0);
  assert.ok(m.ball.y < 0.6 && m.ball.vy > 0);
  for (let i = 0; i < 160 && !m.altinha.points; i++) tick(m, 1);
  assert.ok(m.altinha.points >= 25);
  m.physics.dispose();
});

test("shoulder control requires surface contact, and cannot hit a distant ball", () => {
  for (const offset of [0.24, 2.4]) {
    const m = game(),
      p = m.players[0];
    serve(m);
    Object.assign(m.ball, {
      x: p.x + Math.cos(p.locomotion.heading) * offset,
      z: p.z - Math.sin(p.locomotion.heading) * offset,
      y: 1.95,
      vy: -0.5,
      vx: 0,
      vz: 0,
    });
    assert.ok(m.altinhaAction("keep"));
    assert.equal(m.altinha.pending.kind, "shoulder");
    for (
      let i = 0;
      i < 150 && !m.altinha.touches && m.altinha.phase === "playing";
      i++
    )
      tick(m, 1);
    if (offset < 1) {
      assert.equal(m.altinha.lastTouch.kind, "shoulder");
      const c = m.altinha.lastTouch.point,
        b = m.ball;
      assert.ok(
        Math.abs(Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) - 0.11) < 1e-6,
      );
    } else assert.equal(m.altinha.touches, 0);
    m.physics.dispose();
  }
});
test("ground pickups alternate styles and only launch after the foot preparation", () => {
  const m = game(),
    styles = [];
  for (let n = 0; n < 3; n++) {
    assert.ok(m.altinhaAction("keep"));
    assert.equal(m.altinha.phase, "serving");
    styles.push(m.altinha.pickup.pickup);
    const lift = m.altinha.pickup.liftAt;
    tick(m, Math.floor((lift - 0.03) * 120));
    assert.equal(m.ball.y, 0.11);
    assert.equal(m.ball.vy, 0);
    tick(m, 6);
    assert.equal(m.altinha.phase, "playing");
    assert.ok(m.ball.vy > 0);
    Object.assign(m.ball, { y: 0.12, vy: -3 });
    tick(m, 2);
    tick(m, 170);
  }
  assert.equal(new Set(styles).size, 3);
  m.physics.dispose();
});

test("head and shoulder auto-adjust a short distance and crouch into real contact", () => {
  for (const kind of ["head", "shoulder"]) {
    const m = game(),
      p = m.players[0],
      origin = { x: p.x, z: p.z };
    m.altinha.phase = "playing";
    Object.assign(m.ball, {
      x: p.x - (kind === "head" ? 0.35 : 0.6),
      z: p.z - 0.08,
      y: kind === "head" ? 2.05 : 1.95,
      vy: -1,
      vx: 0,
      vz: 0,
    });
    assert.ok(m.altinhaAction("style", kind === "head" ? {} : { x: 1 }));
    let duck = 0;
    for (let i = 0; i < 100 && !m.altinha.touches; i++) {
      tick(m, 1);
      duck = Math.max(duck, p.altinhaPose?.crouch || 0);
    }
    assert.equal(m.altinha.lastTouch?.kind, kind);
    assert.ok(Math.hypot(p.x - origin.x, p.z - origin.z) > 0.08);
    assert.ok(duck > 0.04 && duck <= 0.26);
    const c = m.altinha.lastTouch.point;
    assert.ok(
      Math.abs(
        Math.hypot(m.ball.x - c.x, m.ball.y - c.y, m.ball.z - c.z) - 0.11,
      ) < 1e-6,
    );
    m.physics.dispose();
  }
});
test("body assistance does not retrieve a distant ball and manual movement takes priority", () => {
  for (const input of [{}, { x: 1 }]) {
    const m = game(),
      p = m.players[0];
    m.altinha.phase = "playing";
    Object.assign(m.ball, { x: -2, z: p.z, y: 2.4, vy: 0, vx: 0, vz: 0 });
    m.altinhaAction("style");
    tick(m, 45, input);
    assert.equal(m.altinha.touches, 0);
    assert.ok(input.x ? p.x > 0.2 : p.x === 0);
    m.physics.dispose();
  }
});
test("charged passes release on button-up, cancel safely, and stronger balls fly higher and farther", () => {
  const flights = [];
  for (const frames of [0, 42, 108]) {
    const m = game(),
      p = m.players[0];
    m.altinha.phase = "playing";
    // Hold while ball is safely airborne, then present the same contact fixture.
    Object.assign(m.ball, {
      x: p.x,
      z: p.z - 0.45,
      y: 2.7,
      vy: 5,
      vx: 0,
      vz: 0,
    });
    assert.ok(m.altinhaAction("pass-start"));
    tick(m, frames);
    assert.equal(m.altinha.pending, null);
    assert.equal(m.altinha.passes, 0);
    Object.assign(m.ball, { y: 1.05, vy: -1 });
    assert.ok(m.altinhaAction("pass-release", { x: -1, z: -1 }));
    for (let i = 0; i < 100 && !m.altinha.passes; i++) tick(m, 1);
    assert.equal(m.altinha.passes, 1);
    assert.equal(m.selected, 1);
    const origin = { x: m.ball.x, z: m.ball.z };
    let peak = m.ball.y;
    for (let i = 0; i < 240 && (m.ball.vy > 0 || m.ball.y > 0.65); i++) {
      tick(m, 1);
      peak = Math.max(peak, m.ball.y);
    }
    flights.push({
      peak,
      distance: Math.hypot(m.ball.x - origin.x, m.ball.z - origin.z),
      power: m.altinha.lastPass.power,
    });
    m.physics.dispose();
  }
  assert.ok(
    flights[0].peak < flights[1].peak && flights[1].peak < flights[2].peak,
  );
  assert.ok(
    flights[0].distance < flights[1].distance &&
      flights[1].distance < flights[2].distance,
  );
  const m = game();
  serve(m);
  assert.ok(m.altinhaAction("pass-start"));
  m.mode = "paused";
  m.altinhaAction("pass-cancel");
  m.mode = "playing";
  assert.equal(m.altinhaAction("pass-release"), false);
  assert.equal(m.altinha.charge, 0);
  m.altinhaAction("pass-start");
  Object.assign(m.ball, { y: 0.12, vy: -3 });
  tick(m, 2);
  assert.equal(m.altinha.charging, null);
  assert.equal(m.altinha.charge, 0);
  m.physics.dispose();
});
test("passes include bounded directional variation instead of always reaching the same point", () => {
  const targets = [];
  for (const roll of [0.05, 0.95]) {
    const m = game();
    m.random = () => roll;
    touch(m, "pass", { x: -1, z: -1, power: 0.8 });
    targets.push(m.altinha.lastPass.target);
    assert.ok(Math.abs(m.altinha.lastPass.error) <= 0.8);
    m.physics.dispose();
  }
  assert.ok(
    Math.hypot(targets[0].x - targets[1].x, targets[0].z - targets[1].z) > 0.6,
  );
});

test("the next attempt starts at the last actual toucher, including a missed pass", () => {
  for (const player of [1, 2, 3]) {
    const m = game();
    m.selected = m.altinha.receiver = player;
    touch(m, "pass");
    assert.notEqual(
      m.selected,
      player,
      "control already moved to the intended receiver",
    );
    Object.assign(m.ball, { y: 0.12, vy: -3 });
    tick(m, 2);
    tick(m, 170);
    assert.equal(m.selected, player);
    assert.equal(m.altinha.receiver, player);
    const p = m.players[player];
    assert.ok(Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 0.5);
    m.altinhaAction("keep");
    tick(m, 90);
    assert.equal(m.altinha.phase, "playing");
    assert.equal(m.selected, player);
    m.physics.dispose();
  }
});

test("late headers bend into a real contact and feed a faster body-height pass", () => {
  for (const receive of ["keep", "style"]) {
    const m = game(),
      p = m.players[0];
    m.altinha.phase = "playing";
    Object.assign(m.ball, {
      x: p.x - 0.6,
      z: p.z - 0.2,
      y: 2.05,
      vy: -1,
      vx: 0,
      vz: 0,
    });
    m.altinhaAction("style");
    for (let i = 0; i < 180 && !m.altinha.passes; i++) tick(m, 1);
    assert.ok(p.altinhaPose.rescue?.fold > 0.4);
    assert.ok(m.altinha.lastPass.driven);
    assert.equal(m.selected, 1);
    assert.ok(Math.hypot(m.ball.vx, m.ball.vz) > 8);
    assert.ok(m.ball.y > 1.1 && m.ball.y < 1.8);
    const c = m.altinha.lastTouch.point;
    assert.ok(
      Math.abs(
        Math.hypot(m.ball.x - c.x, m.ball.y - c.y, m.ball.z - c.z) - 0.11,
      ) < 1e-5,
    );
    tick(m, 8);
    assert.ok(m.altinhaAction(receive));
    for (let i = 0; i < 160 && m.altinha.touches < 2; i++) tick(m, 1);
    assert.equal(m.altinha.touches, 2);
    assert.equal(
      m.altinha.lastTouch.kind,
      receive === "keep" ? "chest" : "head",
    );
    assert.equal(m.altinha.phase, "playing");
    m.physics.dispose();
  }
});
test("shoulder freestyle crosses to the other shoulder with two separate physical contacts", () => {
  const m = game(),
    p = m.players[0];
  m.altinha.phase = "playing";
  Object.assign(m.ball, {
    x: p.x - 0.24,
    z: p.z,
    y: 1.95,
    vy: -0.5,
    vx: 0,
    vz: 0,
  });
  m.altinhaAction("style", { x: 1 });
  for (let i = 0; i < 120 && !m.altinha.touches; i++) tick(m, 1);
  assert.equal(m.altinha.touches, 1);
  assert.ok(m.altinha.pending.shoulderReturn);
  const first = m.altinha.lastTouch,
    side = p.altinhaPose.side;
  assert.equal(m.altinha.pending.side, -side);
  for (let i = 0; i < 180 && m.altinha.touches < 2; i++) tick(m, 1);
  assert.equal(m.altinha.touches, 2);
  assert.equal(m.altinha.lastTouch.label, "OMBRO A OMBRO");
  assert.ok(Math.abs(first.point.x - m.altinha.lastTouch.point.x) > 0.15);
  assert.ok(m.altinha.lastTouch.at - first.at > 0.2);
  assert.equal(m.selected, 0);
  m.physics.dispose();
});

test("back-facing aerial passes choose bicycle or high heel; forward-facing ones do not", () => {
  for (const [y, kind] of [
    [2.35, "bicycle"],
    [1.5, "high-heel"],
  ]) {
    const m = game(),
      p = m.players[0];
    m.altinha.phase = "playing";
    p.dx = 0;
    p.dz = 1;
    p.locomotion.heading = 0;
    Object.assign(m.ball, { x: 0, z: p.z - 0.35, y, vy: -0.5, vx: 0, vz: 0 });
    assert.ok(m.altinhaAction("pass", { power: 0.5 }));
    assert.equal(m.altinha.pending.kind, kind);
    for (let i = 0; i < 180 && !m.altinha.passes; i++) tick(m, 1);
    assert.equal(m.altinha.lastTouch?.kind, kind);
    assert.notEqual(m.selected, 0);
    let peak = m.ball.y;
    for (let i = 0; i < 100; i++) {
      tick(m, 1);
      peak = Math.max(peak, m.ball.y);
    }
    assert.ok(peak > 3.8, "a high transfer leaves time for the next trick");
    m.physics.dispose();
  }
  const m = game();
  m.altinha.phase = "playing";
  Object.assign(m.ball, { y: 2.35, vy: -0.5 });
  m.altinhaAction("pass");
  assert.equal(m.altinha.pending.kind, "head");
  m.physics.dispose();
});

test("landing projection follows airborne flight and disappears for possession/ground balls", async () => {
  const { predictLanding } = await import("../src/ball-landing.js");
  const { stepBallMotion } = await import("../src/ball-physics.js");
  for (const surface of ["sand", "grass", "court"]) {
    const ball = {
      x: 1,
      z: 2,
      y: 3,
      vx: 5,
      vz: -2,
      vy: 3,
      spin: 1,
      surface,
      owner: null,
    };
    const projected = predictLanding(ball),
      actual = { ...ball };
    for (let i = 0; i < 720 && actual.y > 0.115; i++)
      stepBallMotion(actual, 1 / 120);
    assert.ok(projected.time > 0.5);
    assert.ok(
      Math.hypot(projected.x - actual.x, projected.z - actual.z) < 0.15,
    );
    assert.equal(ball.y, 3);
    assert.equal(predictLanding({ ...ball, owner: 0 }), null);
    assert.equal(predictLanding({ ...ball, y: 0.11 }), null);
  }
});

test("diving header follows a dropping ball instead of holding the original head height", () => {
  for (const hz of [30, 60, 120])
    for (const vy of [-1, -3]) {
      const m = game();
      m.altinha.phase = "playing";
      Object.assign(m.ball, { x: -1.2, z: 2.6, y: 2.05, vy, vx: 0, vz: 0 });
      m.altinhaAction("style");
      for (let i = 0; i < hz * 2 && !m.altinha.passes; i++)
        m.update(1 / hz, {});
      assert.equal(m.altinha.passes, 1, `${hz}Hz vy=${vy}`);
      const p = m.players[0];
      assert.ok(p.altinhaPose.rescue);
      assert.equal(m.altinha.lastTouch.kind, "head");
      assert.ok(
        p.altinhaPose.until - p.altinhaPose.hitAt > 0.9,
        "leave time to land on the knees and recover",
      );
      assert.ok(m.ball.vy > 0);
      m.physics.dispose();
    }
});

test("ground ball rolls freely between touches and redirects only at the next contact", () => {
  const m = game(),
    p = m.players[0];
  try {
    for (let i = 0; i < 100 && !p.lastDribble; i++) m.update(1 / 120, { x: 1 });
    assert.ok(p.lastDribble);
    const first = p.lastDribble.time;
    const vx = m.ball.vx;
    m.update(1 / 120, { z: 1 });
    assert.equal(p.lastDribble.time, first);
    assert.ok(m.ball.vx > 0 && m.ball.vx < vx);
    assert.ok(Math.abs(m.ball.vz) < 0.001);
    for (let i = 0; i < 240 && p.lastDribble.time === first; i++)
      m.update(1 / 120, { z: 1 });
    assert.ok(p.lastDribble.time > first);
    assert.ok(m.ball.vz > 0);
    assert.ok(Math.abs(m.ball.vx) < 0.001);
  } finally {
    m.physics.dispose();
  }
});
