import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/browser", { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args:
    process.platform === "darwin" && process.env.HEADED === "1"
      ? ["--use-angle=metal"]
      : [],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() =>
  Object.defineProperty(navigator, "getGamepads", {
    value: () => [],
    configurable: true,
  }),
);
await page.goto("http://localhost:5173/?test");
await page.waitForFunction(() => window.render_game_to_text);
await page.waitForTimeout(900);
await page.screenshot({ path: "output/browser/home.png" });
await page.click("#nav-controls");
assert.equal(await page.locator("#modal-title").textContent(), "Domine o jogo");
await page.click("#close-modal");
await page.click("#nav-settings");
await page.selectOption("#quality", "medium");
await page.selectOption("#camera", "tactical");
await page.click("#close-modal");
await page.click("#start-btn");
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
assert.equal((await state()).mode, "playing");
const initialX=(await state()).players[9].x;
await page.keyboard.down("ArrowRight");
await page.evaluate(() => window.advanceTime(800));
await page.keyboard.up("ArrowRight");
let s = await state();
assert.ok(s.players[9].x > initialX + .5, JSON.stringify({initialX,player:s.players[9]}));
assert.ok(s.ball.x > .5);
await page.screenshot({ path: "output/browser/gameplay.png" });
await page.keyboard.press("Escape");
let paused = await state();
assert.equal(paused.mode, "paused");
await page.evaluate(() => window.advanceTime(1000));
assert.equal((await state()).time, paused.time);
await page.click("#resume");
await page.evaluate(() => {
  let m = window.__test.match;
  m.start();
  m.mode = "playing";
});
await page.keyboard.press("KeyJ");
await page.evaluate(() => {
  for (let i=0;i<180 && !window.__test.match.lastPass;i++) window.advanceTime(1000/120);
});
s = await state();
assert.equal(s.lastAction, "pass");
assert.ok(s.lastPass && s.ball.owner === null);
// A short unassisted tap can intentionally have no receiver.
if (s.lastPass.target !== null) assert.equal(s.selected, s.lastPass.target);
await page.evaluate(() => {
  let m = window.__test.match;
  m.start();
  m.mode = "playing";
});
await page.keyboard.press("KeyL");
await page.evaluate(() => {
  for (let i=0;i<180 && !window.__test.match.lastPass;i++) window.advanceTime(1000/120);
});
assert.equal((await state()).lastAction, "lob");
await page.evaluate(() => {
  let m = window.__test.match;
  m.start();
  m.mode = "playing";
});
await page.keyboard.down("Space");
await page.evaluate(() => window.advanceTime(500));
assert.ok((await state()).charge > 0.4);
await page.keyboard.up("Space");
await page.evaluate(() => {
  for (let i=0;i<180 && !window.__test.match.lastShot;i++) window.advanceTime(1000/120);
});
s = await state();
assert.equal(s.lastAction, "shoot");
assert.ok(s.lastShot.speed > 20);
assert.equal(s.ball.owner, null);
await page.evaluate(() => {
  // Switching/tackling are defensive actions; a loose shot still belongs to
  // the attacking team until the opponent gains possession.
  const m=window.__test.match;m.ball.owner=12;m.ball.lastTeam=1;
});
await page.keyboard.press("KeyQ");
assert.equal((await state()).lastAction, "switch");
await page.keyboard.press("KeyX");
assert.equal((await state()).lastAction, "tackle");
await page.evaluate(() => {
  let m = window.__test.match;
  Object.assign(m.ball, {
    x: 46.1,
    y: 0.5,
    z: 0,
    vx: 23,
    vz: 0,
    vy: 0,
    owner: null,
  });
  window.advanceTime(20);
});
s = await state();
assert.equal(s.mode, "goal");
assert.equal(s.score[0], 1);
await page.screenshot({ path: "output/browser/goal.png" });
await page.evaluate(() => window.advanceTime(3200));
assert.equal((await state()).mode, "playing");
await page.click("#pause-btn");
await page.click("#pause-settings");
await page.selectOption("#quality", "low");
await page.selectOption("#camera", "broadcast");
await page.click("#close-modal");
assert.equal((await state()).graphics.quality, "low");
await page.evaluate(() => {
  let m = window.__test.match;
  m.elapsed = m.duration - 0.05;
  window.advanceTime(100);
});
assert.equal((await state()).mode, "finished");
assert.equal((await state()).modal, "finished");
await page.click("#restart");
assert.equal((await state()).score[0], 0);
await page.keyboard.press("Escape");
await page.click("#leave");
assert.equal((await state()).mode, "home");
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
await page.screenshot({ path: "output/browser/mobile.png" });
assert.ok(await page.locator("#start-btn").isVisible());
await page.setViewportSize({ width: 1440, height: 900 });
await page.click("#start-btn");
await page.waitForTimeout(1000);
await page.screenshot({ path: "output/browser/final-gameplay.png" });
s = await state();
console.log(
  JSON.stringify(
    {
      result: "passed",
      errors,
      graphics: s.graphics,
      fps: await page.locator("#fps").textContent(),
    },
    null,
    2,
  ),
);
assert.deepEqual(errors, []);
await browser.close();
