import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/stopping-textures", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 700 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    const update = m.update.bind(m),
      render = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.check = {
      m,
      s,
      update,
      render,
      init: (await import("/src/locomotion.js")).initLocomotion,
    };
  });
  const result = {};
  for (const variant of ["match", "sand", "court", "street"]) {
    result[variant] = await page.evaluate((variant) => {
      const { m, s, update, render, init } = window.check;
      m.start(180, "normal", false, variant);
      m.multiplayer = true;
      const p = m.players[m.selected];
      for (const q of m.players) {
        q.x = -m.field.halfLength + 1;
        q.z = m.field.halfWidth - 1;
        init(q);
      }
      p.id = 0;
      m.players = [p];
      m.selected = 0;
      Object.assign(p, { x: -10, z: 0, dx: 1, dz: 0 });
      init(p);
      Object.assign(m.ball, { owner: p.id, x: -9.3, z: 0 });
      for (let i = 0; i < 220; i++) update(1 / 120, { x: 1, sprint: true }, {});
      for (let i = 0; i < 420; i++) update(1 / 120, {}, {});
      render(m, 0.016);
      s.camera.position.set(p.x + 4, 3, 5);
      s.camera.lookAt(p.x, 0.8, 0);
      s.renderer.render(s.scene, s.camera);
      let textured = 0;
      s.scene.traverse((o) => {
        if (o.material?.bumpMap) textured++;
      });
      return {
        owner: m.ball.owner,
        player: p.id,
        distance: Math.hypot(m.ball.x - p.x, m.ball.z - p.z),
        speed: Math.hypot(p.vx, p.vz),
        textured,
        near: m.players
          .filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 1.5)
          .map((q) => ({ id: q.id, d: Math.hypot(q.x - p.x, q.z - p.z) })),
      };
    }, variant);
    assert.equal(result[variant].owner, result[variant].player);
    assert.ok(result[variant].distance < 1.15);
    assert.ok(
      result[variant].speed < 0.1,
      JSON.stringify({ variant, ...result[variant] }),
    );
    assert.ok(result[variant].textured > 0);
    await page.screenshot({ path: `output/stopping-textures/${variant}.png` });
  }
  result.out = await page.evaluate(() => {
    const { m, s, update, render } = window.check;
    m.start(180, "normal", false, "sand");
    m.multiplayer = true;
    Object.assign(m.ball, {
      owner: null,
      lastTeam: 0,
      x: 0,
      z: m.field.halfWidth + 0.05,
      y: 0.3,
      vx: 0,
      vz: 8,
      vy: 0,
    });
    m.integrateBall(1 / 60);
    for (let i = 0; i < 120; i++) update(1 / 120, {}, {});
    render(m, 0.016);
    s.camera.position.set(5, 10, m.field.halfWidth + 10);
    s.camera.lookAt(0, 0, m.field.halfWidth);
    s.renderer.render(s.scene, s.camera);
    return {
      z: m.ball.z,
      line: m.field.halfWidth,
      pending: m.pendingRestart,
      piece: m.setPiece,
    };
  });
  assert.ok(result.out.z > result.out.line + 0.5);
  assert.ok(result.out.pending);
  assert.equal(result.out.piece, null);
  await page.screenshot({ path: "output/stopping-textures/ball-out.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/stopping-textures/results.json",
    JSON.stringify({ result, errors }, null, 2),
  );
  console.log(
    "Sprint stops, material shaders and visible out-of-play ball passed.",
  );
} finally {
  await browser.close();
}
