import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

fs.mkdirSync("output/session", { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args:
    process.platform === "darwin" && process.env.HEADED === "1"
      ? ["--use-angle=metal"]
      : [],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [],
      configurable: true,
    }),
  );
  await page.goto(
    `${process.env.TEST_BASE_URL || "http://localhost:5173"}/?test`,
  );
  await page.waitForFunction(() => window.render_game_to_text);
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.removeItem("campo-session-save-v1"));
  await page.click("#start-btn");
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal((await state()).mode, "playing");
  assert.equal(
    await page.evaluate(
      () => window.__test.session.match === window.__test.match,
    ),
    true,
  );
  await page.keyboard.down("ArrowRight");
  await page.evaluate(() => window.advanceTime(500));
  await page.keyboard.up("ArrowRight");
  const beforeSave = await state();
  assert.ok(beforeSave.time > 0);

  await page.keyboard.press("Escape");
  assert.equal((await state()).mode, "paused");
  await page.screenshot({ path: "output/session/paused.png" });
  const downloadPromise = page.waitForEvent("download");
  await page.click("#export-replay");
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.json$/);
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  const replay = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
  assert.equal(typeof replay, "object");
  fs.copyFileSync(downloadPath, "output/session/replay.json");
  fs.writeFileSync(
    "output/session/expected-checkpoint.json",
    JSON.stringify(
      await page.evaluate(() => window.__test.session.checkpoint()),
    ),
  );
  const verified = await page.evaluate(
    (replay) => window.__test.verifyReplay(replay),
    replay,
  );
  assert.equal(verified.checksum, replay.final);

  await page.click("#save-game");
  assert.equal((await state()).mode, "home");
  assert.equal(await page.locator("#continue-saved").isVisible(), true);
  assert.ok(
    await page.evaluate(() => localStorage.getItem("campo-session-save-v1")),
  );

  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  await page.waitForTimeout(900);
  assert.equal(await page.locator("#continue-saved").isVisible(), true);
  await page.click("#continue-saved");
  const resumed = await state();
  assert.equal(resumed.mode, "playing");
  assert.ok(resumed.time >= beforeSave.time);
  await page.evaluate(() => window.advanceTime(240));
  assert.ok((await state()).time > resumed.time);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "output/session/restored.png" });
  console.log(
    JSON.stringify({ result: "passed", replay: download.suggestedFilename() }),
  );
} finally {
  await browser.close();
}
