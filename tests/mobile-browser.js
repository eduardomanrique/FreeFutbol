import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/mobile", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", { value: () => [] });
    // Exercise unsupported fullscreen/orientation, as on mobile browsers.
    window.fullscreenAttempts = 0;
    window.orientationRequests = [];
    screen.orientation.lock = async (value) => {
      window.orientationRequests.push(value);
      throw Error("unsupported");
    };
    Element.prototype.requestFullscreen = async () => {
      window.fullscreenAttempts++;
      throw Error("unsupported");
    };
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.selectOption("#game-mode", "training");
  await page.screenshot({ path: "output/mobile/home.png" });
  await page.tap("#start-btn");
  await page.waitForTimeout(600);
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal((await state()).touch.enabled, true);
  assert.equal(await page.evaluate(() => window.fullscreenAttempts), 1);
  const cameraRatio = await page.evaluate(() => {
    const { stadium, match } = window.__test;
    stadium.render(match, 10);
    const mobileDistance = stadium.camera.position.distanceTo(stadium.look);
    document.body.classList.remove("mobile");
    stadium.render(match, 10);
    const desktopDistance = stadium.camera.position.distanceTo(stadium.look);
    document.body.classList.add("mobile");
    stadium.render(match, 10);
    return mobileDistance / desktopDistance;
  });
  assert.ok(
    Math.abs(cameraRatio - 0.8) < 0.001,
    "only touch mode gets the closer camera",
  );
  const cdp = await page.context().newCDPSession(page);
  const center = async (selector) => {
    const r = await page.locator(selector).boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const send = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  assert.equal((await state()).touch.rotated, true);
  assert.equal(
    await page.evaluate(() => window.__test.stadium.camera.aspect),
    844 / 390,
  );
  assert.equal(
    await page.evaluate(() => window.orientationRequests[0]),
    "landscape",
  );
  assert.equal(await page.locator(".touch-actions button").count(), 5);
  // Portrait physical screen must still render a landscape game, with correct input.
  const rotatedJoy = await center(".touch-stick");
  await send("touchStart", [{ ...rotatedJoy, id: 1 }]);
  await send("touchMove", [{ x: rotatedJoy.x, y: rotatedJoy.y + 38, id: 1 }]);
  assert.ok((await state()).touch.x > 0.9);
  assert.ok(Math.abs((await state()).touch.z) < 0.01);
  await send("touchEnd", []);
  await page.screenshot({ path: "output/mobile/portrait-fallback.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(200);
  assert.equal((await state()).touch.rotated, false);
  const joy = await center(".touch-stick");
  const initial = await state();
  await send("touchStart", [{ ...joy, id: 1 }]);
  await send("touchMove", [{ x: joy.x + 18, y: joy.y, id: 1 }]);
  assert.equal(!!(await state()).touch.held.sprint, false);
  await send("touchMove", [{ x: joy.x + 38, y: joy.y, id: 1 }]);
  await page.evaluate(() => window.advanceTime(700));
  const moved = await state();
  assert.ok(moved.touch.x > 0.8);
  assert.equal(moved.touch.held.sprint, true);
  assert.ok(
    moved.players[moved.selected].x > initial.players[initial.selected].x + 0.2,
  );
  await send("touchMove", [{ x: joy.x + 20, y: joy.y, id: 1 }]);
  await page.waitForFunction(
    () => !JSON.parse(window.render_game_to_text()).touch.held.sprint,
  );
  assert.equal(!!(await state()).touch.held.sprint, false);
  await send("touchEnd", []);
  assert.equal((await state()).touch.x, 0);
  assert.deepEqual((await state()).touch.held, {});
  for (const action of ["pass", "lob", "through", "shoot"]) {
    await page.evaluate(() => window.__test.match.start(360, "normal", true));
    const button = await center(`[data-touch=${action}]`);
    await send("touchStart", [{ ...button, id: 1 }]);
    await page.evaluate(() => window.advanceTime(250));
    assert.equal((await state()).charging, true, action);
    await send("touchEnd", []);
    await page.evaluate(() => window.advanceTime(750));
    const result = await state();
    assert.equal(result.charging, false, action);
    assert.ok(
      action === "shoot" ? result.lastShot : result.lastPass,
      `${action} makes ball contact`,
    );
  }
  await page.evaluate(() => window.__test.match.start(360, "normal", true));
  const shoot = await center("[data-touch=shoot]");
  await send("touchStart", [{ ...shoot, id: 1 }]);
  await send("touchCancel", []);
  assert.equal((await state()).charging, false);
  assert.equal((await state()).lastShot, null);
  // Opening a modal while holding a finger must cancel rather than release a shot.
  await send("touchStart", [{ ...shoot, id: 1 }]);
  await page.evaluate(() => document.querySelector("#pause-btn").click());
  assert.equal((await state()).charging, false);
  assert.deepEqual((await state()).touch.held, {});
  await send("touchEnd", []);
  await page.tap("#resume");
  const selected = (await state()).selected;
  await page.tap("[data-touch=switch]");
  assert.notEqual((await state()).selected, selected);
  await page.evaluate(() => window.__test.match.start(360, "normal", true));
  for (const [button, action] of [
    ["shoot", "tackle"],
    ["lob", "slide"],
  ]) {
    await page.evaluate(() => {
      const m = window.__test.match;
      m.start(360, "normal", true);
      m.ball.owner = null;
      m.ball.x = m.players[m.selected].x + 5; // Keep free-ball auto-reception out of this input-only fixture.
    });
    await page.tap(`[data-touch=${button}]`);
    assert.equal((await state()).lastAction, action);
  }
  await page.screenshot({ path: "output/mobile/landscape.png" });
  // Movement + charged shot: sprint never needs a third finger.
  await page.evaluate(() => window.__test.match.start(360, "normal", true));
  await send("touchStart", [{ x: joy.x + 38, y: joy.y, id: 1 }]);
  const shootPoint = await center("[data-touch=shoot]");
  await send("touchStart", [
    { x: joy.x + 38, y: joy.y, id: 1 },
    { ...shootPoint, id: 2 },
  ]);
  assert.equal((await state()).charging, true);
  assert.equal((await state()).touch.held.sprint, true);
  await send("touchCancel", []);
  assert.equal((await state()).charging, false);
  assert.deepEqual((await state()).touch.held, {});
  await page.tap("#pause-btn");
  await page.tap("#mobile-fullscreen");
  assert.ok(
    (await page.locator("#fullscreen-help").textContent()).includes(
      "Tela de Início",
    ),
  );
  await page.tap("#leave");
  assert.equal((await state()).touch.rotated, false);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.tap("#start-btn");
  await page.screenshot({ path: "output/mobile/small.png" });
  for (const selector of [
    ".scoreboard",
    "#pause-btn",
    ".touch-stick",
    ".touch-actions",
  ]) {
    const r = await page.locator(selector).boundingBox();
    assert.ok(
      r.x >= 0 && r.y >= 0 && r.x + r.width <= 320 && r.y + r.height <= 568,
      `${selector} fits`,
    );
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/mobile/state.json",
    JSON.stringify({ state: await state(), errors }, null, 2),
  );
  console.log(
    "Mobile landscape, proportional sprint, two-finger shot, charged actions, cancel, pause, fullscreen fallback and small viewport passed",
  );
} finally {
  await browser.close();
}
