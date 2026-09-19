import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/dribbling", { recursive: true });
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
  for (const name of [
    "close-control",
    "walk",
    "jog",
    "sprint",
    "cut90",
    "reverse",
    "stop",
    "recover",
    "passing-near",
  ]) {
    await page.evaluate((name) => {
      const { match: m } = window.__test;
      m.start();
      m.random = () => 0;
      m.players.forEach((p) => {
        if (p.id !== 9) {
          p.keeper = true;
          p.x = p.team === 0 ? -43 : 43;
          p.z = -25 + (p.id % 11) * 4.5;
        }
      });
      const p = m.players[9];
      p.x = -22;
      p.z = 0;
      window.gait.initLocomotion(p);
      Object.assign(m.ball, { x: -21.2, z: 0, vx: 0, vz: 0, vy: 0, owner: 9 });
      if (name === "recover") Object.assign(m.ball, { x: -19, vx: 3 });
      if (name === "passing-near")
        Object.assign(m.ball, { owner: null, x: -18, z: 1.05, vx: -12 });
      m.mode = "paused";
      window.dribbleMetrics = {
        touches: [],
        maxD: 0,
        lastTouch: null,
        frames: 0,
      };
    }, name);
    for (const phase of ["launch", "free-roll", "contact", "end"]) {
      const result = await page.evaluate(
        ({ name, phase }) => {
          const { match: m, stadium: s } = window.__test,
            p = m.players[9],
            metrics = window.dribbleMetrics;
          m.mode = "playing";
          const limit = phase === "launch" ? 180 : phase === "end" ? 300 : 160;
          let marked = false;
          for (let i = 0; i < limit; i++) {
            const time = metrics.frames / 120;
            const input =
              name === "close-control"
                ? Math.floor(time / 0.65) % 4 === 0
                  ? { x: 1, jockey: true }
                  : Math.floor(time / 0.65) % 4 === 1
                    ? { z: 1, jockey: true }
                    : Math.floor(time / 0.65) % 4 === 2
                      ? { x: -1, jockey: true }
                      : { z: -1, jockey: true }
                : name === "walk"
                  ? { x: 0.3 }
                  : name === "jog"
                    ? { x: 1 }
                    : name === "recover" || name === "passing-near"
                      ? {}
                      : name === "stop" && time > 2.5
                        ? {}
                        : name === "cut90" && time > 2.5
                          ? { z: 1, sprint: true }
                          : name === "reverse" && time > 2.5
                            ? { x: -1, sprint: true }
                            : { x: 1, sprint: true };
            m.update(1 / 120, input);
            metrics.frames++;
            if (m.lastTouch?.time !== metrics.lastTouch) {
              metrics.lastTouch = m.lastTouch?.time;
              if (m.lastTouch) metrics.touches.push({ ...m.lastTouch });
              if (phase === "contact") {
                marked = true;
                break;
              }
            }
            metrics.maxD = Math.max(
              metrics.maxD,
              Math.hypot(m.ball.x - p.x, m.ball.z - p.z),
            );
            if (
              phase === "free-roll" &&
              m.lastTouch &&
              m.elapsed - m.lastTouch.time > 0.27 &&
              !p.ballMotion
            ) {
              marked = true;
              break;
            }
            if (
              name === "passing-near" &&
              m.ball.owner === 9 &&
              phase === "launch"
            )
              break;
          }
          m.mode = "paused";
          s.savedRender(m, 0);
          s.camera.position.set(p.x + 3.4, 2.2, p.z + 4.8);
          s.camera.lookAt(p.x + 0.6, 0.8, p.z);
          s.renderer.render(s.scene, s.camera);
          return {
            name,
            phase,
            marked,
            owner: m.ball.owner,
            ball: { ...m.ball },
            dribbling: p.dribbleState,
            lastReception: m.lastReception,
            ...metrics,
          };
        },
        { name, phase },
      );
      await page.screenshot({ path: `output/dribbling/${name}-${phase}.png` });
      if (phase === "end") {
        fs.writeFileSync(
          `output/dribbling/${name}-metrics.json`,
          JSON.stringify(result, null, 2),
        );
        assert.equal(result.owner, 9, name);
        if (name !== "passing-near" && name !== "recover")
          assert.ok(result.maxD < 2.25, name);
        if (name === "stop" || name === "recover")
          assert.ok(Math.hypot(result.ball.vx, result.ball.vz) < 0.1, name);
        results.push(result);
      }
    }
  }
  fs.writeFileSync(
    "output/dribbling/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      scenarios: results.map((r) => r.name),
      errors,
    }),
  );
} finally {
  await browser.close();
}
