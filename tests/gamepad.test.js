import { test } from "node:test";
import assert from "node:assert/strict";
import { ControllerInput, radialStick } from "../src/gamepad.js";
import { Match } from "../src/simulation.js";
const pad = (index = 0, mapping = "standard") => ({
  id: "8BitDo Ultimate 3mode Xbox",
  index,
  mapping,
  connected: true,
  axes: [0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});
test("radial deadzone prevents drift and preserves direction and magnitude", () => {
  assert.deepEqual(radialStick(0.09, -0.08), { x: 0, z: 0 });
  const partial = radialStick(0.5, 0);
  assert.ok(partial.x > 0 && partial.x < 0.5);
  assert.equal(radialStick(1, 0).x, 1);
  assert.ok(
    Math.abs(Math.hypot(...Object.values(radialStick(1, 1))) - 1) < 1e-10,
  );
});
test("button presses are edge triggered, with one release", () => {
  const p = pad(),
    input = new ControllerInput(() => [null, p]);
  input.poll();
  p.buttons[2] = { pressed: true, value: 1 };
  assert.equal(input.poll().pressed.shoot, true);
  assert.equal(input.poll().pressed.shoot, false);
  p.buttons[2] = { pressed: false, value: 0 };
  assert.equal(input.poll().released.shoot, true);
  assert.equal(input.poll().released.shoot, false);
});
test("connect or resume with held buttons requires returning to neutral", () => {
  const p = pad();
  p.buttons[0].pressed = true;
  const input = new ControllerInput(() => [p]);
  assert.equal(input.poll().pressed.pass, undefined);
  p.buttons[0].pressed = false;
  input.poll();
  p.buttons[0].pressed = true;
  assert.equal(input.poll().pressed.pass, true);
  input.suspend();
  assert.equal(input.poll().pressed.pass, undefined);
});
test("disconnect clears motion and reports loss once", () => {
  const p = pad();
  let pads = [p];
  const input = new ControllerInput(() => pads);
  input.poll();
  p.axes[0] = 1;
  assert.equal(input.poll().x, 1);
  pads = [];
  let s = input.poll();
  assert.equal(s.disconnected, true);
  assert.equal(s.x, 0);
  assert.deepEqual(s.held, {});
  assert.equal(input.poll().disconnected, false);
});
test("nonstandard layout requires learned bindings instead of guessing", () => {
  const p = pad(0, "");
  const input = new ControllerInput(() => [p]);
  assert.equal(input.poll().supported, false);
  input.saveProfile(p.id, {
    sprint: { button: 9 },
    jockey: { button: 8 },
    pause: { button: 11 },
  });
  assert.equal(input.poll().supported, true);
  p.buttons[9].value = 0.8;
  assert.equal(input.poll().held.sprint, true);
});
test("another controller does not steal the active slot", () => {
  const a = pad(2),
    b = pad(0);
  let pads = [null, null, a];
  const input = new ControllerInput(() => pads);
  assert.equal(input.poll().index, 2);
  pads = [b, null, a];
  assert.equal(input.poll().index, 2);
});
test("half stick walks more slowly than full stick; keyboard diagonals are capped", () => {
  const simulate = (x, z) => {
    const m = new Match();
    m.start();
    // Isolate analog response from ball recovery and opposition contacts.
    Object.assign(m.ball, { owner: null, x: -40, z: -28, y: 20, vy: 0 });
    m.players.forEach((p) => {
      if (p.id !== 9) {
        p.x = -40;
        p.z = -25;
      }
    });
    for (let i = 0; i < 150; i++) m.update(1 / 120, { x, z });
    return Math.hypot(m.players[9].vx, m.players[9].vz);
  };
  assert.ok(simulate(0.5, 0) < simulate(1, 0) * 0.6);
  assert.ok(Math.abs(simulate(1, 1) - simulate(1, 0)) < 0.05);
});

test("8BitDo raw triggers never pause after calibration", () => {
  const p = pad(0, "");
  const input = new ControllerInput(() => [p]);
  input.saveProfile(p.id, {
    sprint: { button: 9 },
    jockey: { button: 8 },
    pause: { button: 11 },
    shoot: { button: 3 },
    lob: { button: 1 },
  });
  input.poll();
  p.buttons[8].value = 1;
  p.buttons[9].value = 1;
  const state = input.poll();
  assert.equal(state.held.sprint, true);
  assert.equal(state.held.jockey, true);
  assert.equal(state.pressed.pause, false);
  p.buttons[11].value = 1;
  assert.equal(input.poll().pressed.pause, true);
});
