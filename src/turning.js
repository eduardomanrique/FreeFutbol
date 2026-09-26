import { preferredFoot } from "./footedness.js";
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const feetDown = (p) => p.locomotion.feet.reduce((n, f) => n + f.landings, 0);
export function cancelTurnForShot(p, released = false) {
  const a = p.turnAction;
  const recent = !!a && p.locomotion.time - a.startedAt <= 0.16;
  p.turnAction = null;
  p.turnIntent = null;
  p.locomotion.cutBlend = 0;
  if (recent) p.locomotion.yawVelocity = 0;
  if (
    (a || released) &&
    p.ballMotion?.kind === "dribble" &&
    !p.ballMotion.hit
  ) {
    p.locomotion.feet[p.ballMotion.foot].special = null;
    p.ballMotion = null;
  }
  return recent;
}
function exitPush(p, a) {
  if (!a.pendingPush || !p.locomotion.feet[1 - a.touchFoot].contact) return;
  const speed = Math.hypot(p.vx, p.vz) * 0.94;
  const oldX = p.vx,
    oldZ = p.vz;
  p.vx = Math.sin(a.pendingPush.heading) * speed;
  p.vz = Math.cos(a.pendingPush.heading) * speed;
  p.locomotion.turnImpulse = {
    foot: 1 - a.touchFoot,
    x: p.vx - oldX,
    z: p.vz - oldZ,
    at: p.locomotion.time,
  };
  a.pendingPush = null;
}
export function planTurn(p, b, vx, vz) {
  if (
    !p.locomotion ||
    p.field?.altinha ||
    p.field?.footvolley ||
    p.sprintFirstTouch
  ) {
    p.turnAction = null;
    return { x: vx, z: vz };
  }
  const now = p.locomotion.time,
    request = Math.hypot(vx, vz),
    speed = Math.hypot(p.vx, p.vz);
  const wanted = Math.atan2(vx, vz);
  if (now < (p.shotInputUntil || 0) && p.ballAction?.type === "shoot") {
    if (request > 0.15 && Math.abs(wrap(wanted - p.ballAction.heading)) > 0.5)
      p.ballAction.noTurn = true;
    p.turnAction = null;
    return {
      x: Math.sin(p.ballAction.heading) * request,
      z: Math.cos(p.ballAction.heading) * request,
    };
  }
  let a = p.turnAction;
  if (
    a &&
    (request < 0.1 ||
      Math.abs(wrap(wanted - a.requestHeading)) > 0.3 ||
      now - a.startedAt > 2.6)
  )
    p.turnAction = a = null;
  if (
    !a &&
    p.lastDribble &&
    request > 0.1 &&
    speed > 0.8 &&
    now > (p.nextTurnAt || 0)
  ) {
    const origin =
      Math.hypot(b.vx, b.vz) > 0.5
        ? Math.atan2(b.vx, b.vz)
        : Math.atan2(p.vx, p.vz);
    let delta = wrap(wanted - origin);
    if (Math.abs(delta) > 0.5) {
      if (p.ballAction?.stage === "charging") p.ballAction.noTurn = false;
      const reverse = Math.abs(delta) > 2.75;
      if (reverse && preferredFoot(p) === 0 && delta < 0) delta += 2 * Math.PI;
      if (reverse && preferredFoot(p) === 1 && delta > 0) delta -= 2 * Math.PI;
      const split = !reverse && speed > 4.2 && Math.abs(delta) > 1.18;
      a = p.turnAction = {
        kind: reverse ? "reverse" : split ? "two-cuts" : "cut",
        phase:
          reverse && Math.hypot(b.x - p.x, b.z - p.z) > 1.05
            ? "approach"
            : "plant",
        commitAt: now + 0.075,
        startHeading: p.locomotion.heading,
        startedAt: now,
        requestHeading: wanted,
        origin,
        delta,
        segments: split
          ? Math.max(2, Math.round(Math.abs(delta) / (Math.PI / 4)))
          : 1,
        segment: 0,
        running: speed > 4.2,
        supportFoot: reverse ? 1 - preferredFoot(p) : delta > 0 ? 0 : 1,
        touchFoot: preferredFoot(p, delta > 0 ? 1 : 0),
        startLandings: feetDown(p),
        contactAt: null,
      };
    }
  }
  if (!a) return { x: vx, z: vz };
  if (a.phase === "approach" && Math.hypot(b.x - p.x, b.z - p.z) <= 1.05)
    a.phase = "plant";
  if (a.phase === "approach") {
    a.bodyHeading = a.startHeading;
    return { x: Math.sin(a.origin) * request, z: Math.cos(a.origin) * request };
  }
  exitPush(p, a);
  if (
    a.phase === "plant" &&
    p.locomotion.feet[a.supportFoot].contact &&
    p.locomotion.feet[a.supportFoot].age > 0.025
  )
    a.phase = "touch";
  if (a.phase === "settle") {
    const steps = feetDown(p) - a.contactLandings;
    a.shortSteps = steps;
    if (steps >= (a.running ? 2 : 0) && p.locomotion.feet[a.touchFoot].contact)
      a.phase = "pivot";
  }
  const heading =
    a.kind === "reverse"
      ? a.origin + a.delta
      : a.origin + (a.delta * Math.min(a.segment + 1, a.segments)) / a.segments;
  a.exitHeading = heading;
  a.bodyHeading = ["plant", "touch"].includes(a.phase)
    ? a.origin + (a.delta * (a.segment + 0.12)) / a.segments
    : a.kind === "reverse" && ["settle", "touch"].includes(a.phase)
      ? a.origin + a.delta * 0.5
      : heading;
  if (a.phase === "exit" || a.phase === "pivot") {
    if (
      now - a.contactAt > 0.55 &&
      (a.kind !== "reverse" ||
        p.vx * Math.sin(heading) + p.vz * Math.cos(heading) >= 0) &&
      Math.abs(wrap(p.locomotion.heading - heading)) < 0.35
    ) {
      p.nextTurnAt = now + 0.3;
      p.turnAction = null;
    }
  }
  return { x: Math.sin(heading) * request, z: Math.cos(heading) * request };
}
export function turnContact(p) {
  const a = p.turnAction;
  if (!a || a.phase !== "touch") return;
  a.contactAt = p.locomotion.time;
  a.contactLandings = feetDown(p);
  if (a.kind !== "reverse") {
    a.pendingPush = { heading: a.exitHeading };
    exitPush(p, a);
  }
  a.segment++;
  if (a.kind === "reverse") a.phase = "settle";
  else a.phase = a.segment < a.segments ? "plant" : "exit";
}
