import { stepBallMotion } from "./ball-physics.js";
export const RECEPTION = {
  body: { probability: 0.999, radius: 0.48, height: 1.9, reach: 0.45 },
  near: { probability: 0.98, radius: 0.85, height: 0.75, reach: 0.82 },
  medium: { probability: 0.95, radius: 1.3, height: 0.65, reach: 1.08 },
  far: { probability: 0.9, radius: 2.25, height: 0.65, reach: 1.08 },
};
// Owned balls require a short, present-time challenge, not a predicted reception.
export const POSSESSION_CHALLENGE = {
  radius: 0.7,
  height: 0.5,
  reach: 0.55,
  contact: 0.22,
};
// Classify the approaching ball relative to the moving receiver.
// Reachable free balls invite reception independently of directional input.
export function receptionOpportunity(p, b, input = {}) {
  if (
    b.owner === p.id ||
    (b.owner !== null && b.lastTeam === p.team) ||
    Math.hypot(b.x - p.x, b.z - p.z) > 6
  )
    return null;
  if (b.owner !== null) {
    const distance = Math.hypot(b.x - p.x, b.z - p.z);
    if (
      distance > POSSESSION_CHALLENGE.radius ||
      b.y > POSSESSION_CHALLENGE.height
    )
      return null;
    return {
      x: b.x,
      y: b.y,
      z: b.z,
      distance,
      time: 0,
      kind: "near",
      probability: RECEPTION.near.probability,
      maxReach: POSSESSION_CHALLENGE.reach,
    };
  }
  const future = { ...b };
  let best = null;
  for (let i = 0; i <= 20; i++) {
    const time = i / 60;
    const distance = Math.hypot(
      future.x - p.x - p.vx * time,
      future.z - p.z - p.vz * time,
    );
    if (future.y <= 1.9 && (!best || distance < best.distance))
      best = { x: future.x, y: future.y, z: future.z, distance, time: i / 60 };
    stepBallMotion(future, 1 / 60);
  }
  if (!best) return null;
  const kind = Object.keys(RECEPTION).find(
    (k) =>
      best.distance <= RECEPTION[k].radius && best.y <= RECEPTION[k].height,
  );
  if (!kind) return null;
  return {
    ...best,
    kind,
    probability: RECEPTION[kind].probability,
    maxReach: RECEPTION[kind].reach,
  };
}
export function receptionRoll(opportunity, random = Math.random) {
  return random() < opportunity.probability;
}
// Swept proximity, evaluated before rigid-body collision can rebound a fast pass.
export function receptionContact(p, b, kind, dt) {
  const dx = b.vx * dt,
    dz = b.vz * dt,
    rx = b.x - p.x,
    rz = b.z - p.z;
  const t = Math.max(
    0,
    Math.min(1, -(rx * dx + rz * dz) / Math.max(1e-8, dx * dx + dz * dz)),
  );
  if (kind === "medium" || kind === "far") {
    const contact = p.locomotion?.feet.some((f) => {
      const fx = f.x + Math.sin(f.heading) * 0.075,
        fz = f.z + Math.cos(f.heading) * 0.075;
      const rx = b.x - fx,
        rz = b.z - fz;
      const u = Math.max(
        0,
        Math.min(1, -(rx * dx + rz * dz) / Math.max(1e-8, dx * dx + dz * dz)),
      );
      return (
        Math.hypot(
          rx + dx * u,
          rz + dz * u,
          b.y + b.vy * dt * u - (f.y - 0.025),
        ) < 0.34
      );
    });
    if (!contact) return false;
  }
  const radius = kind === "far" ? 1.12 : RECEPTION[kind].radius;
  return (
    Math.hypot(rx + dx * t, rz + dz * t) <= radius &&
    b.y + b.vy * dt * t <= RECEPTION[kind].height
  );
}

// Reduce failed friendly traps and passive lane interceptions by 80%.
// Body collisions remain physical; active defenders still have to reach the ball.
export function passReceptionProbability(p, opportunity, intent, passingTeam) {
  if (p.team === passingTeam) return 1 - (1 - opportunity.probability) * 0.2;
  if (opportunity.kind === "body") return opportunity.probability;
  const ix = intent?.x || 0,
    iz = intent?.z || 0;
  const toward = ix * (opportunity.x - p.x) + iz * (opportunity.z - p.z);
  return Math.hypot(ix, iz) > 0.15 && toward > 0
    ? 1
    : opportunity.probability * 0.2;
}
