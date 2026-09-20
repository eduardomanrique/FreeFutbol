import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/set-pieces", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    window.setStep = m.update.bind(m);
    m.update = () => {};
    window.setRender = s.render.bind(s);
    s.render = () => {};
  });
  for (const type of ["throw", "corner"]) {
    await page.evaluate((type) => {
      const { match: m, stadium: s } = window.__test;
      m.start();
      m.random = () => 0;
      m.restart(
        0,
        type === "throw" ? 8 : 45,
        30,
        type === "throw" ? "LATERAL" : "ESCANTEIO",
      );
      setStep(1 / 120, {});
      const p = m.players[m.selected];
      setRender(m, 0);
      s.camera.position.set(p.x - 4, 3, p.z - 5);
      s.camera.lookAt(p.x, 1.2, p.z);
      s.renderer.render(s.scene, s.camera);
    }, type);
    await page.screenshot({ path: `output/set-pieces/${type}-ready.png` });
    const r = await page.evaluate((type) => {
      const { match: m, stadium: s } = window.__test;
      m.beginAction(type === "throw" ? "pass" : "lob", { x: -0.3, z: -1 });
      m.releaseAction(0.5);
      for (let i = 0; i < 25; i++) setStep(1 / 120, {});
      const p = m.players[m.setPiece?.taker ?? m.lastKicker];
      setRender(m, 0);
      s.camera.position.set(p.x - 4, 3, p.z - 5);
      s.camera.lookAt(p.x, 1.2, p.z);
      s.renderer.render(s.scene, s.camera);
      return { owner: m.ball.owner, setPiece: m.setPiece };
    }, type);
    await page.screenshot({ path: `output/set-pieces/${type}-motion.png` });
    const result = await page.evaluate(() => {
      const { match: m } = window.__test;
      for (let i = 0; i < 240 && m.setPiece; i++) setStep(1 / 120, {});
      return { setPiece: m.setPiece, lastPass: m.lastPass, ball: m.ball };
    });
    assert.equal(result.setPiece, null);
    assert.ok(result.lastPass);
    assert.ok(result.ball.vz < 0);
  }
  await page.evaluate(() => {
    const m = window.__test.match;
    m.start();
    m.ball.owner = 20;
  });
  await page.keyboard.press("x");
  assert.equal(
    await page.evaluate(() => window.__test.match.lastAction),
    "tackle",
  );
  assert.deepEqual(errors, []);
  await page.close();
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw Error("unsupported");
    };
    screen.orientation.lock = async () => {
      throw Error("unsupported");
    };
  });
  await mobile.goto("http://localhost:5173/?test");
  await mobile.waitForFunction(() => window.__test);
  await mobile.tap("#start-btn");
  await mobile.evaluate(() => {
    window.__test.match.update = () => {};
  });
  const visible = () =>
    mobile
      .locator(".touch-actions button:visible")
      .evaluateAll((buttons) => buttons.map((b) => b.dataset.touch).sort());
  assert.deepEqual(await visible(), ["lob", "pass", "shield", "shoot"]);
  const cdp = await mobile.context().newCDPSession(mobile),
    r = await mobile.locator("[data-touch=shield]").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }],
  });
  assert.equal(
    await mobile.evaluate(
      () => JSON.parse(render_game_to_text()).touch.held.shield,
    ),
    true,
  );
  await mobile.evaluate(() => {
    const m = window.__test.match;
    m.ball.owner = null;
    m.ball.lastTeam = 0;
  });
  await mobile.waitForTimeout(150);
  assert.deepEqual(await visible(), ["lob", "pass", "shield", "shoot"]);
  await mobile.evaluate(() => {
    const m = window.__test.match;
    m.recordBallTouch(m.players[12]);
  });
  await mobile.waitForFunction(
    () => !document.querySelector("[data-touch=tackle]").hidden,
  );
  assert.deepEqual(await visible(), ["switch", "tackle"]);
  assert.equal(
    await mobile.evaluate(
      () => !!JSON.parse(render_game_to_text()).touch.held.shield,
    ),
    false,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile.screenshot({ path: "output/set-pieces/mobile-defending.png" });
  await mobile.evaluate(() => {
    window.__test.match.ball.lastTeam = 0;
  });
  await mobile.waitForFunction(
    () => !document.querySelector("[data-touch=shield]").hidden,
  );
  const rotations = [];
  for (const [width, height] of [
    [844, 390],
    [390, 844],
    [844, 390],
    [390, 844],
    [844, 390],
  ]) {
    await mobile.setViewportSize({ width, height });
    await mobile.waitForFunction(() => {
      const s = window.__test.stadium;
      return (
        Math.abs(s.camera.aspect - 844 / 390) < 0.001 &&
        s.viewWidth === 844 &&
        s.renderer.domElement.clientWidth === 844 &&
        document.body.classList.contains("landscape-fallback") ===
          innerWidth < innerHeight
      );
    });
    rotations.push(
      await mobile.evaluate(() => {
        const { match: m, stadium: s } = window.__test;
        Object.assign(m.ball, { x: 0, z: 0, y: 0.11, vx: 0, vz: 0 });
        s.render(m, 10);
        return {
          aspect: s.camera.aspect,
          width: s.viewWidth,
          height: s.viewHeight,
          distance: s.camera.position.distanceTo(s.look),
          canvasWidth: s.renderer.domElement.clientWidth,
        };
      }),
    );
  }
  for (const r of rotations) {
    assert.ok(Math.abs(r.distance - rotations[0].distance) < 0.001);
    assert.equal(r.width, r.canvasWidth);
  }
  await mobile.screenshot({
    path: "output/set-pieces/mobile-attacking-rotated-back.png",
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/set-pieces/results.json",
    JSON.stringify({ rotations, errors }, null, 2),
  );
  console.log(JSON.stringify({ rotations, errors }));
} finally {
  await browser.close();
}
