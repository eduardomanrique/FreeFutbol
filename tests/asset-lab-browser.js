import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
fs.mkdirSync("output/asset-lab", { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: process.env.HEADED === "1" ? ["--use-angle=metal"] : [],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base + "/asset-lab.html?test");
  await page.waitForFunction(() => window.render_game_to_text);
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal((await state()).bones, 65);
  assert.equal((await state()).clips.length, 6);
  await page.evaluate(() => window.advanceTime(300));
  assert.ok(Math.abs((await state()).time - 0.3) < 1e-9);
  await page.click("#play");
  await page.evaluate(() => window.advanceTime(400));
  assert.ok(
    Math.abs((await state()).time - 0.3) < 1e-9,
    "pause preserves time",
  );
  await page.click("#restart");
  assert.equal((await state()).time, 0);
  await page.selectOption("#speed", "0.5");
  await page.click("#play");
  await page.evaluate(() => window.advanceTime(400));
  assert.ok(
    Math.abs((await state()).time - 0.2) < 1e-9,
    "speed scales preview time",
  );
  for (const profile of ["base", "slim", "keeper"]) {
    for (const team of ["0", "1"]) {
      await page.selectOption("#profile", profile);
      await page.selectOption("#kit", team);
      assert.equal((await state()).profile, profile);
      assert.equal((await state()).team, Number(team));
      for (const clip of ["idle", "walk", "jog", "sprint", "impact", "kick"]) {
        await page.selectOption("#clip", clip);
        await page.locator("#timeline").evaluate((el) => {
          el.value = String(Number(el.max) * 0.45);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
        assert.equal((await state()).clip, clip);
        assert.equal((await state()).finitePose, true);
        assert.equal((await state()).playing, false);
      }
    }
  }
  await page.selectOption("#profile", "base");
  await page.selectOption("#kit", "0");
  await page.selectOption("#clip", "kick");
  await page.selectOption("#speed", "1");
  await page.click("#play");
  await page.evaluate(() => window.advanceTime(5000));
  assert.equal(
    (await state()).playing,
    false,
    "non-looping clip stops at final frame",
  );
  await page.click("#play");
  assert.equal((await state()).time, 0, "replay restarts completed clip");
  await page.evaluate(() => window.advanceTime(420));
  await page.check("#skeleton");
  assert.equal((await state()).skeleton, true);
  await page.screenshot({
    path: "output/asset-lab/strike-rig.png",
    fullPage: true,
  });
  await page.uncheck("#skeleton");
  await page.selectOption("#clip", "idle");
  await page.click("#reset-camera");
  await page.screenshot({
    path: "output/asset-lab/desktop.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.click("#export");
  const download = await downloadPromise;
  await download.saveAs("output/asset-lab/review.json");
  const exported = JSON.parse(fs.readFileSync("output/asset-lab/review.json"));
  assert.equal(exported.profile.id, "base");
  assert.equal(exported.inventory.schema, "athlete-v1");
  assert.ok(exported.inventory.assets.length > 0);
  assert.equal(exported.coverage.length, 10);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption("#profile", "keeper");
  await page.selectOption("#kit", "1");
  await page.screenshot({
    path: "output/asset-lab/mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/asset-lab/state.json",
    JSON.stringify(await state(), null, 2),
  );
  // The entry point remains accessible without widening the mobile game header.
  await page.goto(base + "/?test");
  await page.waitForFunction(() => window.render_game_to_text);
  const mobileEntry = page.locator(".lab-mobile-link");
  assert.equal(await mobileEntry.isVisible(), true);
  const box = await mobileEntry.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.screenshot({ path: "output/asset-lab/game-mobile-entry.png" });
  await mobileEntry.click();
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).mode === "asset-lab",
  );
  assert.deepEqual(errors, []);

  // Failed local loading must leave an actionable message and disabled controls.
  const failed = await browser.newPage();
  await failed.route("**/assets/athlete/poses.bin", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await failed.goto(base + "/asset-lab.html");
  await failed.waitForFunction(() =>
    document.querySelector("#loading").textContent.includes("Não foi possível"),
  );
  assert.equal(await failed.locator("#play").isDisabled(), true);
  await failed.close();
  console.log(
    "Asset lab: profiles/kits, six clips, pause/speed/scrub, non-loop replay, skeleton, export, mobile and load failure passed.",
  );
} finally {
  await browser.close();
}
