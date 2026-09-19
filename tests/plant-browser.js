import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/plant", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    window.gait = await import("/src/locomotion.js");
    const { match: m, stadium: s } = window.__test;
    m.mode = "paused";
    s.savedRender = s.render;
    s.render = () => {};
  });
  const results = [];
  for (const type of ["pass", "lob", "shoot"]) {
    await page.evaluate((type) => {
      const { match: m } = window.__test;
      m.start();
      m.players.forEach((q) => {
        if (q.id !== 9) {
          q.keeper = true;
          q.x = q.team === 0 ? -43 : 43;
          q.z = -25 + (q.id % 11) * 4.5;
        }
      });
      const p = m.players[9];
      p.x = -22;
      p.z = 0;
      window.gait.initLocomotion(p);
      Object.assign(m.ball, { owner: 9, x: -21.6, z: 0, vx: 0, vz: 0, vy: 0 });
      for (let i = 0; i < 60; i++) m.update(1 / 120, { x: 1, sprint: true });
      m.beginAction(type, { x: 1, sprint: true });
      for (let i = 0; i < 24; i++) m.update(1 / 120, { x: 1, sprint: true });
      m.releaseAction(0.45);
      m.mode = "paused";
    }, type);
    for (const stage of ["support-swing", "strike", "contact"]) {
      const r = await page.evaluate((stage) => {
        const { match: m, stadium: s } = window.__test,
          p = m.players[9];
        m.mode = "playing";
        let found = false;
        for (let i = 0; i < 360; i++) {
          m.update(1 / 120, {});
          const plant = p.strikePlant,
            f = plant && p.locomotion.feet[plant.foot];
          if (
            stage === "support-swing"
              ? !!plant
              : stage === "strike"
                ? f?.contact && p.ballMotion?.kind === "strike"
                : m.lastPass || m.lastShot
          ) {
            found = true;
            break;
          }
        }
        m.mode = "paused";
        s.savedRender(m, 0);
        s.camera.position.set(p.x + 3.4, 2.2, p.z + 4.8);
        s.camera.lookAt(p.x + 0.4, 0.8, p.z);
        s.renderer.render(s.scene, s.camera);
        return {
          stage,
          found,
          support: p.strikePlant,
          feet: p.locomotion.feet,
          ball: m.ball,
          state: JSON.parse(window.render_game_to_text()),
        };
      }, stage);
      assert.ok(r.found, `${type} ${stage}`);
      results.push({ type, ...r });
      await page.screenshot({ path: `output/plant/${type}-${stage}.png` });
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/plant/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log("Plant sequence browser passed");
} finally {
  await browser.close();
}
