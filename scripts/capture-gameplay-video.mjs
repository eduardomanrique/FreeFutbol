import { chromium } from "playwright";
import fs from "node:fs";

const outDir = "output/gameplay-video";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.locator("#start-btn").click();
await page.waitForTimeout(1200);

const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(250);
};

// Establish a readable broadcast sequence: carry, sprint, pass, then a charged finish.
await hold("d", 1800);
await page.keyboard.down("Shift");
await hold("d", 1300);
await page.keyboard.up("Shift");
await hold("j", 550);
await hold("d", 900);
await page.keyboard.down("Space");
await page.waitForTimeout(900);
await page.keyboard.up("Space");
await page.waitForTimeout(2200);

const state = await page.evaluate(() => window.render_game_to_text?.() ?? null);
fs.writeFileSync(`${outDir}/state.json`, state ?? "null");
fs.writeFileSync(`${outDir}/errors.json`, JSON.stringify(errors, null, 2));
await page.screenshot({ path: `${outDir}/final.png` });
await context.close();
const videoPath = await page.video().path();
fs.copyFileSync(videoPath, `${outDir}/campo-26-gameplay.webm`);
await browser.close();
console.log(JSON.stringify({ video: `${outDir}/campo-26-gameplay.webm`, state: `${outDir}/state.json`, errors }));
