import fs from "node:fs";
import * as T from "three";
import { loadLocal } from "./asset-utils.mjs";
const dir = "public/assets/athlete/";
const sourceDir = "assets/source/athlete/";
const source = await loadLocal(sourceDir + "library.gltf", { plain: true });
const target = await loadLocal(sourceDir + "Superhero_Male_FullBody.gltf", {
  plain: true,
});
const bones = [];
target.scene.traverse((n) => {
  if (n.isBone) bones.push(n);
});
source.scene.updateMatrixWorld(true);
target.scene.updateMatrixWorld(true);
const maps = {
  pelvis: "DEF-hips",
  spine_01: "DEF-spine001",
  spine_02: "DEF-spine002",
  spine_03: "DEF-spine003",
  neck_01: "DEF-neck",
  Head: "DEF-head",
};
for (const side of ["l", "r"])
  for (const [a, b] of Object.entries({
    clavicle: "shoulder",
    upperarm: "upper_arm",
    lowerarm: "forearm",
    hand: "hand",
    thigh: "thigh",
    calf: "shin",
    foot: "foot",
    ball: "toe",
  }))
    maps[a + "_" + side] = "DEF-" + b + side.toUpperCase();
for (const side of ["l", "r"])
  for (const f of ["index", "middle", "pinky", "ring", "thumb"])
    for (let n = 1; n <= 3; n++)
      maps[`${f}_0${n}_${side}`] =
        `DEF-${f === "thumb" ? "thumb" : "f_" + f}0${n}${side.toUpperCase()}`;
const sourceByName = {};
source.scene.traverse((n) => (sourceByName[n.name] = n));
const rest = bones.map((b) => ({
  p: b.position.clone(),
  q: b.quaternion.clone(),
  world: b.getWorldQuaternion(new T.Quaternion()),
}));
const bindings = bones.map((b, i) => {
  const s = sourceByName[maps[b.name]];
  return s
    ? {
        s,
        rest: s.getWorldQuaternion(new T.Quaternion()).invert(),
        target: rest[i].world,
      }
    : null;
});
console.log(
  "retargeted bones",
  bindings.filter(Boolean).length,
  "of",
  bones.length,
);
const sourceHip = sourceByName["DEF-hips"],
  sourceHipRest = sourceHip.getWorldPosition(new T.Vector3());
const targetHip = bones.find((b) => b.name === "pelvis"),
  targetHipRest = targetHip.getWorldPosition(new T.Vector3());
const mixer = new T.AnimationMixer(source.scene),
  q = new T.Quaternion(),
  parentQ = new T.Quaternion(),
  v = new T.Vector3();
function retarget(clip, time) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset().play();
  mixer.setTime(time);
  source.scene.updateMatrixWorld(true);
  bones.forEach((b, i) => {
    b.position.copy(rest[i].p);
    b.quaternion.copy(rest[i].q);
  });
  target.scene.updateMatrixWorld(true);
  bones.forEach((b, i) => {
    const bind = bindings[i];
    if (!bind) return;
    bind.s.getWorldQuaternion(q).multiply(bind.rest).multiply(bind.target);
    b.parent.getWorldQuaternion(parentQ);
    b.quaternion.copy(parentQ.invert()).multiply(q);
    b.updateWorldMatrix(false, true);
  });
  sourceHip.getWorldPosition(v).sub(sourceHipRest).add(targetHipRest);
  targetHip.position.copy(targetHip.parent.worldToLocal(v));
  target.scene.updateMatrixWorld(true);
}
const definitions = [
  ["idle", "Idle_Loop", 0],
  ["walk", "Walk_Loop", 1.8],
  ["jog", "Jog_Fwd_Loop", 4.6],
  ["sprint", "Sprint_Loop", 8.5],
  ["impact", "Hit_Chest", 0],
];
const pose = [],
  clips = [],
  features = [],
  fps = 30;
