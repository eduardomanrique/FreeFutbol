import { Match } from "../simulation.js";
import { FootballPhysics } from "../physics-world.js";
import { MatchRandom } from "./random.js";
import {
  encodeMatchState,
  decodeMatchState,
  stateChecksum,
} from "./state-codec.js";

export const SIMULATION_VERSION = "campo-core-0.2.0";
export const TICK_RATE = 120;
const MAX_COMMANDS = 100000;
const MAX_TICKS = 120 * 60 * 30;
const actions = new Set([
  "beginAction",
  "releaseAction",
  "switchPlayer",
  "tackle",
  "cancelAction",
  "aimAction",
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
function input(value = {}) {
  const result = {};
  for (const axis of ["x", "z"]) {
    const n = value[axis] ?? 0;
    if (!Number.isFinite(n) || Math.abs(n) > 1)
      throw Error("Invalid input axis");
    result[axis] = n === 0 ? 0 : n;
  }
  for (const flag of ["sprint", "jockey", "finesse"])
    result[flag] = !!value[flag];
  return result;
}
export class MatchSession {
  constructor({
    seed = 1,
    multiplayer = false,
    record = true,
    runtime = "unspecified",
  } = {}) {
    this.runtime = runtime;
    this.seed = seed;
    this.random = new MatchRandom(seed);
    this.match = new Match({
      random: () => this.random.next(),
      multiplayer,
      headless: true,
    });
    this.record = record;
    this.tick = 0;
    this.commands = [];
    this.lastMode = "home";
  }
  start(duration = 360, difficulty = "normal", training = false) {
    const old = this.match,
      library = old.motionLibrary;
    this.random.restore(this.seed);
    const fresh = new Match({
      random: () => this.random.next(),
      multiplayer: old.multiplayer,
      headless: true,
    });
    fresh.start(duration, difficulty, training);
    old.physics.dispose();
    for (const key of Object.keys(old)) delete old[key];
    Object.assign(old, fresh);
    if (library) old.attachMotionLibrary(library);
    this.tick = 0;
    this.lastMode = old.mode;
    this.resetRecording();
  }
  resetRecording() {
    this.commands = [];
    this.truncated = false;
    this.initial = this.record ? this.checkpoint() : null;
  }
  append(command) {
    if (!this.record || !this.initial || this.truncated) return;
    if (
      this.commands.length >= MAX_COMMANDS ||
      this.tick - this.initial.tick > MAX_TICKS
    ) {
      this.truncated = true;
      this.commands = [];
      return;
    }
    this.commands.push(command);
  }
  action(method, args = [], team = this.match.activeTeam) {
    if (
      !actions.has(method) ||
      ![0, 1].includes(team) ||
      !Array.isArray(args) ||
      args.length > 2
    )
      throw Error("Invalid session action");
    if (
      method === "beginAction" &&
      !["pass", "shoot", "lob", "through"].includes(args[0])
    )
      throw Error("Invalid ball action");
    if (method === "beginAction") args = [args[0], input(args[1])];
    if (method === "aimAction") args = [input(args[0])];
    if (
      method === "releaseAction" &&
      (!Number.isFinite(args[0]) || args[0] < 0 || args[0] > 1)
    )
      throw Error("Invalid power");
    this.append({ action: method, args: clone(args), team });
    return this.match.withTeam(team, () => this.match[method](...args));
  }
  step(a = {}, b = {}) {
    if (!["playing", "goal"].includes(this.match.mode)) return;
    a = input(a);
    b = input(b);
    this.append({ step: [a, b] });
    this.match.update(1 / TICK_RATE, a, b);
    this.tick++;
    this.lastMode = this.match.mode;
  }
  checkpoint() {
    const state = encodeMatchState(this.match);
    // Pausing belongs to the host UI, not the recorded simulation timeline.
    if (this.match.mode === "paused")
      state.nodes[0].values.mode = this.lastMode;
    const payload = {
      version: SIMULATION_VERSION,
      tickRate: TICK_RATE,
      seed: this.seed,
      tick: this.tick,
      random: this.random.state,
      state,
      physics: this.match.physics.checkpoint(),
    };
    return { ...payload, checksum: stateChecksum(payload) };
  }
  restore(checkpoint) {
    const { checksum, ...data } = checkpoint ?? {};
    if (
      data.version !== SIMULATION_VERSION ||
      data.tickRate !== TICK_RATE ||
      stateChecksum(data) !== checksum
    )
      throw Error("Incompatible or damaged checkpoint");
    if (!Number.isSafeInteger(data.tick) || data.tick < 0)
      throw Error("Invalid tick");
    const random = new MatchRandom(data.random);
    new MatchRandom(data.seed);
    const state = decodeMatchState(data.state);
    if (
      !state ||
      Object.getPrototypeOf(state) !== Object.prototype ||
      state.headless !== true ||
      !["playing", "goal", "finished"].includes(state.mode) ||
      !Array.isArray(state.players) ||
      state.players.length !== 22 ||
      !Array.isArray(state.controls) ||
      state.controls.length !== 2 ||
      !state.ball
    )
      throw Error("Invalid match state");
    for (const key of Object.keys(state)) {
      if (
        key in Match.prototype ||
        ["physics", "random", "motionLibrary"].includes(key)
      )
        throw Error("Reserved match field");
    }
    const physics = FootballPhysics.fromCheckpoint(data.physics);
    const old = this.match,
      library = old.motionLibrary;
    old.physics.dispose();
    for (const key of Object.keys(old)) delete old[key];
    this.random = random;
    Object.assign(old, state, { physics, random: () => this.random.next() });
    if (library) old.attachMotionLibrary(library);
    this.seed = data.seed;
    this.tick = data.tick;
    this.lastMode = old.mode;
    this.resetRecording();
  }
  exportReplay() {
    if (!this.initial || this.truncated)
      throw Error(
        "Gravação indisponível: limite de 100 mil comandos ou 30 minutos. Salve e retome para iniciar outro segmento.",
      );
    return {
      version: SIMULATION_VERSION,
      runtime: this.runtime,
      initial: clone(this.initial),
      commands: clone(this.commands),
      final: this.checkpoint().checksum,
    };
  }
  dispose() {
    this.match.physics.dispose();
  }
}
export function verifyReplay(replay) {
  if (
    replay?.version !== SIMULATION_VERSION ||
    !Array.isArray(replay.commands) ||
    replay.commands.length > MAX_COMMANDS
  )
    throw Error("Invalid replay");
  const session = new MatchSession({ record: false });
  try {
    session.restore(replay.initial);
    for (const command of replay.commands) {
      if (command.step && !command.action && command.step.length === 2)
        session.step(...command.step);
      else if (command.action && !command.step)
        session.action(command.action, command.args, command.team);
      else throw Error("Invalid replay command");
    }
    const actual = session.checkpoint().checksum;
    if (actual !== replay.final)
      throw Error(`Replay diverged: expected ${replay.final}, got ${actual}`);
    return { tick: session.tick, checksum: actual, score: session.match.score };
  } finally {
    session.dispose();
  }
}
