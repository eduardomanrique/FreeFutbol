// Tuned arcade coefficients, not laboratory measurements. Predictions and Rapier
// share these values so passes/receptions use the same surface as the live ball.
export const SURFACES = {
  grass: { roll: 5.8, bounce: 0.48, impact: 0.018 },
  sand: { roll: 7.5, bounce: 0.08, impact: 0.085 },
  court: { roll: 2.6, bounce: 0.64, impact: 0.009 },
  street: { roll: 3.2, bounce: 0.58, impact: 0.012 },
};
export const surfaceFor = (ball) => SURFACES[ball.surface] || SURFACES.grass;
export function rollingResistance(ball, speed) {
  const s = surfaceFor(ball);
  return (
    s.roll +
    0.085 * speed +
    (ball.surface === "sand" ? 9 / (1 + (speed / 3) ** 2) : 0)
  );
}
