import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: false,
  args: [
    "--use-angle=metal",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const results = [];
try {
  for (const mode of ["server", "teams"]) {
    const contexts = await Promise.all(
      [0, 1].map(() =>
        browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
        }),
      ),
    );
    for (const c of contexts)
      await c.addInitScript(() => {
        Object.defineProperty(navigator, "getGamepads", { value: () => [] });
        Object.defineProperty(document, "hasFocus", { value: () => true });
        Object.defineProperty(document, "hidden", { get: () => false });
        window.addEventListener(
          "blur",
          (e) => e.stopImmediatePropagation(),
          true,
        );
      });
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const wire = pages.map(() => ({
        in: 0,
        out: 0,
        inMessages: 0,
        outMessages: 0,
      })),
      errors = [];
    let measuring = false;
    pages.forEach((p, i) => {
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("websocket", (ws) => {
        ws.on("framereceived", (e) => {
          if (measuring) {
            wire[i].in += Buffer.byteLength(e.payload);
            wire[i].inMessages++;
          }
        });
        ws.on("framesent", (e) => {
          if (measuring) {
            wire[i].out += Buffer.byteLength(e.payload);
            wire[i].outMessages++;
          }
        });
      });
    });
    await Promise.all(pages.map((p) => p.goto("http://localhost:5173/?test")));
    await Promise.all(
      pages.map((p) =>
        p.waitForFunction(() => window.__test, { timeout: 60000 }),
      ),
    );
    const [a, b] = pages;
    await a.selectOption("#game-mode", "online");
    await a.selectOption("#network-mode", mode);
    await a.click("#online-create");
    await a.waitForFunction(
      () => document.querySelector("#online-code").textContent.length === 6,
    );
    const code = await a.locator("#online-code").textContent();
    await b.selectOption("#game-mode", "online");
    await b.fill("#room-code", code);
    await b.click("#online-join");
    await b.waitForFunction(
      () => !document.querySelector("#online-lobby").hidden,
    );
    await a.click("#online-ready");
    await b.click("#online-ready");
    await a.waitForFunction(
      () => !document.querySelector("#online-start").disabled,
    );
    await a.click("#online-start");
    await Promise.all(
      pages.map((p) => p.waitForFunction(() => window.__test.online.tick > 20)),
    );
    for (const p of pages)
      await p.evaluate(() => {
        const online = window.__test.online,
          update = online.update.bind(online);
        window.stepTimes = [];
        online.update = (dt, input, m) => {
          const n = performance.now() / 1000;
          const t = performance.now();
          update(
            dt,
            { x: Math.sin(n) * (online.team ? -1 : 1), z: 0.5, sprint: true },
            m,
          );
          window.stepTimes.push(performance.now() - t);
        };
      });
    await a.waitForTimeout(1500);
    measuring = true;
    const start = Date.now();
    const clients = await Promise.all(
      pages.map((p) =>
        p.evaluate(
          () =>
            new Promise((resolve) => {
              window.stepTimes = [];
              const times = [];
              let last = performance.now();
              const percentile = (a, n) =>
                a[Math.min(a.length - 1, Math.floor(a.length * n))];
              function frame(now) {
                times.push(now - last);
                last = now;
                if (times.length < 360) return requestAnimationFrame(frame);
                const steps = window.stepTimes,
                  mean = (a) => a.reduce((s, n) => s + n, 0) / a.length;
                const fps = 1000 / mean(times);
                times.sort((a, b) => a - b);
                steps.sort((a, b) => a - b);
                const gl = document
                    .querySelector("canvas")
                    .getContext("webgl2"),
                  ext = gl.getExtension("WEBGL_debug_renderer_info");
                resolve({
                  fps: +fps.toFixed(2),
                  frameMedianMs: percentile(times, 0.5),
                  frameP95Ms: percentile(times, 0.95),
                  updateMeanMs: mean(steps),
                  updateP95Ms: percentile(steps, 0.95),
                  gpu: ext
                    ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                    : "unknown",
                  state: JSON.parse(window.render_game_to_text()),
                });
              }
              requestAnimationFrame(frame);
            }),
        ),
      ),
    );
    const elapsed = (Date.now() - start) / 1000;
    measuring = false;
    await a.screenshot({ path: `output/relay/${mode}-performance.png` });
    results.push({
      mode,
      seconds: elapsed,
      viewport: "1440x900",
      quality: "high",
      clients: clients.map((c, i) => ({ ...c, wire: wire[i] })),
      errors,
    });
    await a.evaluate(() => window.__test.online.leave());
    for (const c of contexts) await c.close();
  }
  fs.mkdirSync("output/relay", { recursive: true });
  fs.writeFileSync(
    "output/relay/browser-comparison.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        note: "Two headed Chromium clients on the same Apple M3 Pro / Metal. 360 frames after warmup, different matches with continuous direction changes. Short local sample, not a mobile benchmark. Wire counts are application bytes before WebSocket compression.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      results.map((r) => ({
        mode: r.mode,
        seconds: r.seconds,
        errors: r.errors,
        clients: r.clients.map(({ state, ...c }) => c),
      })),
      null,
      2,
    ),
  );
  if (results.some((r) => r.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
