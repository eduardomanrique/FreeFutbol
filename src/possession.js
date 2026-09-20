// Team possession persists through free flight until another team touches it.
export function possessionTeam(match) {
  return (
    match.setPiece?.team ??
    match.players[match.ball.owner]?.team ??
    match.ball.lastTeam
  );
}
