import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/shot-tuning", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    const { initLocomotion } = await import("/src/locomotion.js");
    const step = m.update.bind(m);
    m.update = () => {};
    const render = s.render.bind(s);
    s.render = () => {};
    window.shotFixture = {
      step,
      render,
      setup(back = false) {
        m.start();
        m.random = () => 0.5;
        for (const p of m.players) {
          p.x = -40;
          p.z = -25 + p.id * 0.6;
          p.think = 99;
        }
        const p = m.players[9];
        Object.assign(p, { x: 15, z: 0, dx: back ? -1 : 1, dz: 0 });
        initLocomotion(p);
        Object.assign(m.ball, { owner: 9, x: 15.6, z: 0, vx: 0, vz: 0, vy: 0 });
      },
      draw() {
        render(m, 0);
        s.camera.position.set(m.players[9].x + 5, 3.2, 7);
        s.camera.lookAt(m.players[9].x + 1, 1.3, 0);
        s.renderer.render(s.scene, s.camera);
      },
    };
  });
  const results = [];
  for (const scenario of ["front", "back", "lob"]) {
    const result = await page.evaluate((scenario) => {
      const { match: m } = window.__test,
        f = window.shotFixture;
      f.setup(scenario === "back");
      if (scenario === "lob") {
        m.players[10].x = 20;
        m.players[10].z = 0;
      }
      m.beginAction(scenario === "lob" ? "lob" : "shoot", { x: 1 });
      m.releaseAction(scenario === "lob" ? 0 : 1);
      for (let i = 0; i < 240 && !m.lastShot && !m.lastPass; i++)
        f.step(1 / 120, {});
      const event = m.lastShot || m.lastPass;
      let apex = m.ball.y;
      if (scenario === "lob")
        for (let i = 0; i < 180; i++) {
          f.step(1 / 120, {});
          apex = Math.max(apex, m.ball.y);
          if (m.ball.vy < 0) break;
        }
      f.draw();
      return { scenario, event, apex };
    }, scenario);
    assert.ok(result.event);
    if (scenario === "front") assert.equal(result.event.speed, 27);
    if (scenario === "back")
      assert.ok(Math.abs(result.event.speed - 6.75) < 1e-8);
    if (scenario === "lob") assert.ok(result.apex > 2.2);
    await page.screenshot({ path: `output/shot-tuning/${scenario}.png` });
    results.push(result);
  }
  for (const [key, type] of [
    ["Space", "shoot"],
    ["j", "pass"],
    ["l", "lob"],
    ["i", "through"],
  ]) {
    for (const expired of [false, true]) {
      await page.evaluate(() => {
        const { match: m } = window.__test;
        window.shotFixture.setup();
        Object.assign(m.ball, { owner: null, x: 30, z: 20 });
      });
      await page.keyboard.press(key);
      const result = await page.evaluate(
        ({ expired }) => {
          const { match: m } = window.__test,
            f = window.shotFixture;
          const buffered = m.controls[0].bufferedAction?.type;
          for (let i = 0; i < (expired ? 121 : 12); i++) f.step(1 / 120, {});
          const p = m.players[9];
          Object.assign(m.ball, {
            owner: null,
            x: p.x + 0.4,
            z: p.z,
            vx: 0,
            vz: 0,
            vy: 0,
          });
          for (let i = 0; i < 180 && !m.lastShot && !m.lastPass; i++)
            f.step(1 / 120, {});
          return {
            buffered,
            event: m.lastShot || m.lastPass,
            reception: m.lastReception,
          };
        },
        { expired },
      );
      assert.equal(result.buffered, type);
      if (expired) assert.ok(result.reception);
      else {
        assert.equal(result.reception, null);
        assert.equal(result.event.firstTime, true);
      }
      assert.equal(!!result.event, !expired, `${type} expired=${expired}`);
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/shot-tuning/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log("Shot facing, lob height and keyboard buffer/expiry passed");
} finally {
  await browser.close();
}
