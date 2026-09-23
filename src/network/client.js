import { TeamSimulation } from "./team-simulation.js";
import {
  TEAM_PROTOCOL,
  encodeTeamMessage,
} from "../../shared/team-protocol.js";
import { PROTOCOL_VERSION, TICK_RATE } from "../../shared/protocol.js";
const storageKey = "campo-online-session-v1";
export class OnlineClient {
  constructor({ onRoom, onStart, onEnd, onStatus }) {
    Object.assign(this, { onRoom, onStart, onEnd, onStatus });
    this.active = false;
    this.team = 0;
    this.seq = 0;
    this.events = [];
    this.snapshots = [];
    this.rtt = 0;
    this.tick = 0;
    this.lastAck = -1;
    this.bytes = 0;
    this.generation = 0;
  }
  async enter(code, duration, networkMode = "teams") {
    if (this.active) return;
    const response = await fetch(`/futebol/api/rooms${code ? "/join" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: PROTOCOL_VERSION,
        code,
        duration,
        networkMode,
        teamProtocol: TEAM_PROTOCOL,
      }),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Backend indisponível. Inicie o servidor para jogar online.",
      );
    }
    if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
    this.teamSimulation = null;
    this.begin(data);
  }
  resume() {
    try {
      const data = JSON.parse(sessionStorage.getItem(storageKey));
      if (data?.token) this.begin(data);
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }
  begin(data) {
    this.active = true;
    this.team = data.team;
    this.token = data.token;
    this.events = [];
    this.snapshots = [];
    this.started = false;
    this.teamSimulation = null;
    this.seq = 0;
    this.deadline = Date.now() + 30000;
    this.retry = 0;
    this.generation++;
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ token: data.token, team: data.team }),
    );
    this.connect(this.generation);
  }
  connect(generation) {
    if (!this.active || generation !== this.generation) return;
    this.onStatus("Conectando ao servidor…");
    const ws = (this.socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/futebol/api/ws`,
    ));
    const authTimeout = setTimeout(() => ws.close(), 7000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "auth",
          version: PROTOCOL_VERSION,
          token: this.token,
          teamProtocol: TEAM_PROTOCOL,
        }),
      );
    ws.onmessage = (event) => {
      if (generation !== this.generation || !this.active) return;
      this.lastPacketAt = performance.now();
      const msg = JSON.parse(event.data);
      if (msg.type === "authenticated") {
        clearTimeout(authTimeout);
        this.authenticated = true;
        this.seq = msg.sequence + 1;
        this.retry = 0;
        this.events = [];
        this.snapshots = [];
        this.lastReceivedTick = -1;
        this.lastPacketAt = performance.now();
      }
      if (msg.type === "team-start") {
        this.teamSimulation ||= new TeamSimulation(this.team, (packet) =>
          this.send(packet),
        );
        this.teamSimulation.seq = Math.max(this.teamSimulation.seq, this.seq);
        this.teamSimulation.receive(msg);
        if (!this.started) {
          this.started = true;
          this.onStart();
        }
      }
      if (msg.type === "team-frame") {
        this.bytes += event.data.length;
        this.teamSimulation?.receive(msg, this.rtt / 2000);
        this.lastAck = Math.max(this.lastAck, msg.ack ?? -1);
        this.seq = Math.max(this.seq, this.lastAck + 1);
      }
      if (msg.type === "room") {
        this.room = msg.room;
        this.onRoom(msg.room, this.team);
        const status = {
          waiting: "Aguardando os dois jogadores ficarem prontos.",
          starting: "Preparando o campo…",
          playing: `ONLINE · ${this.team === 0 ? "ATLÉTICO →" : "← UNIÃO"}`,
          reconnecting: "Partida interrompida. Aguardando reconexão…",
          finished: "Partida encerrada.",
        };
        this.onStatus(
          msg.room.status === "waiting" &&
            msg.room.players.every((p) => p?.ready && p.connected)
            ? this.team === 0
              ? "Todos prontos. Inicie a partida."
              : "Todos prontos. Aguardando o criador iniciar."
            : status[msg.room.status],
        );
      }
      if (msg.type === "snapshot") {
        this.lastPacketAt = performance.now();
        this.bytes += event.data.length;
        const state = msg.state;
        if (state.tick < (this.lastReceivedTick ?? -1)) return;
        this.lastReceivedTick = state.tick;
        this.tick = state.tick;
        this.lastAck = state.acknowledgements[this.team];
        this.snapshots.push({ state, received: performance.now() });
        if (this.snapshots.length > 12) this.snapshots.shift();
        if (!this.started) {
          this.started = true;
          this.onStart();
        }
      }
      if (msg.type === "pong")
        this.rtt = Math.round(performance.now() - msg.sent);
      if (msg.type === "error") this.onStatus(msg.error);
      if (msg.type === "closed") this.finish(msg.reason);
    };
    ws.onclose = (event) => {
      clearTimeout(authTimeout);
      if (!this.active || generation !== this.generation) return;
      this.authenticated = false;
      this.events = [];
      this.snapshots = [];
      if (event.code === 1008 || event.code === 1000) {
        this.finish("Sessão encerrada. Crie ou entre em outra sala.");
        return;
      }
      if (!this.retry) this.deadline = Date.now() + 30000;
      if (Date.now() >= this.deadline) {
        this.finish("Não foi possível reconectar.");
        return;
      }
      this.onStatus("Conexão perdida. Tentando reconectar…");
      setTimeout(
        () => this.connect(generation),
        Math.min(4000, 500 * 2 ** this.retry++),
      );
    };
    ws.onerror = () => {};
  }
  send(data) {
    if (this.authenticated && this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(
        data.type === "team" ? encodeTeamMessage(data) : JSON.stringify(data),
      );
  }
  action(type, action) {
    if (!this.active || !this.authenticated || this.room?.status !== "playing")
      return false;
    if (this.teamSimulation) return this.teamSimulation.action(type, action);
    if (this.events.length < 12)
      this.events.push({ type, ...(action ? { action } : {}) });
    return true;
  }
  update(dt, input, match) {
    if (!this.active) return;
    const now = performance.now();
    if (this.authenticated && now - (this.lastPacketAt || now) > 5000)
      this.socket.close();
    if (now - (this.lastPing || 0) > 2000) {
      this.lastPing = now;
      this.send({ type: "ping", sent: now });
    }
    if (this.teamSimulation) {
      this.teamSimulation.update(
        match,
        dt,
        input,
        this.authenticated && this.room?.status === "playing",
      );
      this.tick = Math.floor(match.elapsed * TICK_RATE);
      return;
    }
    if (
      this.authenticated &&
      this.room?.status === "playing" &&
      now - (this.lastInputAt || 0) >= 1000 / 30
    ) {
      this.lastInputAt = now;
      if (this.socket.bufferedAmount > 16384) {
        this.socket.close();
        return;
      }
      this.send({
        type: "input",
        input: { ...input, seq: this.seq++, events: this.events.splice(0) },
      });
    }
    if (!this.snapshots.length) return;
    const latest = this.snapshots.at(-1);
    // Fixed 75 ms interpolation buffer; hold the last state when packets stop.
    const target =
      latest.state.tick +
      (Math.min(50, now - latest.received) * TICK_RATE) / 1000 -
      9;
    let left = this.snapshots[0],
      right = latest;
    for (const item of this.snapshots) {
      if (item.state.tick <= target) left = item;
      if (item.state.tick >= target) {
        right = item;
        break;
      }
    }
    const u = Math.max(
      0,
      Math.min(
        1,
        (target - left.state.tick) /
          Math.max(1, right.state.tick - left.state.tick),
      ),
    );
    const state = structuredClone(right.state);
    const blend = (a, b, keys) => {
      for (const k of keys)
        if (Number.isFinite(a?.[k]) && Number.isFinite(b?.[k]))
          b[k] = a[k] + (b[k] - a[k]) * u;
    };
    // Never interpolate across kickoffs/teleports or a new score.
    if (left.state.score.join() === state.score.join()) {
      if (
        Math.hypot(
          left.state.ball.x - state.ball.x,
          left.state.ball.z - state.ball.z,
        ) < 5
      )
        blend(left.state.ball, state.ball, ["x", "y", "z"]);
      state.players.forEach((p, i) => {
        const prev = left.state.players[i];
        if (Math.hypot(prev.x - p.x, prev.z - p.z) > 3) return;
        blend(prev, p, ["x", "z", "vx", "vz", "dx", "dz"]);
        const a = prev.locomotion,
          b = p.locomotion;
        if (a && b) {
          let delta = Math.atan2(
            Math.sin(b.heading - a.heading),
            Math.cos(b.heading - a.heading),
          );
          b.heading = a.heading + delta * u;
          b.feet.forEach((f, j) => blend(a.feet[j], f, ["x", "y", "z"]));
        }
      });
    }
    match.multiplayer = true;
    match.activeTeam = this.team;
    match.controls = state.controls.map((c, i) => ({
      ...c,
      lastInput: i === this.team ? input : {},
    }));
    for (const key of [
      "mode",
      "elapsed",
      "duration",
      "score",
      "ball",
      "setPiece",
      "event",
      "eventTime",
      "sequence",
      "lastAction",
      "lastShot",
      "lastPass",
      "lastSave",
      "lastTouch",
      "lastReception",
    ])
      match[key] = state[key];
    match.training = false;
    match.physics.steps = state.tick;
    match.players = state.players.map((p, i) => ({
      ...p,
      motion: match.players[i].motion,
    }));
    for (const p of match.players)
      match.withTeam(p.team, () => p.motion?.update(p, match, dt));
  }
  leave() {
    this.send({ type: "leave" });
    this.finish(null);
  }
  finish(reason) {
    const wasActive = this.active;
    this.active = false;
    this.authenticated = false;
    this.generation++;
    this.socket?.close();
    this.events = [];
    this.snapshots = [];
    if (this.teamSimulation?.match)
      this.teamSimulation.match.distributed = null;
    this.teamSimulation = null;
    this.room = null;
    sessionStorage.removeItem(storageKey);
    if (wasActive) this.onEnd(reason);
  }
}
