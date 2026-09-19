import fs from "node:fs";
import path from "node:path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export async function loadLocal(file, { plain = false } = {}) {
  const g = JSON.parse(fs.readFileSync(file));
  for (const b of g.buffers)
    b.uri =
      "data:application/octet-stream;base64," +
      fs
        .readFileSync(path.resolve(path.dirname(file), b.uri))
        .toString("base64");
  if (plain) {
    g.materials = g.materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
    }));
    delete g.images;
    delete g.textures;
    delete g.samplers;
  }
  globalThis.ProgressEvent ||= class ProgressEvent {
    constructor(type, init) {
      Object.assign(this, init);
    }
  };
  return new GLTFLoader().parseAsync(JSON.stringify(g), "");
}
