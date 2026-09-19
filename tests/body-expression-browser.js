import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/body-expression", { recursive: true });
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
    const { match: m, stadium: s } = window.__test;
    const { initLocomotion } = await import("/src/locomotion.js");
    const step = m.update.bind(m),
      render = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    for (const sel of [
      "header",
      "#hud",
      "#controller-status",
      "#performance",
      ".vignette",
    ])
      document.querySelector(sel).hidden = true;
    window.fixture = {
      step,
      setup() {
        m.start();
        m.random = () => 0.5;
        for (const p of m.players) {
          p.x = -40;
          p.z = -25 + p.id * 0.6;
          p.think = 99;
        }
        const p = m.players[9];
        Object.assign(p, { x: 0, z: 0, dx: 1, dz: 0 });
        initLocomotion(p);
        Object.assign(m.ball, { x: 0.6, z: 0, vx: 0, vz: 0, vy: 0, owner: 9 });
      },
      draw() {
        render(m, 0);
        const p = m.players[9];
        s.camera.position.set(p.x + 3.8, 2.3, p.z + 5.8);
        s.camera.lookAt(p.x + 0.4, 0.95, p.z);
        s.renderer.render(s.scene, s.camera);
      },
    };
  });
  const results = [];
  for (const side of [-1, 1]) {
    const result = await page.evaluate((side) => {
      const { match: m, stadium: s } = window.__test;
      fixture.setup();
      for (let i = 0; i < 120; i++) fixture.step(1 / 120, { x: 0.5 });
      for (let i = 0; i < 24; i++) fixture.step(1 / 120, { z: side * 0.5 });
      fixture.draw();
      const p = m.players[9],
        rig = s.rigs[9];
      const expression = { ...p.locomotion.expression };
      const on = rig.torso.getWorldQuaternion(rig.root.quaternion.clone());
      const hipOn = rig.pelvis.getWorldPosition(rig.root.position.clone()).y;
      const plantPositions = rig.legs.map((leg) =>
        leg.toe.getWorldPosition(rig.root.position.clone()).toArray(),
      );
      p.locomotion.expression = {};
      fixture.draw();
      const off = rig.torso.getWorldQuaternion(rig.root.quaternion.clone());
      const hipOff = rig.pelvis.getWorldPosition(rig.root.position.clone()).y;
      p.locomotion.expression = expression;
      fixture.draw();
      return {
        side,
        expression,
        hipDrop: hipOff - hipOn,
        torsoChange: on.angleTo(off),
        plantPositions,
      };
    }, side);
    assert.ok(Math.abs(result.expression.twist) > 0.05);
    assert.ok(result.torsoChange > 0.03);
    assert.ok(result.expression.fold > 0.1);
    assert.ok(result.hipDrop > 0.035, JSON.stringify(result));
    await page.screenshot({ path: `output/body-expression/cut-${side}.png` });
    results.push(result);
  }
  for (const type of ["pass", "shoot"]) {
    const postures = [];
    for (const pace of [0, 0.3, 1]) {
      const result = await page.evaluate(
        ({ type, pace }) => {
          const { match: m } = window.__test;
          fixture.setup();
          if (pace) {
            const input = { x: pace, sprint: pace === 1 };
            for (let i = 0; i < 180; i++) fixture.step(1 / 120, input);
            const previous = m.lastTouch?.time;
            for (let i = 0; i < 180; i++) {
              fixture.step(1 / 120, input);
              if (m.lastTouch?.time !== previous) break;
            }
          }
          const p = m.players[9];
          m.beginAction(type, { x: 1 });
          const approachSpeed = p.ballAction.approachSpeed;
          for (let i = 0; i < 360; i++) {
            if (i === 16) m.releaseAction(0.6);
            fixture.step(1 / 120, { x: 1 });
            if (
              p.strikePlant &&
              p.locomotion.feet[p.strikePlant.foot].contact &&
              i > 15
            )
              break;
          }
          fixture.draw();
          return {
            type,
            pace,
            approachSpeed,
            expression: { ...p.locomotion.expression },
            plant: p.strikePlant,
          };
        },
        { type, pace },
      );
      assert.ok(result.plant, JSON.stringify(result));
      await page.screenshot({
        path: `output/body-expression/${type}-${pace}-plant.png`,
      });
      const hit = await page.evaluate(() => {
        const { match: m } = window.__test;
        for (let i = 0; i < 240 && !m.lastPass && !m.lastShot; i++)
          fixture.step(1 / 120, { x: 1 });
        fixture.draw();
        return m.lastShot || m.lastPass;
      });
      assert.ok(hit, `contact ${type}/${pace}`);
      await page.screenshot({
        path: `output/body-expression/${type}-${pace}-contact.png`,
      });
      const follow = await page.evaluate(() => {
        const { match: m } = window.__test;
        for (let i = 0; i < 30; i++) fixture.step(1 / 120, {});
        fixture.draw();
        return { ...m.players[9].locomotion.expression };
      });
      assert.ok(
        follow.strikeLean < -0.1,
        `forward follow-through ${type}/${pace}`,
      );
      assert.ok(follow.hipBack < -0.04);
      await page.screenshot({
        path: `output/body-expression/${type}-${pace}-follow.png`,
      });
      result.follow = follow;
      postures.push(result);
      results.push(result);
    }
    assert.ok(postures.every((p) => p.expression.strikeLean < 0.035));
    assert.ok(postures.every((p) => Math.abs(p.expression.hipBack) < 0.001));
    assert.ok(
      postures[2].expression.strikeArms >
        postures[0].expression.strikeArms + 0.05,
    );
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/body-expression/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    "Ginga and standing/walking/running pass and shot scenarios passed",
  );
} finally {
  await browser.close();
}
