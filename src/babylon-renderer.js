// Babylon owns the canvas, GPU resources, materials, skinning and draw calls.
// The existing procedural assets/IK retain their CPU-side scene graph so the
// migration does not discard the football-specific animation work.
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import {
  Vector3,
  Quaternion,
  Matrix,
} from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import { Bone } from "@babylonjs/core/Bones/bone.js";
import { CustomMaterial } from "@babylonjs/materials/custom/customMaterial.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { Matrix4 } from "three";
const color = (c) => new Color3(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1);
function attribute(a) {
  if (!a) return null;
  const data = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++)
    for (let j = 0; j < a.itemSize; j++)
      data[i * a.itemSize + j] = a.getComponent(i, j);
  return data;
}
export class BabylonRenderer {
  constructor() {
    this.domElement = document.createElement("canvas");
    this.engine = new Engine(this.domElement, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: "high-performance",
    });
    this.scene = new Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType = 1;
    this.scene.imageProcessingConfiguration.exposure = 1.05;
    this.camera = new FreeCamera(
      "broadcast",
      new Vector3(64, 77, 88),
      this.scene,
    );
    this.camera.minZ = 0.3;
    this.camera.maxZ = 350;
    this.hemi = new HemisphericLight("sky", Vector3.Up(), this.scene);
    this.hemi.intensity = 0.9;
    this.hemi.groundColor = Color3.FromHexString("#807b92");
    this.sun = new DirectionalLight(
      "sun",
      new Vector3(52, -65, 38).normalize(),
      this.scene,
    );
    this.sun.position.set(-52, 65, -38);
    this.sun.intensity = 1.6;
    // Horizon meshes extend kilometres; fitting the shadow map to them causes
    // severe depth acne and wastes all resolution away from the playing area.
    Object.assign(this.sun, {
      autoUpdateExtends: false,
      autoCalcShadowZBounds: false,
      orthoLeft: -72,
      orthoRight: 72,
      orthoTop: 63,
      orthoBottom: -63,
      shadowMinZ: 1,
      shadowMaxZ: 190,
    });
    this.sun.diffuse = Color3.FromHexString("#ffe8ce");
    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.bias = 0.003;
    this.shadows.normalBias = 0.05;
    this.nodes = new Map();
    this.materials = new Map();
    this.textures = new Map();
    this.shadowMap = { enabled: true };
    this.capabilities = { getMaxAnisotropy: () => 8 };
    this.info = { render: { calls: 0, triangles: 0 } };
    this.ratio = 1;
  }
  setShadowResolution(size) {
    if (this.shadows.getShadowMap().getSize().width !== size)
      this.shadows.mapSize = size;
  }
  setPixelRatio(ratio) {
    this.ratio = ratio;
  }
  setSize(w, h) {
    this.engine.setSize(Math.round(w * this.ratio), Math.round(h * this.ratio));
  }
  texture(source) {
    if (this.textures.has(source)) return this.textures.get(source);
    const image = source.image;
    if (!image || !(image.width > 0)) return null;
    const texture = new DynamicTexture(
      source.name || "surface",
      { width: image.width, height: image.height },
      this.scene,
      true,
    );
    texture.getContext().drawImage(image, 0, 0);
    texture.update(source.flipY);
    texture.hasAlpha = true;
    texture.anisotropicFilteringLevel = 8;
    texture.wrapU = source.wrapS === 1000 ? 1 : 0;
    texture.wrapV = source.wrapT === 1000 ? 1 : 0;
    texture.uScale = source.repeat.x;
    texture.vScale = source.repeat.y;
    this.textures.set(source, texture);
    source.addEventListener("dispose", () => {
      texture.dispose();
      this.textures.delete(source);
    });
    return texture;
  }
  material(source) {
    if (this.materials.has(source)) return this.materials.get(source);
    const kit = source.userData?.kit;
    const material = kit
      ? new CustomMaterial("football-kit", this.scene)
      : new StandardMaterial(source.name || "surface", this.scene);
    material.specularColor = Color3.Black();
    material.backFaceCulling = source.side !== 2;
    if (source.isMeshBasicMaterial || source.isLineBasicMaterial)
      material.disableLighting = true;
    if (kit) {
      material.AddUniform("kitStyle", "vec3");
      for (const key of ["Skin", "Shirt", "Shorts", "Boot"])
        material.AddUniform("kit" + key, "vec3");
      material.Vertex_Definitions("varying vec3 vKitPosition;");
      material.Vertex_Before_PositionUpdated("vKitPosition = positionUpdated;");
      material.Fragment_Definitions("varying vec3 vKitPosition;");
      material.Fragment_Custom_Diffuse(`
        vec3 p=vKitPosition; vec3 kit=kitSkin;
        bool collar=abs(p.x)<.085 && p.y>1.49;
        if(kitStyle.x>.5 && p.y>.93 && p.y<1.59 && abs(p.x)<.48 && !collar) kit=kitShirt;
        else if(p.y>.64 && p.y<=(kitStyle.x>.5 ? .95 : 1.075) && abs(p.x)<.27) {
          kit=kitShorts; if(kitStyle.x<.5 && p.y>1.045) kit*=.82;
        }
        else if(kitStyle.y>.5 && p.y>.12 && p.y<.43 && abs(p.x)<.27) kit=kitShirt;
        else if(kitStyle.z>.5 && p.y<=.12) kit=kitBoot;
        if(kitStyle.x>.5 && p.y>1.28 && p.y<1.33 && abs(p.x)<.23) kit=mix(kitShirt,vec3(.95),.65);
        if(p.y>.65 && p.y<.91 && abs(p.x)>.21 && abs(p.x)<.27) kit=mix(kitShorts,vec3(.95),.7);
        diffuseColor*=kit;
      `);
      material.onBindObservable.add(() => {
        const effect = material.getEffect();
        const style = source.userData.kitStyle.value;
        effect.setFloat3("kitStyle", style.x, style.y, style.z);
        for (const key of ["Skin", "Shirt", "Shorts", "Boot"]) {
          const c = kit[key.toLowerCase()];
          effect.setFloat3("kit" + key, c.r, c.g, c.b);
        }
      });
    }
    this.materials.set(source, material);
    source.addEventListener("dispose", () => {
      material.dispose();
      this.materials.delete(source);
    });
    return material;
  }
  create(source) {
    const mesh = new Mesh(source.name || "asset", this.scene),
      geometry = source.geometry;
    mesh.sideOrientation = 1; // Existing asset indices are counterclockwise.
    const data = new VertexData();
    data.positions = attribute(geometry.attributes.position);
    data.normals = attribute(geometry.attributes.normal);
    data.uvs = attribute(geometry.attributes.uv);
    data.indices = geometry.index
      ? Array.from(geometry.index.array)
      : Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
    if (geometry.attributes.color) {
      const c = geometry.attributes.color;
      data.colors = Array.from({ length: c.count }, (_, i) => [
        c.getX(i),
        c.getY(i),
        c.getZ(i),
        c.itemSize === 4 ? c.getW(i) : 1,
      ]).flat();
    }
    if (source.isSkinnedMesh) {
      data.matricesIndices = attribute(geometry.attributes.skinIndex);
      data.matricesWeights = attribute(geometry.attributes.skinWeight);
      const skeleton = new Skeleton("athlete", String(source.id), this.scene);
      source.skeleton.bones.forEach(
        (b, i) =>
          new Bone(b.name, skeleton, null, Matrix.Identity(), null, null, i),
      );
      mesh.skeleton = skeleton;
      mesh.numBoneInfluencers = 4;
    }
    data.applyToMesh(mesh);
    mesh.material = this.material(
      Array.isArray(source.material) ? source.material[0] : source.material,
    );
    if (source.isLineSegments) mesh.material.fillMode = 4;
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.isPickable = false;
    mesh.receiveShadows = !!source.receiveShadow;
    if (source.castShadow) this.shadows.addShadowCaster(mesh);
    if (source.isInstancedMesh) {
      mesh.thinInstanceSetBuffer(
        "matrix",
        source.instanceMatrix.array,
        16,
        false,
      );
      if (source.instanceColor) {
        const colors = new Float32Array(source.count * 4);
        for (let i = 0; i < source.count; i++) {
          colors.set(
            source.instanceColor.array.subarray(i * 3, i * 3 + 3),
            i * 4,
          );
          colors[i * 4 + 3] = 1;
        }
        mesh.thinInstanceSetBuffer("color", colors, 4, true);
      }
    }
    const entry = {
      mesh,
      geometry,
      skinMatrix: new Matrix4(),
      matrix: Matrix.Identity(),
    };
    this.nodes.set(source, entry);
    return entry;
  }
  render(graph, camera) {
    graph.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.camera.position.copyFromFloats(
      camera.position.x,
      camera.position.y,
      camera.position.z,
    );
    // Babylon cameras look down +Z by default, including in RH scenes via their
    // view matrix; setTarget avoids coupling quaternion conventions.
    const e = camera.matrixWorld.elements;
    this.camera.setTarget(
      new Vector3(e[12] - e[8], e[13] - e[9], e[14] - e[10]),
    );
    this.camera.fov = (camera.fov * Math.PI) / 180;
    const bg = color(graph.background);
    this.scene.clearColor = new Color4(bg.r, bg.g, bg.b, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogStart = graph.fog.near;
    this.scene.fogEnd = graph.fog.far;
    this.scene.fogColor = color(graph.fog.color);
    this.scene.shadowsEnabled = this.shadowMap.enabled;
    const active = new Set();
    graph.traverse((source) => {
      if (!source.geometry || !source.material) return;
      active.add(source);
      let entry = this.nodes.get(source);
      if (entry && entry.geometry !== source.geometry) {
        entry.mesh.skeleton?.dispose();
        entry.mesh.dispose();
        this.nodes.delete(source);
        entry = null;
      }
      entry ||= this.create(source);
      const { mesh } = entry;
      let visible = true;
      for (let n = source; n; n = n.parent)
        if (!n.visible) {
          visible = false;
          break;
        }
      mesh.setEnabled(visible);
      if (!visible) return;
      Matrix.FromArrayToRef(source.matrixWorld.elements, 0, entry.matrix);
      entry.matrix.decompose(
        mesh.scaling,
        mesh.rotationQuaternion,
        mesh.position,
      );
      const sm = Array.isArray(source.material)
        ? source.material[0]
        : source.material;
      const material = this.material(sm);
      mesh.material = material;
      material.diffuseColor.copyFrom(color(sm.color));
      material.alpha = sm.opacity;
      if (material.disableLighting)
        material.emissiveColor.copyFrom(material.diffuseColor);
      if (sm.map) material.diffuseTexture = this.texture(sm.map);

      material.disableDepthWrite = sm.depthWrite === false;
      material.alphaCutOff = sm.alphaTest || 0.4;
      material.transparencyMode = sm.transparent ? 2 : sm.alphaTest ? 1 : 0;
      if (source.isSkinnedMesh) {
        source.skeleton.update();
        for (let i = 0; i < source.skeleton.bones.length; i++) {
          entry.skinMatrix.fromArray(source.skeleton.boneMatrices, i * 16);
          entry.skinMatrix
            .premultiply(source.bindMatrixInverse)
            .multiply(source.bindMatrix);
          mesh.skeleton.bones[i].updateMatrix(
            Matrix.FromArray(entry.skinMatrix.elements),
            false,
            true,
          );
        }
        // Animated bounds vary substantially (dives/bicycles); retain visibility
        // until the animation system supplies conservative per-action bounds.
        mesh.alwaysSelectAsActiveMesh = true;
      }
      if (source.isInstancedMesh) mesh.thinInstanceBufferUpdated("matrix");
    });
    for (const [source, { mesh }] of this.nodes)
      if (!active.has(source)) {
        mesh.skeleton?.dispose();
        mesh.dispose();
        this.nodes.delete(source);
      }
    const callsBefore = this.engine._drawCalls.current;
    this.engine.beginFrame();
    this.scene.render();
    this.engine.endFrame();
    this.info.render.calls = this.engine._drawCalls.current - callsBefore;
    this.info.render.triangles = Math.floor(this.scene.getActiveIndices() / 3);
  }
  dispose() {
    this.scene.dispose();
    this.engine.dispose();
  }
}
