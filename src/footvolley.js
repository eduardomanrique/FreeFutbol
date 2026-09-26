import { defensiveFacing } from "./defensive-facing.js";
import { predictLanding } from "./ball-landing.js";
import { stepBallMotion } from "./ball-physics.js";
import { initLocomotion, stepLocomotion } from "./locomotion.js";
import {
  volleyJump,
  volleyJumpPose,
  VOLLEY_PREPARE,
  VOLLEY_LANDING,
  volleyFootSurface,
} from "./volley-motion.js";
import { bodySurface } from "./altinha-contact.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const side = (t) => (t === 0 ? -1 : 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function initFootvolley(m) {
  m.footvolley = {
    phase: "serve",
    serving: 0,
    server: 0,
    touches: [0, 0],
    lastPlayer: null,
    lastTeam: null,
    lastType: null,
    serial: 0,
    rally: 0,
    targetScore: 15,
    timer: 0,
    receiver: 2,
    reason: "",
    humans: null,
  };
  resetRally(m);
}
function resetRally(m) {
  const f = m.footvolley;
  Object.assign(f, {
    phase: "serve",
    touches: [0, 0],
    lastPlayer: null,
    lastTeam: null,
    lastType: null,
    timer: 0,
    reason: "",
    landing: null,
    selectionAt: -1,
  });
  f.rally++;
  f.readyAt = m.elapsed;
  m.players.forEach((p, i) => {
    const x = side(p.team) * (i % 2 ? 3 : 5.5),
      z = i % 2 ? 2.1 : -2.1;
    Object.assign(p, {
      x,
      z,
      vx: 0,
      vz: 0,
      dx: -side(p.team),
      dz: 0,
      keeper: false,
      altinhaPose: null,
      volleyPending: null,
    });
    initLocomotion(p);
  });
  f.server = f.serving * 2 + (f.rally % 2);
  const p = m.players[f.server];
  p.x = side(p.team) * 8.1;
  p.z = -2.2;
  initLocomotion(p);
  m.controls[0].selected = f.serving === 0 ? f.server : 0;
  m.controls[1].selected = f.serving === 1 ? f.server : 2;
  Object.assign(m.ball, {
    x: p.x + p.dx * 0.45,
    z: p.z,
    y: 0.11,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    owner: null,
    lastTeam: p.team,
  });
  m.announce(
    `SAQUE · ${f.serving === 0 ? "ATLÉTICO" : "UNIÃO"} · Ataque para sacar`,
    2.5,
  );
}
export function volleyPoint(m, winner, reason) {
  const f = m.footvolley;
  if (!["rally", "serve"].includes(f.phase)) return false;
  m.score[winner]++;
  f.serving = winner;
  f.phase = "point";
  f.timer = 2.2;
  f.reason = reason;
  f.serial++;
  m.players.forEach((p) => {
    p.volleyPending = null;
    if (p.altinhaPose?.jumpAt != null) {
      p.altinhaPose.until =
        p.altinhaPose.jumpAt +
        (p.altinhaPose.acrobatic
          ? 1.65 + VOLLEY_PREPARE
          : VOLLEY_LANDING + 0.28);
      if (p.altinhaPose.hitAt == null) p.altinhaPose.landedAt = m.elapsed;
    } else p.altinhaPose = null;
    p.vx = p.vz = 0;
  });
  m.announce(`${reason} · PONTO ${winner === 0 ? "ATLÉTICO" : "UNIÃO"}`, 2.2);
  if (
    m.score[winner] >= f.targetScore &&
    m.score[winner] - m.score[1 - winner] >= 2
  ) {
    f.phase = "finished";
    m.mode = "finished";
  }
  return true;
}
export function requestVolley(m, type, input = {}, id = m.selected) {
  const f = m.footvolley,
    p = m.players[id];
  if (!f || m.mode !== "playing" || !p || !["serve", "rally"].includes(f.phase))
    return false;
  if (type === "switch") {
    if (!f.humans) m.selected = m.selected ^ 1;
    return true;
  }
  if (!["pass", "lob", "shoot"].includes(type)) return false;
  if (f.phase === "serve" && id !== f.server) return false;
  if (
    p.altinhaPose?.dive ||
    p.altinhaPose?.acrobatic ||
    (p.altinhaPose?.jumpAt != null && m.elapsed < p.altinhaPose.until) ||
    p.volleyPending ||
    m.elapsed - (p.volleyContactAt ?? -10) < 0.4
  )
    return false;
  const human = f.humans ? f.humans[id] : id === m.selected && p.team === 0;
  if (type === "pass" && human) {
    const mate = m.players[id ^ 1];
    const mateHuman = f.humans
      ? f.humans[mate.id]
      : mate.id === m.selected && mate.team === 0;
    if (!mateHuman && mate.volleyPending) {
      mate.volleyPending = null;
      if (mate.altinhaPose?.dive || mate.altinhaPose?.jumpAt != null) {
        mate.altinhaPose.landedAt = m.elapsed;
        mate.altinhaPose.until = Math.max(
          m.elapsed + 0.8,
          (mate.altinhaPose.jumpAt ?? m.elapsed) + VOLLEY_LANDING + 0.28,
        );
      } else mate.altinhaPose = null;
    }
  }
  const b = m.ball;
  const forwardGap = (b.x - p.x) * p.dx + (b.z - p.z) * p.dz;
  const awkward = Math.abs(p.x) < 2.4 && forwardGap > 0.55;
  const kind =
    f.phase === "serve"
      ? "inside"
      : type === "shoot" && b.y > 1.65
        ? awkward
          ? "high-kick"
          : "head"
        : type === "lob" && b.y > 2.15
          ? "head"
          : b.y > 1.3
            ? "chest"
            : type === "lob" && b.y > 0.75
              ? "thigh"
              : "inside";
  p.volleyPending = {
    type,
    kind,
    side: 1,
    acrobatic: kind === "high-kick",
    setAttack: f.lastType === "lob" && f.lastTeam === p.team,
    block: kind === "high-kick" && f.lastTeam != null && f.lastTeam !== p.team,
    startedAt: m.elapsed,
    until: m.elapsed + Math.max(2, Math.min(3.5, forecast(b, 0.6).t + 0.5)),
    heading: p.locomotion.heading,
    input: { x: input.x || 0, z: input.z || 0 },
    crouch: 0,
    jumpAt:
      type === "shoot" && f.phase === "rally" && b.y > 1.65 ? m.elapsed : null,
  };
  if (p.volleyPending.jumpAt != null)
    p.volleyPending.until = m.elapsed + VOLLEY_LANDING;
  const lowTarget = forecast(b, 0.65);
  const normalReach = 0.9 + 5.5 * lowTarget.t;
  if (
    type === "pass" &&
    f.phase === "rally" &&
    b.vy < 0 &&
    dist(p, b) > 3.2 &&
    lowTarget.t < 0.65 &&
    dist(p, lowTarget) > normalReach
  ) {
    const target = lowTarget,
      dx = target.x - p.x,
      dz = target.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    Object.assign(p.volleyPending, {
      kind: "inside",
      jumpAt: null,
      until: m.elapsed + 0.72,
      heading: Math.atan2(dx, dz),
      dive: {
        at: m.elapsed,
        x: dx / d,
        z: dz / d,
        speed: Math.min(8, d / 0.55),
      },
    });
  }
  p.altinhaPose = p.volleyPending;
  if (f.phase === "serve") p.volleyPending.serve = true;
  return true;
}
function launch(m, tx, tz, apex) {
  const b = m.ball,
    vy = Math.sqrt(2 * 9.81 * Math.max(0.3, apex - b.y));
  const flight = (vy + Math.sqrt(vy * vy + 2 * 9.81 * (b.y - 0.11))) / 9.81;
  Object.assign(b, {
    vx: ((tx - b.x) / flight) * 1.07,
    vz: ((tz - b.z) / flight) * 1.07,
    vy,
    spin: 0,
    owner: null,
  });
}
// Fast airborne attack, with just enough arc to clear the net on either side.
function attackLaunch(m, tx, tz, pace) {
  const b = m.ball;
  const d = Math.hypot(tx - b.x, tz - b.z);
  const u = clamp(-b.x / (tx - b.x), 0.02, 0.98);
  const netFlight = Math.sqrt(
    Math.max(0, (2.55 - b.y * (1 - u) - 0.11 * u) / (4.905 * u * (1 - u))),
  );
  const flight = Math.max(0.5, d / pace, netFlight);
  Object.assign(b, {
    vx: ((tx - b.x) / flight) * 1.025,
    vz: ((tz - b.z) / flight) * 1.025,
    vy: (0.11 - b.y) / flight + 4.905 * flight,
    spin: 0,
    owner: null,
  });
}
export function volleyContact(m, p, a) {
  const f = m.footvolley;
  if (!["rally", "serve"].includes(f.phase)) return false;
  if (["hand", "arm", "forearm"].includes(a.kind))
    return volleyPoint(m, 1 - p.team, "MÃO / BRAÇO");
  if (f.lastPlayer === p.id) return volleyPoint(m, 1 - p.team, "DOIS TOQUES");
  if (f.touches[p.team] >= 3)
    return volleyPoint(m, 1 - p.team, "QUATRO TOQUES");
  if (m.ball.x * side(p.team) < -0.1)
    return volleyPoint(m, 1 - p.team, "INVASÃO");
  f.touches[p.team]++;
  f.lastPlayer = p.id;
  f.lastTeam = p.team;
  f.lastType = a.type;
  f.serial++;
  f.phase = "rally";
  p.volleyContactAt = m.elapsed;
  a.hitAt = m.elapsed;
  a.until = a.acrobatic
    ? a.jumpAt + 1.65 + VOLLEY_PREPARE
    : a.jumpAt != null
      ? a.jumpAt + VOLLEY_LANDING + 0.28
      : m.elapsed + (a.dive ? 1 : 0.55);
  p.altinhaPose = { ...a };
  p.volleyPending = null;
  m.ball.lastTeam = p.team;
  f.landing = null;
  const mate = m.players[p.id ^ 1];
  if (a.dive) {
    const target =
      a.type === "shoot" || f.touches[p.team] >= 3
        ? { x: -side(p.team) * 5, z: 0 }
        : mate;
    // An emergency foot contact trades accuracy for enough height to recover.
    const tx = target.x + (m.random() - 0.5) * 2;
    const tz = target.z + (m.random() - 0.5) * 3;
    launch(m, tx, tz, 4.8 + m.random() * 0.8);
    f.receiver = closestReceiver(m, tx < 0 ? 0 : 1, { x: tx, z: tz }).id;
    m.lastShot = { power: 0.6, contactAt: m.elapsed };
  } else if (a.type === "shoot" || a.serve) {
    const forward = -side(p.team),
      aim = a.input || {};
    const tx = forward * clamp(5.2 + aim.x * forward * 2, 2.3, 7.4);
    const tz = clamp((aim.z || 0) * 3.2 + (m.random() - 0.5) * 0.55, -3.5, 3.5);
    const powered = a.jumpAt != null && m.elapsed - a.jumpAt < VOLLEY_LANDING;
    if (powered) attackLaunch(m, tx, tz, a.setAttack ? 13 : 11);
    else launch(m, tx, tz, a.serve ? 5.1 : Math.max(4.1, m.ball.y + 1.6));
    f.receiver = closestReceiver(m, 1 - p.team, { x: tx, z: tz }).id;
    m.lastShot = {
      power: powered ? 1 : a.serve ? 0.55 : 0.75,
      powered,
      target: { x: tx, z: tz },
      speed: Math.hypot(m.ball.vx, m.ball.vz),
      contactAt: m.elapsed,
    };
  } else {
    if (a.type === "lob") launch(m, mate.x, mate.z, 5.4);
    else {
      const b = m.ball;
      const d = dist(mate, b) || 1;
      const apex = Math.max(1.75, b.y + 0.18);
      const vy = Math.sqrt(19.62 * (apex - b.y));
      // Arrive at a playable height, not at the sand beneath the partner.
      const flight = (vy + Math.sqrt(vy * vy + 19.62 * (b.y - 0.8))) / 9.81;
      const travel = Math.min(d, 2.2, 2.6 * flight);
      Object.assign(b, {
        vx: (((mate.x - b.x) / d) * travel) / flight,
        vz: (((mate.z - b.z) / d) * travel) / flight,
        vy,
        spin: 0,
        owner: null,
      });
    }
    f.receiver = mate.id;
    if (!f.humans && p.team === 0) m.selected = mate.id;
  }
  m.lastTouch = {
    player: p.id,
    time: m.elapsed,
    kind: a.kind,
    rescue: !!a.dive,
  };
  m.announce(
    a.dive
      ? "SALVOU NO ESFORÇO!"
      : a.serve
        ? "SAQUE"
        : a.type === "shoot"
          ? a.block
            ? "BLOQUEIO"
            : "ATAQUE"
          : a.type === "lob"
            ? "LEVANTAMENTO"
            : "RECEPÇÃO",
    0.7,
  );
  return true;
}
function closestReceiver(m, team, target) {
  const f = m.footvolley;
  return (
    m.players
      .filter((p) => p.team === team && p.id !== f.lastPlayer)
      .sort((a, b) => dist(a, target) - dist(b, target))[0] ||
    m.players[team * 2]
  );
}
function forecast(b, height = 1.3) {
  const t = Math.max(
    0,
    (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 19.62 * (b.y - height)))) /
      9.81,
  );
  return { x: b.x + b.vx * t * 0.95, z: b.z + b.vz * t * 0.95, t };
}
export function updateFootvolley(m, dt, input = {}) {
  const f = m.footvolley,
    b = m.ball;
  m.elapsed += dt;
  if (f.phase === "point") {
    for (const p of m.players) {
      if (p.altinhaPose && m.elapsed > p.altinhaPose.until)
        p.altinhaPose = null;
      p.motion?.update(p, m, dt);
    }
    f.timer -= dt;
    if (f.timer <= 0) resetRally(m);
    return;
  }
  if (
    f.phase === "rally" &&
    (!f.landing || m.elapsed - (f.landingAt || 0) > 0.08)
  ) {
    f.landing = predictLanding(b) || { x: b.x, z: b.z };
    f.landingAt = m.elapsed;
  }
  const prediction = forecast(b);
  const receiving = prediction.x < 0 ? 0 : 1;
  const claimed = m.players.find(
    (p) =>
      p.team === receiving &&
      p.volleyPending?.type === "pass" &&
      (f.humans ? f.humans[p.id] : p.id === m.selected && p.team === 0),
  );
  const receiver = claimed || closestReceiver(m, receiving, prediction);
  if (f.phase === "rally") {
    f.receiver = receiver.id;
    if (!f.humans && f.landing?.x < 0) {
      const next = closestReceiver(m, 0, f.landing),
        current = m.players[m.selected];
      const committed =
        current.volleyPending ||
        (current.altinhaPose?.dive && current.altinhaPose.hitAt == null);
      if (
        next.id !== current.id &&
        !committed &&
        m.elapsed - (f.selectionAt || -1) > 0.3 &&
        (current.id === f.lastPlayer ||
          dist(next, f.landing) + 0.35 < dist(current, f.landing))
      ) {
        m.selected = next.id;
        f.selectionAt = m.elapsed;
      }
    }
  }
  for (const p of m.players) {
    const human = f.humans
      ? f.humans[p.id]
      : p.id === m.selected && p.team === 0;
    const command = f.humans ? m.volleyInputs?.[p.id] || {} : input;
    let vx = 0,
      vz = 0;
    let a = p.volleyPending;
    // A queued set may use a lower body part if the ball has already passed
    // the original contact height. It never pulls the athlete toward the ball.
    if (a?.type === "lob" && !a.serve) {
      if (a.kind === "head" && b.y < 1.55) a.kind = "chest";
      if (a.kind === "chest" && b.y < 1.2) a.kind = "thigh";
      if (a.kind === "thigh" && b.y < 0.72) a.kind = "inside";
    }
    if (a && m.elapsed > a.until) {
      p.volleyPending = null;
      p.altinhaPose =
        a.dive || a.jumpAt != null
          ? {
              ...a,
              landedAt: m.elapsed,
              until:
                m.elapsed + (a.acrobatic ? 0.9 : a.jumpAt != null ? 0.28 : 0.7),
            }
          : null;
      a = null;
    }
    if (
      (p.altinhaPose?.hitAt != null || p.altinhaPose?.landedAt != null) &&
      m.elapsed > p.altinhaPose.until
    )
      p.altinhaPose = null;
    if (human) {
      const speed = command.jockey ? 3.1 : command.sprint ? 7 : 5.6;
      const magnitude = Math.max(1, Math.hypot(command.x || 0, command.z || 0));
      vx = ((command.x || 0) / magnitude) * speed;
      vz = ((command.z || 0) / magnitude) * speed;
    }
    const pursuing = f.phase === "rally" && (p.id === receiver.id || !!a);
    if (
      pursuing &&
      (!human ||
        a?.type === "pass" ||
        (a?.type === "shoot" && dist(p, b) < 1.4))
    ) {
      {
        const contact = a
          ? forecast(
              b,
              a.jumpAt != null
                ? 2.3
                : a.kind === "head"
                  ? 1.8
                  : a.kind === "chest"
                    ? 1.45
                    : a.kind === "thigh"
                      ? 0.92
                      : 0.6,
            )
          : prediction;
        const offset =
          a?.kind === "high-kick" ? 0.38 : a?.kind === "inside" ? 0.35 : 0;
        const tx = clamp(
          contact.x - p.dx * offset,
          p.team === 0 ? -9.8 : 0.4,
          p.team === 0 ? -0.4 : 9.8,
        );
        const tz = clamp(contact.z - p.dz * offset, -5.7, 5.7);
        const d = Math.hypot(tx - p.x, tz - p.z);
        const max =
          m.difficulty === "easy" ? 4.4 : m.difficulty === "hard" ? 6.2 : 5.5;
        vx = d ? ((tx - p.x) / d) * Math.min(max, d * 6) : 0;
        vz = d ? ((tz - p.z) / d) * Math.min(max, d * 6) : 0;
      }
    } else if (!human && f.phase === "rally") {
      let tx = side(p.team) * (f.lastTeam === p.team ? 2.3 : 5.5),
        tz = p.id % 2 ? 2.2 : -2.2;
      if (
        receiving === p.team &&
        receiver.id !== p.id &&
        f.lastTeam !== p.team
      ) {
        // Stand beside the receiver's contact point, outside the incoming lane.
        let lane = p.z >= prediction.z ? 1 : -1;
        if (Math.abs(prediction.z + lane * 1.75) > 4) lane *= -1;
        tx = clamp(
          prediction.x - side(p.team) * 0.65,
          p.team === 0 ? -8.5 : 0.6,
          p.team === 0 ? -0.6 : 8.5,
        );
        tz = clamp(prediction.z + lane * 1.75, -4, 4);
        p.volleySupport = { x: tx, z: tz, receiver: receiver.id };
      }
      vx = clamp((tx - p.x) * 2, -3, 3);
      vz = clamp((tz - p.z) * 2, -3, 3);
      if (receiving === p.team && receiver.id !== p.id) {
        const dx = p.x - receiver.x,
          dz = p.z - receiver.z;
        const gap = Math.hypot(dx, dz);
        if (gap < 1.4) {
          const nx = gap > 0.01 ? dx / gap : 0;
          const nz = gap > 0.01 ? dz / gap : p.id % 2 ? 1 : -1;
          const inward = Math.min(0, vx * nx + vz * nz);
          vx += nx * ((1.4 - gap) * 4 - inward);
          vz += nz * ((1.4 - gap) * 4 - inward);
        }
      }
    }
    const divePose = p.altinhaPose;
    if (divePose?.dive) {
      const age = m.elapsed - divePose.dive.at;
      const landed = divePose.hitAt ?? divePose.landedAt;
      const fade =
        landed == null ? 1 : Math.max(0, 1 - (m.elapsed - landed) / 0.16);
      vx =
        divePose.dive.x *
        divePose.dive.speed *
        Math.max(0, 1 - age * 0.45) *
        fade;
      vz =
        divePose.dive.z *
        divePose.dive.speed *
        Math.max(0, 1 - age * 0.45) *
        fade;
      p.vx = vx;
      p.vz = vz;
    }
    if (
      divePose?.jumpAt != null &&
      (m.elapsed < divePose.jumpAt + VOLLEY_PREPARE ||
        (divePose.acrobatic &&
          m.elapsed > divePose.jumpAt + VOLLEY_PREPARE + 0.5))
    ) {
      vx = vz = 0;
      p.vx = p.vz = 0;
    }
    p.faceHeading = defensiveFacing(p, m.ball, dt, {
      enabled:
        (!a || a.hitAt != null) && !divePose?.dive && divePose?.jumpAt == null,
      sprint: human && !!command.sprint && !command.jockey,
      x: vx,
      z: vz,
    });
    p.walkRequested =
      (human && !!command.jockey) ||
      (a?.type === "pass" && !a.dive && Math.hypot(vx, vz) < 4.2);
    p.moveIntent = { x: vx, z: vz };
    p.turnIntent = p.moveIntent;
    stepLocomotion(p, vx, vz, dt, { surface: "sand" });
    p.x = clamp(p.x, p.team === 0 ? -10 : 0.35, p.team === 0 ? -0.35 : 10);
    p.z = clamp(p.z, -6, 6);
    if (divePose?.dive || divePose?.jumpAt != null)
      p.locomotion.heading = divePose.heading;
    p.dx = Math.sin(p.locomotion.heading);
    p.dz = Math.cos(p.locomotion.heading);
    if (
      !human &&
      !p.volleyPending &&
      !p.altinhaPose?.dive &&
      !p.altinhaPose?.acrobatic
    ) {
      if (
        f.phase === "serve" &&
        p.id === f.server &&
        m.elapsed - (f.readyAt || 0) > 1
      )
        requestVolley(m, "shoot", {}, p.id);
      else if (
        p.id === receiver.id &&
        f.phase === "rally" &&
        dist(p, b) < 2.1 &&
        b.vy < 1 &&
        b.y < 3.4
      ) {
        const mate = m.players[p.id ^ 1];
        requestVolley(
          m,
          f.touches[p.team] >= 2 || dist(p, mate) > 7
            ? "shoot"
            : f.touches[p.team] === 0
              ? "pass"
              : "lob",
          {},
          p.id,
        );
      }
    }
    p.motion?.update(p, m, dt);
  }
  if (f.phase === "serve") {
    const p = m.players[f.server],
      a = p.volleyPending;
    Object.assign(b, {
      x: p.x + p.dx * 0.45,
      z: p.z,
      y: 0.11,
      vx: 0,
      vz: 0,
      vy: 0,
    });
    if (a && m.elapsed - a.startedAt > 0.22) {
      b.y = 0.45;
      volleyContact(m, p, a);
    }
    return;
  }
  const old = { ...b };
  stepBallMotion(b, dt);
  if (old.x * b.x <= 0 && old.x !== b.x) {
    const u = -old.x / (b.x - old.x),
      y = old.y + (b.y - old.y) * u,
      z = old.z + (b.z - old.z) * u;
    if (y < 2.31 || Math.abs(z) > 4.5) {
      volleyPoint(m, 1 - (f.lastTeam ?? 0), "BOLA NA REDE / FORA");
      return;
    }
    f.touches = [0, 0];
    f.lastPlayer = null;
  }
  for (const p of m.players) {
    const a = p.volleyPending;
    if (!a || a.serve || m.elapsed - a.startedAt < 0.12) continue;
    a.heading = p.locomotion.heading;
    const surface =
      a.kind === "high-kick"
        ? volleyFootSurface(p, a, m.elapsed)
        : a.kind === "head" || a.kind === "chest"
          ? bodySurface(p, a, b, m.elapsed)
          : {
              x: p.x + p.dx * (a.dive ? 0.8 : a.kind === "thigh" ? 0.24 : 0.4),
              z: p.z + p.dz * (a.dive ? 0.8 : a.kind === "thigh" ? 0.24 : 0.4),
              y: a.dive ? 0.65 : a.kind === "thigh" ? 0.92 : 0.55,
            };
    if (a.jumpAt != null && m.elapsed < a.jumpAt + VOLLEY_PREPARE) continue;
    if (a.kind === "head")
      surface.y +=
        volleyJump(a, m.elapsed) - volleyJumpPose(a, m.elapsed).crouch;
    if (
      b.vy < 1 &&
      old.y >= surface.y - 0.1 &&
      b.y <= surface.y + 0.15 &&
      dist(surface, b) < 0.52
    ) {
      Object.assign(b, { x: surface.x, z: surface.z, y: surface.y + 0.11 });
      a.contact = { ...surface };
      volleyContact(m, p, a);
      break;
    }
  }
  if (b.y <= 0.111) {
    const inside = Math.abs(b.x) <= 9 && Math.abs(b.z) <= 4.5;
    volleyPoint(
      m,
      inside ? (b.x < 0 ? 1 : 0) : 1 - (f.lastTeam ?? 0),
      inside ? "BOLA NA AREIA" : "BOLA FORA",
    );
  }
}
