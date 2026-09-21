import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_MANIFEST = "assets/manifests/athlete-v1.json";
const SHA256 = /^[a-f0-9]{64}$/;

function displayPath(file) {
  return file.split(path.sep).join("/");
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function safeRelative(value, label) {
  if (typeof value !== "string" || !value || value.includes("\0"))
    return { error: `${label} must be a non-empty path` };
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized))
    return { error: `${label} must be relative: ${value}` };
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".."))
    return { error: `${label} contains traversal: ${value}` };
  if (segments.some((segment) => segment === "" || segment === "."))
    return { error: `${label} contains an empty or dot segment: ${value}` };
  return { value: segments.join(path.sep) };
}

function resolveManifest(root, manifestPath) {
  const candidate = path.isAbsolute(manifestPath)
    ? path.resolve(manifestPath)
    : path.resolve(root, manifestPath);
  if (!isInside(root, candidate))
    throw new Error(`manifestPath is outside root: ${manifestPath}`);
  return candidate;
}

function hashFile(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function resolveSafeFile(root, value, label, errors) {
  const checked = safeRelative(value, label);
  if (checked.error) {
    errors.push(checked.error);
    return null;
  }
  const absolute = path.resolve(root, checked.value);
  if (!isInside(root, absolute)) {
    errors.push(`${label} escapes repository: ${value}`);
    return null;
  }
  try {
    const stat = fs.statSync(absolute);
    const real = fs.realpathSync.native(absolute);
    if (!isInside(root, real)) {
      errors.push(
        `${label} resolves through a symlink outside repository: ${value}`,
      );
      return null;
    }
    if (!stat.isFile()) {
      errors.push(`${label} must refer to a regular file: ${value}`);
      return null;
    }
    return { absolute, relative: displayPath(checked.value) };
  } catch (error) {
    errors.push(`${label} is missing or unreadable: ${error.message}`);
    return null;
  }
}

function walkFiles(root, errors) {
  const files = new Set();
  const visitedDirectories = new Set();
  const visit = (directory) => {
    let realDirectory;
    try {
      realDirectory = fs.realpathSync.native(directory);
    } catch (error) {
      errors.push(
        `cannot resolve directory ${displayPath(path.relative(root, directory))}: ${error.message}`,
      );
      return;
    }
    if (!isInside(root, realDirectory)) {
      errors.push(
        `directory symlink escapes repository: ${displayPath(path.relative(root, directory))}`,
      );
      return;
    }
    if (visitedDirectories.has(realDirectory)) return;
    visitedDirectories.add(realDirectory);
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      errors.push(
        `cannot read directory ${displayPath(path.relative(root, directory))}: ${error.message}`,
      );
      return;
    }
    for (const entry of entries) {
      const logical = path.join(directory, entry.name);
      let stat;
      try {
        stat = fs.lstatSync(logical);
      } catch (error) {
        errors.push(
          `cannot inspect ${displayPath(path.relative(root, logical))}: ${error.message}`,
        );
        continue;
      }
      if (stat.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync.native(logical);
        } catch (error) {
          errors.push(
            `broken symlink ${displayPath(path.relative(root, logical))}: ${error.message}`,
          );
          continue;
        }
        if (!isInside(root, real)) {
          errors.push(
            `symlink escapes repository: ${displayPath(path.relative(root, logical))}`,
          );
          continue;
        }
        stat = fs.statSync(logical);
      }
      if (stat.isDirectory()) visit(logical);
      else if (stat.isFile())
        files.add(displayPath(path.relative(root, logical)));
      else
        errors.push(
          `unsupported asset entry: ${displayPath(path.relative(root, logical))}`,
        );
    }
  };
  visit(root);
  return files;
}

