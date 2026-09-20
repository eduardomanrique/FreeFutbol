import { stepBallMotion } from "./ball-physics.js";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function defensivePresser(players, team, ball, eligible = () => true) {
  const goalSide = team === 0 ? -1 : 1;
  const defenders = players.filter((p) => p.team === team && !p.keeper);
  const distance = (p) => Math.hypot(p.x - ball.x, p.z - ball.z);
  const ahead = (p) => (p.x - ball.x) * goalSide >= 0;
  const available = defenders
    .filter(eligible)
    .sort((a, b) => distance(a) - distance(b));
  // A nearby beaten defender can still contest. Otherwise protect the goal
  // with a player facing the attack, including a human-controlled defender.
  const close = available.find((p) => distance(p) <= 2.5);
  if (close) return close.id;
  if (defenders.some(ahead)) return available.find(ahead)?.id;
  return available[0]?.id;
}

export function defensiveTarget(p, ball, elapsed, difficulty = "normal") {
  const delay =
    difficulty === "easy" ? 0.3 : difficulty === "hard" ? 0.16 : 0.24;
  let memory = p.defensiveTracking;
  if (!memory || elapsed < memory[0].time || elapsed - memory.at(-1).time > 0.5)
    memory = p.defensiveTracking = [];
  memory.push({
    time: elapsed,
    x: ball.x,
    z: ball.z,
    vx: ball.vx,
    vz: ball.vz,
  });
  while (memory.length > 1 && memory[1].time <= elapsed - delay) memory.shift();
  const seen = memory[0];
  const goalSide = p.team === 0 ? -1 : 1;
  const goalGap = (p.x - seen.x) * goalSide;
  // Approach from the goal side; a beaten nearby player still contests the ball.
  return {
    x: seen.x + seen.vx * 0.1 + (goalGap > 1 ? goalSide * 0.7 : 0),
    z: seen.z + seen.vz * 0.1,
  };
}

// Home positions remain the anchors; only the designated presser/receiver
// leaves the block to contest the ball.
export function formationTarget(p, ball, attacking) {
  const dir = p.team === 0 ? 1 : -1;
  const progress = ball.x * dir;
  const advance = attacking
    ? clamp(9 + progress * 0.18, 5, 16)
    : clamp(-4 + progress * 0.12, -9, 0);
  const forward = p.homeX * dir >= -4;
  const depth =
    attacking && forward
      ? Math.max(p.homeX * dir + advance, progress + 4)
      : p.homeX * dir + advance;
  const x = clamp(dir * depth, -41, 41);
  const z =
    p.homeZ +
    clamp(
      ball.z * (attacking ? 0.22 : 0.38) - p.homeZ * (attacking ? 0 : 0.18),
      -8,
      8,
    );
  return { x, z: clamp(z, -27, 27) };
}

export function supportTargets(players, owner, ball) {
  const targets = new Map();
  if (!owner) return targets;
  // Nearby options close the passing distance; forwards stay ahead of the ball.
  const nearby = players
    .filter((p) => p.team === owner.team && !p.keeper && p.id !== owner.id)
    .map((p) => ({ p, base: formationTarget(p, ball, true) }))
    .filter(({ base }) => Math.hypot(base.x - ball.x, base.z - ball.z) < 34)
    .sort(
      (a, b) =>
        Math.hypot(a.base.x - ball.x, a.base.z - ball.z) -
        Math.hypot(b.base.x - ball.x, b.base.z - ball.z),
    )
    .slice(0, 3);
  const dir = owner.team === 0 ? 1 : -1;
  nearby.forEach(({ p, base }, i) => {
    const side = Math.sign(base.z - ball.z) || (i ? 1 : -1);
    targets.set(p.id, {
      x: clamp(
        base.x +
          clamp(
            ball.x +
              dir * (p.homeX * dir >= -4 ? 3 + i * 2 : -3 - i * 2) -
              base.x,
            -10,
            10,
          ),
        -41,
        41,
      ),
      z: clamp(
        base.z + clamp(ball.z + side * (i === 2 ? 8 : 5) - base.z, -10, 10),
        -27,
        27,
      ),
    });
  });
  return targets;
}

export function activePass(match) {
  const pass = match.lastPass;
  if (
    match.ball.owner !== null ||
    !pass ||
    pass.target == null ||
    pass.flight !== match.ballFlight ||
    match.elapsed - pass.contactAt > pass.receiveWindow
  )
    return null;
  return pass;
}

export function receptionTarget(p, ball, maxSpeed = 5.8) {
  const future = { ...ball };
  let best = null,
    bestGap = Infinity;
  // Integrate the same drag, curve, gravity and bounce model as the ball.
  // Reachability includes current momentum and a conservative acceleration.
  for (let i = 1; i <= 156; i++) {
    stepBallMotion(future, 1 / 60);
    const time = i / 60;
    if (future.y > 1.6 || Math.abs(future.x) > 44 || Math.abs(future.z) > 28)
      continue;
    const dx = future.x - p.x,
      dz = future.z - p.z;
    const distance = Math.hypot(dx, dz);
    const along = distance
      ? ((p.vx || 0) * dx + (p.vz || 0) * dz) / distance
      : 0;
    const reach = Math.max(
      0,
      Math.min(maxSpeed * time, along * time + 0.5 * 5 * time * time),
    );
    const gap = distance - reach - 0.55;
    if (gap < bestGap) {
      bestGap = gap;
      best = { x: future.x, z: future.z, time, distance };
    }
    if (gap <= 0) break;
  }
  if (!best)
    best = { x: clamp(ball.x, -44, 44), z: clamp(ball.z, -28, 28), time: 0.2 };
  const distance = Math.hypot(best.x - p.x, best.z - p.z);
  // Arrive with the ball, braking before crossing its reception point.
  best.speed = Math.min(
    maxSpeed,
    distance / Math.max(0.18, best.time),
    Math.sqrt(2 * 5 * Math.max(0, distance - 0.35)),
  );
  return best;
}
