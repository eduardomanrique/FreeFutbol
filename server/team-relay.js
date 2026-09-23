import { TEAM_PROTOCOL, validTeamPacket } from "../shared/team-protocol.js";
// No Match, Rapier, worker, or per-frame simulation is imported here.
export class TeamRelay {
  constructor(duration, now = () => performance.now()) {
    this.duration = duration;
    this.now = now;
    this.base = now();
    this.pausedAt = null;
    this.epoch = 0;
    this.authority = 0;
    this.ball = null;
    this.players = Array(22).fill(null);
    this.selected = [9, 20];
    this.seq = [-1, -1];
    this.resetId = 0;
    this.metrics = {
      packets: 0,
      commands: 0,
      ballEvents: 0,
      rejectedClaims: 0,
    };
  }
  time() {
    return ((this.pausedAt ?? this.now()) - this.base) / 1000;
  }
  pause(value) {
    if (value && this.pausedAt === null) this.pausedAt = this.now();
    if (!value && this.pausedAt !== null) {
      this.base += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }
  snapshot() {
    return {
      type: "team-start",
      version: TEAM_PROTOCOL,
      duration: this.duration,
      at: this.time(),
      epoch: this.epoch,
      authority: this.authority,
      ball: this.ball,
      players: this.players,
      selected: this.selected,
      resetId: this.resetId,
    };
  }
  receive(team, packet) {
    if (!validTeamPacket(packet, team))
      throw new Error("Lote de time inválido.");
    if (packet.seq <= this.seq[team]) return null;
    this.seq[team] = packet.seq;
    this.metrics.packets++;
    this.metrics.commands += packet.commands.length;
    const at = this.time();
    // A client clock cannot make other players extrapolate minutes into the future.
    const sampleAt = Math.max(at - 0.5, Math.min(at + 0.05, packet.at));
    for (const c of packet.commands)
      this.players[c[0]] = { row: c, at: sampleAt };
    this.selected[team] = packet.selected;
    let ball = null,
      rejected = false;
    if (packet.ball) {
      const b = packet.ball;
      const claims = b.kind === "claim";
      const owns = team === this.authority;
      if (b.epoch !== this.epoch || (!owns && !claims) || (claims && b.reset)) {
        rejected = true;
        this.metrics.rejectedClaims++;
      } else {
        if (claims || b.kind === "event" || b.kind === "reset") this.epoch++;
        this.authority = team;
        this.ball = b.state;
        // Restarts reposition the field once, and give the restarting team the ball.
        if (b.kind === "reset") {
          this.resetId++;
          if (b.reset)
            for (const row of b.reset)
              this.players[row[0]] = { row, at: sampleAt };
          if (b.state.ball.owner !== null)
            this.authority = Math.floor(b.state.ball.owner / 11);
        }
        ball = {
          ...b,
          epoch: this.epoch,
          authority: this.authority,
          resetId: this.resetId,
        };
        this.metrics.ballEvents++;
      }
    }
    return {
      type: "team-frame",
      team,
      seq: packet.seq,
      acks: [...this.seq],
      at: sampleAt,
      serverAt: at,
      commands: packet.commands,
      selected: packet.selected,
      ball,
      rejected: rejected
        ? {
            epoch: this.epoch,
            authority: this.authority,
            state: this.ball,
            resetId: this.resetId,
          }
        : null,
    };
  }
}

// Movement acknowledgements ride on the opponent's next packet/heartbeat.
// Only ball arbitration needs an immediate reply to its sender.
export function relayFrameFor(frame, team) {
  const { acks, ...message } = frame;
  message.ack = acks[team];
  if (team !== frame.team) return { ...message, rejected: null };
  if (!frame.ball && !frame.rejected) return null;
  return {
    ...message,
    commands: [],
    ball: frame.ball
      ? {
          epoch: frame.ball.epoch,
          authority: frame.ball.authority,
          kind: frame.ball.kind,
          resetId: frame.ball.resetId,
        }
      : null,
  };
}
