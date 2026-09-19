import { chromium } from "playwright";
import fs from "node:fs";
fs.mkdirSync("output/locomotion", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    window.gait = await import("/src/locomotion.js");
    const { stadium: s, match: m } = window.__test;
    m.mode = "paused";
    m.players.forEach((p, i) => {
      if (i !== 9) {
        p.x = -40;
        p.z = -25;
        window.gait.initLocomotion(p);
      }
    });
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
  const frames = [];
  for (const [name, steps, vx, vz, charge] of [
    ["rest", 1, 0, 0, false],
    ["accelerate", 24, 5.8, 0, false],
    ["run-1", 150, 5.8, 0, false],
    ["run-2", 10, 5.8, 0, false],
    ["run-3", 10, 5.8, 0, false],
    ["sprint", 180, 8.5, 0, false],
    ["turn", 28, 0, 5.8, false],
    ["brake", 25, 0, 0, false],
    ["stopped", 360, 0, 0, false],
    ["backswing", 45, 0, 0, true],
  ]) {
    frames.push(
      await page.evaluate(
        ({ steps, vx, vz, charge }) => {
          const { stadium: s, match: m } = window.__test,
            p = m.players[9];
          m.charging = charge;
          m.charge = charge ? 0.9 : 0;
          for (let i = 0; i < steps; i++)
            window.gait.stepLocomotion(p, vx, vz, 1 / 120, {
              charging: charge,
            });
          s.savedRender(m, 0);
          s.camera.position.set(p.x + 2.7, 2.1, p.z + 3.7);
          s.camera.lookAt(p.x, 1, p.z);
          s.renderer.render(s.scene, s.camera);
          return window.gait.locomotionSnapshot(p);
        },
        { steps, vx, vz, charge },
      ),
    );
    await page.screenshot({ path: `output/locomotion/${name}.png` });
  }
  fs.writeFileSync(
    "output/locomotion/states.json",
    JSON.stringify(frames, null, 2),
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log("Ten locomotion poses captured; no page errors.");
} finally {
  await browser.close();
}
