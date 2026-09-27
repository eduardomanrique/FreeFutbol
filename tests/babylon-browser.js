import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: process.env.HEADED === "1" ? ["--use-angle=metal"] : [],
});
const errors = [];
fs.mkdirSync("output/babylon-review", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [],
      configurable: true,
    }),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto(process.env.GAME_URL || "http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  // Freeze realtime between actions so screenshot/render cost cannot alter fixtures.
  await page.evaluate(() => window.advanceTime(0));
  await page.click("#start-btn");
  let skeletonCount;
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal((await state()).physics.engine, "Havok");
  assert.equal((await state()).graphics.engine, "Babylon.js");
  await page.keyboard.down("ArrowRight");
  await page.evaluate(() => window.advanceTime(700));
  await page.keyboard.up("ArrowRight");
  assert.ok(
    (await state()).players[9].x > 0.1,
    JSON.stringify((await state()).players[9]),
  );
  await page.keyboard.press("Escape");
  assert.equal((await state()).mode, "paused");
  const paused = (await state()).time;
  await page.evaluate(() => window.advanceTime(1000));
  assert.equal((await state()).time, paused);
  await page.click("#resume");
  for (const [key, property] of [
    ["KeyJ", "lastPass"],
    ["KeyL", "lastPass"],
    ["Space", "lastShot"],
  ]) {
    await page.evaluate(() => {
      const m = window.__test.match;
      m.start();
      m.mode = "playing";
      window.advanceTime(0);
    });
    await page.keyboard.down(key);
    await page.evaluate(() => window.advanceTime(200));
    await page.keyboard.up(key);
    const success = await page.evaluate((prop) => {
      const m = window.__test.match;
      for (let i = 0; i < 240 && !m[prop]; i++) m.update(1 / 120, {});
      window.__test.stadium.render(m, 1 / 60);
      return !!m[prop];
    }, property);
    assert.ok(success, `${key} must make physical contact`);
  }
  for (const mode of [
    "match",
    "sand",
    "court",
    "street",
    "duel",
    "altinha",
    "futevolei",
    "match",
  ]) {
    const stats = await page.evaluate((mode) => {
      const { match: m, stadium: s } = window.__test;
      m.start(90, "normal", false, mode);
      window.advanceTime(500);
      s.render(m, 1);
      return {
        mode: m.variant,
        meshes: s.renderer.scene.meshes.length,
        skeletons: s.renderer.scene.skeletons.length,
        canvas: document.querySelectorAll("#world canvas").length,
      };
    }, mode);
    assert.equal(stats.mode, mode);
    assert.equal(stats.canvas, 1);
    skeletonCount ??= stats.skeletons;
    assert.ok(skeletonCount >= 22);
    assert.equal(stats.skeletons, skeletonCount);
    await page.screenshot({ path: `output/babylon-review/${mode}.png` });
  }
  // Compare uploaded native skin matrices with the CPU pose; a static bind pose
  // can look plausible at broadcast distance while silently losing all animation.
  const skinError = await page.evaluate(() => {
    const { stadium: s } = window.__test;
    let maxError = 0,
      animated = false;
    for (const [source, { mesh }] of s.renderer.nodes) {
      if (!source.isSkinnedMesh || !mesh.isEnabled()) continue;
      const uploaded = mesh.skeleton.getTransformMatrices(mesh);
      for (let i = 0; i < source.skeleton.bones.length; i++) {
        const expected = source.bindMatrix
          .clone()
          .fromArray(source.skeleton.boneMatrices, i * 16)
          .premultiply(source.bindMatrixInverse)
          .multiply(source.bindMatrix).elements;
        for (let j = 0; j < 16; j++) {
          maxError = Math.max(
            maxError,
            Math.abs(uploaded[i * 16 + j] - expected[j]),
          );
          if (Math.abs(expected[j] - (j % 5 === 0 ? 1 : 0)) > 0.01)
            animated = true;
        }
      }
    }
    return { maxError, animated };
  });
  assert.ok(skinError.animated);
  assert.ok(skinError.maxError < 0.0001, JSON.stringify(skinError));
  for (const quality of ["high", "medium", "low"])
    await page.evaluate((q) => {
      const s = window.__test.stadium;
      s.setQuality(q);
      s.render(window.__test.match, 0);
    }, quality);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.advanceTime(100));
  await page.screenshot({ path: "output/babylon-review/mobile.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/babylon-review/result.json",
    JSON.stringify({ errors, state: await state() }, null, 2),
  );
  console.log(
    "Babylon/Havok browser: movement, pause, pass, lob, shot, 7 arenas, quality, mobile; no console errors.",
  );
} finally {
  await browser.close();
}
