import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [],
      configurable: true,
    }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  const info = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
  const metrics = [];
  for (const quality of ["high", "medium", "low"]) {
    await page.evaluate((q) => {
      window.__test.stadium.setQuality(q);
    }, quality);
    await page.waitForTimeout(1500);
    metrics.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let times = [],
              last = performance.now();
            function collect(now) {
              times.push(now - last);
              last = now;
              if (times.length < 100) requestAnimationFrame(collect);
              else {
                times.sort((a, b) => a - b);
                resolve({
                  quality: window.__test.stadium.quality,
                  medianFrameMs: +times[50].toFixed(2),
                  p95FrameMs: +times[95].toFixed(2),
                  averageFps: Math.round(
                    100000 / times.reduce((a, b) => a + b, 0),
                  ),
                  ...JSON.parse(window.render_game_to_text()).graphics,
                });
              }
            }
            requestAnimationFrame(collect);
          }),
      ),
    );
  }
  console.log(
    JSON.stringify({ viewport: "1440x900", ...info, metrics }, null, 2),
  );
} finally {
  await browser.close();
}
