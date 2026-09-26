import {
  bodyTouch,
  bodySurface,
  PICKUPS,
  pickupFoot,
} from "./altinha-contact.js";
import { preferredFoot } from "./footedness.js";
import { guideDribbler, dribbleImpulse } from "./dribbling.js";
import { rollingResistance } from "./surfaces.js";
import { ROLL_DECELERATION, stepBallMotion } from "./ball-physics.js";
import { initLocomotion, stepLocomotion } from "./locomotion.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const homes = [
  [0, 2.8],
  [-2.8, -0.2],
  [0, -3],
  [2.8, -0.2],
];
export const ALTINHA_RECORD_KEY = "campo-altinha-record-v1";
export function loadAltinhaRecord() {
  try {
    const n = Number(globalThis.localStorage?.getItem(ALTINHA_RECORD_KEY));
    return Number.isFinite(n) ? clamp(Math.floor(n), 0, 1e9) : 0;
  } catch {
    return 0;
  }
}
function resetCircle(m, starter = 0) {
  m.selected = starter;
  m.players.forEach((p, i) => {
    const [x, z] = homes[i];
    Object.assign(p, {
      x,
      z,
      vx: 0,
      vz: 0,
      dx: -x / Math.hypot(x, z),
      dz: -z / Math.hypot(x, z),
      homeX: x,
      homeZ: z,
      keeper: false,
      team: 0,
      renderId: [1, 4, 7, 13][i],
      altinhaPose: null,
      altinhaPending: null,
      altinhaTouches: 0,
      lastDribble: null,
      groundTouch: null,
      nextGroundTouchAt: 0,
    });
    initLocomotion(p);
  });
  const p = m.players[starter];
  Object.assign(m.ball, {
    x: p.x + p.dx * 0.45,
    z: p.z + p.dz * 0.45,
    y: 0.11,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    owner: null,
    lastTeam: 0,
  });
}
export function initAltinha(m) {
  m.players = m.players.slice(0, 4);
  m.selected = 0;
  resetCircle(m);
  m.altinha = {
    phase: "ready",
    points: 0,
    combo: 0,
    best: loadAltinhaRecord(),
    attempt: 1,
    lastAttempt: 0,
    touches: 0,
    history: [],
    pending: null,
    cooldown: 0,
    effect: null,
    effectSerial: 0,
    lastTouch: null,
    receiver: 0,
    passes: 0,
    hops: 0,
    receiverTouches: 0,
    serves: 0,
    charging: null,
    charge: 0,
  };
}
function choosePartner(m, p, input) {
  const length = Math.hypot(input.x || 0, input.z || 0);
  if (length < 0.3) {
    const others = m.players.map((_, i) => i).filter((i) => m.players[i] !== p);
    return others[m.altinha.passes % others.length];
  }
  let best = -Infinity,
    index = 1;
  m.players.forEach((other, i) => {
    if (other === p) return;
    const dx = other.x - p.x,
      dz = other.z - p.z;
    const dot =
      (dx * (input.x || 0) + dz * (input.z || 0)) / Math.hypot(dx, dz) / length;
    if (dot > best) {
      best = dot;
      index = i;
    }
  });
  return index;
}
function makeAction(m, p, type, input = {}) {
  const b = m.ball;
  const driven = m.altinha.lastPass?.driven && Math.hypot(b.vx, b.vz) > 3;
  let kind = "foot",
    height = 0.46,
    label = "DOMINADA",
    base = 0;
  if (type === "keep") {
    if (driven && b.y > 1.05 && Math.hypot(b.vx, b.vz) > 3) {
      kind = "chest";
      height = 1.42;
      label = "PEITO";
    } else if (b.y > 1.75) {
      const lateral =
        (b.x - p.x) * Math.cos(p.locomotion.heading) -
        (b.z - p.z) * Math.sin(p.locomotion.heading);
      kind = Math.abs(lateral) > 0.12 ? "shoulder" : "chest";
      height = kind === "shoulder" ? 1.58 : 1.42;
      label = kind === "shoulder" ? "OMBRO" : "PEITO";
    } else if (b.y > 1.1) {
      kind = "thigh";
      height = 0.9;
      label = "COXA";
    }
  } else if (type === "pass") {
    kind = b.y > (driven ? 1.45 : 2) ? "head" : "inside";
    height = kind === "head" ? 1.78 : 0.55;
    label = "PASSE";
  } else if (type === "style") {
    base = 10;
    if (driven && b.y > 1.3) {
      kind = "head";
      height = 1.78;
      label = "TESTA";
    } else if (b.y > 1.65 && Math.abs(input.x) > 0.3) {
      kind = "shoulder";
      height = 1.58;
      label = "OMBRO";
    } else if (input.z > 0.3) {
      kind = "heel";
      height = 0.45;
      label = "CALCANHAR";
    } else if (Math.abs(input.x) > 0.3) {
      kind = input.x > 0 ? "outside" : "cross";
      height = 0.54;
      label = input.x > 0 ? "TRIVELA" : "CRUZADO";
    } else if (b.y > 1.85) {
      kind = "head";
      height = 1.78;
      label = "TESTA";
    } else {
      kind = "inside";
      height = 0.54;
      label = "CHAPA";
    }
  } else {
    kind = "around";
    height = 0.4;
    label = "VOLTA AO MUNDO";
    base = 25;
  }
  let side =
    (input.x || 0) < -0.3
      ? -1
      : (input.x || 0) > 0.3
        ? 1
        : (p.altinhaTouches || 0) % 2
          ? -1
          : 1;
  if (kind === "shoulder" && type === "keep") {
    const lateral =
      (b.x - p.x) * Math.cos(p.locomotion.heading) -
      (b.z - p.z) * Math.sin(p.locomotion.heading);
    side = lateral < 0 ? -1 : 1;
  }
  const partner = type === "pass" ? choosePartner(m, p, input) : null;
  if (partner != null && !driven) {
    const q = m.players[partner],
      dx = q.x - p.x,
      dz = q.z - p.z;
    const facing =
      (dx * Math.sin(p.locomotion.heading) +
        dz * Math.cos(p.locomotion.heading)) /
      Math.max(0.01, Math.hypot(dx, dz));
    if (facing < -0.55 && b.y > 1.05 && b.y < 2.9) {
      kind = b.y > 1.7 ? "bicycle" : "high-heel";
      height = kind === "bicycle" ? 1.5 : 1.02;
      label = kind === "bicycle" ? "BICICLETA" : "CALCANHAR ALTO";
      base = kind === "bicycle" ? 20 : 12;
      side = preferredFoot(p) === 0 ? -1 : 1;
    }
  }
  return {
    type,
    kind,
    height,
    label,
    base,
    power: clamp(input.power ?? 0.48, 0.15, 1),
    assistOrigin: { x: p.x, z: p.z },
    crouch: 0,
    heading: p.locomotion.heading,
    side,
    player: m.players.indexOf(p),
    target: partner,
    startedAt: m.elapsed,
    readyAt: m.elapsed + (kind === "bicycle" ? 0.24 : 0.08),
    bicycleContactAt: kind === "bicycle" ? m.elapsed + 0.35 : null,
    expiresAt: m.elapsed + 1.05,
    stage: type === "trick" ? "prepare" : null,
  };
}
export function requestAltinha(m, type, input = {}) {
  const s = m.altinha,
    p = m.players[m.selected],
    b = m.ball;
  if (s && type === "pass-cancel") {
    s.charging = null;
    s.charge = 0;
    return true;
  }
  if (s && type === "pass-release") {
    if (!s.charging) return false;
    const power = clamp(
      0.15 + ((m.elapsed - s.charging.startedAt) / 0.9) * 0.85,
      0.15,
      1,
    );
    s.charging = null;
    s.charge = 0;
    return requestAltinha(m, "pass", { ...input, power });
  }
  const charging = type === "pass-start";
  if (charging) type = "pass";
  if (
    !s ||
    m.mode !== "playing" ||
    !["keep", "style", "trick", "pass"].includes(type)
  )
    return false;
  if (s.phase === "ready") {
    if (Math.hypot(b.x - p.x, b.z - p.z) > 1) return false;
    p.groundTouch = null;
    s.phase = "serving";
    s.lastAttempt = 0;
    s.pending = null;
    s.receiver = m.selected;
    const pickup = PICKUPS[s.serves++ % PICKUPS.length];
    const a = {
      kind: "pickup",
      type: "pickup",
      pickup,
      side: pickup === "cross" ? -1 : 1,
      heading: p.locomotion.heading,
      startedAt: m.elapsed,
      rollAt: pickup === "scoop" ? 0.26 : 0.22,
      liftAt: pickup === "scoop" ? 0.42 : 0.62,
      until: m.elapsed + 1.1,
    };
    s.pickup = a;
    p.altinhaPose = a;
    m.announce(
      pickup === "sole"
        ? "PUXADA DE SOLA"
        : pickup === "scoop"
          ? "CAVADINHA"
          : "PUXADA CRUZADA",
      1.1,
    );
    return true;
  }
  if (
    s.phase !== "playing" ||
    s.pending ||
    s.charging ||
    m.elapsed < s.cooldown ||
    s.receiver !== m.selected
  )
    return false;
  if (charging) {
    s.charging = { startedAt: m.elapsed, player: m.selected };
    s.charge = 0.15;
    return true;
  }
  if (type === "trick" && (b.y < 0.6 || b.y > 2.8 || b.vy > 2)) {
    m.announce("TRUQUE: PREPARE QUANDO A BOLA DESCER", 0.9);
    return false;
  }
  s.pending = makeAction(m, p, type, input);
  const t =
    (b.vy +
      Math.sqrt(b.vy * b.vy + 2 * 9.81 * Math.max(0, b.y - s.pending.height))) /
    9.81;
  s.pending.expiresAt = m.elapsed + clamp(t + 0.28, 1.05, 1.8);
  p.altinhaPose = { ...s.pending, contact: null, until: s.pending.expiresAt };
  return true;
}
function awardContact(m, p, a, point) {
  const s = m.altinha,
    repeat = s.history.filter((k) => k === a.kind).length;
  let award = 0;
  if (a.base && repeat < 2) {
    s.combo =
      s.history.at(-1) !== a.kind ? s.combo + 1 : Math.max(1, s.combo - 1);
    award = Math.round(
      (a.base * (1 + Math.min(4, s.combo - 1) * 0.25)) / (1 + repeat),
    );
  } else if (a.base) s.combo = 0;
  if (a.base) {
    s.history.push(a.kind);
    s.history = s.history.slice(-4);
  }
  s.points += award;
  s.touches++;
  p.altinhaTouches++;
  s.lastTouch = {
    kind: a.kind,
    label: a.label,
    award,
    at: m.elapsed,
    point,
    player: a.player,
    pass: a.type === "pass",
  };
  if (award) {
    s.effect = {
      id: ++s.effectSerial,
      at: m.elapsed,
      ...m.ball,
      combo: s.combo,
      hue: (s.points * 37 + s.effectSerial * 79) % 360,
      variant: s.effectSerial % 4,
    };
    if (s.points > s.best) {
      s.best = s.points;
      try {
        globalThis.localStorage?.setItem(ALTINHA_RECORD_KEY, String(s.best));
      } catch {}
    }
    m.announce(`${a.label} +${award} · COMBO ${s.combo}`, 1);
  } else
    m.announce(
      a.type === "pass"
        ? "BOA! · BOLA NA RODA"
        : a.base
          ? "VARIE O MOVIMENTO"
          : `${a.label} · SEM PONTOS`,
      0.9,
    );
}
function sendBall(m, p, target, apex) {
  const b = m.ball,
    vy = Math.sqrt(2 * 9.81 * Math.max(0.2, apex - b.y));
  // Solve the flight to the receiver's low contact, including a small air-drag allowance.
  const time =
    (vy + Math.sqrt(vy * vy + 2 * 9.81 * Math.max(0, b.y - 0.6))) / 9.81;
  b.vx = ((target.x - b.x) / time) * 1.018;
  b.vz = ((target.z - b.z) / time) * 1.018;
  b.vy = vy;
  b.spin = 0;
}
function contact(m, p, a) {
  const s = m.altinha,
    b = m.ball,
    point = a.bodyContact ?? { x: b.x, y: b.y - 0.09, z: b.z };
  if (a.stage === "prepare") {
    // A low setup tap precedes the orbit: the foot circles a reachable ball,
    // then scores only after catching it again. Never circle a ball over the head.
    a.stage = "orbit";
    a.orbitAt = m.elapsed;
    a.orbitDuration = 0.47;
    a.height = 0.4;
    a.readyAt = m.elapsed + 0.32;
    a.expiresAt = m.elapsed + 0.95;
    a.orbitCenter = { x: b.x, z: b.z };
    b.vx = b.vz = 0;
    b.vy = 2.4;
    b.spin = 0;
    p.altinhaPose = { ...a, contact: null, until: a.expiresAt };
    return;
  }
  if (a.rescue) {
    a.type = "pass";
    a.label = "CABEÇADA NO ESFORÇO";
    a.target ??= choosePartner(m, p, {
      x: Math.sin(a.heading),
      z: Math.cos(a.heading),
    });
  }
  awardContact(m, p, a, point);
  s.receiverTouches++;
  if (a.kind === "shoulder" && a.type === "style" && !a.shoulderReturn) {
    const next = {
      ...a,
      side: -a.side,
      shoulderReturn: true,
      label: "OMBRO A OMBRO",
      startedAt: m.elapsed,
      readyAt: m.elapsed + 0.16,
      expiresAt: m.elapsed + 0.85,
      crouch: 0,
      previousSurface: null,
    };
    const scale = 1.025 + (p.renderId % 4) * 0.01;
    const target = {
      x: p.x + Math.cos(a.heading) * next.side * 0.205 * scale,
      z: p.z - Math.sin(a.heading) * next.side * 0.205 * scale,
    };
    const flight = 0.43;
    b.vx = ((target.x - b.x) / flight) * 1.018;
    b.vz = ((target.z - b.z) / flight) * 1.018;
    b.vy = (1.48 * scale - 0.08 + 0.11 - b.y) / flight + 4.905 * flight;
    b.spin = 0;
    s.pending = next;
    p.altinhaPose = {
      ...a,
      contact: point,
      hitAt: m.elapsed,
      until: m.elapsed + 0.2,
    };
    return;
  }
  if (a.type === "pass") {
    const other = m.players[a.target],
      dx = -other.x,
      dz = -other.z,
      l = Math.hypot(dx, dz) || 1;
    const tx = other.x + (dx / l) * 0.4,
      tz = other.z + (dz / l) * 0.4;
    const bx = tx - b.x,
      bz = tz - b.z,
      distance = Math.hypot(bx, bz) || 1;
    // A medium touch reaches the partner. Short/strong touches fall before or
    // beyond them, and stronger contacts have a little more directional error.
    const reach = 0.7 + a.power * 0.625;
    const error = (m.random() * 2 - 1) * (0.18 + a.power * a.power * 0.6);
    const depth = (m.random() * 2 - 1) * (0.1 + a.power * 0.22);
    const target = {
      x: b.x + bx * reach + (bz / distance) * error + (bx / distance) * depth,
      z: b.z + bz * reach - (bx / distance) * error + (bz / distance) * depth,
    };
    if (a.rescue) {
      // An emergency header is a brisk body-height feed, not a lob to the feet.
      target.x = tx + (bz / distance) * error * 1.4;
      target.z = tz - (bx / distance) * error * 1.4;
      const flight = clamp(distance / (8 + a.power * 3), 0.25, 0.85);
      b.vx = ((target.x - b.x) / flight) * 1.018;
      b.vz = ((target.z - b.z) / flight) * 1.018;
      b.vy = (1.5 - b.y) / flight + 4.905 * flight;
      b.spin = 0;
    } else sendBall(m, p, target, Math.max(b.y + 0.3, 2.6 + a.power * 3));
    s.lastPass = {
      power: a.power,
      target,
      receiver: a.target,
      error,
      driven: !!a.rescue,
    };
    s.receiver = a.target;
    s.receiverTouches = 0;
    s.passes++;
    m.selected = a.target;
    other.altinhaPending = null;
    s.controlChangedAt = m.elapsed;
  } else {
    sendBall(
      m,
      p,
      { x: p.x + p.dx * 0.43, z: p.z + p.dz * 0.43 },
      a.kind === "head" ? 2.45 : 2.15,
    );
  }
  s.cooldown = m.elapsed + (a.type === "pass" ? 0.06 : 0.22);
  s.pending = null;
  p.altinhaPose = {
    ...a,
    contact: point,
    hitAt: m.elapsed,
    until: m.elapsed + (a.kind === "bicycle" ? 1.35 : a.rescue ? 1 : 0.48),
  };
}
function readyContact(m, p, a, previous) {
  const b = m.ball;
  if (bodyTouch(a)) {
    if (m.elapsed < a.readyAt || m.elapsed - a.startedAt < 0.18) return false;
    const surface = bodySurface(p, a, b, m.elapsed);
    const old = a.previousSurface ?? surface;
    a.previousSurface = surface;
    const start = {
      x: previous.x - old.x,
      y: previous.y - old.y,
      z: previous.z - old.z,
    };
    const end = { x: b.x - surface.x, y: b.y - surface.y, z: b.z - surface.z };
    const dx = end.x - start.x,
      dy = end.y - start.y,
      dz = end.z - start.z;
    const t = clamp(
      -(start.x * dx + start.y * dy + start.z * dz) /
        Math.max(1e-9, dx * dx + dy * dy + dz * dz),
      0,
      1,
    );
    if (
      Math.hypot(start.x + dx * t, start.y + dy * t, start.z + dz * t) > 0.112
    )
      return false;
    const len = Math.hypot(end.x, end.y, end.z) || 1;
    b.x = surface.x + (end.x / len) * 0.11;
    b.y = surface.y + (end.y / len) * 0.11;
    b.z = surface.z + (end.z / len) * 0.11;
    a.bodyContact = surface;
    return true;
  }
  return (
    m.elapsed >= a.readyAt &&
    b.vy < 0.2 &&
    b.y <= a.height + 0.12 &&
    previous.y >= a.height - 0.12 &&
    Math.hypot(b.x - p.x, b.z - p.z) <= (a.kind === "head" ? 0.63 : 0.86)
  );
}
function movePlayers(m, dt, input) {
  const s = m.altinha,
    b = m.ball;
  m.players.forEach((p, i) => {
    let vx = 0,
      vz = 0;
    if (i === m.selected) {
      const mag = Math.max(1, Math.hypot(input.x || 0, input.z || 0));
      vx = ((input.x || 0) / mag) * 3;
      vz = ((input.z || 0) / mag) * 3;
      const a = s.pending;
      if (
        a?.shoulderReturn &&
        p.altinhaPose?.hitAt != null &&
        m.elapsed >= a.readyAt - 0.04
      )
        p.altinhaPose = { ...a, contact: null, until: a.expiresAt };
      if (
        a &&
        !a.rescue &&
        !["around", "bicycle", "high-heel"].includes(a.kind) &&
        b.y > 0.55 &&
        b.y < 1.95 &&
        b.vy < 1
      ) {
        const surface = bodySurface(p, a, b, m.elapsed);
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        const speed2 = b.vx * b.vx + b.vz * b.vz;
        const closest = clamp(
          -((b.x - p.x) * b.vx + (b.z - p.z) * b.vz) / Math.max(0.01, speed2),
          0,
          0.35,
        );
        const missDistance = Math.hypot(
          b.x + b.vx * closest - p.x,
          b.z + b.vz * closest - p.z,
        );
        const missedHead =
          a.kind === "head" &&
          b.y < surface.y + 0.23 &&
          (Math.hypot(b.x - surface.x, b.z - surface.z) > 0.13 ||
            b.y < surface.y - 0.04);
        if (
          d < 1.8 &&
          (missedHead || (d > 0.95 && b.y > 1.1 && missDistance > 0.75))
        ) {
          a.kind = "head";
          a.heading = Math.atan2(
            b.x + b.vx * 0.08 - p.x,
            b.z + b.vz * 0.08 - p.z,
          );
          const height = clamp(b.y + b.vy * 0.12 - 0.11, 0.92, 1.65);
          a.crouch = Math.min(a.crouch || 0, 0.18);
          a.rescue = {
            at: m.elapsed,
            fold: clamp(
              Math.acos(clamp((height + a.crouch - 0.88) / 0.86, -1, 1)),
              0.4,
              1.25,
            ),
          };
          a.expiresAt = Math.max(a.expiresAt, m.elapsed + 0.45);
          p.altinhaPose = { ...a, contact: null, until: a.expiresAt };
        }
      }
      if (a?.rescue) {
        const turn = Math.atan2(
          b.x + b.vx * 0.04 - p.x,
          b.z + b.vz * 0.04 - p.z,
        );
        const delta = Math.atan2(
          Math.sin(turn - a.heading),
          Math.cos(turn - a.heading),
        );
        a.heading += delta * (1 - Math.exp(-18 * dt));
        a.crouch += (0.34 - a.crouch) * (1 - Math.exp(-14 * dt));
        const desired = clamp(
          Math.acos(
            clamp((b.y + b.vy * 0.045 - 0.025 + a.crouch - 0.88) / 0.86, -1, 1),
          ),
          0.3,
          1.55,
        );
        a.rescue.fold += (desired - a.rescue.fold) * (1 - Math.exp(-24 * dt));
        if (p.altinhaPose) {
          p.altinhaPose.crouch = a.crouch;
          p.altinhaPose.heading = a.heading;
        }
      }
      if (bodyTouch(a) && ((!vx && !vz) || a.rescue)) {
        if (a.rescue) {
          const point = bodySurface(p, a, b, m.elapsed + 0.08);
          const dx = b.x + b.vx * 0.06 - point.x,
            dz = b.z + b.vz * 0.06 - point.z;
          const d = Math.hypot(dx, dz),
            v = Math.min(5.5, d * 16);
          vx = (dx / Math.max(0.001, d)) * v;
          vz = (dz / Math.max(0.001, d)) * v;
        } else {
          const nominal = bodySurface(p, { ...a, crouch: 0 }, b, m.elapsed);
          const flight = Math.max(
            0,
            (b.vy +
              Math.sqrt(
                Math.max(0, b.vy * b.vy + 19.62 * (b.y - nominal.y - 0.11)),
              )) /
              9.81,
          );
          const dx = b.x + b.vx * Math.min(flight, 0.5) - nominal.x,
            dz = b.z + b.vz * Math.min(flight, 0.5) - nominal.z,
            d = Math.hypot(dx, dz);
          if (
            d < 1.25 &&
            Math.hypot(p.x - a.assistOrigin.x, p.z - a.assistOrigin.z) < 0.9
          ) {
            const v = Math.min(2.5, d * 7);
            vx = (dx / Math.max(0.001, d)) * v;
            vz = (dz / Math.max(0.001, d)) * v;
            const arrival = Math.min(0.32, Math.max(0.12, d / 2.5));
            const futureY = b.y + b.vy * arrival - 4.905 * arrival * arrival;
            const crouch =
              s.lastPass?.driven && Math.hypot(b.vx, b.vz) > 3
                ? 0
                : clamp(nominal.y + 0.11 - futureY, 0, 0.26);
            a.crouch += (crouch - a.crouch) * (1 - Math.exp(-14 * dt));
            if (p.altinhaPose) p.altinhaPose.crouch = a.crouch;
          }
        }
      }
      if (!vx && !vz && a?.kind === "around" && a.stage === "prepare") {
        const fx = Math.sin(a.heading),
          fz = Math.cos(a.heading);
        const room = (b.x - p.x) * fx + (b.z - p.z) * fz;
        const retreat = clamp((0.62 - room) * 7, 0, 1.8);
        if (Math.hypot(b.x - p.x, b.z - p.z) < 0.85) {
          vx = -fx * retreat;
          vz = -fz * retreat;
        }
      }
      if (s.phase === "serving") vx = vz = 0;
    } else {
      let tx = p.homeX,
        tz = p.homeZ;
      const d = Math.hypot(tx - p.x, tz - p.z),
        v = Math.min(2.5, d * 3);
      if (d > 0.05) {
        vx = ((tx - p.x) / d) * v;
        vz = ((tz - p.z) / d) * v;
      }
    }
    if (
      p.altinhaPose?.rescue &&
      p.altinhaPose.hitAt != null &&
      m.elapsed - p.altinhaPose.hitAt < 0.6
    )
      vx = vz = 0;
    if (i === m.selected && s.phase === "ready") {
      p.closeControl = true;
      const guided = guideDribbler(p, b, vx, vz);
      vx = guided.x;
      vz = guided.z;
    }
    // Let walking turn naturally; near a touch, settle facing the incoming ball.
    const moving = Math.hypot(vx, vz) > 0.35;
    p.faceHeading = moving
      ? Math.atan2(vx, vz)
      : i === m.selected
        ? p.locomotion.heading
        : Math.atan2(b.x - p.x, b.z - p.z);
    if (!moving && Math.hypot(b.x - p.x, b.z - p.z) < 0.18)
      p.faceHeading = p.locomotion.heading;
    if (
      i === m.selected &&
      (bodyTouch(s.pending) ||
        ["around", "bicycle", "high-heel"].includes(s.pending?.kind) ||
        s.phase === "serving")
    )
      p.faceHeading = (s.pending ?? s.pickup).heading;
    stepLocomotion(p, vx, vz, dt);
    p.x = clamp(p.x, -18, 18);
    p.z = clamp(p.z, -12, 12);
    p.dx = Math.sin(p.locomotion.heading);
    p.dz = Math.cos(p.locomotion.heading);
  });
}
export function updateAltinha(m, dt, input) {
  const s = m.altinha,
    b = m.ball;
  m.elapsed += dt;
  m.lastInput = { ...input };
  if (s.charging)
    s.charge = clamp(
      0.15 + ((m.elapsed - s.charging.startedAt) / 0.9) * 0.85,
      0.15,
      1,
    );
  if (s.phase === "failed") {
    if (m.elapsed >= s.resetAt) {
      const starter = s.lastTouch?.player ?? s.receiver;
      resetCircle(m, starter);
      s.phase = "ready";
      s.attempt++;
      s.receiver = starter;
      s.receiverTouches = 0;
      s.hops = 0;
      m.announce("NOVA TENTATIVA · TOQUE PARA COMEÇAR", 2);
    }
  } else {
    movePlayers(m, dt, input);
    if (s.phase === "ready") {
      const p = m.players[m.selected];
      stepBallMotion(b, dt);
      const moving = Math.hypot(input.x || 0, input.z || 0) > 0.1;
      const distance = Math.hypot(b.x - p.x, b.z - p.z);
      if (
        !p.groundTouch &&
        moving &&
        distance < 0.9 &&
        m.elapsed >= (p.nextGroundTouchAt || 0)
      ) {
        p.groundTouch = { at: m.elapsed };
        p.altinhaPose = {
          kind: "foot",
          side: 1,
          heading: p.locomotion.heading,
          startedAt: m.elapsed,
          until: m.elapsed + 0.35,
        };
      }
      if (p.groundTouch && m.elapsed - p.groundTouch.at >= 0.12) {
        if (distance < 0.95 && moving) {
          const impulse = dribbleImpulse(p, b);
          const sandScale = Math.sqrt(
            rollingResistance(b, Math.hypot(impulse.vx, impulse.vz)) /
              ROLL_DECELERATION,
          );
          impulse.vx *= sandScale;
          impulse.vz *= sandScale;
          b.vx = impulse.vx;
          b.vz = impulse.vz;
          p.lastDribble = { ...impulse, time: m.elapsed };
          p.nextGroundTouchAt = m.elapsed + Math.max(0.32, impulse.interval);
          p.altinhaPose.hitAt = m.elapsed;
          p.altinhaPose.contact = { x: b.x, y: 0.08, z: b.z };
        }
        p.groundTouch = null;
      }
      if (p.altinhaPose && m.elapsed > p.altinhaPose.until)
        p.altinhaPose = null;
    } else if (s.phase === "serving") {
      const a = s.pickup,
        p = m.players[m.selected],
        t = m.elapsed - a.startedAt;
      if (t >= a.rollAt && !a.rolled) {
        a.rolled = true;
        if (a.pickup !== "scoop") {
          b.vx =
            -Math.sin(a.heading) * 0.55 +
            (a.pickup === "cross" ? Math.cos(a.heading) * a.side * 0.35 : 0);
          b.vz =
            -Math.cos(a.heading) * 0.55 -
            (a.pickup === "cross" ? Math.sin(a.heading) * a.side * 0.35 : 0);
        }
      }
      // The sole rolls a grounded ball; launch is delayed until the instep arrives.
      if (a.rolled && t < a.liftAt) {
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y = 0.11;
      }
      if (t >= a.liftAt) {
        a.contact = pickupFoot(p, a, b, m.elapsed);
        a.hitAt = m.elapsed;
        a.until = m.elapsed + 0.4;
        b.vx = b.vz = 0;
        b.vy = 6.2;
        b.spin = 0;
        s.phase = "playing";
        s.pickup = null;
        m.announce("BOLA NA RODA · DOMINE OU PASSE", 1.2);
      }
    } else {
      const previous = { x: b.x, y: b.y, z: b.z },
        previousY = b.y;
      stepBallMotion(b, dt);
      const p = m.players[s.receiver];
      const action = s.pending;
      if (action && m.elapsed > action.expiresAt) {
        s.pending = null;
        s.charging = null;
        s.charge = 0;
        m.announce("PASSOU DO TEMPO", 0.7);
        // Ease back out rather than snapping the lifted foot to the sand.
        if (p.altinhaPose) {
          p.altinhaPose.hitAt = m.elapsed;
          p.altinhaPose.until = m.elapsed + 0.35;
        }
      } else if (action && readyContact(m, p, action, previous))
        contact(m, p, action);
      if (b.y <= 0.115 && previousY > 0.115) {
        s.lastAttempt = s.points;
        s.points = s.combo = 0;
        s.history = [];
        s.pending = null;
        s.charging = null;
        s.charge = 0;
        s.effect = null;
        s.phase = "failed";
        s.resetAt = m.elapsed + 1.35;
        b.vx = b.vy = b.vz = 0;
        m.players.forEach((p) => {
          p.altinhaPending = null;
          p.altinhaPose = null;
          p.vx = p.vz = 0;
        });
        m.announce(`CAIU! · ${s.lastAttempt} PONTOS · VOLTA AO ZERO`, 1.35);
      }
    }
  }
  m.players.forEach((p) => {
    if (p.altinhaPose && m.elapsed > p.altinhaPose.until) p.altinhaPose = null;
    p.motion?.update(p, m, dt);
  });
}
