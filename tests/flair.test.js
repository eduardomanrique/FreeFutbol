import { test } from "node:test";
import assert from "node:assert/strict";
import { tryFlair } from "../src/flair.js";
import { Match } from "../src/simulation.js";
test("rare flair has a cooldown, rejects pressure/sprints and never alters play state", () => {
  for (const variant of ["match", "street", "sand", "court", "duel"]) {
    const m = new Match();
    m.start(180, "normal", false, variant);
    const p = m.players.find((p) => !p.keeper) ?? m.players[0];
    p.keeper = false;
    p.x = p.z = 0;
    p.vx = p.vz = 0;
    m.players
      .filter((q) => q !== p)
      .forEach((q) => {
        q.x = 20;
        q.z = 20;
      });
    const before = JSON.stringify([m.ball, m.controls, p.x, p.z, p.vx, p.vz]);
    assert.equal(tryFlair(m, p, "pass", 0.95), false);
    assert.equal(tryFlair(m, p, "pass", 0), true);
    assert.equal(tryFlair(m, p, "receive", 0), false);
    assert.equal(
      JSON.stringify([m.ball, m.controls, p.x, p.z, p.vx, p.vz]),
      before,
    );
    m.elapsed = 10;
    p.vx = 6;
    assert.equal(tryFlair(m, p, "pass", 0), false);
    p.vx = 0;
    const rival = m.players.find((q) => q.team !== p.team);
    rival.x = rival.z = 1;
    assert.equal(tryFlair(m, p, "receive", 0), false);
    m.physics.dispose();
  }
});
