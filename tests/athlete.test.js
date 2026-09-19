import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAthlete, animateAthlete } from "../src/athlete.js";
import { Match } from "../src/simulation.js";
import { Calibration, CALIBRATION_STEPS } from "../src/calibration.js";
test("athlete has a complete leg hierarchy and resolves finite transforms", () => {
  const m = new Match();
  m.start();
  const p = m.players[9],
    rig = buildAthlete(9);
  animateAthlete(rig, p, m, 1 / 60);
  assert.equal(rig.legs[0].knee.parent, rig.legs[0].hip);
  assert.equal(rig.legs[0].ankle.parent, rig.legs[0].knee);
  assert.ok(
    rig.parts.every((part) =>
      part.node.matrixWorld.elements.every(Number.isFinite),
    ),
  );
});
test("calibration learns raw buttons and axis triggers without treating them as Menu", () => {
  const c = new Calibration(),
    raw = { buttons: Array(16).fill(0), axes: [0, 0, 0, 0, -1, -1] };
  for (let i = 0; i < 4; i++) c.update(raw, 0.1);
  assert.equal(c.phase, "press");
  const buttons = [0, 1, 3, 4, 6, 7, null, null, 11];
  for (let i = 0; i < 9; i++) {
    if (buttons[i] !== null) raw.buttons[buttons[i]] = 1;
    else raw.axes[i === 6 ? 4 : 5] = 1;
    c.update(raw, 0.016);
    assert.equal(c.phase, "release", CALIBRATION_STEPS[i][0]);
    raw.buttons.fill(0);
    raw.axes[4] = -1;
    raw.axes[5] = -1;
    c.update(raw, 0.016);
  }
  assert.equal(c.phase, "done");
  assert.equal(c.bindings.jockey.axis, 4);
  assert.equal(c.bindings.sprint.axis, 5);
  assert.equal(c.bindings.pause.button, 11);
});
