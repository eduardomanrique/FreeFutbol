import { PROTOCOL_VERSION } from "../shared/protocol.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createGameServer } from "../server/index.js";
const origin = "http://localhost:5173";
test(
  "real relay sockets: no worker, team identity, acknowledgements, paused clock and cached reconnect",
  { timeout: 15000 },
  async () => {
    const app = createGameServer({ quiet: true });
    const sockets = [];
    await new Promise((resolve, reject) => {
      app.server.once("error", reject);
      app.server.listen(0, "127.0.0.1", resolve);
    });
    const base = `http://127.0.0.1:${app.server.address().port}/futebol/api`;
    async function post(path, body) {
      return (
        await fetch(base + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ version: PROTOCOL_VERSION, teamProtocol: 1, ...body }),
        })
      ).json();
    }
    function connect(token) {
      const ws = new WebSocket(base.replace("http:", "ws:") + "/ws", {
        origin,
      });
      sockets.push(ws);
      const inbox = [];
      ws.on("message", (b) => inbox.push(JSON.parse(b)));
      ws.on("open", () =>
        ws.send(
          JSON.stringify({ type: "auth", version: PROTOCOL_VERSION, teamProtocol: 1, token }),
        ),
      );
      ws.json = (o) => ws.send(JSON.stringify(o));
      ws.take = async (pred) => {
        for (let i = 0; i < 600; i++) {
          const n = inbox.findIndex(pred);
          if (n >= 0) return inbox.splice(n, 1)[0];
          await new Promise((r) => setTimeout(r, 10));
        }
        throw new Error("Message timeout: " + pred);
      };
      return ws;
    }
    try {
      const a = await post("/rooms", { duration: 180, networkMode: "teams" }),
        b = await post("/rooms/join", { code: a.room.code });
      const wa = connect(a.token),
        wb = connect(b.token);
      await Promise.all(
        [wa, wb].map((w) => w.take((m) => m.type === "authenticated")),
      );
      wa.json({ type: "ready", value: true });
      wb.json({ type: "ready", value: true });
      await wa.take(
        (m) => m.type === "room" && m.room.players.every((p) => p.ready),
      );
      wa.json({ type: "start" });
      await Promise.all(
        [wa, wb].map((w) => w.take((m) => m.type === "team-start")),
      );
      const room = app.rooms.get(a.room.code);
      assert.ok(room.relay);
      assert.equal(room.worker, null);
      const row = [9, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, {}];
      const packet = {
        type: "team",
        version: 1,
        seq: 1,
        at: room.relay.time(),
        selected: 9,
        commands: [row],
      };
      wa.json(packet);
      const frame = await wb.take((m) => m.type === "team-frame");
      assert.equal(frame.team, 0);
      assert.equal(frame.commands[0][1], 1);
      wb.json({ ...packet, seq: 1 });
      assert.match(
        (await wb.take((m) => m.type === "error")).error,
        /inválido/,
      );
      wb.json({ ...packet, commands: [], selected: 20, seq: 2 });
      assert.equal((await wa.take((m) => m.type === "team-frame")).ack, 1);
      wb.close();
      await wa.take(
        (m) => m.type === "room" && m.room.status === "reconnecting",
      );
      const time = room.relay.time();
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(room.relay.time(), time);
      const resumed = connect(b.token);
      await resumed.take((m) => m.type === "authenticated");
      const snapshot = await resumed.take((m) => m.type === "team-start");
      assert.equal(snapshot.players[9].row[1], 1);
      await wa.take((m) => m.type === "team-start");
      wa.json({ ...packet, seq: 3 });
      assert.equal((await resumed.take((m) => m.type === "team-frame")).seq, 3);
    } finally {
      sockets.forEach((w) => w.terminate());
      await app.close();
    }
  },
);
