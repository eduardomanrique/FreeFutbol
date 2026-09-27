import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/audio-review", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.GAME_URL || "http://localhost:5174/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => __test.sound.ctx.state), "running");
  const snapshots = [];
  for (const variant of [
    "match",
    "street",
    "sand",
    "court",
    "altinha",
    "futevolei",
  ]) {
    await page.evaluate((variant) => {
      const { match: m, sound } = __test;
      m.start(180, "normal", false, variant);
      sound.events.reset(m);
      sound.update(m);
    }, variant);
    await page.keyboard.down("ArrowRight");
    await page.evaluate(() => window.advanceTime(1000));
    await page.waitForTimeout(150);
    await page.keyboard.up("ArrowRight");
    await page.evaluate(() => {
      const { match: m, sound } = __test;
      m.kick(m.players[m.selected], m.ball.x + 25, m.ball.z, 40, 4);
      sound.update(m);
    });
    await page.waitForTimeout(100);
    const snapshot = await page.evaluate(() => __test.sound.snapshot());
    assert.equal(
      snapshot.surface,
      ["sand", "altinha", "futevolei"].includes(variant)
        ? "sand"
        : variant === "match"
          ? "grass"
          : variant,
    );
    assert.ok(snapshot.events.impact > 0);
    assert.ok(snapshot.events.step > 0);
    assert.ok(snapshot.voices <= 64);
    snapshots.push({ variant, ...snapshot });
  }
  await page.evaluate(() => {
    const { match: m, sound } = __test;
    m.start(180, "normal", false, "court");
    sound.events.reset(m);
    m.score[0]++;
    m.mode = "goal";
    sound.update(m);
  });
  assert.ok(
    (await page.evaluate(() => __test.sound.snapshot())).events.celebrate > 0,
  );
  await page.screenshot({ path: "output/audio-review/court.png" });
  await page.evaluate(() => {
    __test.match.mode = "paused";
    __test.sound.update(__test.match);
  });
  assert.equal(
    (await page.evaluate(() => __test.sound.snapshot())).active,
    false,
  );
  assert.equal((await page.evaluate(() => __test.sound.snapshot())).voices, 0);
  await page.click("#sound");
  assert.equal(
    (await page.evaluate(() => __test.sound.snapshot())).enabled,
    false,
  );
  await page.reload();
  await page.waitForFunction(() => window.__test);
  assert.equal(
    (await page.evaluate(() => __test.sound.snapshot())).enabled,
    false,
  );
  await page.click("#sound");
  await page.click("#start-btn");
  // Render the actual sound graph offline to verify signal energy and headroom.
  const waveforms = await page.evaluate(async () => {
    const { GameAudio } = await import("/src/audio.js");
    const output = [];
    for (const kind of ["impact", "step", "celebrate"]) {
      const a = new GameAudio(),
        c = new OfflineAudioContext(2, 44100 * 4, 44100);
      a.ctx = c;
      a.master = c.createGain();
      a.master.gain.value = 0.7;
      a.master.connect(c.destination);
      a.noise = c.createBuffer(1, 44100 * 4, 44100);
      const data = a.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      a.play(
        { kind, power: 40, x: 0, z: 0, selected: true, skid: true },
        { selected: 0, players: [{ x: 0, z: 0 }], field: { surface: "court" } },
      );
      const rendered = await c.startRendering(),
        samples = rendered.getChannelData(0);
      let peak = 0,
        energy = 0;
      for (const x of samples) {
        peak = Math.max(peak, Math.abs(x));
        energy += x * x;
      }
      output.push({ kind, peak, rms: Math.sqrt(energy / samples.length) });
    }
    return output;
  });
  for (const w of waveforms) {
    assert.ok(w.peak > 0.005, JSON.stringify(w));
    assert.ok(w.peak < 1, JSON.stringify(w));
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/audio-review/state.json",
    JSON.stringify({ snapshots, waveforms, errors }, null, 2),
  );
  console.log(JSON.stringify({ snapshots, waveforms, errors }, null, 2));
} finally {
  await browser.close();
}
