import {
  bodyTouch,
  bodySurface,
  pickupFoot,
  shoulderMotion,
} from "./altinha-contact.js";
import {
  volleyJump,
  volleyJumpPose,
  VOLLEY_PREPARE,
  volleyFootSurface,
} from "./volley-motion.js";
import { bindKneeHinge, solveKneeHinge } from "./leg-hinge.js";
import { poseAroundLeg } from "./altinha-around.js";
import { motionAction } from "./action-state.js";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { MotionLibrary } from "./motion-matching.js";
import { headPosition } from "./heading.js";
const assetRoot = `${import.meta.env.BASE_URL}assets/athlete/`;
export async function loadAthleteAssets() {
  const [model, meta, data, hair] = await Promise.all([
    new GLTFLoader().loadAsync(assetRoot + "athlete.gltf"),
    fetch(assetRoot + "motion.json").then((r) => {
      if (!r.ok) throw Error("Motion metadata unavailable");
      return r.json();
    }),
    fetch(assetRoot + "poses.bin").then((r) => {
      if (!r.ok) throw Error("Pose data unavailable");
      return r.arrayBuffer();
    }),
    new GLTFLoader().loadAsync(assetRoot + "Hair_Buzzed.gltf"),
  ]);
  return {
    model: model.scene,
    hair: hair.scene,
    library: new MotionLibrary(meta, new Float32Array(data)),
  };
}
const materials = new Map(),
  geometries = new Map();