const feet = ["ball_l", "ball_r"].map((n) => bones.find((b) => b.name === n));
for (const [name, original, speed] of definitions) {
  const clip = source.animations.find((c) => c.name === original),
    count = Math.ceil(clip.duration * fps),
    start = pose.length / (bones.length * 7),
    distance = [0];
  const localFeet = [];
  for (let i = 0; i < count; i++) {
    retarget(clip, i / fps);
    for (const b of bones)
      pose.push(...b.position.toArray(), ...b.quaternion.toArray());
    localFeet.push(
      feet.flatMap((f) => f.getWorldPosition(new T.Vector3()).toArray()),
    );
  }
  // Per-frame distance curve follows stance-foot travel; normalize to the authored gait speed.
  let weights = localFeet.map((f, i) => {
    const prev = localFeet[(i - 1 + count) % count];
    let w = 0,
      n = 0;
    for (let k = 0; k < 2; k++)
      if (f[k * 3 + 1] < 0.065) {
        w += Math.max(0, (prev[k * 3 + 2] - f[k * 3 + 2]) * fps);
        n++;
      }
    return n ? Math.max(0.3, w / n) : Math.max(0.3, speed);
  });
  const mean = weights.reduce((a, b) => a + b, 0) / count;
  for (let i = 0; i < count; i++)
    distance.push(
      distance[i] + (speed ? ((weights[i] / mean) * speed) / fps : 0),
    );
  for (let i = 0; i < count; i++) {
    const f = localFeet[i],
      prev = localFeet[(i - 1 + count) % count],
      vel = f.map((x, k) => (x - prev[k]) * fps);
    features.push({
      pose: f,
      velocity: vel,
      rootVelocity: [0, speed],
      trajectory: [0, speed * 0.2, 0, speed * 0.4, 0, speed * 0.6],
      contacts: [f[1] < 0.045, f[4] < 0.045],
    });
  }
  clips.push({
    name,
    source: original,
    start,
    count,
    fps,
    duration: count / fps,
    speed,
    distance,
    loop: name !== "impact",
  });
}
// Football-specific authored key poses, stored as animation data (not generated per frame).
// Base idle pose is retargeted from CC0; additive rotations define backswing/contact/follow-through.
const idle = source.animations.find((c) => c.name === "Idle_Loop");
const kickKeys = [
  { t: 0, hip: 0, knee: 0, torso: 0, arm: 0 },
  { t: 0.24, hip: -0.62, knee: 1.15, torso: -0.28, arm: 0.4 },
  { t: 0.42, hip: 0.48, knee: 0.12, torso: 0.1, arm: 0.55 },
  { t: 0.57, hip: 0.95, knee: 0.3, torso: 0.32, arm: 0.4 },
  { t: 0.82, hip: 0, knee: 0, torso: 0, arm: 0 },
];
const start = pose.length / (bones.length * 7),
  count = 26;
for (let i = 0; i < count; i++) {
  retarget(idle, 0);
  const t = i / fps;
  let k = kickKeys.findIndex(
    (k, j) => j < kickKeys.length - 1 && t >= k.t && t <= kickKeys[j + 1].t,
  );
  if (k < 0) k = kickKeys.length - 2;
  const a = kickKeys[k],
    b = kickKeys[k + 1],
    u = T.MathUtils.smoothstep(t, a.t, b.t),
    get = (n) => T.MathUtils.lerp(a[n], b[n], u);
  // World-space rotations around the player's lateral axis, preserving bind orientations.
  function rotate(name, axis, angle) {
    const bone = bones.find((b) => b.name === name);
    bone.getWorldQuaternion(q);
    q.premultiply(new T.Quaternion().setFromAxisAngle(axis, angle));
    bone.parent.getWorldQuaternion(parentQ);
    bone.quaternion.copy(parentQ.invert()).multiply(q);
    bone.updateWorldMatrix(false, true);
  }
  rotate("thigh_r", new T.Vector3(1, 0, 0), -get("hip"));
  rotate("calf_r", new T.Vector3(1, 0, 0), get("knee"));
  rotate("spine_02", new T.Vector3(0, 1, 0), get("torso"));
  rotate("upperarm_l", new T.Vector3(0, 0, 1), get("arm"));
  for (const bone of bones)
    pose.push(...bone.position.toArray(), ...bone.quaternion.toArray());
  features.push({
    pose: feet.flatMap((f) => f.getWorldPosition(new T.Vector3()).toArray()),
    velocity: Array(6).fill(0),
    rootVelocity: [0, 0],
    trajectory: Array(6).fill(0),
    contacts: [true, false],
  });
}
clips.push({
  name: "kick",
  source: "CAMPO authored football key poses",
  start,
  count,
  fps,
  duration: count / fps,
  speed: 0,
  distance: Array(count + 1).fill(0),
  loop: false,
  contactTime: 0.42,
  windupTime: 0.24,
});
fs.writeFileSync(dir + "poses.bin", Buffer.from(new Float32Array(pose).buffer));
fs.writeFileSync(
  dir + "motion.json",
  JSON.stringify({
    version: 1,
    bones: bones.map((b) => b.name),
    clips,
    features,
  }),
);
const g = JSON.parse(
  fs.readFileSync(sourceDir + "Superhero_Male_FullBody.gltf"),
);
g.materials = g.materials.map((m) => ({
  name: m.name,
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 0.85,
  },
  doubleSided: false,
}));
delete g.images;
delete g.textures;
delete g.samplers;
fs.writeFileSync(dir + "athlete.gltf", JSON.stringify(g));
console.log(
  clips.map((c) => [c.name, c.count, c.distance.at(-1)]),
  pose.length * 4,
  "pose bytes",
);
