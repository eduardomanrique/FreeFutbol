import { shotBand, loftedShotLift } from "./ball-actions.js";
import { initLocomotion } from "./locomotion.js";
import { stepBallMotion } from "./ball-physics.js";
import {
  SLIDE_DURATION,
  FALL_DURATION,
  bicycleDuration,
} from "./movement-phases.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const unavailable = (p) => !!(p.slide || p.knockdown || p.bicycle);
export function startSlide(m, p) {
  if (unavailable(p) || p.tackle > 0 || p.recovery > 0) return false;
  const input = m.controls[p.team].lastInput || {};
  let dx = input.x || p.dx,
    dz = input.z || p.dz;
  if (Math.hypot(input.x || 0, input.z || 0) > 0.2) {
    dx = input.x;
    dz = input.z;
  }
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  p.slide = {
    time: 0,
    dx,
    dz,
    speed: Math.max(7, Math.min(10, Math.hypot(p.vx, p.vz) + 3)),
    hitBall: false,
    victims: [],
    attempts: [],
  };
  p.tackle = 1.2;
  p.sliding = true;
  p.ballAction = p.ballMotion = p.header = p.rootWarp = null;
  p.locomotion.heading = Math.atan2(dx, dz);
  p.dx = dx;
  p.dz = dz;
  return true;
}
export function stepSpecial(m, p, dt) {
  if (p.evade) {
    p.evade.time += dt;
    p.evade.height =
      p.evade.peak * Math.sin(Math.PI * Math.min(1, p.evade.time / 0.65));
    if (p.evade.time >= 0.65) p.evade = null;
  }
  if (p.knockdown) {
    const k = p.knockdown;
    k.time += dt;
    p.vx = k.dx * 1.8 * Math.exp(-k.time * 6);
    p.vz = k.dz * 1.8 * Math.exp(-k.time * 6);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (k.time > FALL_DURATION) {
      p.knockdown = null;
      p.recovery = 0.25;
      initLocomotion(p);
    }
    return true;
  }
  if (p.slide) {
    const s = p.slide;
    s.time += dt;
    p.tackle = Math.max(0, 1.2 - s.time);
    s.previous = { x: p.x + s.dx * 0.8, z: p.z + s.dz * 0.8 };
    p.vx = s.dx * s.speed * Math.exp(-s.time * 2.5);
    p.vz = s.dz * s.speed * Math.exp(-s.time * 2.5);
    p.x = clamp(
      p.x + p.vx * dt,
      -m.field.halfLength + 0.5,
      m.field.halfLength - 0.5,
    );
    p.z = clamp(
      p.z + p.vz * dt,
      -m.field.halfWidth + 0.5,
      m.field.halfWidth - 0.5,
    );
    if (s.time >= SLIDE_DURATION) {
      p.slide = null;
      p.sliding = false;
      initLocomotion(p);
    }
    return true;
  }
  if (p.bicycle) {
    p.bicycle.time += dt;
    p.vx = p.vz = 0;
    if (p.bicycle.time > bicycleDuration(p.bicycle.contactAt)) {
      p.bicycle = null;
      p.recovery = 0.3;
      initLocomotion(p);
    }
    return true;
  }
  return false;
}
function sweptDistance(a, b, q) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = clamp(
      ((q.x - a.x) * dx + (q.z - a.z) * dz) / (dx * dx + dz * dz || 1),
      0,
      1,
    );
  return Math.hypot(a.x + t * dx - q.x, a.z + t * dz - q.z);
}
export function slideContacts(m, p) {
  const s = p.slide;
  if (!s || s.time > 0.62 || s.time < 0.05) return;
  const tip = { x: p.x + s.dx * 0.9, z: p.z + s.dz * 0.9 },
    before = s.previous || tip,
    b = m.ball;
  if (!s.hitBall && b.y < 0.55 && sweptDistance(before, tip, b) < 0.4) {
    s.hitBall = true;
    const old = m.players[b.owner];
    if (old) {
      old.ballAction = old.ballMotion = null;
      m.withTeam(old.team, () => m.cancelAction());
    }
    b.owner = null;
    b.vx = s.dx * 9;
    b.vz = s.dz * 9;
    b.vy = 0.35;
    b.lastTeam = p.team;
    m.kickCooldown = 0.22;
    m.lastKicker = p.id;
    m.kickReleasedAt = m.elapsed;
    m.recordBallTouch(p);
    m.distributed?.contact(p, "tackle");
  }
  for (const q of m.players) {
    if (q.team === p.team || q.knockdown || s.victims.includes(q.id)) continue;
    const approach =
      (q.dx * (p.x - q.x) + q.dz * (p.z - q.z)) /
      Math.max(0.01, distance(p, q));
    if (approach > 0.3 && distance(p, q) < 2.8 && !s.attempts.includes(q.id)) {
      s.attempts.push(q.id);
      const success = m.random() < 0.45 + 0.25 * q.stamina;
      q.evade = {
        time: success ? 0.12 : 0,
        height: success ? 0.4 : 0,
        peak: success ? 0.72 : 0.22,
        success,
      };
    }
    if (sweptDistance(before, tip, q) > 0.64 || (q.evade?.height || 0) > 0.38)
      continue;
    s.victims.push(q.id);
    q.evade = null;
    q.slide = null;
    q.sliding = false;
    q.knockdown = { time: 0, dx: s.dx, dz: s.dz, behind: approach < -0.25 };
    q.ballAction = q.ballMotion = q.header = q.rootWarp = null;
    m.withTeam(q.team, () => m.cancelAction());
    if (b.owner === q.id) {
      b.owner = null;
      b.vx = q.vx * 0.6;
      b.vz = q.vz * 0.6;
    }
    m.distributed?.contact(p, "tackle");
    m.distributed?.reset();
    m.lastTackle = {
      player: p.id,
      victim: q.id,
      behind: approach < -0.25,
      ballFirst: s.hitBall,
      time: m.elapsed,
    };
    if (m.variant !== "street" && !m.foul) {
      m.foul = {
        team: q.team,
        victim: q.id,
        offender: p.id,
        x: q.x,
        z: q.z,
        time: 0,
      };
      m.cancelAllActions();
      b.vx = b.vy = b.vz = 0;
      m.announce("FALTA! · CONTATO NO JOGADOR", 2);
    } else if (m.variant === "street") m.announce("SEGUE O JOGO!", 1.2);
  }
}
export function planBicycle(m, p, action) {
  const b = m.ball,
    dir = p.team === 0 ? 1 : -1;
  if (
    action?.type !== "shoot" ||
    !action.firstTime ||
    p.keeper ||
    p.bicycle ||
    p.header ||
    p.recovery > 0 ||
    b.owner !== null ||
    m.elapsed < (p.nextBicycle || 0)
  )
    return null;
  const beach = m.variant === "sand";
  // Beach football favours overhead finishes from a wider range of crosses.
  if (
    p.dx * dir > (beach ? 0.25 : -0.55) ||
    Math.abs(dir * m.field.halfLength - p.x) >
      Math.min(beach ? 24 : 18, m.field.halfLength * (beach ? 1.2 : 0.7)) ||
    Math.hypot(p.vx, p.vz) > (beach ? 6 : 4) ||
    b.vy > (beach ? 3 : 1) ||
    Math.hypot(b.vx, b.vz) < (beach ? 0.8 : 2)
  )
    return null;
  if (m.players.some((q) => q !== p && distance(p, q) < (beach ? 1.2 : 2.1)))
    return null;
  const f = { ...b };
  for (let i = 1; i <= 66; i++) {
    stepBallMotion(f, 1 / 120);
    const t = i / 120;
    if (
      t < 0.2 ||
      f.y < (beach ? 1.25 : 1.45) ||
      f.y > (beach ? 2.3 : 2.1) ||
      distance(p, f) > (beach ? 0.75 : 0.55)
    )
      continue;
    return {
      time: 0,
      contactAt: t,
      hit: false,
      height: f.y,
      contact: { x: f.x, y: f.y, z: f.z },
      heading: beach ? Math.atan2(-dir, 0) : p.locomotion.heading,
    };
  }
  return null;
}
export function bicycleContact(m, p) {
  const a = p.bicycle,
    b = m.ball;
  if (!a || a.hit || a.time < a.contactAt || a.time > a.contactAt + 0.12)
    return;
  if (b.owner !== null || b.y < 1.2 || b.y > 2.4 || distance(p, b) > 0.8)
    return;
  a.hit = true;
  const power = p.ballAction?.power ?? 0.8;
  const band = shotBand(power);
  const dir = p.team === 0 ? 1 : -1,
    x = dir * m.field.halfLength,
    targetZ = clamp(
      p.ballAction?.targetZ || 0,
      -m.field.goalHalf + 0.25,
      m.field.goalHalf - 0.25,
    ),
    z =
      band === "mishit"
        ? (targetZ < 0 ? -1 : 1) * (m.field.goalHalf + 7)
        : targetZ;
  const speed =
    band === "mishit"
      ? 43 + 70 * (power - 0.9)
      : band === "long-range"
        ? 27
        : 19;
  const shotDistance = Math.hypot(x - b.x, z - b.z);
  const flight = Math.max(0.2, shotDistance / speed);
  const lift =
    band === "normal"
      ? clamp((0.45 - b.y) / flight + 4.905 * flight, -5, 5)
      : loftedShotLift(
          shotDistance,
          speed,
          b.y,
          band === "mishit"
            ? m.field.goalHeight + 3
            : Math.min(1.65, m.field.goalHeight - 0.3),
          m.field.surface,
        );
  m.withTeam(p.team, () => m.kick(p, x, z, speed, lift));
  if (band !== "normal") b.spin = 0;
  m.lastShot = {
    style: "bicycle",
    bicycle: true,
    power,
    speed,
    lift,
    band,
    mishit: band === "mishit",
    contactAt: m.elapsed,
    target: { x, z: targetZ },
    actualTarget: { x, z },
  };
  m.lastAction = "bicycle";
  m.announce("BICICLETA!", 1.5);
  m.withTeam(p.team, () => m.cancelAction());
  p.ballAction = p.ballMotion = null;
}
export function celebrate(m, dt) {
  const team = m.lastGoalTeam ?? 1 - m.restartTeam;
  for (const p of m.players) {
    // Finish landing and getting up before the goal celebration begins.
    if (stepSpecial(m, p, dt)) {
      p.motion?.update(p, m, dt);
      continue;
    }
    p.celebration ||= { time: 0, won: p.team === team, style: p.id % 3 };
    const c = p.celebration;
    c.time += dt;
    p.vx = p.vz = 0;
    p.ballAction = p.ballMotion = p.rootWarp = null;
    p.motion?.update(p, m, dt);
  }
}
