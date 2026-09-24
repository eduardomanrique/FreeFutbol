import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/modes", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {};
    screen.orientation.lock = async () => {};
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.screenshot({ path: "output/modes/home.png" });
  for (const [variant, count] of [
    ["street", 6],
    ["sand", 10],
    ["court", 10],
    ["match", 22],
  ]) {
    await page.click(`[data-mode="${variant}"]`);
    await page.click("#start-btn");
    await page.waitForTimeout(700);
    const result = await page.evaluate(() => {
      const { match: m, stadium: s } = window.__test;
      s.render(m, 5);
      return {
        count: m.players.length,
        keepers: m.players.filter((p) => p.keeper).length,
        visible: s.rigs.filter((r) => r.root.visible).length,
      };
    });
    assert.equal(result.count, count);
    assert.equal(result.visible, count);
    assert.equal(result.keepers, variant === "street" ? 0 : 2);
    await page.screenshot({ path: `output/modes/${variant}.png` });
    const outfits = await page.evaluate(() => {
      const { match: m, stadium: s } = window.__test;
      return m.players.map((p) => {
        const rig = s.rigs[p.renderId];
        let kit = null,
          shoes = 0;
        rig.root.traverse((n) => {
          if (n.material?.userData.kitStyle)
            kit = n.material.userData.kitStyle.value.toArray();
          if (n.userData.isShoe && n.visible) shoes++;
        });
        return { team: p.team, kit, shoes };
      });
    });
    for (const p of outfits) {
      assert.equal(p.kit[0], variant === "street" && p.team === 1 ? 0 : 1);
      assert.equal(p.kit[1], ["street", "sand"].includes(variant) ? 0 : 1);
      assert.equal(p.shoes, variant === "sand" ? 0 : 2);
    }
    if (variant !== "match") {
      await page.evaluate(() => {
        const { match: m, stadium: s } = window.__test;
        s.savedRender = s.render;
        s.render = () => {};
        const p = m.players.find((p) => p.team === 1 && !p.keeper);
        s.camera.position.set(p.x + 3, 2.6, p.z + 4);
        s.camera.lookAt(p.x, 1, p.z);
        s.renderer.render(s.scene, s.camera);
      });
      await page.screenshot({ path: `output/modes/${variant}-outfit.png` });
      await page.evaluate(() => {
        const s = window.__test.stadium;
        s.render = s.savedRender;
      });
    }
    // Exercise virtual stick vertically in both physical orientations.
    for (const portrait of [false, true]) {
      await page.setViewportSize(
        portrait ? { width: 390, height: 844 } : { width: 844, height: 390 },
      );
      await page.waitForTimeout(250);
      const stick = await page.locator(".touch-stick").boundingBox();
      const cx = stick.x + stick.width / 2,
        cy = stick.y + stick.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(portrait ? cx + 25 : cx, portrait ? cy : cy - 25);
      const input = await page.evaluate(
        () => JSON.parse(window.render_game_to_text()).touch,
      );
      assert.ok(input.z < -0.1, JSON.stringify(input));
      await page.mouse.up();
    }
    await page.setViewportSize({ width: 844, height: 390 });
    if (variant === "street") {
      await page.evaluate(() => {
        const { match: m, stadium: s } = window.__test;
        Object.assign(m.ball, {
          owner: null,
          x: 5,
          z: 0,
          y: 0.5,
          vx: 18,
          vz: 0,
          vy: 1,
        });
        m.lastShot = { power: 0.8, contactAt: m.elapsed };
        for (let i = 0; i < 12; i++) {
          m.ball.x += 0.15;
          s.render(m, 1 / 60);
        }
        m.mode = "paused";
      });
      await page.screenshot({ path: "output/modes/shot-effect.png" });
      await page.evaluate(() => (window.__test.match.mode = "playing"));
    }
    await page.click("#pause-btn");
    await page.click("#leave");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "output/modes/home-portrait.png" });
  assert.deepEqual(errors, []);
  console.log(
    "All four modes, visibility, menu return and touch directions passed. No page errors.",
  );
} finally {
  await browser.close();
}
