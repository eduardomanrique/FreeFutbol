import * as THREE from "three";
import { athleteScale } from "./locomotion.js";
const clamp = THREE.MathUtils.clamp;
export function athleteGeometries() {
  const contour = [
    [0.17, 0],
    [0.185, 0.08],
    [0.2, 0.25],
    [0.25, 0.44],
    [0.235, 0.5],
    [0.12, 0.54],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return {
    sphere: new THREE.SphereGeometry(1, 16, 12),
    cylinder: new THREE.CylinderGeometry(1, 0.85, 1, 12),
    box: new THREE.BoxGeometry(1, 1, 1),
    torso: new THREE.LatheGeometry(contour, 20),
    capsule: new THREE.CapsuleGeometry(1, 1, 4, 12),
  };
}
export function buildAthlete(i) {
  const team = i < 11 ? 0 : 1,
    keeper = i % 11 === 0;
  const shirt = keeper ? "#e9bd38" : team === 0 ? "#e8ede0" : "#ce5b31",
    shorts = keeper ? "#24322c" : team === 0 ? "#173e2c" : "#742e23";
  const skin = ["#b57e5b", "#dca27a", "#744e38", "#c3906f", "#deb391"][i % 5];
  const root = new THREE.Group(),
    pelvis = new THREE.Group(),
    torso = new THREE.Group(),
    head = new THREE.Group(),
    parts = [],
    legs = [],
    arms = [];
  root.add(pelvis);
  pelvis.position.y = 0.96;
  pelvis.add(torso);
  torso.position.y = 0.02;
  torso.add(head);
  head.position.y = 0.56;
  const joint = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };
  const part = (key, color, pos, scale, parent) => {
    const node = new THREE.Object3D();
    node.position.set(...pos);
    node.scale.set(...scale);
    parent.add(node);
    parts.push({ key, color, node });
    return node;
  };
  part("torso", shirt, [0, 0, 0], [1, 1, 0.69], torso);
  part("sphere", shorts, [0, -0.01, -0.005], [0.21, 0.14, 0.14], pelvis);
  part("cylinder", skin, [0, 0.04, 0], [0.065, 0.13, 0.066], head);
  part("sphere", skin, [0, 0.18, 0.01], [0.125, 0.175, 0.123], head);
  part("sphere", skin, [0, 0.105, 0.033], [0.102, 0.082, 0.1], head);
  part("sphere", "#251e19", [0, 0.277, -0.023], [0.127, 0.086, 0.113], head);
  part("sphere", skin, [0, 0.175, 0.129], [0.026, 0.038, 0.03], head);
  for (const side of [-1, 1]) {
    part("sphere", skin, [side * 0.125, 0.172, 0], [0.026, 0.044, 0.032], head);
    part(
      "sphere",
      "#eee7db",
      [side * 0.044, 0.215, 0.116],
      [0.018, 0.009, 0.006],
      head,
    );
    part(
      "sphere",
      "#27221c",
      [side * 0.044, 0.215, 0.123],
      [0.007, 0.007, 0.004],
      head,
    );
    // Shoulder panels and collar make the shirt read as cloth rather than a cylinder.
    part(
      "box",
      team === 0 ? "#244f35" : "#ffdcbd",
      [side * 0.125, 0.42, 0.15],
      [0.045, 0.095, 0.008],
      torso,
    );
    const hip = joint(pelvis, side * 0.115, -0.015, 0),
      knee = joint(hip, 0, -0.43, 0),
      ankle = joint(knee, 0, -0.43, 0);
    part("capsule", shorts, [0, -0.09, 0], [0.108, 0.088, 0.11], hip);
    part("capsule", skin, [0, -0.285, 0], [0.078, 0.082, 0.082], hip);
    part("sphere", skin, [0, 0, 0], [0.075, 0.077, 0.078], knee);
    part("capsule", skin, [0, -0.11, -0.008], [0.062, 0.076, 0.068], knee);
    part("capsule", shirt, [0, -0.29, 0], [0.057, 0.085, 0.061], knee);
    part(
      "sphere",
      i % 3 === 0 ? "#d9e564" : "#202624",
      [0, -0.035, 0.065],
      [0.078, 0.065, 0.15],
      ankle,
    );
    part("box", "#e3dfc8", [0, -0.087, 0.04], [0.13, 0.022, 0.22], ankle);
    legs.push({ hip, knee, ankle });
    const shoulder = joint(torso, side * 0.25, 0.445, 0),
      elbow = joint(shoulder, side * 0.025, -0.29, 0),
      hand = joint(elbow, 0, -0.26, 0);
    part(
      "capsule",
      shirt,
      [side * 0.015, -0.075, 0],
      [0.083, 0.064, 0.086],
      shoulder,
    );
    part(
      "capsule",
      skin,
      [side * 0.025, -0.22, 0],
      [0.057, 0.061, 0.063],
      shoulder,
    );
    part("sphere", skin, [0, 0, 0], [0.053, 0.052, 0.053], elbow);
    part("capsule", skin, [0, -0.125, 0], [0.047, 0.071, 0.052], elbow);
    part("sphere", skin, [0, -0.028, 0.015], [0.047, 0.078, 0.038], hand);
    part(
      "sphere",
      skin,
      [-side * 0.033, -0.015, 0.035],
      [0.022, 0.036, 0.021],
      hand,
    );
    arms.push({ shoulder, elbow });
  }
  root.scale.setScalar(athleteScale(i));
  return {
    root,
    pelvis,
    torso,
    head,
    parts,
    legs,
    arms,
    heading: 0,
    initialized: false,
    previousSpeed: 0,
    lean: 0,
  };
}
export function legIK(leg, y, z) {
  const a = 0.43,
    b = 0.43,
    d = clamp(Math.hypot(y, z), 0.1, 0.854);
  const direction = Math.atan2(-z, -y);
  leg.hip.rotation.x =
    direction - Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  leg.knee.rotation.x =
    Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  leg.ankle.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
}

