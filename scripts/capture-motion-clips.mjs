import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
const root = path.resolve("output/motion-review");
const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--use-angle=metal"],
});
const page = await browser.newPage({
  viewport: { width: 840, height: 630 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  const specs = await page.evaluate(async () => {
    const { installReview, scenarios } =
      await import("/scripts/motion-review-scenarios.js");
    const { match: m, stadium: s } = window.__test;
    window.motionReview = installReview(m, s);
    document
      .querySelectorAll("body > *:not(#world), #world ~ *")
      .forEach((e) => (e.style.visibility = "hidden"));
    s.renderer.domElement.style.visibility = "visible";
    s.renderer.domElement.parentElement.style.visibility = "visible";
    return scenarios;
  });
  const clips = [];
  for (const spec of specs.filter(
    (g) =>
      !process.env.MOTION_REVIEW_ONLY ||
      new RegExp(process.env.MOTION_REVIEW_ONLY).test(g.id),
  )) {
    const dir = path.join(root, spec.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "slow-motion.mp4");
    const fps = 24,
      speed = 0.5,
      count = Math.ceil((spec.duration * fps) / speed) + 1;
    const encoder = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(fps),
        "-vcodec",
        "png",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        file,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let diagnostic = "";
    encoder.stderr.on("data", (d) => (diagnostic += d));
    const finished = once(encoder, "close");
    await page.evaluate((g) => motionReview.begin(g), spec);
    for (let i = 0; i < count; i++) {
      const png = await page.evaluate(
        (t) => {
          motionReview.advance(t);
          motionReview.draw();
          return __test.stadium.renderer.domElement
            .toDataURL("image/png")
            .split(",")[1];
        },
        Math.min(spec.duration, (i * speed) / fps),
      );
      if (!encoder.stdin.write(Buffer.from(png, "base64")))
        await once(encoder.stdin, "drain");
    }
    encoder.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw Error(diagnostic);
    clips.push({
      id: spec.id,
      file: `${spec.id}/slow-motion.mp4`,
      speed,
      frames: count,
      duration: count / fps,
    });
    console.log(`${spec.id}: ${count} frames, ${(count / fps).toFixed(1)} s`);
  }
  if (errors.length) throw Error(errors.join("\n"));
  const previousClips =
    process.env.MOTION_REVIEW_ONLY &&
    fs.existsSync(path.join(root, "clips.json"))
      ? JSON.parse(fs.readFileSync(path.join(root, "clips.json"))).filter(
          (old) => !clips.some((c) => c.id === old.id),
        )
      : [];
  fs.writeFileSync(
    path.join(root, "clips.json"),
    JSON.stringify([...previousClips, ...clips], null, 2),
  );
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const c of clips) {
    const tag = `<video controls preload="none" playsinline style="display:block;width:min(840px,100%);margin:12px 0" poster="${c.id}/01.png"><source src="${c.file}?v=${Math.trunc(fs.statSync(path.join(root, c.file)).mtimeMs)}" type="video/mp4"></video><p>Câmera lenta · 0,5× · <a href="${c.file}" download>Salvar clipe MP4</a></p>`;
    const re = new RegExp(
      `(<section id="${c.id}"><h2>[^<]*</h2>)(?:<video[\\s\\S]*?</video><p>Câmera lenta[\\s\\S]*?</p>)?`,
    );
    html = html.replace(re, (_, heading) => heading + tag);
  }
  fs.writeFileSync(path.join(root, "index.html"), html);
  console.log(`Saved ${clips.length} clips and updated gallery.`);
} finally {
  await browser.close();
}
