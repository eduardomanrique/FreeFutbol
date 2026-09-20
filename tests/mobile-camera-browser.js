import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/mobile-camera", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw Error("unsupported");
    };
    screen.orientation.lock = async () => {
      throw Error("unsupported");
    };
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.tap("#start-btn");
  await page.evaluate(() => {
    window.__test.match.update = () => {};
  });
  const results = [];
  for (const rotated of [false, true]) {
    if (rotated) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() =>
        document.body.classList.contains("landscape-fallback"),
      );
    }
    for (const mode of ["broadcast", "tactical"]) {
      const r = await page.evaluate(async (mode) => {
        const { match: m, stadium: s } = window.__test;
        const T = await import("/node_modules/three/build/three.module.js");
        s.cameraMode = mode;
        Object.assign(m.ball, { x: -40, z: -25, y: 0.11, vx: 0, vz: 0 });
        s.render(m, 10);
        let maxX = 0,
          maxY = 0,
          maxStep = 0;
        const before = s.camera.position.clone();
        for (let i = 0; i <= 120; i++) {
          const u = i / 120;
          Object.assign(m.ball, {
            x: -40 + 84 * u,
            z: -25 + 54 * u,
            y: 0.11 + 7 * Math.sin(Math.PI * u),
            vx: 42,
            vz: 27,
          });
          s.render(m, 1 / 60);
          s.camera.updateMatrixWorld();
          const projected = new T.Vector3(m.ball.x, m.ball.y, m.ball.z).project(
            s.camera,
          );
          maxX = Math.max(maxX, Math.abs(projected.x));
          maxY = Math.max(maxY, Math.abs(projected.y));
          maxStep = Math.max(maxStep, s.camera.position.distanceTo(before));
          before.copy(s.camera.position);
        }
        m.ball.vx = m.ball.vz = 0;
        for (let i = 0; i < 60; i++) s.render(m, 1 / 60);
        return { mode, maxX, maxY, maxStep, aspect: s.camera.aspect };
      }, mode);
      assert.ok(r.maxX < 0.75 && r.maxY < 0.65, JSON.stringify(r));
      assert.ok(r.maxStep < 2);
      results.push({ rotated, ...r });
      await page.screenshot({
        path: `output/mobile-camera/${rotated ? "rotated" : "landscape"}-${mode}.png`,
      });
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/mobile-camera/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser.close();
}
