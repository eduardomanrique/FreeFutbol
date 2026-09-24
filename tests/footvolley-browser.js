import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
fs.mkdirSync("output/footvolley", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click('[data-mode="futevolei"]');
  await page.click("#start-btn");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "output/footvolley/serve.png" });
  assert.equal(
    await page.evaluate(() => window.__test.match.players.length),
    4,
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "output/footvolley/rally.png" });
  const state = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  assert.ok(state.footvolley);
  for (const [key, kind, label] of [
    ["KeyJ", "chest", "pass"],
    ["KeyL", "inside", "set"],
    ["Space", "head", "attack"],
  ]) {
    await page.evaluate(() => {
      const m = window.__test.match;
      m.start(360, "normal", false, "futevolei");
      m.footvolley.phase = "rally";
      m.selected = 0;
      const p = m.players[0];
      p.x = -3;
      p.z = 0;
      p.dx = 1;
      p.dz = 0;
      m.ball.x = -3;
      m.ball.z = 0;
      m.ball.y = 2.7;
      m.ball.vy = -1;
      window.volleyTick = m.update.bind(m);
      m.update = () => {};
    });
    await page.keyboard.press(key);
    const result = await page.evaluate(() => {
      const m = window.__test.match;
      for (
        let i = 0;
        i < 300 && !m.lastTouch && m.footvolley.phase === "rally";
        i++
      )
        window.volleyTick(1 / 120, {});
      return m.lastTouch;
    });
    assert.equal(result?.kind, kind);
    await page.waitForTimeout(50);
    await page.screenshot({ path: `output/footvolley/${label}.png` });
    await page.evaluate(() => {
      window.__test.match.update = window.volleyTick;
    });
  }
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://localhost:5173/?test");
  await mobile.waitForFunction(() => window.__test);
  await mobile.selectOption("#game-mode", "futevolei");
  await mobile.click("#start-btn");
  await mobile.locator('[data-touch="volley-shoot"]').tap();
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: "output/footvolley/mobile.png" });
  assert.equal(
    await mobile.evaluate(() => window.__test.match.footvolley.phase),
    "rally",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/footvolley/state.json",
    JSON.stringify(state, null, 2),
  );
  console.log(state.footvolley.phase, errors);
} finally {
  await browser.close();
}
