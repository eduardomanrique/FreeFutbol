import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/altinha-assist", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 720 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.virtualPads = [];
    Object.defineProperty(navigator, "getGamepads", {
      value: () => window.virtualPads,
    });
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
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
    window.fixture = () => {
      m.start(180, "normal", false, "altinha");
      m.altinha.phase = "playing";
      const p = m.players[0];
      Object.assign(m.ball, {
        x: p.x,
        z: p.z - 0.45,
        y: 3,
        vy: 2,
        vx: 0,
        vz: 0,
      });
    };
  });
  const contacts = [];
  for (const kind of ["head", "shoulder"])
    for (let player = 0; player < 4; player++) {
      const result = await page.evaluate(
        ({ kind, player }) => {
          const { match: m, stadium: s } = window.__test;
          window.fixture();
          m.selected = m.altinha.receiver = player;
          const p = m.players[player],
            h = p.locomotion.heading,
            off = kind === "head" ? 0.35 : 0.6,
            origin = { x: p.x, z: p.z };
          Object.assign(m.ball, {
            x: p.x + Math.cos(h) * off + Math.sin(h) * 0.08,
            z: p.z - Math.sin(h) * off + Math.cos(h) * 0.08,
            y: kind === "head" ? 2.05 : 1.95,
            vy: -1,
          });
          m.altinhaAction("style", kind === "head" ? {} : { x: 1 });
          for (let i = 0; i < 100 && !m.altinha.touches; i++) {
            window.tick(1 / 120, {});
            window.draw(m, 1 / 120);
          }
          window.advanceTime(0);
          document.getElementById("event-toast").style.visibility = "hidden";
          s.camera.position.set(
            p.x + Math.cos(h) * 2.2 + Math.sin(h) * 2.5,
            2.1,
            p.z - Math.sin(h) * 2.2 + Math.cos(h) * 2.5,
          );
          s.camera.lookAt(p.x, 1, p.z);
          s.renderer.render(s.scene, s.camera);
          const rig = s.rigs[p.renderId],
            c = rig.altinhaBodyContact;
          return {
            kind: m.altinha.lastTouch?.kind,
            moved: Math.hypot(p.x - origin.x, p.z - origin.z),
            crouch: p.altinhaPose?.crouch,
            error: c?.error,
            distance: c?.actual.distanceTo(
              new T.Vector3(m.ball.x, m.ball.y, m.ball.z),
            ),
            toes: rig.legs.map(
              (l) => l.toe.getWorldPosition(new T.Vector3()).y,
            ),
          };
        },
        { kind, player },
      );
      contacts.push(result);
      assert.equal(result.kind, kind);
      assert.ok(result.moved > 0.08);
      assert.ok(result.crouch > 0.04);
      assert.ok(result.error < 0.025, JSON.stringify(result));
      assert.ok(
        Math.abs(result.distance - 0.11) < 0.025,
        JSON.stringify(result),
      );
      assert.ok(result.toes.every((y) => y > -0.06));
      await page.screenshot({
        path: `output/altinha-assist/${kind}-${player}.png`,
      });
    }
  await page.evaluate(() => window.fixture());
  await page.keyboard.down("KeyK");
  await page.evaluate(() => {
    for (let i = 0; i < 55; i++) window.tick(1 / 120, {});
    window.draw(window.__test.match, 1 / 60);
    window.advanceTime(0);
  });
  assert.ok(await page.locator("#altinha-power").isVisible());
  assert.ok(
    await page.evaluate(
      () =>
        window.__test.match.altinha.charge > 0.55 &&
        !window.__test.match.altinha.pending,
    ),
  );
  await page.screenshot({ path: "output/altinha-assist/charge-keyboard.png" });
  await page.evaluate(() =>
    Object.assign(window.__test.match.ball, { y: 1.05, vy: -1 }),
  );
  await page.keyboard.up("KeyK");
  assert.ok(
    await page.evaluate(() => window.__test.match.altinha.pending.power > 0.55),
  );
  await page.evaluate(() => {
    for (let i = 0; i < 100 && !window.__test.match.altinha.passes; i++)
      window.tick(1 / 120, {});
  });
  assert.equal(
    await page.evaluate(() => window.__test.match.altinha.passes),
    1,
  );
  await page.evaluate(() => window.fixture());
  await page.keyboard.down("KeyK");
  await page.keyboard.press("Escape");
  await page.keyboard.up("KeyK");
  assert.equal(
    await page.evaluate(() => window.__test.match.altinha.charging),
    null,
  );
  await page.click("#resume");
  // Standard Y button uses identical hold/release semantics.
  await page.evaluate(() => {
    window.fixture();
    window.virtualPads = [
      {
        id: "Xbox virtual",
        index: 0,
        mapping: "standard",
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      },
    ];
    window.advanceTime(0);
  });
  await page.evaluate(() => {
    const b = window.virtualPads[0].buttons[3];
    b.pressed = true;
    b.value = 1;
    window.advanceTime(0);
    for (let i = 0; i < 48; i++) window.tick(1 / 120, {});
    window.advanceTime(0);
  });
  assert.ok(await page.evaluate(() => window.__test.match.altinha.charging));
  await page.evaluate(() => {
    const b = window.virtualPads[0].buttons[3];
    b.pressed = false;
    b.value = 0;
    window.advanceTime(0);
  });
  assert.ok(
    await page.evaluate(() => window.__test.match.altinha.pending?.power > 0.5),
  );
  await page.close();
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://localhost:5173/?test");
  await mobile.waitForFunction(() => window.__test);
  await mobile.click("[data-mode=altinha]");
  await mobile.click("#start-btn");
  await mobile.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    m.update = () => {};
    m.altinha.phase = "playing";
    Object.assign(m.ball, { y: 3, vy: 2 });
    s.render(m, 3);
  });
  const btn = mobile.locator("[data-altinha][data-touch=pass]");
  const box = await btn.boundingBox();
  await mobile.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await mobile.mouse.down();
  await mobile.evaluate(() => {
    for (let i = 0; i < 55; i++) window.tick(1 / 120, {});
    window.advanceTime(0);
  });
  assert.ok(await mobile.locator("#altinha-power").isVisible());
  assert.ok(
    await mobile.evaluate(() => window.__test.match.altinha.charge > 0.55),
  );
  await mobile.screenshot({ path: "output/altinha-assist/charge-mobile.png" });
  await mobile.mouse.up();
  assert.ok(
    await mobile.evaluate(
      () => window.__test.match.altinha.pending?.power > 0.55,
    ),
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/altinha-assist/results.json",
    JSON.stringify({ contacts, errors }, null, 2),
  );
  console.log(
    "All four players physically contact head/shoulder with short auto-approach and crouch. Keyboard, Y and touch charging/release, pause cancellation passed.",
  );
} finally {
  await browser.close();
}
