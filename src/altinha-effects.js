import * as T from "three";
export class AltinhaEffects {
  constructor(scene) {
    this.root = new T.Group();
    scene.add(this.root);
    this.particles = Array.from({ length: 36 }, (_, i) => {
      const mesh = new T.Mesh(
        i % 2
          ? new T.OctahedronGeometry(0.06)
          : new T.BoxGeometry(0.05, 0.12, 0.025),
        new T.MeshBasicMaterial({
          color: "#ffcc66",
          transparent: true,
          depthWrite: false,
        }),
      );
      this.root.add(mesh);
      return mesh;
    });
    this.rings = Array.from({ length: 3 }, () => {
      const r = new T.Mesh(
        new T.RingGeometry(0.88, 1, 48),
        new T.MeshBasicMaterial({
          color: "#ffcc66",
          side: T.DoubleSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      r.rotation.x = -Math.PI / 2;
      this.root.add(r);
      return r;
    });
    this.landing = new T.Mesh(
      new T.RingGeometry(0.15, 0.2, 32),
      new T.MeshBasicMaterial({
        color: "#fff0af",
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.65,
      }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.root.add(this.landing);
  }
  update(m) {
    const s = m.altinha;
    this.root.visible = !!m.field.altinha && m.mode !== "home";
    if (!this.root.visible) return;
    this.landing.position.set(m.ball.x, 0.022, m.ball.z);
    this.landing.scale.setScalar(0.9 + m.ball.y * 0.15);
    const e = s?.effect,
      age = e ? m.elapsed - e.at : 99,
      active = age >= 0 && age < 1.1;
    this.particles.forEach((p, i) => {
      p.visible = active && i < 12 + Math.min(24, (e?.combo || 0) * 4);
      if (!p.visible) return;
      const a = i * 2.399 + e.variant * 0.8,
        r = age * (0.8 + (i % 5) * 0.24);
      const spiral = e.variant === 3 ? age * 5 : 0;
      p.position.set(
        e.x + Math.cos(a + spiral) * r,
        e.y + age * (1 + (i % 3) * 0.3) - age * age * 2,
        e.z + Math.sin(a + spiral) * r,
      );
      p.rotation.set(age * 4, a, age * 5);
      p.scale.setScalar(e.variant === 1 ? 1.5 : 1);
      p.material.color.setHSL(((e.hue + i * 8) % 360) / 360, 0.85, 0.67);
      p.material.opacity = 1 - age / 1.1;
    });
    this.rings.forEach((r, i) => {
      const t = age - i * 0.12;
      r.visible = active && t >= 0 && (e.variant % 2 === 0 || i === 0);
      if (!r.visible) return;
      r.position.set(e.x, 0.026 + i * 0.005, e.z);
      r.scale.setScalar(0.3 + t * (1.6 + i * 0.3));
      r.material.color.setHSL(((e.hue + i * 30) % 360) / 360, 0.8, 0.7);
      r.material.opacity = Math.max(0, (1 - t) * 0.6);
    });
  }
}
