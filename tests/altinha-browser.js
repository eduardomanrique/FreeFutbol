import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/altinha", { recursive: true });
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
  await page.click('[data-mode="altinha"]');
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.draw(m, 3);
    await s.playground.userData.vegetationReady;
    window.draw(m, 3);
  });
  assert.equal(
    await page.evaluate(() => window.__test.match.players.length),
    4,
  );
  await page.screenshot({ path: "output/altinha/ready.png" });
  await page.keyboard.press("KeyJ");
  assert.equal(
    await page.evaluate(() => window.__test.match.altinha.phase),
    "serving",
  );
  await page.evaluate(() => {
    const m = window.__test.match;
    for (let i = 0; i < 90; i++) window.tick(1 / 120, {});
    Object.assign(m.ball, { x: 0, z: 2.35, y: 1.05, vy: -1, vx: 0, vz: 0 });
  });
  await page.keyboard.press("Space");
  const result = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 100 && !m.altinha.points; i++) window.tick(1 / 120, {});
    for (let i = 0; i < 12; i++) window.tick(1 / 120, {});
    window.advanceTime(0);
    window.draw(m, 0.016);
    return m.altinha;
  });
  assert.ok(result.points > 0);
  await page.screenshot({ path: "output/altinha/style.png" });
  await page.evaluate(() => {
    const { match: m } = window.__test;
    m.altinha.pending = null;
    m.altinha.cooldown = 0;
    Object.assign(m.ball, {
      x: m.players[0].x,
      z: m.players[0].z - 0.48,
      y: 2.5,
      vy: -0.1,
      vx: 0,
      vz: 0,
    });
  });
  await page.keyboard.press("KeyL");
  await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 200 && m.altinha.pending?.stage !== "orbit"; i++)
      window.tick(1 / 120, {});
    for (let i = 0; i < 30; i++) window.tick(1 / 120, {});
    window.advanceTime(0);
    window.draw(m, 0.016);
  });
  await page.screenshot({ path: "output/altinha/trick.png" });
  const record = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 80 && m.altinha.pending; i++) window.tick(1 / 120, {});
    const best = m.altinha.best;
    Object.assign(m.ball, { y: 0.12, vy: -3 });
    window.tick(1 / 120, {});
    window.advanceTime(0);
    window.draw(m, 0.016);
    return { best, phase: m.altinha.phase, points: m.altinha.points };
  });
  assert.equal(record.phase, "failed");
  assert.equal(record.points, 0);
  await page.screenshot({ path: "output/altinha/fail.png" });
  await page.reload();
  await page.waitForFunction(() => window.__test);
  await page.click('[data-mode="altinha"]');
  await page.click("#start-btn");
  assert.equal(
    await page.evaluate(() => window.__test.match.altinha.best),
    record.best,
  );
  await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    m.altinhaAction("keep");
    for (let i = 0; i < 90; i++) window.tick(1 / 120, {});
    const p = m.players[0];
    Object.assign(m.ball, {
      x: p.x,
      z: p.z - 0.45,
      y: 1,
      vy: -1,
      vx: 0,
      vz: 0,
    });
  });
  await page.keyboard.press("KeyK");
  const circle = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 300 && m.selected === 0; i++) {
      window.tick(1 / 120, {});
      window.draw(m, 1 / 120);
    }
    for (let i = 0; i < 12; i++) window.tick(1 / 120, {});
    window.advanceTime(0);
    return { selected: m.selected, receiver: m.altinha.receiver };
  });
  assert.ok(circle.selected > 0);
  assert.equal(circle.selected, circle.receiver);
  // Passes now vary: move the selected receiver under the descending ball
  // before asking for the first-time return, rather than assuming a perfect feed.
  await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 240 && !(m.ball.vy < 0 && m.ball.y < 1.5); i++) {
      const p = m.players[m.selected],
        t = m.altinha.lastPass.target;
      const dx = t.x - p.x,
        dz = t.z - p.z;
      window.tick(1 / 120, {
        x: Math.max(-1, Math.min(1, dx * 3)),
        z: Math.max(-1, Math.min(1, dz * 3)),
      });
      window.draw(m, 1 / 120);
    }
  });
  await page.keyboard.press("KeyK");
  const returned = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 250 && m.altinha.passes < 2; i++) {
      window.tick(1 / 120, {});
      window.draw(m, 1 / 120);
    }
    window.advanceTime(0);
    return m.altinha.passes;
  });
  assert.equal(returned, 2);
  await page.screenshot({ path: "output/altinha/partner.png" });
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://localhost:5173/?test");
  await mobile.waitForFunction(() => window.__test);
  await mobile.click('[data-mode="altinha"]');
  await mobile.click("#start-btn");
  await mobile.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    m.update = () => {};
    s.render(m, 3);
  });
  await mobile.click('[data-touch="keep"]');
  assert.equal(
    await mobile.evaluate(() => window.__test.match.altinha.phase),
    "serving",
  );
  assert.equal(
    await mobile.locator(".touch-actions button:visible").count(),
    4,
  );
  await mobile.screenshot({ path: "output/altinha/mobile.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/altinha/results.json",
    JSON.stringify({ result, record, errors }, null, 2),
  );
  console.log(
    "Circle scene, receiver control transfer, keyboard/style/trick, failure, stored record and mobile controls passed.",
  );
} finally {
  await browser.close();
}
