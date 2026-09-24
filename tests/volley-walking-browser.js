import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const out = "output/volley-walking";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  args: ["--use-angle=metal"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 720 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.virtualPads = [];
    Object.defineProperty(navigator, "getGamepads", {
      value: () => window.virtualPads,
    });
  });
  await page.goto("http://localhost:5173/?test");
  await page.waitForFunction(() => window.__test);
  await page.click('[data-mode="futevolei"]');
  await page.click("#start-btn");
  await page.evaluate(() => {
    const { match: m, stadium: s } = window.__test;
    window.tick = m.update.bind(m);
    window.draw = s.render.bind(s);
    m.update = () => {};
    s.render = () => {};
  });
  await page.keyboard.down("Space");
  assert.equal(
    await page.evaluate(
      () =>
        !!window.__test.match.players[window.__test.match.selected]
          .volleyPending,
    ),
    false,
  );
  await page.keyboard.up("Space");
  assert.equal(
    await page.evaluate(
      () =>
        window.__test.match.players[window.__test.match.selected].volleyPending
          .type,
    ),
    "shoot",
  );
  for (const [x, kind] of [
    [-3, "head"],
    [-1.3, "high-kick"],
  ]) {
    await page.evaluate(async (x) => {
      const m = window.__test.match;
      m.start(360, "normal", false, "futevolei");
      m.footvolley.phase = "rally";
      m.selected = 0;
      const p = m.players[0];
      Object.assign(p, { x, z: 0, dx: 1, dz: 0 });
      (await import("/src/locomotion.js")).initLocomotion(p);
      Object.assign(m.ball, {
        x: x + (x > -2 ? 0.68 : 0),
        z: 0,
        y: 2.7,
        vx: 0,
        vz: 0,
        vy: -1,
      });
    }, x);
    await page.keyboard.down("Space");
    assert.equal(
      await page.evaluate(() => window.__test.match.players[0].volleyPending),
      null,
    );
    await page.keyboard.up("Space");
    if (kind === "head") {
      const preparation = await page.evaluate(() => {
        const { match: m, stadium: s } = window.__test;
        window.draw(m, 1 / 120);
        const rig = s.rigs[m.players[0].renderId];
        const pos = (bone) => bone.getWorldPosition(rig.root.position.clone());
        const before = {
          pelvis: pos(rig.pelvis).y,
          head: pos(rig.head).y,
          leg: pos(rig.legs[0].hip).distanceTo(pos(rig.legs[0].foot)),
        };
        for (let i = 0; i < 12; i++) {
          window.tick(1 / 120, {});
          window.draw(m, 1 / 120);
        }
        return {
          drop: before.pelvis - pos(rig.pelvis).y,
          headDrop: before.head - pos(rig.head).y,
          bend:
            before.leg - pos(rig.legs[0].hip).distanceTo(pos(rig.legs[0].foot)),
          feet: rig.legs.map((l) => pos(l.toe).y),
          hit: !!m.lastTouch,
        };
      });
      assert.ok(
        preparation.drop > 0.12 && preparation.headDrop > 0.12,
        JSON.stringify(preparation),
      );
      assert.ok(preparation.bend > 0.08, JSON.stringify(preparation));
      assert.ok(preparation.feet.every((y) => y < 0.12 && y > -0.03));
      assert.equal(preparation.hit, false);
      await page.evaluate(() => window.draw(window.__test.match, 3));
      await page.screenshot({ path: `${out}/jump-preparation.png` });
      fs.writeFileSync(
        `${out}/jump-preparation.json`,
        JSON.stringify(preparation, null, 2),
      );
    }
    const result = await page.evaluate(() => {
      const { match: m } = window.__test;
      for (let i = 0; m.elapsed < 0.325 - 1e-6; i++) {
        window.tick(1 / 120, {});
        window.draw(m, 1 / 120);
      }
      const rig = window.__test.stadium.rigs[m.players[0].renderId];
      const positions = {
        head: rig.head.getWorldPosition(rig.root.position.clone()),
        pelvis: rig.pelvis.getWorldPosition(rig.root.position.clone()),
        foot: rig.legs[0].toe.getWorldPosition(rig.root.position.clone()),
        rotation: rig.root.rotation.toArray(),
      };
      return {
        positions,
        kind: m.players[0].altinhaPose?.kind,
        state: JSON.parse(window.render_game_to_text()),
      };
    });
    assert.equal(result.kind, kind);
    if (kind === "high-kick") {
      assert.ok(result.positions.foot.y > result.positions.head.y);
      const target = result.state.volleyPose.contact;
      assert.ok(
        Math.hypot(
          result.positions.foot.x - target.x,
          result.positions.foot.y - target.y,
          result.positions.foot.z - target.z,
        ) < 0.18,
      );
    }
    await page.screenshot({ path: `${out}/${kind}.png` });
    fs.writeFileSync(
      `${out}/${kind}.json`,
      JSON.stringify(result.state, null, 2),
    );
    const hit = await page.evaluate(() => {
      const m = window.__test.match;
      for (let i = 0; i < 100 && !m.lastTouch; i++) window.tick(1 / 120, {});
      return m.lastTouch;
    });
    assert.equal(hit.kind, kind);
    if (kind === "high-kick") {
      const fallen = await page.evaluate(() => {
        const { match: m, stadium: s } = window.__test;
        while (m.elapsed < 1.1) {
          window.tick(1 / 120, {});
          window.draw(m, 1 / 120);
        }
        const p = m.players[0],
          rig = s.rigs[p.renderId];
        return {
          active: !!p.altinhaPose?.acrobatic,
          height: rig.pelvis.getWorldPosition(rig.root.position.clone()).y,
        };
      });
      assert.ok(fallen.active && fallen.height < 0.6);
      await page.screenshot({ path: `${out}/high-kick-fall.png` });
      const recovered = await page.evaluate(() => {
        const { match: m, stadium: s } = window.__test;
        while (m.elapsed < 2.0) {
          window.tick(1 / 120, {});
          window.draw(m, 1 / 120);
        }
        const p = m.players[0],
          rig = s.rigs[p.renderId];
        return {
          active: !!p.altinhaPose?.acrobatic,
          height: rig.pelvis.getWorldPosition(rig.root.position.clone()).y,
        };
      });
      assert.ok(!recovered.active && recovered.height > 0.7);
      await page.screenshot({ path: `${out}/high-kick-recovery.png` });
    }
  }
  await page.evaluate(() => {
    window.__test.match.start(360, "normal", false, "futevolei");
    window.virtualPads = [
      {
        id: "Xbox test",
        index: 0,
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      },
    ];
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.virtualPads[0].buttons[2] = { pressed: true, value: 1 };
  });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(
      () =>
        !!window.__test.match.players[window.__test.match.selected]
          .volleyPending,
    ),
    false,
  );
  await page.evaluate(() => {
    window.virtualPads[0].buttons[2] = { pressed: false, value: 0 };
  });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(
      () =>
        window.__test.match.players[window.__test.match.selected].volleyPending
          ?.type,
    ),
    "shoot",
  );
  const walk = await page.evaluate(() => {
    const m = window.__test.match;
    m.start(360, "normal", false, "altinha");
    const p = m.players[0];
    const contacts = [];
    for (let i = 0; i < 240; i++) {
      window.tick(1 / 120, { x: 1 });
      window.draw(m, 1 / 120);
      if (p.lastDribble && p.lastDribble.time !== contacts.at(-1)?.time)
        contacts.push({ ...p.lastDribble });
    }
    return {
      contacts,
      x: p.x,
      ballX: m.ball.x,
      state: JSON.parse(window.render_game_to_text()),
    };
  });
  assert.ok(walk.contacts.length >= 3);
  assert.ok(walk.x > 1);
  await page.screenshot({ path: `${out}/altinha-carry.png` });
  fs.writeFileSync(`${out}/altinha.json`, JSON.stringify(walk, null, 2));
  await page.evaluate(() => {
    const m = window.__test.match;
    m.start(360, "normal", false, "grass");
    for (let i = 0; i < 180; i++) {
      window.tick(1 / 120, { x: 1, jockey: true });
      window.draw(m, 1 / 120);
    }
  });
  await page.screenshot({ path: `${out}/walk.png` });
  const normal = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  assert.equal(normal.animation.gait, "walk");
  fs.writeFileSync(`${out}/walk.json`, JSON.stringify(normal, null, 2));
  for (const [key, type] of [
    ["KeyJ", "pass"],
    ["KeyL", "lob"],
  ]) {
    await page.evaluate(async () => {
      const m = window.__test.match;
      m.start(360, "normal", false, "futevolei");
      m.footvolley.phase = "rally";
      m.footvolley.humans = [true, true, true, true];
      m.selected = 0;
      const p = m.players[0];
      Object.assign(p, { x: -8, z: 0, dx: 1, dz: 0 });
      (await import("/src/locomotion.js")).initLocomotion(p);
      Object.assign(m.ball, { x: -1.5, z: 0, y: 6, vy: 1, vx: 0, vz: 0 });
    });
    await page.keyboard.press(key);
    const motion = await page.evaluate(() => {
      const m = window.__test.match;
      const heights = [];
      for (let i = 0; i < 40; i++) {
        window.tick(1 / 120, {});
        window.draw(m, 1 / 120);
        const rig = window.__test.stadium.rigs[m.players[0].renderId];
        heights.push(
          Math.max(
            ...rig.legs.map(
              (l) => l.toe.getWorldPosition(rig.root.position.clone()).y,
            ),
          ),
        );
      }
      const rig = window.__test.stadium.rigs[m.players[0].renderId];
      return {
        x: m.players[0].x,
        type: m.players[0].volleyPending?.type,
        footLift: Math.max(...heights) - Math.min(...heights),
        bodyPlanted: !!rig.altinhaBodyContact,
      };
    });
    assert.equal(motion.type, type);
    if (type === "pass") {
      assert.ok(motion.footLift > 0.025, JSON.stringify(motion));
      assert.equal(motion.bodyPlanted, false);
    }
    assert.ok(
      type === "pass" ? motion.x > -7.8 : Math.abs(motion.x + 8) < 0.001,
    );
    await page.screenshot({ path: `${out}/${type}-approach.png` });
  }
  const support = await page.evaluate(async () => {
    const { match: m } = window.__test;
    m.start(360, "normal", false, "futevolei");
    m.footvolley.phase = "rally";
    m.selected = 0;
    const p = m.players[0],
      q = m.players[1];
    Object.assign(p, { x: -6, z: 0, dx: 1, dz: 0 });
    Object.assign(q, { x: -4.6, z: 0.2, dx: 1, dz: 0 });
    const { initLocomotion } = await import("/src/locomotion.js");
    initLocomotion(p);
    initLocomotion(q);
    Object.assign(m.ball, { x: -4.5, z: 0, y: 4.3, vx: 0, vz: 0, vy: 0 });
    m.volleyAction("pass", {});
    let gap = Infinity;
    for (let i = 0; i < 65 && !m.lastTouch; i++) {
      window.tick(1 / 120, {});
      window.draw(m, 1 / 120);
      gap = Math.min(gap, Math.hypot(p.x - q.x, p.z - q.z));
    }
    window.draw(m, 3);
    return {
      gap,
      partnerZ: q.z,
      receiver: m.footvolley.receiver,
      partnerPending: q.volleyPending,
    };
  });
  assert.equal(support.receiver, 0);
  assert.equal(support.partnerPending, null);
  assert.ok(support.gap > 1 && support.partnerZ > 0.65);
  await page.screenshot({ path: `${out}/reception-support.png` });
  const paces = [];
  for (const [label, command] of [
    ["walk", { jockey: true }],
    ["normal", {}],
    ["sprint", { sprint: true }],
  ]) {
    const pace = await page.evaluate((command) => {
      const m = window.__test.match;
      m.start(360, "normal", false, "match");
      const p = m.players[m.selected];
      p.id = 0;
      m.players = [p];
      m.selected = 0;
      Object.assign(m.ball, { owner: null, x: -35, z: 25 });
      for (let i = 0; i < 300; i++) {
        window.tick(1 / 120, { x: 1, ...command });
        window.draw(m, 1 / 120);
      }
      return { speed: Math.hypot(p.vx, p.vz), gait: p.motion.gait };
    }, command);
    paces.push(pace);
    assert.equal(pace.gait, label === "normal" ? "jog" : label);
    await page.screenshot({ path: `${out}/pace-${label}.png` });
  }
  assert.ok(paces[0].speed < paces[1].speed && paces[1].speed < paces[2].speed);
  fs.writeFileSync(`${out}/paces.json`, JSON.stringify(paces, null, 2));
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://localhost:5173/?test");
  await mobile.waitForFunction(() => window.__test);
  await mobile.selectOption("#game-mode", "futevolei");
  await mobile.click("#start-btn");
  await mobile.evaluate(() => {
    window.__test.match.update = () => {};
  });
  const btn = mobile.locator('[data-touch="volley-shoot"]');
  await btn.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    bubbles: true,
  });
  assert.equal(
    await mobile.evaluate(
      () =>
        !!window.__test.match.players[window.__test.match.selected]
          .volleyPending,
    ),
    false,
  );
  await btn.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    bubbles: true,
  });
  assert.equal(
    await mobile.evaluate(
      () =>
        window.__test.match.players[window.__test.match.selected].volleyPending
          ?.type,
    ),
    "shoot",
  );
  await mobile.screenshot({ path: `${out}/mobile.png` });
  assert.deepEqual(errors, []);
  console.log(
    "Jump, high kick, release controls, walking and rolling touches passed",
    errors,
  );
} finally {
  await browser.close();
}
