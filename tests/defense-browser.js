import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/defense", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    window.defenseGait = await import("/src/locomotion.js");
    const m = window.__test.match;
    window.defenseStep = m.update.bind(m);
    m.update = () => {};
  });
  const results = [];
  for (const side of [-1, 1]) {
    const result = await page.evaluate((side) => {
      const m = window.__test.match;
      m.start();
      m.random = () => 0;
      const p = m.players[9],
        q = m.players[20];
      for (const r of m.players) {
        Object.assign(r, {
          x: r.team ? 35 : -35,
          z: r.id % 2 ? 25 : -25,
          think: 99,
        });
        window.defenseGait.initLocomotion(r);
      }
      m.selected = 9;
      Object.assign(p, { x: -15, z: 0 });
      Object.assign(q, { x: 35, z: 25, think: 99 });
      Object.assign(m.ball, { owner: 9, lastTeam: 0, x: -14.45, z: 0 });
      window.defenseGait.initLocomotion(p);
      window.defenseGait.initLocomotion(q);
      for (let i = 0; i < 180; i++) window.defenseStep(1 / 120, { x: 1 });
      Object.assign(q, {
        x: p.x + 2,
        z: p.z,
        vx: -3,
        vz: 0,
        dx: -1,
        dz: 0,
        think: 99,
      });
      window.defenseGait.initLocomotion(q);
      q.defensiveTracking = null;
      Object.assign(m.ball, {
        owner: 9,
        lastTeam: 0,
        x: p.x + 0.55,
        z: p.z,
        vx: p.vx,
        vz: 0,
      });
      p.ballMotion = null;
      const before = { x: p.x, z: p.z };
      let lost = false;
      for (let i = 0; i < 200; i++) {
        window.defenseStep(1 / 120, {
          x: Math.SQRT1_2,
          z: side * Math.SQRT1_2,
        });
        lost ||= m.ball.owner !== 9;
      }
      return {
        side,
        lost,
        advance: p.x - before.x,
        lateral: (p.z - before.z) * side,
        separation: Math.hypot(p.x - q.x, p.z - q.z),
        owner: m.ball.owner,
      };
    }, side);
    assert.equal(result.lost, false);
    assert.ok(result.advance > 2);
    assert.ok(result.lateral > 2);
    assert.ok(result.separation > 2);
    results.push(result);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `output/defense/cut-${side}.png` });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/defense/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(results);
} finally {
  await browser.close();
}
