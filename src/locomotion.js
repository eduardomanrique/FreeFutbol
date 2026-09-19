import { stepBodyExpression } from "./body-expression.js";
// Reduced-order character physics, in metres / seconds / newtons.
// Only feet in contact may accelerate the centre of mass horizontally.
const G = 9.81,
  MASS = 78,
  MU = 0.98;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const LEG_LENGTH = 0.86;
export const athleteScale = (id) => 1.12 + (id % 4) * 0.012;
function positionBeside(p, side, heading, forward = 0) {
  const width = 0.115 * athleteScale(p.id);
  return {
    x: p.x + Math.cos(heading) * side * width + Math.sin(heading) * forward,
    z: p.z - Math.sin(heading) * side * width + Math.cos(heading) * forward,
  };
}
export function initLocomotion(p) {
  const heading = Math.atan2(p.dx ?? 0, p.dz ?? 1),
    scale = athleteScale(p.id);
  const feet = [-1, 1].map((side) => {
    const pos = positionBeside(p, side, heading);
    return {
      ...pos,
      y: 0.098 * scale,
      heading,
      side,
      contact: true,
      age: 0,
      normalForce: (MASS * G) / 2,
      phase: 0,
      from: { ...pos },
      to: { ...pos },
      fromHeading: heading,
      duration: 0.2,
      landings: 0,
    };
  });
  p.locomotion = {
    mass: MASS,
    height: 1.1,
    vy: 0,
    heading,
    yawVelocity: 0,
    feet,
    clock: 0,
    nextFoot: 1,
    moving: false,
    time: 0,
    stepCount: 0,
    grounded: true,
    ax: 0,
    az: 0,
    normalForce: MASS * G,
    fx: 0,
    fz: 0,
    frictionLimit: MU * MASS * G,
    leanX: 0,
    leanZ: 0,
    leanVX: 0,
    leanVZ: 0,
    supportX: p.x,
    supportZ: p.z,
    loadShift: 0,
    lastX: p.x,
    lastZ: p.z,
    mode: "idle",
    captureX: p.x,
    captureZ: p.z,
  };
  return p.locomotion;
}
function lift(p, foot, duration, settle = false) {
  const l = p.locomotion;
  foot.contact = false;
  foot.phase = 0;
  foot.age = 0;
  foot.duration = duration;
  foot.from = { x: foot.x, y: foot.y, z: foot.z };
  foot.fromHeading = foot.heading;
  foot.settle = settle;
  foot.to = positionBeside(p, foot.side, l.heading);
  l.stepCount++;
}
// Schedule contact on a free foot; if both feet are planted, lift the older
// support. A foot that has just landed cannot instantly strike again.
export function ballMotionDuration(p, kind, power = 0) {
  const speed = Math.hypot(p.vx, p.vz);
  return kind === "dribble"
    ? clamp(0.24 - speed * 0.009, 0.14, 0.24)
    : p.ballAction?.quickTouch
      ? 0.16
      : clamp(0.34 + 0.05 * power - speed * 0.026, 0.16, 0.4);
}
export const strikePlantDuration = (p) =>
  clamp(0.18 - Math.hypot(p.vx, p.vz) * 0.006, 0.12, 0.18);
