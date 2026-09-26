import * as T from "three";

// Shared low-poly last: flat outsole, narrow heel, broad forefoot and low toe.
// The shape follows the ankle; surface details add no per-player draw calls.
export function bootGeometry() {
  const sections = [
    [-0.145, 0.032, 0.073],
    [-0.12, 0.049, 0.105],
    [-0.055, 0.056, 0.098],
    [0.025, 0.065, 0.078],
    [0.105, 0.067, 0.059],
    [0.155, 0.052, 0.047],
    [0.177, 0.022, 0.033],
  ];
  const ring = [
    [-0.78, 0],
    [-1, 0.17],
    [-0.94, 0.58],
    [-0.6, 0.91],
    [0, 1],
    [0.6, 0.91],
    [0.94, 0.58],
    [1, 0.17],
    [0.78, 0],
  ];
  const positions = [],
    indices = [];
  for (const [z, width, height] of sections)
    for (const [x, y] of ring)
      positions.push(x * width, -0.028 + y * height, z);
  for (let s = 0; s < sections.length - 1; s++)
    for (let i = 0; i < ring.length; i++) {
      const a = s * ring.length + i,
        b = s * ring.length + ((i + 1) % ring.length);
      const c = a + ring.length,
        d = b + ring.length;
      indices.push(a, c, b, b, c, d);
    }
  // Close the heel and toe with consistently outward-facing caps.
  for (const [section, reverse] of [
    [0, false],
    [sections.length - 1, true],
  ]) {
    const start = section * ring.length;
    for (let i = 1; i < ring.length - 1; i++)
      indices.push(
        start,
        start + (reverse ? i + 1 : i),
        start + (reverse ? i : i + 1),
      );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function bootMaterial(color) {
  const material = new T.MeshStandardMaterial({ color, roughness: 0.68 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 vBoot;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvBoot = position;",
    );
    shader.fragmentShader = "varying vec3 vBoot;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      vec3 p = vBoot;
      float sole = 1.0 - smoothstep(-.014, -.009, p.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.055, .065, .06), sole);
      float tongue = step(abs(p.x), .023) * step(-.083, p.z) * step(p.z, .045) * step(.029, p.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .48, tongue);
      float lace = 1.0 - smoothstep(.0015, .0025, abs(mod(p.z + .08, .019) - .0095));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86), tongue * lace);
      float panel = step(.043, abs(p.x)) * step(-.05, p.z) * step(p.z, .095)
        * (1.0 - smoothstep(.004, .009, abs(p.y - .007 - p.z * .12)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .15, .13), panel);
    `,
    );
  };
  return material;
}
