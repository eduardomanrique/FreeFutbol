import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const base = `${import.meta.env.BASE_URL}assets/vegetation/`;
let assets;
function loadAssets() {
  return (assets ||= (async () => {
    const loader = new T.TextureLoader();
    const [model, alpha, color, normal, rough] = await Promise.all([
      new GLTFLoader().loadAsync(`${base}fern/fern.gltf`),
      loader.loadAsync(`${base}fern/textures/fern-alpha.png`),
      loader.loadAsync(`${base}palm-color.jpg`),
      loader.loadAsync(`${base}palm-normal.jpg`),
      loader.loadAsync(`${base}palm-rough.jpg`),
    ]);
    alpha.flipY = false;
    alpha.anisotropy = 4;
    const variants = model.scene.children.filter((m) => m.isMesh);
    for (const mesh of variants) {
      mesh.position.set(0, 0, 0);
      mesh.userData.sharedVegetation = true;
      mesh.material.alphaMap = alpha;
      mesh.material.alphaTest = 0.5;
      // A little leaf transmission keeps shaded fronds from turning black.
      mesh.material.emissive.set("#28451b");
      mesh.material.emissiveIntensity = 0.2;
      mesh.material.transparent = false;
      mesh.material.normalScale.set(0.65, 0.65);
      mesh.material.map.anisotropy = 4;
      mesh.material.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.customDepthMaterial = new T.MeshDepthMaterial({
        depthPacking: T.RGBADepthPacking,
        alphaMap: alpha,
        alphaTest: 0.5,
        side: T.DoubleSide,
      });
    }
    color.colorSpace = T.SRGBColorSpace;
    for (const map of [color, normal, rough]) {
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.set(1, 3);
      map.anisotropy = 4;
    }
    const bark = new T.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      roughnessMap: rough,
      normalScale: new T.Vector2(0.6, 0.6),
    });
    return { variants, bark };
  })());
}
// Shared 1K maps and four small glTF variants; no network calls during play.
export function addVegetation(root, placements) {
  root.userData.vegetationReady = loadAssets()
    .then(({ variants, bark }) => {
      if (root.userData.disposed) return;
      placements.forEach(({ x, y, z, palm, height }, index) => {
        const group = new T.Group();
        group.name = palm ? "textured-palm" : "textured-fern";
        group.position.set(x, y || 0, z);
        const leaves = variants[index % (palm ? 2 : 4)].clone();
        leaves.rotation.y = index * 2.4;
        if (palm) {
          const curve = new T.CatmullRomCurve3([
            new T.Vector3(0, 0, 0),
            new T.Vector3(0.08, height * 0.35, 0.05),
            new T.Vector3(0.28, height * 0.72, 0.08),
            new T.Vector3(0.6, height, 0),
          ]);
          const trunk = new T.Mesh(
            new T.TubeGeometry(curve, 14, 0.18, 10, false),
            bark,
          );
          trunk.material.userData.sharedVegetation = true;
          trunk.castShadow = trunk.receiveShadow = true;
          group.add(trunk);
          leaves.position.set(0.6, height - 0.25, 0);
          leaves.scale.set(6.2, 3, 6.2);
        } else {
          leaves.scale.setScalar(index % 4 < 2 ? 1.65 : 2.4);
        }
        group.add(leaves);
        root.add(group);
      });
      root.userData.vegetationLoaded = placements.length;
    })
    .catch((error) => {
      root.userData.vegetationError = error.message;
      console.error("Vegetation assets failed to load", error);
    });
}
