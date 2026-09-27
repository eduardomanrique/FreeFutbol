import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MotionLibrary,
  MotionController,
  RootMotionWarp,
  timeAtDistance,
} from "../src/motion-matching.js";
import { Match } from "../src/simulation.js";
const bytes = fs.readFileSync("public/assets/athlete/poses.bin");
const library = new MotionLibrary(
  JSON.parse(fs.readFileSync("public/assets/athlete/motion.json")),
  new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  ),
);
test("retargeted database has finite normalized skeletal poses and ordered distance curves", () => {
  assert.equal(library.bones.length, 65);
  for (const clip of library.clips) {
    for (let i = 1; i < clip.distance.length; i++)
      assert.ok(clip.distance[i] >= clip.distance[i - 1]);
    const pose = new Float32Array(library.stride);
    for (let frame = 0; frame < clip.count; frame++) {
      library.sample(clip, frame / clip.fps, pose);
      assert.ok(pose.every(Number.isFinite));
      for (let j = 3; j < pose.length; j += 7)
        assert.ok(Math.abs(Math.hypot(...pose.slice(j, j + 4)) - 1) < 1e-5);
    }
  }
});
test("pose and trajectory search retrieves matching phases, not merely a speed bucket", () => {
  for (const name of ["idle", "walk", "jog", "sprint"]) {
    const clip = library.byName[name];
    for (const frame of [0, Math.floor(clip.count / 2)]) {
      const feature = library.features[clip.start + frame];
      const found = library.search(feature, null);
      assert.equal(found.clip.name, name);
      assert.equal(Math.round(found.time * clip.fps), frame);
    }
  }
});
test("distance curve inversion advances by travelled metres and wraps continuously", () => {
  const clip = library.byName.jog;
  for (let i = 1; i < clip.count; i++) {
    if (clip.distance[i] === clip.distance[i - 1]) continue;
    const d = (clip.distance[i] + clip.distance[i - 1]) / 2;
    assert.ok(Math.abs(timeAtDistance(clip, d) - (i - 0.5) / clip.fps) < 1e-6);
    assert.ok(
      Math.abs(
        timeAtDistance(clip, d + clip.distance.at(-1)) -
          timeAtDistance(clip, d),
      ) < 1e-6,
    );
  }
});
test("root correction reaches the bounded target independently of timestep and leaves no residual delta", () => {
  for (const dt of [1 / 60, 1 / 120, 1 / 240]) {
    const warp = new RootMotionWarp({ x: 0, z: 0 }, { x: 3, z: 4 });
    let x = 0,
      z = 0;
    for (let i = 0; i < Math.ceil(0.3 / dt); i++) {
      const d = warp.step(dt);
      x += d.x;
      z += d.z;
    }
    assert.ok(Math.abs(x - 0.144) < 1e-6 && Math.abs(z - 0.192) < 1e-6);
    assert.deepEqual(warp.step(dt), { x: 0, z: 0 });
    assert.ok(warp.done);
  }
});
test("live match advances gait phase and skeletal inertia; reset recreates animation controllers", () => {
  const m = new Match();
  m.attachMotionLibrary(library);
  m.start();
  const original = m.players[9].motion;
  for (let i = 0; i < 240; i++) m.update(1 / 120, { x: 1, sprint: true });
  assert.ok(original.walkCycle && original.time > 0);
  assert.ok(original.transitions > 0);
  assert.ok(original.pose.every(Number.isFinite));
  assert.ok(m.physics.steps >= 240);
  assert.ok(m.players.every((p) => p.motion instanceof MotionController));
  m.start();
  assert.notEqual(m.players[9].motion, original);
  m.physics.dispose();
});

test("slow control keeps authored walking at its top speed, while running uses jog", () => {
  for (const closeControl of [true, false]) {
    const m = new Match();
    m.start();
    m.attachMotionLibrary(library);
    const p = m.players[m.selected];
    p.closeControl = closeControl;
    p.vx = 3.55;
    p.vz = 0;
    p.locomotion.ax = 2;
    p.locomotion.az = 0;
    p.locomotion.heading = Math.PI / 2;
    for (let i = 0; i < 120; i++) {
      p.x += p.vx / 120;
      p.motion.update(p, m, 1 / 120);
    }
    assert.equal(p.motion.gait, closeControl ? "walk" : "jog");
    assert.equal(p.motion.clip.name, closeControl ? "walk" : "jog");
    if (closeControl) {
      assert.ok(p.motion.walkBlend > 0.99);
      assert.ok(p.motion.driveLean < 0.1);
    }
    p.closeControl = false;
    p.vx = 8;
    for (let i = 0; i < 120; i++) {
      p.x += p.vx / 120;
      p.motion.update(p, m, 1 / 120);
    }
    assert.equal(p.motion.clip.name, "sprint");
    assert.ok(p.motion.walkBlend < 0.01);
    m.physics.dispose();
  }
});

test("cruise jog has an upright relaxed presentation distinct from sprint", () => {
  const results = [];
  for (const sprint of [false, true]) {
    const m = new Match();
    m.start();
    m.attachMotionLibrary(library);
    const p = m.players[9];
    p.sprintRequested = sprint;
    p.vx = sprint ? 8 : 5;
    p.vz = 0;
    p.locomotion.ax = 3;
    p.locomotion.az = 0;
    p.locomotion.heading = Math.PI / 2;
    for (let i = 0; i < 120; i++) {
      p.x += p.vx / 120;
      p.motion.update(p, m, 1 / 120);
    }
    results.push(p.motion.snapshot());
    m.physics.dispose();
  }
  assert.equal(results[0].gait, "jog");
  assert.equal(results[1].gait, "sprint");
  assert.ok(results[0].relaxedBlend > 0.65 && results[1].relaxedBlend < 0.05);
  assert.ok(results[0].driveLean < results[1].driveLean * 0.7);
});

test("a freshly placed moving player has a finite gait before its first locomotion tick", async () => {
  const { initLocomotion } = await import("../src/locomotion.js");
  const m = new Match();
  m.attachMotionLibrary(library);
  m.start();
  try {
    const p = m.players[9];
    Object.assign(p, { vx: 0.25, vz: 0, dribbleIntent: { x: 9, z: 0 } });
    initLocomotion(p); // throw-in/goal-kick placement renders in this state
    p.motion.update(p, m, 1 / 120);
    assert.ok(Number.isFinite(p.motion.time));
    assert.ok(p.motion.feature.contacts);
    assert.ok(p.motion.pose.every(Number.isFinite));
  } finally {
    m.physics.dispose();
  }
});

test("street restarts keep every animation finite through repeated movement and shots", () => {
  let seed = 2;
  const m = new Match({
    random: () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296,
  });
  m.attachMotionLibrary(library);
  m.start(180, "normal", false, "street");
  try {
    for (let i = 0; i < 1500; i++) {
      const a = (Math.floor(i / 90) * Math.PI) / 4;
      const input = {
        x: Math.cos(a),
        z: Math.sin(a),
        sprint: i % 600 < 400,
        jockey: i % 600 >= 500,
      };
      m.update(1 / 120, input);
      if (i % 500 === 300) m.beginAction("shoot", input);
      if (i % 500 === 330) m.releaseAction(0.5);
      for (const p of m.players) {
        assert.ok(p.motion.feature, `frame ${i}, player ${p.id}`);
        assert.ok(Number.isFinite(p.motion.time));
        assert.ok(p.motion.pose.every(Number.isFinite));
      }
    }
  } finally {
    m.physics.dispose();
  }
});
