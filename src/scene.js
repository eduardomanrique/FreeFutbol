import { followCamera } from "./camera.js";
import {
  buildSkinnedAthlete,
  animateSkinnedAthlete,
} from "./skinned-athlete.js";
import { athleteGeometries, buildAthlete, animateAthlete } from "./athlete.js";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...extra });
export class Stadium {
  constructor(container, assets) {
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#a8b6ac");
    this.scene.fog = new THREE.Fog("#9daea0", 135, 270);
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.3, 350);
    this.camera.position.set(64, 77, 88);
    this.look = new THREE.Vector3(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight("#dce8f1", "#56773c", 2.15));
    this.sun = new THREE.DirectionalLight("#ffdfaf", 3.1);
    this.sun.position.set(-52, 65, -38);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -72,
      right: 72,
      top: 63,
      bottom: -63,
      near: 1,
      far: 190,
    });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.buildPitch();
    this.buildStands();
    this.buildGoals();
    this.buildPlayers();
    this.buildBall();
    this.quality = "high";
    this.cameraMode = "broadcast";
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }
  mesh(geometry, material, x = 0, y = 0, z = 0) {
    let m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }
  box(w, h, d, material, x, y, z) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  }
  texture(canvas) {
    let t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  buildPitch() {
    let canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1408;
    let c = canvas.getContext("2d"),
      w = canvas.width,
      h = canvas.height;
    let seed = 123;
    function rng() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    c.fillStyle = "#397039";
    c.fillRect(0, 0, w, h);
    let sx = w / 108,
      sz = h / 74;
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? "#427e3f" : "#397538";
      c.fillRect((8 + (i * 92) / 16) * sx, 7 * sz, (92 / 16) * sx + 1, 60 * sz);
    }
    for (let i = 0; i < 260000; i++) {
      let x = rng() * w,
        y = rng() * h;
      c.fillStyle =
        rng() > 0.5 ? "rgba(180,196,97,.075)" : "rgba(15,47,18,.10)";
      c.fillRect(x, y, 1, rng() * 3 + 1);
    }
    c.save();
    c.translate(w / 2, h / 2);
    c.scale(sx, sz);
    c.strokeStyle = "#e1e8cf";
    c.lineWidth = 0.12;
    c.strokeRect(-46, -30, 92, 60);
    c.beginPath();
    c.moveTo(0, -30);
    c.lineTo(0, 30);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 9.15, 0, Math.PI * 2);
    c.stroke();
    const spot = (x, z, r = 0.16) => {
      c.beginPath();
      c.arc(x, z, r, 0, Math.PI * 2);
      c.fillStyle = "#e9ead6";
      c.fill();
    };
    spot(0, 0);
    for (let s of [-1, 1]) {
      c.strokeRect(s === 1 ? 29.5 : -46, -20.16, 16.5, 40.32);
      c.strokeRect(s === 1 ? 40.5 : -46, -9.16, 5.5, 18.32);
      spot(s * 35, 0);
      c.beginPath();
      c.arc(
        s * 35,
        0,
        9.15,
        s === 1 ? Math.PI - 0.925 : -0.925,
        s === 1 ? Math.PI + 0.925 : 0.925,
      );
      c.stroke();
      for (let z of [-30, 30]) {
        c.beginPath();
        c.arc(s * 46, z, 1, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
    const texture = this.texture(canvas);
    const ground = this.mesh(
      new THREE.PlaneGeometry(108, 74),
      mat("#ffffff", { map: texture }),
      0,
      0,
      0,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.box(200, 0.5, 160, mat("#445448"), 0, -0.34, 0);
    const white = mat("#dddccd");
    for (let x of [-46, 46])
      for (let z of [-30, 30]) {
        this.mesh(
          new THREE.CylinderGeometry(0.028, 0.028, 1.55, 6),
          white,
          x,
          0.78,
          z,
        );
        let flag = this.mesh(
          new THREE.PlaneGeometry(0.65, 0.38),
          mat("#e4db8a", { side: THREE.DoubleSide }),
          x + 0.3,
          1.35,
          z,
        );
        flag.rotation.y = 0.3;
      }
  }
  buildStands() {
    const concrete = mat("#777d74"),
      dark = mat("#263933"),
      roofMat = mat("#d5d7cc"),
      edge = mat("#a4b0a2");
    const terraces = [];
    for (let row = 0; row < 15; row++) {
      let y = 0.7 + row * 0.65,
        z = 36 + row * 0.94;
      for (let s of [-1, 1]) {
        let g = new THREE.BoxGeometry(112, 0.7, 0.96);
        g.translate(0, y, s * z);
        terraces.push(g);
      }
      for (let s of [-1, 1]) {
        let g = new THREE.BoxGeometry(0.96, 0.7, 69);
        g.translate(s * (54 + row * 0.94), y, 0);
        terraces.push(g);
      }
    }
    let terrace = this.mesh(mergeGeometries(terraces), concrete);
    terrace.receiveShadow = true;
    terraces.forEach((g) => g.dispose());
    let seats = [];
    for (let row = 0; row < 15; row++) {
      let y = 1.2 + row * 0.65;
      for (let s of [-1, 1])
        for (let col = 0; col < 132; col++) {
          if (col % 22 < 2) continue;
          seats.push({
            x: -54 + col * 0.82,
            y,
            z: s * (36 + row * 0.94),
            angle: s === 1 ? Math.PI : 0,
            row,
            col,
          });
        }
      for (let s of [-1, 1])
        for (let col = 0; col < 82; col++) {
          if (col % 20 < 2) continue;
          seats.push({
            x: s * (54 + row * 0.94),
            y,
            z: -33 + col * 0.82,
            angle: (s * Math.PI) / 2,
            row,
            col,
          });
        }
    }
    let seatGeo = new THREE.BoxGeometry(0.63, 0.42, 0.52),
      inst = new THREE.InstancedMesh(seatGeo, mat("#ffffff"), seats.length),
      o = new THREE.Object3D();
    seats.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.rotation.y = s.angle;
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
      let patterned =
        (Math.floor(s.col / 11) + Math.floor(s.row / 5)) % 4 === 0;
      inst.setColorAt(
        i,
        new THREE.Color(
          patterned ? "#d7d8c8" : s.row % 3 === 0 ? "#476653" : "#27493b",
        ),
      );
    });
    this.scene.add(inst);
    for (let s of [-1, 1]) {
      this.box(115, 1.9, 0.4, dark, 0, 10.8, s * 50.3);
      this.box(0.4, 1.9, 72, dark, s * 68.3, 10.8, 0);
    } // Only far roof: no foreground obstruction.
    let roof = this.box(124, 0.5, 12, roofMat, 0, 15, -46);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    for (let x = -58; x <= 58; x += 11.6) {
      let pole = this.mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 16, 6),
        edge,
        x,
        7.5,
        -49,
      );
      pole.castShadow = true;
      let beam = this.box(0.18, 0.22, 14, dark, x, 14.4, -44);
      beam.rotation.x = 0.09;
    }
    this.box(124, 0.7, 0.25, dark, 0, 15.2, -39.8);
    // Advertising panels share one atlas texture and a single merged mesh.
    let ac = document.createElement("canvas");
    ac.width = 2048;
    ac.height = 128;
    let ctx = ac.getContext("2d");
    ctx.fillStyle = "#142e24";
    ctx.fillRect(0, 0, 2048, 128);
    ctx.textBaseline = "middle";
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#e7e8d9" : "#c4f58a";
      ctx.font = "bold 43px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        i % 2 ? "THE BEAUTIFUL GAME" : "◈ CAMPO",
        i * 256 + 128,
        64,
        224,
      );
    }
    let admat = mat("#ffffff", {
      map: this.texture(ac),
      emissive: "#b4c7a0",
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });
    for (let s of [-1, 1]) {
      let ad = this.mesh(
        new THREE.PlaneGeometry(105, 1.1),
        admat,
        0,
        0.65,
        s * 33,
      );
      if (s === 1) ad.rotation.y = Math.PI;
      let side = this.mesh(
        new THREE.PlaneGeometry(65, 1.1),
        admat,
        s * 50,
        0.65,
        0,
      );
      side.rotation.y = (-s * Math.PI) / 2;
    }
    // Static floodlights and camera towers.
    for (let x of [-60, 60])
      for (let z of [-42, 42]) {
        this.mesh(new THREE.CylinderGeometry(0.2, 0.38, 25, 8), dark, x, 12, z);
        let light = this.box(
          5,
          1.8,
          0.35,
          mat("#e5e5cd", { emissive: "#e5e5ce", emissiveIntensity: 0.5 }),
          x,
          24,
          z,
        );
        light.rotation.x = 0.2;
      }
    // Technical area, benches and sideline markings.
    for (let x of [-15, 15]) {
      let cover = this.box(
        8,
        2,
        0.12,
        mat("#89a4a1", { transparent: true, opacity: 0.35 }),
        x,
        1.2,
        35,
      );
      cover.rotation.x = -0.2;
      this.box(8, 0.15, 2.1, dark, x, 2.2, 35.7);
      this.box(8, 0.35, 0.6, edge, x, 0.65, 35.6);
    }
  }
  buildGoals() {
    const posts = mat("#f0f0e2");
    let lines = [];
    for (let s of [-1, 1]) {
      let x = s * 46,
        back = s * 48.1;
      for (let z of [-3.66, 3.66]) {
        this.mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 2.44, 10),
          posts,
          x,
          1.22,
          z,
        ).castShadow = true;
        let bar = this.mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8),
          posts,
          (x + back) / 2,
          2.44,
          z,
        );
        bar.rotation.z = Math.PI / 2;
        for (let y = 0; y <= 2.44; y += 0.2) {
          lines.push(x, y, z, back, y, z);
        }
        for (let a = 0; a <= 2.1; a += 0.2) {
          lines.push(x + s * a, 0, z, x + s * a, 2.44, z);
        }
      }
      let cross = this.mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 7.32, 12),
        posts,
        x,
        2.44,
        0,
      );
      cross.rotation.x = Math.PI / 2;
      cross.castShadow = true;
      for (let z = -3.66; z <= 3.67; z += 0.22) {
        lines.push(back, 0, z, back, 2.44, z, x, 2.44, z, back, 2.44, z);
      }
      for (let y = 0; y <= 2.44; y += 0.2)
        lines.push(back, y, -3.66, back, y, 3.66);
      for (let a = 0; a <= 2.1; a += 0.22)
        lines.push(x + s * a, 2.44, -3.66, x + s * a, 2.44, 3.66);
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    this.scene.add(
      new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: "#e2e4da",
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
  }
  buildPlayers() {
    if (this.assets) {
      this.rigs = Array.from({ length: 22 }, (_, i) => {
        const rig = buildSkinnedAthlete(this.assets, i);
        this.scene.add(rig.root);
        return rig;
      });
      this.partBuckets = {};
      this.instances = {};
    } else {
      this.rigs = [];
      this.partBuckets = {};
      const geometries = athleteGeometries();
      for (let i = 0; i < 22; i++) {
        const rig = buildAthlete(i);
        this.rigs.push(rig);
        const parts = rig.parts;
        for (let p of parts) {
          if (!this.partBuckets[p.key]) this.partBuckets[p.key] = [];
          this.partBuckets[p.key].push(p);
        }
      }
      this.instances = {};
      for (let [key, parts] of Object.entries(this.partBuckets)) {
        let m = new THREE.InstancedMesh(
          geometries[key],
          mat("#ffffff"),
          parts.length,
        );
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        parts.forEach((p, i) => m.setColorAt(i, new THREE.Color(p.color)));
        m.castShadow = true;
        m.frustumCulled = false;
        this.scene.add(m);
        this.instances[key] = m;
      }
    }
    this.ring = this.mesh(
      new THREE.RingGeometry(0.6, 0.73, 32),
      new THREE.MeshBasicMaterial({ color: "#c4ff80", side: THREE.DoubleSide }),
      0,
      0.025,
      0,
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.marker = this.mesh(
      new THREE.ConeGeometry(0.24, 0.38, 3),
      new THREE.MeshBasicMaterial({ color: "#c4ff80" }),
    );
    this.marker.rotation.z = Math.PI;
  }
  buildBall() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4f1e5";
    ctx.fillRect(0, 0, 512, 256);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 5; col++) {
        const x = (col + (row % 2) * 0.5) * 102,
          y = 32 + row * 95;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k * Math.PI * 2) / 5 - 0.5;
          const px = x + 25 * Math.cos(a),
            py = y + 25 * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = "#1e2924";
        ctx.fill();
        ctx.strokeStyle = "#78837c";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    this.ballMesh = this.mesh(
      new THREE.SphereGeometry(0.11, 24, 16),
      mat("#ffffff", { map: this.texture(canvas) }),
    );
    this.ballMesh.castShadow = true;
    this.ballShadow = this.mesh(
      new THREE.CircleGeometry(0.15, 16),
      new THREE.MeshBasicMaterial({
        color: "#172b16",
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
      0,
      0.014,
      0,
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
  }
  setQuality(q) {
    this.quality = q;
    let ratio =
      q === "low"
        ? 1
        : q === "medium"
          ? Math.min(devicePixelRatio, 1.25)
          : Math.min(devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = q !== "low";
    this.sun.shadow.mapSize.set(
      q === "high" ? 2048 : 1024,
      q === "high" ? 2048 : 1024,
    );
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }
  resize() {
    // Layout dimensions are already in the logical landscape coordinate system.
    // A transformed bounding box can belong to the previous orientation mid-resize.
    const parent = this.renderer.domElement.parentElement;
    this.viewWidth = Math.max(1, parent.clientWidth);
    this.viewHeight = Math.max(1, parent.clientHeight);
    this.renderer.setSize(this.viewWidth, this.viewHeight, false);
    this.camera.aspect = this.viewWidth / this.viewHeight;
    this.camera.updateProjectionMatrix();
  }
  render(match, dt = 0.016) {
    const container = this.renderer.domElement.parentElement;
    if (
      container.clientWidth !== this.viewWidth ||
      container.clientHeight !== this.viewHeight
    )
      this.resize();
    let playing = match.mode !== "home";
    for (let i = 0; i < 22; i++) {
      if (this.rigs[i].type === "skinned")
        animateSkinnedAthlete(this.rigs[i], match.players[i], match);
      else
        animateAthlete(
          this.rigs[i],
          match.players[i],
          match,
          match.mode === "paused" ? 0 : dt,
        );
    }
    for (let [key, parts] of Object.entries(this.partBuckets)) {
      let mesh = this.instances[key];
      parts.forEach((p, i) => mesh.setMatrixAt(i, p.node.matrixWorld));
      mesh.instanceMatrix.needsUpdate = true;
    }
    let p = match.players[match.selected];
    this.ring.position.set(p.x, 0.025, p.z);
    this.marker.position.set(p.x, 2.9, p.z);
    this.ring.visible = playing;
    this.marker.visible = playing;
    this.ballMesh.position.set(match.ball.x, match.ball.y, match.ball.z);
    this.ballMesh.rotation.x += (match.ball.vz * dt) / 0.11;
    this.ballMesh.rotation.z -= (match.ball.vx * dt) / 0.11;
    this.ballShadow.position.set(match.ball.x, 0.018, match.ball.z);
    this.ballShadow.material.opacity = 0.32 / (1 + match.ball.y * 0.3);
    this.ballShadow.scale.setScalar(1 + match.ball.y * 0.15);
    followCamera(
      this.camera,
      this.look,
      {
        ball: match.ball,
        playing,
        wide: this.cameraMode === "tactical",
        mobile: document.body.classList.contains("mobile"),
        width: this.viewWidth,
      },
      dt,
    );
    this.renderer.render(this.scene, this.camera);
  }
}
