import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(
    "https://quaternius.itch.io/universal-base-characters/purchase",
  );
  await page.locator(".direct_download_btn").click();
  await page.waitForSelector(".upload");
  const waiting = page.waitForEvent("download", { timeout: 120000 });
  await page.locator(".upload a").click();
  const download = await waiting;
  await download.saveAs("/tmp/universal-base-standard.zip");
  console.log(
    "Saved official CC0 Standard pack to /tmp/universal-base-standard.zip",
  );
} finally {
  await browser.close();
}
