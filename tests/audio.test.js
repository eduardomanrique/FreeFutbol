import test from "node:test";
import assert from "node:assert/strict";
import { SoundEvents } from "../src/audio.js";
const fixture = () => ({
  mode: "playing",
  elapsed: 1,
  variant: "court",
  score: [0, 0],
  field: { surface: "court" },
  selected: 0,
  players: [
    {
      id: 0,
      x: 0,
      z: 0,
      vx: 4,
      vz: 0,
      locomotion: { ax: 10, feet: [{ landings: 0 }, { landings: 0 }] },
    },
  ],
  ball: { x: 0, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0 },
  kickReleasedAt: 0,
});
test("contacts follow ball physics, once per contact, including strong shots and sand bounces", () => {
  const m = fixture(),
    audio = new SoundEvents();
  audio.update(m);
  m.kickReleasedAt = 1;
  m.ball.vx = 40;
  assert.equal(audio.update(m)[0].power, 40);
  assert.deepEqual(audio.update(m), []);
  m.ball.vy = -5;
  m.ball.y = 0.14;
  audio.reset(m);
  m.ball.vy = 0;
  m.ball.y = 0.11;
  assert.equal(audio.update(m)[0].kind, "bounce");
  assert.deepEqual(audio.update(m), []);
});
test("actual landings, celebrations and pause do not repeat or create phantom events", () => {
  const m = fixture(),
    audio = new SoundEvents();
  audio.update(m);
  m.players[0].locomotion.feet[0].landings++;
  assert.equal(audio.update(m)[0].kind, "step");
  assert.deepEqual(audio.update(m), []);
  m.score[0]++;
  m.mode = "goal";
  assert.equal(audio.update(m)[0].kind, "celebrate");
  assert.deepEqual(audio.update(m), []);
  m.mode = "paused";
  m.ball.vx = 30;
  m.players[0].locomotion.feet[1].landings++;
  assert.deepEqual(audio.update(m), []);
  m.mode = "playing";
  assert.deepEqual(audio.update(m), []);
});
test("restarts, new matches and ball placement are silent; altinha contacts are detected", () => {
  const m = fixture(),
    audio = new SoundEvents();
  audio.update(m);
  m.ball.x = 20;
  m.ball.vx = 30;
  assert.deepEqual(audio.update(m), []);
  m.elapsed = 0;
  m.ball.vx = 0;
  assert.deepEqual(audio.update(m), []);
  m.altinha = { lastTouch: { at: 0.1 } };
  m.ball.vy = 7;
  assert.equal(audio.update(m)[0].kind, "impact");
  m.players = [...m.players];
  m.score = [0, 1];
  assert.deepEqual(audio.update(m), []);
});

test("replicated player arrays preserve contact and score transitions", () => {
  const m = fixture(),
    audio = new SoundEvents();
  m.multiplayer = true;
  audio.update(m);
  m.players = m.players.map((p) => ({ ...p }));
  m.ball.vx = 20;
  assert.equal(audio.update(m)[0].kind, "impact");
  m.players = m.players.map((p) => ({ ...p }));
  m.score[0]++;
  assert.equal(audio.update(m)[0].kind, "celebrate");
});
