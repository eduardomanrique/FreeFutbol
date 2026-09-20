import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/heading", { recursive: true });
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
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    const { initLocomotion } = await import("/src/locomotion.js");
    const step = m.update.bind(m),
      render = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.headingFixture = {
      step,
      setup() {
        m.start();
        m.random = () => 0.5;
        for (const p of m.players) {
          p.x = -35;
          p.z = 25;
          p.think = 99;
          initLocomotion(p);
        }
        const p = m.players[9],
          winger = m.players[7];
        Object.assign(p, { x: 34, z: 0, dx: 1, dz: 0 });
        initLocomotion(p);
        Object.assign(winger, { x: 30, z: -16, dx: 0, dz: 1 });
        initLocomotion(winger);
        m.selected = 7;
        Object.assign(m.ball, {
          x: 30,
          z: -15.4,
          y: 0.11,
          vx: 0,
          vz: 0,
          vy: 0,
          owner: 7,
        });
        m.kickCooldown = 0;
      },
      draw(close = true) {
        render(m, 0);
        if (close) {
          const p = m.players[9];
          s.camera.position.set(p.x + 4, 2.9, p.z + 5.5);
          s.camera.lookAt(p.x, 1.5, p.z);
        }
        s.renderer.render(s.scene, s.camera);
      },
    };
    headingFixture.setup();
    m.beginAction("lob", { x: 4, z: 16 });
    m.releaseAction(0.4);
    for (let i = 0; i < 180 && !m.lastPass; i++) step(1 / 120, {});
    for (let i = 0; i < 180; i++) {
      const p = m.players[9];
      if (
        m.ball.vy < 0 &&
        m.ball.y < 3 &&
        Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 8
      )
        break;
      step(1 / 120, {});
    }
  });
  // Exercise the actual keyboard path for a header after a lofted cross.
  await page.keyboard.down("Space");
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) headingFixture.step(1 / 120, { z: 0.4 });
  });
  await page.keyboard.up("Space");
  const phases = [];
  for (const phase of ["prepare", "contact", "landing", "goal"]) {
    const result = await page.evaluate((phase) => {
      const { match: m } = window.__test,
        p = m.players[9];
      for (let i = 0; i < 180; i++) {
        if (phase === "prepare" && p.header && !p.header.hit) break;
        if (phase === "contact" && m.lastShot?.header) break;
        if (phase === "landing" && m.lastShot?.header && !p.header) break;
        if (phase === "goal" && m.score[0]) break;
        headingFixture.step(1 / 120, {});
      }
      headingFixture.draw(phase !== "goal");
      return {
        phase,
        header: p.header,
        shot: m.lastShot,
        score: m.score,
        owner: m.ball.owner,
      };
    }, phase);
    phases.push(result);
    await page.screenshot({ path: `output/heading/${phase}.png` });
  }
  fs.writeFileSync(
    "output/heading/debug.json",
    JSON.stringify(phases, null, 2),
  );
  assert.ok(phases[0].header);
  assert.equal(phases[1].shot?.style, "header");
  assert.equal(phases[2].header, null);
  assert.equal(phases[3].score[0], 1);
  const jump = await page.evaluate(async () => {
    const { match: m } = window.__test;
    const { initLocomotion } = await import("/src/locomotion.js");
    headingFixture.setup();
    m.selected = 9;
    Object.assign(m.players[9], { x: 34, z: 0, dx: 1, dz: 0 });
    initLocomotion(m.players[9]);
    Object.assign(m.ball, {
      x: 34,
      z: -5,
      y: 2,
      vx: 0,
      vz: 10,
      vy: 2.8,
      spin: 0,
      owner: null,
    });
    m.beginAction("shoot", { z: 0.5 });
    m.releaseAction(0.8);
    for (let i = 0; i < 120 && !(m.players[9].header?.height > 0.15); i++)
      headingFixture.step(1 / 120, {});
    headingFixture.draw();
    return m.players[9].header;
  });
  assert.ok(jump.height > 0.15);
  await page.screenshot({ path: "output/heading/jump.png" });
  const jumpContact = await page.evaluate(() => {
    const { match: m } = window.__test;
    for (let i = 0; i < 120 && !m.lastShot; i++)
      headingFixture.step(1 / 120, {});
    headingFixture.draw();
    return m.lastShot;
  });
  assert.equal(jumpContact?.style, "header");
  await page.screenshot({ path: "output/heading/jump-contact.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/heading/results.json",
    JSON.stringify({ phases, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ goal: phases[3].score, header: phases[1].shot, errors }),
  );
} finally {
  await browser.close();
}