const eyeMap = new T.TextureLoader().load(assetRoot + "T_Eye_Brown.png");
eyeMap.colorSpace = T.SRGBColorSpace;
const hairMap = new T.TextureLoader().load(
  assetRoot + "T_Hair_1_BaseColor.png",
);
hairMap.colorSpace = T.SRGBColorSpace;
function outfit(mesh, id) {
  const team = id < 11 ? 0 : 1,
    keeper = id % 11 === 0,
    key = `${mesh.name}:${team}:${keeper}:${id % 5}`;
  if (materials.has(key)) {
    mesh.material = materials.get(key);
    if (geometries.has(key)) mesh.geometry = geometries.get(key);
    return;
  }
  const name = mesh.material.name;
  if (name.includes("Eyes"))
    mesh.material = new T.MeshStandardMaterial({ map: eyeMap, roughness: 0.4 });
  else if (name.includes("Hair"))
    mesh.material = new T.MeshStandardMaterial({
      map: hairMap,
      alphaTest: 0.5,
      side: T.DoubleSide,
      roughness: 0.9,
      color: 0x30271e,
    });
  else {
    const skin = new T.Color(
      ["#bb8968", "#d6a480", "#835841", "#b27f5f", "#d8ac86"][id % 5],
    );
    const shirt = new T.Color(
        keeper ? "#e9bd38" : team ? "#ce5b31" : "#e8ede0",
      ),
      shorts = new T.Color(team ? "#742e23" : "#173e2c"),
      boot = new T.Color([0xd6e06a, 0x252824, 0xeeeeea][id % 3]);
    const kitStyle = { value: new T.Vector3(1, 1, 1) }; // shirt, socks, shoes
    // Classify in bind space in the fragment shader: skinning then preserves
    // crisp cuffs and hems instead of interpolating clothing colors per vertex.
    mesh.material = new T.MeshStandardMaterial({ roughness: 0.92 });
    mesh.material.userData.kitStyle = kitStyle;
    mesh.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        kitStyle,
        kitSkin: { value: skin },
        kitShirt: { value: shirt },
        kitShorts: { value: shorts },
        kitBoot: { value: boot },
      });
      shader.vertexShader =
        "varying vec3 vKitPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvKitPosition = position;",
      );
      shader.fragmentShader =
        "varying vec3 vKitPosition;\nuniform vec3 kitSkin, kitShirt, kitShorts, kitBoot, kitStyle;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        vec3 p = vKitPosition;
        vec3 kit = kitSkin;
        bool collar = abs(p.x) < 0.085 && p.y > 1.49;
        if (kitStyle.x > 0.5 && p.y > 0.93 && p.y < 1.59 && abs(p.x) < 0.48 && !collar) kit = kitShirt;
        else if (p.y > 0.64 && p.y <= 0.95 && abs(p.x) < 0.27) kit = kitShorts;
        else if (kitStyle.y > 0.5 && p.y > 0.12 && p.y < 0.43 && abs(p.x) < 0.27) kit = kitShirt;
        else if (kitStyle.z > 0.5 && p.y <= 0.12) kit = kitBoot;
        if (kitStyle.x > .5 && p.y > 1.28 && p.y < 1.33 && abs(p.x) < .23) kit = mix(kitShirt, vec3(.95), .65);
        if (p.y > .65 && p.y < .91 && abs(p.x) > .21 && abs(p.x) < .27) kit = mix(kitShorts, vec3(.95), .7);
        diffuseColor.rgb *= kit;
      `,
      );
    };
  }
  materials.set(key, mesh.material);
}
const a = new T.Vector3(),
  b = new T.Vector3(),
  c = new T.Vector3(),
  d = new T.Vector3(),
  pole = new T.Vector3(),
  knee = new T.Vector3(),
  q = new T.Quaternion(),
  worldQ = new T.Quaternion(),
  parentQ = new T.Quaternion();
function rotateWorld(bone, delta) {
  bone.getWorldQuaternion(worldQ).premultiply(delta);
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert()).multiply(worldQ);
  bone.updateWorldMatrix(false, true);
}
// Minimal correction of the sampled pose. Preserve the animated knee plane and
// ankle orientation; toe contacts still allow the heel to rise and roll.
export function correctLeg(
  hip,
  shin,
  foot,
  toe,
  target,
  maxCorrection = 0.32,
  kneeDirection = null,
) {
  hip.getWorldPosition(a);
  shin.getWorldPosition(b);
  foot.getWorldPosition(c);
  toe.getWorldPosition(d);
  const footRotation = foot.getWorldQuaternion(new T.Quaternion());
  const anatomical = hip.userData.kneeForward;
  kneeDirection ||= anatomical || null;
  const delta = target.clone().sub(d).clampLength(0, maxCorrection);
  const goal = c.clone().add(delta);
  const l1 = a.distanceTo(b),
    l2 = b.distanceTo(c),
    axis = goal.clone().sub(a),
    distance = T.MathUtils.clamp(
      axis.length(),
      anatomical ? (l1 + l2) * 0.24 : Math.abs(l1 - l2) + 0.001,
      (l1 + l2) * 0.995,
    );
  axis.normalize();
  goal.copy(a).addScaledVector(axis, distance);
  pole.copy(b).sub(a).addScaledVector(axis, -b.clone().sub(a).dot(axis));
  if (kneeDirection)
    pole.copy(kneeDirection).addScaledVector(axis, -kneeDirection.dot(axis));
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
  pole.normalize();
  const along =
    (l1 * l1 + distance * distance - l2 * l2) / (2 * Math.max(0.01, distance));
  knee
    .copy(a)
    .addScaledVector(axis, along)
    .addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
  if (hip.userData.kneeHinge) {
    solveKneeHinge(hip, shin, foot, knee, goal, hip.userData.kneeHinge);
  } else {
    q.setFromUnitVectors(
      b.clone().sub(a).normalize(),
      knee.clone().sub(a).normalize(),
    );
    rotateWorld(hip, q);
    shin.getWorldPosition(b);
    foot.getWorldPosition(c);
    q.setFromUnitVectors(
      c.clone().sub(b).normalize(),
      goal.clone().sub(b).normalize(),
    );
    rotateWorld(shin, q);
  }
  shin.getWorldQuaternion(parentQ);
  foot.quaternion.copy(parentQ.invert()).multiply(footRotation);
  foot.updateWorldMatrix(false, true);
}
const shoeGeometry = new T.CapsuleGeometry(0.064, 0.16, 3, 8)
  .rotateX(Math.PI / 2)
  .scale(1, 0.9, 1);
const shoeMaterials = [0xd6e06a, 0x252824, 0xeeeeea].map(
  (color) => new T.MeshStandardMaterial({ color, roughness: 0.65 }),
);
export function buildSkinnedAthlete(assets, id) {
  const root = new T.Group(),
    model = clone(assets.model);
  root.add(model);

  model.traverse((n) => {
    if (n.isMesh) {
      outfit(n, id);
      n.castShadow = true;
      n.frustumCulled = false;
    }
  });
  model.updateMatrixWorld(true);
  if (id % 5 !== 3) {
    const hair = assets.hair.clone(true);
    hair.traverse((n) => {
      if (n.isMesh) {
        n.material = new T.MeshStandardMaterial({
          map: hairMap,
          alphaTest: 0.5,
          side: T.DoubleSide,
          roughness: 0.95,
          color: [0x221b15, 0x352619, 0x171514][id % 3],
        });
        n.castShadow = true;
      }
    });
    model.add(hair);
    model.updateMatrixWorld(true);
    model.getObjectByName("Head").attach(hair);
  }
  // Lightweight shoe shells conceal individual toes and follow each ankle.
  for (const side of ["l", "r"]) {
    const foot = model.getObjectByName("foot_" + side);
    const toe = model.getObjectByName("ball_" + side);
    const origin = toe.getWorldPosition(new T.Vector3());
    const shoe = new T.Mesh(shoeGeometry, shoeMaterials[id % 3]);
    shoe.position.set(origin.x, 0.04, 0.02);
    model.add(shoe);
    model.updateMatrixWorld(true);
    foot.attach(shoe);
    shoe.castShadow = true;
    shoe.userData.isShoe = true;
  }
  root.scale.setScalar(1.025 + (id % 4) * 0.01);
  const bones = assets.library.bones.map((name) => model.getObjectByName(name));
  const legs = ["l", "r"].map((side) => ({
    hip: model.getObjectByName("thigh_" + side),
    shin: model.getObjectByName("calf_" + side),
    foot: model.getObjectByName("foot_" + side),
    toe: model.getObjectByName("ball_" + side),
    anchor: null,
    restRotation: model
      .getObjectByName("foot_" + side)
      .getWorldQuaternion(new T.Quaternion()),
  }));
  for (const leg of legs)
    leg.hip.userData.kneeHinge = bindKneeHinge(leg.hip, leg.shin, leg.foot);
  const arms = ["l", "r"].map((side) => ({
    side: side === "l" ? 1 : -1,
    upper: model.getObjectByName("upperarm_" + side),
    lower: model.getObjectByName("lowerarm_" + side),
    hand: model.getObjectByName("hand_" + side),
    palm: model.getObjectByName("middle_01_" + side),
    index: model.getObjectByName("index_01_" + side),
    pinky: model.getObjectByName("pinky_01_" + side),
    fingers: bones
      .filter(
        (b) =>
          b.name.endsWith("_" + side) &&
          /^(index|middle|ring|pinky|thumb)_/.test(b.name),
      )
      .map((b) => ({ bone: b, rest: b.quaternion.clone() })),
  }));
  return {
    root,
    model,
    bones,
    legs,
    pelvis: model.getObjectByName("pelvis"),
    torso: model.getObjectByName("spine_02"),
    head: model.getObjectByName("Head"),
    type: "skinned",
    arms,
    handSupport: null,
  };
}
export function animateSkinnedAthlete(rig, p, match) {
  if (rig.outfitMode !== match.variant) {
    rig.outfitMode = match.variant;
    const street = match.variant === "street",
      beach = match.field?.surface === "sand";
    rig.root.traverse((node) => {
      if (node.userData.isShoe) node.visible = !beach;
      node.material?.userData.kitStyle?.value.set(
        street && p.team === 1 ? 0 : 1,
        street || beach ? 0 : 1,
        beach ? 0 : 1,
      );
    });
  }
  const motion = p.motion;
  if (!motion) return;
  const l = p.locomotion;
  rig.root.position.set(p.x, 0, p.z);
  rig.root.rotation.set(0, l.heading, 0);
  rig.root.rotateX((motion.driveLean || 0) * 0.4);
  for (let i = 0; i < rig.bones.length; i++) {
    const bone = rig.bones[i],
      offset = i * 7;
    bone.position.fromArray(motion.pose, offset);
    bone.quaternion.fromArray(motion.pose, offset + 3);
    if (
      motion.action === "locomotion" &&
      !motionAction(p) &&
      !p.recovery &&
      /^(upperarm|lowerarm)_/.test(bone.name)
    ) {
      const rest = new T.Quaternion().fromArray(motion.idlePose, offset + 3);
      bone.quaternion.slerp(rest, (motion.relaxedBlend || 0) * 0.5);
    }
  }
  // A stable anatomical bend plane is shared by every mode. The old solver
  // could inherit a reversed knee plane from an extreme sampled pose.
  const legForward = new T.Vector3(Math.sin(l.heading), 0, Math.cos(l.heading));
  for (const leg of rig.legs) leg.hip.userData.kneeForward = legForward;
  if (match.field?.altinha || match.field?.footvolley) {
    poseAltinha(rig, p, match);
    return;
  }
  if (motion.action === "locomotion" && !p.header && !p.keeper) {
    const calm = 1 - T.MathUtils.clamp(Math.hypot(p.vx, p.vz) / 5, 0, 1);
    const heading = l.heading,
      right = new T.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    rig.root.updateMatrixWorld(true);
    rotateWorld(
      rig.torso,
      new T.Quaternion().setFromAxisAngle(
        right,
        Math.sin(match.elapsed * 2.7 + p.id) * 0.016 * calm,
      ),
    );
    const ballYaw = Math.atan2(match.ball.x - p.x, match.ball.z - p.z);
    const yaw = Math.atan2(
      Math.sin(ballYaw - heading),
      Math.cos(ballYaw - heading),
    );
    rotateWorld(
      rig.head,
      new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        T.MathUtils.clamp(yaw, -0.55, 0.55) * 0.38 * calm,
      ),
    );
  }
  if (poseSpecial(rig, p, match)) return;
  if (p.keeper && p.goalkeeping) {
    poseGoalkeeper(rig, p);
    return;
  }
  if (p.throwIn) {
    for (let i = 0; i < rig.bones.length; i++) {
      rig.bones[i].position.fromArray(motion.idlePose, i * 7);
      rig.bones[i].quaternion.fromArray(motion.idlePose, i * 7 + 3);
    }
    rig.root.rotation.set(0, l.heading, 0);
    rig.torso.rotateX(-0.08 + (p.throwIn.phase || 0) * 0.2);
    rig.root.updateMatrixWorld(true);
    for (const arm of rig.arms) {
      const b = p.throwIn.ball;
      const target = new T.Vector3(
        b.x + Math.cos(l.heading) * arm.side * 0.11,
        b.y,
        b.z - Math.sin(l.heading) * arm.side * 0.11,
      );
      correctLeg(
        arm.upper,
        arm.lower,
        arm.hand,
        arm.palm,
        target,
        2,
        new T.Vector3(
          Math.cos(l.heading) * arm.side,
          0.2,
          -Math.sin(l.heading) * arm.side,
        ),
      );
    }
    rig.root.updateMatrixWorld(true);
    return;
  }
  if (p.header) {
    // Aerial pose has no planted-foot IK: both shoes travel with the jump.
    for (let i = 0; i < rig.bones.length; i++) {
      rig.bones[i].position.fromArray(motion.idlePose, i * 7);
      rig.bones[i].quaternion.fromArray(motion.idlePose, i * 7 + 3);
    }
    rig.root.rotation.set(0, l.heading, 0);
    rig.torso.rotateX(p.header.fold || 0);
    rig.head.rotateX((p.header.fold || 0) * 0.5);
    for (const arm of rig.arms) {
      arm.upper.rotateZ(arm.side * 0.65);
      arm.upper.rotateX(-0.25);
    }
    for (const leg of rig.legs) {
      leg.anchor = null;
      leg.shin.rotateX(-0.18);
    }
    rig.root.updateMatrixWorld(true);
    const head = rig.head.getWorldPosition(new T.Vector3());
    const contact = headPosition(p);
    // Head bone is at the base of the skull, 12cm below its contact centre.
    rig.root.position.add(
      new T.Vector3(
        contact.x - head.x,
        contact.y - head.y - 0.12,
        contact.z - head.z,
      ),
    );
    rig.root.updateMatrixWorld(true);
    return;
  }
  // Support-driven ginga and velocity-dependent strike loading. World-space
  // planted feet below remain fixed and are solved by the existing leg IK.
  const expression = l.expression || {};
  const right = new T.Vector3(Math.cos(l.heading), 0, -Math.sin(l.heading));
  const forward = new T.Vector3(Math.sin(l.heading), 0, Math.cos(l.heading));
  rig.root.position.addScaledVector(right, expression.shift || 0);
  rig.root.position.addScaledVector(forward, -(expression.hipBack || 0));
  rig.root.rotateX(-(expression.strikeLean || 0) * 0.45);
  rig.root.updateMatrixWorld(true);
  const worldTurn = (bone, axis, amount) => {
    if (amount)
      rotateWorld(bone, new T.Quaternion().setFromAxisAngle(axis, amount));
  };
  const up = new T.Vector3(0, 1, 0);
  worldTurn(rig.pelvis, up, expression.twist || 0);
  worldTurn(rig.torso, up, -(expression.twist || 0) * 1.65);
  worldTurn(rig.torso, forward, -(expression.lean || 0));
  worldTurn(rig.head, up, (expression.twist || 0) * 0.35);
  // Hinge through hips and spine, not a rigid whole-body tilt.
  worldTurn(rig.pelvis, right, (expression.fold || 0) * 0.25);
  worldTurn(rig.torso, right, (expression.fold || 0) * 0.75);
  worldTurn(rig.head, right, -(expression.fold || 0) * 0.35);
  worldTurn(rig.torso, right, -(expression.strikeLean || 0) * 0.55);
  for (const arm of rig.arms) {
    worldTurn(arm.upper, forward, arm.side * (expression.arms || 0));
    worldTurn(
      arm.upper,
      right,
      (expression.twist || 0) * arm.side * 0.45 +
        (expression.strikeArms || 0) *
          arm.side *
          ((p.strikePlant?.foot ?? l.strikeFollow?.supportFoot) === 0 ? -1 : 1),
    );
  }
  // Rare cosmetic pass/reception variants keep both the contact target and
  // the simulation untouched. Suppress immediately for an urgent new action.
  const flair = p.flair;
  if (
    flair &&
    !motionAction(p) &&
    !p.recovery &&
    !p.shield &&
    Math.hypot(p.vx, p.vz) < 4.2
  ) {
    const phase = T.MathUtils.clamp(
      (match.elapsed - flair.at) / flair.duration,
      0,
      1,
    );
    const wave = Math.sin(Math.PI * phase),
      side = flair.side;
    worldTurn(rig.torso, up, side * 0.16 * wave);
    worldTurn(
      rig.head,
      up,
      side * (flair.kind === "no-look" ? -0.45 : 0.14) * wave,
    );
    worldTurn(
      rig.torso,
      right,
      (flair.kind === "soft-chest" ? -0.13 : 0.03) * wave,
    );
    for (const arm of rig.arms)
      worldTurn(arm.upper, forward, arm.side * 0.13 * wave);
    if (flair.kind === "open-foot")
      worldTurn(rig.legs[flair.foot].foot, up, side * 0.18 * wave);
  }
  // Whole-body launch pitch plus extra torso flexion, fading as acceleration falls.
  rig.root.updateMatrixWorld(true);
  rotateWorld(
    rig.torso,
    new T.Quaternion().setFromAxisAngle(
      new T.Vector3(Math.cos(l.heading), 0, -Math.sin(l.heading)),
      (motion.driveLean || 0) * 0.55,
    ),
  );
  // Force response is a small additive layer over authored animation.
  const walkUpright =
    1 -
    0.6 *
      (motion.relaxedBlend || 0) *
      (1 - Math.max(p.sprintLaunch || 0, l.cutBlend || 0));
  rig.torso.rotateX(
    (l.leanX * Math.sin(l.heading) + l.leanZ * Math.cos(l.heading)) *
      0.5 *
      walkUpright,
  );
  rig.torso.rotateZ(
    -(l.leanX * Math.cos(l.heading) - l.leanZ * Math.sin(l.heading)) * 0.5,
  );
  const control = match.controls[p.team];
  const charge =
    motionAction(p) && control.charging && control.selected === p.id
      ? control.charge
      : 0;
  rig.torso.rotateY(-charge * 0.16 + (p.actionTwist || 0));
  const recovery = p.recoveryDuration
    ? (p.recovery || 0) / p.recoveryDuration
    : 0;
  const falling = !!p.followStyle?.fall && recovery > 0;
  const fallPhase = 1 - recovery;
  const fallAmount = falling
    ? fallPhase < 0.3
      ? T.MathUtils.smoothstep(fallPhase, 0, 0.3)
      : 1 - T.MathUtils.smoothstep(fallPhase, 0.55, 1)
    : 0;
  if (falling) {
    rig.root.rotateZ(Math.sign(p.followStyle.turn || 1) * fallAmount * 1.38);
    rig.root.position.y -= fallAmount * 0.28;
    rig.torso.rotateX(-fallAmount * 0.18);
  } else if (p.followTime > 0) {
    rig.torso.rotateZ(
      Math.sign(p.followStyle?.turn || 1) *
        (p.followStyle?.imbalance || 0) *
        Math.sin((p.followTime / 0.65) * Math.PI) *
        0.3,
    );
  }
  rig.root.updateMatrixWorld(true);
  const footPosition = new T.Vector3();
  const targets = rig.legs.map((leg, i) => {
    leg.toe.getWorldPosition(footPosition);
    if (motion.action === "locomotion") {
      const dx = footPosition.x - p.x,
        dz = footPosition.z - p.z;
      const forward = dx * Math.sin(l.heading) + dz * Math.cos(l.heading);
      const lateral = dx * Math.cos(l.heading) - dz * Math.sin(l.heading);
      const stride = motion.strideScale ?? 1;
      const width = motion.gait === "walk" || motion.gait === "idle" ? 0.8 : 1;
      footPosition.x =
        p.x +
        Math.sin(l.heading) * forward * stride +
        Math.cos(l.heading) * lateral * width;
      footPosition.z =
        p.z +
        Math.cos(l.heading) * forward * stride -
        Math.sin(l.heading) * lateral * width;
      footPosition.y =
        0.02 +
        Math.max(0, footPosition.y - 0.02) *
          Math.min(1.2, stride) *
          (motion.gait === "walk"
            ? 0.6
            : motion.gait === "sprint"
              ? 1.15
              : 0.72);
    }

    const physical = l.feet.find((f) => (f.side > 0 ? 0 : 1) === i);
    const interacting = l.feet.some(
      (f) =>
        f.special === "ball" ||
        f.special === "reach" ||
        f.special === "plant" ||
        f.special === "windup",
    );
    if (
      interacting &&
      (physical.special === "ball" ||
        physical.special === "reach" ||
        physical.special === "plant" ||
        physical.special === "windup" ||
        physical.contact)
    ) {
      leg.anchor = null;
      // Ball interactions use a flat shoe near contact, not the unrelated
      // sampled run clip's ankle pitch. IK still preserves leg lengths.
      const desiredRotation = new T.Quaternion()
        .setFromAxisAngle(new T.Vector3(0, 1, 0), physical.heading)
        .multiply(leg.restRotation);
      const parentRotation = leg.foot.parent.getWorldQuaternion(
        new T.Quaternion(),
      );
      leg.foot.quaternion
        .copy(parentRotation.invert())
        .multiply(desiredRotation);
      leg.foot.updateWorldMatrix(false, true);
      return {
        kneeDirection: new T.Vector3(
          Math.sin(l.heading),
          0,
          Math.cos(l.heading),
        ),
        target: new T.Vector3(
          physical.x,
          Math.max(0.025, physical.y - 0.04),
          physical.z,
        ),
        limit: 1.2,
        reaching: !physical.contact,
        support: physical.contact,
      };
    }
    const contacting =
      motion.feature.contacts[i] && (motion.action !== "strike" || i === 0);
    if (i === 1 && motion.action === "strike" && p.strikeTarget) {
      leg.anchor = null;
      const contact = p.strikeTarget;
      const phase = T.MathUtils.clamp((motion.time - 0.42) / 0.4, 0, 1);
      const follow = Math.sin(phase * Math.PI);
      const target = new T.Vector3(
        contact.x + contact.dx * follow * 0.25,
        0.09 + follow * (0.2 + contact.power * 0.35),
        contact.z + contact.dz * follow * 0.25,
      );
      target.lerp(footPosition, T.MathUtils.smoothstep(phase, 0.55, 1));
      return { target, limit: 0.8 };
    }
    const reach = l.feet.find(
      (f) => f.special === "reach" && (f.side > 0 ? 0 : 1) === i,
    );
    if (reach) {
      leg.anchor = null;
      return {
        target: new T.Vector3(
          reach.x,
          Math.max(0.025, reach.y - 0.06),
          reach.z,
        ),
        limit: 0.9,
        reaching: true,
      };
    }
    if (contacting) {
      if (!leg.anchor || leg.anchor.distanceTo(footPosition) > 0.38)
        leg.anchor = footPosition.clone();
      leg.anchor.y = 0.02;
      return { target: leg.anchor, limit: 0.8, support: true };
    }
    leg.anchor = null;
    const target = footPosition.clone();
    target.x = p.x + (target.x - p.x) * (1 + 0.18 * charge);
    target.z = p.z + (target.z - p.z) * (1 + 0.18 * charge);
    target.y = Math.max(0.025, target.y);
    return { target, limit: 0.25 };
  });
  // Retargeted hips can sit too high for a planted toe during a transition.
  // Lower the pelvis as a unit before solving either leg, preserving leg lengths.
  let pelvisDrop = 0;
  rig.legs.forEach((leg, i) => {
    if (!targets[i].support && !targets[i].reaching) return;
    const hip = leg.hip.getWorldPosition(new T.Vector3());
    const shin = leg.shin.getWorldPosition(new T.Vector3());
    const foot = leg.foot.getWorldPosition(new T.Vector3());
    const toe = leg.toe.getWorldPosition(new T.Vector3());
    const ankleGoal = targets[i].target.clone().add(foot).sub(toe);
    const reach = (hip.distanceTo(shin) + shin.distanceTo(foot)) * 0.985;
    const horizontal = Math.hypot(hip.x - ankleGoal.x, hip.z - ankleGoal.z);
    const vertical = Math.sqrt(
      Math.max(0, reach * reach - horizontal * horizontal),
    );
    pelvisDrop = Math.max(
      pelvisDrop,
      targets[i].reaching
        ? Math.min(0.18, hip.y - ankleGoal.y - vertical)
        : hip.y - ankleGoal.y - vertical,
    );
  });
  // Add cut flexion after reach correction, so existing IK compensation does
  // not swallow the crouch. Solve knees with unchanged planted-foot targets.
  pelvisDrop = T.MathUtils.clamp(
    pelvisDrop +
      Math.min(0.2, 0.13 * (l.cutBlend || 0) + (expression.crouch || 0)),
    0,
    0.42,
  );
  rig.pelvisDrop = pelvisDrop;
  rig.root.position.y -= falling ? 0 : pelvisDrop;
  rig.root.updateMatrixWorld(true);
  rig.legs.forEach((leg, i) =>
    correctLeg(
      leg.hip,
      leg.shin,
      leg.foot,
      leg.toe,
      targets[i].target,
      targets[i].limit,
      targets[i].kneeDirection,
    ),
  );
  rig.root.updateMatrixWorld(true);
  if (falling) {
    // Keep the hip/knee volumes above the grass while the body rolls onto a side.
    let clearance = 0;
    for (const leg of rig.legs) {
      clearance = Math.max(
        clearance,
        0.16 - leg.hip.getWorldPosition(new T.Vector3()).y,
        0.1 - leg.shin.getWorldPosition(new T.Vector3()).y,
      );
    }
    rig.root.position.y += Math.max(0, clearance);
    rig.root.updateMatrixWorld(true);
  }
  if (falling) {
    const supportSide = p.followStyle.turn > 0 ? -1 : 1;
    for (const arm of rig.arms) {
      const supporting = arm.side === supportSide;
      const blend =
        T.MathUtils.smoothstep(fallPhase, 0, 0.16) *
        (1 - T.MathUtils.smoothstep(fallPhase, 0.8, 1));
      const current = arm.palm.getWorldPosition(new T.Vector3());
      const lateral = supporting ? supportSide * 1.12 : arm.side * 0.72;
      const desired = new T.Vector3(
        p.x + Math.cos(l.heading) * lateral + Math.sin(l.heading) * 0.2,
        supporting ? 0.055 : 0.9,
        p.z - Math.sin(l.heading) * lateral + Math.cos(l.heading) * 0.2,
      );
      for (const { bone, rest } of arm.fingers)
        bone.quaternion.slerp(rest, blend);
      arm.hand.updateWorldMatrix(false, true);
      if (supporting) {
        if (!rig.handSupport || fallPhase < 0.2)
          rig.handSupport = { side: supportSide, target: desired.clone() };
        if (fallPhase >= 0.2 && fallPhase < 0.78)
          desired.copy(rig.handSupport.target);
        // Flatten the palm plane, retaining open fingers and a bent elbow.
        const along = arm.palm
          .getWorldPosition(new T.Vector3())
          .sub(arm.hand.getWorldPosition(new T.Vector3()))
          .normalize();
        const across = arm.index
          .getWorldPosition(new T.Vector3())
          .sub(arm.pinky.getWorldPosition(new T.Vector3()))
          .normalize();
        const normal = across.cross(along).normalize();
        if (normal.y < 0) normal.negate();
        rotateWorld(
          arm.hand,
          new T.Quaternion().setFromUnitVectors(normal, new T.Vector3(0, 1, 0)),
        );
      }
      correctLeg(
        arm.upper,
        arm.lower,
        arm.hand,
        arm.palm,
        current.lerp(desired, blend),
        2,
        new T.Vector3(
          -Math.sin(l.heading) * 0.8 + Math.cos(l.heading) * arm.side * 0.3,
          0.25,
          -Math.cos(l.heading) * 0.8 - Math.sin(l.heading) * arm.side * 0.3,
        ),
      );
      if (supporting) {
        const actual = arm.palm.getWorldPosition(new T.Vector3());
        rig.handSupport.actual = actual;
        rig.handSupport.error = actual.distanceTo(desired);
        rig.handSupport.phase = fallPhase;
      }
    }
  } else rig.handSupport = null;
  rig.root.updateMatrixWorld(true);
}

function poseSpecial(rig, p, match) {
  const special =
    p.slide || p.knockdown || p.evade || p.bicycle || p.celebration;
  const wall = match.setPiece?.wall?.includes(p.id);
  if (!special && !wall) return false;
  for (let i = 0; i < rig.bones.length; i++) {
    rig.bones[i].position.fromArray(p.motion.idlePose, i * 7);
    rig.bones[i].quaternion.fromArray(p.motion.idlePose, i * 7 + 3);
  }
  let pelvisHeight = null;
  if (p.slide) {
    const u = p.slide.time,
      blend = Math.min(1, u / 0.13) * Math.min(1, (1.05 - u) / 0.22);
    rig.root.rotateX(-1.12 * blend);
    pelvisHeight = 1.02 - 0.66 * blend;
    rig.legs[0].hip.rotateX(0.45 * blend);
    rig.legs[1].hip.rotateX(-0.6 * blend);
    rig.legs[1].shin.rotateX(1.2 * blend);
    rig.arms.forEach((a) => {
      a.upper.rotateZ(a.side * 0.65 * blend);
      a.lower.rotateX(-0.45);
    });
  } else if (p.knockdown) {
    const t = p.knockdown.time,
      blend = Math.min(1, t / 0.18) * Math.min(1, (1.6 - t) / 0.45);
    rig.root.rotateX(1.38 * blend);
    pelvisHeight = 1.02 - 0.72 * blend;
    rig.arms.forEach((a) => a.upper.rotateX(-1.1 * blend));
    rig.legs.forEach((l) => l.shin.rotateX(0.65 * blend));
  } else if (p.bicycle) {
    const u = Math.min(1, p.bicycle.time / 1.2),
      air = Math.sin(Math.PI * u);
    rig.root.rotation.set(0, p.bicycle.heading, 0);
    rig.root.rotateX(-2.6 * air);
    pelvisHeight = 0.95 + 0.42 * air;
    const scissor = Math.sin(u * Math.PI * 3);
    rig.legs[0].hip.rotateX(1.1 * scissor);
    rig.legs[1].hip.rotateX(-1.1 * scissor);
    rig.legs[0].shin.rotateX(0.3);
    rig.legs[1].shin.rotateX(0.85);
    rig.arms.forEach((a) => a.upper.rotateZ(a.side * 0.95));
  } else if (p.evade) {
    rig.root.position.y = p.evade.height;
    rig.legs.forEach((l) => {
      l.hip.rotateX(-0.6);
      l.shin.rotateX(1.1);
    });
    rig.arms.forEach((a) => a.upper.rotateZ(a.side * 0.8));
  } else if (p.celebration) {
    const c = p.celebration;
    if (c.won) {
      rig.root.position.y = 0;
      rig.arms.forEach((a) => {
        a.upper.rotateZ(a.side * (1.5 + Math.sin(c.time * 6) * 0.3));
        a.lower.rotateX(-0.5);
      });
      rig.torso.rotateY(Math.sin(c.time * 5) * 0.15);
    } else {
      rig.head.rotateX(0.5);
      rig.torso.rotateX(0.15);
      rig.root.updateMatrixWorld(true);
      const head = rig.head.getWorldPosition(new T.Vector3());
      const heading = p.locomotion.heading;
      for (const arm of rig.arms) {
        const target = head
          .clone()
          .add(
            new T.Vector3(
              Math.cos(heading) * arm.side * 0.13 + Math.sin(heading) * 0.055,
              0.1,
              -Math.sin(heading) * arm.side * 0.13 + Math.cos(heading) * 0.055,
            ),
          );
        correctLeg(
          arm.upper,
          arm.lower,
          arm.hand,
          arm.palm,
          target,
          2,
          new T.Vector3(
            Math.cos(heading) * arm.side,
            0.15,
            -Math.sin(heading) * arm.side,
          ),
        );
      }
    }
  } else if (wall) {
    rig.arms.forEach((a) => {
      a.upper.rotateX(-0.4);
      a.lower.rotateX(-1.2);
    });
  }
  rig.root.updateMatrixWorld(true);
  if (pelvisHeight !== null) {
    const current = rig.pelvis.getWorldPosition(new T.Vector3());
    rig.root.position.y += pelvisHeight - current.y;
    rig.root.updateMatrixWorld(true);
  }
  // Avoid limbs penetrating the street while retaining the low sliding pose.
  if (p.slide || p.knockdown || p.bicycle) {
    let lowest = Infinity;
    for (const leg of rig.legs)
      for (const b of [leg.foot, leg.toe])
        lowest = Math.min(lowest, b.getWorldPosition(new T.Vector3()).y);
    if (lowest < 0.045) rig.root.position.y += 0.045 - lowest;
  }
  rig.root.updateMatrixWorld(true);
  return true;
}
function poseGoalkeeper(rig, p) {
  const g = p.goalkeeping,
    dir = p.team === 0 ? 1 : -1;
  const active = g.mode !== "set";
  rig.root.rotation.set(0, (dir * Math.PI) / 2, g.roll);
  rig.root.updateMatrixWorld(true);
  const pelvis = rig.pelvis.getWorldPosition(new T.Vector3());
  rig.root.position.add(new T.Vector3(p.x, g.height, p.z).sub(pelvis));
  rig.root.updateMatrixWorld(true);
  if (
    !active ||
    g.mode === "prepare" ||
    (Math.abs(g.roll) < 0.5 && g.height < 1.02)
  ) {
    rig.legs.forEach((leg, i) => {
      const f = p.locomotion.feet[i];
      correctLeg(
        leg.hip,
        leg.shin,
        leg.foot,
        leg.toe,
        new T.Vector3(f.x, 0.09, f.z),
        2,
        new T.Vector3(dir, 0, 0),
      );
    });
  } else {
    // Bend trailing legs in flight; they are not planted while diving.
    rig.legs.forEach((leg, i) => {
      leg.hip.rotateX(i === 0 ? -0.18 : 0.12);
      leg.shin.rotateX(0.35);
    });
  }
  rig.root.updateMatrixWorld(true);
  let clearance = 0;
  for (const leg of rig.legs)
    for (const bone of [leg.hip, leg.shin, leg.foot])
      clearance = Math.max(
        clearance,
        0.07 - bone.getWorldPosition(new T.Vector3()).y,
      );
  rig.root.position.y += clearance;
  rig.root.updateMatrixWorld(true);
  rig.keeperHands = [];
  rig.arms.forEach((arm, i) => {
    for (const { bone, rest } of arm.fingers) bone.quaternion.copy(rest);
    const target = new T.Vector3(
      g.hands[i]?.x ?? p.x,
      g.hands[i]?.y ?? 1,
      g.hands[i]?.z ?? p.z,
    );
    correctLeg(
      arm.upper,
      arm.lower,
      arm.hand,
      arm.palm,
      target,
      3,
      new T.Vector3(-dir, 0.1, arm.side * 0.35),
    );
    // Face the palm into the incoming flight, using the same open-hand basis as falls.
    const along = arm.palm
      .getWorldPosition(new T.Vector3())
      .sub(arm.hand.getWorldPosition(new T.Vector3()))
      .normalize();
    const across = arm.index
      .getWorldPosition(new T.Vector3())
      .sub(arm.pinky.getWorldPosition(new T.Vector3()))
      .normalize();
    const normal = across.cross(along).normalize();
    if (normal.x * dir < 0) normal.negate();
    rotateWorld(
      arm.hand,
      new T.Quaternion().setFromUnitVectors(normal, new T.Vector3(dir, 0, 0)),
    );
    correctLeg(
      arm.upper,
      arm.lower,
      arm.hand,
      arm.palm,
      target,
      3,
      new T.Vector3(-dir, 0.1, arm.side * 0.35),
    );
    const actual = arm.palm.getWorldPosition(new T.Vector3());
    rig.keeperHands.push({
      target: target.clone(),
      actual: actual.clone(),
      error: actual.distanceTo(target),
    });
  });
  rig.root.updateMatrixWorld(true);
}

function poseAltinha(rig, p, m) {
  let action = p.altinhaPose;
  const time = m.elapsed,
    heading = p.locomotion.heading;
  if (
    m.field.footvolley &&
    action &&
    action.hitAt == null &&
    !action.dive &&
    action.jumpAt == null
  ) {
    const height =
      action.kind === "head"
        ? 1.75
        : action.kind === "chest"
          ? 1.45
          : action.kind === "thigh"
            ? 0.92
            : 0.55;
    // Keep the sampled walk/run until the actual contact window. Planting the
    // chest pose or holding up one foot during the whole approach caused sliding.
    if (
      Math.hypot(m.ball.x - p.x, m.ball.z - p.z) > 0.9 ||
      m.ball.y > height + 0.4
    )
      action = null;
  }
  const clamp = T.MathUtils.clamp,
    smooth = (x) => {
      x = clamp(x, 0, 1);
      return x * x * (3 - 2 * x);
    };
  const speed = Math.hypot(p.vx, p.vz),
    quiet = 1 - clamp(speed / (m.field.footvolley ? 0.35 : 2.2), 0, 1);
  const forward = new T.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const right = new T.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const up = new T.Vector3(0, 1, 0);
  const enter = action ? smooth((time - action.startedAt) / 0.18) : 0;
  const release =
    (action?.hitAt ?? action?.landedAt) != null
      ? 1 -
        smooth(
          (time - (action.hitAt ?? action.landedAt)) /
            (action.acrobatic ? 1.45 : action.rescue || action.dive ? 1 : 0.48),
        )
      : 1;
  const landingAge =
    action?.rescue && action.hitAt != null ? time - action.hitAt : 0;
  const kneel =
    landingAge > 0
      ? smooth(landingAge / 0.18) * (1 - smooth((landingAge - 0.5) / 0.5))
      : 0;
  const jumpPose = volleyJumpPose(action, time);
  const weight =
      enter *
      release *
      (action?.jumpAt != null
        ? smooth((time - action.jumpAt - VOLLEY_PREPARE) / 0.12)
        : 1),
    side = action?.side ?? 1;
  const bicycle = action?.kind === "bicycle";
  const highKick = action?.kind === "high-kick";
  const jump = volleyJump(action, time);
  const rescueTime = action?.rescue
    ? smooth((time - action.rescue.at) / 0.14)
    : 0;
  const fold = (action?.rescue?.fold || 0) * rescueTime * release;
  const index = side > 0 ? 0 : 1;
  // Stable ready stance, but retain the authored gait whenever actually walking.
  for (let i = 0; i < rig.bones.length; i++) {
    const bone = rig.bones[i],
      offset = i * 7;
    bone.position.lerp(
      new T.Vector3().fromArray(p.motion.idlePose, offset),
      quiet,
    );
    bone.quaternion.slerp(
      new T.Quaternion().fromArray(p.motion.idlePose, offset + 3),
      quiet,
    );
  }
  rig.root.rotation.set(0, heading, 0);
  const breathing = Math.sin(time * 3.2 + p.id * 0.8);
  const transfer =
    -side * 0.075 * weight + Math.sin(time * 1.8 + p.id) * 0.018 * quiet;
  rig.root.position.addScaledVector(right, transfer);
  rig.root.position.y =
    -0.035 * quiet -
    0.045 * weight +
    0.009 * breathing * quiet -
    Math.max((action?.crouch || 0) * weight, 0.44 * kneel);
  rig.root.position.y += jump - jumpPose.crouch;
  if (highKick) {
    rig.root.rotateX(-0.35 * weight);
    rig.root.rotateZ(-side * 1.15 * weight);
    rig.root.updateMatrixWorld(true);
    const pelvis = rig.pelvis.getWorldPosition(new T.Vector3());
    rig.root.position.x += (p.x - forward.x * 0.12 - pelvis.x) * weight;
    rig.root.position.z += (p.z - forward.z * 0.12 - pelvis.z) * weight;
    rig.root.position.y += (1.02 + jump - pelvis.y) * weight;
  }
  if (action?.acrobatic) {
    const age = time - action.jumpAt - VOLLEY_PREPARE;
    const fall = smooth((age - 0.5) / 0.3) * (1 - smooth((age - 1.05) / 0.6));
    rig.root.rotateZ(-side * (1.5 - 1.15 * weight) * fall);
    rig.root.updateMatrixWorld(true);
    const pelvis = rig.pelvis.getWorldPosition(new T.Vector3());
    rig.root.position.y += (0.32 - pelvis.y) * fall;
  }
  if (action?.dive) {
    // Lean back and fall sideways while extending the kicking leg; recover
    // after the contact (or missed attempt), with no change to knee axes.
    const fall = smooth((time - action.dive.at) / 0.28) * release;
    rig.root.rotation.x = -0.65 * fall;
    rig.root.rotation.z = -side * 1.05 * fall;
    rig.root.updateMatrixWorld(true);
    rig.root.position.y +=
      (0.45 - rig.pelvis.getWorldPosition(new T.Vector3()).y) * fall;
  }
  if (bicycle) {
    rig.root.rotateX(-1.3 * weight);
    rig.root.updateMatrixWorld(true);
    rig.root.position.y +=
      1 + 0.13 * weight - rig.pelvis.getWorldPosition(new T.Vector3()).y;
  }
  rig.root.updateMatrixWorld(true);
  const turn = (bone, axis, amount) =>
    rotateWorld(bone, new T.Quaternion().setFromAxisAngle(axis, amount));
  const twist =
    (action?.kind === "outside"
      ? -0.18
      : action?.kind === "cross"
        ? 0.22
        : action?.kind === "heel"
          ? 0.28
          : 0) * weight;
  turn(rig.pelvis, up, twist);
  turn(rig.pelvis, right, fold * 0.72);
  turn(rig.torso, right, jumpPose.lean);
  turn(rig.torso, up, -twist * 0.65);
  turn(rig.torso, forward, side * 0.075 * weight);
  turn(
    rig.torso,
    right,
    bodyTouch(action)
      ? action.kind === "chest"
        ? -0.29 * weight
        : fold * 0.28 - 0.12 * weight * (1 - rescueTime)
      : 0.025 * breathing * quiet - 0.06 * weight,
  );
  const ballDistance = Math.hypot(m.ball.x - p.x, m.ball.z - p.z);
  turn(
    rig.head,
    right,
    clamp((1.6 - m.ball.y) / Math.max(0.8, ballDistance), -0.5, 0.4) * 0.25 -
      fold * 0.25,
  );
  for (const arm of rig.arms) {
    turn(
      arm.upper,
      forward,
      arm.side *
        (0.13 * quiet + (action?.kind === "chest" ? 0.58 : 0.36) * weight),
    );
    turn(
      arm.upper,
      right,
      (-0.08 + arm.side * side * 0.15) * weight + 0.035 * breathing * quiet,
    );
    turn(arm.lower, right, -0.15 * quiet - 0.18 * weight);
  }
  rig.root.updateMatrixWorld(true);
  rig.altinhaBodyContact = null;
  if (bodyTouch(action) && kneel < 0.1) {
    // Couple the visible shoulder/chest to the same surface used by the ball.
    // Reach comes from a small torso lean/shift, while planted feet stay fixed.
    const surface =
      action.contact && action.hitAt != null
        ? action.contact
        : bodySurface(p, action, m.ball, time);
    if (action.jumpAt != null && action.hitAt == null)
      surface.y += jump - jumpPose.crouch;
    const shoulder = action.kind === "shoulder",
      head = action.kind === "head";
    const shrug = shoulder ? shoulderMotion(action, m.ball, time) : null;
    turn(
      rig.torso,
      forward,
      shoulder ? side * shrug.roll : -side * 0.12 * weight,
    );
    turn(rig.torso, up, side * 0.1 * weight);
    if (shoulder) {
      const clavicle = rig.model.getObjectByName(
        side > 0 ? "clavicle_l" : "clavicle_r",
      );
      if (clavicle) turn(clavicle, forward, side * shrug.lift * 2.5);
    }
    const anchor = () =>
      head
        ? rig.head
            .getWorldPosition(new T.Vector3())
            .addScaledVector(up, 0.17 * rig.root.scale.x)
            .addScaledVector(forward, 0.04 * rig.root.scale.x)
        : shoulder
          ? rig.arms[index].upper
              .getWorldPosition(new T.Vector3())
              .addScaledVector(up, 0.055 * rig.root.scale.x)
          : rig.torso
              .getWorldPosition(new T.Vector3())
              .addScaledVector(up, 0.29 * rig.root.scale.x)
              .addScaledVector(forward, 0.13 * rig.root.scale.x);
    rig.root.updateMatrixWorld(true);
    const actual = anchor(),
      target = new T.Vector3(surface.x, surface.y, surface.z);
    const delta = target
      .clone()
      .sub(actual)
      .clampLength(0, action.rescue ? 0.5 : 0.3)
      .multiplyScalar(weight);
    rig.root.position.add(delta);
    rig.root.updateMatrixWorld(true);
    rig.altinhaBodyContact = {
      kind: action.kind,
      actual: anchor(),
      target,
      error: anchor().distanceTo(target),
    };
  }
  const lifted = action && !["head", "chest", "shoulder"].includes(action.kind);
  const localTarget = (x, y, z) =>
    new T.Vector3(p.x, y, p.z)
      .addScaledVector(right, x)
      .addScaledVector(forward, z);
  for (let i = 0; i < rig.legs.length; i++) {
    const leg = rig.legs[i],
      legSide = i === 0 ? 1 : -1;
    const planted =
      bodyTouch(action) ||
      (action?.kind === "around" && action.stage === "orbit" && i !== index);
    if (planted) {
      // Lower through the knees without carrying the walking ankle pitch into
      // the sand. Keep both soles supported during the short body adjustment.
      const flat = new T.Quaternion()
        .setFromAxisAngle(up, heading)
        .multiply(leg.restRotation);
      leg.foot.quaternion
        .copy(leg.shin.getWorldQuaternion(new T.Quaternion()).invert())
        .multiply(flat);
      leg.foot.updateWorldMatrix(false, true);
    }
    const contactFoot =
      action?.kind === "high-heel" && i === index ? leg.foot : leg.toe;
    let target = contactFoot.getWorldPosition(new T.Vector3());
    // Fix the support foot while the pelvis sinks and shifts over it.
    const ground = bicycle
      ? localTarget(legSide * 0.2, 0.035 + weight * 0.95, 0.1 + weight * 0.2)
      : localTarget(
          legSide * 0.13,
          contactFoot === leg.foot ? 0.11 : 0.035,
          0.1 - 0.45 * kneel,
        );
    ground.y += jump + (highKick && i !== index ? 0.3 * weight : 0);
    target.lerp(ground, planted ? 1 : quiet);
    if (lifted && i === index) {
      let desired;
      if (highKick) {
        const f = volleyFootSurface(p, action, time);
        desired = new T.Vector3(f.x, f.y, f.z);
        desired.lerp(
          localTarget(side * 0.18, 0.08, 0.4),
          smooth((time - action.jumpAt - VOLLEY_PREPARE - 0.5) / 0.3),
        );
      } else if (action.kind === "pickup" && action.hitAt == null) {
        const f = pickupFoot(p, action, m.ball, time);
        desired = new T.Vector3(f.x, f.y, f.z);
      } else if (
        action.kind === "around" &&
        action.stage === "orbit" &&
        action.hitAt == null
      ) {
        desired = new T.Vector3(
          action.orbitCenter.x,
          0.4,
          action.orbitCenter.z,
        );
      } else if (action.hitAt != null) {
        desired = new T.Vector3(
          action.contact?.x ?? m.ball.x,
          action.contact?.y ?? 0.35,
          action.contact?.z ?? m.ball.z,
        );
        if (action.kind === "pickup")
          desired.y +=
            0.2 *
            Math.sin(
              Math.PI * T.MathUtils.clamp((time - action.hitAt) / 0.4, 0, 1),
            );
        desired.addScaledVector(
          forward,
          0.08 * Math.sin((time - action.hitAt) * 8),
        );
      } else {
        const point = new T.Vector3(m.ball.x, m.ball.y - 0.1, m.ball.z);
        const anticipation = smooth((1.45 - m.ball.y) / 0.9);
        desired = localTarget(side * 0.14, 0.18, 0.26).lerp(
          point,
          anticipation,
        );
        if (action.kind === "thigh")
          desired = localTarget(side * 0.13, 0.39, 0.42);
        if (action.kind === "heel")
          desired = localTarget(side * 0.19, 0.38, -0.23);
        if (bicycle || action.kind === "high-heel") desired = point;
      }
      // Keep the foot within the anatomical reach; never chase head-height balls.
      const delta = desired.clone().sub(new T.Vector3(p.x, 0, p.z));
      let x = clamp(delta.dot(right), -0.58, 0.58),
        z = clamp(
          delta.dot(forward),
          bicycle || action.kind === "high-heel" ? -0.75 : -0.32,
          action.dive ? 0.85 : 0.65,
        );
      desired = localTarget(
        x,
        clamp(
          desired.y,
          action.kind === "pickup" ? 0.025 : 0.08,
          highKick
            ? 1.68 + jump
            : bicycle
              ? 1.85
              : action.kind === "high-heel"
                ? 1.25
                : 1.08,
        ),
        z,
      );
      target.lerp(desired, weight);
    }
    const kneeHint = forward
      .clone()
      .addScaledVector(right, legSide * 0.12)
      .addScaledVector(up, bicycle || highKick ? 1.5 * weight : 0);
    if (action?.kind === "high-heel" && i === index)
      kneeHint.copy(forward).multiplyScalar(-0.2).addScaledVector(up, -1);
    leg.hip.userData.kneeForward = kneeHint;
    correctLeg(leg.hip, leg.shin, leg.foot, contactFoot, target, 1.5, kneeHint);
    if (
      i === index &&
      action?.kind === "around" &&
      action.stage === "orbit" &&
      action.hitAt == null
    )
      poseAroundLeg(
        leg,
        forward,
        side,
        (time - action.orbitAt) / action.orbitDuration,
        weight,
      );
    leg.anchor = null;
  }
  rig.root.updateMatrixWorld(true);
}
