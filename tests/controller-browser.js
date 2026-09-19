import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/controller", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: process.platform === "darwin" ? ["--use-angle=metal"] : [],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.virtualPads = [];
    Object.defineProperty(navigator, "getGamepads", {
      value: () => window.virtualPads,
      configurable: true,
    });
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.bringToFront();
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const reset = () =>
    page.evaluate(() => {
      window.__test.match.resetPlayers();
      window.__test.match.mode = "playing";
    });
  const update = (buttons = [], axes = [0, 0], ms = 0) =>
    page.evaluate(
      ({ buttons, axes, ms }) => {
        const p = window.virtualPads[0];
        p.axes = axes;
        p.buttons.forEach((b, i) => {
          b.pressed = buttons.includes(i);
          b.value = b.pressed ? 1 : 0;
        });
        window.advanceTime(ms);
      },
      { buttons, axes, ms },
    );
  await page.evaluate(() => {
    window.virtualPads = [
      {
        id: "8BitDo Ultimate 3mode Xbox (virtual test)",
        index: 0,
        mapping: "standard",
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      },
    ];
    window.advanceTime(0);
  });
  assert.equal((await state()).controller.connected, true);
  assert.match(
    await page.locator("#controller-status").textContent(),
    /conectado/,
  );
  await update([0]);
  assert.equal((await state()).mode, "playing");
  await update([]);
  assert.equal((await state()).lastAction, "");
  await reset();
  await update([], [0.08, -0.08], 300);
  assert.ok(Math.abs((await state()).players[9].x + 1) < 0.1);
  await reset();
  await update([], [0.5, 0], 1200);
  let partial = (await state()).players[9].x;
  await reset();
  await update([], [1, 0], 1200);
  assert.ok((await state()).players[9].x > partial + 0.5);
  await reset();
  await update([7], [1, 0], 400);
  assert.ok((await state()).players[9].stamina < 0.99);
  await update([]);
  await reset();
  await update([0], [0,0], 180);
  assert.equal((await state()).charging,true);
  assert.equal((await state()).lastPass,null);
  await update([], [0,0], 450);
  assert.equal((await state()).lastAction, "pass");
  const recipient = (await state()).selected;
  await update([0]);
  assert.equal((await state()).selected, recipient);
  await update([]);
  await reset();
  await update([1], [0,0], 180);
  assert.equal((await state()).lastPass,null);
  await update([], [0,0], 450);
  assert.equal((await state()).lastAction, "lob");
  await update([]);
  await reset();
  await update([2], [0, 0], 450);
  assert.ok((await state()).charge > 0.45);
  assert.equal((await state()).charging, true);
  assert.equal((await state()).ball.owner, 9);
  await update([], [0, 0], 450);
  assert.equal((await state()).lastAction, "shoot");
  assert.equal((await state()).ball.owner, null);
  await update([4]);
  assert.equal((await state()).lastAction, "switch");
  await update([]);
  await update([2]);
  assert.equal((await state()).lastAction, "tackle");
  await update([]);
  await update([9]);
  assert.equal((await state()).mode, "paused");
  let clock = (await state()).time;
  await update([9], [0, 0], 100);
  assert.equal((await state()).time, clock);
  await update([]);
  await update([0]);
  assert.equal((await state()).mode, "playing");
  await update([]);
  await reset();
  await update([2], [0, 0], 200);
  await page.evaluate(() => {
    window.virtualPads = [];
    window.advanceTime(0);
  });
  assert.equal((await state()).mode, "paused");
  assert.equal((await state()).charge, 0);
  assert.match(await page.locator("#modal-body").textContent(), /desconectado/);
  await page.screenshot({ path: "output/controller/disconnected.png" });
  await page.evaluate(() => {
    window.virtualPads = [
      {
        id: "8BitDo Ultimate 3mode Xbox (virtual test)",
        index: 0,
        mapping: "standard",
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      },
    ];
    window.advanceTime(0);
  });
  await update([0]);
  await update([]);
  assert.equal((await state()).mode, "playing");
  await update([9]);
  await update([]);
  await update([13]);
  await update([]);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "pause-settings",
  );
  await update([0]);
  await update([]);
  assert.equal((await state()).modal, "settings");
  await update([1]);
  await update([]);
  assert.equal((await state()).mode, "playing");
  assert.equal((await state()).charge, 0);
  await reset();
  await update([], [1, 0], 150);
  await update([]);
  await page.screenshot({ path: "output/controller/gameplay.png" });
  await page.evaluate(() => {
    window.virtualPads[0].mapping = "";
    window.advanceTime(0);
  });
  assert.equal((await state()).controller.supported, false);
  await page.click("#pause-btn");
  await page.click("#pause-settings");
  await update([], [0, 0]);
  await page.click("#calibrate-controller");
  await page.waitForFunction(
    () =>
      document.querySelector("#calibration-prompt")?.textContent ===
      "Pressione A",
  );
  // This raw Bluetooth layout deliberately places RT/LT where standard Xbox has Menu/View.
  const rawButtons = [0, 1, 3, 4, 6, 7, 8, 9, 11];
  for (const button of rawButtons) {
    await update([button]);
    await page.waitForTimeout(80);
    await update([]);
    await page.waitForTimeout(80);
  }
  await page.waitForSelector("#calibration-done");
  await page.screenshot({ path: "output/controller/calibrated.png" });
  await page.click("#calibration-done");
  await update([]);
  assert.equal((await state()).controller.supported, true);
  await update([8, 9], [1, 0], 100);
  assert.equal((await state()).mode, "playing");
  await update([]);
  await reset();
  await update([3], [0, 0], 600);
  assert.equal((await state()).ball.owner, 9);
  assert.ok((await state()).charge > 0.6);
  await update([], [0, 0], 450);
  const shot = (await state()).lastShot;
  assert.ok(shot.power > 0.55);
  assert.ok(
    Math.abs(shot.speed - (9 + 36 * Math.pow(shot.power, 1.1))) < 0.001,
  );
  await page.keyboard.down("ArrowRight");
  await page.evaluate(() => window.advanceTime(100));
  await page.keyboard.up("ArrowRight");
  assert.ok((await state()).players[9].vx > 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      errors,
      controller: (await state()).controller,
    }),
  );
} finally {
  await browser.close();
}