function checkGltfUris(
  root,
  entry,
  errors,
  warnings,
  gltfPolicy = {},
  registeredFiles = new Set(),
) {
  if (!entry.path.toLowerCase().endsWith(".gltf")) return;
  const file = path.resolve(root, entry.path);
  let gltf;
  try {
    gltf = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${entry.path}: invalid glTF JSON: ${error.message}`);
    return;
  }
  for (const section of ["buffers", "images", "shaders"]) {
    for (const [index, resource] of (gltf[section] || []).entries()) {
      if (!resource || resource.uri === undefined) continue;
      const uri = resource.uri;
      const label = `${entry.path} ${section}[${index}].uri`;
      if (typeof uri !== "string" || !uri) {
        errors.push(`${label} must be a local URI string`);
        continue;
      }
      if (
        /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(uri) ||
        uri.startsWith("/") ||
        uri.startsWith("\\")
      ) {
        errors.push(`${label} is not a local URI: ${uri}`);
        continue;
      }
      let decoded;
      try {
        decoded = decodeURIComponent(uri);
      } catch {
        errors.push(`${label} has invalid URI escaping: ${uri}`);
        continue;
      }
      const uriPath = decoded.replaceAll("\\", "/").split(/[?#]/, 1)[0];
      if (!uriPath || uriPath.split("/").includes("..")) {
        errors.push(`${label} contains traversal: ${uri}`);
        continue;
      }
      const target = path.resolve(path.dirname(file), uriPath);
      if (!isInside(root, target)) {
        errors.push(`${label} escapes repository: ${uri}`);
        continue;
      }
      try {
        const real = fs.realpathSync.native(target);
        if (!isInside(root, real)) {
          errors.push(`${label} resolves through an escaping symlink: ${uri}`);
        } else {
          const relativeTarget = displayPath(path.relative(root, target));
          if (!registeredFiles.has(relativeTarget))
            errors.push(
              `${label} points to an unregistered asset: ${relativeTarget}`,
            );
        }
      } catch {
        const allowlist =
          gltfPolicy.optionalMissingLocalUris?.[entry.path] || [];
        const allowed = allowlist.find(
          (item) => item.section === section && item.uri === uri,
        );
        if (allowed)
          warnings.push(
            `${label} points to an allowlisted missing local file: ${uri} (${allowed.reason})`,
          );
        else
          errors.push(`${label} points to an unregistered local file: ${uri}`);
      }
    }
  }
}

function checkRigAndPoses(root, manifest, errors, registeredFiles = new Set()) {
  const rig = manifest.rig;
  if (!rig || typeof rig !== "object") {
    errors.push("manifest.rig is required");
    return;
  }
  const readJson = (relative, label) => {
    const file = resolveSafeFile(root, relative, label, errors);
    if (!file) return null;
    if (!registeredFiles.has(file.relative))
      errors.push(
        `${label} is not registered in manifest.assets: ${file.relative}`,
      );
    try {
      return JSON.parse(fs.readFileSync(file.absolute, "utf8"));
    } catch (error) {
      errors.push(`${label} cannot be read: ${error.message}`);
      return null;
    }
  };
  const motion = readJson(rig.motion, "motion metadata");
  const gltf = readJson(rig.runtimeGltf, "runtime glTF");
  if (!motion || !gltf) return;
  const bones = motion.bones;
  const joints = gltf.skins?.[0]?.joints;
  const nodes = gltf.nodes;
  const validBoneNames =
    Array.isArray(bones) &&
    bones.length > 0 &&
    bones.every((name) => typeof name === "string" && name);
  if (!validBoneNames) {
    errors.push("motion.json bones must be a non-empty list of names");
  } else if (new Set(bones).size !== bones.length) {
    errors.push("motion.json bones must have unique names");
  }
  if (!Array.isArray(joints) || !Array.isArray(nodes)) {
    errors.push("runtime glTF must contain a skin joints list and nodes");
  } else {
    const jointNames = joints.map((index) => nodes[index]?.name);
    if (jointNames.some((name) => typeof name !== "string"))
      errors.push("runtime glTF skin joints must name nodes");
    else {
      if (new Set(jointNames).size !== jointNames.length)
        errors.push("runtime glTF skin joints must have unique names");
      if (JSON.stringify(jointNames) !== JSON.stringify(bones))
        errors.push(
          "runtime glTF skin joint names/order are incompatible with motion.json bones",
        );
    }
  }
  if (!Array.isArray(motion.clips) || !Array.isArray(motion.features)) {
    errors.push("motion.json requires clips and features arrays");
    return;
  }
  let frameCount = 0;
  for (const clip of motion.clips) {
    if (!clip || typeof clip !== "object") {
      errors.push("motion clip must be an object");
      continue;
    }
    if (!Number.isInteger(clip.count) || clip.count <= 0)
      errors.push(`motion clip ${clip.name || "?"} has invalid count`);
    if (!Number.isInteger(clip.start) || clip.start !== frameCount)
      errors.push(
        `motion clip ${clip.name || "?"} has an invalid start offset`,
      );
    frameCount +=
      Number.isInteger(clip.count) && clip.count > 0 ? clip.count : 0;
    if (!Number.isFinite(clip.fps) || clip.fps <= 0)
      errors.push(`motion clip ${clip.name || "?"} has invalid fps`);
    if (!Number.isFinite(clip.duration) || clip.duration <= 0)
      errors.push(`motion clip ${clip.name || "?"} has invalid duration`);
    if (!Number.isFinite(clip.speed) || clip.speed < 0)
      errors.push(`motion clip ${clip.name || "?"} has invalid speed`);
    if (typeof clip.loop !== "boolean")
      errors.push(`motion clip ${clip.name || "?"} has invalid loop flag`);
  }
  if (motion.features.length !== frameCount)
    errors.push(
      `motion feature count ${motion.features.length} does not equal clip frame count ${frameCount}`,
    );
  const numericFields = ["pose", "velocity", "rootVelocity", "trajectory"];
  const expectedFeatureLengths = {
    pose: 6,
    velocity: 6,
    rootVelocity: 2,
    trajectory: 6,
  };
  motion.features.forEach((feature, index) => {
    if (!feature || typeof feature !== "object") {
      errors.push(`motion feature ${index} must be an object`);
      return;
    }
    for (const field of numericFields) {
      const values = feature[field];
      if (!Array.isArray(values)) {
        errors.push(`motion feature ${index} has invalid ${field}`);
        continue;
      }
      if (values.length !== expectedFeatureLengths[field])
        errors.push(
          `motion feature ${index} ${field} must contain ${expectedFeatureLengths[field]} values`,
        );
      if (values.some((value) => !Number.isFinite(value)))
        errors.push(`motion feature ${index} has non-finite ${field}`);
    }
    if (
      !Array.isArray(feature?.contacts) ||
      feature.contacts.length !== 2 ||
      feature.contacts.some((value) => typeof value !== "boolean")
    )
      errors.push(`motion feature ${index} has invalid contacts`);
  });
  let poses;
  const poseFile = resolveSafeFile(root, rig.poses, "poses.bin", errors);
  if (!poseFile) return;
  if (!registeredFiles.has(poseFile.relative))
    errors.push(
      `poses.bin is not registered in manifest.assets: ${poseFile.relative}`,
    );
  try {
    const data = fs.readFileSync(poseFile.absolute);
    if (data.byteLength % 4 !== 0)
      errors.push("poses.bin byte length must be divisible by four");
    poses = new Float32Array(
      data.buffer,
      data.byteOffset,
      Math.floor(data.byteLength / 4),
    );
  } catch (error) {
    errors.push(`poses.bin cannot be read: ${error.message}`);
    return;
  }
  if (poses.some((value) => !Number.isFinite(value)))
    errors.push("poses.bin contains non-finite values");
  const expectedFloats =
    frameCount * (Array.isArray(bones) ? bones.length : 0) * 7;
  if (poses.length !== expectedFloats)
    errors.push(
      `poses.bin has ${poses.length} floats; expected ${expectedFloats}`,
    );
}

export function validateAssets({
  root = DEFAULT_ROOT,
  manifestPath = DEFAULT_MANIFEST,
} = {}) {
  const errors = [];
  const warnings = [];
  let repository;
  try {
    repository = fs.realpathSync.native(path.resolve(root));
  } catch (error) {
    return {
      ok: false,
      errors: [`root cannot be resolved: ${error.message}`],
      warnings,
      checkedFiles: [],
    };
  }
  let manifestFile;
  try {
    manifestFile = resolveManifest(repository, manifestPath);
  } catch (error) {
    return { ok: false, errors: [error.message], warnings, checkedFiles: [] };
  }
  try {
    const manifestReal = fs.realpathSync.native(manifestFile);
    if (!isInside(repository, manifestReal))
      return {
        ok: false,
        errors: ["manifestPath resolves through a symlink outside root"],
        warnings,
        checkedFiles: [],
      };
  } catch (error) {
    return {
      ok: false,
      errors: [`manifest cannot be resolved: ${error.message}`],
      warnings,
      checkedFiles: [],
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch (error) {
    return {
      ok: false,
      errors: [`manifest cannot be read: ${error.message}`],
      warnings,
      checkedFiles: [],
    };
  }
  if (manifest.schema !== "athlete-v1")
    errors.push(`unsupported manifest schema: ${manifest.schema || "missing"}`);
  if (
    typeof manifest.inventoryDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.inventoryDate)
  )
    errors.push("manifest inventoryDate must be an ISO date");
  if (
    manifest.provenance?.downloadDate !== null &&
    (typeof manifest.provenance?.downloadDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(manifest.provenance.downloadDate))
  )
    errors.push("manifest provenance.downloadDate must be null or an ISO date");
  if (!Array.isArray(manifest.roots) || manifest.roots.length === 0)
    errors.push("manifest.roots must be a non-empty list");
  const roots = new Set();
  for (const [index, rootValue] of (manifest.roots || []).entries()) {
    const checked = safeRelative(rootValue, `manifest.roots[${index}]`);
    if (checked.error) {
      errors.push(checked.error);
      continue;
    }
    roots.add(displayPath(checked.value));
    const absolute = path.resolve(repository, checked.value);
    if (!isInside(repository, absolute) || !fs.existsSync(absolute))
      errors.push(`asset root is missing or outside repository: ${rootValue}`);
    else {
      try {
        if (!isInside(repository, fs.realpathSync.native(absolute)))
          errors.push(`asset root symlink escapes repository: ${rootValue}`);
      } catch (error) {
        errors.push(
          `asset root cannot be resolved: ${rootValue}: ${error.message}`,
        );
      }
    }
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0)
    errors.push("manifest.assets must be a non-empty list");
  const entries = new Map();
  const duplicateTargets = [];
  const gltfEntries = [];
  for (const [index, entry] of (manifest.assets || []).entries()) {
    if (!entry || typeof entry !== "object") {
      errors.push(`manifest.assets[${index}] must be an object`);
      continue;
    }
    const checked = safeRelative(entry.path, `manifest.assets[${index}].path`);
    if (checked.error) {
      errors.push(checked.error);
      continue;
    }
    const relative = displayPath(checked.value);
    if (entries.has(relative))
      errors.push(`duplicate manifest asset path: ${relative}`);
    entries.set(relative, entry);
    if (!rootsHasPath(roots, relative))
      errors.push(`asset is outside declared roots: ${relative}`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0)
      errors.push(`${relative}: bytes must be a non-negative integer`);
    if (typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256))
      errors.push(`${relative}: sha256 must be lowercase hexadecimal SHA-256`);
    if (
      !entry.license ||
      typeof entry.license.status !== "string" ||
      typeof entry.license.humanApproval !== "boolean"
    )
      errors.push(`${relative}: license status and humanApproval are required`);
    if (entry.duplicateOf) duplicateTargets.push([relative, entry.duplicateOf]);
    const absolute = path.resolve(repository, checked.value);
    if (!isInside(repository, absolute))
      errors.push(`${relative}: path escapes repository`);
    else {
      let stat;
      try {
        stat = fs.statSync(absolute);
        const real = fs.realpathSync.native(absolute);
        if (!isInside(repository, real))
          errors.push(`${relative}: symlink escapes repository`);
        else if (!stat.isFile())
          errors.push(`${relative}: expected a regular file`);
        else {
          if (stat.size !== entry.bytes)
            errors.push(
              `${relative}: byte count is ${stat.size}, manifest says ${entry.bytes}`,
            );
          const actualHash = hashFile(absolute);
          if (actualHash !== entry.sha256)
            errors.push(`${relative}: SHA-256 mismatch`);
          if (relative.toLowerCase().endsWith(".gltf"))
            gltfEntries.push({ entry, relative });
        }
      } catch (error) {
        errors.push(
          `${relative}: asset is missing or unreadable: ${error.message}`,
        );
      }
    }
  }
  const registeredFiles = new Set(entries.keys());
  for (const { entry, relative } of gltfEntries)
    checkGltfUris(
      repository,
      { ...entry, path: relative },
      errors,
      warnings,
      manifest.gltfPolicy,
      registeredFiles,
    );
  for (const [relative, target] of duplicateTargets) {
    const checked = safeRelative(target, `${relative}.duplicateOf`);
    if (checked.error) {
      errors.push(checked.error);
      continue;
    }
    const targetPath = displayPath(checked.value);
    if (!entries.has(targetPath))
      errors.push(`${relative}: duplicateOf is not registered: ${targetPath}`);
    else if (entries.get(relative).sha256 !== entries.get(targetPath).sha256)
      errors.push(`${relative}: duplicateOf hash differs from ${targetPath}`);
  }
  const discovered = walkAssetRoots(repository, roots, errors);
  for (const file of discovered)
    if (!entries.has(file))
      errors.push(`asset file is not registered: ${file}`);
  for (const file of entries.keys())
    if (!discovered.has(file))
      errors.push(`manifest asset is not present in an asset root: ${file}`);
  checkLicensePresence(repository, entries, errors);
  checkRigAndPoses(repository, manifest, errors, new Set(entries.keys()));
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedFiles: [...entries.keys()].sort(),
    manifest,
  };
}

function rootsHasPath(roots, file) {
  for (const root of roots)
    if (file === root || file.startsWith(`${root}/`)) return true;
  return false;
}

function walkAssetRoots(repository, roots, errors) {
  const files = new Set();
  for (const root of roots) {
    const absolute = path.resolve(repository, root);
    if (!isInside(repository, absolute) || !fs.existsSync(absolute)) continue;
    for (const file of walkFiles(absolute, errors))
      files.add(displayPath(path.posix.join(root, file)));
  }
  return files;
}

function checkLicensePresence(repository, entries, errors) {
  const notices = [
    "assets/source/athlete/LICENSE-CC0.txt",
    "public/assets/athlete/LICENSE-CC0.txt",
  ];
  const hasNotice = notices.some((file) =>
    fs.existsSync(path.resolve(repository, file)),
  );
  if (!hasNotice)
    errors.push("no CC0 license notice exists for the athlete asset inventory");
  for (const [file, entry] of entries) {
    if (entry.license?.spdx === "CC0-1.0" && !hasNotice)
      errors.push(`${file}: CC0 asset has no existing license notice`);
  }
}

function main() {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : DEFAULT_ROOT;
  const report = validateAssets({ root: root || DEFAULT_ROOT });
  if (report.ok) {
    console.log(
      `Asset validation passed: ${report.checkedFiles.length} files; ${report.warnings.length} warnings.`,
    );
    for (const warning of report.warnings) console.warn(`warning: ${warning}`);
    return;
  }
  console.error(
    `Asset validation failed with ${report.errors.length} error(s):`,
  );
  for (const error of report.errors) console.error(`- ${error}`);
  for (const warning of report.warnings) console.warn(`warning: ${warning}`);
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
