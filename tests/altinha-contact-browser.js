import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/altinha-contact", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 720 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  const colors = await page.evaluate(() =>
    [...document.querySelectorAll(".mode-grid button")].map(
      (b) => getComputedStyle(b).backgroundColor,
    ),
  );
  assert.equal(new Set(colors).size, 6);
  await page.screenshot({ path: "output/altinha-contact/menu.png" });
  await page.click("[data-mode=altinha]");
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.T = await import("/node_modules/three/build/three.module.js");
    window.draw(m, 3);
    await s.playground.userData.vegetationReady;
    window.closeView = () => {
      document.getElementById("event-toast").style.visibility = "hidden";
      const p = m.players[m.selected],
        h = p.locomotion.heading;
      s.camera.position.set(
        p.x + Math.cos(h) * 2.2 + Math.sin(h) * 2.5,
        2.1,
        p.z - Math.sin(h) * 2.2 + Math.cos(h) * 2.5,
      );
      s.camera.lookAt(p.x, 1, p.z);
      s.renderer.render(s.scene, s.camera);
    };
  });
  const contacts = [];
  for (let i = 0; i < 4; i++) {
    const result = await page.evaluate((i) => {
      const { match: m, stadium: s } = window.__test;
      m.start(180, "normal", false, "altinha");
      m.selected = i;
      m.altinha.receiver = i;
      m.altinha.phase = "playing";
      const p = m.players[i],
        h = p.locomotion.heading,
        side = i % 2 ? -1 : 1;
      Object.assign(m.ball, {
        x: p.x + Math.cos(h) * 0.24 * side,
        z: p.z - Math.sin(h) * 0.24 * side,
        y: 1.95,
        vy: -0.5,
        vx: 0,
        vz: 0,
      });
      m.altinhaAction("keep");
      for (let j = 0; j < 180 && !m.altinha.touches; j++) {
        window.tick(1 / 120, {});
        window.draw(m, 1 / 120);
      }
      window.advanceTime(0);
      window.closeView();
      const rig = s.rigs[p.renderId],
        c = rig.altinhaBodyContact;
      return {
        kind: m.altinha.lastTouch?.kind,
        actual: c?.actual,
        target: c?.target,
        error: c?.error,
        ball: { ...m.ball },
        distance: c
          ? c.actual.distanceTo(new T.Vector3(m.ball.x, m.ball.y, m.ball.z))
          : 99,
      };
    }, i);
    contacts.push(result);
    assert.equal(result.kind, "shoulder");
    assert.ok(result.error < 0.025, JSON.stringify(result));
    assert.ok(Math.abs(result.distance - 0.11) < 0.025, JSON.stringify(result));
    await page.screenshot({ path: `output/altinha-contact/shoulder-${i}.png` });
  }
  for (let n = 0; n < 3; n++) {
    await page.evaluate((n) => {
      const { match: m } = window.__test;
      m.start(180, "normal", false, "altinha");
      m.altinha.serves = n;
      m.altinhaAction("keep");
      for (let i = 0; i < 30; i++) {
        window.tick(1 / 120, {});
        window.draw(m, 1 / 120);
      }
      window.advanceTime(0);
      window.closeView();
    }, n);
    await page.screenshot({
      path: `output/altinha-contact/pickup-${n}-prepare.png`,
    });
    const lift = await page.evaluate(() => {
      const { match: m, stadium: s } = window.__test;
      for (let i = 0; i < 120 && m.altinha.phase === "serving"; i++) {
        window.tick(1 / 120, {});
        window.draw(m, 1 / 120);
      }
      window.advanceTime(0);
      window.closeView();
      const p = m.players[m.selected],
        a = p.altinhaPose,
        rig = s.rigs[p.renderId],
        leg = rig.legs[a.side > 0 ? 0 : 1];
      return {
        kind: a.pickup,
        vy: m.ball.vy,
        y: m.ball.y,
        toe: leg.toe.getWorldPosition(new T.Vector3()),
        ball: { ...m.ball },
      };
    });
    assert.ok(lift.vy > 0);
    assert.ok(lift.y < 0.13);
    assert.ok(
      Math.hypot(
        lift.toe.x - lift.ball.x,
        lift.toe.y - lift.ball.y,
        lift.toe.z - lift.ball.z,
      ) < 0.2,
    );
    await page.screenshot({
      path: `output/altinha-contact/pickup-${n}-lift.png`,
    });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/altinha-contact/results.json",
    JSON.stringify(contacts, null, 2),
  );
  console.log(
    "Six distinct menu colors, four rendered shoulder contacts and three foot pickups passed.",
  );
} finally {
  await browser.close();
}
