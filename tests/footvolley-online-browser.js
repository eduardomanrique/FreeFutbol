import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
const errors = [];
fs.mkdirSync("output/footvolley", { recursive: true });
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 720 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(document, "hidden", { get: () => false });
      Object.defineProperty(document, "hasFocus", { value: () => true });
      window.addEventListener(
        "blur",
        (e) => e.stopImmediatePropagation(),
        true,
      );
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:5173/?test");
    await page.waitForFunction(() => window.__test);
    await page.selectOption("#game-mode", "futevolei-online");
    pages.push(page);
  }
  const [a, b] = pages;
  await a.click("#online-create");
  await a.waitForFunction(
    () => document.querySelector("#online-code").textContent.length === 6,
  );
  const code = await a.locator("#online-code").textContent();
  await b.fill("#room-code", code);
  await b.click("#online-join");
  await b.waitForFunction(
    () => document.querySelector("#online-lobby").hidden === false,
  );
  await a.click("#online-ready");
  await b.click("#online-ready");
  await a.waitForFunction(
    () => !document.querySelector("#online-start").disabled,
  );
  await a.screenshot({ path: "output/footvolley/online-lobby.png" });
  await a.click("#online-start");
  for (const p of pages)
    await p.waitForFunction(
      () =>
        window.__test.match.field.footvolley &&
        window.__test.match.mode === "playing",
    );
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(500);
  await a.keyboard.up("KeyW");
  await a.waitForTimeout(2000);
  const states = await Promise.all(
    pages.map((p) =>
      p.evaluate(() => ({
        selected: window.__test.match.selected,
        score: window.__test.match.score,
        phase: window.__test.match.footvolley.phase,
        players: window.__test.match.players.length,
      })),
    ),
  );
  assert.deepEqual(
    states.map((s) => s.selected),
    [0, 2],
  );
  assert.deepEqual(states[0].score, states[1].score);
  await b.screenshot({ path: "output/footvolley/online-rally.png" });
  assert.deepEqual(errors, []);
  console.log(states);
  await a.evaluate(() => window.__test.online?.leave?.());
} finally {
  await browser.close();
}
