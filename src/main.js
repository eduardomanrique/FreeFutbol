import { loadAthleteAssets } from "./skinned-athlete.js";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "./style.css";
import { OnlineClient } from "./network/client.js";
import { Match } from "./simulation.js";
import { Stadium } from "./scene.js";
import { TouchInput } from "./touch.js";
import { possessionTeam } from "./possession.js";
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
const online = new OnlineClient({
  onRoom(room, team) {
    $("online-code").textContent = room.code;
    $("duration").value = String(room.duration);
    $("network-mode").value = room.networkMode;
    $("network-mode").disabled = true;
    $("online-members").textContent = room.players
      .map(
        (p, i) =>
          `${i === 0 ? "Atlético" : "União"}: ${!p ? "vaga livre" : !p.connected ? "reconectando" : p.ready ? "pronto" : "na sala"}`,
      )
      .join(" · ");
    $("online-ready").hidden = room.status !== "waiting";
    $("online-ready").textContent = room.players[team]?.ready
      ? "Ainda não estou pronto"
      : "Estou pronto";
    $("online-start").hidden = team !== 0 || room.status !== "waiting";
    $("online-start").disabled = !room.players.every(
      (p) => p?.connected && p.ready,
    );
    $("online-lobby").hidden = false;
    $("online-entry").hidden = true;
    $("game-mode").disabled = true;
    $("duration").disabled = true;
    $("network-banner").hidden = false;
  },
  onStart() {
    keys.clear();
    controller.suspend();
    shotSource = null;
    closeModal(false);
    setPlaying(true);
  },
  onEnd(reason) {
    closeModal(false);
    keys.clear();
    shotSource = null;
    match.activeTeam = 0;
    match.multiplayer = false;
    match.distributed = null;
    $("network-mode").disabled = false;
    match.training = false;
    match.mode = "home";
    match.resetPlayers();
    setPlaying(false);
    $("online-lobby").hidden = true;
    $("online-entry").hidden = false;
    $("game-mode").disabled = false;
    $("network-banner").hidden = true;
    $("online-message").textContent = reason || "";
    updateModeDescription();
  },
  onStatus(message) {
    $("online-message").textContent = message;
    $("network-banner").textContent = message;
  },
});
const mobileQuery = matchMedia("(any-pointer: coarse)");
let mobile = mobileQuery.matches || navigator.maxTouchPoints > 0;
const touch = new TouchInput($("touch-controls"), {
  active: () => mobile && match.mode === "playing" && !modalType,
  rotated: () => document.body.classList.contains("landscape-fallback"),
  press(action) {
    if (action === "switch") return gameAction("switchPlayer");
    if (action === "tackle") return gameAction("tackle");
    if (!["pass", "lob", "through", "shoot"].includes(action)) return;
    if (possessionTeam(match) !== (online.active ? online.team : 0)) {
      if (action === "shoot" || action === "lob")
        gameAction("tackle", action === "lob");
      return;
    }
    if (shotSource) return;
    if (gameAction("beginAction", action, readInput())) {
      shotStartedAt = performance.now();
      shotReleaseDelay = null;
      shotSource = "touch";
      actionButton = action;
    }
  },
  release(action) {
    if (shotSource === "touch" && actionButton === action) releaseShot();
  },
  cancel(action) {
    if (shotSource === "touch" && (!action || action === actionButton)) {
      gameAction("cancelAction");
      shotSource = actionButton = shotReleaseDelay = null;
    }
  },
});
function mobileLayout() {
  mobile = mobileQuery.matches || navigator.maxTouchPoints > 0;
  const playing = document.body.classList.contains("playing");
  document.body.classList.toggle("mobile", mobile);
  document.body.classList.toggle(
    "landscape-fallback",
    mobile && playing && innerWidth < innerHeight,
  );
  $("touch-controls").hidden = !mobile || !playing || !!modalType;
  stadium.resize();
}
async function mobileFullscreen() {
  if (!mobile) return;
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen?.();
  } catch {
    /* Safari and embedded browsers may refuse fullscreen. */
  }
  try {
    await screen.orientation?.lock?.("landscape");
  } catch {}
  mobileLayout();
}
mobileQuery.addEventListener("change", mobileLayout);
window.addEventListener("resize", () => {
  touch.reset();
  mobileLayout();
});
window.visualViewport?.addEventListener("resize", mobileLayout);
document.addEventListener("fullscreenchange", mobileLayout);
mobileLayout();

