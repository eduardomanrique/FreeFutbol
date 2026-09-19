import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Match } from "../src/simulation.js";
import { stepLocomotion, initLocomotion } from "../src/locomotion.js";
import { buildAthlete, animateAthlete } from "../src/athlete.js";
const setup = () => {
  const m = new Match();
  m.start();
  return { m, p: m.players[9], rig: buildAthlete(9) };
};
function desired(t) {
  return t < 2
    ? [2.9, 0]
    : t < 4
      ? [5.8, 0]
      : t < 6
        ? [8.5, 0]
        : t < 8
          ? [0, 5.8]
          : t < 10
            ? [-5.8, 0]
            : [0, 0];
}
test("planted feet and rendered shoes stay fixed in field space across walk/run/turn/stop", () => {
  const { m, p, rig } = setup(),
    v = new THREE.Vector3();
  let previous = null,
    maxSlip = 0,
    maxIK = 0,
    contacts = 0;
  for (let i = 0; i < 1440; i++) {
    const [x, z] = desired(i / 120);
    stepLocomotion(p, x, z, 1 / 120);
    animateAthlete(rig, p, m, 1 / 30);
    const l = p.locomotion;
    l.feet.forEach((f, j) => {
      if (f.contact) {
        contacts++;
        rig.legs[j].ankle.getWorldPosition(v);
        maxIK = Math.max(maxIK, v.distanceTo(new THREE.Vector3(f.x, f.y, f.z)));
        if (previous?.[j].contact && previous[j].landings === f.landings) {
          maxSlip = Math.max(
            maxSlip,
            Math.hypot(f.x - previous[j].x, f.z - previous[j].z),
          );
        }
      }
    });
    previous = l.feet.map((f) => ({ ...f }));
  }
  assert.ok(contacts > 700);
  assert.ok(maxSlip < 1e-8, `ground slip ${maxSlip}`);
  assert.ok(maxIK < 0.001, `rendered shoe error ${maxIK}`);
});
test("traction obeys contact and friction; gravity applies in flight", () => {
  const { p } = setup();
  let airborne = 0;
  for (let i = 0; i < 1200; i++) {
    const before = p.locomotion.vy;
    stepLocomotion(p, 8.5, 0, 1 / 120);
    const l = p.locomotion;
    assert.ok(Math.hypot(l.fx, l.fz) <= l.frictionLimit + 1e-6);
    assert.ok(
      l.feet.reduce((n, f) => n + f.normalForce, 0) - l.normalForce < 1e-5,
    );
    if (!l.grounded) {
      airborne++;
      assert.ok(l.fx === 0);
      assert.ok(l.fz === 0);
      assert.ok(Math.abs(l.vy - before + 9.81 / 120) < 1e-8);
    }
    assert.ok(l.height > 0.7 && l.height < 1.3);
  }
  assert.ok(airborne > 50);
});
test("braking and reversing preserve momentum then reach rest with supported weight", () => {
  const { p } = setup();
  for (let i = 0; i < 240; i++) stepLocomotion(p, 8.5, 0, 1 / 120);
  const v = p.vx;
  stepLocomotion(p, -5.8, 0, 1 / 120);
  assert.ok(p.vx > v - 0.4);
  for (let i = 0; i < 360; i++) stepLocomotion(p, 0, 0, 1 / 120);
  assert.ok(Math.hypot(p.vx, p.vz) < 0.02);
  assert.ok(p.locomotion.feet.every((f) => f.contact));
  assert.ok(Math.abs(p.locomotion.normalForce - p.locomotion.mass * 9.81) < 1);
});
test("centre of mass, contact loads and lean respond to accelerating and turning", () => {
  const { p } = setup();
  let leanForward = 0,
    leanSide = 0,
    singleSupport = 0;
  for (let i = 0; i < 480; i++) {
    stepLocomotion(p, i < 240 ? 5.8 : 0, i < 240 ? 0 : 5.8, 1 / 120);
    const l = p.locomotion;
    if (i < 240) leanForward = Math.max(leanForward, l.leanX);
    else leanSide = Math.max(leanSide, l.leanZ);
    if (l.feet.filter((f) => f.normalForce > 1).length === 1) singleSupport++;
  }
  assert.ok(leanForward > 0.1);
  assert.ok(leanSide > 0.1);
  assert.ok(singleSupport > 100);
});
test("render frequency cannot change the simulation or the foot anchors", () => {
  const a = setup(),
    b = setup();
  for (let i = 0; i < 600; i++) {
    const [x, z] = desired(i / 120);
    stepLocomotion(a.p, x, z, 1 / 120);
    stepLocomotion(b.p, x, z, 1 / 120);
    animateAthlete(a.rig, a.p, a.m, 1 / 120);
    if (i % 4 === 0) animateAthlete(b.rig, b.p, b.m, 1 / 30);
  }
  assert.deepEqual(a.p.locomotion, b.p.locomotion);
  assert.equal(a.p.x, b.p.x);
});
test("analog half deflection remains slower after the acceleration transient", () => {
  const a = setup().p,
    b = setup().p;
  for (let i = 0; i < 240; i++) {
    stepLocomotion(a, 2.9, 0, 1 / 120);
    stepLocomotion(b, 5.8, 0, 1 / 120);
  }
  assert.ok(Math.hypot(a.vx, a.vz) < Math.hypot(b.vx, b.vz) * 0.55);
});
test("stationary charge and release keep the support foot planted", () => {
  const { m, p, rig } = setup(),
    sole = new THREE.Vector3(),
    q = new THREE.Quaternion();
  const anchor = { ...p.locomotion.feet[0] };
  for (let i = 0; i < 180; i++) {
    const charging = i < 90;
    p.kick = i === 90 ? 0.48 : Math.max(0, (p.kick || 0) - 1 / 120);
    stepLocomotion(p, 0, 0, 1 / 120, { charging });
    animateAthlete(rig, p, m, 1 / 60);
    const foot = p.locomotion.feet[0];
    assert.ok(foot.contact);
    rig.legs[0].ankle.getWorldPosition(sole);
    assert.ok(
      sole.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z)) < 0.001,
    );
    rig.legs[0].ankle.getWorldQuaternion(q);
    assert.ok(
      new THREE.Vector3(0, 1, 0)
        .applyQuaternion(q)
        .distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-8,
    );
  }
  assert.ok(p.locomotion.feet.every((f) => f.contact));
});

test("sprint launch builds speed over successive steps instead of reaching top speed in one second", () => {
  const p = { id: 9, x: 0, z: 0, vx: 0, vz: 0, dx: 1, dz: 0 };
  const samples = [];
  for (let i = 0; i < 300; i++) {
    stepLocomotion(p, 8.5, 0, 1 / 120);
    if ([29, 59, 119, 239, 299].includes(i))
      samples.push(Math.hypot(p.vx, p.vz));
  }
  assert.ok(samples[0] < 2.2 && samples[1] < 4);
  assert.ok(samples[2] > 5 && samples[2] < 7);
  assert.ok(samples[3] > 8 && samples[4] <= 8.6);
  for (let i = 1; i < samples.length; i++)
    assert.ok(samples[i] > samples[i - 1]);
});
