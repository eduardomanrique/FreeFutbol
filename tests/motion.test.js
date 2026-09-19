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
test("live match advances search, skeletal inertia and distance; reset recreates animation controllers", () => {
  const m = new Match();
  m.attachMotionLibrary(library);
  m.start();
  const original = m.players[9].motion;
  for (let i = 0; i < 240; i++) m.update(1 / 120, { x: 1, sprint: true });
  assert.ok(original.searches > 10);
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
