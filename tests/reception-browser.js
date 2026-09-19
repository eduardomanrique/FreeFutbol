import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/reception", { recursive: true });
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
    s.savedRender = s.render;
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
  const results = [];
  for (const [name, b, input, expected] of [
    ["body", { x: 2, z: 0, vx: -28 }, {}, "body"],
    ["near", { x: 2, z: 0.7, vx: -16 }, {}, "near"],
    ["medium", { x: 1.2, z: 0, vx: 0 }, {}, "medium"],
    ["far", { x: 2.1, z: 0, vx: 0 }, {}, "far"],
    ["no-direction", { x: 1.2, z: 0, vx: 0 }, {}, "medium"],
    ["leave-reach", { x: 2.25, z: 0, vx: 0 }, { x: -1, sprint:true }, null],
  ]) {
    const state = await page.evaluate(
      ({ b, input, expected }) => {
        const { match: m, stadium: s } = window.__test;
        m.start();
        m.random = () => 0;
        m.lastReception = null;
        m.players.forEach((p) => {
          p.x = -38;
          p.z = -25 + p.id * 2;
        });
        const p = m.players[9];
        Object.assign(p, { x: 0, z: 0, vx: 0, vz: 0 });
        window.gait.initLocomotion(p);
        Object.assign(m.ball, {
          y: 0.11,
          vy: 0,
          vz: 0,
          spin: 0,
          owner: null,
          ...b,
        });
        m.kickCooldown = 0;
        m.mode = "playing";
        let caught = -1,
          steps = 0,
          maxReach = 0;
        for (let i = 0; i < 240; i++) {
          m.update(1 / 120, input);
          s.savedRender(m, 0);
          maxReach = Math.max(
            maxReach,
            ...p.locomotion.feet.map((f) => Math.hypot(f.x - p.x, f.z - p.z)),
          );
          if (m.ball.owner === 9 && caught < 0) caught = i;
          if (caught >= 0 && i >= caught) break;
          steps = i;
        }
        m.mode = "paused";
        s.savedRender(m, 0);
        s.camera.position.set(p.x + 2.7, 2, p.z + 3.7);
        s.camera.lookAt(p.x, 1, p.z);
        s.renderer.render(s.scene, s.camera);
        return {
          owner: m.ball.owner,
          reception: m.lastReception,
          caught,
          steps,
          maxReach,
          position: { x: p.x, z: p.z },
          speed: Math.hypot(p.vx, p.vz),
        };
      },
      { b, input, expected },
    );
    if (expected) {
      assert.equal(state.owner, 9, name);
      assert.equal(state.reception.kind, expected, name);
    } else assert.equal(state.owner, null, name);
    await page.screenshot({ path: `output/reception/${name}.png` });
    results.push({ name, ...state });
  }
  fs.writeFileSync(
    "output/reception/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
