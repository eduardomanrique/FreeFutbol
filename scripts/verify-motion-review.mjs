import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    process.env.MOTION_REVIEW_URL || "http://localhost:5173/?test",
  );
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  const result = await page.evaluate(async () => {
    const { installReview, scenarios } =
      await import("/scripts/motion-review-scenarios.js");
    const T = await import("/node_modules/three/build/three.module.js");
    const { match: m, stadium: s } = window.__test;
    const review = installReview(m, s),
      result = { scenarios: [], poses: {} };
    for (const g of scenarios) {
      review.begin(g);
      const state = review.advance(g.duration);
      result.scenarios.push({
        id: g.id,
        kind: g.kind,
        shot: state.shot?.style,
        reception: state.reception?.bodyPart,
        save: m.lastSave?.kind,
        altinha: m.altinha?.lastTouch?.kind,
        events: state.events,
      });
    }
    const point = (b) => b.getWorldPosition(new T.Vector3());
    for (const [id, t, poseId = id] of [
      ["bicicleta", 0.225],
      ["bicicleta", 1.4, "bicicleta-recuperacao"],
      ["bicicleta-altinha", 0.45],
      ["bicicleta-altinha", 1.5, "bicicleta-altinha-recuperacao"],
      ["carrinho", 0.8],
      ["queda", 0.6],
      ["goleiro", 0],
    ]) {
      review.begin(scenarios.find((g) => g.id === id));
      review.advance(t);
      review.draw();
      const p = m.players[0],
        rig = s.rigs[p.renderId ?? p.id],
        heading =
          p.bicycle?.heading ?? p.altinhaPose?.heading ?? p.locomotion.heading;
      result.poses[poseId] = {
        hands: rig.groundHands,
        palms: rig.arms.map((a) => {
          const along = point(a.palm).sub(point(a.hand)).normalize(),
            normal = point(a.index)
              .sub(point(a.pinky))
              .cross(along)
              .normalize()
              .multiplyScalar(a.side);
          const forearm = point(a.hand).sub(point(a.lower)).normalize();
          return {
            normal: normal.toArray(),
            fingers: along.toArray(),
            wristBend: T.MathUtils.radToDeg(along.angleTo(forearm)),
          };
        }),
        legs: rig.legs.map((l) => {
          const h = point(l.hip),
            k = point(l.shin),
            f = point(l.foot);
          return {
            hipY: h.y,
            kneeY: k.y,
            kneeForward:
              (k.x - h.x) * Math.sin(heading) +
              (k.z - h.z) * Math.cos(heading),
            footBehind:
              (f.x - h.x) * Math.sin(heading) +
              (f.z - h.z) * Math.cos(heading),
            straight: k
              .clone()
              .sub(h)
              .normalize()
              .dot(f.clone().sub(k).normalize()),
            vertical: f.clone().sub(h).normalize().y,
          };
        }),
      };
    }
    return result;
  });
  fs.writeFileSync(
    "output/motion-review/verification.json",
    JSON.stringify(result, null, 2),
  );
  assert.deepEqual(errors, []);
  for (const g of result.scenarios) {
    if (["shot", "header", "bicycle"].includes(g.kind))
      assert.ok(g.shot, `${g.id}: shot contact`);
    if (g.kind === "chest") assert.equal(g.reception, "chest", g.id);
    if (g.kind === "altinha") assert.ok(g.altinha, `${g.id}: altinha contact`);
    if (g.kind === "keeper") assert.ok(g.save, `${g.id}: save contact`);
  }
  const strike = result.poses.bicicleta.legs[1];
  assert.ok(
    strike.straight > 0.96 && strike.vertical > 0.98,
    JSON.stringify(strike),
  );
  for (const id of ["bicicleta", "bicicleta-altinha"]) {
    const freeLeg = result.poses[id].legs[0];
    assert.ok(
      freeLeg.kneeY > freeLeg.hipY + 0.15,
      `${id}: free knee stays above the body at contact`,
    );
    for (const leg of result.poses[`${id}-recuperacao`].legs)
      assert.ok(
        leg.kneeForward > 0.05,
        `${id}: knees face forward as the player stands up`,
      );
  }
  for (const hand of result.poses.goleiro.palms) {
    assert.ok(hand.normal[0] > 0.4, "palms remain open toward incoming ball");
    assert.ok(hand.fingers[1] > 0.1, "ready hands lift slightly");
    assert.ok(
      hand.wristBend < 50,
      "ready wrists follow the forearms without folding back",
    );
  }
  for (const id of ["carrinho", "queda"])
    for (const hand of result.poses[id].hands)
      assert.ok(hand.actual[1] < 0.11, `${id}: palm height ${hand.actual[1]}`);
  for (const leg of result.poses.queda.legs) {
    assert.ok(leg.kneeY > 0.025, "knees clear the ground");
    assert.ok(
      leg.kneeY < leg.hipY,
      "prone knees face the ground below the hips",
    );
    assert.ok(leg.footBehind < -0.5, "prone feet trail the hips");
  }
  console.log(
    `${result.scenarios.length} simulation scenarios passed; bicycle extension, palm orientation and ground supports verified.`,
  );
} finally {
  await browser.close();
}
