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
    const { animateSkinnedAthlete } = await import("/src/skinned-athlete.js");
    const T = await import("/node_modules/three/build/three.module.js");
    const { match: m, stadium: s } = __test,
      review = installReview(m, s),
      rows = [];
    for (const id of scenarios
      .filter((g) => g.kind === "carry" && !g.diagnostic)
      .map((g) => g.id)) {
      review.begin(scenarios.find((g) => g.id === id));
      let last = m.lastTouch?.time,
        maxPoseDelta = 0,
        samples = 0,
        contacts = [];
      for (let i = 1; i <= 480; i++) {
        review.advance(i / 120);
        const p = m.players[0],
          rig = s.rigs[p.renderId],
          motion = p.ballMotion;
        if (motion?.naturalCarry) {
          const before = rig.legs.map((l) =>
            l.toe.getWorldPosition(new T.Vector3()),
          );
          const f = p.locomotion.feet[motion.foot],
            special = f.special;
          p.ballMotion = null;
          f.special = null;
          animateSkinnedAthlete(rig, p, m);
          rig.legs.forEach((l, i) => {
            maxPoseDelta = Math.max(
              maxPoseDelta,
              l.toe.getWorldPosition(new T.Vector3()).distanceTo(before[i]),
            );
          });
          p.ballMotion = motion;
          f.special = special;
          animateSkinnedAthlete(rig, p, m);
          samples++;
        }
        if (m.lastTouch?.time !== last) {
          last = m.lastTouch?.time;
          const foot = m.lastTouch?.foot;
          if (foot != null) {
            const toe = rig.legs[1 - foot].toe.getWorldPosition(
              new T.Vector3(),
            );
            contacts.push({
              t: i / 120,
              distance: toe.distanceTo(
                new T.Vector3(m.ball.x, m.ball.y, m.ball.z),
              ),
              steps: m.lastTouch.stepsSince,
              phase: p.locomotion.feet[foot].phase,
              speed: Math.hypot(p.vx, p.vz),
              interval: p.locomotion.actualStrideInterval,
              cycle: p.motion.walkCycle,
              time: p.motion.time,
            });
          }
        }
      }
      if (
        contacts.length < 2 ||
        maxPoseDelta > 1e-6 ||
        contacts.some(
          (c) =>
            c.distance > 0.22 ||
            c.steps !==
              (id.includes("maxima") ? 6 : id.includes("media") ? 4 : 2),
        )
      )
        throw Error(JSON.stringify({ id, maxPoseDelta, contacts }));
      rows.push({ id, maxPoseDelta, samples, contacts });
    }
    return rows;
  });
  fs.writeFileSync(
    "output/motion-review/natural-carry-audit.json",
    JSON.stringify(rows, null, 2),
  );
  console.log(JSON.stringify(rows));
} finally {
  await browser.close();
}
