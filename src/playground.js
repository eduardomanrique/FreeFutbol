import { addVegetation } from "./vegetation.js";
import * as T from "three";
import {
  addGroundDetail,
  sceneryMaterial,
  worldScaleBoxUV,
} from "./surface-textures.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
// Static set dressing: no animation or physics cost during play.
export function buildPlayground(id, c) {
  const root = new T.Group(),
    L = c.halfLength,
    W = c.halfWidth;
  const materials = new Map();
  const vegetation = [];
  const wood = new Set([
    "#b77940",
    "#c38a4e",
    "#d4a263",
    "#a96a37",
    "#8d562f",
    "#d09468",
    "#a77752",
    "#d0a582",
  ]);
  const plaster = new Set([
    "#d9b093",
    "#b4cac5",
    "#d9cb99",
    "#abbbc9",
    "#77a6ae",
  ]);
  const concrete = new Set(["#c8c3b5", "#b9b3a5", "#cb8e69"]);
  const material = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        wood.has(color)
          ? sceneryMaterial(color, "wood")
          : plaster.has(color)
            ? sceneryMaterial(color, "plaster")
            : concrete.has(color)
              ? sceneryMaterial(color, "concrete")
              : new T.MeshStandardMaterial({ color, roughness: 0.88 }),
      );
    return materials.get(color);
  };
  const mesh = (geo, color, x, y, z) => {
    const m = new T.Mesh(geo, material(color));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const box = (w, h, d, color, x, y, z) =>
    mesh(
      worldScaleBoxUV(new T.BoxGeometry(w, h, d), wood.has(color) ? 0.8 : 2),
      color,
      x,
      y,
      z,
    );
  const rod = (a, b, r, color) => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const m = mesh(
      new T.CylinderGeometry(r, r, delta.length(), 8),
      color,
      ...start.add(end).multiplyScalar(0.5),
    );
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return m;
  };
  if (c.footvolley) {
    for (const z of [-W - 0.35, W + 0.35]) {
      rod([0, 0, z], [0, 2.65, z], 0.075, "#f3e9dc");
      box(0.2, 1.5, 0.2, "#ed6ba7", 0, 0.75, z);
      rod([0, 1.9, z], [0, 3, z], 0.025, "#ff524e");
    }
    for (let y = 1.3; y <= 2.2; y += 0.14)
      rod([0, y, -W], [0, y, W], 0.008, "#293d45");
    for (let z = -W; z <= W; z += 0.14)
      rod([0, 1.3, z], [0, 2.2, z], 0.008, "#293d45");
    box(0.045, 0.1, W * 2 + 0.3, "#fff6e5", 0, 2.2, 0);
    box(0.035, 0.04, W * 2, "#fff6e5", 0, 1.3, 0);
  }
  const beach = c.surface === "sand",
    street = id === "street",
    park = id === "duel";
  const roadLength = 600;
  // Extend beyond the camera's far plane and fog, so scenery never ends at
  // the pitch apron. The marked playing surface keeps its original dimensions.
  const beachExtent = 2000;
  if (beach) {
    const sand = new T.Mesh(
      new T.PlaneGeometry(beachExtent, beachExtent),
      addGroundDetail(
        new T.MeshStandardMaterial({ color: "#e8cd9e", roughness: 1 }),
        "sand",
        beachExtent,
        beachExtent,
      ),
    );
    sand.name = "beach-sand-horizon";
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.005;
    sand.receiveShadow = true;
    root.add(sand);
  } else {
    box(
      street ? roadLength : L * 2 + 35,
      0.4,
      W * 2 + 35,
      "#b9b3a5",
      0,
      -0.25,
      0,
    );
  }
  if (park) {
    const lawn = new T.Mesh(
      new T.PlaneGeometry(600, 600),
      addGroundDetail(
        new T.MeshStandardMaterial({ color: "#789e5c", roughness: 1 }),
        "grass",
        600,
        600,
      ),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.12;
    lawn.receiveShadow = true;
    root.add(lawn);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d"),
    sx = 1536 / (2 * L),
    sz = 1024 / (2 * W);
  ctx.fillStyle = beach
    ? "#e8cd9e"
    : street
      ? "#637780"
      : park
        ? "#547f98"
        : "#429589";
  ctx.fillRect(0, 0, 1536, 1024);
  if (id === "sand") {
    for (const end of [-1, 1])
      for (const side of [-1, 1]) {
        const x = end * (L - 9),
          z = side * (W + 1.1);
        rod([x, 0, z], [x, 1.65, z], 0.025, "#f4f1df");
        const flag = box(0.55, 0.35, 0.015, "#ffdf22", x + 0.275, 1.45, z);
        flag.name = "beach-penalty-flag";
      }
  }
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 35000; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#ffffff10" : "#192d3910";
    ctx.fillRect(rand() * 1536, rand() * 1024, beach ? 3 : 1, beach ? 2 : 1);
  }
  // Fine surface wear lives in the baked map, without per-frame draw calls.
  ctx.save();
  if (beach) {
    ctx.strokeStyle = "#ae875b22";
    ctx.lineWidth = 2;
    for (let i = 0; i < 95; i++) {
      const x = rand() * 1536,
        y = rand() * 1024;
      ctx.beginPath();
      ctx.ellipse(x, y, 12 + rand() * 24, 2, rand() * 0.4, 0, Math.PI);
      ctx.stroke();
    }
    for (let i = 0; i < 120; i++) {
      const x = rand() * 1536,
        y = rand() * 1024;
      ctx.fillStyle = "#b5906130";
      ctx.beginPath();
      ctx.ellipse(x, y, 2.5, 6, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (street) {
    ctx.strokeStyle = "#293d4540";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      let x = rand() * 1536,
        y = rand() * 1024;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rand() * 28 - 14;
        y += rand() * 24;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Recessed utility cover and subtle tyre wear, never pitch boundary lines.
    ctx.fillStyle = "#33454b";
    ctx.fillRect(220, 730, 70, 43);
    ctx.strokeStyle = "#819396";
    ctx.lineWidth = 2;
    ctx.strokeRect(223, 733, 64, 37);
    for (let i = 0; i < 7; i++) ctx.fillRect(228 + i * 8, 737, 3, 29);
  } else {
    ctx.strokeStyle = "#e4ffe514";
    ctx.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const x = rand() * 1536,
        y = rand() * 1024;
      ctx.beginPath();
      ctx.arc(x, y, 5 + rand() * 16, 0, 1.5);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.translate(768, 512);
  ctx.scale(sx, sz);
  ctx.strokeStyle = beach ? "#418daf" : "#f4edda";
  ctx.lineWidth = street ? 0.08 : 0.1;
  if (!street && !c.altinha)
    ctx.strokeRect(-L + 0.12, -W + 0.12, L * 2 - 0.24, W * 2 - 0.24);
  if (!beach && !street) {
    ctx.beginPath();
    ctx.moveTo(0, -W);
    ctx.lineTo(0, W);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, street ? 2 : 3, 0, Math.PI * 2);
    ctx.stroke();
    if (!street)
      for (const sign of [-1, 1]) {
        ctx.fillStyle = park ? "#dbac76" : "#de9c78";
        if (park) {
          ctx.fillRect(sign === 1 ? L - 6 : -L, -6, 6, 12);
          ctx.strokeRect(sign === 1 ? L - 6 : -L, -6, 6, 12);
          ctx.beginPath();
          ctx.arc(sign * (L - 6), 0, 0.12, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.arc(
          sign * L,
          0,
          6,
          sign === 1 ? Math.PI / 2 : -Math.PI / 2,
          sign === 1 ? Math.PI * 1.5 : Math.PI / 2,
        );
        ctx.fill();
        ctx.stroke();
      }
  }
  ctx.restore();
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  if (street) {
    tex.wrapS = T.RepeatWrapping;
    tex.repeat.x = roadLength / (2 * L);
  }
  const ground = new T.Mesh(
    new T.PlaneGeometry(street ? roadLength : 2 * L, 2 * W),
    addGroundDetail(
      new T.MeshStandardMaterial({ map: tex, roughness: 1 }),
      beach ? "sand" : street ? "asphalt" : "concrete",
      street ? roadLength : 2 * L,
      2 * W,
    ),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.005;
  ground.receiveShadow = true;
  root.add(ground);
  // Tubular frames and complete nets, including side panels and roof.
  for (const sign of c.altinha || c.footvolley ? [] : [-1, 1]) {
    const x = sign * L,
      back = x + sign * (street ? 0.85 : 1.5),
      G = c.goalHalf,
      H = c.goalHeight;
    if (c.goalStyle === "crate") {
      const wood = ["#b77940", "#c38a4e", "#d4a263", "#a96a37"];
      // Open-front produce crate: slatted back/sides, a lid and chunky corners.
      for (let i = 0; i < 5; i++) {
        const y = 0.12 + (i * (H - 0.2)) / 4;
        box(0.1, H * 0.14, G * 2, wood[i % 4], back, y, 0);
        for (const z of [-G, G])
          box(0.85, H * 0.14, 0.1, wood[(i + 1) % 4], (x + back) / 2, y, z);
      }
      for (let i = 0; i < 9; i++) {
        const z = -G + ((i + 0.5) * G * 2) / 9;
        box(0.95, 0.1, (G * 2) / 9 - 0.025, wood[i % 4], (x + back) / 2, H, z);
        box(
          0.85,
          0.035,
          (G * 2) / 9 - 0.025,
          wood[(i + 2) % 4],
          (x + back) / 2,
          -0.005,
          z,
        );
      }
      for (const end of [x, back])
        for (const z of [-G, G]) {
          box(0.12, H + 0.08, 0.12, "#8d562f", end, H / 2, z);
          // Dark nail heads make the crate read clearly up close.
          for (const y of [0.18, H - 0.13])
            box(0.128, 0.035, 0.035, "#423b35", end, y, z);
        }
      box(0.12, 0.12, G * 2 + 0.12, "#d4a263", x, H, 0);
      continue;
    }
    const postColor = beach ? "#f8c648" : "#fcf4de",
      segments = [];
    for (const z of [-G, G]) {
      rod([x, 0, z], [x, H, z], 0.065, postColor);
      rod([x, H, z], [back, H, z], 0.045, postColor);
      rod([back, 0, z], [back, H, z], 0.04, postColor);
    }
    rod([x, H, -G], [x, H, G], 0.065, postColor);
    for (let z = -G; z <= G + 0.01; z += 0.2)
      segments.push(back, 0, z, back, H, z, x, H, z, back, H, z);
    for (let y = 0; y <= H + 0.01; y += 0.2) {
      segments.push(back, y, -G, back, y, G);
      for (const z of [-G, G]) segments.push(x, y, z, back, y, z);
    }
    for (let u = 0; u <= 1; u += 0.15)
      for (const z of [-G, G])
        segments.push(x + (back - x) * u, 0, z, x + (back - x) * u, H, z);
    const net = new T.LineSegments(
      new T.BufferGeometry().setAttribute(
        "position",
        new T.Float32BufferAttribute(segments, 3),
      ),
      new T.LineBasicMaterial({
        color: "#e9e7df",
        transparent: true,
        opacity: 0.55,
      }),
    );
    root.add(net);
  }
  const bench = (x, z) => {
    box(3, 0.14, 0.65, "#a67650", x, 0.65, z);
    box(3, 0.65, 0.12, "#b88b61", x, 1, z + 0.3);
    for (const dx of [-1.1, 1.1])
      box(0.12, 0.6, 0.5, "#344c53", x + dx, 0.3, z);
  };
  const palm = (x, z, height) => vegetation.push({ x, z, height, palm: true });
  if (beach) {
    box(
      beachExtent,
      0.12,
      beachExtent / 2,
      "#44b8c5",
      0,
      -0.05,
      -W - 4 - beachExtent / 4,
    );
    for (let i = 0; i < 4; i++)
      box(beachExtent, 0.015, 0.18, "#c3eee0", 0, 0.006, -W - 5 - i * 2.8);
    for (const x of [-L - 5, L + 5]) {
      palm(x, -W - 3, 6);
      palm(x, W + 5, 5);
    }
    for (const x of [-L + 4, L - 4]) {
      rod([x, 0, -W - 3], [x, 2.6, -W - 3], 0.05, "#eee1c5");
      const canopy = mesh(
        new T.ConeGeometry(1.8, 0.65, 12),
        "#e98068",
        x,
        2.8,
        -W - 3,
      );
      canopy.rotation.y = 0.2;
      box(2, 0.025, 1, "#f3eee1", x, 0, -W - 5);
      bench(x, W + 3);
    }
    // A small beach hut anchors the horizon.
    box(5, 2.6, 3, "#77a6ae", L + 7, 1.3, -W - 5);
    box(3, 1.1, 0.05, "#304c59", L + 7, 1.6, -W - 3.48);
    box(6, 0.18, 4, "#d09468", L + 7, 2.7, -W - 5);
  } else {
    // Pavement border and curb keep the pitch embedded in its surroundings.
    for (const sign of [-1, 1]) {
      box(
        street ? roadLength : L * 2 + 5,
        street ? c.curbHeight : 0.16,
        1.8,
        "#c8c3b5",
        0,
        street ? c.curbHeight / 2 : 0.02,
        sign * (W + (street ? 0.9 : 1.1)),
      );
      bench(sign * (L - 4), -W - 2.8);
    }
    if (street) {
      // The neighbourhood carries on far past both invisible goal lines.
      // The near-side buildings sit farther back to keep the camera unobstructed.
      for (const side of [-1, 1])
        for (let i = -24; i <= 24; i++) {
          const index = i + 24,
            x = i * 6.3,
            h = side < 0 ? 4 + (index % 3) * 1.15 : 3.4 + (index % 3) * 0.4,
            z = side * (W + (side < 0 ? 6 : 10)),
            face = z - side * 2;
          const colors = ["#d9b093", "#b4cac5", "#d9cb99", "#abbbc9"];
          box(6, h, 4, colors[index % 4], x, h / 2, z);
          box(6.25, 0.18, 4.3, "#855b50", x, h + 0.06, z);
          box(1.2, 2, 0.06, "#526974", x - 1.7, 1, face - side * 0.04);
          for (const dx of [-1.7, 0.1, 1.9])
            for (let y = 2.8; y < h - 0.3; y += 1.5) {
              box(0.8, 0.85, 0.08, "#eff0db", x + dx, y, face - side * 0.05);
              box(0.65, 0.7, 0.09, "#527d8c", x + dx, y, face - side * 0.1);
            }
          box(5.7, 0.17, 0.1, "#ece1c6", x, 2.3, face - side * 0.1);
        }
      for (let x = -144; x <= 144; x += 18) {
        rod([x, 0, -W - 2], [x, 5, -W - 2], 0.075, "#475864");
        rod([x, 5, -W - 2], [x, 5, -W], 0.065, "#475864");
        box(0.6, 0.15, 0.8, "#fff0b8", x, 4.95, -W);
      }
      // Street mural, painted rather than floating HUD text.
      const art = document.createElement("canvas");
      art.width = 512;
      art.height = 128;
      const a = art.getContext("2d");
      a.fillStyle = "#35586a";
      a.fillRect(0, 0, 512, 128);
      a.fillStyle = "#f4c476";
      a.font = "bold 76px sans-serif";
      a.fillText("JOGA BONITO", 8, 90);
      const map = new T.CanvasTexture(art);
      map.colorSpace = T.SRGBColorSpace;
      const mural = new T.Mesh(
        new T.PlaneGeometry(7, 1.75),
        new T.MeshBasicMaterial({ map }),
      );
      mural.position.set(0, 1.2, -W - 3.95);
      root.add(mural);
    } else {
      const lines = [];
      const fenceL = L + (park ? c.apron : 2),
        fenceW = W + (park ? c.apron : 2);
      for (const sign of [-1, 1]) {
        const z = sign * fenceW;
        for (let x = -fenceL; x <= fenceL; x += 4)
          rod([x, 0, z], [x, 3.7, z], 0.055, "#446d73");
        for (let x = -fenceL; x < fenceL; x += 0.6) {
          lines.push(x, 0.3, z, x, 3.6, z);
        }
        for (let y = 0.3; y < 3.7; y += 0.4)
          lines.push(-fenceL, y, z, fenceL, y, z);
        rod([-fenceL, 3.7, z], [fenceL, 3.7, z], 0.04, "#446d73");
        for (let row = 0; row < (park ? 0 : 3); row++)
          box(16, 0.3, 1, "#d0a582", 0, 0.3 + row * 0.38, z + sign * (2 + row));
      }
      if (park) {
        for (const sign of [-1, 1]) {
          for (let z = -fenceW; z <= fenceW; z += 4)
            rod(
              [sign * fenceL, 0, z],
              [sign * fenceL, 3.7, z],
              0.055,
              "#446d73",
            );
          for (let z = -fenceW; z <= fenceW; z += 0.6)
            lines.push(sign * fenceL, 0.3, z, sign * fenceL, 3.6, z);
          for (let y = 0.3; y < 3.7; y += 0.4)
            lines.push(sign * fenceL, y, -fenceW, sign * fenceL, y, fenceW);
          for (const x of [-L * 0.6, 0, L * 0.6]) {
            bench(x, sign * (fenceW + 2));
            vegetation.push({ x: x + 2, y: 0, z: sign * (fenceW + 3) });
          }
        }
      }
      root.add(
        new T.LineSegments(
          new T.BufferGeometry().setAttribute(
            "position",
            new T.Float32BufferAttribute(lines, 3),
          ),
          new T.LineBasicMaterial({
            color: "#61858a",
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
      for (const x of [-L - 4, L + 4]) {
        box(0.25, 5, 0.25, "#556d73", x, 2.5, 0);
        box(0.2, 1.4, 2.4, "#efe5cf", x, 4.7, 0);
      }
    }
  }
  // Small sideline objects add scale and character without obstructing play.
  for (const side of [-1, 1]) {
    if (beach) {
      for (let i = 0; i < 3; i++) {
        const x = -L * 0.6 + i * L * 0.6,
          z = side * (W + 2.5);
        box(
          1.7,
          0.025,
          0.85,
          ["#f18474", "#74cbd0", "#f8df91"][i],
          x,
          0.015,
          z,
        );
        for (let j = 0; j < 5; j++)
          box(0.13, 0.028, 0.85, "#fff1d1", x - 0.6 + j * 0.3, 0.022, z);
        mesh(
          new T.CylinderGeometry(0.12, 0.1, 0.3, 8),
          "#69aeca",
          x + 1.1,
          0.15,
          z,
        );
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const x = -L * 0.7 + i * L * 0.46,
          z = side * (W + (street ? 1.5 : 3));
        box(0.7, 0.45, 0.7, "#cb8e69", x, 0.23, z);
        vegetation.push({ x, y: 0.46, z });
      }
    }
  }
  {
    // Batch static neighbourhood geometry by material for mobile rendering.
    const buckets = new Map();
    for (const object of [...root.children]) {
      if (
        !object.isMesh ||
        object.name === "beach-sand-horizon" ||
        (object.material.map && !object.material.userData.batchTexture)
      )
        continue;
      object.updateMatrix();
      const geometry = object.geometry.clone().applyMatrix4(object.matrix);
      const list = buckets.get(object.material) || [];
      list.push(geometry);
      buckets.set(object.material, list);
      root.remove(object);
      object.geometry.dispose();
    }
    for (const [mat, geometries] of buckets) {
      const combined = new T.Mesh(mergeGeometries(geometries), mat);
      combined.castShadow = combined.receiveShadow = true;
      root.add(combined);
      geometries.forEach((geometry) => geometry.dispose());
    }
  }
  addVegetation(root, vegetation);
  return root;
}
