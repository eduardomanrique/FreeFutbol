import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/charge", { recursive: true });
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
  for (const name of ["quick", "windup", "overhold"]) {
    const result = await page.evaluate((name) => {
      const { match: m, stadium: s } = window.__test;
      m.start(360, "normal", true);
      const p = m.players[9];
      p.x = -22;
      p.z = 0;
      window.gait.initLocomotion(p);
      Object.assign(m.ball, { owner: 9, x: -21.6, z: 0, vx: 0, vz: 0, vy: 0 });
      m.beginAction("shoot", {});
      if (name === "quick") {
        m.update(1 / 120, {});
        m.releaseAction(0.1);
      }
      for (let i = 0; i < (name === "windup" ? 90 : 250); i++) {
        m.update(1 / 120, {});
        if (m.lastShot) break;
      }
      m.mode = "paused";
      s.savedRender(m, 0);
      s.camera.position.set(p.x + 3.4, 2.2, p.z + 4.8);
      s.camera.lookAt(p.x + 0.4, 0.8, p.z);
      s.renderer.render(s.scene, s.camera);
      return {
        name,
        shot: m.lastShot,
        plant: p.strikePlant,
        feet: p.locomotion.feet,
        state: JSON.parse(window.render_game_to_text()),
      };
    }, name);
    if (name === "windup") {
      assert.equal(result.shot, null);
      assert.ok(result.plant);
      assert.ok(result.feet[result.plant.foot].contact);
      assert.equal(result.feet[1 - result.plant.foot].special, "windup");
    } else {
      assert.ok(result.shot);
      assert.equal(!!result.shot.overcharged, name === "overhold");
    }
    await page.screenshot({ path: `output/charge/${name}.png` });
    results.push(result);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/charge/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, errors }));
} finally {
  await browser.close();
}
