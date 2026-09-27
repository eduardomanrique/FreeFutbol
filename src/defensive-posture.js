import { motionAction } from "./action-state.js";

// Pose only: this never changes movement intent, acceleration or foot contacts.
export function defensivePosture(p, match) {
  if (
    p.keeper ||
    p.header ||
    p.slide ||
    p.knockdown ||
    p.bicycle ||
    p.evade ||
    p.altinhaPose ||
    p.volleyPending ||
    motionAction(p) ||
    p.ballMotion?.kind === "strike" ||
    p.celebration
  )
    return 0;
  const b = match.ball;
  if (match.field?.footvolley) {
    const f = match.footvolley;
    if (!f || !["serve", "rally"].includes(f.phase)) return 0;
    return (f.lastTeam ?? f.serving) !== p.team ? 1 : 0;
  }
  if (match.field?.altinha) return 0;
  const carrier =
    b.owner != null
      ? match.players.find((q) => q.id === b.owner)
      : match.players.find(
          (q) =>
            q.team === b.lastTeam && Math.hypot(q.x - b.x, q.z - b.z) < 1.5,
        );
  if (!carrier || carrier.team === p.team) return 0;
  const dx = carrier.x - p.x,
    dz = carrier.z - p.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.1 || distance > 6) return 0;
  const heading = p.locomotion?.heading ?? Math.atan2(p.dx, p.dz);
  if ((dx * Math.sin(heading) + dz * Math.cos(heading)) / distance < 0.25)
    return 0;
  const goalX = (p.team === 0 ? -1 : 1) * match.field.halfLength;
  if (dx * (goalX - p.x) + dz * -p.z >= 0) return 0;
  return Math.min(1, (6 - distance) / 1.5);
}
