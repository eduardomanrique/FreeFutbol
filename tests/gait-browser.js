import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/gaits", { recursive: true });
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
  await page.evaluate(() => {
    const s = window.__test.stadium;
    s.savedRender = s.render;
    s.render = () => {};
    window.__test.match.mode = "paused";
    for (const selector of [
      "header",
      "#hud",
      "#controller-status",
      "#performance",
      ".vignette",
    ])
      document.querySelector(selector).hidden = true;
  });
  const results = [];
  for (const [name, input, frames] of [
    ["walk", { x: 0.25 }, 300],
    ["jog", { x: 1 }, 300],
    ["sprint", { x: 1, sprint: true }, 420],
    ["launch", { x: 1, sprint: true }, 50],
  ]) {
    const state = await page.evaluate(
      ({ name, input, frames }) => {
        const { match: m, stadium: s } = window.__test;
        m.start();
        m.mode = "playing";
        m.players.forEach((p) => {
          if (p.id !== 9) {
            p.x = -38;
            p.z = -25 + p.id * 2;
          }
        });
        let min = Infinity,
          max = -Infinity,
          lift = 0,
          contactError = 0;
        const history = [];
        for (let i = 0; i < frames; i++) {
          m.update(1 / 120, input);
          if (i % 2 === 0) {
            s.savedRender(m, 0);
            const p = m.players[9],
              rig = s.rigs[9];
            if (i >= frames - 100)
              for (const leg of rig.legs) {
                const v = leg.toe.position.clone();
                leg.toe.getWorldPosition(v);
                const forward =
                  (v.x - p.x) * Math.sin(p.locomotion.heading) +
                  (v.z - p.z) * Math.cos(p.locomotion.heading);
                min = Math.min(min, forward);
                max = Math.max(max, forward);
                lift = Math.max(lift, v.y);
                if (leg.anchor)
                  contactError = Math.max(
                    contactError,
                    v.distanceTo(leg.anchor),
                  );
              }
          }
          if ([11, 29, 59, 119, 179, 239].includes(i)) {
            const p = m.players[9];
            history.push({
              time: (i + 1) / 120,
              speed: Math.hypot(p.vx, p.vz),
              lean: p.motion.driveLean,
              stride: p.motion.strideScale,
              clip: p.motion.clip.name,
            });
          }
        }
        m.mode = "paused";
        s.savedRender(m, 0);
        const p = m.players[9];
        s.camera.position.set(p.x + 2.7, 2, p.z + 3.7);
        s.camera.lookAt(p.x, 1, p.z);
        s.renderer.render(s.scene, s.camera);
        return {
          name,
          amplitude: max - min,
          lift,
          contactError,
          speed: Math.hypot(p.vx, p.vz),
          motion: p.motion.snapshot(),
          history,
        };
      },
      { name, input, frames },
    );
    await page.screenshot({ path: `output/gaits/${name}.png` });
    results.push(state);
  }
  fs.writeFileSync(
    "output/gaits/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  assert.equal(results[0].motion.clip, "walk");
  assert.equal(results[1].motion.clip, "jog");
  assert.equal(results[2].motion.clip, "sprint");
  assert.ok(results[1].amplitude > results[0].amplitude * 1.35);
  assert.ok(results[2].amplitude > results[0].amplitude * 1.7);
  assert.ok(results[3].motion.driveLean > results[2].motion.driveLean + 0.12);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
