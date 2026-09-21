import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildSkinnedAthlete, loadAthleteAssets } from "./skinned-athlete.js";
import {
  ATHLETE_PROFILES,
  CLIP_LABELS,
  SLICE_COVERAGE,
  STATUS_LABELS,
  profileById,
  previewTime,
} from "./asset-catalog.js";
import inventory from "../assets/manifests/athlete-v1.json";
import "./asset-lab.css";

const $ = (id) => document.getElementById(id);
for (const profile of ATHLETE_PROFILES)
  $("profile").add(new Option(profile.label, profile.id));
for (const entry of SLICE_COVERAGE) {
  const card = document.createElement("div");
  card.className = "coverage-item";
  const title = document.createElement("strong");
  title.textContent = entry.label;
  const status = document.createElement("span");
  status.textContent = STATUS_LABELS[entry.status];
  const detail = document.createElement("p");
  detail.textContent = entry.detail;
  card.append(title, status, detail);
  $("coverage-list").append(card);
}

async function startLab() {
  const assets = await loadAthleteAssets();
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute(
    "aria-label",
    "Prévia 3D do atleta selecionado",
  );
  $("stage").append(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color("#18382c");
  scene.add(new T.HemisphereLight(0xf6f5dc, 0x526c54, 2.6));
  const light = new T.DirectionalLight(0xfff2d8, 3.6);
  light.position.set(3, 5, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = light.shadow.camera.bottom = -3;
  light.shadow.camera.right = light.shadow.camera.top = 3;
  light.shadow.normalBias = 0.03;
  scene.add(light);
  const rim = new T.DirectionalLight(0xc4dfba, 2);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const floor = new T.Mesh(
    new T.CircleGeometry(4, 80),
    new T.MeshStandardMaterial({ color: 0x234a35, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new T.Mesh(
    new T.RingGeometry(1.3, 1.31, 80),
    new T.MeshBasicMaterial({ color: 0x637954, side: T.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.02;
  scene.add(ring);
  const camera = new T.PerspectiveCamera(34, 1, 0.05, 50);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.98, 0);
  orbit.minDistance = 1.7;
  orbit.maxDistance = 7;
  orbit.maxPolarAngle = Math.PI / 2;
  orbit.enablePan = false;
  const resetCamera = () => {
    camera.position.set(2.5, 1.9, 4.5);
    orbit.target.set(0, 0.98, 0);
    orbit.update();
  };
  resetCamera();
  const resize = () => {
    const { width, height } = $("stage").getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe($("stage"));
  resize();

  // Six prebuilt rigs avoid allocating shared materials/geometries on every selection.
  const rigs = new Map();
  for (const profile of ATHLETE_PROFILES) {
    for (let team = 0; team < 2; team++) {
      const rig = buildSkinnedAthlete(
        assets,
        team * 11 + (profile.id === "keeper" ? 0 : 9),
      );
      rig.root.scale.multiply(new T.Vector3(...profile.scale));
      rig.root.visible = false;
      const helper = new T.SkeletonHelper(rig.model);
      helper.visible = false;
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.renderOrder = 10;
      scene.add(rig.root, helper);
      rigs.set(profile.id + ":" + team, { rig, helper });
    }
  }
  const pose = new Float32Array(assets.library.bones.length * 7);
  let active,
    clip = assets.library.clips[0],
    time = 0,
    playing = true;
  let manual = new URLSearchParams(location.search).has("test");
  for (const item of assets.library.clips)
    $("clip").add(new Option(CLIP_LABELS[item.name] || item.name, item.name));

  function playLabel() {
    $("play").textContent = playing ? "Pausar" : "Reproduzir";
    $("play").setAttribute(
      "aria-label",
      playing ? "Pausar animação" : "Reproduzir animação",
    );
  }
  function selectRig() {
    const profile = profileById($("profile").value);
    for (const item of rigs.values()) {
      item.rig.root.visible = false;
      item.helper.visible = false;
    }
    active = rigs.get(profile.id + ":" + $("kit").value);
    active.rig.root.visible = true;
    active.helper.visible = $("skeleton").checked;
    $("athlete-name").textContent =
      profile.label + " / " + ($("kit").value === "0" ? "Atlético" : "União");
    $("profile-note").textContent = profile.note;
    $("kit-note").textContent =
      profile.id === "keeper"
        ? "Goleiro: camisa amarela comum; calção varia por equipe."
        : "Uniformes procedurais do protótipo.";
    $("bones").textContent = active.rig.bones.length + " ossos";
    draw();
  }
  function selectClip() {
    clip = assets.library.clips.find((c) => c.name === $("clip").value);
    time = 0;
    $("timeline").max = String((clip.count - 1) / clip.fps);
    $("clip-note").textContent =
      clip.name === "kick"
        ? "Sequência própria experimental. Sem bola ou validação de impacto nesta prévia."
        : "Clip geral retargetado de Quaternius. Sem correções de IK aplicadas na partida.";
    draw();
  }
  function draw() {
    if (!active) return;
    assets.library.sample(clip, previewTime(time, clip), pose);
    for (let i = 0; i < active.rig.bones.length; i++) {
      active.rig.bones[i].position.fromArray(pose, i * 7);
      active.rig.bones[i].quaternion.fromArray(pose, i * 7 + 3);
    }
    active.rig.root.updateMatrixWorld(true);
    orbit.update();
    renderer.render(scene, camera);
    $("timeline").value = String(time);
    $("time").textContent = time.toFixed(2).replace(".", ",") + " s";
    $("triangles").textContent =
      renderer.info.render.triangles.toLocaleString("pt-BR");
  }
  function advance(seconds) {
    if (playing) {
      time = previewTime(time + seconds * Number($("speed").value), clip);
      if (!clip.loop && time >= (clip.count - 1) / clip.fps) {
        playing = false;
        playLabel();
      }
    }
    draw();
  }
  $("profile").addEventListener("change", selectRig);
  $("kit").addEventListener("change", selectRig);
  $("clip").addEventListener("change", selectClip);
  $("skeleton").addEventListener("change", () => {
    active.helper.visible = $("skeleton").checked;
    draw();
  });
  $("timeline").addEventListener("input", () => {
    time = Number($("timeline").value);
    playing = false;
    playLabel();
    draw();
  });
  $("play").addEventListener("click", () => {
    if (!playing && !clip.loop && time >= (clip.count - 1) / clip.fps) time = 0;
    playing = !playing;
    playLabel();
  });
  $("restart").addEventListener("click", () => {
    time = 0;
    draw();
  });
  $("reset-camera").addEventListener("click", () => {
    resetCamera();
    draw();
  });
  document.addEventListener("keydown", (event) => {
    if (
      ["INPUT", "SELECT", "BUTTON", "A"].includes(
        document.activeElement?.tagName,
      )
    )
      return;
    if (event.code === "Space") {
      event.preventDefault();
      $("play").click();
    }
    if (event.code === "KeyF") {
      const action = document.fullscreenElement
        ? document.exitFullscreen()
        : document.querySelector(".viewer").requestFullscreen?.();
      action?.catch(() => {});
    }
  });
  $("export").addEventListener("click", () => {
    const report = {
      version: 1,
      createdAt: new Date().toISOString(),
      profile: profileById($("profile").value),
      team: Number($("kit").value),
      clip: clip.name,
      time,
      rigBones: assets.library.bones,
      scope:
        "Visual preview only; no physical contact validation or legal approval.",
      coverage: SLICE_COVERAGE,
      inventory,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "campo-asset-review.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.render_game_to_text = () =>
    JSON.stringify({
      mode: "asset-lab",
      profile: $("profile").value,
      team: Number($("kit").value),
      clip: clip.name,
      time,
      playing,
      speed: Number($("speed").value),
      skeleton: $("skeleton").checked,
      bones: assets.library.bones.length,
      clips: assets.library.clips.map((c) => c.name),
      coordinateSystem: "metres; Y up; XZ ground",
      previewOnly: true,
      finitePose: [...pose].every(Number.isFinite),
    });
  window.advanceTime = (ms) => {
    if (!Number.isFinite(ms) || ms < 0 || ms > 60000)
      throw Error("Invalid preview time step");
    manual = true;
    advance(ms / 1000);
  };
  $("clip-count").textContent = assets.library.clips.length + " sequências";
  selectRig();
  selectClip();
  for (const element of document.querySelectorAll("button, select, input"))
    element.disabled = false;
  $("loading").hidden = true;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!manual && !document.hidden) advance(dt);
    else draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

startLab().catch((error) => {
  $("loading").hidden = false;
  $("loading").textContent =
    "Não foi possível abrir o laboratório. Verifique os arquivos locais e a aceleração gráfica e recarregue a página.";
  console.error(error);
});
