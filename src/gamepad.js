// Xbox positions as normalized by the browser's standard Gamepad mapping.
export const BUTTONS = {
  pass: 0,
  shoot: 2,
  lob: 1,
  cancel: 1,
  through: 3,
  finesse: 5,
  jockey: 6,
  switch: 4,
  sprint: 7,
  back: 8,
  pause: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
};
export function radialStick(x = 0, z = 0, deadzone = 0.15) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const length = Math.hypot(x, z);
  if (length <= deadzone) return { x: 0, z: 0 };
  const strength = Math.min(1, (length - deadzone) / (1 - deadzone));
  return { x: (x / length) * strength, z: (z / length) * strength };
}
export class ControllerInput {
  constructor(
    read = () =>
      globalThis.__campoUseNativeGamepads
        ? (globalThis.__campoNativeGamepads ?? [])
        : (navigator.getGamepads?.() ?? []),
  ) {
    this.read = read;
    this.identity = null;
    this.previous = {};
    this.blocked = true;
    try {
      this.profiles = JSON.parse(
        globalThis.localStorage?.getItem("campo-controller-profiles") || "{}",
      );
    } catch {
      this.profiles = {};
    }
    this.state = {
      connected: false,
      supported: false,
      x: 0,
      z: 0,
      held: {},
      pressed: {},
      released: {},
    };
  }
  saveProfile(id, bindings) {
    this.profiles[id] = bindings;
    try {
      globalThis.localStorage?.setItem(
        "campo-controller-profiles",
        JSON.stringify(this.profiles),
      );
    } catch {}
    this.suspend();
  }
  suspend() {
    this.blocked = true;
    this.previous = {};
  }
  poll() {
    let pads;
    try {
      pads = Array.from(this.read()).filter((p) => p && p.connected);
    } catch {
      pads = [];
    }
    const identity = (p) => `${p.index}:${p.id}`;
    const pad = pads.find((p) => identity(p) === this.identity) ?? pads[0];
    const oldIdentity = this.identity;
    this.identity = pad ? identity(pad) : null;
    const changed = oldIdentity !== this.identity;
    if (changed) this.suspend();
    const profile = this.profiles[pad?.id];
    // Never treat a raw Bluetooth report as Xbox button indices.
    const supported = !!pad && (pad.mapping === "standard" || !!profile);
    const bindings = profile ? { ...profile, cancel: profile.lob } : BUTTONS;
    const raw = pad
      ? {
          buttons: pad.buttons.map((b) =>
            Math.max(b.value || 0, b.pressed ? 1 : 0),
          ),
          axes: Array.from(pad.axes),
        }
      : null;
    const held = {},
      pressed = {},
      released = {};
    let stick = { x: 0, z: 0 };
    if (supported) {
      for (const [action, binding] of Object.entries(bindings)) {
        if (binding == null) continue;
        if (typeof binding === "number")
          held[action] = (raw.buttons[binding] ?? 0) > 0.5;
        else if (binding.button !== undefined)
          held[action] = (raw.buttons[binding.button] ?? 0) > 0.5;
        else
          held[action] =
            ((raw.axes[binding.axis] ?? binding.rest) - binding.rest) *
              binding.sign >
            0.5;
      }
      stick = radialStick(pad.axes[0], pad.axes[1]);
      if (held.left || held.right || held.up || held.down)
        stick = radialStick(
          Number(held.right) - Number(held.left),
          Number(held.down) - Number(held.up),
          0,
        );
      if (
        this.blocked &&
        !Object.values(held).some(Boolean) &&
        Math.hypot(stick.x, stick.z) === 0
      )
        this.blocked = false;
      if (!this.blocked)
        for (const action of Object.keys(bindings)) {
          pressed[action] = held[action] && !this.previous[action];
          released[action] = !held[action] && !!this.previous[action];
        }
    }
    this.previous = held;
    this.state = {
      connected: !!pad,
      raw,
      calibrated: !!profile,
      supported,
      changed,
      disconnected: oldIdentity !== null && changed,
      id: pad?.id ?? "",
      mapping: pad?.mapping ?? "",
      index: pad?.index ?? null,
      x: this.blocked ? 0 : stick.x,
      z: this.blocked ? 0 : stick.z,
      held: this.blocked ? {} : held,
      pressed,
      released,
    };
    return this.state;
  }
}
