import { PROTOCOL_VERSION } from "../shared/protocol.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createGameServer } from "../server/index.js";
const origin = "http://localhost:5173";
function socket(url, token, requestOrigin = origin) {
  const ws = new WebSocket(url.replace("http:", "ws:") + "/futebol/api/ws", {
    origin: requestOrigin,
  });
  const messages = [];
  ws.on("message", (data) => messages.push(JSON.parse(data)));
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "auth", version: PROTOCOL_VERSION, token })),
  );
  ws.sendJSON = (data) => ws.send(JSON.stringify(data));
  ws.wait = async (predicate, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("WebSocket event timeout: " + predicate.toString());
  };
  return ws;
}
test(
  "authoritative server: room admission, independent inputs, malformed packets, reconnect, termination",
  { timeout: 30000 },
  async () => {
    const app = createGameServer({ quiet: true, maxMatches: 1 });
    await new Promise((resolve, reject) => {
      app.server.once("error", reject);
      app.server.listen(0, "127.0.0.1", resolve);
    });
    const url = `http://127.0.0.1:${app.server.address().port}`;
    const peers = [];
    const post = async (path, data, requestOrigin = origin) => {
      const response = await fetch(url + "/futebol/api/" + path, {
        method: "POST",
        headers: { Origin: requestOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ version: PROTOCOL_VERSION, ...data }),
      });
      return { status: response.status, ...(await response.json()) };
    };
    try {
      assert.equal(
        (await post("rooms", { duration: 180 }, "https://evil.example")).status,
        403,
      );
      assert.equal((await post("rooms", { duration: 1 })).status, 400);
      assert.equal(
        (await post("rooms", { duration: 180, version: 999 })).status,
        409,
      );
      const a = await post("rooms", { duration: 180 });
      assert.equal(a.status, 201);
      const admission = await Promise.all([
        post("rooms/join", { code: a.room.code }),
        post("rooms/join", { code: a.room.code }),
      ]);
      assert.deepEqual(admission.map((r) => r.status).sort(), [201, 409]);
      const b = admission.find((r) => r.status === 201);
      const wa = socket(url, a.token),
        wb = socket(url, b.token);
      peers.push(wa, wb);
      await Promise.all([
        wa.wait((m) => m.type === "authenticated"),
        wb.wait((m) => m.type === "authenticated"),
      ]);
      wb.sendJSON({ type: "start" });
      assert.match((await wb.wait((m) => m.type === "error")).error, /criador/);
      wa.sendJSON({ type: "start" });
      assert.match((await wa.wait((m) => m.type === "error")).error, /prontos/);
      wa.sendJSON({ type: "ready", value: true });
      wb.sendJSON({ type: "ready", value: true });
      await wa.wait(
        (m) => m.type === "room" && m.room.players.every((p) => p?.ready),
      );
      wa.sendJSON({ type: "start" });
      const initial = (await wa.wait((m) => m.type === "snapshot")).state;
      await wb.wait((m) => m.type === "snapshot");
      let seq = 0;
      const tickInputs = setInterval(() => {
        seq++;
        wa.sendJSON({
          type: "input",
          input: {
            seq,
            x: 0,
            z: -1,
            sprint: true,
            events: [],
            score: [99, 99],
            team: 1,
          },
        });
        wb.sendJSON({
          type: "input",
          input: { seq, x: 0, z: 1, sprint: true, events: [] },
        });
      }, 33);
      let moved;
      try {
        moved = (
          await wa.wait(
            (m) => m.type === "snapshot" && m.state.tick > initial.tick + 100,
          )
        ).state;
      } finally {
        clearInterval(tickInputs);
      }
      assert.ok(moved.players[9].z < initial.players[9].z - 0.5);
      assert.ok(moved.players[20].z > initial.players[20].z + 0.5);
      assert.ok(moved.acknowledgements.every((n) => n > 0));
      assert.deepEqual(moved.score, [0, 0]);
      wa.send("{");
      assert.ok(await wa.wait((m) => m.type === "error"));
      wa.sendJSON({
        type: "input",
        input: { seq: 999, x: 9000, z: 0, events: [] },
      });
      assert.match(
        (await wa.wait((m) => m.type === "error")).error,
        /inválido/,
      );
      wb.terminate();
      await wa.wait(
        (m) => m.type === "room" && m.room.status === "reconnecting",
      );
      const replacement = socket(url, b.token);
      peers.push(replacement);
      const auth = await replacement.wait((m) => m.type === "authenticated");
      assert.ok(auth.sequence > 0);
      await wa.wait((m) => m.type === "room" && m.room.status === "playing");
      replacement.sendJSON({ type: "leave" });
      assert.match((await wa.wait((m) => m.type === "closed")).reason, /saiu/);
      assert.equal(app.rooms.size, 0);
    } finally {
      peers.forEach((p) => p.terminate());
      await app.close();
    }
  },
);
test(
  "abandoned lobby expires and invalid session cannot join",
  { timeout: 6000 },
  async () => {
    const app = createGameServer({ quiet: true, reconnectMs: 100 });
    await new Promise((resolve, reject) => {
      app.server.once("error", reject);
      app.server.listen(0, "127.0.0.1", resolve);
    });
    const url = `http://127.0.0.1:${app.server.address().port}`;
    try {
      const response = await fetch(url + "/futebol/api/rooms", {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ version: PROTOCOL_VERSION, duration: 180 }),
      });
      await response.json();
      assert.equal(app.rooms.size, 1);
      const bad = socket(url, "invalid");
      const code = await new Promise((resolve) => bad.on("close", resolve));
      assert.equal(code, 1008);
      await new Promise((r) => setTimeout(r, 1200));
      assert.equal(app.rooms.size, 0);
    } finally {
      await app.close();
    }
  },
);

