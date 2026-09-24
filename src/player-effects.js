import * as T from "three";
export class PlayerEffects {
  constructor(scene) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d");
    c.translate(32, 32);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2,
        r = i % 2 ? 12 : 27;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = "#ffe36a";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = "#d68027";
    c.stroke();
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    this.rows = Array.from({ length: 22 }, () => {
      const root = new T.Group();
      scene.add(root);
      const streaks = Array.from({ length: 6 }, (_, i) => {
        const m = new T.Mesh(
          new T.BoxGeometry(0.035, 0.035, 0.9 + i * 0.1),
          new T.MeshBasicMaterial({
            color: i % 2 ? "#d9ffff" : "#43e9ff",
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
        );
        root.add(m);
        return m;
      });
      const stars = Array.from({ length: 4 }, () => {
        const s = new T.Sprite(
          new T.SpriteMaterial({ map: tex, depthWrite: false }),
        );
        s.scale.setScalar(0.22);
        root.add(s);
        return s;
      });
      const ring = new T.Mesh(
        new T.TorusGeometry(0.38, 0.025, 4, 24),
        new T.MeshBasicMaterial({
          color: "#f9c54c",
          transparent: true,
          opacity: 0.7,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
      return { root, streaks, stars, ring };
    });
  }
  update(match, rigs) {
    this.rows.forEach((r) => (r.root.visible = false));
    for (const p of match.players) {
      const row = this.rows[p.id];
      if (!row) continue;
      row.root.visible = match.mode !== "home";
      row.root.position.set(p.x, 0, p.z);
      const speed = Math.hypot(p.vx, p.vz),
        heading = Math.atan2(p.vx, p.vz),
        t = match.elapsed;
      row.streaks.forEach((s, i) => {
        s.visible = !!p.topSpeed && speed > 7.5 && !p.knockdown;
        const side = (i % 2 ? 1 : -1) * (0.28 + Math.floor(i / 2) * 0.12),
          behind = -0.7 - ((t * 7 + i * 0.19) % 1);
        s.position.set(
          Math.cos(heading) * side + Math.sin(heading) * behind,
          0.35 + (i % 3) * 0.35,
          -Math.sin(heading) * side + Math.cos(heading) * behind,
        );
        s.rotation.y = heading;
      });
      const upset = p.knockdown || (p.celebration && !p.celebration.won);
      const clock = p.knockdown?.time ?? p.celebration?.time ?? t;
      const head = rigs?.[p.renderId ?? p.id]?.head;
      const anchor = head
        ? head.getWorldPosition(new T.Vector3())
        : new T.Vector3(p.x, 1.82, p.z);
      const height = anchor.y + 0.3;
      row.stars.forEach((s, i) => {
        s.visible = !!upset;
        const a = clock * 4 + (i * Math.PI) / 2;
        s.position.set(
          anchor.x - p.x + Math.cos(a) * 0.42,
          height + Math.sin(a * 2) * 0.06,
          anchor.z - p.z + Math.sin(a) * 0.42,
        );
        s.material.rotation = a * 0.3;
      });
      row.ring.visible = !!p.knockdown;
      row.ring.position.set(anchor.x - p.x, height, anchor.z - p.z);
    }
  }
}
