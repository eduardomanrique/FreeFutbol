import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/first-time", { recursive: true });
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
  const departures = [];
  for (const sprint of [false, true]) {
    const result = await page.evaluate((sprint) => {
      const { match: m } = window.__test;
      fixture.setup();
      let first = null;
      for (let i = 0; i < 60; i++) {
        fixture.step(1 / 120, { x: 1, sprint });
        if (!first && m.lastTouch) first = { ...m.players[9].lastDribble };
      }
      fixture.draw();
      return {
        sprint,
        first,
        gap: Math.hypot(m.ball.x - m.players[9].x, m.ball.z - m.players[9].z),
      };
    }, sprint);
    assert.ok(result.first);
    await page.screenshot({
      path: `output/first-time/departure-${sprint ? "sprint" : "normal"}.png`,
    });
    departures.push(result);
    results.push(result);
  }
  assert.ok(
    Math.abs(departures[1].first.lead / departures[0].first.lead - 3) < 0.01,
  );
  assert.ok(departures[1].gap > departures[0].gap + 0.4);

  for (const pace of [0, 0.3, 1]) {
    for (const degrees of [45, -45, 90, 180]) {
      const result = await page.evaluate(({ pace, degrees }) => {
        const { match: m } = window.__test;
        fixture.setup();
        const p = m.players[9];
        if (pace) {
          for (let i = 0; i < 180; i++) fixture.step(1 / 120, { x: pace });
        } else {
          p.lastDribble = { vx: 3, vz: 0, time: -2, interval: 0.4, landings: 0 };
        }
        const previous = m.lastTouch?.time;
        const angle = degrees * Math.PI / 180;
        const input = { x: Math.cos(angle), z: Math.sin(angle), sprint: true };
        let first = null, afterContact = 0;
        for (let i = 0; i < 240; i++) {
          fixture.step(1 / 120, input);
          if (!first && m.lastTouch?.time !== previous) first = { ...p.lastDribble };
          if (first && ++afterContact >= 24) break;
        }
        fixture.draw();
        window.departureInput = input;
        window.departureContact = first?.time;
        return { pace, degrees, first, owner: m.ball.owner };
      }, { pace, degrees });
      assert.equal(result.first?.kind, "launch", JSON.stringify(result));
      assert.ok(result.first.lead > 3);
      assert.equal(result.owner, 9);
      await page.screenshot({ path: `output/first-time/departure-${pace}-${degrees}.png` });
      const recovered = await page.evaluate(() => {
        const { match: m } = window.__test, p = m.players[9];
        for (let i = 0; i < 600; i++) {
          fixture.step(1 / 120, window.departureInput);
          if (p.lastDribble.time > window.departureContact && Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 1.2)
            return m.ball.owner === 9;
        }
        return false;
      });
      assert.ok(recovered, `recovery: ${pace}/${degrees}`);
      results.push(result);
    }
  }

  for (const type of ["pass", "lob", "through", "shoot"]) {
    await page.evaluate((type) => {
      const { match: m } = window.__test;
      fixture.setup();
      Object.assign(m.ball, { owner: null, x: 4, z: 0.3, vx: -12 });
      m.beginAction(type, { x: 1 });
      m.releaseAction(0.5);
    }, type);
    for (const phase of ["prepare", "contact", "follow"]) {
      const result = await page.evaluate(
        ({ type, phase }) => {
          const { match: m } = window.__test;
          let received = false;
          const limit =
            phase === "prepare" ? 10 : phase === "contact" ? 110 : 12;
          for (let i = 0; i < limit; i++) {
            fixture.step(1 / 120, { x: -1 });
            received ||= m.ball.owner === 9 || m.lastReception?.player === 9;
            if (phase === "contact" && (m.lastShot || m.lastPass)) break;
          }
          fixture.draw();
          return {
            type,
            phase,
            received,
            event: m.lastShot || m.lastPass,
            action: m.players[9].ballAction,
            ball: { ...m.ball },
          };
        },
        { type, phase },
      );
      if (phase === "contact") {
        assert.equal(result.received, false);
        assert.ok(result.event?.firstTime, JSON.stringify(result));
        assert.ok(result.event.incomingSpeed > 1);
      }
      await page.screenshot({ path: `output/first-time/${type}-${phase}.png` });
      results.push(result);
    }
  }
  for (const [name, input] of [
    ["walk", { x: 0.3 }],
    ["jog", { x: 1 }],
    ["sprint", { x: 1, sprint: true }],
  ]) {
    const result = await page.evaluate(
      ({ name, input }) => {
        const { match: m } = window.__test;
        fixture.setup();
        Object.assign(m.ball, { owner: 9, x: 0.6, z: 0 });
        for (let i = 0; i < 240; i++) fixture.step(1 / 120, input);
        const metrics = [];
        for (let i = 0; i < 36; i++) {
          fixture.step(1 / 120, input);
          fixture.draw();
          const rig = window.__test.stadium.rigs[9];
          metrics.push({
            arms: rig.arms.map((a) => a.upper.quaternion.toArray()),
            feet: m.players[9].locomotion.feet.map((f) => f.y),
          });
        }
        return { name, animation: m.players[9].motion.snapshot(), metrics };
      },
      { name, input },
    );
    assert.equal(result.animation.gait, name);
    await page.screenshot({ path: `output/first-time/${name}.png` });
    results.push(result);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/first-time/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    "First-time contact, assistance and walk/jog/sprint visual scenarios passed",
  );
} finally {
  await browser.close();
}
