import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--use-angle=metal"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  const rows = await page.evaluate(async () => {
    const { installReview, scenarios } =
      await import("/scripts/motion-review-scenarios.js");
    const T = await import("/node_modules/three/build/three.module.js");
    const { match: m, stadium: s } = __test,
      review = installReview(m, s),
      rows = [];
    for (const id of ["giro45-direita-andando", "giro45-esquerda-andando"]) {
      review.begin(scenarios.find((g) => g.id === id));
      let previous = null,
        maxJump = 0,
        worst = null,
        lastTouch = m.lastTouch?.time;
      const touches = [];
      for (let i = 1; i <= 180; i++) {
        review.advance(i / 120);
        const p = m.players[0],
          rig = s.rigs[p.renderId];
        const feet = rig.legs.map((l) =>
          l.toe.getWorldPosition(new T.Vector3()),
        );
        if (previous)
          for (let k = 0; k < 2; k++) {
            const jump = feet[k].distanceTo(previous[k]);
            if (jump > maxJump) {
              maxJump = jump;
              worst = {
                t: i / 120,
                foot: k,
                stage: p.turnAction?.phase,
                motionTime: p.motion.time,
              };
            }
          }
        if (m.lastTouch?.time !== lastTouch) {
          lastTouch = m.lastTouch?.time;
          touches.push({
            t: i / 120,
            kind: m.lastTouch.kind,
            natural: p.ballMotion?.naturalCarry,
          });
        }
        previous = feet;
      }
      rows.push({ id, maxJump, worst, touches });
    }
    return rows;
  });
  fs.writeFileSync(
    `output/motion-review/walking-turn-${process.env.AUDIT_LABEL || "audit"}.json`,
    JSON.stringify(rows, null, 2),
  );
  console.log(JSON.stringify(rows));
  if (
    process.env.ASSERT_CONTINUITY &&
    rows.some((r) => r.maxJump > 0.1 || r.touches.some((t) => !t.natural))
  )
    throw Error("Walking turn has a discontinuity");
} finally {
  await browser.close();
}
