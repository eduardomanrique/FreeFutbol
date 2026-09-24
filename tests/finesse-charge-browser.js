import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 720 },
  });
  await page.addInitScript(() => {
    window.virtualPads = [];
    Object.defineProperty(navigator, "getGamepads", {
      value: () => window.virtualPads,
    });
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(() => {
    window.virtualPads = [
      {
        id: "Xbox virtual",
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
    const m = window.__test.match;
    window.tick = m.update.bind(m);
    m.update = () => {};
  });
  const charges = [];
  for (const finesse of [false, true]) {
    await page.evaluate((finesse) => {
      const m = window.__test.match;
      m.start(180, "normal", false, "match");
      const b = window.virtualPads[0].buttons[5];
      b.pressed = finesse;
      b.value = finesse ? 1 : 0;
      window.advanceTime(0);
    }, finesse);
    await page.keyboard.down("Space");
    const charge = await page.evaluate((finesse) => {
      const m = window.__test.match;
      for (let i = 0; i < 12; i++) window.tick(1 / 120, { finesse });
      window.advanceTime(0);
      return m.charge;
    }, finesse);
    charges.push(charge);
    await page.keyboard.up("Space");
    const released = await page.evaluate(
      () =>
        window.__test.match.players[window.__test.match.selected].ballAction
          ?.power,
    );
    assert.ok(
      Math.abs(released - charge) < 0.015,
      "release must not bypass the slower bar",
    );
  }
  assert.ok(
    Math.abs(charges[1] / 0.85 - charges[0]) < 0.015,
    JSON.stringify(charges),
  );
  console.log("Finesse UI charge/release:", charges);
} finally {
  await browser.close();
}
