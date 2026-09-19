import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { createGameServer } from "../server/index.js";
const origin = "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}
// A reliable ordered WebSocket relay with deterministic latency/jitter. Snapshot
// omission models the server skipping obsolete states, NOT TCP packet loss.
async function relay(backend, rtt) {
  const server = http.createServer(),
    wss = new WebSocketServer({ server });
  const connections = [],
    timers = new Set();
  let counter = 0;
  function schedule(target, data, lane) {
    const n = ++counter;
    if (String(data).includes('"type":"snapshot"') && n % 20 === 0) return;
    const jitter = ((n % 5) - 2) * 4;
    lane.due = Math.max(Date.now() + rtt / 2 + jitter, lane.due + 1);
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        if (target.readyState === WebSocket.OPEN) target.send(data.toString());
      },
      Math.max(0, lane.due - Date.now()),
    );
    timers.add(timer);
  }
  wss.on("connection", (client) => {
    const upstream = new WebSocket(
      backend.replace("http:", "ws:") + "/futebol/api/ws",
      { origin },
    );
    connections.push(client, upstream);
    const inbound = { due: 0 },
      outbound = { due: 0 },
      queued = [];
    client.on("message", (data) => {
      if (upstream.readyState === WebSocket.CONNECTING) queued.push(data);
      else schedule(upstream, data, inbound);
    });
    upstream.on("open", () =>
      queued.forEach((data) => schedule(upstream, data, inbound)),
    );
    upstream.on("message", (data) => schedule(client, data, outbound));
    upstream.on("error", () => client.terminate());
    client.on("error", () => {});
    client.on("close", () => upstream.terminate());
  });
  const url = await listen(server);
  return {
    url,
    close: async () => {
      timers.forEach(clearTimeout);
      connections.forEach((s) => s.terminate());
      wss.close();
      await new Promise((r) => server.close(r));
    },
  };
}
function peer(url, token) {
  const ws = new WebSocket(url.replace("http:", "ws:"));
  const received = [];
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "auth", token, version: 1 })),
  );
  ws.on("message", (data) => received.push(JSON.parse(data)));
  const send = (data) => ws.send(JSON.stringify(data));
  const wait = async (predicate) => {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const result = received.find(predicate);
      if (result) return result;
      await sleep(5);
    }
    throw new Error("Timed out on delayed network");
  };
  return { ws, send, wait, received };
}
test(
  "30/80/150 ms simulated RTT plus jitter and skipped snapshots preserve authority",
  { timeout: 20000 },
  async () => {
    const app = createGameServer({ quiet: true });
    const backend = await listen(app.server);
    const results = [];
    try {
      for (const rtt of [30, 80, 150]) {
        const proxy = await relay(backend, rtt);
        const peers = [];
        let inputTimer;
        try {
          const post = async (route, data) =>
            (
              await fetch(backend + "/futebol/api/" + route, {
                method: "POST",
                headers: { Origin: origin },
                body: JSON.stringify({ version: 1, ...data }),
              })
            ).json();
          const host = await post("rooms", { duration: 180 });
          const guest = await post("rooms/join", { code: host.room.code });
          const a = peer(proxy.url, host.token),
            b = peer(proxy.url, guest.token);
          peers.push(a, b);
          await Promise.all(
            peers.map((p) => p.wait((m) => m.type === "authenticated")),
          );
          peers.forEach((p) => p.send({ type: "ready", value: true }));
          await a.wait(
            (m) => m.type === "room" && m.room.players.every((p) => p?.ready),
          );
          a.send({ type: "start" });
          await a.wait((m) => m.type === "snapshot");
          let seq = 0;
          inputTimer = setInterval(() => {
            seq++;
            peers.forEach((p, team) =>
              p.send({
                type: "input",
                input: { seq, x: 0, z: team ? 1 : -1, events: [] },
              }),
            );
          }, 34);
          await Promise.all(
            peers.map((p) =>
              p.wait(
                (m) =>
                  m.type === "snapshot" &&
                  m.state.tick >= 150 &&
                  m.state.acknowledgements.every((n) => n > 20),
              ),
            ),
          );
          const aStates = new Map(
            a.received
              .filter((m) => m.type === "snapshot")
              .map((m) => [m.state.tick, m.state]),
          );
          const matching = b.received.filter(
            (m) =>
              m.type === "snapshot" &&
              m.state.tick > 60 &&
              aStates.has(m.state.tick),
          );
          assert.ok(matching.length > 5);
          for (const m of matching) {
            assert.deepEqual(m.state.ball, aStates.get(m.state.tick).ball);
            assert.deepEqual(m.state.score, aStates.get(m.state.tick).score);
            assert.ok(
              m.state.players.every(
                (p) =>
                  Number.isFinite(p.x) &&
                  Math.abs(p.x) <= 45.5 &&
                  Math.abs(p.z) <= 29.5,
              ),
            );
          }
          results.push({
            simulatedRttMs: rtt,
            identicalAuthoritativeTicks: matching.length,
          });
          a.send({ type: "leave" });
          await b.wait((m) => m.type === "closed");
        } finally {
          clearInterval(inputTimer);
          peers.forEach((p) => p.ws.terminate());
          await proxy.close();
        }
      }
      console.log(JSON.stringify(results));
    } finally {
      await app.close();
    }
  },
);
