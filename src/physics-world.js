import RAPIER from "@dimforge/rapier3d-compat";
import { ROLL_DECELERATION } from "./ball-physics.js";
await RAPIER.init();
const groups = (membership, filter) => (membership << 16) | filter;
const PLAYER = 1,
  BALL = 2,
  STATIC = 4;
export class FootballPhysics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.numSolverIterations = 6;
    this.players = [];
    this.prepared = false;
    this.steps = 0;
    const fixed = (desc) =>
      this.world.createCollider(
        desc.setCollisionGroups(groups(STATIC, PLAYER | BALL)),
      );
    fixed(
      RAPIER.ColliderDesc.cuboid(60, 0.1, 40)
        .setTranslation(0, -0.1, 0)
        .setFriction(0.35)
        .setRestitution(0.48),
    );
    for (const sign of [-1, 1]) {
      for (const z of [-3.66, 3.66])
        fixed(
          RAPIER.ColliderDesc.cylinder(1.22, 0.06)
            .setTranslation(sign * 46, 1.22, z)
            .setRestitution(0.75),
        );
      fixed(
        RAPIER.ColliderDesc.cylinder(3.66, 0.06)
          .setTranslation(sign * 46, 2.44, 0)
          .setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
          .setRestitution(0.75),
      );
      // Player-only boundaries: the ball can leave for a restart.
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.1, 2, 35)
          .setTranslation(sign * 46.0, 2, 0)
          .setCollisionGroups(groups(STATIC, PLAYER)),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(50, 2, 0.1)
          .setTranslation(0, 2, sign * 30)
          .setCollisionGroups(groups(STATIC, PLAYER)),
      );
    }
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.11, 0)
        .setCcdEnabled(true),
    );
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.11)
        .setMass(0.43)
        .setFriction(0.22)
        .setRestitution(0.48)
        .setCollisionGroups(groups(BALL, STATIC | PLAYER)),
      this.ball,
    );
  }
  ensurePlayers(players) {
    while (this.players.length < players.length) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setGravityScale(0)
          .lockRotations()
          .enabledTranslations(true, false, true)
          .setCcdEnabled(true),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(0.52, 0.34)
          .setMass(78)
          .setFriction(0.28)
          .setRestitution(0.03)
          .setCollisionGroups(groups(PLAYER, PLAYER | BALL | STATIC)),
        body,
      );
      this.players.push({ body, collider });
    }
  }
  preparePlayers(players, dt, training = false) {
    this.ensurePlayers(players);
    this.prepared = true;
    players.forEach((p, i) => {
      const { body } = this.players[i];
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
        { x: anchorX - vx * dt, y: 0.9, z: anchorZ - vz * dt },
        true,
      );
      body.setLinvel({ x: anchored ? 0 : vx, y: 0, z: anchored ? 0 : vz }, true);
    });
  }
  step(match, dt) {
    const b = match.ball;
    this.ensurePlayers(match.players);
    if (!this.prepared)
      match.players.forEach((p, i) => {
        this.players[i].body.setTranslation({ x: p.x, y: 0.9, z: p.z }, true);
        this.players[i].body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      });
    const ground = b.y <= 0.115 && Math.abs(b.vy) < 0.2;
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
      ? Math.max(0, speed - (ROLL_DECELERATION + 0.085 * speed) * dt) /
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
            (match.players[i].keeper &&
              !(match.training && match.players[i].team === 1) &&
              match.players[i].goalkeeping?.mode !== "set") ||
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
    this.world.timestep = dt;
    this.world.step();
    this.steps++;
    const pos = this.ball.translation(),
      v = this.ball.linvel();
    b.x = pos.x;
    b.y = Math.max(0.11, pos.y);
    b.z = pos.z;
    b.vx = v.x;
    b.vy = v.y;
    b.vz = v.z;
    if (b.y <= 0.115 && Math.abs(b.vy) < 0.25) {
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
    this.world.free();
  }
  snapshot() {
    return {
      engine: "Rapier",
      version: RAPIER.version(),
      steps: this.steps,
      ccd: true,
      capsules: this.players.length,
    };
  }
}
