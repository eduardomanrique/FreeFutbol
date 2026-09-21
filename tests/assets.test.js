import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateAssets } from "../scripts/validate-assets.mjs";

const repo = path.resolve(new URL("..", import.meta.url).pathname);

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "campo-assets-"));
  fs.cpSync(
    path.join(repo, "assets/source/athlete"),
    path.join(root, "assets/source/athlete"),
    { recursive: true },
  );
  fs.cpSync(
    path.join(repo, "public/assets/athlete"),
    path.join(root, "public/assets/athlete"),
    { recursive: true },
  );
  fs.mkdirSync(path.join(root, "assets/manifests"), { recursive: true });
  fs.copyFileSync(
    path.join(repo, "assets/manifests/athlete-v1.json"),
    path.join(root, "assets/manifests/athlete-v1.json"),
  );
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function fixtureReport(root) {
  return validateAssets({
    root,
    manifestPath: "assets/manifests/athlete-v1.json",
  });
}

function updateFixtureAssetHash(root, relative) {
  const file = path.join(root, relative);
  const manifestPath = path.join(root, "assets/manifests/athlete-v1.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = manifest.assets.find((item) => item.path === relative);
  entry.bytes = fs.statSync(file).size;
  entry.sha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
}

test("athlete manifest validates every source/runtime file and the compatible rig", () => {
  const report = validateAssets();
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.checkedFiles.length, 15);
  assert.ok(
    report.warnings.some((warning) =>
      warning.includes("allowlisted missing local file"),
    ),
  );
});

test("asset validation detects a tampered hash", () => {
  const root = makeFixture();
  try {
    const file = path.join(root, "public/assets/athlete/T_Eye_Brown.png");
    fs.appendFileSync(file, Buffer.from("tamper"));
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /T_Eye_Brown\.png: (byte count|SHA-256 mismatch)/,
    );
  } finally {
    cleanup(root);
  }
});

test("asset validation detects a missing registered asset", () => {
  const root = makeFixture();
  try {
    fs.rmSync(path.join(root, "public/assets/athlete/poses.bin"));
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /poses\.bin: asset is missing or unreadable|manifest asset is not present/,
    );
  } finally {
    cleanup(root);
  }
});

test("asset validation rejects an unsafe glTF URI", () => {
  const root = makeFixture();
  try {
    const gltfPath = path.join(root, "public/assets/athlete/athlete.gltf");
    const gltf = JSON.parse(fs.readFileSync(gltfPath, "utf8"));
    gltf.buffers[0].uri = "../outside.bin";
    fs.writeFileSync(gltfPath, JSON.stringify(gltf));
    const manifestPath = path.join(root, "assets/manifests/athlete-v1.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const entry = manifest.assets.find(
      (item) => item.path === "public/assets/athlete/athlete.gltf",
    );
    entry.bytes = fs.statSync(gltfPath).size;
    entry.sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(gltfPath))
      .digest("hex");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /athlete\.gltf buffers\[0\]\.uri contains traversal/,
    );
  } finally {
    cleanup(root);
  }
});

test("asset validation rejects a symlink that escapes the repository", () => {
  const root = makeFixture();
  try {
    fs.symlinkSync(
      os.tmpdir(),
      path.join(root, "public/assets/athlete/escape"),
    );
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /symlink escapes repository/);
  } finally {
    cleanup(root);
  }
});

test("asset validation rejects malformed motion feature sizes", () => {
  const root = makeFixture();
  try {
    const file = path.join(root, "public/assets/athlete/motion.json");
    const motion = JSON.parse(fs.readFileSync(file, "utf8"));
    motion.features[0].pose = [];
    fs.writeFileSync(file, JSON.stringify(motion));
    updateFixtureAssetHash(root, "public/assets/athlete/motion.json");
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /motion feature 0 pose must contain 6 values/,
    );
  } finally {
    cleanup(root);
  }
});

test("asset validation rejects duplicate rig bone names", () => {
  const root = makeFixture();
  try {
    const file = path.join(root, "public/assets/athlete/motion.json");
    const motion = JSON.parse(fs.readFileSync(file, "utf8"));
    motion.bones[1] = motion.bones[0];
    fs.writeFileSync(file, JSON.stringify(motion));
    updateFixtureAssetHash(root, "public/assets/athlete/motion.json");
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /motion\.json bones must have unique names/,
    );
  } finally {
    cleanup(root);
  }
});

test("asset validation rejects invalid clip timing metadata", () => {
  const root = makeFixture();
  try {
    const file = path.join(root, "public/assets/athlete/motion.json");
    const motion = JSON.parse(fs.readFileSync(file, "utf8"));
    motion.clips[0].fps = 0;
    motion.clips[0].duration = -1;
    motion.clips[0].speed = -1;
    motion.clips[0].loop = "yes";
    fs.writeFileSync(file, JSON.stringify(motion));
    updateFixtureAssetHash(root, "public/assets/athlete/motion.json");
    const report = fixtureReport(root);
    assert.equal(report.ok, false);
    const errors = report.errors.join("\n");
    assert.match(errors, /motion clip idle has invalid fps/);
    assert.match(errors, /motion clip idle has invalid duration/);
    assert.match(errors, /motion clip idle has invalid speed/);
    assert.match(errors, /motion clip idle has invalid loop flag/);
  } finally {
    cleanup(root);
  }
});
