import { initLocomotion, stepLocomotion } from "../locomotion.js";
import { stepBallMotion } from "../ball-physics.js";
import {
  TEAM_PROTOCOL,
  TEAM_BATCH_SECONDS,
  packPlayer,
  POSE_FIELDS,
  WORLD_FIELDS,
  worldState,
  encodeTeamMessage,
} from "../../shared/team-protocol.js";
const copy = (v) => (v == null ? v : structuredClone(v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function shiftPlayer(p, x, z) {
  p.x += x;
  p.z += z;
  if (!p.locomotion) return;
  p.locomotion.lastX = p.x;
  p.locomotion.lastZ = p.z;
  for (const k of ["supportX", "captureX"])
    if (Number.isFinite(p.locomotion[k])) p.locomotion[k] += x;
  for (const k of ["supportZ", "captureZ"])
    if (Number.isFinite(p.locomotion[k])) p.locomotion[k] += z;
  for (const f of p.locomotion.feet) {
    f.x += x;
    f.z += z;
    for (const key of ["previous", "from", "to"])
      if (f[key]) {
        f[key].x += x;
        f[key].z += z;
      }
  }
}
export class TeamSimulation {
  constructor(team, send) {
    this.team = team;
    this.send = send;
    this.incoming = [];
    this.remote = new Map();
    this.sent = new Map();
    this.epoch = 0;
    this.authority = 0;
    this.seq = 0;
    this.accumulator = 0;
    this.lastPacket = -Infinity;
    this.lastBall = -Infinity;
    this.pendingBall = null;
    this.contactDirty = false;
    this.resetDirty = false;
    this.stats = {
      sentBytes: 0,
      sentPackets: 0,
      commands: 0,
      ballPackets: 0,
      softCorrections: 0,
      hardCorrections: 0,
      ignoredCorrections: 0,
      maxError: 0,
      claims: 0,
      rejectedClaims: 0,
      simulationMs: 0,
      steps: 0,
    };
  }
  receive(message, transit = 0) {
    this.incoming.push({ message, transit });
  }
  ownsBall() {
    return this.authority === this.team;
  }
  contact(p, kind) {
    if (p.team !== this.team) return;
    const id = `${p.id}:${kind}:${this.match.ball.owner}:${this.match.ballFlight}`;
    if (
      id !== this.lastContact ||
      this.match.elapsed - this.contactTime > 0.18
    ) {
      this.contactDirty = true;
      this.lastContact = id;
      this.contactTime = this.match.elapsed;
    }
  }
  start(m, message) {
    this.match = m;
    m.distributed = null;
    m.multiplayer = true;
    m.activeTeam = this.team;
    m.start(message.duration, "normal");
    m.activeTeam = this.team;
    m.elapsed = message.at;
    this.epoch = message.epoch;
    this.authority = message.authority;
    this.pendingBall = null;
    this.contactDirty = false;
    this.resetDirty = false;
    this.remote.clear();
    this.sent.clear();
    this.lastPacket = this.lastBall = -Infinity;
    this.clockTarget = null;
    if (message.ball) this.applyWorld(message.ball, true);
    m.elapsed = message.at;
    message.players.forEach((item) => {
      if (item) this.applyRow(item.row, item.at, true);
    });
    message.selected.forEach((id, t) => {
      m.controls[t].selected = id;
    });
    m.cancelAllActions();
    m.distributed = {
      team: this.team,
      isBallAuthority: () => this.ownsBall(),
      stepRemote: (p, dt) => this.stepRemote(p, dt),
      contact: (p, kind) => this.contact(p, kind),
      reset: () => {
        this.resetDirty = true;
        this.sent.clear();
      },
    };
    this.initialized = true;
  }
  applyRow(row, at, force = false) {
    const m = this.match,
      p = m.players[row[0]];
    if (!p || (p.team === this.team && !force)) return;
    const age = force ? 0 : Math.max(0, Math.min(0.25, m.elapsed - at));
    const target = { x: row[1] + row[3] * age, z: row[2] + row[4] * age };
    const error = distance(p, target);
    if (!force) this.stats.maxError = Math.max(this.stats.maxError, error);
    const command = { row: copy(row), at, correction: { x: 0, z: 0 } };
    if (force || error > 3) {
      p.x = target.x;
      p.z = target.z;
      p.vx = row[3];
      p.vz = row[4];
      initLocomotion(p);
      if (!force) this.stats.hardCorrections++;
    } else {
      // Preserve forward progress for small delayed turns; change intent immediately.
      const ex = target.x - p.x,
        ez = target.z - p.z;
      const backwards = ex * p.vx + ez * p.vz < 0;
      if (error < 0.12 || (backwards && error < 0.35))
        this.stats.ignoredCorrections++;
      else {
        command.correction = { x: ex, z: ez };
        this.stats.softCorrections++;
      }
      p.vx += (row[3] - p.vx) * 0.35;
      p.vz += (row[4] - p.vz) * 0.35;
    }
    p.dx = row[7];
    p.dz = row[8];
    p.stamina = row[10];
    for (const key of POSE_FIELDS) p[key] = copy(row[11][key]) ?? undefined;
    const control = m.controls[p.team];
    if (p.ballAction) {
      control.actionPlayer = p.id;
      control.charging = p.ballAction.stage === "charging";
      control.charge = Math.min(1, (p.ballAction.heldSeconds || 0) / 0.315);
    } else if (control.actionPlayer === p.id) {
      control.actionPlayer = null;
      control.charging = false;
      control.charge = 0;
    }
    p.moveIntent = { x: row[5], z: row[6] };
    if (p.team !== this.team) this.remote.set(p.id, command);
  }
  stepRemote(p, dt) {
    const cmd = this.remote.get(p.id);
    const stale = !cmd || this.match.elapsed - cmd.at > 0.75;
    const vx = stale ? 0 : cmd.row[5],
      vz = stale ? 0 : cmd.row[6];
    p.moveIntent = { x: vx, z: vz };
    stepLocomotion(p, vx, vz, dt, {
      charging: p.ballAction?.stage === "charging",
      charge: p.ballAction?.power || 0,
    });
    if (cmd) {
      const gain = 1 - Math.exp(-dt * 12);
      const x = cmd.correction.x * gain,
        z = cmd.correction.z * gain;
      shiftPlayer(p, x, z);
      cmd.correction.x -= x;
      cmd.correction.z -= z;
    }
    p.x = Math.max(-46, Math.min(46, p.x));
    p.z = Math.max(-30, Math.min(30, p.z));
    p.warpVelocity = { x: 0, z: 0 };
    p.kick = Math.max(0, (p.kick || 0) - dt * 1.15);
    p.tackle = Math.max(0, (p.tackle || 0) - dt);
    p.followTime = Math.max(0, (p.followTime || 0) - dt);
  }
  applyWorld(state, force = false) {
    if (!state) return;
    const m = this.match;
    const previousOwner = m.ball.owner;
    const predicted = copy(state.ball);
    const age = force
      ? 0
      : Math.max(0, Math.min(0.2, m.elapsed - state.elapsed));
    // Short flight prediction only. Authority checkpoints resolve Rapier/contacts.
    if (predicted.owner === null)
      for (let t = 0; t < age; t += 1 / 120)
        stepBallMotion(predicted, Math.min(1 / 120, age - t));
    const same = previousOwner === predicted.owner && m.mode === state.mode;
    const gap = Math.hypot(
      m.ball.x - predicted.x,
      m.ball.y - predicted.y,
      m.ball.z - predicted.z,
    );
    this.ballCorrection = null;
    if (!force && same && gap < 1.5) {
      this.ballCorrection = {
        x: predicted.x - m.ball.x,
        y: predicted.y - m.ball.y,
        z: predicted.z - m.ball.z,
      };
      predicted.x = m.ball.x;
      predicted.y = m.ball.y;
      predicted.z = m.ball.z;
    }
    for (const key of WORLD_FIELDS)
      if (key !== "ball" && key !== "elapsed") m[key] = copy(state[key]);
    m.ball = predicted;
    m.physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // The receiving team's newly acquired player becomes its selection.
    if (m.ball.owner !== null && previousOwner !== m.ball.owner)
      m.selectForTeam(m.players[m.ball.owner]);
    if (previousOwner !== m.ball.owner && previousOwner !== null) {
      const p = m.players[previousOwner];
      p.ballAction = p.ballMotion = null;
      if (m.controls[p.team].actionPlayer === p.id)
        m.withTeam(p.team, () => m.cancelAction());
    }
  }
  drain(m) {
    for (const { message: f, transit } of this.incoming.splice(0)) {
      if (f.type === "team-start") {
        this.start(m, f);
        continue;
      }
      if (!this.initialized) continue;
      this.clockTarget = f.serverAt + transit;
      this.clockReceivedElapsed = m.elapsed;
      for (const row of f.commands) this.applyRow(row, f.at);
      if (f.team !== this.team) m.controls[f.team].selected = f.selected;
      if (f.ball) {
        this.epoch = f.ball.epoch;
        this.authority = f.ball.authority;
        if (f.team !== this.team) {
          this.pendingBall = null;
          this.contactDirty = false;
          this.applyWorld(
            f.ball.state,
            f.ball.kind === "reset" || f.ball.kind === "claim",
          );
          if (f.ball.reset) {
            for (const row of f.ball.reset) this.applyRow(row, f.at, true);
            m.cancelAllActions();
            this.sent.clear();
          }
        } else if (this.pendingBall === f.seq) this.pendingBall = null;
      }
      if (f.team === this.team && f.rejected) {
        this.stats.rejectedClaims++;
        this.epoch = f.rejected.epoch;
        this.authority = f.rejected.authority;
        this.pendingBall = null;
        this.contactDirty = false;
        this.applyWorld(f.rejected.state, true);
      }
    }
  }
  action(type, action) {
    if (!this.initialized || this.match.mode !== "playing") return false;
    const m = this.match;
    return m.withTeam(this.team, () => {
      if (type === "begin") return m.beginAction(action);
      if (type === "release")
        return m.releaseAction(m.charge, !!m.lastInput.finesse);
      if (type === "switch") return m.switchPlayer();
      if (type === "tackle" || type === "slide")
        return m.tackle(type === "slide");
      if (type === "cancel") return m.cancelAction();
    });
  }
  update(m, dt, input, playing) {
    const start = performance.now();
    this.drain(m);
    if (!this.initialized || !playing) return;
    // Gradual clock discipline never rewinds a local position on command arrival.
    if (this.clockTarget != null) {
      const error = this.clockTarget - this.clockReceivedElapsed;
      const adjust = Math.sign(error) * Math.min(Math.abs(error), dt * 0.15);
      m.elapsed += adjust;
      this.clockTarget -= adjust;
    }
    if (this.ballCorrection && !this.ownsBall() && this.pendingBall === null) {
      const gain = 1 - Math.exp(-dt * 18);
      for (const k of ["x", "y", "z"]) {
        const v = this.ballCorrection[k] * gain;
        m.ball[k] += v;
        this.ballCorrection[k] -= v;
      }
    }
    m.update(dt, this.team === 0 ? input : {}, this.team === 1 ? input : {});
    this.accumulator += dt;
    if (this.accumulator >= TEAM_BATCH_SECONDS) {
      this.accumulator %= TEAM_BATCH_SECONDS;
      this.publish();
    }
    this.stats.simulationMs += performance.now() - start;
    this.stats.steps++;
  }
  publish() {
    const m = this.match,
      now = m.elapsed,
      commands = [];
    for (const p of m.players)
      if (p.team === this.team) {
        const row = packPlayer(p),
          old = this.sent.get(p.id);
        const sig = JSON.stringify([
          row[9],
          p.ballAction?.stage,
          p.ballAction?.type,
          !!p.ballMotion,
          p.ballMotion?.hit,
          p.tackle > 0,
          p.header?.hit,
          p.goalkeeping?.mode,
          !!p.throwIn,
          p.followStyle?.name,
          p.closeControl,
          p.receiveTurn > 0,
        ]);
        const age = old ? now - old.at : Infinity;
        const error = old
          ? Math.hypot(
              p.x - old.row[1] - old.row[3] * age,
              p.z - old.row[2] - old.row[4] * age,
            )
          : Infinity;
        const intent = old
          ? Math.hypot(row[5] - old.row[5], row[6] - old.row[6])
          : Infinity;
        if (
          !old ||
          sig !== old.sig ||
          intent > 0.35 ||
          error > 0.2 ||
          age > (row[9] ? 0.5 : 2)
        ) {
          commands.push(row);
          this.sent.set(p.id, { row: copy(row), at: now, sig });
        }
      }
    let ball = null;
    const worldSignature = JSON.stringify([
      m.mode,
      m.score,
      m.setPiece,
      m.ball.owner,
      m.ballFlight,
      m.lastAction,
    ]);
    if (
      this.pendingBall === null &&
      (this.contactDirty ||
        (this.ownsBall() &&
          (this.resetDirty ||
            now - this.lastBall > 0.5 ||
            worldSignature !== this.lastWorldSignature)))
    ) {
      const kind = !this.ownsBall()
        ? "claim"
        : this.resetDirty
          ? "reset"
          : this.contactDirty || worldSignature !== this.lastWorldSignature
            ? "event"
            : "sync";
      ball = { epoch: this.epoch, kind, state: worldState(m) };
      if (kind === "reset") {
        ball.reset = m.players.map(packPlayer);
        this.resetDirty = false;
      }
      this.contactDirty = false;
      this.lastBall = now;
      this.lastWorldSignature = worldSignature;
      this.stats.ballPackets++;
      if (kind === "claim") this.stats.claims++;
    }
    if (
      !commands.length &&
      !ball &&
      now - this.lastPacket < 0.5 &&
      this.lastSelected === m.selected
    )
      return;
    const packet = {
      type: "team",
      version: TEAM_PROTOCOL,
      seq: this.seq++,
      at: now,
      commands,
      selected: m.selected,
      ...(ball ? { ball } : {}),
    };
    if (ball) this.pendingBall = packet.seq;
    this.lastPacket = now;
    this.lastSelected = m.selected;
    const encoded = encodeTeamMessage(packet);
    this.stats.sentBytes += new TextEncoder().encode(encoded).length;
    this.stats.sentPackets++;
    this.stats.commands += commands.length;
    this.send(packet);
  }
}