export function startBallMotion(
  p,
  target,
  kind,
  power = 0,
  { preferredFoot = null, urgent = false } = {},
) {
  const l = p.locomotion;
  if (p.ballMotion || !l) return false;
  if (kind === "strike" && p.ballAction?.requiresPlant) {
    let plant = p.strikePlant;
    if (!plant) {
      // Standing is not an exception: reuse an already valid grounded support.
      const ready = l.feet
        .map((f, i) => ({ f, i }))
        .filter(({ f, i }) => {
          const d = Math.hypot(f.x - target.x, f.z - target.z),
            other = l.feet[1 - i];
          return (
            f.contact &&
            !f.special &&
            d >= 0.16 &&
            d <= 0.65 &&
            !other.special &&
            (!other.contact || other.age >= 0.075)
          );
        })
        .sort((a, b) => a.f.age - b.f.age)[0];
      if (ready) {
        ready.f.special = "plant";
        p.strikePlant = plant = {
          foot: ready.i,
          target: { x: ready.f.x, z: ready.f.z },
          reused: true,
        };
      }
    }
    if (!plant) {
      // Prefer the left support/right strike, but use the current stance when
      // the other leg is already airborne. Never teleport a planted shoe.
      const support = l.feet.findIndex((f) => !f.contact && !f.special);
      const index = support >= 0 ? support : 1;
      const foot = l.feet[index],
        other = l.feet[1 - index];
      if (!other.contact || foot.special) return false;
      const offset = 0.28 * foot.side;
      const goal = {
        x: target.x + Math.cos(l.heading) * offset,
        z: target.z - Math.sin(l.heading) * offset,
      };
      const duration = strikePlantDuration(p);
      if (
        Math.hypot(
          goal.x - p.x - p.vx * duration,
          goal.z - p.z - p.vz * duration,
        ) > (Math.hypot(p.vx, p.vz) > 2 ? 0.78 : 1.05)
      )
        return false;
      lift(p, foot, duration);
      foot.special = "plant";
      p.strikePlant = plant = { foot: index, target: goal };
      return false;
    }
    const support = l.feet[plant.foot];
    if (!support.contact) return false;
    if (Math.hypot(support.x - target.x, support.z - target.z) > 0.65) {
      support.special = null;
      p.strikePlant = null;
      return false;
    }
    const foot = l.feet[1 - plant.foot];
    if (p.ballAction.stage === "charging") {
      if (!foot.special) {
        lift(p, foot, 0.24);
        foot.special = "windup";
      }
      return false;
    }
    if (foot.special === "windup") foot.special = null;
    if (foot.special) return false;
    lift(p, foot, ballMotionDuration(p, kind, power));
    foot.special = "ball";
    p.ballMotion = {
      kind,
      power,
      foot: 1 - plant.foot,
      target: { ...target },
      hit: false,
      style: p.ballAction?.style?.name,
      heading: l.heading,
    };
    return true;
  }
  const eligible = (f) =>
    preferredFoot === null || urgent || l.feet[preferredFoot] === f;
  let foot = [...l.feet]
    .sort(
      (a, b) =>
        (l.feet.indexOf(b) === preferredFoot ? 1 : 0) -
        (l.feet.indexOf(a) === preferredFoot ? 1 : 0),
    )
    .find(
      (f) =>
        eligible(f) &&
        !f.contact &&
        !f.special &&
        f.phase < 0.75 &&
        l.feet.some((o) => o !== f && o.contact),
    );
  if (!foot) {
    const candidates = l.feet.filter(
      (f) =>
        eligible(f) &&
        f.contact &&
        f.age >= 0.075 &&
        !f.special &&
        l.feet.some((o) => o !== f && o.contact),
    );
    candidates.sort(
      (a, b) =>
        (l.feet.indexOf(b) === preferredFoot ? 1 : 0) -
          (l.feet.indexOf(a) === preferredFoot ? 1 : 0) || b.age - a.age,
    );
    foot = candidates[0];
  }
  if (!foot) return false;
  const duration = ballMotionDuration(p, kind, power);
  lift(p, foot, duration);
  foot.special = "ball";
  p.ballMotion = {
    kind,
    power,
    foot: l.feet.indexOf(foot),
    target: { ...target },
    hit: false,
    style: p.ballAction?.style?.name,
    heading: l.heading,
  };
  return true;
}
export function stepLocomotion(
  p,
  targetX,
  targetZ,
  dt,
  { charging = false, charge = 0, reach = null } = {},
) {
  let l = p.locomotion;
  if (!l || Math.hypot(p.x - l.lastX, p.z - l.lastZ) > 1.5)
    l = initLocomotion(p);
  if (p.strikePlant && !p.ballAction && !p.ballMotion) {
    l.feet[p.strikePlant.foot].special = null;
    p.strikePlant = null;
  }
  l.time += dt;
  l.impact = Math.max(0, (l.impact || 0) - dt * 2.5);
  l.preparation =
    (l.preparation || 0) +
    ((charging ? charge : 0) - (l.preparation || 0)) * (1 - Math.exp(-dt * 10));
  const preparation = l.preparation;
  const speed = Math.hypot(p.vx, p.vz),
    desiredSpeed = Math.hypot(targetX, targetZ);
  const turnIntent = p.turnIntent;
  const turnSpeed = Math.hypot(turnIntent?.x || 0, turnIntent?.z || 0);
  const turnDot =
    turnSpeed > 0.2 && speed > 0.7
      ? (p.vx * turnIntent.x + p.vz * turnIntent.z) / (speed * turnSpeed)
      : 1;
  const cutDemand = clamp((0.7 - turnDot) / 1.7, 0, 1) * clamp(speed / 3, 0, 1);
  l.cutBlend =
    (l.cutBlend || 0) +
    (cutDemand - (l.cutBlend || 0)) *
      (1 - Math.exp(-dt * (cutDemand > (l.cutBlend || 0) ? 16 : 5)));
  const cutting = l.cutBlend > 0.08 && turnSpeed > 0.2;
  const stopping = desiredSpeed < 0.08;
  const agile = !!p.closeControl && speed < 4.2;
  const running = speed > 3.0 && !agile;
  const cruising = running && p.sprintRequested === false && !p.ballAction;
  const interval =
    (agile ? 0.73 : 1) *
    clamp(0.39 - speed * 0.022, 0.205, 0.39) *
    (1 + 0.3 * preparation) *
    0.9;
  l.strideInterval = interval;
  l.strideReach = 0.4 + 0.15 * preparation;
  const flight = running
    ? cruising
      ? 0.006
      : clamp(0.02 + (speed - 3) * 0.005, 0.02, 0.052)
    : -0.075;
  const swingDuration = interval + flight;
  const contactDuration = interval - flight;
  // Turn the body with bounded angular velocity. Planted shoe orientation stays fixed.
  const wantedHeading =
    cutting && !Number.isFinite(p.faceHeading)
      ? Math.atan2(turnIntent.x, turnIntent.z)
      : agile && desiredSpeed > 0.2 && !Number.isFinite(p.faceHeading)
        ? Math.atan2(targetX, targetZ)
        : Number.isFinite(p.faceHeading)
          ? p.faceHeading
          : speed > 0.5
            ? Math.atan2(p.vx, p.vz)
            : desiredSpeed > 1
              ? Math.atan2(targetX, targetZ)
              : l.heading;
  const yawError = angle(l.heading, wantedHeading);
  const yawTarget = clamp(
    yawError * (agile ? 13 : 8),
    agile ? -9 : -5.5,
    agile ? 9 : 5.5,
  );
  l.yawVelocity += (yawTarget - l.yawVelocity) * (1 - Math.exp(-dt * 14));
  l.heading += l.yawVelocity * dt;
  const plantKick = speed < 7 && l.feet[0].contact;
  for (const foot of l.feet) {
    if (foot.special === "windup" && !p.ballAction) {
      lift(p, foot, 0.2);
      foot.special = "recover";
    }
  }
  if (
    p.kick > 0 &&
    !p.ballMotion &&
    !l.wasKicking &&
    plantKick &&
    !l.feet[1].special
  ) {
    lift(p, l.feet[1], 0.22 + 0.09 * (p.shotPower || 0));
    l.feet[1].special = "strike";
  }
  l.wasKicking = p.kick > 0;
  if (reach && !charging && p.kick <= 0 && !l.feet.some((f) => f.special)) {
    const side =
      (reach.x - p.x) * Math.cos(l.heading) -
      (reach.z - p.z) * Math.sin(l.heading);
    const i = side > 0 ? 1 : 0,
      foot = l.feet[i];
    if (l.feet[1 - i].contact) {
      lift(
        p,
        foot,
        reach.kind === "near" ? 0.15 : reach.kind === "far" ? 0.28 : 0.2,
      );
      foot.special = "reach";
      foot.reachTarget = { ...reach };
    }
  }
  if (desiredSpeed > 0.18 || speed > 0.28) {
    if (!l.moving) {
      l.moving = true;
      l.clock = interval;
    }
    l.clock += dt;
    if (l.clock >= interval) {
      let i = l.nextFoot;
      if (
        !l.feet.some((f) => f.special === "ball" || f.special === "plant") &&
        l.feet[i].contact &&
        l.feet[i].age >= Math.min(0.12, contactDuration * 0.6) &&
        (l.feet[1 - i].contact ||
          (running &&
            !l.feet[1 - i].special &&
            (1 - l.feet[1 - i].phase) * l.feet[1 - i].duration <
              (cruising ? 0.012 : 0.05)))
      ) {
        lift(p, l.feet[i], swingDuration);
        l.clock = 0;
        l.nextFoot = 1 - i;
      }
    }
  } else {
    l.moving = false;
    l.clock = 0;
    // A final placement catches the body after braking; don't drag feet into rest.
    if (l.feet.every((f) => f.contact && !f.special)) {
      const misplaced = l.feet.find((f) => {
        const rest = positionBeside(p, f.side, l.heading);
        return (
          Math.hypot(f.x - rest.x, f.z - rest.z) > 0.13 ||
          Math.abs(angle(f.heading, l.heading)) > 0.35
        );
      });
      if (misplaced) lift(p, misplaced, 0.22, true);
    }
  }
  for (const foot of l.feet) {
    foot.previous = { x: foot.x, y: foot.y, z: foot.z };
    if (foot.contact) {
      foot.age += dt;
      continue;
    }
    foot.phase = Math.min(1, foot.phase + dt / foot.duration);
    const remaining = (1 - foot.phase) * foot.duration;
    if (foot.special === "plant" && p.strikePlant) {
      const t = smooth(foot.phase);
      foot.x = foot.from.x + (p.strikePlant.target.x - foot.from.x) * t;
      foot.z = foot.from.z + (p.strikePlant.target.z - foot.from.z) * t;
      foot.y = 0.098 * athleteScale(p.id) + Math.sin(Math.PI * t) * 0.12;
      if (foot.phase >= 1) {
        foot.contact = true;
        foot.age = 0;
        foot.landings++;
      }
      continue;
    }
    if (foot.special === "ball" && p.ballMotion) {
      const m = p.ballMotion;
      const contactPhase = 0.62;
      if (foot.phase <= contactPhase) {
        const t = smooth(foot.phase / contactPhase);
        foot.x = foot.from.x + (m.target.x - foot.from.x) * t;
        foot.z = foot.from.z + (m.target.z - foot.from.z) * t;
        if (m.style === "backheel") {
          const wind = Math.sin(Math.PI * t) * 0.6;
          foot.x += Math.sin(m.heading) * wind;
          foot.z += Math.cos(m.heading) * wind;
        }
        foot.y =
          foot.from.y +
          (0.15 - foot.from.y) * t +
          Math.sin(Math.PI * t) *
            (m.kind === "dribble" ? 0.06 : 0.18 + 0.12 * m.power);
      } else {
        const t = smooth((foot.phase - contactPhase) / (1 - contactPhase));
        const follows = m.kind === "strike" && m.hit && m.style !== "backheel";
        const rest = positionBeside(
          p,
          foot.side,
          l.heading,
          follows ? 0.16 + 0.12 * m.power : 0,
        );
        const extension = follows
          ? Math.sin(Math.PI * t) * (0.18 + 0.18 * m.power)
          : 0;
        foot.x =
          m.target.x +
          (rest.x - m.target.x) * t +
          Math.sin(m.heading) * extension;
        foot.z =
          m.target.z +
          (rest.z - m.target.z) * t +
          Math.cos(m.heading) * extension;
        foot.y =
          0.15 +
          Math.sin(Math.PI * t) *
            (m.kind === "dribble" ? 0.07 : 0.22 + 0.2 * m.power);
      }
      foot.heading = l.heading;
      if (foot.phase >= 1) {
        foot.special = null;
        foot.contact = true;
        foot.age = 0;
        foot.landings++;
        foot.y = 0.098 * athleteScale(p.id);
        p.ballMotion = null;
      }
      continue;
    }
    if (foot.special === "reach") {
      if (reach && foot.phase < 0.6) foot.reachTarget = { ...reach };
      const target = foot.reachTarget,
        dx = target.x - p.x,
        dz = target.z - p.z;
      const factor = Math.min(
        1,
        (foot.reachTarget.maxReach || 0.82) /
          Math.max(0.001, Math.hypot(dx, dz)),
      );
      foot.to = { x: p.x + dx * factor, z: p.z + dz * factor };
      if (foot.phase > 0.55) {
        const recover = smooth((foot.phase - 0.55) / 0.45);
        const rest = positionBeside(p, foot.side, l.heading);
        foot.to.x += (rest.x - foot.to.x) * recover;
        foot.to.z += (rest.z - foot.to.z) * recover;
      }
    } else if (foot.special) {
      const forward =
        foot.special === "windup"
          ? -0.18 - 0.24 * preparation
          : foot.special === "strike"
            ? 0.25 + 0.27 * (p.shotPower || 0)
            : 0;
      foot.to = positionBeside(p, foot.side, l.heading, forward);
    } else if (foot.phase < 0.8) {
      const offset = positionBeside(p, foot.side, l.heading);
      let leadX = foot.settle
        ? 0
        : p.vx * contactDuration * 0.38 + (p.vx - targetX) * 0.04;
      let leadZ = foot.settle
        ? 0
        : p.vz * contactDuration * 0.38 + (p.vz - targetZ) * 0.04;
      const leadLength = Math.hypot(leadX, leadZ),
        limit = l.strideReach;
      if (leadLength > limit) {
        leadX *= limit / leadLength;
        leadZ *= limit / leadLength;
      }
      foot.to = {
        x: offset.x + p.vx * remaining + leadX,
        z: offset.z + p.vz * remaining + leadZ,
      };
    }
    const t = smooth(
      foot.special === "reach" ? Math.min(1, foot.phase / 0.55) : foot.phase,
    );
    foot.x = foot.from.x + (foot.to.x - foot.from.x) * t;
    foot.z = foot.from.z + (foot.to.z - foot.from.z) * t;
    foot.y =
      0.098 * athleteScale(p.id) +
      Math.sin(Math.PI * foot.phase) *
        (foot.settle
          ? 0.06
          : (0.1 + Math.min(speed * 0.018, 0.16)) * (cruising ? 0.65 : 1));
    foot.heading = foot.fromHeading + angle(foot.fromHeading, l.heading) * t;
    if (foot.special === "windup") {
      foot.y =
        0.098 * athleteScale(p.id) +
        smooth(foot.phase) * (0.12 + 0.17 * preparation);
      continue;
    }
    if (foot.phase >= 1) {
      if (foot.special === "reach") p.reachCooldown = 0.22;
      foot.special = null;
      foot.contact = true;
      foot.age = 0;
      foot.settle = false;
      foot.y = 0.098 * athleteScale(p.id);
      foot.landings++;
    }
  }
  let contacts = l.feet.filter((f) => f.contact);
  // Lift an over-extended trailing leg. It cannot keep applying force from an
  // impossible anchor. This is a contact transition, never a moved ground anchor.
  for (const foot of contacts) {
    if (
      Math.hypot(foot.x - p.x, foot.z - p.z) > 0.6 + 0.06 * preparation &&
      l.moving &&
      foot.special !== "plant"
    ) {
      const other = l.feet.find((f) => f !== foot);
      // A trailing support at full extension requires an early recovery landing
      // from the free leg, rather than a long unsupported drop of the body.
      if (
        !other.contact &&
        other.special !== "windup" &&
        other.special !== "ball"
      )
        other.duration = Math.min(
          other.duration,
          (cruising ? 0.02 : 0.06) / Math.max(0.01, 1 - other.phase),
        );
      // When the COM is already low, land the free recovery leg before
      // releasing the last support; repeated unsupported steps otherwise collapse it.
      if (!other.contact && !other.special && l.height < 0.9) {
        other.duration = Math.min(
          other.duration,
          0.012 / Math.max(0.01, 1 - other.phase),
        );
        continue;
      }
      lift(p, foot, Math.max(0.13, swingDuration * 0.75));
    }
  }
  contacts = l.feet.filter((f) => f.contact);
  l.grounded = contacts.length > 0;
  l.airTime = l.grounded ? 0 : (l.airTime || 0) + dt;
  if (l.airTime > 0.055) {
    // Catch the COM with the recovering leg, without shortening the ball-contact
    // trajectory or inventing a horizontal force during flight.
    const catchFoot = l.feet.find((f) => !f.contact && !f.special);
    if (catchFoot)
      catchFoot.duration = Math.min(
        catchFoot.duration,
        0.025 / Math.max(0.01, 1 - catchFoot.phase),
      );
  }

  const desiredHeight =
    1.1 -
    (agile ? 0.075 : 0) -
    (running ? (cruising ? 0.01 : 0.025) : 0) -
    Math.min(0.2, 0.13 * l.cutBlend + (l.expression?.crouch || 0)) -
    (stopping && speed > 1 ? 0.045 : 0);
  const normal = l.grounded
    ? clamp(
        MASS * G + MASS * (175 * (desiredHeight - l.height) - 23 * l.vy),
        0,
        2.8 * MASS * G,
      )
    : 0;
  const rightX = Math.cos(l.heading),
    rightZ = -Math.sin(l.heading);
  const supportSide =
    contacts.length === 1
      ? (contacts[0].x - p.x) * rightX + (contacts[0].z - p.z) * rightZ
      : 0;
  const lateralSpeed = p.vx * rightX + p.vz * rightZ;
  const desiredLateral = targetX * rightX + targetZ * rightZ;
  const balanceAcceleration =
    contacts.length === 1 && speed > 0.5
      ? clamp(supportSide * 18 - (lateralSpeed - desiredLateral) * 3, -2.2, 2.2)
      : 0;
  const demandX =
      (targetX - p.vx) * (agile ? 12 : 7.5) + rightX * balanceAcceleration,
    demandZ =
      (targetZ - p.vz) * (agile ? 12 : 7.5) + rightZ * balanceAcceleration;
  const demand = Math.hypot(demandX, demandZ);
  l.frictionLimit = MU * normal;
  // Propulsion tapers with speed; brakes and turns retain their traction limit.
  const gainingSpeed =
    targetX * p.vx + targetZ * p.vz >= 0 && desiredSpeed > speed + 0.1;
  const driveLimit = gainingSpeed
    ? clamp(7.55 + 2.2 * (p.sprintLaunch || 0) - speed * 0.28, 4.5, 9.75)
    : 12;
  const maxAcceleration = Math.min(l.frictionLimit / MASS, driveLimit);
  const factor = demand > 0 ? Math.min(1, maxAcceleration / demand) : 0;
  l.ax = demandX * factor;
  l.az = demandZ * factor;
  l.fx = l.ax * MASS;
  l.fz = l.az * MASS;
  l.normalForce = normal;
  p.vx += l.ax * dt;
  p.vz += l.az * dt;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  l.vy += (normal / MASS - G) * dt;
  l.height += l.vy * dt;
  // Support weights are force distribution, not two independent body lifts.
  let total = 0;
  for (const foot of l.feet) {
    foot.normalForce = foot.contact
      ? 1 / (0.12 + Math.hypot(foot.x - p.x, foot.z - p.z))
      : 0;
    total += foot.normalForce;
  }
  l.supportX = 0;
  l.supportZ = 0;
  for (const foot of l.feet) {
    foot.normalForce = total ? (foot.normalForce / total) * normal : 0;
    const weight = normal ? foot.normalForce / normal : 0;
    l.supportX += foot.x * weight;
    l.supportZ += foot.z * weight;
  }
  if (!l.grounded) {
    l.supportX = p.x;
    l.supportZ = p.z;
  }
  l.captureX = p.x + p.vx * Math.sqrt(Math.max(0.1, l.height) / G);
  l.captureZ = p.z + p.vz * Math.sqrt(Math.max(0.1, l.height) / G);
  const supportLeanX = clamp((p.x - l.supportX) * 0.35, -0.08, 0.08),
    supportLeanZ = clamp((p.z - l.supportZ) * 0.35, -0.08, 0.08);
  const leanTargetX = clamp(
    Math.atan2(l.ax, G) * (0.55 + 0.32 * (p.sprintLaunch || 0)) + supportLeanX,
    -0.4,
    0.4,
  );
  const leanTargetZ = clamp(
    Math.atan2(l.az, G) * (0.55 + 0.32 * (p.sprintLaunch || 0)) + supportLeanZ,
    -0.4,
    0.4,
  );
  l.leanVX += (80 * (leanTargetX - l.leanX) - 16 * l.leanVX) * dt;
  l.leanVZ += (80 * (leanTargetZ - l.leanZ) - 16 * l.leanVZ) * dt;
  l.leanX += l.leanVX * dt;
  l.leanZ += l.leanVZ * dt;
  l.loadShift = normal
    ? (l.feet[1].normalForce - l.feet[0].normalForce) / normal
    : 0;
  l.mode = !l.grounded
    ? "flight"
    : stopping && speed > 0.3
      ? "braking"
      : Math.abs(l.yawVelocity) > 1
        ? "turning"
        : speed > 4.2
          ? "running"
          : speed > 0.2
            ? "walking"
            : "idle";
  p.dx = Math.sin(l.heading);
  p.dz = Math.cos(l.heading);
  p.phase = (l.time * Math.PI * 2) / (interval * 2);
  stepBodyExpression(p, dt);
  l.lastX = p.x;
  l.lastZ = p.z;
}
export function locomotionSnapshot(p) {
  const l = p.locomotion;
  if (!l) return null;
  return {
    mode: l.mode,
    cutBlend: l.cutBlend || 0,
    expression: l.expression,
    mass: l.mass,
    centreOfMass: { x: p.x, y: l.height, z: p.z },
    velocity: { x: p.vx, y: l.vy, z: p.vz },
    force: { x: l.fx, y: l.normalForce, z: l.fz },
    frictionLimit: l.frictionLimit,
    grounded: l.grounded,
    lean: { x: l.leanX, z: l.leanZ },
    support: { x: l.supportX, z: l.supportZ },
    stepCount: l.stepCount,
    preparation: l.preparation || 0,
    strideInterval: l.strideInterval,
    strideReach: l.strideReach,
    impact: l.impact || 0,
    reaching: l.feet.some((f) => f.special === "reach"),
    feet: l.feet.map((f) => ({
      x: f.x,
      y: f.y,
      z: f.z,
      contact: f.contact,
      heading: f.heading,
      load: f.normalForce,
      landings: f.landings,
      phase: f.phase,
      action: f.special || null,
    })),
  };
}