const boneForward = new THREE.Vector3(),
  upAxis = new THREE.Vector3(0, 1, 0),
  pitchAxis = new THREE.Vector3(1, 0, 0),
  footPitch = new THREE.Quaternion(),
  hipWorld = new THREE.Vector3(),
  targetWorld = new THREE.Vector3(),
  direction = new THREE.Vector3(),
  pole = new THREE.Vector3(),
  kneeWorld = new THREE.Vector3(),
  axisY = new THREE.Vector3(),
  axisZ = new THREE.Vector3(),
  axisX = new THREE.Vector3(),
  basis = new THREE.Matrix4(),
  worldRotation = new THREE.Quaternion(),
  parentRotation = new THREE.Quaternion();
function orientBone(bone, start, end, forward) {
  axisY.subVectors(start, end).normalize();
  axisZ.copy(forward).addScaledVector(axisY, -forward.dot(axisY)).normalize();
  if (axisZ.lengthSq() < 0.01) axisZ.set(0, 0, 1);
  axisX.crossVectors(axisY, axisZ).normalize();
  axisZ.crossVectors(axisX, axisY).normalize();
  basis.makeBasis(axisX, axisY, axisZ);
  worldRotation.setFromRotationMatrix(basis);
  bone.parent.getWorldQuaternion(parentRotation);
  bone.quaternion.copy(parentRotation.invert()).multiply(worldRotation);
  bone.updateWorldMatrix(false, true);
}
// Both leg segments and the shoe are solved in 3D, against a field-space target.
// Turning the pelvis cannot move or rotate a planted shoe.
export function solveLegWorld(leg, foot, heading, scale) {
  leg.hip.getWorldPosition(hipWorld);
  targetWorld.set(foot.x, foot.y, foot.z);
  direction.subVectors(targetWorld, hipWorld);
  const actual = direction.length();
  direction.normalize();
  const length = 0.43 * scale,
    d = clamp(actual, 0.01, length * 1.999);
  const forward = boneForward.set(Math.sin(heading), 0, Math.cos(heading));
  pole
    .copy(forward)
    .addScaledVector(direction, -forward.dot(direction))
    .normalize();
  if (pole.lengthSq() < 0.001) pole.set(0, 0, 1);
  kneeWorld
    .copy(hipWorld)
    .addScaledVector(direction, d * 0.5)
    .addScaledVector(
      pole,
      Math.sqrt(Math.max(0, length * length - d * d * 0.25)),
    );
  orientBone(leg.hip, hipWorld, kneeWorld, forward);
  // Use the desired endpoint: reachable targets reconstruct exactly.
  orientBone(leg.knee, kneeWorld, targetWorld, forward);
  worldRotation.setFromAxisAngle(upAxis, foot.heading);
  if (!foot.contact && !foot.special) {
    footPitch.setFromAxisAngle(
      pitchAxis,
      0.3 * Math.sin(2 * Math.PI * foot.phase),
    );
    worldRotation.multiply(footPitch);
  }
  leg.knee.getWorldQuaternion(parentRotation);
  leg.ankle.quaternion.copy(parentRotation.invert()).multiply(worldRotation);
  leg.ankle.updateWorldMatrix(false, true);
  return Math.max(0, actual - length * 2);
}
export function animateAthlete(rig, p, match, dt) {
  const l = p.locomotion;
  if (!l) return;
  const scale = athleteScale(p.id),
    speed = Math.hypot(p.vx, p.vz),
    run = clamp(speed / 6, 0, 1),
    heading = l.heading;
  rig.heading = heading;
  rig.root.position.set(p.x, 0, p.z);
  rig.root.rotation.y = heading;
  const forwardLean = l.leanX * Math.sin(heading) + l.leanZ * Math.cos(heading);
  const lateralLean = l.leanX * Math.cos(heading) - l.leanZ * Math.sin(heading);
  // Keep the model's approximate total mass centred on the simulated COM.
  rig.pelvis.position.set(
    (-lateralLean * 0.18) / scale,
    (l.height - 0.045) / scale,
    (-forwardLean * 0.18) / scale,
  );
  rig.pelvis.rotation.set(0, l.loadShift * 0.055, -l.loadShift * 0.035);
  rig.torso.rotation.set(forwardLean, -l.loadShift * 0.075, -lateralLean);
  rig.head.rotation.set(
    -forwardLean * 0.65,
    clamp(l.yawVelocity * 0.04, -0.2, 0.2),
    lateralLean * 0.4,
  );
  rig.root.updateMatrixWorld(true);
  // Lower the hips only as much as necessary to reach every planted contact.
  // The COM remains the physical root; knee compression handles long supports.
  let lower = 0;
  for (let i = 0; i < 2; i++) {
    const foot = l.feet[i];
    if (!foot.contact) continue;
    rig.legs[i].hip.getWorldPosition(hipWorld);
    const horizontal = Math.hypot(foot.x - hipWorld.x, foot.z - hipWorld.z),
      reach = 0.856 * scale;
    const maxHeight = Math.sqrt(
      Math.max(0.06, reach * reach - horizontal * horizontal),
    );
    lower = Math.max(lower, hipWorld.y - foot.y - maxHeight);
  }
  rig.pelvis.position.y -= Math.max(0, lower) / scale;
  rig.root.updateMatrixWorld(true);
  rig.maxReachError = 0;
  for (let i = 0; i < 2; i++) {
    const foot = l.feet[i];
    rig.maxReachError = Math.max(
      rig.maxReachError,
      solveLegWorld(rig.legs[i], foot, heading, scale),
    );
    // Arm counterbalance follows the actual foot positions, not a clock.
    const relativeForward =
      (foot.x - p.x) * Math.sin(heading) + (foot.z - p.z) * Math.cos(heading);
    rig.arms[i].shoulder.rotation.x =
      clamp(relativeForward * 1.3, -0.65, 0.65) * run;
    rig.arms[i].shoulder.rotation.z =
      (i ? -1 : 1) * (0.1 + 0.04 * run) + lateralLean * 0.2;
    rig.arms[i].elbow.rotation.x = -0.25 - run * 0.9;
  }
  if (l.impact > 0) {
    rig.arms[0].shoulder.rotation.z += l.impact * 0.35;
    rig.arms[1].shoulder.rotation.z -= l.impact * 0.35;
  }
  const charging =
    match.charging && match.selected === p.id && match.ball.owner === p.id;
  if (charging) {
    rig.torso.rotation.y -= 0.12 + match.charge * 0.28;
    rig.torso.rotation.x -= match.charge * 0.1;
    rig.arms[0].shoulder.rotation.z = 0.3;
  }
  if (p.kick > 0) {
    const t = clamp(1 - p.kick / 0.48, 0, 1);
    rig.torso.rotation.y += 0.35 * Math.sin(t * Math.PI);
    rig.arms[0].shoulder.rotation.z = 0.4 * Math.sin(t * Math.PI);
  }
  rig.root.updateMatrixWorld(true);
}
