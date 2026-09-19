import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/ball-actions", { recursive: true });
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
  for (const scenario of [
    "dribble",
    "pass",
    "lob",
    "shot",
    "backheel",
    "turn-fall",
    "turn-fall-right",
    "receive-behind",
  ]) {
    await page.evaluate((scenario) => {
      const { match: m } = window.__test;
      m.start();
      m.random = () => 0.5;
      m.players.forEach((p) => {
        if (p.id !== 9) {
          p.x = -38;
          p.z = -25 + p.id * 0.6;
          p.think = 99;
        }
      });
      const p = m.players[9];
      p.x = 0;
      p.z = 0;
      if (scenario === "backheel") {
        p.dx = -1;
        p.dz = 0;
      }
      if (scenario.startsWith("turn-fall")) {
        p.dx = 0;
        p.dz = scenario.endsWith("right") ? -1 : 1;
      }
      window.gait.initLocomotion(p);
      m.ball.x = 0.7;
      m.mode = "paused";
      if (scenario === "receive-behind") {
        Object.assign(m.ball, { owner: null, x: -1.25, z: 0.4, vx: 0 });
      }
      if (scenario !== "dribble" && scenario !== "receive-behind") {
        m.mode = "playing";
        m.beginAction(
          scenario === "pass" ? "pass" : scenario === "lob" ? "lob" : "shoot",
          {},
        );
        if (scenario === "backheel") m.aimAction({ x: -1 });
        if (scenario.startsWith("turn-fall"))
          m.aimAction({ z: scenario.endsWith("right") ? -1 : 1 });
        m.mode = "paused";
      }
    }, scenario);
    for (const [label, frames] of [
      ["prepare", 36],
      ["contact", 0],
      ["follow", 20],
      ["ground", 22],
      ["recover", 95],
    ]) {
      const result = await page.evaluate(
        ({ scenario, label, frames }) => {
          const { match: m, stadium: s } = window.__test,
            p = m.players[9];
          m.mode = "playing";
          if (label === "contact" && m.charging)
            m.releaseAction(
              scenario === "pass" || scenario === "lob" ? 0.2 : 1,
            );
          const limit = label === "contact" ? 180 : frames;
          const previousTouch = m.lastTouch?.time;
          let reached = false;
          for (let i = 0; i < limit; i++) {
            m.update(
              1 / 120,
              scenario === "dribble" ? { x: 1, sprint: true } : {},
            );
            s.savedRender(m, 0);
            if (
              label === "contact" &&
              (m.lastShot ||
                m.lastPass ||
                (m.lastTouch && m.lastTouch.time !== previousTouch) ||
                m.lastReception)
            ) {
              reached = true;
              break;
            }
          }
          m.mode = "paused";
          s.savedRender(m, 0);
          s.camera.position.set(p.x + 3.1, 2.1, p.z + 3.8);
          s.camera.lookAt(p.x + 0.25, 0.85, p.z);
          s.renderer.render(s.scene, s.camera);
          return {
            scenario,
            label,
            reached,
            ...m.snapshot(),
            recovery: p.recovery,
            handSupport: s.rigs[9].handSupport,
            heading: p.locomotion.heading,
          };
        },
        { scenario, label, frames },
      );
      await page.screenshot({
        path: `output/ball-actions/${scenario}-${label}.png`,
      });
      if (scenario.startsWith("turn-fall") && label === "ground") {
        results.push(result);
        console.log("HAND_SUPPORT", JSON.stringify(result.handSupport));
        assert.ok(result.handSupport.error < 0.03, "support palm contact");
        assert.ok(
          result.handSupport.actual.y > 0.02 &&
            result.handSupport.actual.y < 0.085,
        );
      }
      if (label === "contact") {
        assert.ok(result.reached, scenario);
        results.push(result);
        if (scenario === "backheel")
          assert.equal(result.lastShot.style, "backheel");
        if (scenario.startsWith("turn-fall")) assert.ok(result.recovery > 0.9);
      }
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/ball-actions/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      result: "passed",
      scenarios: results.map((r) => r.scenario),
      errors,
    }),
  );
} finally {
  await browser.close();
}
