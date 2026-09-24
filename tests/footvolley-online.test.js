import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createGameServer } from "../server/index.js";
import { PROTOCOL_VERSION } from "../shared/protocol.js";
const origin = "http://localhost:5173";
function connect(url, token) {
  const ws = new WebSocket(url.replace("http:", "ws:") + "/futebol/api/ws", {
      origin,
    }),
    messages = [];
  ws.on("message", (b) => messages.push(JSON.parse(b)));
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "auth", version: PROTOCOL_VERSION, token })),
  );
  ws.sendJSON = (m) => ws.send(JSON.stringify(m));
  ws.wait = async (fn) => {
    for (let i = 0; i < 1400; i++) {
      const n = messages.findIndex(fn);
      if (n >= 0) return messages.splice(n, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("timeout " + fn);
  };
  return ws;
}
for (const count of [2, 4])
  test(
    `futevolei authoritative ${count} seats, independent input, duplicate events and reconnect with AI`,
    { timeout: 30000 },
    async () => {
      const app = createGameServer({ quiet: true, maxMatches: 1 });
      await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
      const url = `http://127.0.0.1:${app.server.address().port}`,
        peers = [];
      const post = async (path, data) => {
        const r = await fetch(url + "/futebol/api/" + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ version: PROTOCOL_VERSION, ...data }),
        });
        assert.equal(r.status, 201);
        return r.json();
      };
      try {
        const users = [
          await post("rooms", { duration: 180, mode: "futevolei" }),
        ];
        for (let i = 1; i < count; i++)
          users.push(await post("rooms/join", { code: users[0].room.code }));
        assert.deepEqual(
          users.map((u) => u.playerSlot),
          count === 2 ? [0, 2] : [0, 2, 1, 3],
        );
        for (const user of users) {
          const ws = connect(url, user.token);
          peers.push(ws);
          await ws.wait((m) => m.type === "authenticated");
          ws.sendJSON({ type: "ready", value: true });
        }
        await peers[0].wait(
          (m) =>
            m.type === "room" &&
            m.room.players.filter(Boolean).length === count &&
            m.room.players.filter(Boolean).every((p) => p.ready),
        );
        peers[0].sendJSON({ type: "start" });
        const first = await peers[0].wait(
          (m) => m.type === "snapshot" && m.state.tick > 0,
        );
        assert.equal(first.state.variant, "futevolei");
        assert.equal(first.state.players.length, 4);
        const input = {
          type: "input",
          input: { seq: 10, x: 0, z: 1, events: [] },
        };
        peers[0].sendJSON(input);
        peers[0].sendJSON(input);
        const moved = await peers[0].wait(
          (m) => m.type === "snapshot" && m.state.acknowledgements[0] === 10,
        );
        assert.ok(moved.state.tick > first.state.tick);
        if (count === 4) {
          peers[2].sendJSON({
            type: "input",
            input: {
              seq: 1,
              x: 0,
              z: 0,
              events: [{ type: "begin", action: "shoot" }],
            },
          });
          const hit = await peers[0].wait(
            (m) => m.type === "snapshot" && m.state.lastTouch,
          );
          assert.equal(hit.state.lastTouch.player, 1);
          peers[2].sendJSON({
            type: "input",
            input: {
              seq: 1,
              x: 0,
              z: 0,
              events: [{ type: "begin", action: "shoot" }],
            },
          });
        }
        peers[1].terminate();
        const ai = await peers[0].wait(
          (m) =>
            m.type === "snapshot" && m.state.footvolley.humans[2] === false,
        );
        assert.equal(ai.state.mode, "playing");
        const reconnect = connect(url, users[1].token);
        peers.push(reconnect);
        await reconnect.wait((m) => m.type === "authenticated");
        const back = await peers[0].wait(
          (m) =>
            m.type === "snapshot" &&
            m.state.footvolley.humans[2] === true &&
            m.state.tick > ai.state.tick,
        );
        assert.ok(back.state.tick > ai.state.tick);
        assert.equal(
          back.state.footvolley.serial >= ai.state.footvolley.serial,
          true,
        );
      } finally {
        for (const p of peers) p.terminate();
        await app.close();
      }
    },
  );
