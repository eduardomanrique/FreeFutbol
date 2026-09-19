import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { MotionLibrary } from "./motion-matching.js";
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
    // Classify in bind space in the fragment shader: skinning then preserves
    // crisp cuffs and hems instead of interpolating clothing colors per vertex.
    mesh.material = new T.MeshStandardMaterial({ roughness: 0.92 });
    mesh.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
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
        "varying vec3 vKitPosition;\nuniform vec3 kitSkin, kitShirt, kitShorts, kitBoot;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        vec3 p = vKitPosition;
        vec3 kit = kitSkin;
        bool collar = abs(p.x) < 0.085 && p.y > 1.49;
        if (p.y > 0.93 && p.y < 1.59 && abs(p.x) < 0.48 && !collar) kit = kitShirt;
        else if (p.y > 0.64 && p.y <= 0.95 && abs(p.x) < 0.27) kit = kitShorts;
        else if (p.y > 0.12 && p.y < 0.43 && abs(p.x) < 0.27) kit = kitShirt;
        else if (p.y <= 0.12) kit = kitBoot;
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
  const delta = target.clone().sub(d).clampLength(0, maxCorrection);
  const goal = c.clone().add(delta);
  const l1 = a.distanceTo(b),
    l2 = b.distanceTo(c),
    axis = goal.clone().sub(a),
    distance = Math.min(axis.length(), (l1 + l2) * 0.995);
  axis.normalize();
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
  }
  if (p.keeper && p.goalkeeping) {
    poseGoalkeeper(rig, p);
    return;
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
      (motion.walkBlend || 0) *
      (1 - Math.max(p.sprintLaunch || 0, l.cutBlend || 0));
  rig.torso.rotateX(
    (l.leanX * Math.sin(l.heading) + l.leanZ * Math.cos(l.heading)) *
      0.5 *
      walkUpright,
  );
  rig.torso.rotateZ(
    -(l.leanX * Math.cos(l.heading) - l.leanZ * Math.sin(l.heading)) * 0.5,
  );
  const charge = match.charging && match.selected === p.id ? match.charge : 0;
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
          (motion.gait === "walk" ? 0.75 : motion.gait === "sprint" ? 1.15 : 1);
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
    pelvisDrop + 0.13 * (l.cutBlend || 0),
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
