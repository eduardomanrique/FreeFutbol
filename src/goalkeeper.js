import { stepBallMotion } from "./ball-physics.js";
import { initLocomotion } from "./locomotion.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export function predictKeeperIntercept(p, b) {
  const dir = p.team === 0 ? 1 : -1,
    plane = p.x + dir * 0.35;
  if (b.owner !== null || b.vx * dir >= -1 || (b.x - plane) * dir < 0)
    return null;
  const f = { ...b };
  for (let t = 1 / 120; t <= 1.2; t += 1 / 120) {
    const old = { ...f };
    stepBallMotion(f, 1 / 120);
    if ((f.x - plane) * dir <= 0) {
      const u = clamp((plane - old.x) / (f.x - old.x || 1), 0, 1);
      return {
        x: plane,
        y: mix(old.y, f.y, u),
        z: mix(old.z, f.z, u),
        time: t - 1 / 120 + u / 120,
      };
    }
  }
  return null;
}
export function keeperControl(p, b, time) {
  const dir = p.team === 0 ? 1 : -1;
  const g = (p.goalkeeping ||= {
    mode: "set",
    height: 1.02,
    roll: 0,
    hands: [],
    previousHands: [],
  });
  const prediction = predictKeeperIntercept(p, b);
  g.prediction = prediction;
  if (
    g.mode === "set" &&
    !g.holding &&
    time > (g.cooldown || 0) &&
    prediction &&
    prediction.time < 0.65 &&
    Math.abs(prediction.z) < 4.5 &&
    prediction.y < 3.1
  ) {
    g.mode = "prepare";
    g.start = time;
    g.origin = { x: p.x, z: p.z };
    g.target = prediction;
    g.side = Math.sign(prediction.z - p.z) || 1;
    g.duration = clamp(prediction.time - 0.26, 0.14, 0.56);
    const reach = Math.abs(prediction.z - p.z) > 0.6 ? 0.75 : 0;
    g.vz = clamp((prediction.z - g.side * reach - p.z) / g.duration, -3.7, 3.7);
    g.vx = 0;
    const targetHeight = clamp(
      prediction.y - (prediction.y > 1.65 ? 0.65 : 0.35),
      0.36,
      1.65,
    );
    g.vy = clamp(
      (targetHeight - 1.02 + 0.5 * 9.81 * g.duration * g.duration) / g.duration,
      -2.2,
      4.8,
    );
    g.maxRoll = reach ? g.side * dir * (prediction.y > 1.65 ? 0.95 : 1.35) : 0;
    g.result = null;
  }
  // Cover the angle; never chase the ball to the corner before its flight arrives.
  const x = -dir * 43.6,
    z = clamp((b.z * 2.4) / Math.max(3, Math.abs(b.x + dir * 46)), -2.8, 2.8);
  return {
    x: g.mode === "set" ? x : p.x,
    z: g.mode === "set" ? z : p.z,
    speed: g.holding ? 0 : 3.8,
  };
}
export function stepKeeper(p, b, time, dt) {
  const g = p.goalkeeping,
    dir = p.team === 0 ? 1 : -1;
  if (!g) return;
  g.previousHands = g.hands.map((h) => ({ ...h }));
  p.locomotion.heading = (dir * Math.PI) / 2;
  p.dx = dir;
  p.dz = 0;
  if (g.mode === "prepare") {
    p.vx = p.vz = 0;
    g.height = 1.02 - 0.13 * smooth((time - g.start) / 0.26);
    if (time - g.start >= 0.26) {
      g.mode = "dive";
      g.launch = time;
      g.origin = { x: p.x, z: p.z };
    }
  }
  if (g.mode === "dive") {
    const t = time - g.launch;
    p.x = g.origin.x + g.vx * t;
    p.z = g.origin.z + g.vz * t;
    p.vx = g.vx;
    p.vz = g.vz;
    g.height = 1.02 + g.vy * t - 0.5 * 9.81 * t * t;
    g.roll = g.maxRoll * smooth(t / Math.min(0.2, g.duration));
    if (g.height <= 0.36 && t > 0.12) {
      g.height = 0.36;
      g.mode = "recover";
      g.landed = time;
      g.landRoll = g.roll;
      g.origin = { x: p.x, z: p.z };
    }
  }
  if (g.mode === "recover") {
    const t = time - g.landed,
      u = smooth((t - 0.18) / 0.55);
    p.vx = 0;
    p.vz = g.vz * Math.exp(-t * 12);
    p.z = g.origin.z + (g.vz * (1 - Math.exp(-t * 12))) / 12;
    g.height = mix(0.36, 1.02, u);
    g.roll = g.landRoll * (1 - u);
    if (t > 0.78) {
      g.mode = "set";
      g.cooldown = time + 0.18;
      g.roll = 0;
      if (!g.holding) g.result = null;
      initLocomotion(p);
    }
  }
  if (g.mode === "set") {
    g.height = 1.02;
    g.roll = 0;
  }
  p.locomotion.lastX = p.x;
  p.locomotion.lastZ = p.z;
  // The same bounded palm targets drive contact tests and rendered arm IK.
  const lateral = -Math.sin(g.roll),
    up = Math.cos(g.roll);
  const reaching = (g.mode === "dive" || g.mode === "prepare") && !g.holding;
  const target = reaching
    ? g.target
    : { x: p.x + dir * 0.4, y: g.mode === "recover" ? 0.15 : 1.05, z: p.z };
  g.hands = [1, -1].map((side) => {
    const localSide = side * 0.2;
    const shoulder = {
      x: p.x,
      y: g.height + up * 0.43 + Math.sin(g.roll) * localSide,
      z: p.z - dir * (lateral * 0.43 + up * localSide),
    };
    let dx = target.x - shoulder.x,
      dy = target.y - shoulder.y,
      dz = target.z + side * 0.085 - shoulder.z;
    const distance = Math.hypot(dx, dy, dz),
      scale = Math.min(1, 0.64 / Math.max(0.001, distance));
    return {
      x: shoulder.x + dx * scale,
      y: Math.max(0.09, shoulder.y + dy * scale),
      z: shoulder.z + dz * scale,
    };
  });
}
export function keeperHandContact(p, b, dt) {
  const g = p.goalkeeping;
  if (
    !g ||
    g.holding ||
    g.result ||
    !["prepare", "dive", "set"].includes(g.mode)
  )
    return -1;
  return g.hands.findIndex((h, i) => {
    const before = g.previousHands[i] || h;
    const rx = b.x - h.x,
      ry = b.y - h.y,
      rz = b.z - h.z;
    const dx = b.vx * dt - (h.x - before.x),
      dy = b.vy * dt - (h.y - before.y),
      dz = b.vz * dt - (h.z - before.z);
    const t = clamp(
      -(rx * dx + ry * dy + rz * dz) /
        Math.max(1e-9, dx * dx + dy * dy + dz * dz),
      0,
      1,
    );
    return Math.hypot(rx + dx * t, ry + dy * t, rz + dz * t) < 0.23;
  });
}
