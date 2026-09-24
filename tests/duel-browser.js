import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/duel", { recursive: true });
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
  await page.click('[data-mode="duel"]');
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.draw(m, 0.016);
    await s.playground.userData.vegetationReady;
    window.draw(m, 0.016);
    s.camera.position.set(30, 28, 29);
    s.camera.lookAt(0, 0, 0);
    s.renderer.render(s.scene, s.camera);
  });
  await page.screenshot({ path: "output/duel/park.png" });
  const penalty = await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test,
      { initLocomotion } = await import("/src/locomotion.js");
    const p = m.players[0];
    p.x = -8;
    p.z = 0;
    initLocomotion(p);
    Object.assign(m.ball, {
      owner: null,
      lastTeam: 1,
      x: -7.55,
      z: 0,
      y: 1.2,
      vx: 0,
      vz: 0,
      vy: 0,
    });
    for (let i = 0; i < 2; i++) window.tick(1 / 120, { hands: true });
    window.advanceTime(0);
    window.draw(m, 0.016);
    return m.setPiece;
  });
  assert.equal(penalty.type, "penalty");
  await page.screenshot({ path: "output/duel/penalty.png" });
  const press = await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    m.start();
    m.ball.owner = 20;
    m.ball.lastTeam = 1;
    const selected = m.selected;
    for (let i = 0; i < 60; i++) window.tick(1 / 120, { secondPress: true });
    window.draw(m, 0.016);
    return {
      selected,
      before: selected,
      after: m.selected,
      helper: m.controls[0].secondDefender,
      ring: s.pressRing.visible,
    };
  });
  assert.equal(press.before, press.after);
  assert.ok(press.ring);
  await page.screenshot({ path: "output/duel/press.png" });
  // Keyboard modifier is read by the same input path as the controller modifier.
  await page.evaluate(() => {
    const { match: m } = window.__test;
    m.start();
  });
  await page.keyboard.down("KeyQ");
  await page.keyboard.down("Space");
  await page.evaluate(() => {
    for (let i = 0; i < 24; i++) window.tick(1 / 120, { chip: true });
  });
  await page.keyboard.up("Space");
  await page.keyboard.up("KeyQ");
  const chip = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 360 && !m.lastShot; i++) window.tick(1 / 120, {});
    window.draw(m, 0.016);
    return m.lastShot;
  });
  assert.ok(chip?.chip);
  assert.ok(!chip.mishit);
  await page.screenshot({ path: "output/duel/chip.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/duel/results.json",
    JSON.stringify({ penalty, press, chip, errors }, null, 2),
  );
  // Mobile buttons are discoverable and contextual in the new mode.
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto("http://localhost:5173/?test");
  await mobile.waitForFunction(() => window.__test);
  await mobile.click('[data-mode="duel"]');
  await mobile.click("#start-btn");
  await mobile.evaluate(() => {
    const { match: m } = window.__test;
    m.update = () => {};
  });
  assert.ok(await mobile.locator('[data-touch="chip"]').isVisible());
  await mobile.evaluate(() => {
    const { match: m } = window.__test;
    m.ball.owner = 1;
    m.ball.lastTeam = 1;
    window.advanceTime(0);
  });
  assert.ok(await mobile.locator('[data-touch="hands"]').isVisible());
  assert.ok(!(await mobile.locator('[data-touch="secondPress"]').isVisible()));
  await mobile.screenshot({ path: "output/duel/mobile.png" });
  console.log(
    "Park arena, physical hand penalty, second defender marker, keyboard chip and mobile buttons passed.",
  );
} finally {
  await browser.close();
}
