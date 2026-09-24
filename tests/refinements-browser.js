import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/refinements", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 700 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  const result = await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test,
      { initLocomotion } = await import("/src/locomotion.js");
    const update = m.update.bind(m);
    m.update = () => {};
    m.start(180, "normal", false, "sand");
    m.multiplayer = true;
    const p = m.players[m.selected];
    for (const q of m.players) {
      q.x = -12;
      q.z = 8;
      initLocomotion(q);
    }
    Object.assign(p, { x: 0, z: 0, dx: 1, dz: 0 });
    initLocomotion(p);
    Object.assign(m.ball, {
      owner: p.id,
      x: 0.65,
      z: 0,
      y: 0.11,
      vx: 4,
      vz: 0,
      vy: 0,
    });
    for (let i = 0; i < 300; i++) update(1 / 120, {}, {});
    s.render(m, 0.016);
    const result = {
      count: m.players.length,
      shield: p.shield,
      speed: Math.hypot(m.ball.vx, m.ball.vz),
      distance: Math.hypot(m.ball.x - p.x, m.ball.z - p.z),
    };
    window.refineTick = (n) => {
      for (let i = 0; i < n; i++) update(1 / 120, {}, {});
      s.render(m, 0.016);
    };
    return result;
  });
  assert.equal(result.count, 10);
  assert.equal(result.shield, null);
  assert.ok(result.speed < 0.1 && result.distance < 1.15);
  await page.screenshot({ path: "output/refinements/settled-sand.png" });
  const restart = await page.evaluate(() => {
    const { match: m } = window.__test;
    m.start(180, "normal", false, "sand");
    m.multiplayer = true;
    m.restart(0, 3, m.field.halfWidth, "LATERAL");
    const initial = m.players.map((p) => ({ x: p.x, z: p.z }));
    const blocked = m.beginAction("pass", {});
    window.refineTick(120);
    return {
      blocked,
      moved: m.players.some(
        (p, i) => Math.hypot(p.x - initial[i].x, p.z - initial[i].z) > 1,
      ),
      pass: m.lastPass,
    };
  });
  assert.equal(restart.blocked, false);
  assert.ok(restart.moved);
  assert.equal(restart.pass, null);
  await page.screenshot({ path: "output/refinements/reposition.png" });
  const release = await page.evaluate(() => {
    window.refineTick(150);
    const m = window.__test.match;
    const begun = m.beginAction("pass", {});
    m.releaseAction(0.4);
    window.refineTick(100);
    return { begun, piece: m.setPiece, pass: m.lastPass };
  });
  assert.ok(release.begun);
  assert.equal(release.piece, null);
  assert.equal(release.pass.team, 0);
  await page.screenshot({ path: "output/refinements/restarted.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/refinements/results.json",
    JSON.stringify({ result, restart, release, errors }, null, 2),
  );
  console.log(
    "Idle trap, sand 5v5, paused repositioning and restart pass passed.",
  );
} finally {
  await browser.close();
}
