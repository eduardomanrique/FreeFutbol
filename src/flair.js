// Cosmetic only: independent lottery, no gameplay RNG or ball/action changes.
export function tryFlair(m, p, kind, roll) {
  if (
    m.field.altinha ||
    p.keeper ||
    p.recovery ||
    p.shield ||
    p.slide ||
    p.knockdown ||
    m.setPiece ||
    m.foul ||
    Math.hypot(p.vx, p.vz) > 4.2 ||
    m.elapsed < (p.flairUntil ?? -1) ||
    !["pass", "receive"].includes(kind)
  )
    return false;
  if (
    m.players.some(
      (q) => q.team !== p.team && Math.hypot(q.x - p.x, q.z - p.z) < 2.4,
    )
  )
    return false;
  // A separate deterministic draw means visual variation never consumes a match roll.
  const sequence = (p.flairSequence ?? 0) + 1;
  p.flairSequence = sequence;
  const n =
    Math.sin((p.id + 1) * 127.1 + sequence * 311.7 + m.elapsed * 17.17) *
    43758.5453;
  const chance =
    m.field.surface === "sand" ? 0.19 : m.variant === "street" ? 0.15 : 0.08;
  if ((roll ?? n - Math.floor(n)) >= chance) return false;
  p.flair = {
    kind:
      kind === "pass" ? "no-look" : m.ball.y > 1.1 ? "soft-chest" : "open-foot",
    at: m.elapsed,
    side: sequence % 2 ? 1 : -1,
    foot: p.ballMotion?.foot ?? sequence % 2,
    duration: 0.55,
  };
  p.flairUntil = m.elapsed + 9;
  return true;
}
