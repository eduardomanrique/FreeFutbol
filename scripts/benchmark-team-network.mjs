import { performance } from "node:perf_hooks";
import { deflateRawSync } from "node:zlib";
import os from "node:os";
import fs from "node:fs";
import { Match } from "../src/simulation.js";
import { OnlineClient } from "../src/network/client.js";
import { TeamSimulation } from "../src/network/team-simulation.js";
import { TeamRelay, relayFrameFor } from "../server/team-relay.js";
import { renderState, encodeState, parseInput } from "../shared/protocol.js";
import { encodeTeamMessage } from "../shared/team-protocol.js";
const seconds = Number(process.env.BENCH_SECONDS || 20);
const compressed = (text) =>
  text.length >= 1024
    ? deflateRawSync(text, { level: 1 }).length
    : Buffer.byteLength(text);
const inputs = (tick) => [
  { x: Math.sin(tick / 120), z: 0.5, sprint: true },
  { x: -Math.sin(tick / 120), z: -0.5 },
];
function baseline() {
  const m = new Match({ multiplayer: true, headless: true, random: () => 0.5 });
  m.start();
  const clients = [0, 1].map((team) => {
    const online = new OnlineClient({ onStatus: () => {} });
    online.active = true;
    online.team = team;
    return {
      online,
      match: new Match({ multiplayer: true, headless: true }),
      ms: 0,
    };
  });
  let serverMs = 0,
    out = 0,
    raw = 0,
    incoming = 0,
    packets = 0;
  for (let i = 0; i < seconds * 120; i++) {
    const input = inputs(i),
      t = performance.now();
    if (i % 240 === 0) m.withTeam(i % 480 === 0 ? 0 : 1, () => m.shoot(0.5));
    if (i % 4 === 0)
      input.forEach((v) => {
        const text = JSON.stringify({
          type: "input",
          input: { ...v, x: v.x || 0, z: v.z || 0, events: [], seq: i },
        });
        incoming += Buffer.byteLength(text);
        parseInput(JSON.parse(text).input);
      });
    m.update(1 / 120, ...input);
    let payload;
    if (i % 6 === 0) {
      payload = encodeState(renderState(m, i, [i, i]));
      for (let j = 0; j < 2; j++) {
        out += compressed(payload);
        raw += Buffer.byteLength(payload);
        packets++;
      }
    }
    serverMs += performance.now() - t;
    for (const c of clients) {
      const t = performance.now();
      if (payload) {
        c.online.snapshots.push({
          state: JSON.parse(payload).state,
          received: performance.now(),
        });
        if (c.online.snapshots.length > 12) c.online.snapshots.shift();
      }
      c.online.update(1 / 120, {}, c.match);
      c.ms += performance.now() - t;
    }
  }
  clients.forEach((c) => c.match.physics.dispose());
  m.physics.dispose();
  return {
    serverMs,
    clientMs: clients.map((c) => c.ms),
    outgoingCompressedBytes: out,
    outgoingRawBytes: raw,
    incomingRawBytes: incoming,
    outgoingPackets: packets,
  };
}
function distributed() {
  let clock = 0,
    serverMs = 0,
    out = 0,
    raw = 0,
    incoming = 0,
    packets = 0;
  const relay = new TeamRelay(360, () => clock * 1000),
    queue = [];
  const matches = [0, 1].map(
    () => new Match({ multiplayer: true, headless: true, random: () => 0.5 }),
  );
  const clientMs = [0, 0];
  const sessions = [0, 1].map(
    (team) =>
      new TeamSimulation(team, (packet) => {
        const text = encodeTeamMessage(packet);
        incoming += Buffer.byteLength(text);
        queue.push({ team, text });
      }),
  );
  sessions.forEach((s) => s.receive(relay.snapshot()));
  for (let i = 0; i < seconds * 120; i++) {
    clock = i / 120;
    for (const e of queue.splice(0)) {
      const t = performance.now(),
        frame = relay.receive(e.team, JSON.parse(e.text)),
        payloads = [];
      if (frame)
        for (let j = 0; j < 2; j++) {
          const reply = relayFrameFor(frame, j);
          if (!reply) continue;
          const text = encodeTeamMessage(reply);
          out += compressed(text);
          raw += Buffer.byteLength(text);
          packets++;
          payloads.push({ text, team: j });
        }
      serverMs += performance.now() - t;
      payloads.forEach(({ text, team: j }) => {
        const t = performance.now();
        sessions[j].receive(JSON.parse(text));
        clientMs[j] += performance.now() - t;
      });
    }
    const input = inputs(i);
    sessions.forEach((s, team) => {
      const t = performance.now();
      if (i > 0 && i % 240 === 0 && team === (i % 480 === 0 ? 0 : 1)) {
        s.action("begin", "shoot");
        s.action("release");
      }
      s.update(matches[team], 1 / 120, input[team], true);
      clientMs[team] += performance.now() - t;
    });
  }
  matches.forEach((m) => m.physics.dispose());
  return {
    serverMs,
    clientMs,
    outgoingCompressedBytes: out,
    outgoingRawBytes: raw,
    incomingRawBytes: incoming,
    outgoingPackets: packets,
    commands: relay.metrics.commands,
  };
}
// Alternate order after warming JIT; report medians, not the best run.
baseline();
distributed();
const runs = [];
for (let i = 0; i < 3; i++) {
  const result = {};
  for (const key of i % 2 ? ["teams", "server"] : ["server", "teams"])
    result[key] = (key === "teams" ? distributed : baseline)();
  runs.push(result);
}
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
const summaries = {};
for (const key of ["server", "teams"]) {
  const vals = runs.map((r) => r[key]);
  const ms = median(vals.map((v) => v.serverMs));
  summaries[key] = {
    serverCpuMs: +ms.toFixed(2),
    serverOneCorePercent: +(ms / (seconds * 10)).toFixed(2),
    clientCpuMs: [0, 1].map(
      (i) => +median(vals.map((v) => v.clientMs[i])).toFixed(2),
    ),
    outgoingCompressedKBps: +(
      median(vals.map((v) => v.outgoingCompressedBytes)) /
      seconds /
      1000
    ).toFixed(2),
    outgoingRawKBps: +(
      median(vals.map((v) => v.outgoingRawBytes)) /
      seconds /
      1000
    ).toFixed(2),
    incomingRawKBps: +(
      median(vals.map((v) => v.incomingRawBytes)) /
      seconds /
      1000
    ).toFixed(2),
    outgoingMessagesPerSecond:
      median(vals.map((v) => v.outgoingPackets)) / seconds,
  };
}
const report = {
  date: new Date().toISOString(),
  cpu: os.cpus()[0].model,
  node: process.version,
  simulatedSeconds: seconds,
  runs: 3,
  note: "Single room / two clients, median of three alternating runs after warmup. Actual serializers, parser, relay, prediction and Rapier; compression at level 1 separately per socket with 1024-byte threshold. No renderer, animation library, TLS, workers, actual sockets or VPS contention. Behaviors differ after contacts; workload is comparable scripted inputs, not an identical match trace. Egress sums both clients. This is CPU work, not end-to-end latency or production capacity.",
  summaries,
  serverCpuReductionPercent: +(
    100 *
    (1 - summaries.teams.serverCpuMs / summaries.server.serverCpuMs)
  ).toFixed(1),
  egressReductionPercent: +(
    100 *
    (1 -
      summaries.teams.outgoingCompressedKBps /
        summaries.server.outgoingCompressedKBps)
  ).toFixed(1),
  raw: runs,
};
fs.mkdirSync("output/relay", { recursive: true });
fs.writeFileSync(
  "output/relay/comparison.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
