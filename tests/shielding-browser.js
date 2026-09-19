import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/shielding", { recursive: true });
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
  for (const name of ["behind", "side", "front", "escape", "pass"]) {
    await page.evaluate((name) => {
      const { match: m } = window.__test;
      m.start();
      m.random = () => 0;
      for (const p of m.players) {
        p.x = p.team === 0 ? -40 : 40;
        p.z = -24 + (p.id % 11) * 4;
        p.keeper = true;
        p.think = 99;
        window.gait.initLocomotion(p);
      }
      const p = m.players[9],
        q = m.players[20];
      Object.assign(p, { x: 0, z: 0, keeper: false });
      Object.assign(q, {
        x: name === "behind" || name === "pass" ? -1 : name === "side" ? 0 : 1,
        z: name === "side" ? 1 : 0,
        keeper: false,
      });
      window.gait.initLocomotion(p);
      window.gait.initLocomotion(q);
      Object.assign(m.players[10], { x: 0, z: -12 });
      window.gait.initLocomotion(m.players[10]);
      Object.assign(m.ball, { x: 0.6, z: 0, owner: 9 });
      m.mode = "paused";
      window.duelMetrics = {
        owner: 9,
        flips: [],
        touches: [],
        last: null,
        frame: 0,
      };
    }, name);
    for (const end of [60, 180, 360]) {
      const r = await page.evaluate(
        ({ name, end }) => {
          const { match: m, stadium: s } = window.__test,
            p = m.players[9],
            q = m.players[20],
            d = window.duelMetrics;
          m.mode = "playing";
          for (; d.frame < end; d.frame++) {
            if (name === "pass" && d.frame === 60)
              m.beginAction("pass", { z: -1 });
            if (name === "pass" && d.frame === 95) m.releaseAction(0.25);
            m.update(
              1 / 120,
              name === "escape"
                ? { z: -1, sprint: true }
                : name === "pass" && d.frame >= 60 && d.frame < 95
                  ? { z: -1 }
                  : {},
            );
            if (m.ball.owner !== d.owner) {
              d.flips.push({
                time: m.elapsed,
                from: d.owner,
                to: m.ball.owner,
              });
              d.owner = m.ball.owner;
            }
            if (m.lastTouch?.time !== d.last) {
              d.last = m.lastTouch?.time;
              if (m.lastTouch) d.touches.push({ ...m.lastTouch });
            }
          }
          m.mode = "paused";
          s.savedRender(m, 0);
          s.camera.position.set(p.x + 3.4, 2.8, p.z + 4.8);
          s.camera.lookAt(p.x, 0.8, p.z);
          s.renderer.render(s.scene, s.camera);
          return {
            name,
            ...d,
            ball: { ...m.ball },
            p: { x: p.x, z: p.z },
            q: { x: q.x, z: q.z },
            pass: m.lastPass,
          };
        },
        { name, end },
      );
      await page.screenshot({ path: `output/shielding/${name}-${end}.png` });
      if (end === 360) {
        results.push(r);
        fs.writeFileSync(
          "output/shielding/results.json",
          JSON.stringify({ results, errors }, null, 2),
        );
        assert.ok(
          r.touches.some((t) => t.kind === "shield"),
          name,
        );
        for (let i = 1; i < r.flips.length; i++)
          if (r.flips[i - 1].to !== null && r.flips[i].to !== null)
            assert.ok(r.flips[i].time - r.flips[i - 1].time >= 0.64, name);
        if (name === "escape") {
          assert.equal(r.owner, 9);
          assert.ok(r.p.z < -8);
        } else if (name === "pass")
          assert.ok(r.pass, "pass must launch under pressure");
        else {
          assert.equal(r.owner, 9, name);
          assert.ok(
            (r.ball.x - r.p.x) * (r.p.x - r.q.x) +
              (r.ball.z - r.p.z) * (r.p.z - r.q.z) >
              0.15,
            name,
          );
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.map((r) => r.name), errors }));
} finally {
  await browser.close();
}
