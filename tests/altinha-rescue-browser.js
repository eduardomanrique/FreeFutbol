import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/altinha-rescue", { recursive: true });
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
  await page.click("[data-mode=altinha]");
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.T = await import("/node_modules/three/build/three.module.js");
    window.draw(m, 3);
    await s.playground.userData.vegetationReady;
    window.capture = (p) => {
      window.draw(m, 1 / 120);
      window.advanceTime(0);
      const h = p.locomotion.heading;
      s.camera.position.set(
        p.x + Math.cos(h) * 3 + Math.sin(h) * 2,
        2,
        p.z - Math.sin(h) * 3 + Math.cos(h) * 2,
      );
      s.camera.lookAt(p.x, 1, p.z);
      document.getElementById("event-toast").style.visibility = "hidden";
      s.renderer.render(s.scene, s.camera);
      const c = s.rigs[p.renderId].altinhaBodyContact;
      return {
        error: c?.error,
        distance: c?.actual.distanceTo(
          new T.Vector3(m.ball.x, m.ball.y, m.ball.z),
        ),
        fold: p.altinhaPose?.rescue?.fold,
        kind: m.altinha.lastTouch?.kind,
      };
    };
    window.fixture = () => {
      m.start(180, "normal", false, "altinha");
      m.altinha.phase = "playing";
      m.random = () => 0.5;
    };
  });
  const rescue = await page.evaluate(() => {
    const { match: m } = window.__test;
    window.fixture();
    const p = m.players[0];
    Object.assign(m.ball, { x: -1.2, z: 2.6, y: 2.05, vy: -1, vx: 0, vz: 0 });
    m.altinhaAction("style");
    for (let i = 0; i < 180 && !m.altinha.passes; i++) {
      window.tick(1 / 120, {});
      window.draw(m, 1 / 120);
    }
    return window.capture(p);
  });
  assert.ok(rescue.fold > 0.4);
  assert.ok(rescue.error < 0.035, JSON.stringify(rescue));
  assert.ok(Math.abs(rescue.distance - 0.11) < 0.035);
  await page.screenshot({ path: "output/altinha-rescue/late-header.png" });
  const chest = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 8; i++) window.tick(1 / 120, {});
    m.altinhaAction("keep");
    const p = m.players[m.selected];
    for (let i = 0; i < 160 && m.altinha.touches < 2; i++) {
      window.tick(1 / 120, {});
      window.draw(m, 1 / 120);
    }
    return window.capture(p);
  });
  assert.equal(chest.kind, "chest");
  assert.ok(chest.error < 0.035, JSON.stringify(chest));
  await page.screenshot({ path: "output/altinha-rescue/chest.png" });
  const knees = await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    window.capture(m.players[0]);
    return s.rigs[m.players[0].renderId].legs.map(
      (l) => l.shin.getWorldPosition(new T.Vector3()).y,
    );
  });
  assert.ok(
    knees.every((y) => y > -0.05 && y < 0.35),
    JSON.stringify(knees),
  );
  await page.screenshot({ path: "output/altinha-rescue/knee-landing.png" });

  await page.evaluate(() => {
    const { match: m } = window.__test;
    window.fixture();
    Object.assign(m.ball, {
      x: -0.24,
      z: 2.8,
      y: 1.95,
      vy: -0.5,
      vx: 0,
      vz: 0,
    });
    m.altinhaAction("style", { x: 1 });
  });
  const shoulders = [];
  for (let n = 1; n <= 2; n++) {
    const result = await page.evaluate((n) => {
      const { match: m } = window.__test;
      for (let i = 0; i < 180 && m.altinha.touches < n; i++) {
        window.tick(1 / 120, {});
        window.draw(m, 1 / 120);
      }
      return {
        ...window.capture(m.players[0]),
        side: m.players[0].altinhaPose.side,
        touches: m.altinha.touches,
      };
    }, n);
    assert.equal(result.touches, n);
    assert.equal(result.kind, "shoulder");
    assert.ok(result.error < 0.035, JSON.stringify(result));
    shoulders.push(result);
    await page.screenshot({ path: `output/altinha-rescue/shoulder-${n}.png` });
  }
  assert.equal(shoulders[0].side, -shoulders[1].side);
  for (const [y, kind] of [
    [2.35, "bicycle"],
    [1.5, "high-heel"],
  ]) {
    const aerial = await page.evaluate(
      async ({ y }) => {
        const { match: m, stadium: s } = window.__test;
        window.fixture();
        const p = m.players[0];
        const { initLocomotion } = await import("/src/locomotion.js");
        p.dx = 0;
        p.dz = 1;
        initLocomotion(p);
        Object.assign(m.ball, {
          x: 0,
          z: p.z - 0.35,
          y,
          vy: -0.5,
          vx: 0,
          vz: 0,
        });
        m.altinhaAction("pass", { power: 0.5 });
        for (let i = 0; i < 180 && !m.altinha.passes; i++) {
          window.tick(1 / 120, {});
          window.draw(m, 1 / 120);
        }
        window.capture(p);
        const rig = s.rigs[p.renderId],
          leg = rig.legs[p.altinhaPose.side > 0 ? 0 : 1];
        const foot = (
          p.altinhaPose.kind === "high-heel" ? leg.foot : leg.toe
        ).getWorldPosition(new T.Vector3());
        return {
          kind: m.altinha.lastTouch?.kind,
          gap: foot.distanceTo(new T.Vector3(m.ball.x, m.ball.y, m.ball.z)),
          marker: s.landingMarker.visible,
          point: s.landingPoint,
          finite: rig.bones.every((b) =>
            b.matrixWorld.elements.every(Number.isFinite),
          ),
        };
      },
      { y },
    );
    assert.equal(aerial.kind, kind);
    assert.ok(aerial.finite);
    assert.ok(aerial.gap < 0.22, JSON.stringify(aerial));
    assert.ok(aerial.marker);
    assert.ok(aerial.point.time > 1);
    await page.screenshot({ path: `output/altinha-rescue/${kind}.png` });
    await page.evaluate(() => {
      const { match: m, stadium: s } = window.__test;
      window.draw(m, 1);
      s.renderer.render(s.scene, s.camera);
    });
    await page.screenshot({
      path: `output/altinha-rescue/${kind}-projection.png`,
    });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/altinha-rescue/results.json",
    JSON.stringify({ rescue, chest, shoulders, errors }, null, 2),
  );
  console.log(
    "Late bending header, fast chest-height feed, chest control and opposite-shoulder sequence visually/physically checked.",
  );
} finally {
  await browser.close();
}
