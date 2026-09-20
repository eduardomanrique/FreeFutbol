import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/tactics", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(() => {
    const m = window.__test.match;
    window.stepTactics = m.update.bind(m);
    m.update = () => {};
  });
  const results = [];
  for (const side of [-1, 1]) {
    results.push(
      await page.evaluate((side) => {
        const m = window.__test.match;
        m.start();
        m.selected = 7;
        const p = m.players[7];
        p.x = 0;
        p.z = side * 20;
        Object.assign(m.ball, { x: 0.6, z: p.z, owner: p.id, vx: 0, vz: 0 });
        for (let i = 0; i < 120; i++) window.stepTactics(1 / 120, {});
        return {
          side,
          defenders: m.players
            .filter((p) => p.team === 1 && !p.keeper)
            .map((p) => ({ z: p.z, homeZ: p.homeZ })),
        };
      }, side),
    );
    await page.screenshot({ path: `output/tactics/flank-${side}.png` });
  }
  const pass = await page.evaluate(() => {
    const m = window.__test.match;
    m.start();
    m.random = () => 0;
    for (const p of m.players) p.think = 99;
    m.kickCooldown = 0;
    m.beginAction("pass", { x: -1, z: -1 });
    m.releaseAction(0.4);
    for (let i = 0; i < 180 && !m.lastPass; i++)
      window.stepTactics(1 / 120, {});
    if (!m.lastPass) return { error: "no contact" };
    const target = m.lastPass.target,
      kicker = m.lastKicker;
    let received = false;
    for (let i = 0; i < 360; i++) {
      window.stepTactics(1 / 120, {});
      if (m.ball.owner === target) {
        received = true;
        break;
      }
    }
    return {
      target,
      kicker,
      received,
      lastReception: m.lastReception,
      owner: m.ball.owner,
    };
  });
  await page.screenshot({ path: "output/tactics/received.png" });
  assert.ok(pass.received, JSON.stringify(pass));
  for (const result of results)
    assert.ok(
      result.defenders.filter((p) => (p.z - p.homeZ) * result.side > 0)
        .length >= 8,
    );
  const shortPass = await page.evaluate(async () => {
    const m = window.__test.match;
    const { initLocomotion } = await import("/src/locomotion.js");
    m.start();
    m.random = () => 0.5;
    m.kickCooldown = 0;
    for (const p of m.players) {
      p.x = -35;
      p.z = 25;
      p.think = 99;
      initLocomotion(p);
    }
    Object.assign(m.players[9], { x: 0, z: 0, dx: 1, dz: 0 });
    Object.assign(m.players[7], { x: 7, z: 3 });
    Object.assign(m.players[10], { x: 25, z: 0 });
    [9, 7, 10].forEach((id) => initLocomotion(m.players[id]));
    Object.assign(m.ball, { x: 0.6, z: 0, owner: 9, vx: 0, vz: 0 });
    m.switchPlayer();
    const held = m.selected;
    m.beginAction("pass", { x: 1 });
    m.releaseAction(0.1);
    for (let i = 0; i < 150 && !m.lastPass; i++)
      window.stepTactics(1 / 120, {});
    const target = m.lastPass?.target;
    m.switchPlayer();
    const protectedTarget = m.selected;
    return { held, target, protectedTarget };
  });
  assert.equal(shortPass.held, 9);
  assert.equal(shortPass.target, 7);
  assert.equal(shortPass.protectedTarget, 7);
  await page.screenshot({ path: "output/tactics/short-pass.png" });
  const shot = await page.evaluate(async () => {
    const m = window.__test.match;
    const { initLocomotion } = await import("/src/locomotion.js");
    m.start();
    m.random = () => 0.5;
    for (const p of m.players) {
      p.x = -35;
      p.z = 25;
      p.think = 99;
      initLocomotion(p);
    }
    const p = m.players[9],
      g = m.players[11];
    p.x = 27.35;
    p.z = 0;
    g.x = 43.6;
    g.z = 0;
    initLocomotion(p);
    initLocomotion(g);
    Object.assign(m.ball, { x: 28, z: 0, owner: 9 });
    m.beginAction("shoot", {});
    m.aimAction({ z: 1 });
    m.releaseAction(0.65);
    for (let i = 0; i < 480 && m.mode !== "goal" && !m.lastSave; i++)
      window.stepTactics(1 / 120, {});
    return { score: m.score, save: m.lastSave };
  });
  assert.equal(shot.score[0], 1);
  await page.screenshot({ path: "output/tactics/corner-goal.png" });
  const assisted = [];
  for (const input of [{ x: 1, sprint: true }, { x: -1, z: 0.6 }, { z: 1 }]) {
    await page.evaluate(async (input) => {
      const m = window.__test.match;
      const { initLocomotion } = await import("/src/locomotion.js");
      m.start();
      m.random = () => 0;
      for (const p of m.players) {
        p.x = -35;
        p.z = 25;
        p.think = 99;
        initLocomotion(p);
      }
      const receiver = m.players[8],
        passer = m.players[9];
      Object.assign(passer, { x: 0, z: 0 });
      initLocomotion(passer);
      Object.assign(receiver, { x: 12, z: 3 });
      initLocomotion(receiver);
      receiver.vx = 3;
      Object.assign(m.ball, { x: 0.6, z: 0, y: 0.11, owner: 9 });
      m.kick(passer, 12, 3, 16, 0);
      m.lastPass = {
        team: 0,
        target: 8,
        flight: m.ballFlight,
        contactAt: m.elapsed,
        receiveWindow: 4,
      };
      m.selectForTeam(receiver);
      for (let i = 0; i < 30; i++) window.stepTactics(1 / 120, input);
    }, input);
    const prediction = await page.evaluate(
      () => JSON.parse(window.render_game_to_text()).receiveAssist,
    );
    assert.ok(prediction && prediction.time > 0);
    await page.screenshot({
      path: `output/tactics/assisted-${assisted.length}.png`,
    });
    const received = await page.evaluate((input) => {
      const m = window.__test.match;
      for (let i = 0; i < 400 && m.ball.owner === null; i++)
        window.stepTactics(1 / 120, input);
      const owner = m.ball.owner;
      window.stepTactics(1 / 120, input);
      return { owner, assist: m.players[8].receiveAssist, x: m.players[8].x };
    }, input);
    assert.equal(received.owner, 8);
    assert.equal(received.assist, null);
    assisted.push({ input, prediction, received });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/tactics/results.json",
    JSON.stringify(
      { results, pass, shortPass, shot, assisted, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ pass, errors }));
} finally {
  await browser.close();
}
