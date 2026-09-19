import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/interactions", { recursive: true });
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
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    window.gait = await import("/src/locomotion.js");
    const { match: m, stadium: s } = window.__test;
    m.mode = "paused";
    s.originalRender = s.render;
    s.render = () => {};
    for (const sel of [
      "header",
      "#hud",
      "#controller-status",
      "#performance",
      ".vignette",
    ])
      document.querySelector(sel).hidden = true;
  });
  const capture = async (name) => {
    const state = await page.evaluate(() => {
      const { match: m, stadium: s } = window.__test,
        p = m.players[9];
      s.originalRender(m, 0);
      s.camera.position.set(p.x + 2.7, 2, p.z + 3.7);
      s.camera.lookAt(p.x + 0.15, 1, p.z);
      s.renderer.render(s.scene, s.camera);
      return JSON.parse(window.render_game_to_text());
    });
    await page.screenshot({ path: `output/interactions/${name}.png` });
    fs.writeFileSync(
      `output/interactions/${name}.json`,
      JSON.stringify(state, null, 2),
    );
    return state;
  };
  const reset = () =>
    page.evaluate(() => {
      const m = window.__test.match;
      m.resetPlayers();
      m.mode = "paused";
      for (const p of m.players)
        if (p.id !== 9) {
          p.x = -40;
          p.z = -25;
          window.gait.initLocomotion(p);
        }
      const p = m.players[9];
      p.x = 0;
      p.z = 0;
      window.gait.initLocomotion(p);
    });
  await reset();
  await page.evaluate(() => {
    const m = window.__test.match;
    Object.assign(m.ball, {
      x: 1.1,
      z: 0.35,
      y: 0.11,
      vx: -2,
      vz: 0,
      vy: 0,
      spin: 0,
      owner: null,
    });
    m.kickCooldown = 0;
    m.mode = "playing";
    for (let i = 0; i < 8; i++) m.update(1 / 120, { x: 0.3, z: 0.1 });
    m.mode = "paused";
  });
  const reach = await capture("reach");
  assert.ok(reach.locomotion.reaching);
  assert.equal(reach.ball.owner, null);
  await page.evaluate(() => {
    const m = window.__test.match;
    m.mode = "playing";
    for (let i = 0; i < 45; i++) m.update(1 / 120, { x: 0.3, z: 0.1 });
    m.mode = "paused";
  });
  const received = await capture("received");
  assert.equal(received.ball.owner, 9);
  for (const [name, charge] of [
    ["light", 0.1],
    ["strong", 1],
  ]) {
    await reset();
    await page.evaluate((charge) => {
      const m = window.__test.match,
        p = m.players[9];
      m.charging = true;
      m.charge = charge;
      for (let i = 0; i < 300; i++)
        window.gait.stepLocomotion(p, 5.8, 0, 1 / 120, {
          charging: true,
          charge,
        });
      m.ball.x = p.x + 0.8;
      m.ball.z = p.z;
    }, charge);
    await capture(`preparation-${name}`);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Reach/contact and light/strong preparation browser scenarios passed.",
  );
} finally {
  await browser.close();
}
