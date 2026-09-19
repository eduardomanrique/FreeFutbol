import { loadAthleteAssets } from "./skinned-athlete.js";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "./style.css";
import { Match } from "./simulation.js";
import { Stadium } from "./scene.js";
import { ControllerInput } from "./gamepad.js";
import { Calibration, CALIBRATION_STEPS } from "./calibration.js";
const $ = (id) => document.getElementById(id);
const match = new Match();
let stadium;
try {
  const assets = await loadAthleteAssets();
  match.attachMotionLibrary(assets.library);
  stadium = new Stadium($("world"), assets);
} catch (error) {
  $("loading").innerHTML =
    '<span class="brand">CAMPO</span><p>Não foi possível carregar o jogo. Recarregue a página e verifique a conexão e a aceleração gráfica do navegador.</p>';
  throw error;
}
const keys = new Set();
const controller = new ControllerInput();
let controllerState = controller.state,
  shotSource = null,
  actionButton = null,
  menuDirection = "",
  nextMenuMove = 0;
let calibration = null,
  calibrationLast = 0,
  shotStartedAt = 0,
  shotReleaseDelay = null;
const keyboardHints = document.querySelector(".quick-controls").innerHTML;
let modalType = null,
  previousMode = "home",
  soundOn = false,
  audio = null,
  lastSequence = 0,
  manualUntil = 0;
function beep(freq = 600, duration = 0.15) {
  if (!soundOn) return;
  audio ??= new AudioContext();
  audio.resume();
  let osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.06, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}
