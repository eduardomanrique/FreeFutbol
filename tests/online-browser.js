import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/online", { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args:
    process.platform === "darwin" && process.env.HEADED === "1"
      ? ["--use-angle=metal"]
      : [],
});
const errors = [];
try {
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  ]);
  // Two independent windows emulate two machines; keep each game focused for input tests.
  for (const context of contexts)
    await context.addInitScript(() => {
      window.onlinePads = [];
      Object.defineProperty(navigator, "getGamepads", {
        value: () => window.onlinePads,
      });
      Object.defineProperty(document, "hasFocus", { value: () => true });
      Object.defineProperty(document, "hidden", { get: () => false });
      window.addEventListener(
        "blur",
        (event) => event.stopImmediatePropagation(),
        true,
      );
    });
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  for (const p of [a, b]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
  }
  await Promise.all([a, b].map((p) => p.goto(process.env.DEPLOY_URL || "http://localhost:5173/?test")));
  await Promise.all(
    [a, b].map((p) =>
      p.waitForFunction(() => window.render_game_to_text, { timeout: 60000 }),
    ),
  );
  await a.selectOption("#game-mode", "online");
  await a.click("#online-create");
  await a.waitForFunction(
    () => document.getElementById("online-code").textContent.length === 6,
  );
  const code = await a.locator("#online-code").textContent();
  await b.selectOption("#game-mode", "online");
  await b.fill("#room-code", code);
  await b.click("#online-join");
  await b.waitForFunction(
    () => !document.getElementById("online-lobby").hidden,
  );
  await a.click("#online-ready");
  await b.click("#online-ready");
  await a.waitForFunction(
    () => !document.getElementById("online-start").disabled,
  );
  await a.screenshot({ path: "output/online/lobby.png" });
  await a.click("#online-start");
  await Promise.all(
    [a, b].map((p) =>
      p.waitForFunction(
        () => JSON.parse(window.render_game_to_text()).network.tick > 10,
      ),
    ),
  );
  const state = (p) =>
    p.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal((await state(a)).network.team, 0);
  assert.equal((await state(b)).network.team, 1);
  // Verify release reaches the server; client never supplies power or ball position.
  await a.keyboard.down("Space");
  await a.waitForTimeout(180);
  await a.keyboard.up("Space");
  await a.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).lastShot !== null,
    { timeout: 10000 },
  );
  const shot = (await state(a)).lastShot;
  assert.ok(shot.power > 0);
  const before = await state(b);
  await b.keyboard.down("ArrowLeft");
  await b.keyboard.down("Shift");
  await b.waitForTimeout(600);
  await b.keyboard.up("ArrowLeft");
  await b.keyboard.up("Shift");
  const after = await state(b);
  assert.ok(after.players[after.selected].x < before.players[after.selected].x);
  await b.keyboard.press("KeyQ");
  await b.waitForTimeout(150);
  assert.ok((await state(b)).selected >= 11);
  await a.keyboard.press("Escape");
  const pausedTime = (await state(a)).time;
  await a.waitForTimeout(350);
  assert.ok(
    (await state(a)).time > pausedTime,
    "online menu must not pause the server",
  );
  await a.click("#resume");
  await Promise.all([
    a.screenshot({ path: "output/online/atletico.png" }),
    b.screenshot({ path: "output/online/uniao.png" }),
  ]);
  assert.equal(await b.locator("#player-team").textContent(), "UNIÃO");
  await b.evaluate(() => {
    window.onlinePads = [
      {
        id: "Online standard controller",
        index: 0,
        mapping: "standard",
        connected: true,
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      },
    ];
  });
  await b.waitForTimeout(100);
  const beforeControllerAck = (await state(b)).network.ack;
  await b.evaluate(() => {
    window.onlinePads[0].buttons[4] = { pressed: true, value: 1 };
  });
  await b.waitForTimeout(100);
  await b.evaluate(() => {
    window.onlinePads[0].buttons[4] = { pressed: false, value: 0 };
  });
  await b.waitForFunction(
    (ack) => {
      const s = JSON.parse(window.render_game_to_text());
      // A previous keyboard switch may still be the last action. Wait for a
      // fresh server acknowledgement; switching is now locked with possession.
      return s.network.ack > ack &&
        (s.possessionTeam === s.network.team || s.lastAction === "switch");
    },
    beforeControllerAck,
  );
  assert.ok((await state(b)).network.ack > beforeControllerAck);
  assert.ok((await state(b)).selected >= 11);
  // Session reload reconnects to the same server-owned match and team.
  const tickBeforeReload = (await state(b)).network.tick;
  await b.reload();
  await b.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).network.tick > 10,
    { timeout: 60000 },
  );
  assert.equal((await state(b)).network.team, 1);
  assert.ok((await state(b)).network.tick >= tickBeforeReload);
  // Real transport outage pauses the match; the same session resumes automatically.
  await contexts[1].setOffline(true);
  await a.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text()).network.status ===
      "reconnecting",
    { timeout: 15000 },
  );
  await contexts[1].setOffline(false);
  await b.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).network.status === "playing",
    { timeout: 15000 },
  );
  await a.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).network.status === "playing",
  );
  fs.writeFileSync(
    "output/online/states.json",
    JSON.stringify({ a: await state(a), b: await state(b) }, null, 2),
  );
  await b.keyboard.press("Escape");
  await b.click("#leave");
  await a.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).network.active === false,
  );
  assert.equal((await state(a)).mode, "home");
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({
    path: "output/online/mobile-lobby.png",
    fullPage: true,
  });
  assert.equal(
    await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(
    errors.filter(
      (e) =>
        !e.includes("ERR_INTERNET_DISCONNECTED") &&
        !e.includes("WebSocket connection"),
    ),
    [],
  );
  console.log(
    "Online browser passed: lobby, two teams, shot, movement, switch, menu, reload, outage/reconnect, leave, mobile.",
  );
} finally {
  await browser.close();
}
