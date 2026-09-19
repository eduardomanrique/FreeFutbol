import { performance } from "node:perf_hooks";
import os from "node:os";
import fs from "node:fs";
import { deflateRawSync } from "node:zlib";
import { Match } from "../src/simulation.js";
import { renderState, encodeState } from "../shared/protocol.js";
const seconds = Number(process.env.BENCH_SECONDS || 10);
const results = [];
for (const count of [1, 4, 8]) {
  const matches = Array.from({ length: count }, () => {
    const m = new Match({ multiplayer: true, headless: true });
    m.start();
    return m;
  });
  for (let i = 0; i < 120; i++)
    for (const m of matches) m.update(1 / 120, { x: 1 }, { x: -1 });
  const samples = [];
  let bytes = 0,
    compressedBytes = 0,
    snapshots = 0;
  const start = performance.now();
  for (let i = 0; i < seconds * 120; i++) {
    const before = performance.now();
    for (const m of matches) {
      if (i % 240 === 0) m.withTeam(i % 480 === 0 ? 0 : 1, () => m.shoot(0.5));
      m.update(
        1 / 120,
        { x: Math.sin(i / 120), z: 0.5, sprint: true },
        { x: -Math.sin(i / 120), z: -0.5 },
      );
      if (i % 6 === 0) {
        const encoded = encodeState(renderState(m, i, [i, i]));
        bytes += Buffer.byteLength(encoded);
        compressedBytes += deflateRawSync(encoded, { level: 1 }).length;
        snapshots++;
      }
    }
    samples.push(performance.now() - before);
  }
  const elapsed = performance.now() - start;
  samples.sort((a, b) => a - b);
  results.push({
    matches: count,
    simulatedSeconds: seconds,
    wallMs: Math.round(elapsed),
    oneCorePercent: +((elapsed / (seconds * 1000)) * 100).toFixed(1),
    aggregateTickP95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
    aggregateTickP99Ms: +samples[Math.floor(samples.length * 0.99)].toFixed(3),
    snapshotBytes: Math.round(bytes / snapshots),
    compressedSnapshotBytes: Math.round(compressedBytes / snapshots),
    outgoingKBpsPerMatchTwoClients: Math.round(
      ((compressedBytes / count / seconds) * 2) / 1000,
    ),
    processRssMB: Math.round(process.memoryUsage().rss / 1024 ** 2),
  });
  matches.forEach((m) => m.physics.dispose());
}
const report = {
  date: new Date().toISOString(),
  node: process.version,
  cpu: os.cpus()[0].model,
  note: "Local sequential single-thread simulation plus JSON serialization. Includes one level-1 deflate per snapshot. No sockets, TLS, workers or competing VPS load; not a production capacity guarantee.",
  results,
};
fs.mkdirSync("output/backend", { recursive: true });
fs.writeFileSync(
  "output/backend/benchmark.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
