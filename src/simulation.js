import { keeperControl, stepKeeper, keeperHandContact } from "./goalkeeper.js";
import { stepHeader, headerContact, headPosition } from "./heading.js";
import { possessionTeam } from "./possession.js";
import { placeSetPiece, updateSetPiece } from "./set-pieces.js";
import {
  formationTarget,
  supportTargets,
  activePass,
  receptionTarget,
  defensivePresser,
  defensiveTarget,
} from "./tactics.js";
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
  shotFacing,
  actionApproach,
  footBallDistance,
  wrapAngle,
} from "./ball-actions.js";
import { stepBallMotion } from "./ball-physics.js";
import {
  RECEPTION,
  POSSESSION_CHALLENGE,
  receptionOpportunity,
  receptionRoll,
  receptionContact,
} from "./reception.js";
import { RootMotionWarp } from "./core/root-motion-warp.js";
import { FootballPhysics } from "./physics-world.js";
import { planBallReach } from "./interactions.js";
import {
  stepLocomotion,
  locomotionSnapshot,
  initLocomotion,
  startBallMotion,
  ballMotionDuration,
  strikePlantDuration,
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
  constructor({
    random = Math.random,
    multiplayer = false,
    headless = false,
  } = {}) {
    this.activeTeam = 0;
    this.multiplayer = multiplayer;
    this.headless = headless;
    this.controls = [0, 1].map((team) => ({
      selected: team * 11 + 9,
      charge: 0,
      charging: false,
      actionPlayer: null,
      bufferedAction: null,
      lastInput: {},
    }));
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
  get selected() {
    return this.controls[this.activeTeam].selected;
  }
  set selected(value) {
    this.controls[this.activeTeam].selected = value;
  }
  get charge() {
    return this.controls[this.activeTeam].charge;
  }
  set charge(value) {
    this.controls[this.activeTeam].charge = value;
  }
  get charging() {
    return this.controls[this.activeTeam].charging;
  }
  set charging(value) {
    this.controls[this.activeTeam].charging = value;
  }
  get actionPlayer() {
    return this.controls[this.activeTeam].actionPlayer;
  }
  set actionPlayer(value) {
    this.controls[this.activeTeam].actionPlayer = value;
  }
  get lastInput() {
    return this.controls[this.activeTeam].lastInput;
  }
  set lastInput(value) {
    this.controls[this.activeTeam].lastInput = value;
  }
  withTeam(team, fn) {
    const previous = this.activeTeam;
    this.activeTeam = team;
    try {
      return fn();
    } finally {
      this.activeTeam = previous;
    }
  }
  isControlled(p) {
    return (
      (p.team === 0 || this.multiplayer) &&
      this.controls[p.team].selected === p.id
    );
  }
  selectForTeam(p) {
    if (p.team === 0 || this.multiplayer) this.controls[p.team].selected = p.id;
  }
  cancelAllActions() {
    for (const team of [0, 1]) this.withTeam(team, () => this.cancelAction());
  }
  attachMotionLibrary(library) {
    this.motionLibrary = library;
    this.players.forEach((p) => (p.motion = library.createController(p.id)));
  }
  resetPlayers(kickTeam = 0) {
    this.setPiece = null;
    this.restartRestriction = null;
    this.doubleTouch = null;
    if (this.training) kickTeam = 0;
    for (const [team, control] of this.controls.entries())
      Object.assign(control, {
        selected: team * 11 + 9,
        charge: 0,
        charging: false,
        actionPlayer: null,
        bufferedAction: null,
        lastInput: {},
      });
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
    if (possessionTeam(this) === this.activeTeam) return;
    const dir = this.activeTeam === 0 ? 1 : -1;
    let candidates = this.players.filter(
      (p) => p.team === this.activeTeam && !p.keeper && p.id !== this.selected,
    );
    const close = candidates.filter(
      (p) => length(p.x - this.ball.x, p.z - this.ball.z) <= 3.5,
    );
    const covering = candidates.filter((p) => (p.x - this.ball.x) * dir <= 0);
    candidates = close.length ? close : covering.length ? covering : candidates;
    candidates.sort(
      (a, b) =>
        length(a.x - this.ball.x, a.z - this.ball.z) -
        length(b.x - this.ball.x, b.z - this.ball.z),
    );
    if (!candidates.length) return;
    this.selected = candidates[0].id;
    this.lastAction = "switch";
  }
  beginAction(type, input = this.lastInput || {}) {
    const p = this.players[this.selected];
    if (this.setPiece && this.setPiece.taker !== p.id) return false;
    if (
      this.mode !== "playing" ||
      !["pass", "lob", "through", "shoot"].includes(type) ||
      (p.ballAction && !p.ballAction.firstTime) ||
      p.recovery > 0
    )
      return false;
    if (this.ball.owner !== p.id) {
      if (p.ballAction?.firstTime) this.cancelAction();
      this.controls[this.activeTeam].bufferedAction = {
        type,
        input: { ...input },
        expiresAt: this.elapsed + 1,
        player: p.id,
        power: 0,
        released: false,
        finesse: !!input.finesse,
      };
      this.charging = true;
      this.charge = 0;
      return true;
    }
    this.controls[this.activeTeam].bufferedAction = null;
    p.ballAction = this.createBallAction(p, type, input);
    // A scheduled dribble cannot interfere with the striking leg.
    if (p.ballMotion?.kind === "dribble") p.ballMotion.hit = true;
    this.charging = true;
    this.charge = 0;
    this.actionPlayer = p.id;
    return true;
  }
  createBallAction(p, type, input) {
    const magnitude = Math.hypot(input.x || 0, input.z || 0);
    const aim =
      magnitude > 0.15
        ? { x: (input.x || 0) / magnitude, z: (input.z || 0) / magnitude }
        : { x: p.dx, z: p.dz };
    const action = {
      type,
      stage: "charging",
      heldSeconds: 0,
      approachSpeed: length(p.vx, p.vz),
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
        action,
        goalAim(p, this.ball, Math.abs(input.z || 0) > 0.15 ? input.z : 0),
      );
    return action;
  }
  consumeBufferedAction() {
    const control = this.controls[this.activeTeam],
      queued = control.bufferedAction;
    if (!queued) return;
    const p = this.players[queued.player];
    if (
      this.elapsed > queued.expiresAt ||
      this.selected !== queued.player ||
      (p.ballAction?.firstTime &&
        this.ball.owner !== null &&
        this.ball.owner !== p.id)
    ) {
      this.cancelAction();
      return;
    }
    // Prepare before arrival. Never claim possession or apply a trapping impulse.
    if (this.ball.owner !== null && this.ball.owner !== p.id) return;
    const action = (p.ballAction ||= this.createBallAction(
      p,
      queued.type,
      queued.input,
    ));
    Object.assign(action, {
      firstTime: true,
      stage: "pending",
      quickTouch: true,
      requiresPlant: false,
      power: queued.released ? queued.power : this.charge,
      finesse: queued.finesse,
      releasedAt: queued.pressedAt ?? queued.expiresAt - 1,
    });
    if (action.type === "shoot")
      Object.assign(action, goalAim(p, this.ball, queued.input.z || 0));
    action.style = strikeStyle(
      action.heading,
      action.aim.x,
      action.aim.z,
      action.power,
      length(p.vx, p.vz),
      action.type,
    );
    p.shotPower = action.power;
    p.reach = null;
    p.receptionAttempt = null;
  }
  updateFirstTimeContact(p, dt = 1 / 120) {
    const a = p.ballAction,
      queued = this.controls[p.team].bufferedAction;
    if (
      !a?.firstTime ||
      !queued ||
      this.ball.owner !== null ||
      this.elapsed > queued.expiresAt
    )
      return;
    const b = this.ball;
    if (!canContestBall(p, this.recentKickScreen(), b, this.elapsed)) return;
    if (a.header) {
      if (headerContact(p, b, dt)) this.executeHeader(p, a);
      return;
    }
    const motion = p.ballMotion;
    if (motion && !motion.hit && motion.kind === "strike") {
      const foot = p.locomotion.feet[motion.foot];
      if (
        foot.phase >= 0.35 &&
        b.y <= 0.6 &&
        footBallDistance(foot, b, foot.previous) < 0.27
      ) {
        motion.hit = true;
        a.incomingSpeed = length(b.vx, b.vz);
        this.controls[p.team].bufferedAction = null;
        this.charging = false;
        this.charge = 0;
        this.executeAction(p, a);
      }
    }
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
    const queued = this.controls[this.activeTeam].bufferedAction;
    if (queued && this.mode === "playing") {
      if (this.elapsed > queued.expiresAt) {
        this.cancelAction();
        return false;
      }
      Object.assign(queued, {
        power: clamp(power, 0, 1),
        finesse,
        released: true,
      });
      this.charging = false;
      this.charge = 0;
      return true;
    }
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
    this.controls[this.activeTeam].bufferedAction = null;
    for (const p of this.players) {
      if (p.team !== this.activeTeam) continue;
      p.ballAction = null;
      if (p.header && p.header.height === 0) p.header = null;
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
      // Keep the same approach metadata as player-created actions. The body
      // expression and follow-through use it while an AI action is pending
      // and immediately after contact.
      approachSpeed: length(p.vx, p.vz),
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
    if (a.firstTime) {
      this.controls[p.team].bufferedAction = null;
      this.charging = false;
      this.charge = 0;
    }
    const b = this.ball;
    const facing = shotFacing(a.heading, a.aim);
    if (a.overcharged) {
      const skew =
        (this.random() * 2 - 1) *
        (0.35 + (a.type === "shoot" ? 0.4 * facing.difficulty : 0));
      const dx = a.aim.x * Math.cos(skew) - a.aim.z * Math.sin(skew);
      const dz = a.aim.x * Math.sin(skew) + a.aim.z * Math.cos(skew);
      const speed = a.type === "shoot" ? 45 * facing.speedScale : 45;
      const lift = a.type === "shoot" ? 12 * facing.speedScale : 12;
      this.kick(p, b.x + dx * 60, b.z + dz * 60, speed, lift);
      const result = {
        power: 1,
        speed,
        lift,
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
        facing: facing.difficulty,
      });
      // Shot input selects a point across the opponent goal, never an outward ray.
      // Error moves that point along the goal line, so the ball still travels goalward.
      const targetZ = clamp(a.targetZ ?? 0, -3.2, 3.2);
      const error = (this.random() * 2 - 1) * precision.spread;
      const tx = goalX,
        tz = targetZ + error;
      const d = length(tx - b.x, tz - b.z) || 1;
      const momentum =
        a.approachSpeed > 1
          ? clamp((p.vx * a.aim.x + p.vz * a.aim.z - 1) * 0.35, 0, 2.5) *
            a.power
          : 0;
      const speed =
        (9 + Math.pow(a.power, 0.75) * 36 + momentum) *
        facing.speedScale *
        (a.finesse ? 0.86 : 1);
      const flight = Math.max(0.15, d / speed);
      const lift = clamp(
        (0.65 + a.power * 0.7 - 0.11) / flight + 0.5 * 9.81 * flight,
        0.3,
        (2.1 + 7.9 * a.power) * (1 - 0.85 * facing.difficulty),
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
      const q = selectPassTarget(this.players, p, a.aim, a.power, a.type);
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
        flight: this.ballFlight,
        team: p.team,
        receiveWindow: clamp((distance / trajectory.speed) * 2 + 0.8, 1.2, 5),
        distance,
        ...trajectory,
        style: a.style.name,
        foot: p.ballMotion.foot,
        contactAt: this.elapsed,
        delay: this.elapsed - a.releasedAt,
      };
      this.selectForTeam(q);
      this.lastAction = a.type;
    }
    p.locomotion.strikeFollow =
      !a.style.fall && a.style.name !== "backheel"
        ? {
            time: 0,
            approachSpeed: a.approachSpeed,
            power: a.power,
            supportFoot: 1 - p.ballMotion.foot,
          }
        : null;
    p.followStyle = a.style;
    p.followTime = 0.65;
    p.recovery = a.style.fall ? 1.05 : a.style.imbalance > 0.55 ? 0.35 : 0;
    p.recoveryDuration = p.recovery;
    p.locomotion.impact = Math.max(
      p.locomotion.impact || 0,
      a.style.imbalance * 0.5,
    );
    const result = a.type === "shoot" ? this.lastShot : this.lastPass;
    if (result)
      Object.assign(result, {
        firstTime: !!a.firstTime,
        incomingSpeed: a.incomingSpeed ?? 0,
      });
    p.ballAction = null;
    if (this.actionPlayer === p.id) this.actionPlayer = null;
  }
  executeHeader(p, a) {
    const b = this.ball,
      h = p.header;
    const incomingSpeed = Math.hypot(b.vx, b.vy, b.vz);
    let tx,
      tz,
      target = null;
    if (a.type === "shoot") {
      tx = p.team === 0 ? 46 : -46;
      tz = clamp(
        (a.targetZ || 0) +
          (this.random() * 2 - 1) * (0.15 + (1 - a.power) * 0.3),
        -3.4,
        3.4,
      );
    } else {
      const q = selectPassTarget(this.players, p, a.aim, a.power, a.type);
      if (!q) return;
      target = q.id;
      tx = q.x + q.vx * 0.15;
      tz = q.z + q.vz * 0.15;
    }
    const distance = length(tx - b.x, tz - b.z);
    const speed =
      a.type === "shoot"
        ? clamp(10 + a.power * 10 + incomingSpeed * 0.18, 10, 24)
        : clamp(7 + distance * 0.4 + a.power * 4, 7, 18);
    const flight = Math.max(0.15, distance / speed);
    const lift = clamp(
      (0.65 - b.y) / flight + 4.905 * flight,
      -6,
      a.type === "shoot" ? 3.5 : 5,
    );
    const contact = { ...b },
      head = headPosition(p);
    this.kick(p, tx, tz, speed, lift);
    p.kick = 0;
    h.hit = true;
    h.hitAt = this.elapsed;
    h.fold = 0.3;
    const result = {
      type: a.type,
      style: "header",
      header: true,
      firstTime: true,
      power: a.power,
      incomingSpeed,
      speed,
      lift,
      contactAt: this.elapsed,
      contact: { x: contact.x, y: contact.y, z: contact.z },
      head,
      delay: this.elapsed - a.releasedAt,
    };
    if (a.type === "shoot")
      this.lastShot = {
        ...result,
        target: { x: tx, z: tz },
        actualTarget: { x: tx, z: tz },
      };
    else {
      this.lastPass = {
        ...result,
        target,
        distance,
        flight: this.ballFlight,
        team: p.team,
        receiveWindow: clamp(flight * 2 + 0.8, 1.2, 5),
      };
      this.selectForTeam(this.players[target]);
    }
    this.lastAction = a.type;
    this.controls[p.team].bufferedAction = null;
    this.charging = false;
    this.charge = 0;
    this.actionPlayer = null;
    p.ballAction = null;
    p.ballMotion = null;
    p.reach = null;
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
          if (impulse.kind === "launch") p.sprintFirstTouch = false;
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
    const plantFoot = p.strikePlant && p.locomotion.feet[p.strikePlant.foot];
    const plantTime =
      kind === "strike" && a?.requiresPlant
        ? plantFoot
          ? plantFoot.contact
            ? 0
            : (1 - plantFoot.phase) * plantFoot.duration
          : strikePlantDuration(p)
        : 0;
    const horizon =
      plantTime + ballMotionDuration(p, kind, a?.power || 0) * 0.62;
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
    if (this.restartRestriction?.player !== p.id)
      this.restartRestriction = null;
    if (this.setPiece?.taker === p.id) {
      this.restartRestriction = {
        type: this.setPiece.type,
        player: p.id,
        team: p.team,
      };
      this.setPiece = null;
    }
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
    if (this.setPiece || possessionTeam(this) === this.activeTeam) return;
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
      b.lastTeam = p.team;
      this.kickCooldown = 0.17;
    }
    this.lastAction = slide ? "slide" : "tackle";
  }
  update(dt, input = {}, opponentInput = {}) {
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
    for (const team of this.multiplayer ? [0, 1] : [0])
      this.withTeam(team, () => {
        const teamInput = team === 0 ? input : opponentInput;
        this.lastInput = { ...teamInput };
        this.consumeBufferedAction();
        this.aimAction(teamInput);
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
      });
    if (this.setPiece) {
      this.updateSetPiece(dt);
      return;
    }
    let b = this.ball,
      owner = b.owner === null ? null : this.players[b.owner];
    // The opposition cannot receive or own the ball in training mode. This
    // also makes the mode robust when a caller places the ball manually.
    if (this.training && owner?.team === 1) {
      b.owner = null;
      owner = null;
    }
    const pass = activePass(this);
    const attackingTeam = possessionTeam(this);
    const support = supportTargets(this.players, owner, b);
    const eligibleChaser = (p) =>
      !this.isControlled(p) &&
      !(p.id === this.lastKicker && this.elapsed - this.kickReleasedAt < 0.65);
    let chasers = [0, 1].map((t) =>
      attackingTeam !== t
        ? defensivePresser(this.players, t, b, eligibleChaser)
        : this.players
            .filter(
              (p) =>
                p.team === t &&
                !p.keeper &&
                !this.isControlled(p) &&
                !(
                  p.id === this.lastKicker &&
                  this.elapsed - this.kickReleasedAt < 0.65
                ),
            )
            .sort(
              (a, c) =>
                length(a.x - b.x, a.z - b.z) - length(c.x - b.x, c.z - b.z),
            )[0]?.id,
    );
    for (let p of this.players) {
      const input = this.controls[p.team].lastInput;
      const control = this.controls[p.team];
      const defensiveAim =
        p.team !== attackingTeam && !p.keeper && !this.isControlled(p)
          ? defensiveTarget(p, b, this.elapsed, this.difficulty)
          : null;
      if (!defensiveAim) p.defensiveTracking = null;
      p.kick = Math.max(0, p.kick - dt * 1.15);
      if (p.throwIn?.releasedAt && this.elapsed - p.throwIn.releasedAt > 0.55)
        p.throwIn = null;
      p.reachCooldown = Math.max(0, (p.reachCooldown || 0) - dt);
      const screen = owner ?? this.recentKickScreen();
      const holdsShape = pass && p.team === pass.team && p.id !== pass.target;
      p.reach =
        !holdsShape && canContestBall(p, screen, b, this.elapsed)
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
      if (p.ballAction && !p.ballAction.firstTime && b.owner !== p.id) {
        p.ballAction = null;
        if (control.actionPlayer === p.id)
          this.withTeam(p.team, () => this.cancelAction());
      }
      const action = p.ballAction;
      stepHeader(
        p,
        b,
        action,
        this.elapsed,
        dt,
        Math.min(
          0.9,
          (control.bufferedAction?.expiresAt ?? this.elapsed) - this.elapsed,
        ),
      );
      if (action?.header) {
        p.reach = null;
        p.rootWarp = null;
      }
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
      } else if (this.isControlled(p)) {
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
            1 -
            0.2 * (action.stage === "pending" ? action.power : control.charge);
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
        let own = attackingTeam === p.team;
        const target = support.get(p.id) ?? formationTarget(p, b, own);
        tx = target.x;
        tz = target.z;
        speed = own ? 5.6 : 4.1;
        if (p.id === chasers[p.team] && (!own || (b.owner === null && !pass))) {
          tx = defensiveAim?.x ?? b.x + b.vx * 0.18;
          tz = defensiveAim?.z ?? b.z + b.vz * 0.18;
          speed =
            this.difficulty === "easy" && p.team === 1
              ? 4.0
              : this.difficulty === "hard" && p.team === 1
                ? 6.7
                : 5.6;
        }
      }
      // Until reception, steer even held movement toward a reachable future
      // ball position. First-time strikes retain their own approach controller.
      p.receiveAssist = null;
      if (pass?.target === p.id && !action) {
        const target = receptionTarget(
          p,
          b,
          input.sprint && p.stamina > 0.1 ? 8.5 : 5.8,
        );
        p.receiveAssist = target;
        tx = target.x;
        tz = target.z;
        speed = target.speed / 1.15;
      }
      if (!this.training || p.team === 0) {
        if (p.reach && !action && !p.keeper && !p.receiveAssist) {
          const rx = p.reach.x - p.x,
            rz = p.reach.z - p.z,
            rd = length(rx, rz);
          const away = (input.x || 0) * rx + (input.z || 0) * rz < -0.15 * rd;
          if (length(p.vx, p.vz) < 3.5)
            p.faceHeading = Math.atan2(b.x - p.x, b.z - p.z);
          if (rd > 0.8 && (!this.isControlled(p) || !away)) {
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
        this.isControlled(p) &&
        movement.sprint &&
        !movement.jockey &&
        !action &&
        p.stamina > 0.1 &&
        v > 1;
      if (sprintRequested && !p.sprintRequested) {
        // The ball gets an escape touch on every new sprint request;
        // extra body acceleration remains exclusive to departures from rest.
        if (length(p.vx, p.vz) < 1.2) p.sprintLaunchTime = 0.65;
        p.sprintFirstTouch = true;
      }
      if (!sprintRequested) p.sprintFirstTouch = false;
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
          ? actionApproach(p, b, action)
          : guideDribbler(p, b, targetX, targetZ);
        targetX = guided.x;
        targetZ = guided.z;
      } else {
        p.shield = null;
        p.dribbleState = null;
        p.lastDribble = null;
      }
      if (action?.firstTime && !action.header) {
        const guided = actionApproach(p, b, action);
        targetX = guided.x;
        targetZ = guided.z;
        if (!p.ballMotion && b.owner === null) {
          const horizon = ballMotionDuration(p, "strike", action.power) * 0.5;
          const future = predictBall(b, horizon);
          if (
            future.y < 0.6 &&
            length(
              future.x - p.x - p.vx * horizon,
              future.z - p.z - p.vz * horizon,
            ) <= 1.12
          )
            startBallMotion(p, future, "strike", action.power, {
              urgent: true,
            });
        }
      }
      if (action?.header && p.header && !p.header.hit) {
        const h = p.header;
        const dx = h.x - p.x,
          dz = h.z - p.z;
        const remaining = Math.max(0.12, h.contactAt - this.elapsed);
        const d = length(dx, dz),
          speed = Math.min(5, d / remaining);
        targetX = d ? (dx / d) * speed : 0;
        targetZ = d ? (dz / d) * speed : 0;
        p.faceHeading = Math.atan2(action.aim.x, action.aim.z);
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
      if (p.header?.height > 0) {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.locomotion.grounded = false;
        p.locomotion.height = 1.1 + p.header.height;
        p.locomotion.vy =
          p.header.jumpVelocity - 9.81 * (this.elapsed - p.header.launchAt);
        p.locomotion.fx = p.locomotion.fz = p.locomotion.normalForce = 0;
        for (const foot of p.locomotion.feet) {
          foot.contact = false;
          foot.normalForce = 0;
        }
        p.header.wasAirborne = true;
      } else {
        if (p.header?.wasAirborne) {
          initLocomotion(p);
          p.header.wasAirborne = false;
        }
        stepLocomotion(p, targetX, targetZ, dt, {
          charging:
            control.charging && this.isControlled(p) && b.owner === p.id,
          charge: control.charge,
          reach: p.reach,
        });
      }
      if (p.keeper && (!this.training || p.team === 0))
        stepKeeper(p, b, this.elapsed, dt);
      p.warpVelocity = { x: 0, z: 0 };
      if (p.motion || this.headless) {
        const preparing =
          control.charging && this.isControlled(p) && b.owner === p.id;
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
    for (const p of this.players)
      this.withTeam(p.team, () => this.updateFirstTimeContact(p, dt));
    this.tryAutomaticReception(input, dt);
    this.updateGoalkeepers(dt);
    this.physics.preparePlayers(this.players, dt, this.training);
    this.withTeam(this.players[this.ball.owner]?.team ?? 0, () =>
      this.updateBallControl(dt),
    );
    this.integrateBall(dt);
    this.players.forEach((p) =>
      this.withTeam(p.team, () => p.motion?.update(p, this, dt)),
    );
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
      if (
        this.restartRestriction?.type === "throw" &&
        this.restartRestriction.team === p.team
      ) {
        this.restart(1 - p.team, p.x, p.z, "TIRO LIVRE INDIRETO");
        return;
      }
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
      this.recordBallTouch(p);
      this.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.announce(caught ? "GOLEIRO SEGUROU" : "DEFESA DO GOLEIRO", 1.4);
    }
  }
  recentKickScreen() {
    // Releasing a pass ends possession, not the physical barrier of the passer.
    // Only block a receiver whose route to the ball crosses that body.
    return this.elapsed - this.kickReleasedAt < 0.35
      ? (this.players[this.lastKicker] ?? null)
      : null;
  }
  tryAutomaticReception(input, dt) {
    const b = this.ball;
    const currentOwner = b.owner;
    const candidates = [];
    for (const p of this.players) {
      if (p.ballAction?.firstTime) continue;
      if (
        p.keeper ||
        this.restartRestriction?.player === p.id ||
        (this.training && p.team === 1) ||
        (p.id === this.lastKicker && this.elapsed - this.kickReleasedAt < 0.45)
      )
        continue;
      if (
        !canContestBall(
          p,
          currentOwner === null
            ? this.recentKickScreen()
            : this.players[currentOwner],
          b,
          this.elapsed,
        )
      ) {
        p.reach = null;
        p.challenge = null;
        continue;
      }
      const intent = this.isControlled(p)
        ? this.controls[p.team].lastInput
        : p.moveIntent;
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
        p.receptionAttempt.owner !== currentOwner ||
        (!p.receptionAttempt.success &&
          this.elapsed - p.receptionAttempt.startedAt > 0.45 &&
          p.locomotion.feet.reduce((n, f) => n + f.landings, 0) >
            p.receptionAttempt.landings)
      ) {
        p.receptionAttempt = {
          flight: this.ballFlight,
          owner: currentOwner,
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
        maxReach: Math.min(opportunity.maxReach, RECEPTION[attempt.kind].reach),
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
            (f) =>
              footBallDistance(f, b, f.previous) < POSSESSION_CHALLENGE.contact,
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
        if (this.controls[lost.team].actionPlayer === lost.id)
          this.withTeam(lost.team, () => this.cancelAction());
      }
      p.reach = null;
      p.receptionAttempt = null;
      b.owner = p.id;
      p.receiveTurn = 0.65;
      p.receiveFacing = Math.atan2(b.x - p.x, b.z - p.z);
      b.lastTeam = p.team;
      this.recordBallTouch(p);
      b.vy = 0;
      b.spin = 0;
      this.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // A single trapping impulse, followed by free dynamic integration.
      b.vx = p.vx * 0.55;
      b.vz = p.vz * 0.55;
      p.touchCooldown = 0.08;
      p.reachCooldown = 0.3;
      this.kickCooldown = 0.3;
      this.selectForTeam(p);
      break;
    }
  }
  integrateBall(dt) {
    let b = this.ball,
      oldX = b.x,
      oldZ = b.z,
      oldY = b.y;
    this.physics.step(this, dt);
    if (this.doubleTouch) {
      const team = this.doubleTouch.team;
      this.doubleTouch = null;
      this.restart(
        1 - team,
        clamp(b.x, -43, 43),
        clamp(b.z, -28, 28),
        "TIRO LIVRE INDIRETO",
      );
      return;
    }
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
    const sideTime =
      Math.abs(b.z) > 30.11
        ? clamp((Math.sign(b.z) * 30.11 - oldZ) / (b.z - oldZ || 1), 0, 1)
        : Infinity;
    const endTime =
      Math.abs(b.x) > 46.11
        ? clamp((Math.sign(b.x) * 46.11 - oldX) / (b.x - oldX || 1), 0, 1)
        : Infinity;
    if (sideTime < endTime) {
      this.restart(
        1 - b.lastTeam,
        clamp(oldX + (b.x - oldX) * sideTime, -46, 46),
        Math.sign(b.z) * 30,
        "LATERAL",
      );
      return;
    }
    if (Math.abs(b.x) > 46.11) {
      let t = clamp((Math.sign(b.x) * 46.11 - oldX) / (b.x - oldX || 1), 0, 1);
      let crossZ = oldZ + (b.z - oldZ) * t,
        crossY = oldY + (b.y - oldY) * t;
      if (Math.abs(crossZ) < 3.55 && crossY < 2.33) {
        let team = b.x > 0 ? 0 : 1;
        if (
          this.restartRestriction?.type === "throw" ||
          (this.restartRestriction?.type === "corner" &&
            this.restartRestriction.team !== team)
        ) {
          const ownGoal = this.restartRestriction.team !== team;
          this.restart(
            ownGoal ? team : 1 - team,
            Math.sign(b.x) * (ownGoal ? 45.6 : 40),
            ownGoal ? Math.sign(crossZ || 1) * 29.6 : 0,
            ownGoal ? "ESCANTEIO" : "TIRO DE META",
          );
          return;
        }
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
        Math.sign(b.z) * 30,
        "LATERAL",
      );
  }
  restart(team, x, z, message) {
    this.cancelAllActions();
    if (this.training) team = 0;
    if (message === "LATERAL" || message === "ESCANTEIO") {
      placeSetPiece(
        this,
        team,
        x,
        z,
        message === "LATERAL" ? "throw" : "corner",
      );
      this.announce(message);
      return;
    }
    this.setPiece = null;
    this.restartRestriction = null;
    this.ballFlight++;
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
    this.selectForTeam(p);
    this.kickCooldown = 0.8;
    p.think = 0.8;
    this.announce(message);
  }
  updateSetPiece(dt) {
    updateSetPiece(this, dt);
  }
  recordBallTouch(p) {
    if (this.setPiece) return;
    if (
      this.restartRestriction?.player === p.id &&
      this.elapsed - this.kickReleasedAt > 0.35
    ) {
      this.doubleTouch = { team: p.team };
      return;
    }
    if (this.restartRestriction && this.restartRestriction.player !== p.id)
      this.restartRestriction = null;
    this.ball.lastTeam = p.team;
    if (
      this.ball.owner !== null &&
      this.players[this.ball.owner].team !== p.team
    )
      this.ball.owner = null;
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
      possessionTeam: possessionTeam(this),
      setPiece: this.setPiece,
      selected: this.selected,
      charge: this.charge,
      charging: this.charging,
      bufferedAction: this.controls[this.activeTeam].bufferedAction,
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
      header: this.players[this.selected]?.header ?? null,
      receiveAssist: this.players[this.selected]?.receiveAssist ?? null,
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
