import { surfaceFor, rollingResistance } from "./surfaces.js";
import { havok } from "./havok-runtime.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import {
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeCapsule,
  PhysicsShapeCylinder,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
import {
  PhysicsMotionType,
  PhysicsPrestepType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import "@babylonjs/core/Physics/v2/physicsEngineComponent.js";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";
const groups = (membership, filter) => (membership << 16) | filter;
const PLAYER = 1,
  BALL = 2,
  STATIC = 4;
const v = (p) => new Vector3(p.x, p.y, p.z);
// Small gameplay-facing facade: bodies and contacts are native Babylon/Havok.
function bodyAccess(body) {
  return {
    native: body,
    setTranslation(p) {
      if (Vector3.DistanceSquared(body.transformNode.position, v(p)) > 1e-12) {
        body.transformNode.position.copyFromFloats(p.x, p.y, p.z);
        body.setPrestepType(PhysicsPrestepType.TELEPORT);
      }
    },
    translation() {
      return body.transformNode.position;
    },
    setLinvel(p) {
      body.setLinearVelocity(v(p));
    },
    linvel() {
      return body.getLinearVelocity();
    },
    setAngvel(p) {
      body.setAngularVelocity(v(p));
    },
    angvel() {
      return body.getAngularVelocity();
    },
    bodyType() {
      return body.getMotionType();
    },
    setBodyType(type) {
      body.setMotionType(type);
    },
    setNextKinematicTranslation() {}, // animated bodies use the supplied velocity
  };
}
function shapeAccess(shape) {
  return {
    setRestitution(restitution) {
      shape.material = { ...shape.material, restitution };
    },
    setCollisionGroups(mask) {
      shape.filterMembershipMask = mask >>> 16;
      shape.filterCollideMask = mask & 65535;
    },
  };
}
export class FootballPhysics {
  constructor({
    halfLength = 46,
    halfWidth = 30,
    goalHalf = 3.66,
    goalHeight = 2.44,
    curbHeight = 0,
    goalStyle = "net",
    apron = 0,
  } = {}) {
    this.engine = new NullEngine();
    this.scene = new Scene(this.engine);
    this.plugin = new HavokPlugin(true, havok);
    this.scene.enablePhysics(new Vector3(0, -9.81, 0), this.plugin);
    this.players = [];
    this.bodies = [];
    this.contacts = new Set();
    this.steps = 0;
    this.prepared = false;
    // Compatibility for existing match reset callers; disposal is idempotent.
    this.world = { free: () => this.dispose() };
    const fixed = (
      shape,
      x,
      y,
      z,
      restitution = 0.48,
      filter = PLAYER | BALL,
      friction = 0.35,
    ) => {
      const body = this.createBody(
        shape,
        PhysicsMotionType.STATIC,
        x,
        y,
        z,
        0,
        friction,
        restitution,
        STATIC,
        filter,
      );
      return shapeAccess(body.shape);
    };
    const box = (hx, hy, hz) =>
      new PhysicsShapeBox(
        Vector3.Zero(),
        Quaternion.Identity(),
        new Vector3(hx * 2, hy * 2, hz * 2),
        this.scene,
      );
    const cylinder = (height, radius, horizontal = false) =>
      new PhysicsShapeCylinder(
        horizontal
          ? new Vector3(0, 0, -height / 2)
          : new Vector3(0, -height / 2, 0),
        horizontal
          ? new Vector3(0, 0, height / 2)
          : new Vector3(0, height / 2, 0),
        radius,
        this.scene,
      );
    this.groundCollider = fixed(box(60, 0.1, 40), 0, -0.1, 0);
    for (const sign of [-1, 1]) {
      for (const z of [-goalHalf, goalHalf])
        fixed(
          cylinder(goalHeight, 0.06),
          sign * halfLength,
          goalHeight / 2,
          z,
          0.75,
        );
      fixed(
        cylinder(goalHalf * 2, 0.06, true),
        sign * halfLength,
        goalHeight,
        0,
        0.75,
      );
      if (goalStyle === "crate") {
        for (const z of [-goalHalf, goalHalf])
          fixed(
            box(0.425, goalHeight / 2, 0.05),
            sign * (halfLength + 0.425),
            goalHeight / 2,
            z,
            0.4,
          );
        fixed(
          box(0.05, goalHeight / 2, goalHalf),
          sign * (halfLength + 0.85),
          goalHeight / 2,
          0,
          0.4,
        );
        fixed(
          box(0.475, 0.05, goalHalf),
          sign * (halfLength + 0.425),
          goalHeight,
          0,
          0.4,
        );
      }
      if (curbHeight > 0)
        fixed(
          box(halfLength + 3, curbHeight / 2, 0.9),
          0,
          curbHeight / 2,
          sign * (halfWidth + 0.9),
          0.7,
          BALL,
          0.15,
        );
      if (apron) {
        fixed(
          box(halfLength + apron, 50, 0.1),
          0,
          50,
          sign * (halfWidth + apron),
          0.65,
          BALL,
          0.1,
        );
        fixed(
          box(0.1, 50, halfWidth + apron),
          sign * (halfLength + apron),
          50,
          0,
          0.65,
          BALL,
          0.1,
        );
      }
      fixed(box(0.1, 2, 35), sign * (halfLength + apron), 2, 0, 0.48, PLAYER);
      fixed(box(50, 2, 0.1), 0, 2, sign * (halfWidth + apron), 0.48, PLAYER);
    }
    const ball = this.createBody(
      new PhysicsShapeSphere(Vector3.Zero(), 0.11, this.scene),
      PhysicsMotionType.DYNAMIC,
      0,
      0.11,
      0,
      0.43,
      0.22,
      0.48,
      BALL,
      STATIC | PLAYER,
    );
    this.ball = bodyAccess(ball);
    this.ballCollider = shapeAccess(ball.shape);
    ball.setCollisionCallbackEnabled(true);
    ball.getCollisionObservable().add((event) => {
      const other =
        event.collidedAgainst === ball ? event.collider : event.collidedAgainst;
      const i = this.players.findIndex((p) => p.body.native === other);
      if (i >= 0 && event.distance <= 0.005) this.contacts.add(i);
    });
  }
  createBody(
    shape,
    type,
    x,
    y,
    z,
    mass,
    friction,
    restitution,
    membership,
    filter,
  ) {
    const node = new TransformNode("physics-body", this.scene);
    node.position.set(x, y, z);
    node.rotationQuaternion = Quaternion.Identity();
    const body = new PhysicsBody(node, type, false, this.scene);
    body.shape = shape;
    shape.material = {
      friction,
      restitution,
      frictionCombine: 3,
      restitutionCombine: 3,
    };
    shape.filterMembershipMask = membership;
    shape.filterCollideMask = filter;
    if (mass) body.setMassProperties({ mass });
    body.setLinearDamping(0);
    body.setAngularDamping(0);
    body.setPrestepType(PhysicsPrestepType.TELEPORT);
    this.bodies.push(body);
    return body;
  }
  ensurePlayers(players) {
    while (this.players.length < players.length) {
      const body = this.createBody(
        new PhysicsShapeCapsule(
          new Vector3(0, -0.52, 0),
          new Vector3(0, 0.52, 0),
          0.34,
          this.scene,
        ),
        PhysicsMotionType.DYNAMIC,
        0,
        0.9,
        0,
        78,
        0.28,
        0.03,
        PLAYER,
        PLAYER | BALL | STATIC,
      );
      body.setGravityFactor(0);
      body.setMassProperties({ mass: 78, inertia: Vector3.Zero() });
      this.players.push({
        body: bodyAccess(body),
        collider: shapeAccess(body.shape),
      });
    }
  }
  preparePlayers(players, dt, training = false, localTeam = undefined) {
    this.ensurePlayers(players);
    this.prepared = true;
    players.forEach((p, i) => {
      const { body } = this.players[i];
      const remote = localTeam !== undefined && p.team !== localTeam;
      const type = remote
        ? PhysicsMotionType.ANIMATED
        : PhysicsMotionType.DYNAMIC;
      if (body.bodyType() !== type) body.setBodyType(type, true);
      const anchored = training && p.trainingAnchor && p.team === 1;
      const anchorX = anchored ? p.trainingAnchor.x : p.x;
      const anchorZ = anchored ? p.trainingAnchor.z : p.z;
      if (anchored) {
        p.x = anchorX;
        p.z = anchorZ;
        p.vx = 0;
        p.vz = 0;
      }
      const vx = p.vx + (p.warpVelocity?.x || 0);
      const vz = p.vz + (p.warpVelocity?.z || 0);
      body.setTranslation(
        {
          x: anchorX - vx * dt,
          y: 0.9 + (p.header?.height || 0) + (p.evade?.height || 0),
          z: anchorZ - vz * dt,
        },
        true,
      );
      if (remote)
        body.setNextKinematicTranslation({
          x: p.x,
          y: 0.9 + (p.header?.height || 0) + (p.evade?.height || 0),
          z: p.z,
        });
      body.setLinvel(
        { x: anchored ? 0 : vx, y: 0, z: anchored ? 0 : vz },
        true,
      );
    });
  }
  step(match, dt) {
    const b = match.ball;
    b.surface = match.field?.surface || b.surface || "grass";
    const surface = surfaceFor(b);
    this.groundCollider.setRestitution(surface.bounce);
    this.ballCollider.setRestitution(surface.bounce);
    this.ensurePlayers(match.players);
    if (!this.prepared)
      match.players.forEach((p, i) => {
        this.players[i].body.setTranslation({ x: p.x, y: 0.9, z: p.z }, true);
        this.players[i].body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      });
    if (b.y > 0.14 || b.vy > 1) this.ballRolling = false;
    const ground =
      b.y <= 0.115 &&
      (Math.abs(b.vy) < 0.2 || (this.ballRolling && b.vy <= 0 && b.vy > -1));
    if (ground) this.ballRolling = true;
    this.ball.native.setGravityFactor(ground ? 0 : 1);
    this.ball.native.shape.material = {
      ...this.ball.native.shape.material,
      friction: ground ? 0 : 0.22,
    };
    let speed = Math.hypot(b.vx, b.vz),
      vx = b.vx,
      vz = b.vz,
      vy = b.vy;
    const turn = b.spin * 0.012 * dt,
      c = Math.cos(turn),
      s = Math.sin(turn);
    vx = b.vx * c - b.vz * s;
    vz = b.vx * s + b.vz * c;
    const drag = ground
      ? Math.max(0, speed - rollingResistance(b, speed) * dt) /
        Math.max(0.00001, speed)
      : 1 / (1 + 0.0045 * Math.hypot(speed, vy) * dt);
    vx *= drag;
    vz *= drag;
    if (!ground) vy *= drag;
    const owned = b.owner !== null;
    // Possession never changes the ball into a kinematic follower.
    // Only the controlling player's broad capsule is ignored: feet supply
    // discrete contacts, while rivals, grass and goal frame remain physical.
    this.players.forEach(({ collider }, i) =>
      collider.setCollisionGroups(
        groups(
          PLAYER,
          PLAYER |
            STATIC |
            ((owned && i === b.owner) ||
            match.players[i].slide ||
            match.players[i].knockdown ||
            match.players[i].bicycle ||
            match.players[i].header ||
            (match.players[i].evade?.height || 0) > 0.35 ||
            (match.players[i].keeper &&
              !(match.training && match.players[i].team === 1) &&
              (match.players[i].goalkeeping?.mode !== "set" ||
                match.players[i].goalkeeping?.smother)) ||
            (i === match.lastKicker &&
              match.elapsed - match.kickReleasedAt < 0.18)
              ? 0
              : BALL),
        ),
      ),
    );
    if (ground) {
      const angular = this.ball.angvel();
      this.ball.setAngvel(
        { x: angular.x * drag, y: angular.y * drag, z: angular.z * drag },
        true,
      );
    }
    this.ballCollider.setCollisionGroups(groups(BALL, STATIC | PLAYER));
    this.ball.setTranslation({ x: b.x, y: Math.max(0.11, b.y), z: b.z }, true);
    this.ball.setLinvel({ x: vx, y: vy, z: vz }, true);
    // The engine resolves impacts; rolling resistance remains explicit for grass.
    this.contacts.clear();
    // Adaptive substeps bound travel to half a ball radius, including fast shots
    // crossing a thin post. Do not claim native CCD: this is swept-size stepping.
    const substeps = Math.max(
      1,
      Math.ceil((Math.hypot(vx, vy, vz) * dt) / 0.055),
    );
    this.lastSubsteps = substeps;
    for (let step = 0; step < substeps; step++) {
      this.plugin.executeStep(dt / substeps, this.bodies);
      for (const body of this.bodies) body.disablePreStep = true;
    }
    if (!owned)
      for (const i of this.contacts) {
        if (
          i === match.lastKicker &&
          match.elapsed - match.kickReleasedAt < 0.35
        )
          continue;
        match.recordBallTouch?.(match.players[i]);
      }
    this.steps++;
    const pos = this.ball.translation(),
      v = this.ball.linvel();
    b.x = pos.x;
    b.y = Math.max(0.11, pos.y);
    b.z = pos.z;
    b.vx = v.x;
    b.vy = v.y;
    b.vz = v.z;
    // A rolling ball may retain a small downward solver velocity after contact.
    // Keep grass resistance active without swallowing a genuine airborne bounce.
    if (
      b.y <= 0.115 &&
      (Math.abs(b.vy) < 0.25 || (this.ballRolling && b.vy <= 0 && b.vy > -1))
    ) {
      b.y = 0.11;
      b.vy = 0;
      if (Math.hypot(b.vx, b.vz) < 0.06) {
        b.vx = b.vz = 0;
        this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    b.spin *= Math.exp(-dt * (ground ? 1.7 : 0.45));
    if (this.prepared)
      match.players.forEach((p, i) => {
        if (match.distributed && p.team !== match.distributed.team) return;
        const { body } = this.players[i],
          pos = body.translation(),
          v = body.linvel();
        if (match.training && p.trainingAnchor && p.team === 1) {
          // Let the dynamic collider participate in the contact solve, then
          // restore its exact anchor. The ball receives the physical impulse,
          // while the training defender never gets displaced.
          body.setTranslation(
            { x: p.trainingAnchor.x, y: 0.9, z: p.trainingAnchor.z },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          p.x = p.trainingAnchor.x;
          p.z = p.trainingAnchor.z;
          p.vx = 0;
          p.vz = 0;
          return;
        }
        const vx = v.x - (p.warpVelocity?.x || 0),
          vz = v.z - (p.warpVelocity?.z || 0);
        const dvx = vx - p.vx,
          dvz = vz - p.vz;
        p.x = pos.x;
        p.z = pos.z;
        p.vx = vx;
        p.vz = vz;
        if (p.locomotion) {
          p.locomotion.leanVX += dvx * 0.12;
          p.locomotion.leanVZ += dvz * 0.12;
          p.locomotion.impact = Math.max(
            p.locomotion.impact || 0,
            Math.min(1, Math.hypot(dvx, dvz) / 3),
          );
          p.locomotion.lastX = p.x;
          p.locomotion.lastZ = p.z;
        }
      });
    this.prepared = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const body of this.bodies) {
      const shape = body.shape;
      body.dispose();
      shape?.dispose();
    }
    this.bodies.length = 0;
    this.scene.dispose();
    this.engine.dispose();
  }
  snapshot() {
    return {
      engine: "Havok",
      pluginVersion: this.plugin.getPluginVersion(),
      steps: this.steps,
      collisionDetection: "adaptive-substeps",
      substeps: this.lastSubsteps || 1,
      capsules: this.players.length,
    };
  }
}
