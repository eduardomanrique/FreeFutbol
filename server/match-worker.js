import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { randomBytes } from "node:crypto";
import { MatchSession } from "../src/core/session.js";
import {
  TICK_RATE,
  SNAPSHOT_RATE,
  INPUT_TIMEOUT_MS,
  renderState,
  encodeState,
} from "../shared/protocol.js";
const session = new MatchSession({
  seed: randomBytes(4).readUInt32LE(),
  multiplayer: true,
  record: false,
  runtime: `Node ${process.version}`,
});
const match = session.match;
session.start(workerData.duration, "normal");
let tick = 0,
  paused = true,
  last = performance.now(),
  accumulator = 0;
const neutral = [true, true];
const inputs = [{}, {}],
  queues = [[], []],
  received = [0, 0],
  acks = [-1, -1];
let busyMs = 0,
  measuredTicks = 0,
  maxTickMs = 0,
  behind = 0;
function neutralize(team) {
  inputs[team] = {};
  queues[team] = [];
  if (!neutral[team])
    match.withTeam(team, () => session.action("cancelAction"));
  neutral[team] = true;
}
parentPort.on("message", (message) => {
  if (message.type === "input") {
    if (paused) return;
    const { team, input } = message;
    if (queues[team].length >= 120) return;
    queues[team].push(input);
    received[team] = performance.now();
  } else if (message.type === "pause") {
    paused = message.value;
    for (const team of [0, 1]) neutralize(team);
    accumulator = 0;
    last = performance.now();
    publish();
  }
});
function publish() {
  parentPort.postMessage({
    type: "snapshot",
    payload: encodeState(renderState(match, tick, acks)),
    tick,
    finished: match.mode === "finished",
    metrics: {
      meanTickMs: busyMs / Math.max(1, measuredTicks),
      maxTickMs,
      behind,
    },
  });
}
function simulate() {
  for (const team of [0, 1]) {
    match.withTeam(team, () => {
      for (const input of queues[team]) {
        if (input.seq <= acks[team]) continue;
        acks[team] = input.seq;
        inputs[team] = input;
        neutral[team] = false;
        session.action("aimAction", [input]);
        for (const event of input.events) {
          if (event.type === "begin")
            session.action("beginAction", [event.action, input]);
          if (event.type === "release")
            session.action("releaseAction", [match.charge, input.finesse]);
          if (event.type === "switch") {
            session.action("cancelAction");
            session.action("switchPlayer");
          }
          if (event.type === "tackle") session.action("tackle");
          if (event.type === "slide") session.action("tackle", [true]);
          if (event.type === "cancel") neutralize(team);
        }
      }
      queues[team] = [];
      if (performance.now() - received[team] > INPUT_TIMEOUT_MS)
        neutralize(team);
    });
  }
  session.step(inputs[0], inputs[1]);
  tick++;
}
const timer = setInterval(() => {
  const now = performance.now();
  if (paused || match.mode === "finished") {
    last = now;
    return;
  }
  accumulator += (now - last) / 1000;
  last = now;
  if (accumulator > 0.25) {
    behind++;
    accumulator = 0.25;
  }
  let count = 0;
  while (accumulator >= 1 / TICK_RATE && count++ < 16) {
    const started = performance.now();
    simulate();
    const cost = performance.now() - started;
    busyMs += cost;
    measuredTicks++;
    maxTickMs = Math.max(maxTickMs, cost);
    accumulator -= 1 / TICK_RATE;
    if (tick % (TICK_RATE / SNAPSHOT_RATE) === 0 || match.mode === "finished")
      publish();
    if (match.mode === "finished") break;
  }
}, 4);
parentPort.on("close", () => {
  clearInterval(timer);
  match.physics.dispose();
});
parentPort.postMessage({ type: "ready" });
publish();
