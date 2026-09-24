import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
fs.mkdirSync("output/gameplay-actions", { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 700 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  await page.evaluate(async () => {
    const { match: m, stadium: s } = window.__test;
    const { initLocomotion } = await import("/src/locomotion.js");
    const { placeFreeKick } = await import("/src/free-kicks.js");
    const update = m.update.bind(m),
      render = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
    window.fixtures = {
      m,
      s,
      placeFreeKick,
      setup(variant = "match") {
        m.start(180, "normal", false, variant);
        m.random = () => 0.99;
        m.multiplayer = true;
        for (const p of m.players) {
          Object.assign(p, {
            x: -m.field.halfLength + 3,
            z: m.field.halfWidth - 2,
            think: 99,
            vx: 0,
            vz: 0,
          });
          initLocomotion(p);
        }
        m.ball.owner = null;
        m.ball.lastTeam = 1;
        m.ball.x = -15;
        m.ball.z = 5;
        m.eventTime = 0;
      },
      position(p, x, z, dx = 1) {
        Object.assign(p, { x, z, dx, dz: 0, vx: 0, vz: 0 });
        initLocomotion(p);
      },
      tick(n, input = {}) {
        for (let i = 0; i < n; i++) update(1 / 120, input, {});
      },
      draw(x = 0, z = 0, zoom = 1) {
        render(m, 0.016);
        s.camera.position.set(x + 5 * zoom, 3.2 * zoom, z + 6 * zoom);
        s.camera.lookAt(x, 0.9, z);
        s.renderer.render(s.scene, s.camera);
      },
    };
  });
  const report = {};
  report.speed = await page.evaluate(() => {
    const f = window.fixtures,
      { m, s } = f;
    f.setup();
    const p = m.players[m.selected];
    f.position(p, -20, 0);
    f.tick(330, { x: 1, z: 0, sprint: true });
    f.draw(p.x, p.z);
    return {
      speed: Math.hypot(p.vx, p.vz),
      effect: p.topSpeed,
      visible: s.playerEffects.rows[p.id].streaks.filter((s) => s.visible)
        .length,
    };
  });
  assert.ok(
    report.speed.effect && report.speed.visible === 6,
    JSON.stringify(report.speed),
  );
  await page.screenshot({ path: "output/gameplay-actions/speed.png" });
  report.foul = await page.evaluate(() => {
    const f = window.fixtures,
      { m } = f;
    f.setup();
    const p = m.players[m.selected],
      q = m.players[20];
    m.controls[1].selected = q.id;
    f.position(p, 0, 0);
    f.position(q, 1.6, 0);
    Object.assign(m.ball, { x: 8, z: 2, owner: null, lastTeam: 1 });
    m.tackle(true);
    f.tick(40);
    f.draw(0.7, 0);
    return { foul: m.foul, fall: q.knockdown, slide: p.slide };
  });
  assert.ok(report.foul.foul && report.foul.fall && report.foul.slide);
  await page.screenshot({ path: "output/gameplay-actions/slide-fall.png" });
  report.street = await page.evaluate(() => {
    const f = window.fixtures,
      { m } = f;
    f.setup("street");
    const p = m.players[m.selected],
      q = m.players[5];
    m.controls[1].selected = q.id;
    f.position(p, 0, 0);
    f.position(q, 1.6, 0);
    Object.assign(m.ball, { x: 8, z: 2, owner: null, lastTeam: 1 });
    m.tackle();
    f.tick(40);
    f.draw(0.7, 0);
    return { foul: m.foul, fall: q.knockdown };
  });
  assert.equal(report.street.foul, null);
  assert.ok(report.street.fall);
  await page.screenshot({ path: "output/gameplay-actions/street-fall.png" });
  report.jump = await page.evaluate(() => {
    const f = window.fixtures,
      { m } = f;
    f.setup("street");
    m.random = () => 0;
    const p = m.players[m.selected],
      q = m.players[5];
    m.controls[1].selected = q.id;
    f.position(p, 0, 0);
    f.position(q, 1.6, 0, -1);
    Object.assign(m.ball, { x: 8, z: 2, owner: null, lastTeam: 1 });
    m.tackle();
    f.tick(24);
    f.draw(0.8, 0);
    return { jump: q.evade, fall: q.knockdown };
  });
  assert.ok(
    report.jump.jump?.height > 0.35 && !report.jump.fall,
    JSON.stringify(report.jump),
  );
  await page.screenshot({ path: "output/gameplay-actions/jump.png" });
  report.wall = await page.evaluate(() => {
    const f = window.fixtures,
      { m, s } = f;
    f.setup();
    f.placeFreeKick(m, { team: 0, victim: 9, x: 25, z: 0 });
    f.draw(30, 0, 2);
    return m.setPiece;
  });
  assert.equal(report.wall.wall.length, 3);
  await page.screenshot({ path: "output/gameplay-actions/wall.png" });
  report.bicycle = await page.evaluate(() => {
    const f = window.fixtures,
      { m } = f;
    f.setup();
    const p = m.players[m.selected];
    f.position(p, 36, 0, -1);
    Object.assign(m.ball, {
      owner: null,
      lastTeam: 0,
      x: 36.9,
      z: 0,
      y: 2.15,
      vx: -3,
      vz: 0,
      vy: 0,
    });
    m.beginAction("shoot", {});
    m.releaseAction(0.7);
    f.tick(39);
    f.draw(36, 0);
    return { bicycle: p.bicycle, shot: m.lastShot };
  });
  assert.ok(
    report.bicycle.bicycle && report.bicycle.shot?.bicycle,
    JSON.stringify(report.bicycle),
  );
  await page.screenshot({ path: "output/gameplay-actions/bicycle.png" });
  report.beachBicycle = await page.evaluate(() => {
    const f=window.fixtures,{m}=f;f.setup("sand");
    const p=m.players[1];f.position(p,12,0,-1);
    Object.assign(m.ball,{owner:null,lastTeam:0,x:12.9,z:0,y:2.15,vx:-3,vz:0,vy:0});
    f.tick(39);f.draw(12,0);
    return {bicycle:p.bicycle,shot:m.lastShot,cooldown:p.nextBicycle-m.elapsed};
  });
  assert.ok(report.beachBicycle.bicycle && report.beachBicycle.shot?.bicycle);
  assert.ok(report.beachBicycle.cooldown<3);
  await page.screenshot({path:"output/gameplay-actions/beach-bicycle.png"});
  report.keeper = await page.evaluate(() => {
    const f = window.fixtures,
      { m } = f;
    f.setup();
    const k = m.players[11],
      a = m.players[9];
    f.position(k, 43.5, 0, -1);
    f.position(a, 39, 0);
    Object.assign(m.ball, {
      owner: 9,
      lastTeam: 0,
      x: 39.7,
      z: 0,
      y: 0.11,
      vx: 0,
      vz: 0,
      vy: 0,
    });
    for (let i = 0; i < 300 && !m.lastSave; i++) f.tick(1);
    f.draw(k.x, 0);
    return m.lastSave;
  });
  assert.equal(report.keeper?.kind, "catch");
  await page.screenshot({ path: "output/gameplay-actions/keeper.png" });
  report.goal = await page.evaluate(() => {
    const f = window.fixtures,
      { m } = f;
    f.setup("street");
    m.mode = "goal";
    m.score = [1, 0];
    m.restartTeam = 1;
    m.lastGoalTeam = 0;
    m.restartTimer = 3;
    const p = m.players[2],
      q = m.players[5];
    f.position(p, 0, 0);
    f.position(q, 2, 0);
    f.tick(90);
    f.draw(1, 0, 1.4);
    const rig=f.s.rigs[q.renderId],head=rig.head.getWorldPosition(rig.root.position.clone());
    return { winner: p.celebration, loser: q.celebration, fixed:p.x===0&&q.x===2,
      hands:rig.arms.map(a=>a.palm.getWorldPosition(rig.root.position.clone()).distanceTo(head)) };
  });
  assert.ok(report.goal.winner.won && !report.goal.loser.won);
  assert.ok(report.goal.fixed);
  assert.ok(report.goal.hands.every(d=>d<.3),JSON.stringify(report.goal.hands));
  await page.screenshot({ path: "output/gameplay-actions/celebration.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "output/gameplay-actions/results.json",
    JSON.stringify({ report, errors }, null, 2),
  );
  console.log(
    "Sprint FX, slide/foul, street fall, evasion, wall, bicycle, keeper and celebrations passed.",
  );
} finally {
  await browser.close();
}
