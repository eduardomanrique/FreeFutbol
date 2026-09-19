import { chromium } from "playwright";
import fs from "node:fs";
fs.mkdirSync("output/skinned", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    }),
    errors = [];
  page.on("response", (r) => {
    if (r.status() >= 400) console.log(r.status(), r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test, { timeout: 30000 });
  await page.click("#start-btn");
  await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    m.mode = "paused";
    s.savedRender = s.render;
    s.render = () => {};
    for (const selector of [
      "header",
      "#hud",
      "#controller-status",
      "#performance",
      ".vignette",
    ])
      document.querySelector(selector).hidden = true;
  });
  for (const [name, frames, input] of [
    ["idle", 1, {}],
    ["run", 150, { x: 1 }],
    ["turn", 30, { x: 0, z: 1 }],
    ["stop", 180, {}],
  ]) {
    const state = await page.evaluate(
      ({ frames, input }) => {
        const { match: m, stadium: s } = window.__test;
        m.mode = "playing";
        for (let i = 0; i < frames; i++) m.update(1 / 120, input);
        m.mode = "paused";
        s.savedRender(m, 0);
        const p = m.players[m.selected];
        s.camera.position.set(p.x + 2.7, 2, p.z + 3.7);
        s.camera.lookAt(p.x, 1, p.z);
        s.renderer.render(s.scene, s.camera);
        return JSON.parse(window.render_game_to_text());
      },
      { frames, input },
    );
    await page.screenshot({ path: `output/skinned/${name}.png` });
    fs.writeFileSync(
      `output/skinned/${name}.json`,
      JSON.stringify(state, null, 2),
    );
  }
  const metrics = await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    m.start();
    m.mode = "playing";
    m.players.forEach((p) => {
      if (p.id !== 9) {
        p.x = -38;
        p.z = -26 + p.id * 2.3;
        p.locomotion.lastX = p.x;
        p.locomotion.lastZ = p.z;
      }
    });
    let maxAnchorError = 0,
      contacts = 0,
      clips = new Set();
    for (let i = 0; i < 230; i++) {
      m.update(1 / 120, { x: 1 });
      if (i % 2 === 0) {
        s.savedRender(m, 0);
        const rig = s.rigs[9];
        clips.add(m.players[9].motion.clip.name);
        for (const leg of rig.legs)
          if (leg.anchor) {
            const pos = leg.toe.position.clone();
            leg.toe.getWorldPosition(pos);
            maxAnchorError = Math.max(
              maxAnchorError,
              pos.distanceTo(leg.anchor),
            );
            contacts++;
          }
      }
    }
    m.mode = "paused";
    return {
      maxAnchorError,
      contacts,
      clips: [...clips],
      selected: m.selected,
    };
  });
  console.log({ metrics });
  if (
    metrics.contacts < 10 ||
    metrics.selected !== 9 ||
    !metrics.clips.includes("jog") ||
    metrics.maxAnchorError > 0.002
  )
    throw Error(
      "Skeletal locomotion/contact regression: " + JSON.stringify(metrics),
    );
  for (const action of ["windup", "strike"]) {
    const state = await page.evaluate((action) => {
      const { match: m, stadium: s } = window.__test;
      if (action === "windup") {
        m.start();
        m.players.forEach((p) => {
          if (p.id !== 9) {
            p.x = -38;
            p.z = -26 + p.id * 2.3;
          }
        });
        m.charging = true;
        m.charge = 0.9;
        m.mode = "playing";
        for (let i = 0; i < 24; i++) m.update(1 / 120, {});
      } else {
        m.mode = "playing";
        m.charging = false;
        m.shoot(1);
        for (let i = 0; i < 12; i++) m.update(1 / 120, {});
      }
      m.mode = "paused";
      s.savedRender(m, 0);
      const p = m.players[9];
      s.camera.position.set(p.x + 2.7, 2, p.z + 3.7);
      s.camera.lookAt(p.x, 1, p.z);
      s.renderer.render(s.scene, s.camera);
      return JSON.parse(window.render_game_to_text());
    }, action);
    await page.screenshot({ path: `output/skinned/${action}.png` });
    fs.writeFileSync(
      `output/skinned/${action}.json`,
      JSON.stringify(state, null, 2),
    );
    if (state.animation.action !== action)
      throw Error("Expected " + action + ", got " + state.animation.action);
  }
  console.log({ errors });
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
}