function gameAction(method, ...args) {
  if (!online.active) return match[method](...args);
  if (method === "beginAction") return online.action("begin", args[0]);
  if (method === "releaseAction") return online.action("release");
  if (method === "switchPlayer") return online.action("switch");
  if (method === "tackle") return online.action(args[0] ? "slide" : "tackle");
  if (method === "cancelAction") return online.action("cancel");
}
async function enterOnline(join) {
  const buttons = [$("online-create"), $("online-join")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    const code = join ? $("room-code").value.trim().toUpperCase() : "";
    if (join && !/^[A-Z2-9]{6}$/.test(code))
      throw new Error("Digite o código de 6 caracteres.");
    await online.enter(
      code,
      Number($("duration").value),
      $("network-mode").value,
    );
  } catch (error) {
    $("online-message").textContent = error.message;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
$("online-create").onclick = () => enterOnline(false);
$("online-join").onclick = () => enterOnline(true);
$("online-ready").onclick = () => {
  mobileFullscreen();
  online.send({
    type: "ready",
    value: !online.room?.players[online.team]?.ready,
  });
};
$("online-start").onclick = () => {
  mobileFullscreen();
  online.send({ type: "start" });
};
$("online-leave").onclick = () => online.leave();
$("online-share").onclick = async () => {
  const link = new URL(location.href);
  link.search = "";
  link.searchParams.set("room", online.room.code);
  try {
    await navigator.clipboard.writeText(link.href);
    $("online-message").textContent = "Link copiado.";
  } catch {
    $("online-message").textContent = `Convide pelo código ${online.room.code}`;
  }
};
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
  touch.reset();
  mobileLayout();
  if (!on) {
    screen.orientation?.unlock?.();
    if (mobile && document.fullscreenElement)
      document.exitFullscreen?.().catch(() => {});
  }
}
function updateModeDescription() {
  const isOnline = $("game-mode").value === "online";
  document.body.classList.toggle("online-mode", isOnline);
  document.querySelector(".hero-bottom b").textContent = isOnline
    ? "Você contra outra pessoa."
    : "Você contra a máquina.";
  $("online-panel").hidden = !isOnline;
  $("connection-label").textContent = isOnline ? "ONLINE" : "LOCAL";
  document.querySelector(".card-top .chip").textContent = isOnline
    ? "ONLINE"
    : "AMISTOSO";
  $("start-btn").hidden = isOnline;
  $("difficulty").disabled = isOnline;
  const training = $("game-mode").value === "training";
  $("game-mode-help").textContent = training
    ? "Adversários parados, incluindo o goleiro. Treino sem limite de tempo."
    : isOnline
      ? "Convide alguém e jogue com um time de cada lado."
      : "Partida com adversários em movimento e tempo regulamentar.";
  $("duration").disabled = training;
  $("duration").setAttribute(
    "aria-label",
    training ? "Duração ignorada na Arena de treino" : "Duração da partida",
  );
}
function start() {
  mobileFullscreen();
  if ($("game-mode").value === "online") return;
  if (online.active) online.leave();
  match.activeTeam = 0;
  match.multiplayer = false;
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
  touch.reset();
  if (modalType === null) {
    previousMode = match.mode;
    if (!online.active && (match.mode === "playing" || match.mode === "goal"))
      match.mode = "paused";
  }
  keys.clear();
  gameAction("cancelAction");
  shotSource = null;
  shotReleaseDelay = null;
  controller.suspend();
  modalType = type;
  mobileLayout();
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
        ["Cabecear cruzamento ao gol · antes da bola chegar", "X / ESPAÇO"],
        ["Passe de cabeça · antes da bola chegar", "A / J"],
        ["Trocar jogador", "LB / Q"],
        ["Desarmar / carrinho", "X no teclado · X / B no controle"],
        ["Passe em profundidade", "Y / I"],
        ["Proteger / marcar", "LT"],
        ["Chute colocado · segurar RB ao soltar X", "RB + X"],
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
  if (type === "controls" && mobile) {
    body =
      '<p class="modal-note">Arraste o analógico à esquerda para mover; a distância do centro controla a velocidade. Puxe até a borda para correr; recue o dedo para reduzir a velocidade. Com posse, use Passe, Alto e Chute; mantenha Proteger pressionado para proteger a bola. Segure os botões de passe ou chute para carregar e solte para executar; use o analógico para mirar. Em cruzamentos, pressione Chute antes da chegada para cabecear ao gol, ou Passe para escorar. Sem posse, aparecem apenas Trocar e Desarme. Durante um passe, os botões continuam no modo do time que tocou por último. Use Ⅱ para abrir o menu.</p><p class="modal-note">A partida permanece horizontal e solicita tela cheia. Se o navegador bloquear, tente Tela cheia no menu; no iPhone, abra pelo ícone após adicionar o jogo à Tela de Início para ocultar as barras.</p>';
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
  if (type === "pause" && mobile) {
    body +=
      '<button id="mobile-fullscreen" class="secondary">Tela cheia</button><p id="fullscreen-help" class="modal-note" role="status"></p>';
  }
  $("modal-body").innerHTML = body;
  $("mobile-fullscreen")?.addEventListener("click", async () => {
    await mobileFullscreen();
    const help = $("fullscreen-help");
    if (
      help &&
      !document.fullscreenElement &&
      !matchMedia("(display-mode: standalone)").matches &&
      !navigator.standalone
    )
      help.textContent =
        "Este navegador não liberou tela cheia. No iPhone: Compartilhar → Adicionar à Tela de Início; abra o jogo pelo ícone.";
  });
  if (online.active) {
    $("restart")?.remove();
    if (type === "pause") {
      $("modal-title").textContent = "Menu da partida";
      $("modal-body").querySelector(".modal-note").textContent =
        "A partida online continua. Seus comandos ficam neutros enquanto este menu está aberto.";
    }
  }
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
  $("resume")?.addEventListener("click", () => {
    mobileFullscreen();
    closeModal();
  });
  $("restart")?.addEventListener("click", start);
  $("leave")?.addEventListener("click", () => {
    if (online.active) {
      online.leave();
      return;
    }
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
  mobileLayout();
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
  if (
    e.target instanceof HTMLSelectElement ||
    e.target instanceof HTMLInputElement
  )
    return;
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
  if (e.code === "KeyQ") gameAction("switchPlayer");
  if (e.code === "KeyX") gameAction("tackle");
  const type = { KeyJ: "pass", KeyL: "lob", Space: "shoot", KeyI: "through" }[
    e.code
  ];
  if (type && gameAction("beginAction", type, readInput())) {
    shotStartedAt = performance.now();
    shotReleaseDelay = null;
    shotSource = "keyboard";
    actionButton = e.code;
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === actionButton && shotSource === "keyboard") {
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
  if (modalType) return { x: 0, z: 0 };
  if (online.active && (modalType || document.hidden || !document.hasFocus()))
    return { x: 0, z: 0 };
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
  if (!input.x && !input.z) {
    input.x = touch.x;
    input.z = touch.z;
  }
  input.sprint ||= !!controllerState.held.sprint || !!touch.held.sprint;
  input.jockey = !!controllerState.held.jockey || !!touch.held.shield;
  input.finesse = !!controllerState.held.finesse;
  return input;
}
function step(dt) {
  const input = readInput();
  if ((match.charging || online.active) && shotReleaseDelay !== null) {
    shotReleaseDelay += dt;
    if (shotReleaseDelay >= 0.065) releaseShot();
  }
  if (online.active) online.update(dt, input, match);
  else match.update(dt, input);
  hudAccumulator += dt;
  if (hudAccumulator > 0.075) {
    updateHUD();
    hudAccumulator = 0;
  }
  if (match.mode === "finished" && !modalType) showModal("finished");
}
function updateHUD() {
  const attacking = possessionTeam(match) === (online.active ? online.team : 0);
  if (touch.attacking !== attacking) {
    touch.resetActions();
    touch.attacking = attacking;
    document.querySelectorAll("[data-possession]").forEach((button) => {
      button.hidden = (button.dataset.possession === "attack") !== attacking;
    });
  }
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
  $("mode-indicator").textContent = training
    ? "ARENA DE TREINO"
    : online.active
      ? `ONLINE · ${online.rtt} ms`
      : "AMISTOSO";
  $("score").innerHTML = `${match.score[0]} <span>:</span> ${match.score[1]}`;
  let p = match.players[match.selected];
  $("player-team").textContent = p.team === 0 ? "ATLÉTICO" : "UNIÃO";
  $("pause-btn").setAttribute(
    "aria-label",
    online.active ? "Menu da partida" : "Pausar",
  );
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
    network: {
      active: online.active,
      team: online.team,
      room: online.room?.code,
      status: online.room?.status,
      tick: online.tick,
      ack: online.lastAck,
      rtt: online.rtt,
      bytes: online.bytes,
      architecture: online.room?.networkMode,
      ballAuthority: online.teamSimulation?.authority,
      ballEpoch: online.teamSimulation?.epoch,
      metrics: online.teamSimulation?.stats,
    },
    controller: {
      connected: controllerState.connected,
      supported: controllerState.supported,
      id: controllerState.id,
      mapping: controllerState.mapping,
      x: controllerState.x,
      z: controllerState.z,
    },
    touch: {
      enabled: mobile,
      rotated: document.body.classList.contains("landscape-fallback"),
      x: touch.x,
      z: touch.z,
      held: touch.held,
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
  window.__test = {
    match,
    stadium,
    online,
    step: (ms) => window.advanceTime(ms),
  };
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
const inviteCode = new URLSearchParams(location.search).get("room");
if (inviteCode) {
  $("game-mode").value = "online";
  $("room-code").value = inviteCode.toUpperCase();
}
online.resume();
if (online.active) $("game-mode").value = "online";
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
  if (pressed.switch) gameAction("switchPlayer");
  const defending = possessionTeam(match) !== (online.active ? online.team : 0);
  if (pressed.lob && defending) gameAction("tackle", true);
  if (pressed.shoot && defending) gameAction("tackle");
  for (const type of ["pass", "lob", "through", "shoot"]) {
    if (
      pressed[type] &&
      (!defending || type === "pass" || type === "through") &&
      gameAction("beginAction", type, readInput())
    ) {
      shotStartedAt = performance.now();
      shotReleaseDelay = null;
      shotSource = "controller";
      actionButton = type;
    }
  }
  if (shotSource === "controller") {
    if (state.released[actionButton]) shotReleaseDelay = 0;
    if (state.held[actionButton]) shotReleaseDelay = null;
  }
  if (!online.active && match.charging && shotReleaseDelay === null)
    match.charge = Math.max(
      match.charge,
      Math.min(1, (now - shotStartedAt) / 900),
    );
}
function releaseShot() {
  if ((match.charging || online.active) && match.mode === "playing") {
    if (!online.active) match.aimAction(readInput());
    const power = Math.max(
      match.charge,
      Math.min(1, (performance.now() - shotStartedAt) / 900),
    );
    if (gameAction("releaseAction", power, readInput().finesse)) beep(160, 0.1);
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
