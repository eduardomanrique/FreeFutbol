export const CALIBRATION_STEPS = [
  ["pass", "A"],
  ["lob", "B"],
  ["shoot", "X"],
  ["through", "Y"],
  ["switch", "LB"],
  ["finesse", "RB"],
  ["jockey", "LT"],
  ["sprint", "RT"],
  ["pause", "Menu (☰)"],
];
export class Calibration {
  constructor() {
    this.index = 0;
    this.bindings = {};
    this.phase = "neutral";
    this.baseline = null;
    this.quiet = 0;
  }
  update(raw, dt) {
    if (!raw) return;
    const activeButtons = raw.buttons
      .map((v, i) => ({ v, i }))
      .filter((b) => b.v > 0.6);
    if (this.phase === "neutral") {
      // Capture rest values first: some triggers rest at -1 rather than zero.
      if (activeButtons.length) {
        this.quiet = 0;
        return;
      }
      if (!this.baseline) this.baseline = raw.axes.slice();
      if (
        raw.axes.some((v, i) => Math.abs(v - (this.baseline[i] ?? 0)) > 0.08)
      ) {
        this.baseline = raw.axes.slice();
        this.quiet = 0;
        return;
      }
      this.quiet += dt;
      if (this.quiet > 0.25) this.phase = "press";
      return;
    }
    const action = CALIBRATION_STEPS[this.index]?.[0];
    const used = new Set(
      Object.values(this.bindings).map((b) => JSON.stringify(b)),
    );
    let binding = activeButtons
      .map((b) => ({ button: b.i }))
      .find((b) => !used.has(JSON.stringify(b)));
    if (!binding && ["jockey", "sprint"].includes(action)) {
      const axis = raw.axes
        .map((v, i) => ({ i, change: v - (this.baseline[i] ?? 0) }))
        .find(
          (a) =>
            a.i > 1 &&
            Math.abs(a.change) > 0.65 &&
            !Object.values(this.bindings).some((b) => b.axis === a.i),
        );
      if (axis)
        binding = {
          axis: axis.i,
          rest: this.baseline[axis.i],
          sign: Math.sign(axis.change),
        };
    }
    if (this.phase === "press" && binding) {
      this.bindings[action] = binding;
      this.phase = "release";
    }
    if (this.phase === "release") {
      const b = this.bindings[action];
      const down =
        b.button !== undefined
          ? raw.buttons[b.button] > 0.25
          : Math.abs(raw.axes[b.axis] - b.rest) > 0.25;
      if (!down) {
        this.index++;
        this.phase = this.index === CALIBRATION_STEPS.length ? "done" : "press";
      }
    }
  }
}
