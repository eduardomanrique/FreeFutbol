import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--use-angle=metal"],
});
const output = "output/recovery-freeze";
fs.mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 750 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.locator("#start-btn").dispatchEvent("click");
  const results = await page.evaluate(async () => {
    const m = __test.match,
      s = __test.stadium;
    const { installReview, scenarios } =
      await import("/scripts/motion-review-scenarios.js");
    let seed = 2;
    m.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    m.start(180, "normal", false, "street");
    let frames = 0;
    for (let i = 0; i < 1500; i++) {
      const a = (Math.floor(i / 90) * Math.PI) / 4;
      const input = {
        x: Math.cos(a),
        z: Math.sin(a),
        sprint: i % 600 < 400,
        jockey: i % 600 >= 500,
      };
      m.update(1 / 120, input);
      if (i % 500 === 300) m.beginAction("shoot", input);
      if (i % 500 === 330) m.releaseAction(0.5);
      if (i % 30 === 0) {
        s.render(m, 1 / 120);
        frames++;
      }
      if (
        m.players.some(
          (p) => !p.motion.feature || !Number.isFinite(p.motion.time),
        )
      )
        throw Error(`invalid animation at ${i}`);
    }
    window.review = installReview(m, s);
    const rows = [];
    for (const spec of scenarios.filter((g) =>
      g.id.startsWith("recuperacao-bola-atras"),
    )) {
      review.begin(spec);
      review.advance(spec.duration);
      review.draw();
      rows.push({ id: spec.id, ...review.summary() });
    }
    return { frames, rows };
  });
  assert.equal(results.frames, 50);
  assert.equal(results.rows.length, 3);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/recovery.png` });
  // Verify the real RAF loop survives one isolated rendering exception.
  await page.reload();
  await page.waitForFunction(() => window.__test);
  await page.locator("#start-btn").dispatchEvent("click");
  await page.evaluate(() => {
    const s = __test.stadium,
      render = s.render.bind(s);
    window.framesAfterFault = 0;
    s.render = (...args) => {
      if (window.framesAfterFault++ === 0)
        throw Error("intentional one-frame test fault");
      return render(...args);
    };
  });
  await page.waitForFunction(() => window.framesAfterFault > 5);
  assert.deepEqual(errors, ["intentional one-frame test fault"]);
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log("Restart, recovery, and animation-loop checks passed");
} finally {
  await browser.close();
}
