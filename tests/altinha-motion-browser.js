import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/altinha-motion", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.screenshot({ path: "output/altinha-motion/menu.png" });
  assert.equal(await page.locator(".mode-grid [data-mode=altinha]").count(), 1);
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll(".mode-grid button")].map((e) => ({
      w: e.offsetWidth,
      h: e.offsetHeight,
    })),
  );
  assert.ok(menu.every((m) => m.w === menu[0].w && m.h === menu[0].h));
  await page.click("[data-mode=altinha]");
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.T = await import("/node_modules/three/build/three.module.js");
    window.gait = await import("/src/locomotion.js");
    window.draw(m, 3);
    await s.playground.userData.vegetationReady;
    window.draw(m, 3);
  });
  await page.screenshot({ path: "output/altinha-motion/roda.png" });
  // Real keyboard travel, with both axes and a change of heading.
  await page.evaluate(() => (window.__test.match.update = window.tick));
  await page.keyboard.down("KeyW");
  await page.evaluate(() => window.advanceTime(800));
  await page.keyboard.up("KeyW");
  assert.ok(await page.evaluate(() => window.__test.match.players[0].z < 2));
  await page.evaluate(() => (window.__test.match.update = () => {}));
  const trace = await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test,
      p = m.players[0],
      samples = [];
    for (let i = 0; i < 160; i++) {
      window.tick(1 / 120, { x: -0.7, z: -0.7 });
      window.draw(m, 1 / 120);
    }
    const moved = { x: p.x, z: p.z, heading: p.locomotion.heading };
    m.start(180, "normal", false, "altinha");
    m.altinhaAction("keep");
    for (let i = 0; i < 90; i++) window.tick(1 / 120, {});
    Object.assign(m.ball, { y: 1.2, vy: -0.1, vx: 0, vz: 0 });
    m.altinhaAction("trick");
    for (let i = 0; i < 220; i++) {
      window.tick(1 / 120, {});
      window.draw(m, 1 / 120);
      const human = m.players[0],
        rig = s.rigs[human.renderId];
      for (const [legIndex, leg] of rig.legs.entries()) {
        const h = leg.hip.getWorldPosition(new T.Vector3()),
          k = leg.shin.getWorldPosition(new T.Vector3()),
          f = leg.foot.getWorldPosition(new T.Vector3());
        const axis = f.clone().sub(h).normalize(),
          bend = k.clone().sub(h);
        bend.addScaledVector(axis, -bend.dot(axis));
        const forward = leg.hip.userData.kneeForward;
        const hinge = leg.hip.userData.kneeHinge;
        const delta = leg.shin.quaternion
          .clone()
          .multiply(hinge.shinRest.clone().invert());
        const axial = new T.Vector3(delta.x, delta.y, delta.z);
        axial.addScaledVector(hinge.axis, -axial.dot(hinge.axis));
        const a = human.altinhaPose,
          phase =
            (m.elapsed - (a?.orbitAt ?? -10)) / (a?.orbitDuration ?? 0.47);
        const authored =
          a?.kind === "around" &&
          a.stage === "orbit" &&
          a.hitAt == null &&
          legIndex === (a.side > 0 ? 0 : 1);
        samples.push({
          authored,
          phase,
          kneeRise: k.y - h.y,
          toeClearance: leg.toe.getWorldPosition(new T.Vector3()).y - m.ball.y,
          kneeFlex: Math.acos(
            T.MathUtils.clamp(
              k.clone().sub(h).normalize().dot(f.clone().sub(k).normalize()),
              -1,
              1,
            ),
          ),
          twist: axial.length(),
          dot: bend.dot(forward),
          upper: h.distanceTo(k),
          lower: k.distanceTo(f),
        });
      }
    }
    return { moved, samples, points: m.altinha.best };
  });
  assert.ok(trace.moved.x < -0.8 && trace.moved.z < 2);
  assert.ok(trace.points >= 25);
  assert.ok(
    trace.samples.every((v) => v.twist < 1e-6),
    "knee has no axial rotation",
  );
  assert.ok(
    trace.samples.every((v) => v.authored || v.dot >= -1e-5),
    "knees must remain in the anatomical bend hemisphere",
  );
  assert.ok(
    trace.samples.every(
      (v) =>
        Number.isFinite(v.upper) &&
        v.upper > 0.3 &&
        v.upper < 0.65 &&
        v.lower > 0.3 &&
        v.lower < 0.65,
    ),
  );
  const over = trace.samples.filter(
    (v) => v.authored && v.phase > 0.43 && v.phase < 0.57,
  );
  assert.ok(
    over.length > 3 &&
      over.every((v) => v.kneeRise > 0.37 && v.toeClearance > 0.13),
    "raise thigh and clear the ball with the foot",
  );
  const lift = trace.samples.filter(
    (v) => v.authored && v.phase > 0.2 && v.phase < 0.25,
  );
  assert.ok(
    lift.every((v) => v.kneeFlex > 1.95) &&
      over.every((v) => v.kneeFlex > 1.65 && v.kneeFlex < 1.8),
    "thigh lifts while the knee opens only slightly",
  );
  // Show each orbit phase close enough to inspect the knee, without changing gameplay camera.
  await page.evaluate(() => {
    const { match: m } = window.__test;
    m.start(180, "normal", false, "altinha");
    m.altinhaAction("keep");
    for (let i = 0; i < 90; i++) window.tick(1 / 120, {});
    Object.assign(m.ball, { y: 1.2, vy: -0.1 });
    m.altinhaAction("trick");
    for (let i = 0; i < 180 && m.altinha.pending?.stage !== "orbit"; i++)
      window.tick(1 / 120, {});
  });
  for (let phase = 0; phase < 6; phase++) {
    await page.evaluate(() => {
      const { match: m, stadium: s } = window.__test;
      for (let i = 0; i < 8; i++) window.tick(1 / 120, {});
      window.draw(m, 1 / 60);
      const p = m.players[0];
      const h = p.locomotion.heading;
      s.camera.position.set(
        p.x + Math.cos(h) * 3 + Math.sin(h) * 1.8,
        1.9,
        p.z - Math.sin(h) * 3 + Math.cos(h) * 1.8,
      );
      s.camera.lookAt(p.x, 1, p.z);
      document.getElementById("event-toast").style.visibility = "hidden";
      s.renderer.render(s.scene, s.camera);
    });
    await page.screenshot({ path: `output/altinha-motion/orbit-${phase}.png` });
  }
  // Shared solver and cosmetic variants are finite and grounded in every match surface.
  for (const variant of ["match", "street", "sand", "court", "duel"]) {
    const sample = await page.evaluate(async (variant) => {
      const { match: m, stadium: s } = window.__test;
      m.start(180, "normal", false, variant);
      const { tryFlair } = await import("/src/flair.js"),
        p = m.players.find((p) => !p.keeper) ?? m.players[0];
      p.keeper = false;
      p.x = p.z = p.vx = p.vz = 0;
      p.dx = 0;
      p.dz = 1;
      window.gait.initLocomotion(p);
      m.players
        .filter((q) => q !== p)
        .forEach((q) => {
          q.x = 40;
          q.z = 40;
        });
      p.motion.update(p, m, 1 / 60);
      tryFlair(m, p, "receive", 0);
      m.elapsed = 0.25;
      window.draw(m, 1 / 60);
      s.camera.position.set(3, 2.1, 4);
      s.camera.lookAt(0, 0.9, 0);
      s.renderer.render(s.scene, s.camera);
      const rig = s.rigs[p.renderId ?? p.id];
      return {
        flair: p.flair?.kind,
        finite: rig.bones.every((b) =>
          b.matrixWorld.elements.every(Number.isFinite),
        ),
        toes: rig.legs.map((l) => l.toe.getWorldPosition(new T.Vector3()).y),
      };
    }, variant);
    assert.ok(sample.finite);
    assert.ok(sample.flair);
    assert.ok(sample.toes.every((y) => y > -0.08));
    await page.screenshot({ path: `output/altinha-motion/${variant}.png` });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/altinha-motion/trace.json",
    JSON.stringify(trace, null, 2),
  );
  console.log(
    "Menu geometry, free movement, two-stage trick, anatomical knee direction and shared rigs passed.",
  );
} finally {
  await browser.close();
}
