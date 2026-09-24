import * as T from "three";
const cache = new Map();
// Small deterministic tiles shared by all scenery materials. No network assets.
export function detailTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d"),
    pixels = c.createImageData(256, 256);
  let seed = 731;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const n = rand(),
        wave = Math.sin(y * 0.24 + Math.sin(x * 0.049) * 1.8);
      let v =
        kind === "sand"
          ? 175 + wave * 24 + n * 35
          : kind === "wood"
            ? 165 + Math.sin(y * 0.55 + Math.sin(x * 0.035) * 3) * 25 + n * 25
            : kind === "grass"
              ? 125 + n * 110
              : kind === "asphalt"
                ? 135 + n * 100
                : 190 + n * 45;
      if (
        kind === "plaster" &&
        (y % 64 < 2 || (x + (Math.floor(y / 64) % 2) * 64) % 128 < 2)
      )
        v -= 25;
      if (kind === "concrete" && (x % 128 < 3 || y % 128 < 3)) v -= 45;
      const i = (y * 256 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
  c.putImageData(pixels, 0, 0);
  if (kind === "wood") {
    c.strokeStyle = "#635d5055";
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(35 + i * 61, 39 + i * 55, 18, 5, 0.08, 0, Math.PI * 2);
      c.stroke();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  cache.set(kind, texture);
  return texture;
}
export function addGroundDetail(material, kind, width, depth) {
  const tile = detailTexture(kind).clone();
  tile.needsUpdate = true;
  const metres = kind === "grass" ? 1.2 : kind === "sand" ? 2.4 : 1.5;
  tile.repeat.set(width / metres, depth / metres);
  material.bumpMap = tile;
  material.bumpScale = kind === "sand" ? 0.035 : 0.016;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundDetail = { value: tile };
    shader.fragmentShader =
      "uniform sampler2D groundDetail;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\n diffuseColor.rgb *= mix(.79, 1.13, texture2D(groundDetail,vBumpMapUv).r);",
    );
  };
  material.customProgramCacheKey = () => `ground-detail-${kind}`;
  return material;
}
export function sceneryMaterial(color, kind) {
  const texture = detailTexture(kind);
  const material = new T.MeshStandardMaterial({
    color,
    map: texture,
    bumpMap: texture,
    bumpScale: kind === "wood" ? 0.015 : 0.025,
    roughness: 0.94,
  });
  material.userData.batchTexture = true;
  return material;
}
// Planar box UVs give walls, paving and planks a consistent physical grain size.
export function worldScaleBoxUV(geometry, scale = 1) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i));
    uv.setXY(
      i,
      (nx > 0.5 ? p.getZ(i) : p.getX(i)) / scale,
      (ny > 0.5 ? p.getZ(i) : p.getY(i)) / scale,
    );
  }
  return geometry;
}
