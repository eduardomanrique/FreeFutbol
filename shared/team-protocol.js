// Experimental protocol: a row is one player's motion command plus a small pose.
// [id,x,z,vx,vz,targetVX,targetVZ,faceX,faceZ,mode,stamina,pose]
export const TEAM_PROTOCOL = 1;
export const TEAM_BATCH_SECONDS = 0.05;
export const POSE_FIELDS = [
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
export const WORLD_FIELDS = [
  "ball",
  "ballFlight",
  "lastKicker",
  "kickReleasedAt",
  "kickCooldown",
  "lastShot",
  "lastPass",
  "lastSave",
  "lastTouch",
  "lastReception",
  "lastAction",
  "foul",
  "pendingRestart",
  "lastTackle",
  "score",
  "mode",
  "elapsed",
  "setPiece",
  "restartRestriction",
  "restartTimer",
  "restartTeam",
  "lastGoalTeam",
  "event",
  "eventTime",
  "sequence",
];
export const round = (n) => Math.round(n * 1000) / 1000;
export function encodeTeamMessage(value) {
  return JSON.stringify(value, (_, v) =>
    typeof v === "number" ? round(v) : v,
  );
}
export function motionMode(p) {
  return p.tackle > 0
    ? p.sliding
      ? 4
      : 3
    : Math.hypot(p.moveIntent?.x || 0, p.moveIntent?.z || 0) < 0.1
      ? 0
      : p.sprintRequested
        ? 2
        : 1;
}
export function packPlayer(p) {
  const pose = {};
  for (const key of POSE_FIELDS) if (p[key] != null) pose[key] = p[key];
  return [
    p.id,
    p.x,
    p.z,
    p.vx,
    p.vz,
    p.moveIntent?.x || 0,
    p.moveIntent?.z || 0,
    p.dx,
    p.dz,
    motionMode(p),
    p.stamina,
    pose,
  ];
}
export function worldState(m) {
  return Object.fromEntries(WORLD_FIELDS.map((k) => [k, m[k] ?? null]));
}
const finite = (x, max = 100000) =>
  typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= max;
function safeTree(v, depth = 0) {
  if (depth > 10) return false;
  if (v == null || typeof v === "boolean") return true;
  if (typeof v === "number") return finite(v);
  if (typeof v === "string") return v.length < 200;
  if (Array.isArray(v))
    return v.length <= 32 && v.every((x) => safeTree(x, depth + 1));
  if (typeof v !== "object") return false;
  return (
    Object.entries(v).length <= 48 &&
    Object.entries(v).every(
      ([k, x]) =>
        !["__proto__", "constructor", "prototype"].includes(k) &&
        safeTree(x, depth + 1),
    )
  );
}
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const vector = (v, keys = ["x", "z"]) =>
  object(v) && keys.every((k) => finite(v[k], 200));
const foot = (n) => n === 0 || n === 1;
function validPose(p) {
  if (!object(p) || !safeTree(p)) return false;
  const booleans = [
    "secondPress",
    "topSpeed",
    "sliding",
    "closeControl",
    "sprintRequested",
  ];
  const objects = [
    "slide",
    "knockdown",
    "evade",
    "bicycle",
    "celebration",
    "ballAction",
    "ballMotion",
    "strikePlant",
    "strikeTarget",
    "followStyle",
    "shield",
    "goalkeeping",
    "header",
    "throwIn",
  ];
  for (const [k, v] of Object.entries(p)) {
    if (!POSE_FIELDS.includes(k)) return false;
    if (
      booleans.includes(k)
        ? typeof v !== "boolean"
        : objects.includes(k)
          ? !object(v)
          : !finite(v)
    )
      return false;
  }
  const a = p.ballAction,
    b = p.ballMotion,
    g = p.goalkeeping;
  if (
    a &&
    (!["pass", "lob", "through", "shoot"].includes(a.type) ||
      !["charging", "pending"].includes(a.stage) ||
      !vector(a.aim) ||
      !vector(a.movement) ||
      !finite(a.heading) ||
      !finite(a.power))
  )
    return false;
  if (
    b &&
    (!foot(b.foot) ||
      !vector(b.target) ||
      !finite(b.heading) ||
      !finite(b.power) ||
      !["strike", "dribble"].includes(b.kind))
  )
    return false;
  if (
    p.strikePlant &&
    (!foot(p.strikePlant.foot) || !vector(p.strikePlant.target))
  )
    return false;
  if (p.strikeTarget && !vector(p.strikeTarget)) return false;
  if (p.shield && !vector(p.shield)) return false;
  if (p.header && !finite(p.header.height)) return false;
  if (
    p.throwIn &&
    (!finite(p.throwIn.phase) || !vector(p.throwIn.ball, ["x", "y", "z"]))
  )
    return false;
  if (p.followStyle && typeof p.followStyle.name !== "string") return false;
  if (
    g &&
    (!["set", "prepare", "dive", "recover"].includes(g.mode) ||
      !Array.isArray(g.hands) ||
      g.hands.length !== 2 ||
      !g.hands.every((v) => vector(v, ["x", "y", "z"])))
  )
    return false;
  return true;
}
export function validPlayer(row, team = null) {
  return (
    Array.isArray(row) &&
    row.length === 12 &&
    Number.isInteger(row[0]) &&
    row[0] >= 0 &&
    row[0] < 22 &&
    (team === null || Math.floor(row[0] / 11) === team) &&
    row.slice(1, 11).every((n) => finite(n, 100)) &&
    Math.abs(row[1]) <= 49 &&
    Math.abs(row[2]) <= 33 &&
    row.slice(3, 7).every((n) => Math.abs(n) <= 30) &&
    row[10] >= 0 &&
    row[10] <= 1 &&
    row[11] &&
    typeof row[11] === "object" &&
    !Array.isArray(row[11]) &&
    validPose(row[11])
  );
}
export function validWorld(s) {
  return (
    s &&
    safeTree(s) &&
    Object.keys(s).every((k) => WORLD_FIELDS.includes(k)) &&
    ["playing", "goal", "finished"].includes(s.mode) &&
    finite(s.elapsed) &&
    s.elapsed >= 0 &&
    Array.isArray(s.score) &&
    s.score.length === 2 &&
    s.score.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000) &&
    s.ball &&
    [0, 1].includes(s.ball.lastTeam) &&
    ["x", "y", "z", "vx", "vy", "vz", "spin"].every((k) =>
      finite(s.ball[k], 200),
    ) &&
    (s.ball.owner === null ||
      (Number.isInteger(s.ball.owner) &&
        s.ball.owner >= 0 &&
        s.ball.owner < 22)) &&
    (s.setPiece == null ||
      (["throw", "corner", "free", "penalty", "kickin"].includes(
        s.setPiece.type,
      ) &&
        Number.isInteger(s.setPiece.taker) &&
        s.setPiece.taker >= 0 &&
        s.setPiece.taker < 22 &&
        [0, 1].includes(s.setPiece.team)))
  );
}
export function validTeamPacket(p, team) {
  if (
    !p ||
    p.type !== "team" ||
    p.version !== TEAM_PROTOCOL ||
    !Number.isSafeInteger(p.seq) ||
    p.seq < 0 ||
    !finite(p.at) ||
    p.at < 0 ||
    !Array.isArray(p.commands) ||
    p.commands.length > 11 ||
    !p.commands.every((c) => validPlayer(c, team)) ||
    new Set(p.commands.map((c) => c[0])).size !== p.commands.length ||
    !Number.isInteger(p.selected) ||
    Math.floor(p.selected / 11) !== team
  )
    return false;
  if (!p.ball) return true;
  const b = p.ball;
  return (
    Number.isSafeInteger(b.epoch) &&
    b.epoch >= 0 &&
    ["event", "sync", "claim", "reset"].includes(b.kind) &&
    validWorld(b.state) &&
    (b.reset == null ||
      (b.kind === "reset" &&
        b.reset.length === 22 &&
        b.reset.every((c, i) => validPlayer(c) && c[0] === i)))
  );
}
