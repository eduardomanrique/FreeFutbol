import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/broadcast", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
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
    window.T = await import("/node_modules/three/build/three.module.js");
    window.gait = await import("/src/locomotion.js");
    window.__test.match.mode = "paused";
  });
  const results = [];
  for (const [name, x, z, mobile] of [
    ["midfield", 0, 0, false],
    ["goal", 40, 3, false],
    ["touchline", 5, 27, false],
    ["opposite", -40, -20, false],
    ["mobile", 20, 16, true],
  ]) {
    if (mobile) await page.setViewportSize({ width: 430, height: 850 });
    const r = await page.evaluate(
      ({ x, z }) => {
        const { match: m, stadium: s } = window.__test;
        m.mode = "paused";
        Object.assign(m.ball, { x, z, vx: 12, vz: 0, y: 0.11 });
        const p = m.players[m.selected];
        p.x = x - 0.8;
        p.z = z;
        window.gait.initLocomotion(p);
        const before = s.camera.position.clone();
        s.render(m, 1 / 60);
        const step = s.camera.position.distanceTo(before);
        s.render(m, 3);
        s.camera.updateMatrixWorld();
        const project = (x, z) =>
          new window.T.Vector3(x, 0.11, z).project(s.camera);
        const ball = project(x, z),
          left = project(-46, 0),
          right = project(46, 0);
        return { ball, left, right, step, camera: s.camera.position.clone() };
      },
      { x, z },
    );
    await page.screenshot({ path: `output/broadcast/${name}.png` });
    results.push({ name, ...r });
    assert.ok(Math.abs(r.ball.x) < 0.8 && Math.abs(r.ball.y) < 0.8, name);
    assert.ok(
      Math.abs(r.left.x) > 1 || Math.abs(r.right.x) > 1,
      "must not show entire pitch",
    );
    assert.ok(r.step < 8, "smooth follow");
  }
  fs.writeFileSync(
    "output/broadcast/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.map((r) => r.name), errors }));
} finally {
  await browser.close();
}
