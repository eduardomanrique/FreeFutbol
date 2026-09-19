import { keeperControl, stepKeeper, keeperHandContact } from "./goalkeeper.js";
import {
  shielding,
  canContestBall,
  guideDribbler,
  dribbleImpulse,
  touchDue,
  predictBall,
  DRIBBLE,
} from "./dribbling.js";
import {
  goalAim,
  passTrajectory,
  selectPassTarget,
  strikeStyle,
  shotPrecision,
  footBallDistance,
  wrapAngle,
} from "./ball-actions.js";
import { stepBallMotion } from "./ball-physics.js";
import {
  RECEPTION,
  receptionOpportunity,
  receptionRoll,
  receptionContact,
} from "./reception.js";
import { MotionController, RootMotionWarp } from "./motion-matching.js";
import { FootballPhysics } from "./physics-world.js";
import { planBallReach } from "./interactions.js";
import {
  stepLocomotion,
  locomotionSnapshot,
  initLocomotion,
  startBallMotion,
  ballMotionDuration,
} from "./locomotion.js";
export const FIELD = {
  halfLength: 46,
  halfWidth: 30,
  goalHalf: 3.66,
  goalHeight: 2.44,
  ballRadius: 0.11,
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const length = (x, z) => Math.hypot(x, z);
const formation = [
  [-43, 0],
  [-30, -21],
  [-32, -7],
  [-32, 7],
  [-30, 21],
  [-15, -17],
  [-19, 0],
  [-15, 17],
  [-3, -20],
  [-1, 0],
  [-3, 20],
];
const names = [
  "R. COSTA",
  "M. ALVES",
  "L. SANTOS",
  "G. LIMA",
  "T. ROCHA",
  "B. SOUSA",
  "A. MELO",
  "P. DIAS",
  "R. LEÃO",
  "D. SILVA",
  "L. NUNES",
];
const numbers = [1, 2, 4, 3, 6, 8, 5, 7, 11, 10, 9];
export class Match {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.ballFlight = 0;
    this.mode = "home";
    this.duration = 360;
    this.difficulty = "normal";
    // Training is an arena mode: the opposition remains at its kickoff
    // anchors while the player's team keeps the regular controls/physics.
    this.training = false;
    this.players = [];
    this.score = [0, 0];
    this.elapsed = 0;
    this.selected = 9;
    this.charge = 0;
    this.charging = false;
    this.event = "";
    this.eventTime = 0;
    this.lastAction = "";
    this.sequence = 0;
    this.kickCooldown = 0;
    this.physics = new FootballPhysics();
    this.resetPlayers();
  }
  attachMotionLibrary(library) {
    this.motionLibrary = library;
    this.players.forEach(
      (p) => (p.motion = new MotionController(library, p.id)),
    );
  }
  resetPlayers(kickTeam = 0) {
    if (this.training) kickTeam = 0;
    this.players = [];
    for (let t = 0; t < 2; t++)
      formation.forEach(([x, z], i) =>
        this.players.push({
          id: t * 11 + i,
          team: t,
          number: numbers[i],
          name:
            t === 0
              ? names[i]
              : [
                  "J. REIS",
                  "F. LOPES",
                  "V. RAMOS",
                  "C. PINTO",
                  "A. REIS",
                  "I. NEVES",
                  "R. BRAGA",
                  "M. REIS",
                  "E. MORAES",
                  "N. DUARTE",
                  "H. CRUZ",
                ][i],
          keeper: i === 0,
          x: t === 0 ? x : -x,
          z: t === 0 ? z : -z,
          homeX: t === 0 ? x : -x,
          homeZ: t === 0 ? z : -z,
          trainingAnchor: t === 1 ? { x: -x, z: -z } : null,
          vx: 0,
          vz: 0,
          dx: t === 0 ? 1 : -1,
          dz: 0,
          stamina: 1,
          phase: i * 0.7,
          kick: 0,
          tackle: 0,
          think: 0,
        }),
      );
    if (!this.training)
      this.players[kickTeam === 0 ? 20 : 9].x = kickTeam === 0 ? 10 : -10;
    this.selected = 9;
    this.ball = {
      x: kickTeam === 0 ? 0 : 1,
      y: 0.11,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      owner: kickTeam === 0 ? 9 : 20,
      lastTeam: kickTeam,
    };
    this.ballFlight++;
    this.lastKicker = null;
    this.lastShot = null;
    this.lastPass = null;
    this.lastTouch = null;
    this.lastReception = null;
    this.lastSave = null;
    this.lastAction = "";
    this.kickCooldown = 0.2;
    this.charging = false;
    this.charge = 0;
    this.actionPlayer = null;
    this.lastInput = {};
    this.players.forEach(initLocomotion);
    if (this.motionLibrary) this.attachMotionLibrary(this.motionLibrary);
  }
  start(duration = 360, difficulty = "normal", training = false) {
    this.duration = duration;
    this.difficulty = difficulty;
    this.training = !!training;
    this.score = [0, 0];
    this.elapsed = 0;
    this.resetPlayers();
    this.mode = "playing";
    this.announce("APITO INICIAL · ATLÉTICO ATACA →", 3);
  }
  announce(text, time = 2.2) {
    this.event = text;
    this.eventTime = time;
    this.sequence++;
  }
  switchPlayer() {
    let candidates = this.players.filter(
      (p) => p.team === 0 && !p.keeper && p.id !== this.selected,
    );
    candidates.sort(
      (a, b) =>
        length(a.x - this.ball.x, a.z - this.ball.z) -
        length(b.x - this.ball.x, b.z - this.ball.z),
    );
    this.selected = candidates[0].id;
    this.lastAction = "switch";
  }
  beginAction(type, input = this.lastInput || {}) {
    const p = this.players[this.selected];
    if (
      this.mode !== "playing" ||
      this.ball.owner !== p.id ||
      p.ballAction ||
      p.recovery > 0
    )
      return false;
    const magnitude = Math.hypot(input.x || 0, input.z || 0);
    const aim =
      magnitude > 0.15
        ? { x: (input.x || 0) / magnitude, z: (input.z || 0) / magnitude }
        : { x: p.dx, z: p.dz };
    p.ballAction = {
      type,
      stage: "charging",
      heldSeconds: 0,
      approachSpeed: length(p.vx,p.vz),
      requiresPlant: true,
      power: 0,
      aim,
      heading: p.locomotion.heading,
      movement: {
        x: input.x || 0,
        z: input.z || 0,
        sprint: !!input.sprint,
        jockey: !!input.jockey,
      },
    };
    if (type === "shoot")
      Object.assign(
        p.ballAction,
        goalAim(p, this.ball, Math.abs(input.z || 0) > 0.15 ? input.z : 0),
      );
    // A scheduled dribble must not brake/redirect the ball after charging begins.
    if (p.ballMotion?.kind === "dribble") p.ballMotion.hit = true;
    this.charging = true;
    this.charge = 0;
    this.actionPlayer = p.id;
    return true;
  }
  aimAction(input) {
    const p = this.players[this.actionPlayer],
      a = p?.ballAction;
    if (!a || a.stage !== "charging") return;
    if (a.type === "shoot") {
      Object.assign(
        a,
        goalAim(p, this.ball, Math.abs(input.z || 0) > 0.15 ? input.z : 0),
      );
      return;
    }
    const d = Math.hypot(input.x || 0, input.z || 0);
    if (d > 0.15) a.aim = { x: (input.x || 0) / d, z: (input.z || 0) / d };
  }
  releaseAction(power = this.charge, finesse = false) {
    const p = this.players[this.actionPlayer],
      a = p?.ballAction;
    if (!a || a.stage !== "charging" || this.mode !== "playing") return false;
    a.power = clamp(power, 0, 1);
    a.finesse = finesse;
    a.stage = "pending";
    a.releasedAt = this.elapsed;
    a.quickTouch = a.power <= 0.22 && length(p.vx, p.vz) < 3.7;
    a.requiresPlant = !a.quickTouch;
    for (const f of p.locomotion.feet)
      if (f.special === "windup") f.special = null;
    if (a.quickTouch && p.strikePlant) {
      p.locomotion.feet[p.strikePlant.foot].special = null;
      p.strikePlant = null;
    }
    if (a.type === "shoot")
      Object.assign(a, goalAim(p, this.ball, a.targetZ / 3.2));
    a.style = strikeStyle(
      a.heading,
      a.aim.x,
      a.aim.z,
      a.power,
      length(p.vx, p.vz),
      a.type,
    );
    p.shotPower = a.power;
    this.charging = false;
    this.charge = 0;
    return true;
  }
  cancelAction() {
    for (const p of this.players) {
      p.ballAction = null;
      if (p.ballMotion?.kind === "strike") {
        p.locomotion.feet[p.ballMotion.foot].special = null;
        p.ballMotion = null;
      }
    }
    this.charging = false;
    this.charge = 0;
    this.actionPlayer = null;
  }
  pass(lob = false, through = false, power = 0) {
    if (!this.beginAction(through ? "through" : lob ? "lob" : "pass"))
      return false;
    return this.releaseAction(power);
  }
  passCost(q, p) {
    const d = length(q.x - p.x, q.z - p.z);
    return (
      d * 0.35 -
      (((q.x - p.x) * p.dx + (q.z - p.z) * p.dz) / Math.max(1, d)) * 13
    );
  }
  shoot(power, finesse = false) {
    if (!this.beginAction("shoot")) return false;
    return this.releaseAction(power, finesse);
  }
  queueAIAction(p, type, tx, tz, power) {
    const d = length(tx - p.x, tz - p.z) || 1,
      aim =
        type === "shoot"
          ? goalAim(p, this.ball, tz / 3.2).aim
          : { x: (tx - p.x) / d, z: (tz - p.z) / d };
    p.ballAction = {
      type,
      stage: "pending",
      power,
      aim,
      heading: p.locomotion.heading,
      movement: { x: p.dx, z: p.dz },
      releasedAt: this.elapsed,
      targetZ: type === "shoot" ? clamp(tz, -3.2, 3.2) : undefined,
      style: strikeStyle(
        p.locomotion.heading,
        aim.x,
        aim.z,
        power,
        length(p.vx, p.vz),
        type,
      ),
    };
  }
  executeAction(p, a) {
    const b = this.ball;
    if (a.overcharged) {
      const skew = (this.random() * 2 - 1) * 0.35;
      const dx = a.aim.x * Math.cos(skew) - a.aim.z * Math.sin(skew);
      const dz = a.aim.x * Math.sin(skew) + a.aim.z * Math.cos(skew);
      this.kick(p, b.x + dx * 60, b.z + dz * 60, 45, 12);
      const result = {
        power: 1,
        speed: 45,
        lift: 12,
        overcharged: true,
        foot: p.ballMotion.foot,
        contactAt: this.elapsed,
        delay: this.elapsed - a.releasedAt,
        style: a.style.name,
      };
      if (a.type === "shoot") this.lastShot = result;
      else this.lastPass = { ...result, type: a.type, target: null };
      this.lastAction = a.type;
    } else if (a.type === "shoot") {
      const goalX = p.team === 0 ? 46 : -46;
      const distance = length(goalX - b.x, b.z);
      const style = a.style;
      const precision = shotPrecision(a.power, distance, {
        finesse: a.finesse,
        committed: style.fall,
      });
      // Shot input selects a point across the opponent goal, never an outward ray.
      // Error moves that point along the goal line, so the ball still travels goalward.
      const targetZ = clamp(a.targetZ ?? 0, -3.2, 3.2);
      const error = (this.random() * 2 - 1) * precision.spread;
      const tx = goalX,
        tz = targetZ + error;
      const d = length(tx - b.x, tz - b.z) || 1;
      const momentum = a.approachSpeed > 1 ?
        clamp((p.vx * a.aim.x + p.vz * a.aim.z - 1) * 0.35, 0, 2.5) * a.power : 0;
      const speed =
        (9 + Math.pow(a.power, 0.75) * 36 + momentum) * (a.finesse ? 0.86 : 1);
      const flight = Math.max(0.15, d / speed);
      const lift = clamp(
        (0.65 + a.power * 0.7 - 0.11) / flight + 0.5 * 9.81 * flight,
        1.8,
        2.1 + 7.9 * a.power,
      );
      this.kick(p, tx, tz, speed, lift);
      this.lastShot = {
        power: a.power,
        speed,
        lift,
        finesse: a.finesse,
        target: { x: goalX, z: targetZ },
        actualTarget: { x: tx, z: tz },
        precision: precision.index,
        spread: precision.spread,
        error,
        style: style.name,
        foot: p.ballMotion.foot,
        contactAt: this.elapsed,
        delay: this.elapsed - a.releasedAt,
      };
      if (a.finesse) b.spin = b.z > 0 ? -5 : 5;
      this.lastAction = "shoot";
    } else {
      const q = selectPassTarget(this.players, p, a.aim);
      if (!q) return;
      const through = a.type === "through",
        lob = a.type === "lob";
      const lead = through ? 0.75 : 0.18;
      const tx = q.x + q.vx * lead + (through ? (p.team === 0 ? 3 : -3) : 0),
        tz = q.z + q.vz * lead;
      const distance = length(tx - b.x, tz - b.z);
      const trajectory = passTrajectory(distance, a.power, lob);
      this.kick(p, tx, tz, trajectory.speed, trajectory.lift);
      this.lastPass = {
        type: a.type,
        power: a.power,
        target: q.id,
        distance,
        ...trajectory,
        style: a.style.name,
        foot: p.ballMotion.foot,
        contactAt: this.elapsed,
        delay: this.elapsed - a.releasedAt,
      };
      if (p.team === 0) this.selected = q.id;
      this.lastAction = a.type;
    }
    p.followStyle = a.style;
    p.followTime = 0.65;
    p.recovery = a.style.fall ? 1.05 : a.style.imbalance > 0.55 ? 0.35 : 0;
    p.recoveryDuration = p.recovery;
    p.locomotion.impact = Math.max(
      p.locomotion.impact || 0,
      a.style.imbalance * 0.5,
    );
    p.ballAction = null;
    if (this.actionPlayer === p.id) this.actionPlayer = null;
  }
  updateBallControl(dt) {
    const b = this.ball;
    if (b.owner === null) return;
    const p = this.players[b.owner],
      a = p.ballAction;
    if (p.keeper) return;
    if (b.y > 2.2) {
      b.owner = null;
      p.ballAction = null;
      this.charging = false;
      this.charge = 0;
      return;
    }
    if (a && length(b.x - p.x, b.z - p.z) > 4) {
      this.cancelAction();
      return;
    }
    const m = p.ballMotion;
    if (m && !m.hit) {
      const foot = p.locomotion.feet[m.foot];
      if (
        (!a?.requiresPlant ||
          (p.strikePlant &&
            p.locomotion.feet[p.strikePlant.foot].contact &&
            length(
              p.locomotion.feet[p.strikePlant.foot].x - b.x,
              p.locomotion.feet[p.strikePlant.foot].z - b.z,
            ) < 0.65)) &&
        foot.phase >= (m.style === "backheel" ? 0.55 : 0.44) &&
        footBallDistance(foot, b, foot.previous) < 0.27
      ) {
        m.hit = true;
        if (m.kind === "strike" && a?.stage === "pending")
          this.executeAction(p, a);
        else {
          const impulse = dribbleImpulse(p, b);
          const before = { vx: b.vx, vz: b.vz };
          b.vx = impulse.vx;
          b.vz = impulse.vz;
          b.vy = Math.min(b.vy, 0);
          b.spin = 0;
          // Match rolling angular momentum to this discrete shoe impulse so an
          // old spin cannot undo a cut or reaccelerate a stopped ball.
          this.physics.ball.setAngvel(
            { x: b.vz / 0.11, y: 0, z: -b.vx / 0.11 },
            true,
          );
          const landings = p.locomotion.feet.reduce(
            (sum, f) => sum + f.landings,
            0,
          );
          this.lastTouch = {
            player: p.id,
            foot: m.foot,
            time: this.elapsed,
            x: b.x,
            z: b.z,
            speed: length(b.vx, b.vz),
            deltaV: length(b.vx - before.vx, b.vz - before.vz),
            kind: impulse.kind,
            interval: impulse.interval,
            stepsSince: p.lastDribble ? landings - p.lastDribble.landings : 0,
          };
          p.lastDribble = { ...impulse, time: this.elapsed, landings };
          p.touchCooldown = 0.08;
        }
      }
    }
    if (p.ballMotion) return;
    if (a?.stage === "charging") {
      const preparationTime =
        Math.max(0.18, 0.315 - (a.heldSeconds || 0)) + 0.12;
      const future = predictBall(b, preparationTime);
      if (length(future.x - p.x, future.z - p.z) < 1.12 && future.y < 0.55)
        startBallMotion(p, future, "strike", this.charge);
      return;
    }
    const speed = length(p.vx, p.vz),
      ballSpeed = length(b.vx, b.vz);
    if (
      a?.stage !== "pending" &&
      (p.touchCooldown > 0 ||
        (speed < 0.25 &&
          ballSpeed < 0.08 &&
          !p.shield &&
          length(p.dribbleIntent?.x || 0, p.dribbleIntent?.z || 0) < 0.1))
    )
      return;
    const kind = a?.stage === "pending" ? "strike" : "dribble";
    const horizon = ballMotionDuration(p, kind, a?.power || 0) * 0.62;
    if (kind === "dribble" && !touchDue(p, b, this.elapsed, horizon)) return;
    const future = predictBall(b, horizon);
    if (
      length(
        future.x - (p.x + p.vx * horizon),
        future.z - (p.z + p.vz * horizon),
      ) > 1.12 ||
      future.y > 0.55
    )
      return;
    const urgent =
      p.closeControl ||
      p.dribbleState?.mode !== "carry" ||
      this.elapsed - (p.lastDribble?.time || 0) > 0.95;
    startBallMotion(
      p,
      { x: future.x, z: future.z },
      kind,
      a?.power || 0,
      kind === "dribble"
        ? { preferredFoot: DRIBBLE.preferredFoot, urgent }
        : {},
    );
  }
  kick(p, tx, tz, speed, lift) {
    this.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ballFlight++;
    this.lastKicker = p.id;
    this.kickReleasedAt = this.elapsed;
    let dx = tx - this.ball.x,
      dz = tz - this.ball.z,
      d = length(dx, dz) || 1;
    p.strikeTarget = {
      x: this.ball.x,
      z: this.ball.z,
      dx: dx / d,
      dz: dz / d,
      power: p.shotPower || 0.5,
    };
    Object.assign(this.ball, {
      owner: null,
      vx: (dx / d) * speed,
      vz: (dz / d) * speed,
      vy: lift,
      lastTeam: p.team,
      spin: (dz / d) * 1.5,
    });
    p.kick = 0.48;
    this.kickCooldown = 0.38;
    p.think = 0.8;
  }
  tackle(slide = false) {
    let p = this.players[this.selected];
    if (this.mode !== "playing" || p.tackle > 0) return;
    p.tackle = slide ? 0.95 : 0.45;
    p.sliding = slide;
    p.vx += p.dx * 4;
    p.vz += p.dz * 4;
    let b = this.ball;
    if (
      length(p.x - b.x, p.z - b.z) < 2.4 &&
      b.y < 1.1 &&
      canContestBall(
        p,
        b.owner === null ? null : this.players[b.owner],
        b,
        this.elapsed,
      )
    ) {
      b.owner = null;
      b.vx = p.dx * 10;
      b.vz = p.dz * 10;
      b.vy = 0.8;
      b.lastTeam = 0;
      this.kickCooldown = 0.17;
    }
    this.lastAction = slide ? "slide" : "tackle";
  }
  update(dt, input = {}) {
    if (
      this.mode === "home" ||
      this.mode === "paused" ||
      this.mode === "finished"
    )
      return;
    this.eventTime = Math.max(0, this.eventTime - dt);
    if (this.mode === "goal") {
      this.restartTimer -= dt;
      this.integrateBall(dt);
      if (this.restartTimer <= 0) {
        this.resetPlayers(this.restartTeam);
        this.mode = "playing";
        this.announce("SAÍDA DE BOLA", 1.5);
      }
      return;
    }
    this.elapsed += dt;
    if (!this.training && this.elapsed >= this.duration) {
      this.mode = "finished";
      this.announce("FIM DE JOGO", 99);
      return;
    }
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.lastInput = { ...input };
    this.aimAction(input);
    if (this.charging) {
      this.charge = Math.min(1, this.charge + dt / 0.315);
      const active = this.players[this.actionPlayer]?.ballAction;
      if (active) {
        active.heldSeconds = (active.heldSeconds || 0) + dt;
        if (active.heldSeconds >= 1.3) {
          this.releaseAction(1);
          active.overcharged = true;
        }
      }
    }
    let b = this.ball,
      owner = b.owner === null ? null : this.players[b.owner];
    // The opposition cannot receive or own the ball in training mode. This
    // also makes the mode robust when a caller places the ball manually.
    if (this.training && owner?.team === 1) {
      b.owner = null;
      owner = null;
    }
    let chasers = [0, 1].map(
      (t) =>
        this.players
          .filter((p) => p.team === t && !p.keeper && p.id !== this.selected)
          .sort(
            (a, c) =>
              length(a.x - b.x, a.z - b.z) - length(c.x - b.x, c.z - b.z),
          )[0]?.id,
    );
    for (let p of this.players) {
      p.kick = Math.max(0, p.kick - dt * 1.15);
      p.reachCooldown = Math.max(0, (p.reachCooldown || 0) - dt);
      p.reach = canContestBall(p, owner, b, this.elapsed)
        ? planBallReach(p, b)
        : null;
      p.touchCooldown = Math.max(0, (p.touchCooldown || 0) - dt);
      p.recovery = Math.max(0, (p.recovery || 0) - dt);
      p.followTime = Math.max(0, (p.followTime || 0) - dt);
      p.receiveTurn = Math.max(0, (p.receiveTurn || 0) - dt);
      p.faceHeading =
        p.receiveTurn > 0 && length(p.vx, p.vz) < 3.5
          ? p.receiveFacing
          : undefined;
      if (p.ballAction && b.owner !== p.id) {
        p.ballAction = null;
        if (this.actionPlayer === p.id) this.cancelAction();
      }
      const action = p.ballAction;
      const movement = action ? action.movement : input;
      p.tackle = Math.max(0, p.tackle - dt);
      p.think -= dt;
      let tx = p.x,
        tz = p.z,
        speed = 0,
        dir = p.team === 0 ? 1 : -1;
      if (this.training && p.team === 1) {
        // Keep all opponent decision systems, including goalkeeper control,
        // out of training. Rapier still gives these players solid colliders.
        tx = p.homeX;
        tz = p.homeZ;
        speed = 0;
        p.reach = null;
        p.challenge = null;
        p.ballAction = null;
        p.goalkeeping ||= {
          mode: "set",
          height: 1.02,
          roll: 0,
          hands: [],
          previousHands: [],
        };
        p.goalkeeping.mode = "set";
        p.goalkeeping.height = 1.02;
        p.goalkeeping.roll = 0;
        p.goalkeeping.hands = [
          { x: p.x, y: 1.35, z: p.z - 0.35 },
          { x: p.x, y: 1.35, z: p.z + 0.35 },
        ];
        p.goalkeeping.previousHands = p.goalkeeping.hands.map((h) => ({
          ...h,
        }));
        p.goalkeeping.holding = false;
        p.goalkeeping.prediction = null;
        p.goalkeeping.result = null;
      } else if (p.id === this.selected) {
        let ix = movement.x || 0,
          iz = movement.z || 0,
          l = length(ix, iz);
        if (l > 0) {
          ix /= l;
          iz /= l;
        }
        speed =
          (movement.jockey
            ? 3.1
            : movement.sprint && p.stamina > 0.1
              ? 8.5
              : 5.8) * Math.min(1, l);
        if (action)
          speed *=
            1 - 0.2 * (action.stage === "pending" ? action.power : this.charge);
        p.jockey = !!input.jockey;
        tx = p.x + ix * 10;
        tz = p.z + iz * 10;
        p.stamina = clamp(
          p.stamina + (input.sprint && l > 0 ? -0.095 : 0.055) * dt,
          0,
          1,
        );
      } else if (p.keeper) {
        const control = keeperControl(p, b, this.elapsed);
        tx = control.x;
        tz = control.z;
        speed = control.speed;
        p.faceHeading = (dir * Math.PI) / 2;
      } else if (b.owner === p.id) {
        tx = p.x + dir * 8;
        tz = p.z * 0.82;
        speed = this.difficulty === "hard" ? 6.4 : 5.1;
        if (p.think <= 0 && !p.ballAction) {
          let goal = dir * 46;
          if (Math.abs(goal - p.x) < 25 && Math.abs(p.z) < 17) {
            this.queueAIAction(
              p,
              "shoot",
              goal,
              Math.sin(this.elapsed * 1.4) * 2.7,
              0.65,
            );
            this.lastAction = "ai_shoot";
          } else {
            let nearest = this.players
              .filter((q) => q.team !== p.team)
              .reduce((d, q) => Math.min(d, length(q.x - p.x, q.z - p.z)), 99);
            if (nearest < 4) {
              let mates = this.players.filter(
                (q) => q.team === p.team && !q.keeper && q.id !== p.id,
              );
              mates.sort((a, c) => this.passCost(a, p) - this.passCost(c, p));
              let q = mates[0];
              this.queueAIAction(p, "pass", q.x, q.z, 0.35);
            }
          }
          p.think = 0.8;
        }
      } else {
        let own = owner?.team === p.team;
        let shift = clamp(b.x * 0.36, -16, 16);
        tx = clamp(p.homeX + shift + (own ? dir * 9 : 0), -40, 40);
        tz = clamp(p.homeZ + b.z * 0.2, -27, 27);
        speed = own ? 4.5 : 4.1;
        if (p.id === chasers[p.team] && (!owner || !own)) {
          tx = b.x + b.vx * 0.18;
          tz = b.z + b.vz * 0.18;
          speed =
            this.difficulty === "easy" && p.team === 1
              ? 4.0
              : this.difficulty === "hard" && p.team === 1
                ? 6.7
                : 5.6;
        }
      }
      if (!this.training || p.team === 0) {
        if (p.reach && !action && !p.keeper) {
          const rx = p.reach.x - p.x,
            rz = p.reach.z - p.z,
            rd = length(rx, rz);
          const away = (input.x || 0) * rx + (input.z || 0) * rz < -0.15 * rd;
          if (length(p.vx, p.vz) < 3.5)
            p.faceHeading = Math.atan2(b.x - p.x, b.z - p.z);
          if (rd > 0.8 && (p.id !== this.selected || !away)) {
            tx = p.reach.x;
            tz = p.reach.z;
            speed = Math.max(speed, Math.min(3.5, (rd - 0.65) * 5));
          }
        }
      }
      if (
        action?.stage === "pending" &&
        b.owner === p.id &&
        length(p.vx, p.vz) < 3 &&
        length(b.x - p.x, b.z - p.z) > 0.95
      ) {
        // A short placement step reaches a ball that rolled ahead; never pull it back.
        const distance = length(b.x - p.x, b.z - p.z);
        tx = b.x - ((b.x - p.x) / distance) * 0.65;
        tz = b.z - ((b.z - p.z) / distance) * 0.65;
        speed = Math.max(speed, Math.min(2.6, (distance - 0.65) * 4));
      }
      if (action) {
        const turn = wrapAngle(
          Math.atan2(action.aim.x, action.aim.z) - action.heading,
        );
        p.faceHeading =
          action.stage === "pending"
            ? action.heading + action.style.turn * 0.75
            : action.heading;
        p.actionTwist =
          action.stage === "charging"
            ? clamp(turn * 0.35, -0.65, 0.65)
            : action.style.turn * 0.25;
      } else p.actionTwist = (p.actionTwist || 0) * Math.exp(-dt * 8);
      if (p.recovery > 0) {
        speed *= 0.2;
      }
      let dx = tx - p.x,
        dz = tz - p.z,
        d = length(dx, dz);
      let v = d > 0.15 ? Math.min(speed * 1.15, d * 3) : 0;
      let targetX = d ? (dx / d) * v : 0,
        targetZ = d ? (dz / d) * v : 0;
      // A bounded launch phase starts only when sprinting out of rest, not
      // whenever a cut or a recovery happens to slow the player down.
      const sprintRequested =
        p.id === this.selected &&
        movement.sprint &&
        !movement.jockey &&
        !action &&
        p.stamina > 0.1 &&
        v > 1;
      if (sprintRequested && !p.sprintRequested && length(p.vx, p.vz) < 1.2)
        p.sprintLaunchTime = 0.65;
      p.sprintRequested = sprintRequested;
      p.sprintLaunchTime = sprintRequested
        ? Math.max(0, (p.sprintLaunchTime || 0) - dt)
        : 0;
      p.sprintLaunch = p.sprintLaunchTime / 0.65;
      p.closeControl =
        b.owner === p.id &&
        !p.keeper &&
        !action &&
        (!!p.jockey ||
          (length(targetX, targetZ) > 0.1 &&
            length(targetX, targetZ) < 3.2 &&
            length(p.vx, p.vz) < 4));
      if (b.owner === p.id && !p.keeper) {
        p.shield = shielding(p, this.players);
        if (p.shield && !action && length(p.vx, p.vz) < 3.5)
          p.faceHeading = Math.atan2(p.shield.x, p.shield.z);
        const guided = action
          ? (() => {
              // Intercept the rolling ball; never use dribble recovery during a kick.
              const future = predictBall(b, 0.22);
              const hx = Math.sin(action.heading),
                hz = Math.cos(action.heading);
              const dx = future.x - p.x - hx * 0.35,
                dz = future.z - p.z - hz * 0.35;
              const forward = Math.max(0, (dx * hx + dz * hz) / 0.22);
              const side = clamp((dx * hz - dz * hx) / 0.22, -2.5, 2.5);
              return {
                x: hx * Math.min(9.8, forward) + hz * side,
                z: hz * Math.min(9.8, forward) - hx * side,
              };
            })()
          : guideDribbler(p, b, targetX, targetZ);
        targetX = guided.x;
        targetZ = guided.z;
      } else {
        p.shield = null;
        p.dribbleState = null;
        p.lastDribble = null;
      }
      // Preserve the requested exit direction while foot/ball guidance brakes
      // or catches the ball. Facing must not wait for velocity to reverse.
      p.turnIntent =
        !action &&
        !p.shield &&
        !p.recovery &&
        (b.owner !== p.id || length(b.x - p.x, b.z - p.z) < 1.3)
          ? b.owner === p.id
            ? p.dribbleIntent
            : { x: targetX, z: targetZ }
          : null;
      p.moveIntent = { x: targetX, z: targetZ };
      stepLocomotion(p, targetX, targetZ, dt, {
        charging: this.charging && p.id === this.selected && b.owner === p.id,
        charge: this.charge,
        reach: p.reach,
      });
      if (p.keeper && (!this.training || p.team === 0))
        stepKeeper(p, b, this.elapsed, dt);
      p.warpVelocity = { x: 0, z: 0 };
      if (p.motion) {
        const preparing =
          this.charging && this.selected === p.id && b.owner === p.id;
        if (p.reach && !p.wasReaching) {
          const heading = p.locomotion.heading;
          const target = preparing
            ? {
                x: b.x - Math.sin(heading) * 0.7,
                z: b.z - Math.cos(heading) * 0.7,
              }
            : {
                x: p.x + (p.reach.x - p.x) * 0.18,
                z: p.z + (p.reach.z - p.z) * 0.18,
              };
          p.rootWarp = new RootMotionWarp({ x: p.x, z: p.z }, target, 0.24);
        }
        p.wasPreparing = preparing;
        p.wasReaching = !!p.reach;
        if (p.rootWarp && !p.rootWarp.done) {
          const delta = p.rootWarp.step(dt);
          p.x += delta.x;
          p.z += delta.z;
          p.warpVelocity = { x: delta.x / dt, z: delta.z / dt };
        }
      }
      if (p.x < -45.5 || p.x > 45.5) p.vx = 0;
      if (p.z < -29.5 || p.z > 29.5) p.vz = 0;
      p.x = clamp(p.x, -45.5, 45.5);
      p.z = clamp(p.z, -29.5, 29.5);
      p.locomotion.lastX = p.x;
      p.locomotion.lastZ = p.z;
    }
    this.tryAutomaticReception(input, dt);
    this.updateGoalkeepers(dt);
    this.physics.preparePlayers(this.players, dt, this.training);
    this.updateBallControl(dt);
    this.integrateBall(dt);
    this.players.forEach((p) => p.motion?.update(p, this, dt));
  }
  updateGoalkeepers(dt) {
    const b = this.ball;
    for (const p of this.players) {
      const g = p.goalkeeping;
      if (!p.keeper || !g || (this.training && p.team === 1)) continue;
      if (g.holding && b.owner === p.id) {
        const h = g.hands[0],
          other = g.hands[1];
        Object.assign(b, {
          x: (h.x + other.x) / 2,
          y: (h.y + other.y) / 2,
          z: (h.z + other.z) / 2,
          vx: 0,
          vy: 0,
          vz: 0,
        });
        this.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
        if (this.elapsed > g.holdUntil && g.mode === "set") {
          g.holding = false;
          g.result = null;
          g.cooldown = this.elapsed + 0.6;
          this.kick(p, 0, p.z > 0 ? 12 : -12, 24, 6);
        }
        continue;
      }
      if (b.owner !== null || this.elapsed < (g.cooldown || 0)) continue;
      const hand = keeperHandContact(p, b, dt);
      if (hand < 0 || Math.abs(p.x) < 29.5 || Math.abs(p.z) > 20) continue;
      const speed = length(b.vx, b.vz),
        dir = p.team === 0 ? 1 : -1;
      const caught = speed < 14 && Math.abs(b.z - p.z) < 1;
      g.result = caught ? "catch" : "parry";
      this.lastSave = {
        player: p.id,
        hand,
        kind: g.result,
        time: this.elapsed,
        point: { x: b.x, y: b.y, z: b.z },
      };
      if (caught) {
        b.owner = p.id;
        b.vx = b.vy = b.vz = 0;
        g.holding = true;
        g.holdUntil = this.elapsed + 0.9;
      } else {
        b.vx = dir * Math.max(5, speed * 0.45);
        b.vz = (Math.sign(b.z) || g.side || 1) * Math.max(5, speed * 0.4);
        b.vy = Math.max(1.4, Math.abs(b.vy) * 0.25);
        g.cooldown = this.elapsed + 0.35;
      }
      b.lastTeam = p.team;
      b.spin = 0;
      this.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.announce(caught ? "GOLEIRO SEGUROU" : "DEFESA DO GOLEIRO", 1.4);
    }
  }
  tryAutomaticReception(input, dt) {
    const b = this.ball;
    const currentOwner = b.owner;
    const candidates = [];
    for (const p of this.players) {
      if (
        p.keeper ||
        (this.training && p.team === 1) ||
        (p.id === this.lastKicker && this.elapsed - this.kickReleasedAt < 0.45)
      )
        continue;
      if (
        !canContestBall(
          p,
          currentOwner === null ? null : this.players[currentOwner],
          b,
          this.elapsed,
        )
      ) {
        p.reach = null;
        p.challenge = null;
        continue;
      }
      const intent = p.id === this.selected ? input : p.moveIntent;
      const opportunity = receptionOpportunity(p, b, intent);
      if (!opportunity) {
        p.challenge = null;
        if (
          p.receptionAttempt &&
          this.elapsed - p.receptionAttempt.lastSeen > 0.5
        )
          p.receptionAttempt = null;
        continue;
      }
      if (
        !p.receptionAttempt ||
        p.receptionAttempt.flight !== this.ballFlight ||
        (!p.receptionAttempt.success &&
          this.elapsed - p.receptionAttempt.startedAt > 0.45 &&
          p.locomotion.feet.reduce((n, f) => n + f.landings, 0) >
            p.receptionAttempt.landings)
      ) {
        p.receptionAttempt = {
          flight: this.ballFlight,
          kind: opportunity.kind,
          success: receptionRoll(opportunity, this.random),
          lastSeen: this.elapsed,
          startedAt: this.elapsed,
          landings: p.locomotion.feet.reduce((n, f) => n + f.landings, 0),
        };
      }
      const attempt = p.receptionAttempt;
      attempt.lastSeen = this.elapsed;
      // A failed attempt cannot be rerolled every frame or upgraded to 99.9%.
      p.reach = {
        ...opportunity,
        kind: attempt.kind,
        maxReach: RECEPTION[attempt.kind].reach,
      };
      if (currentOwner !== null && p.challenge?.owner !== currentOwner)
        p.challenge = { owner: currentOwner, since: this.elapsed };
      const rivalContact =
        currentOwner === null ||
        (this.elapsed - p.challenge.since >= 0.22 &&
          length(p.x - b.x, p.z - b.z) + 0.12 <
            length(
              this.players[currentOwner].x - b.x,
              this.players[currentOwner].z - b.z,
            ) &&
          p.locomotion.feet.some(
            (f) => footBallDistance(f, b, f.previous) < 0.29,
          ));
      if (rivalContact && receptionContact(p, b, attempt.kind, dt))
        candidates.push({ p, attempt, distance: length(p.x - b.x, p.z - b.z) });
    }
    candidates.sort((a, c) => a.distance - c.distance);
    for (const { p, attempt } of candidates) {
      if (!attempt.success) continue;
      this.lastReception = {
        player: p.id,
        kind: attempt.kind,
        probability: RECEPTION[attempt.kind].probability,
        success: true,
        speed: length(b.vx - p.vx, b.vz - p.vz),
        reached:
          attempt.kind !== "body" ||
          !!p.locomotion.feet.find((f) => f.special === "reach"),
      };
      if (currentOwner !== null && currentOwner !== p.id) {
        const lost = this.players[currentOwner];
        lost.dispossessedUntil = this.elapsed + 0.65;
        lost.reach = null;
        lost.ballMotion = null;
        lost.ballAction = null;
        lost.receptionAttempt = null;
        if (this.actionPlayer === lost.id) this.cancelAction();
      }
      p.reach = null;
      p.receptionAttempt = null;
      b.owner = p.id;
      p.receiveTurn = 0.65;
      p.receiveFacing = Math.atan2(b.x - p.x, b.z - p.z);
      b.lastTeam = p.team;
      b.vy = 0;
      b.spin = 0;
      this.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // A single trapping impulse, followed by free dynamic integration.
      b.vx = p.vx * 0.55;
      b.vz = p.vz * 0.55;
      p.touchCooldown = 0.08;
      p.reachCooldown = 0.3;
      this.kickCooldown = 0.3;
      if (p.team === 0) this.selected = p.id;
      break;
    }
  }
  integrateBall(dt) {
    let b = this.ball,
      oldX = b.x;
    this.physics.step(this, dt);
    if (this.mode === "goal") {
      if (Math.abs(b.x) > 48) {
        b.x = Math.sign(b.x) * 48;
        b.vx *= -0.2;
      }
      if (Math.abs(b.z) > 3.5) {
        b.z = clamp(b.z, -3.5, 3.5);
        b.vz *= -0.2;
      }
      return;
    }
    if (Math.abs(b.x) > 46.11) {
      let t = clamp((Math.sign(b.x) * 46.11 - oldX) / (b.x - oldX || 1), 0, 1);
      let crossZ = b.z - b.vz * dt * (1 - t),
        crossY = b.y - b.vy * dt * (1 - t);
      if (Math.abs(crossZ) < 3.55 && crossY < 2.33) {
        let team = b.x > 0 ? 0 : 1;
        this.score[team]++;
        this.mode = "goal";
        this.restartTimer = 3;
        this.restartTeam = this.training ? 0 : 1 - team;
        b.owner = null;
        this.announce(team === 0 ? "GOOOL! · ATLÉTICO" : "GOOOL! · UNIÃO", 3);
        return;
      }
      let defending = b.x > 0 ? 1 : 0;
      let corner = b.lastTeam === defending;
      this.restart(
        corner ? 1 - defending : defending,
        corner ? Math.sign(b.x) * 45 : Math.sign(b.x) * 40,
        corner ? Math.sign(b.z || 1) * 29 : 0,
        corner ? "ESCANTEIO" : "TIRO DE META",
      );
    } else if (Math.abs(b.z) > 30.11)
      this.restart(
        1 - b.lastTeam,
        clamp(b.x, -44, 44),
        Math.sign(b.z) * 29,
        "LATERAL",
      );
  }
  restart(team, x, z, message) {
    this.cancelAction();
    if (this.training) team = 0;
    let p = this.players
      .filter((q) => q.team === team && !q.keeper)
      .sort((a, c) => length(a.x - x, a.z - z) - length(c.x - x, c.z - z))[0];
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
    p.dx = team === 0 ? 1 : -1;
    p.dz = 0;
    Object.assign(this.ball, {
      x: x + p.dx * 0.7,
      y: 0.11,
      z,
      vx: 0,
      vz: 0,
      vy: 0,
      owner: p.id,
      lastTeam: team,
    });
    if (team === 0) this.selected = p.id;
    this.kickCooldown = 0.8;
    p.think = 0.8;
    this.announce(message);
  }
  snapshot() {
    return {
      mode: this.mode,
      physics: this.physics.snapshot(),
      animation: this.players[this.selected]?.motion?.snapshot() ?? null,
      coordinates:
        "metres; origin midfield; +x attacks right for Atlético; +z toward near sideline; y vertical",
      time: +this.elapsed.toFixed(2),
      duration: this.duration,
      score: this.score,
      training: this.training,
      selected: this.selected,
      charge: this.charge,
      charging: this.charging,
      lastSave: this.lastSave ?? null,
      goalkeepers: this.players
        .filter((p) => p.keeper)
        .map((p) => ({
          id: p.id,
          mode: p.goalkeeping?.mode ?? "set",
          holding: !!p.goalkeeping?.holding,
          height: p.goalkeeping?.height ?? 1.02,
          hands: p.goalkeeping?.hands ?? [],
        })),
      closeControl: !!this.players[this.selected]?.closeControl,
      lastShot: this.lastShot ?? null,
      lastReception: this.lastReception ?? null,
      lastPass: this.lastPass ?? null,
      lastTouch: this.lastTouch ?? null,
      dribbling: this.players[this.selected]?.dribbleState ?? null,
      action: this.players[this.actionPlayer]?.ballAction ?? null,
      ballContact:
        this.ball.owner === null
          ? null
          : (this.players[this.ball.owner]?.ballMotion ?? null),
      locomotion: locomotionSnapshot(this.players[this.selected]),
      event: this.eventTime > 0 ? this.event : null,
      lastAction: this.lastAction,
      ball: { ...this.ball },
      players: this.players.map(
        ({ id, team, name, x, z, vx, vz, stamina, keeper }) => ({
          id,
          team,
          name,
          x: +x.toFixed(2),
          z: +z.toFixed(2),
          vx: +vx.toFixed(2),
          vz: +vz.toFixed(2),
          stamina: +stamina.toFixed(2),
          keeper,
        }),
      ),
    };
  }
}