test(
  "capacity is bounded and a failed worker closes only its own room",
  { timeout: 15000 },
  async () => {
    const app = createGameServer({ quiet: true, maxRooms: 2, maxMatches: 1 });
    await new Promise((resolve, reject) => {
      app.server.once("error", reject);
      app.server.listen(0, "127.0.0.1", resolve);
    });
    const url = `http://127.0.0.1:${app.server.address().port}`;
    const peers = [];
    async function post(path, data) {
      const r = await fetch(url + "/futebol/api/" + path, {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ version: PROTOCOL_VERSION, ...data }),
      });
      return { status: r.status, ...(await r.json()) };
    }
    async function pair() {
      const host = await post("rooms", { duration: 180 });
      const guest = await post("rooms/join", { code: host.room.code });
      const a = socket(url, host.token),
        b = socket(url, guest.token);
      peers.push(a, b);
      await Promise.all([
        a.wait((m) => m.type === "authenticated"),
        b.wait((m) => m.type === "authenticated"),
      ]);
      a.sendJSON({ type: "ready", value: true });
      b.sendJSON({ type: "ready", value: true });
      await a.wait(
        (m) => m.type === "room" && m.room.players.every((p) => p?.ready),
      );
      return { a, b, code: host.room.code };
    }
    try {
      const first = await pair(),
        second = await pair();
      assert.equal((await post("rooms", { duration: 180 })).status, 503);
      first.a.sendJSON({ type: "start" });
      await first.a.wait((m) => m.type === "snapshot");
      assert.equal(
        (await post("rooms/join", { code: first.code })).status,
        409,
      );
      second.a.sendJSON({ type: "start" });
      assert.match(
        (await second.a.wait((m) => m.type === "error")).error,
        /ocupadas/,
      );
      const member = app.rooms.get(first.code).players[0];
      const input = { seq: 12, x: 0, z: 0, events: [] };
      first.a.sendJSON({ type: "input", input });
      await first.a.wait(
        (m) => m.type === "snapshot" && m.state.acknowledgements[0] === 12,
      );
      first.a.sendJSON({
        type: "input",
        input: { ...input, seq: 2, events: [{ type: "switch" }] },
      });
      await new Promise((r) => setTimeout(r, 70));
      assert.equal(member.seq, 12);
      await app.rooms.get(first.code).worker.terminate();
      await first.a.wait((m) => m.type === "closed");
      assert.ok(app.rooms.has(second.code));
      second.a.sendJSON({ type: "start" });
      await second.a.wait((m) => m.type === "snapshot");
    } finally {
      peers.forEach((p) => p.terminate());
      await app.close();
    }
  },
);

test("LAN origin can create, join and authenticate while unrelated origins remain blocked", async () => {
  const { developmentOrigins } = await import("../server/origins.js");
  const lan = "http://192.168.68.108:5173";
  const app = createGameServer({
    quiet: true,
    origins: developmentOrigins({
      en0: [{ family: "IPv4", internal: false, address: "192.168.68.108" }],
    }),
  });
  await new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const peers = [];
  async function post(route, data, requestOrigin) {
    const response = await fetch(url + "/futebol/api/" + route, {
      method: "POST",
      headers: { Origin: requestOrigin },
      body: JSON.stringify({ version: PROTOCOL_VERSION, ...data }),
    });
    return { status: response.status, ...(await response.json()) };
  }
  try {
    const host = await post("rooms", { duration: 180 }, origin);
    const guest = await post("rooms/join", { code: host.room.code }, lan);
    assert.equal(guest.status, 201);
    const ws = socket(url, guest.token, lan);
    peers.push(ws);
    assert.equal((await ws.wait((m) => m.type === "authenticated")).team, 1);
    assert.equal((await post("rooms", { duration: 180 }, lan)).status, 201);
    for (const denied of [
      "http://192.168.68.109:5173",
      "http://192.168.68.108:9999",
      "https://evil.example",
    ])
      assert.equal(
        (await post("rooms", { duration: 180 }, denied)).status,
        403,
      );
  } finally {
    peers.forEach((p) => p.terminate());
    await app.close();
  }
});

test("origin discovery excludes public interfaces and honors explicit production restrictions", async () => {
  const { developmentOrigins, resolveOrigins } =
    await import("../server/origins.js");
  const discovered = developmentOrigins({
    en0: [
      { family: "IPv4", internal: false, address: "10.0.0.7" },
      { family: "IPv4", internal: false, address: "172.20.1.2" },
      { family: "IPv4", internal: false, address: "8.8.8.8" },
      { family: "IPv6", internal: false, address: "fe80::1" },
    ],
  });
  assert.ok(discovered.includes("http://10.0.0.7:5173"));
  assert.ok(discovered.includes("http://172.20.1.2:5173"));
  assert.ok(!discovered.includes("http://8.8.8.8:5173"));
  assert.deepEqual(resolveOrigins(undefined, { NODE_ENV: "production" }), [
    origin,
    "http://127.0.0.1:5173",
  ]);
  assert.deepEqual(
    resolveOrigins(undefined, { ALLOWED_ORIGINS: " https://kmworks.dev, " }),
    ["https://kmworks.dev"],
  );
  assert.deepEqual(resolveOrigins(["https://explicit.example"], {}), [
    "https://explicit.example",
  ]);
});
