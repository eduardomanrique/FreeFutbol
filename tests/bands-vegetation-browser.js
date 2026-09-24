import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/bands-vegetation", { recursive: true });
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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
  });
  const results = [];
  for (const mode of ["street", "sand", "court", "street"]) {
    const result = await page.evaluate(async (mode) => {
      const { match: m, stadium: s } = window.__test;
      m.start(180, "normal", false, mode);
      window.draw(m, 0.016);
      await s.playground.userData.vegetationReady;
      const leaves = [];
      s.playground.traverse((n) => {
        if (n.userData.sharedVegetation)
          leaves.push({
            map: !!n.material.map,
            normal: !!n.material.normalMap,
            alpha: !!n.material.alphaMap,
            cutoff: n.material.alphaTest,
          });
      });
      const target = s.playground.children.find(
        (n) => n.name === (mode === "sand" ? "textured-palm" : "textured-fern"),
      );
      const { x, y, z } = target.position;
      s.camera.position.set(
        x + (mode === "sand" ? 8 : 3),
        mode === "sand" ? 7 : 2.1,
        z + (mode === "sand" ? 9 : 4),
      );
      s.camera.lookAt(x, mode === "sand" ? 5 : y + 0.4, z);
      s.renderer.render(s.scene, s.camera);
      return {
        mode,
        leaves,
        loaded: s.playground.userData.vegetationLoaded,
        error: s.playground.userData.vegetationError,
      };
    }, mode);
    assert.ok(result.loaded >= 4);
    assert.ok(!result.error);
    assert.ok(
      result.leaves.every(
        (l) => l.map && l.normal && l.alpha && l.cutoff === 0.5,
      ),
    );
    results.push(result);
    await page.screenshot({ path: `output/bands-vegetation/${mode}.png` });
  }
  for (const power of [0.87, 0.96]) {
    await page.evaluate((power) => {
      const { match: m } = window.__test;
      m.start();
      m.beginAction("shoot", {});
      m.charge = power;
      window.advanceTime(0);
    }, power);
    assert.equal(
      await page.locator("#power-label").textContent(),
      power > 0.9 ? "FORÇA EXCESSIVA!" : "CHUTE DE LONGE",
    );
    assert.ok(
      await page
        .locator("#power-wrap")
        .evaluate((n) => n.classList.contains("shot-bands")),
    );
    await page
      .locator("#power-wrap")
      .screenshot({ path: `output/bands-vegetation/bar-${power}.png` });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/bands-vegetation/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    "Vegetation cutouts/maps loaded on all arenas and after revisit; shot bands rendered; no console errors.",
  );
} finally {
  await browser.close();
}
