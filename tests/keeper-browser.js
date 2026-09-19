import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/keeper", { recursive: true });
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
  });
  const results = [];
  for (const z of [-3, 0, 3])
    for (const y of z === 0 ? [1.1] : [0.11, 1.2, 2.2]) {
      await page.evaluate(
        ({ z, y }) => {
          const { match: m } = window.__test;
          m.start();
          m.random = () => 0.5;
          for (const p of m.players) {
            p.x = 0;
            p.z = 20;
            p.think = 99;
            window.gait.initLocomotion(p);
          }
          const p = m.players[11];
          p.x = 43;
          p.z = 0;
          window.gait.initLocomotion(p);
          const speed = z === 0 ? 10 : 20,
            startX = z === 0 ? 38 : 30;
          const time = (42.65 - startX) / speed;
          Object.assign(m.ball, {
            owner: null,
            x: startX,
            z: 0,
            y,
            vx: speed,
            vz: z / time,
            vy: y > 0.2 ? 4.9 * time : 0,
          });
          m.mode = "paused";
        },
        { z, y },
      );
      for (const phase of ["prepare", "contact", "land", "recover"]) {
        const result = await page.evaluate((phase) => {
          const { match: m, stadium: s } = window.__test,
            p = m.players[11];
          m.mode = "playing";
          for (
            let i = 0;
            i <
            (phase === "prepare"
              ? 9
              : phase === "contact"
                ? 120
                : phase === "land"
                  ? 40
                  : 120);
            i++
          ) {
            m.update(1 / 120, {});
            if (phase === "contact" && m.lastSave) break;
          }
          m.mode = "paused";
          s.savedRender(m, 0);
          s.camera.position.set(p.x - 4.8, 2.5, p.z + 5);
          s.camera.lookAt(p.x, 1, p.z);
          s.renderer.render(s.scene, s.camera);
          return {
            save: m.lastSave,
            state: p.goalkeeping,
            score: m.score,
            hands: s.rigs[11].keeperHands,
            shoulders: s.rigs[11].arms.map((a) => {
              const v = s.rigs[11].root.position.clone();
              a.upper.getWorldPosition(v);
              return v;
            }),
          };
        }, phase);
        await page.screenshot({ path: `output/keeper/${z}-${y}-${phase}.png` });
        results.push({ z, y, phase, ...result });
        fs.writeFileSync(
          "output/keeper/results.json",
          JSON.stringify({ results, errors }, null, 2),
        );
        if (phase === "contact") {
          assert.ok(result.save, `save ${z}/${y}`);
          assert.ok(
            result.hands[result.save.hand].error < 0.08,
            "saved hand must match its physical target",
          );
        }
      }
    }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      scenarios: 7,
      errors,
      maxHandError: Math.max(
        ...results.flatMap((r) => r.hands.map((h) => h.error)),
      ),
    }),
  );
} finally {
  await browser.close();
}
