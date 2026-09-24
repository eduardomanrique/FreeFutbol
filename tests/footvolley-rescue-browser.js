import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
fs.mkdirSync("output/footvolley-rescue", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.selectOption("#game-mode", "futevolei");
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const m = window.__test.match;
    const { initLocomotion } = await import("/src/locomotion.js");
    m.footvolley.phase = "rally";
    m.selected = 0;
    const p = m.players[0];
    Object.assign(p, { x: -8, z: 0, dx: 1, dz: 0 });
    initLocomotion(p);
    Object.assign(m.ball, { x: -4.2, z: 0, y: 2, vy: -1, vx: 0, vz: 0 });
    window.rescueTick = m.update.bind(m);
    m.update = () => {};
  });
  await page.keyboard.press("KeyJ");
  const saved = await page.evaluate(() => {
    const m = window.__test.match;
    for (
      let i = 0;
      i < 120 && !m.lastTouch && m.footvolley.phase === "rally";
      i++
    )
      window.rescueTick(1 / 120, {});
    return m.lastTouch;
  });
  assert.ok(saved.rescue);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const { stadium: s } = window.__test;
    if (!window.rescueRender) {
      window.rescueRender = s.render.bind(s);
      s.render = (m, dt) => {
        window.rescueRender(m, dt);
        const p = m.players[0];
        s.camera.position.set(p.x + 2, 2.4, p.z + 4);
        s.camera.lookAt(p.x, 0.8, p.z);
        s.renderer.render(s.scene, s.camera);
      };
    }
    s.render(window.__test.match, 0.016);
  });
  await page.screenshot({ path: "output/footvolley-rescue/contact.png" });
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.rescueTick(1 / 120, {});
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const { stadium: s } = window.__test;
    if (!window.rescueRender) {
      window.rescueRender = s.render.bind(s);
      s.render = (m, dt) => {
        window.rescueRender(m, dt);
        const p = m.players[0];
        s.camera.position.set(p.x + 2, 2.4, p.z + 4);
        s.camera.lookAt(p.x, 0.8, p.z);
        s.renderer.render(s.scene, s.camera);
      };
    }
    s.render(window.__test.match, 0.016);
  });
  await page.screenshot({ path: "output/footvolley-rescue/landing.png" });
  const selected = await page.evaluate(() => window.__test.match.selected);
  assert.equal(selected, 1);
  assert.deepEqual(errors, []);
  console.log({ saved, selected, errors });
} finally {
  await browser.close();
}
