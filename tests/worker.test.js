import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
test(
  "worker owns action clocks, expires missing inputs and freezes during reconnect",
  { timeout: 10000 },
  async () => {
    const worker = new Worker(
      new URL("../server/match-worker.js", import.meta.url),
      { workerData: { duration: 180 } },
    );
    const messages = [];
    let failure;
    worker.on("message", (m) => messages.push(m));
    worker.on("error", (e) => {
      failure = e;
    });
    async function wait(predicate) {
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        if (failure) throw failure;
        const i = messages.findIndex(predicate);
        if (i >= 0) return messages.splice(i, 1)[0];
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error("Worker timeout");
    }
    const snapshot = (m) =>
      m.type === "snapshot" && JSON.parse(m.payload).state;
    try {
      await wait((m) => m.type === "ready");
      worker.postMessage({ type: "pause", value: false });
      worker.postMessage({
        type: "input",
        team: 0,
        input: {
          seq: 1,
          x: 0,
          z: 0,
          events: [{ type: "begin", action: "shoot" }],
          power: 1,
        },
      });
      const charging = JSON.parse(
        (await wait((m) => snapshot(m)?.controls[0].charging)).payload,
      ).state;
      assert.ok(
        charging.controls[0].charge < 0.9,
        "client-supplied power cannot set the charge",
      );
      const expired = JSON.parse(
        (await wait((m) => snapshot(m)?.tick >= 75)).payload,
      ).state;
      assert.equal(expired.controls[0].charging, false);
      assert.equal(expired.lastShot, null);
      worker.postMessage({ type: "pause", value: true });
      await new Promise((r) => setTimeout(r, 50));
      const frozen = JSON.parse(
        messages.filter((m) => m.type === "snapshot").at(-1).payload,
      ).state.tick;
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(
        JSON.parse(messages.filter((m) => m.type === "snapshot").at(-1).payload)
          .state.tick,
        frozen,
      );
      worker.postMessage({ type: "pause", value: false });
      await wait((m) => snapshot(m)?.tick > frozen);
    } finally {
      await worker.terminate();
    }
  },
);
