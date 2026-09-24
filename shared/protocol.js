export const PROTOCOL_VERSION = 2;
export const TICK_RATE = 120;
export const SNAPSHOT_RATE = 20;
export const INPUT_TIMEOUT_MS = 500;
export const ACTIONS = ["pass", "lob", "through", "shoot"];
const events = new Set([
  "begin",
  "release",
  "switch",
  "tackle",
  "slide",
  "cancel",
]);
export function parseInput(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.seq) ||
    value.seq < 0 ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.z) ||
    Math.abs(value.x) > 1 ||
    Math.abs(value.z) > 1 ||
    !Array.isArray(value.events) ||
    value.events.length > 12
  )
    return null;
  for (const e of value.events) {
    if (
      !e ||
      !events.has(e.type) ||
      (e.type === "begin" && !ACTIONS.includes(e.action))
    )
      return null;
  }
  return {
    seq: value.seq,
    x: value.x,
    z: value.z,
    sprint: value.sprint === true,
    jockey: value.jockey === true,
    finesse: value.finesse === true,
    chip: value.chip === true,
    secondPress: value.secondPress === true,
    hands: value.hands === true,
    events: value.events.map((e) => ({
      type: e.type,
      ...(e.type === "begin" ? { action: e.action } : {}),
    })),
  };
}
// Render state only. Physics, randomness, action clocks and scores never come from clients.
const playerFields = [
  "renderId",
  "altinhaPose",
  "volleyPending",
  "walkRequested",
  "id",
  "team",
  "number",
  "name",
  "keeper",
  "x",
  "z",
  "vx",
  "vz",
  "dx",
  "dz",
  "stamina",
  "phase",
  "kick",
  "tackle",
  "sliding",
  "slide",
  "knockdown",
  "evade",
  "bicycle",
  "celebration",
  "topSpeed",
  "secondPress",
  "locomotion",
  "ballAction",
  "ballMotion",
  "strikePlant",
  "strikeTarget",
  "shotPower",
  "followStyle",
  "followTime",
  "recovery",
  "recoveryDuration",
  "actionTwist",
  "reach",
  "shield",
  "closeControl",
  "sprintLaunch",
  "sprintRequested",
  "goalkeeping",
  "header",
  "throwIn",
  "receiveTurn",
  "faceHeading",
];
export function renderState(match, tick, acknowledgements) {
  return {
    tick,
    acknowledgements,
    mode: match.mode,
    variant: match.variant,
    footvolley: match.footvolley,
    elapsed: match.elapsed,
    duration: match.duration,
    score: match.score,
    ball: match.ball,
    setPiece: match.setPiece,
    foul: match.foul,
    pendingRestart: match.pendingRestart,
    lastTackle: match.lastTackle,
    controls: match.controls.map((c) => ({
      selected: c.selected,
      charge: c.charge,
      charging: c.charging,
      actionPlayer: c.actionPlayer,
    })),
    event: match.event,
    eventTime: match.eventTime,
    sequence: match.sequence,
    lastAction: match.lastAction,
    lastShot: match.lastShot,
    lastPass: match.lastPass,
    lastSave: match.lastSave,
    lastTouch: match.lastTouch,
    lastReception: match.lastReception,
    players: match.players.map((p) =>
      Object.fromEntries(
        playerFields.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]),
      ),
    ),
  };
}
export function encodeState(state) {
  return JSON.stringify({ type: "snapshot", state }, (_, v) =>
    typeof v === "number" && !Number.isInteger(v)
      ? Math.round(v * 1000) / 1000
      : v,
  );
}