function setPlaying(on) {
  $("home").hidden = on;
  $("hud").hidden = !on;
  document.body.classList.toggle("playing", on);
}
function updateModeDescription() {
  const training = $("game-mode").value === "training";
  $("game-mode-help").textContent = training
    ? "Adversários parados, incluindo o goleiro. Treino sem limite de tempo."
    : "Partida com adversários em movimento e tempo regulamentar.";
  $("duration").disabled = training;
  $("duration").setAttribute(
    "aria-label",
    training ? "Duração ignorada na Arena de treino" : "Duração da partida",
  );
}
function start() {
  keys.clear();
  controller.suspend();
  shotSource = null;
  closeModal(false);
  match.start(
    Number($("duration").value),
    $("difficulty").value,
    $("game-mode").value === "training",
  );
  setPlaying(true);
  beep(1700, 0.3);
}
function showModal(type) {
  if (modalType === null) {
    previousMode = match.mode;
    if (match.mode === "playing" || match.mode === "goal")
      match.mode = "paused";
  }
  keys.clear();
  match.cancelAction();
  shotSource = null;
  shotReleaseDelay = null;
  controller.suspend();
  modalType = type;
  $("modal").hidden = false;
  let body = "";
  if (type === "controls") {
    $("modal-title").textContent = "Domine o jogo";
    body =
      [
        ["Movimentar", "ANALÓGICO ESQ. / WASD"],
        ["Correr", "RT / SHIFT"],
        ["Mirar durante a carga", "ANALÓGICO ESQ. / WASD"],
        ["Passe rasteiro · segurar e soltar", "A / J"],
        ["Passe alto · segurar e soltar", "B / L"],
        ["Chutar · segure e solte", "X / ESPAÇO"],
        ["Trocar jogador", "LB / Q"],
        ["Desarmar / carrinho", "X / B (sem bola)"],
        ["Passe em profundidade", "Y / I"],
        ["Proteger / marcar", "LT"],
        ["Pausar", "MENU / ESC"],
        ["Tela cheia", "F"],
      ]
        .map(
          ([a, b]) =>
            `<div class="control-row"><span>${a}</span><kbd>${b}</kbd></div>`,
        )
        .join("") +
      '<p class="modal-note">Conecte o controle e pressione um botão com esta página em foco. Nos menus: direcional para navegar, A confirma e B volta. O Atlético ataca para a direita. Direcione o jogador para escolher o passe; segure X ou espaço para carregar o chute. A barra sob o nome mostra o fôlego.</p>';
  }
  if (type === "settings") {
    $("modal-title").textContent = "Do seu jeito";
    body = `<label class="setting">Qualidade gráfica<select id="quality"><option value="high">Alta</option><option value="medium">Equilibrada</option><option value="low">Desempenho</option></select></label><button id="calibrate-controller" class="secondary">Configurar botões do controle</button><p class="modal-note">Esquema alternativo: X chuta, B cruza, Y lança; RT corre e LT protege. Use a configuração guiada se os gatilhos ou botões estiverem trocados.</p><label class="setting">Câmera<select id="camera"><option value="broadcast">Transmissão</option><option value="tactical">Tática</option></select></label><p class="modal-note">O modo Desempenho reduz a resolução e desativa sombras. A simulação mantém a mesma precisão em todas as qualidades.</p>`;
  }
  if (type === "pause") {
    $("modal-title").textContent = "Respira. O jogo espera.";
    body =
      '<p class="modal-note">A partida está pausada.</p><button id="resume" class="primary">Voltar ao jogo <span>→</span></button><button id="pause-settings" class="secondary">Configurações</button><button id="pause-controls" class="secondary">Controles</button><button id="restart" class="secondary">Reiniciar partida</button><button id="leave" class="secondary">Sair para o início</button>';
  }
  if (type === "calibration") {
    calibration = new Calibration();
    calibrationLast = performance.now();
    $("modal-title").textContent = "Configure seu controle";
    body =
      '<p class="modal-note">Vamos reconhecer cada botão do seu controle. Use somente o botão indicado e solte antes de continuar. A configuração fica salva neste navegador.</p><div id="calibration-prompt" class="calibration-prompt">Solte os botões e centralize os analógicos.</div><p id="calibration-progress" class="modal-note">Preparando…</p>';
  }
  if (type === "finished") {
    $("modal-title").textContent =
      match.score[0] > match.score[1]
        ? "Vitória do Atlético!"
        : match.score[0] < match.score[1]
          ? "Vitória do União"
          : "Tudo igual";
    body = `<p class="result-score" style="font-size:32px;text-align:center">ATL ${match.score[0]} : ${match.score[1]} UNI</p><p class="modal-note">Fim de jogo na Arena Campo.</p><button id="restart" class="primary">Jogar novamente <span>↗</span></button><button id="leave" class="secondary">Voltar ao início</button>`;
  }
  $("modal-body").innerHTML = body;
  $("quality")?.addEventListener("change", (e) => {
    stadium.setQuality(e.target.value);
    $("quality-label").textContent = {
      high: "ALTA",
      medium: "EQUILIBRADA",
      low: "DESEMPENHO",
    }[e.target.value];
  });
  $("calibrate-controller")?.addEventListener("click", () =>
    showModal("calibration"),
  );
  if ($("quality")) $("quality").value = stadium.quality;
  $("camera")?.addEventListener(
    "change",
    (e) => (stadium.cameraMode = e.target.value),
  );
  if ($("camera")) $("camera").value = stadium.cameraMode;
  $("pause-settings")?.addEventListener("click", () => showModal("settings"));
  $("pause-controls")?.addEventListener("click", () => showModal("controls"));
  $("resume")?.addEventListener("click", () => closeModal());
  $("restart")?.addEventListener("click", start);
  $("leave")?.addEventListener("click", () => {
    closeModal(false);
    match.mode = "home";
    match.resetPlayers();
    setPlaying(false);
  });
  ($("resume") ?? $("restart") ?? $("close-modal")).focus();
}
function closeModal(restore = true) {
  calibration = null;
  controller.suspend();
  if (restore && match.mode === "paused") match.mode = previousMode;
  $("modal").hidden = true;
  modalType = null;
}
function pause() {
  if (modalType) {
    closeModal();
    return;
  }
  if (match.mode === "playing" || match.mode === "goal") showModal("pause");
}
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$("controller-status").onclick = () =>
  showModal(
    controllerState.connected && !controllerState.supported
      ? "settings"
      : "controls",
  );
