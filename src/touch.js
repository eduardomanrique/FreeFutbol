// Pointer capture allows independent thumbs and reliable release outside a button.
export class TouchInput {
  constructor(root, { active, press, release, cancel, rotated }) {
    this.x = this.z = 0;
    this.held = {};
    this.pointers = new Map();
    this.root = root;
    this.cancel = cancel;
    const stick = root.querySelector(".touch-stick");
    const knob = stick.querySelector("i");
    this.knob = knob;
    this.stick = stick;
    const move = (e) => {
      if (this.pointers.get(e.pointerId) !== "move") return;
      const box = stick.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const radius = stick.clientWidth / 2 - 22;
      let x = rotated() ? dy : dx,
        z = rotated() ? -dx : dy;
      const length = Math.hypot(x, z);
      const scale = Math.min(1, radius / (length || 1));
      x *= scale;
      z *= scale;
      knob.style.transform = `translate(${x}px, ${z}px)`;
      const strength = Math.max(
        0,
        (Math.min(1, length / radius) - 0.12) / 0.88,
      );
      this.x = length ? (x / (length * scale)) * strength : 0;
      this.z = length ? (z / (length * scale)) * strength : 0;
      // Hysteresis prevents sprint flicker near the outer ring.
      if (strength >= 0.9) this.held.sprint = true;
      else if (strength < 0.78) delete this.held.sprint;
      stick.classList.toggle("sprinting", !!this.held.sprint);
    };
    root.addEventListener("contextmenu", (e) => e.preventDefault());
    root.addEventListener("pointerdown", (e) => {
      const target = e.target.closest("[data-touch]");
      if (!target || !active() || (e.pointerType === "mouse" && e.button !== 0))
        return;
      e.preventDefault();
      const action = target.dataset.touch;
      if ([...this.pointers.values()].includes(action)) return;
      target.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, action);
      target.classList.add("held");
      if (action === "move") move(e);
      else {
        this.held[action] = true;
        press(action);
      }
    });
    root.addEventListener("pointermove", move);
    const end = (e) => {
      const action = this.pointers.get(e.pointerId);
      if (!action) return;
      this.pointers.delete(e.pointerId);
      root.querySelector(`[data-touch="${action}"]`).classList.remove("held");
      if (action === "move") {
        this.x = this.z = 0;
        delete this.held.sprint;
        stick.classList.remove("sprinting");
        knob.style.transform = "";
      } else {
        delete this.held[action];
        if (e.type === "pointerup") release(action);
        else cancel(action);
      }
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      root.addEventListener(event, end);
  }
  reset() {
    this.pointers.clear();
    this.x = this.z = 0;
    this.held = {};
    this.knob.style.transform = "";
    this.stick.classList.remove("sprinting");
    this.root
      .querySelectorAll(".held")
      .forEach((el) => el.classList.remove("held"));
    this.cancel();
  }
}
