import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RootMotionWarp as LegacyRootMotionWarp } from "../src/motion-matching.js";
import { RootMotionWarp as CoreRootMotionWarp } from "../src/core/root-motion-warp.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importPattern =
  /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const forbiddenPackages = new Set([
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "path",
  "perf_hooks",
  "process",
  "stream",
  "url",
  "worker_threads",
]);

function isForbidden(specifier) {
  return (
    specifier === "three" ||
    specifier.startsWith("three/") ||
    specifier.startsWith("node:") ||
    forbiddenPackages.has(specifier)
  );
}

function resolveLocal(from, specifier) {
  const candidate = path.resolve(path.dirname(from), specifier);
  if (path.extname(candidate)) return candidate;
  return `${candidate}.js`;
}

function matchImports(source) {
  const imports = [];
  let match;
  while ((match = importPattern.exec(source))) imports.push(match[1]);
  importPattern.lastIndex = 0;
  return imports;
}

function collectMatchImports() {
  const entry = path.join(root, "src/simulation.js");
  const pending = [entry];
  const visited = new Set();
  const edges = [];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of matchImports(source)) {
      edges.push({ file, specifier });
      if (specifier.startsWith(".")) {
        const dependency = resolveLocal(file, specifier);
        assert.ok(
          fs.existsSync(dependency),
          `missing import target: ${dependency}`,
        );
        pending.push(dependency);
      }
    }
  }
  return { edges, visited };
}

test("Match import boundary excludes Three.js, renderers, and Node I/O", () => {
  const { edges, visited } = collectMatchImports();
  const forbidden = edges.filter(({ specifier }) => isForbidden(specifier));
  assert.deepEqual(forbidden, []);
  assert.ok(
    [...visited].every((file) => !file.endsWith("/motion-matching.js")),
    "Match must not reach the Three.js motion presentation module",
  );
  assert.ok(
    edges.some(
      ({ file, specifier }) =>
        file.endsWith("/simulation.js") &&
        specifier === "./core/root-motion-warp.js",
    ),
    "Match must import the core RootMotionWarp module directly",
  );
});

test("RootMotionWarp remains compatible through the legacy motion module export", () => {
  assert.strictEqual(LegacyRootMotionWarp, CoreRootMotionWarp);
  const warp = new LegacyRootMotionWarp({ x: 0, z: 0 }, { x: 3, z: 4 });
  const delta = warp.step(0.24);
  assert.ok(Math.abs(delta.x - 0.144) < 1e-12);
  assert.ok(Math.abs(delta.z - 0.192) < 1e-12);
  assert.equal(warp.done, true);
});