$("start-btn").onclick = start;
$("game-mode").addEventListener("change", updateModeDescription);
$("pause-btn").onclick = pause;
$("nav-controls").onclick = () => showModal("controls");
$("nav-settings").onclick = () => showModal("settings");
$("nav-play").onclick = () => {
  if (match.mode !== "home") pause();
  else closeModal();
};
$("close-modal").onclick = () => closeModal();
$("fullscreen").onclick = fullscreen;
$("sound").onclick = () => {
  soundOn = !soundOn;
  $("sound").style.color = soundOn ? "#c4f58a" : "#dbe1d9";
  $("sound").setAttribute(
    "aria-label",
    soundOn ? "Desativar som" : "Ativar som",
  );
  $("sound").title = soundOn ? "Desativar som" : "Ativar som";
  beep();
};
window.addEventListener("keydown", (e) => {
  if (
    [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
    ].includes(e.code) &&
    match.mode !== "home" &&
    e.code !== "Tab"
  )
    e.preventDefault();
  if (e.target instanceof HTMLSelectElement) return;
  if (e.code === "Escape" && !e.repeat) {
    pause();
    return;
  }
  if (e.code === "KeyF" && !e.repeat) {
    fullscreen();
    return;
  }
  if (e.code === "Enter" && match.mode === "home" && !modalType) {
    start();
    return;
  }
  keys.add(e.code);
  if (match.mode !== "playing" || modalType || e.repeat) return;
  if (e.code === "KeyQ") match.switchPlayer();
  if (e.code === "KeyK") match.tackle();
  const type = { KeyJ: "pass", KeyL: "lob", Space: "shoot", KeyI: "through" }[
    e.code
  ];
  if (type && match.beginAction(type, readInput())) {
    shotStartedAt = performance.now();
    shotReleaseDelay = null;
    shotSource = "keyboard";
    actionButton = e.code;
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === actionButton && match.charging && shotSource === "keyboard") {
    releaseShot();
  }
});
window.addEventListener("blur", () => {
  controller.suspend();
  keys.clear();
  if (match.mode === "playing" || match.mode === "goal") showModal("pause");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (match.mode === "playing" || match.mode === "goal"))
    showModal("pause");
});
let hudAccumulator = 0;
function readInput() {
  const input = {
    x:
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
    z:
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0),
    sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
  };
  if (!input.x && !input.z) {
    input.x = controllerState.x;
    input.z = controllerState.z;
  }
  input.sprint ||= !!controllerState.held.sprint;
  input.jockey = !!controllerState.held.jockey;
  return input;
}
function step(dt) {
  const input = readInput();
  if (match.charging && shotReleaseDelay !== null) {
    shotReleaseDelay += dt;
    if (shotReleaseDelay >= 0.065) releaseShot();
  }
  match.update(dt, input);
  hudAccumulator += dt;
  if (hudAccumulator > 0.075) {
    updateHUD();
    hudAccumulator = 0;
  }
  if (match.mode === "finished" && !modalType) showModal("finished");
}
function updateHUD() {
  const training = match.training === true;
  let mins = training ? 0 : (match.elapsed / match.duration) * 90;
  let sec = Math.floor(mins * 60);
  $("match-clock").textContent = training
    ? "SEM LIMITE"
    : `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  $("match-clock").classList.toggle("unlimited", training);
  document.querySelector(".period").textContent = training
    ? "TREINO"
    : mins < 45
      ? "1º"
      : "2º";
  $("mode-indicator").textContent = training ? "ARENA DE TREINO" : "AMISTOSO";
  $("score").innerHTML = `${match.score[0]} <span>:</span> ${match.score[1]}`;
  let p = match.players[match.selected];
  $("player-number").textContent = p.number;
  $("player-name").textContent = p.name;
  $("stamina-fill").style.width = `${p.stamina * 100}%`;
  $("possession").textContent =
    match.ball.owner === match.selected ? "COM A BOLA" : "SEM A BOLA";
  $("event-toast").textContent = match.event;
  $("event-toast").classList.toggle("visible", match.eventTime > 0);
  $("power-wrap").hidden = !match.charging;
  $("power-fill").style.width = `${match.charge * 100}%`;
  $("power-fill").style.background = match.charge > 0.8 ? "#ed9860" : "#c4f58a";
  if (match.sequence !== lastSequence) {
    lastSequence = match.sequence;
    if (match.mode === "goal") beep(850, 0.5);
  }
  $("radar-dots").innerHTML =
    match.players
      .map(
        (p) =>
          `<circle class="dot ${p.team ? "opponent" : ""} ${p.id === match.selected ? "selected" : ""}" cx="${90 + (p.x / 46) * 85}" cy="${58 + (p.z / 30) * 53}" r="${p.id === match.selected ? 3 : 2.2}"/>`,
      )
      .join("") +
    `<circle class="ball-dot" cx="${90 + (match.ball.x / 46) * 85}" cy="${58 + (match.ball.z / 30) * 53}" r="1.6"/>`;
}
window.render_game_to_text = () =>
  JSON.stringify({
    ...match.snapshot(),
    controller: {
      connected: controllerState.connected,
      supported: controllerState.supported,
      id: controllerState.id,
      mapping: controllerState.mapping,
      x: controllerState.x,
      z: controllerState.z,
    },
    graphics: {
      quality: stadium.quality,
      camera: stadium.cameraMode,
      athletes: "skinned",
      drawCalls: stadium.renderer.info.render.calls,
      triangles: stadium.renderer.info.render.triangles,
    },
    modal: modalType,
  });
window.advanceTime = (ms) => {
  pollController(performance.now());
  manualUntil = performance.now() + 200;
  for (let i = 0; i < Math.round(ms / (1000 / 120)); i++) step(1 / 120);
  updateHUD();
  stadium.render(match, ms / 1000);
};
// Scenario hooks are opt-in and never present in ordinary gameplay.
if (new URLSearchParams(location.search).has("test"))
  window.__test = { match, stadium, step: (ms) => window.advanceTime(ms) };
let last = performance.now(),
  accumulator = 0,
  frames = 0,
  fpsTime = 0;
function frame(now) {
  pollController(now);
  let rawElapsed = (now - last) / 1000;
  let elapsed = Math.min(rawElapsed, 0.08);
  last = now;
  if (now >= manualUntil) {
    accumulator += elapsed;
    while (accumulator >= 1 / 120) {
      step(1 / 120);
      accumulator -= 1 / 120;
    }
  }
  stadium.render(match, elapsed);
  frames++;
  fpsTime += rawElapsed;
  if (fpsTime >= 0.8) {
    $("fps").textContent = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(frame);
}
updateModeDescription();
updateHUD();
stadium.render(match, 1);
$("loading").hidden = true;
requestAnimationFrame(frame);

function pollController(now) {
  const state = controller.poll();
  controllerState = state;
  const status = $("controller-status");
  const label = state.connected
    ? state.supported
      ? "Controle conectado · Alternativo"
      : "Configurar controle · reconhecer botões"
    : "Controle: pressione um botão para conectar";
  if (status.textContent !== label) status.textContent = label;
  status.title =
    state.id || "Conecte por Bluetooth e pressione um botão com o jogo em foco";
  status.classList.toggle("connected", state.connected && state.supported);
  const hints = document.querySelector(".quick-controls");
  const kind = state.connected && state.supported ? "controller" : "keyboard";
  if (hints.dataset.kind !== kind) {
    hints.dataset.kind = kind;
    hints.innerHTML =
      kind === "keyboard"
        ? keyboardHints
        : "<span><kbd>LS</kbd> Mover</span><span><kbd>A</kbd> Passe</span><span><kbd>X</kbd> Chute</span><span><kbd>B</kbd> Passe alto</span><span><kbd>Y</kbd> Profundidade</span><span><kbd>LB</kbd> Trocar</span><span><kbd>RT</kbd> Correr</span><span><kbd>LT</kbd> Proteger</span>";
  }
  if (
    state.disconnected &&
    (match.mode === "playing" || match.mode === "goal")
  ) {
    showModal("pause");
    $("modal-body").querySelector(".modal-note").textContent =
      "Controle desconectado. Reconecte ou continue pelo teclado.";
    return;
  }
  if (!document.hasFocus() || document.hidden) {
    controller.suspend();
    controllerState = { ...state, x: 0, z: 0, held: {} };
    return;
  }
  if (modalType === "calibration") {
    const dt = Math.min(0.1, (now - calibrationLast) / 1000);
    calibrationLast = now;
    if (state.raw) calibration.update(state.raw, dt);
    const instruction = CALIBRATION_STEPS[calibration.index];
    if (calibration.phase === "done") {
      if (!calibration.saved) {
        controller.saveProfile(state.id, calibration.bindings);
        calibration.saved = true;
      }
      if (state.pressed.pass) {
        closeModal();
        return;
      }
      $("calibration-prompt").textContent = "Controle configurado!";
      $("calibration-progress").textContent =
        "X chuta · B passe alto · RT corre · LT protege · Menu pausa";
      if (!$("calibration-done")) {
        const button = document.createElement("button");
        button.id = "calibration-done";
        button.className = "primary";
        button.textContent = "Pronto, voltar ao jogo";
        button.onclick = () => closeModal();
        $("modal-body").appendChild(button);
      }
    } else {
      $("calibration-prompt").textContent = !state.raw
        ? "Conecte o controle e pressione um botão."
        : calibration.phase === "neutral"
          ? "Solte os botões e centralize os analógicos."
          : calibration.phase === "release"
            ? `Solte ${instruction[1]}`
            : `Pressione ${instruction[1]}`;
      $("calibration-progress").textContent =
        `${Math.min(9, calibration.index + 1)} de 9`;
    }
    return;
  }
  if (!state.supported) return;
  const pressed = state.pressed;
  if (modalType) {
    if (pressed.cancel || pressed.pause) {
      closeModal();
      return;
    }
    navigateControllerMenu(state, now, $("modal"));
    return;
  }
  if (match.mode === "home") {
    if (pressed.pause) {
      start();
      return;
    }
    navigateControllerMenu(state, now, $("app"));
    return;
  }
  if (pressed.pause) {
    pause();
    return;
  }
  if (match.mode !== "playing") return;
  if (pressed.switch) match.switchPlayer();
  const hasBall = match.ball.owner === match.selected;
  if (pressed.lob && !hasBall) match.tackle(true);
  if (pressed.shoot && !hasBall) match.tackle();
  for (const type of ["pass", "lob", "through", "shoot"]) {
    if (pressed[type] && hasBall && match.beginAction(type, readInput())) {
      shotStartedAt = performance.now();
      shotReleaseDelay = null;
      shotSource = "controller";
      actionButton = type;
    }
  }
  if (shotSource === "controller" && match.charging) {
    if (state.released[actionButton]) shotReleaseDelay = 0;
    if (state.held[actionButton]) shotReleaseDelay = null;
  }
  if (match.charging && shotReleaseDelay === null)
    match.charge = Math.max(
      match.charge,
      Math.min(1, (now - shotStartedAt) / 900),
    );
}
function releaseShot() {
  if (match.charging && match.mode === "playing") {
    match.aimAction(readInput());
    const power = Math.max(
      match.charge,
      Math.min(1, (performance.now() - shotStartedAt) / 900),
    );
    if (match.releaseAction(power, !!controllerState.held.finesse))
      beep(160, 0.1);
  }
  shotSource = null;
  shotReleaseDelay = null;
  actionButton = null;
}

function navigateControllerMenu(state, now, root) {
  const items = [...root.querySelectorAll("button, select")].filter(
    (el) =>
      el.getClientRects().length &&
      !el.disabled &&
      el.id !== "controller-status",
  );
  let focused = document.activeElement;
  if (!items.includes(focused)) {
    focused = modalType ? items[0] : $("start-btn");
    focused?.focus();
  }
  let direction =
    state.z > 0.5
      ? "down"
      : state.z < -0.5
        ? "up"
        : state.x > 0.5
          ? "right"
          : state.x < -0.5
            ? "left"
            : "";
  if (direction && (direction !== menuDirection || now >= nextMenuMove)) {
    const delta = direction === "down" || direction === "right" ? 1 : -1;
    if (
      focused instanceof HTMLSelectElement &&
      (direction === "left" || direction === "right")
    ) {
      focused.selectedIndex =
        (focused.selectedIndex + delta + focused.options.length) %
        focused.options.length;
      focused.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      focused =
        items[(items.indexOf(focused) + delta + items.length) % items.length];
      focused?.focus();
    }
    nextMenuMove = now + (direction === menuDirection ? 180 : 350);
  }
  menuDirection = direction;
  if (state.pressed.pass) {
    if (focused instanceof HTMLSelectElement) {
      focused.selectedIndex =
        (focused.selectedIndex + 1) % focused.options.length;
      focused.dispatchEvent(new Event("change", { bubbles: true }));
    } else focused?.click();
  }
}
