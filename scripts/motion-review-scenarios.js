import { initLocomotion } from "../src/locomotion.js";
import { animateSkinnedAthlete } from "../src/skinned-athlete.js";
import { startSlide } from "../src/gameplay-actions.js";
import { slidePose, fallPose, bicyclePose } from "../src/movement-phases.js";

export const scenarios = [
  {
    id: "partida",
    title: "Partida e aceleração",
    kind: "gait",
    input: { x: 1 },
    warm: 0,
    duration: 1,
  },
  {
    id: "caminhada",
    title: "Caminhada · balanço dos braços",
    kind: "gait",
    input: { x: 0.3, jockey: true },
    warm: 1.3,
    duration: 1.2,
  },
  {
    id: "corrida",
    title: "Corrida · balanço dos braços",
    kind: "gait",
    input: { x: 1 },
    warm: 1.6,
    duration: 1,
  },
  {
    id: "sprint",
    title: "Sprint · balanço dos braços",
    kind: "gait",
    input: { x: 1, sprint: true },
    warm: 2,
    duration: 0.9,
  },
  {
    id: "freada",
    title: "Freada e parada com a sola",
    kind: "stop",
    input: { x: 1, sprint: true },
    warm: 1.6,
    duration: 2.5,
  },
  ...[45, 90, 180].flatMap((angle) =>
    (angle === 180 ? ["esquerda"] : ["direita", "esquerda"]).flatMap((side) =>
      [false, true].map((run) => ({
        id: `giro${angle}-${side}-${run ? "correndo" : "andando"}`,
        title: `${angle}° · ${side} · ${run ? "correndo" : "andando"}`,
        kind: "turn",
        angle,
        side,
        run,
        warm: run ? 1.8 : 1.2,
        duration: run ? 3.6 : 2.6,
      })),
    ),
  ),
  ...[0, 0.3, 1].map((pace, i) => ({
    id: ["chute-parado", "chute-andando", "chute-correndo"][i],
    title: ["Chute parado", "Chute andando", "Chute correndo"][i],
    kind: "shot",
    pace,
    warm: pace ? 1.8 : 0,
    duration: 2.2,
  })),
  {
    id: "cabecada",
    title: "Cabeceio · preparação, salto, contato e aterrissagem",
    kind: "header",
    duration: 1.5,
  },
  {
    id: "carrinho",
    title: "Carrinho · olhar à frente e levantar com as mãos",
    kind: "slide",
    duration: 1.6,
  },
  {
    id: "queda",
    title: "Queda · apoio das mãos e recuperação",
    kind: "fall",
    duration: 2.3,
  },
  {
    id: "esquiva",
    title: "Esquiva · tentativa de salto e queda",
    kind: "evade",
    duration: 1.2,
  },
  {
    id: "goleiro",
    title: "Goleiro · mãos abertas, defesa e recuperação",
    kind: "keeper",
    duration: 2.4,
  },
  {
    id: "bicicleta",
    title: "Bicicleta · perna direita, queda de costas e recuperação",
    kind: "bicycle",
    duration: 2,
  },
  {
    id: "peito-futebol",
    title: "Domínio no peito · futebol",
    kind: "chest",
    duration: 1.5,
  },
  {
    id: "peito-areia",
    title: "Domínio no peito · areia",
    kind: "chest",
    variant: "sand",
    duration: 1.5,
  },
  { id: "celebracao", title: "Comemoração", kind: "celebrate", duration: 1.2 },
  {
    id: "calcanhar-alto",
    title: "Altinha · calcanhar alto",
    kind: "altinha",
    action: "pass",
    y: 1.5,
    input: {},
    back: true,
    duration: 1.2,
  },
  {
    id: "bicicleta-altinha",
    title: "Altinha · bicicleta",
    kind: "altinha",
    action: "pass",
    y: 2.35,
    input: {},
    back: true,
    duration: 1.9,
  },
  ...[
    ["dominada", "Pé", "keep", 0.9, {}],
    ["chapa", "Chapa", "style", 0.9, {}],
    ["trivela", "Trivela", "style", 0.9, { x: 1 }],
    ["cruzado", "Cruzado", "style", 0.9, { x: -1 }],
    ["calcanhar", "Calcanhar", "style", 0.9, { z: 1 }],
    ["coxa", "Coxa", "keep", 1.4, {}],
    ["peito", "Peito", "keep", 1.95, {}],
    ["ombro", "Ombro", "keep", 1.95, {}],
    ["testa", "Testa", "style", 2.1, {}],
    ["volta-ao-mundo", "Volta ao mundo", "trick", 1.1, {}],
  ].map(([id, title, action, y, input]) => ({
    id,
    title: `Altinha · ${title}`,
    kind: "altinha",
    action,
    y,
    input,
    duration: id === "volta-ao-mundo" ? 1.6 : 1.2,
  })),
];

export function installReview(m, s) {
  const update = m.update.bind(m),
    render = s.render.bind(s);
  m.update = () => {};
  s.render = () => {};
  let spec,
    p,
    clock = 0,
    base = 0,
    events = [],
    previousTouch,
    previousStage;
  function tick(input = {}) {
    update(1 / 120, input, {});
    for (const q of m.players) {
      const rig = s.rigs[q.renderId ?? q.id];
      if (rig && q.motion) animateSkinnedAthlete(rig, q, m);
    }
  }
  function begin(g) {
    spec = g;
    clock = 0;
    events = [];
    previousStage = "";
    m.random = () => (g.kind === "evade" ? 0 : 0.99);
    m.start(
      180,
      "normal",
      false,
      g.kind === "altinha"
        ? "altinha"
        : ["fall", "evade"].includes(g.kind)
          ? "street"
          : g.variant || "match",
    );
    m.activeTeam = 0;
    m.multiplayer = false;
    if (g.kind === "altinha") {
      p = m.players[0];
      m.selected = 0;
      m.altinha.receiver = 0;
      m.altinha.phase = "playing";
      if (g.back) {
        p.dx = 0;
        p.dz = 1;
        p.locomotion.heading = 0;
      }
      const h = p.locomotion.heading;
      const shoulder = g.id === "ombro";
      Object.assign(m.ball, {
        x: p.x + Math.sin(h) * 0.28 + (shoulder ? Math.cos(h) * 0.24 : 0),
        z: p.z + Math.cos(h) * 0.28 - (shoulder ? Math.sin(h) * 0.24 : 0),
        y: g.y,
        vy: -0.3,
        vx: 0,
        vz: 0,
      });
      if (g.back) Object.assign(m.ball, { x: p.x, z: p.z - 0.35, vy: -0.5 });
      m.altinhaAction(g.action, g.input);
    } else {
      const originals = m.players;
      p = originals.find((q) => !q.keeper && q.team === 0);
      Object.assign(p, {
        id: 0,
        renderId: 9,
        x: -15,
        z: 0,
        dx: 1,
        dz: 0,
        vx: 0,
        vz: 0,
      });
      m.players = [p];
      m.selected = 0;
      m.controls[1].selected = 0;
      initLocomotion(p);
      Object.assign(m.ball, {
        owner: ["gait", "header", "chest", "bicycle", "keeper"].includes(g.kind)
          ? null
          : 0,
        x: p.x + 0.65,
        z: 0,
        y: 0.11,
        vx: 0,
        vz: 0,
        vy: 0,
      });
      m.kickCooldown = 0;
      if (g.kind === "gait") Object.assign(m.ball, { x: 20, z: 20 });
      let input = g.input || {
        x: g.run ? 1 : 0.3,
        sprint: !!g.run,
        jockey: !g.run,
      };
      if (g.kind === "shot")
        input = { x: g.pace, sprint: g.pace === 1, jockey: g.pace === 0.3 };
      for (let i = 0; i < Math.round((g.warm || 0) * 120); i++) tick(input);
      if (g.kind === "shot") m.beginAction("shoot", { x: 1 });
      if (g.kind === "header") {
        Object.assign(m.ball, {
          x: p.x,
          z: -5,
          y: 2,
          vx: 0,
          vz: 10,
          vy: 2.8,
          owner: null,
        });
        m.beginAction("shoot", {});
        m.releaseAction(0.7);
      }
      if (g.kind === "bicycle") {
        Object.assign(p, { x: 36, dx: -1, dz: 0 });
        initLocomotion(p);
        Object.assign(m.ball, {
          x: 36.9,
          z: 0,
          y: 2.15,
          vx: -3,
          vz: 0,
          vy: 0,
          owner: null,
          lastTeam: 0,
        });
        m.beginAction("shoot", {});
        m.releaseAction(0.7);
      }
      if (g.kind === "chest")
        Object.assign(m.ball, {
          x: p.x + 2,
          z: 0,
          y: 1.85,
          vx: -5,
          vz: 0,
          vy: 0.2,
          owner: null,
          lastTeam: 1,
        });
      if (g.kind === "slide") {
        m.ball.owner = null;
        Object.assign(m.ball, { x: p.x + 2, y: 0.11 });
        startSlide(m, p);
      }
      if (g.kind === "fall" || g.kind === "evade") {
        const q = originals.find((q) => q.team === 1 && !q.keeper);
        Object.assign(q, {
          id: 1,
          renderId: 12,
          x: p.x + (g.kind === "evade" ? 1.6 : 2),
          z: 0,
          dx: -1,
          dz: 0,
          vx: 0,
          vz: 0,
        });
        initLocomotion(q);
        m.players.push(q);
        m.controls[1].selected = 1;
        Object.assign(m.ball, { owner: null, x: p.x - 4, z: 2 });
        startSlide(m, q);
      }
      if (g.kind === "keeper") {
        const keeper = originals.find((q) => q.keeper && q.team === 0);
        Object.assign(keeper, {
          id: 0,
          renderId: 0,
          x: -43,
          z: 0,
          dx: 1,
          dz: 0,
          vx: 0,
          vz: 0,
        });
        initLocomotion(keeper);
        Object.assign(p, { id: 1, x: -20, z: 15 });
        initLocomotion(p);
        m.players = [keeper, p];
        m.selected = 1;
        p = keeper;
        Object.assign(m.ball, {
          owner: null,
          x: -30,
          y: 1.2,
          z: 0,
          vx: -20,
          vy: 4.9 * 0.6325,
          vz: 2 / 0.6325,
          lastTeam: 1,
        });
        tick({});
      }
      if (g.kind === "celebrate") {
        m.mode = "goal";
        m.lastGoalTeam = 0;
        m.restartTimer = 5;
      }
    }
    base = m.elapsed;
    previousTouch = m.lastTouch?.time;
    for (const rig of s.rigs) {
      rig.handSupport = null;
      rig.groundHands = [];
      rig.legs.forEach((l) => (l.anchor = null));
    }
    return summary();
  }
  function stage() {
    if (p.header) return `cabeceio:${p.header.mode}`;
    if (p.slide) return `carrinho:${slidePose(p.slide.time).phase}`;
    if (p.knockdown) return `queda:${fallPose(p.knockdown.time).phase}`;
    if (p.evade) return "esquiva:salto";
    if (p.celebration) return "comemoração";
    if (p.bicycle)
      return `bicicleta:${bicyclePose(p.bicycle.time, p.bicycle.contactAt).phase}`;
    if (p.chestTrap)
      return p.chestTrap.hitAt == null
        ? "peito:preparação"
        : "peito:amortecimento";
    if (p.turnAction)
      return `virada:${p.turnAction.phase}:${p.turnAction.segment}`;
    if (p.goalkeeping) return `goleiro:${p.goalkeeping.mode}`;
    if (p.ballMotion)
      return `pé:${p.ballMotion.style || p.ballMotion.kind}:${p.ballMotion.hit ? "contato" : "preparação"}`;
    if (p.altinhaPose?.kind === "bicycle") {
      const a = p.altinhaPose;
      return `bicicleta:${bicyclePose(m.elapsed - a.startedAt, (a.hitAt ?? a.bicycleContactAt) - a.startedAt).phase}`;
    }
    if (p.altinhaPose)
      return `${p.altinhaPose.kind}:${p.altinhaPose.hitAt == null ? p.altinhaPose.stage || "preparação" : "contato"}`;
    return p.locomotion.mode;
  }
  function advance(to) {
    while (clock + 1 / 240 < to) {
      if (spec.kind === "shot" && clock < 0.16 && clock + 1 / 120 >= 0.16)
        m.releaseAction(0.7, !!spec.finesse);
      let input = {};
      if (spec.kind === "gait") input = spec.input;
      if (spec.kind === "turn") {
        const a =
          ((spec.angle * Math.PI) / 180) * (spec.side === "direita" ? -1 : 1);
        input = {
          x: Math.cos(a) * (spec.run ? 1 : 0.35),
          z: -Math.sin(a) * (spec.run ? 1 : 0.35),
          sprint: spec.run,
          jockey: !spec.run,
        };
      }
      tick(input);
      clock += 1 / 120;
      const st = stage();
      if (st !== previousStage) {
        events.push({ t: clock, label: st });
        previousStage = st;
      }
      if (m.lastTouch?.time !== previousTouch) {
        previousTouch = m.lastTouch?.time;
        events.push({ t: clock, label: `toque:${m.lastTouch?.kind}` });
      }
      if (
        m.lastShot &&
        m.lastShot.contactAt >= base &&
        !events.some((e) => e.label === "contato:chute")
      )
        events.push({ t: clock, label: "contato:chute" });
      if (
        m.altinha?.lastTouch?.at >= base &&
        !events.some((e) => e.label === "contato:altinha")
      )
        events.push({ t: clock, label: "contato:altinha" });
      if (
        p.header?.load > 0.97 &&
        !events.some((e) => e.label === "salto:impulsão")
      )
        events.push({ t: clock, label: "salto:impulsão" });
      if (
        p.chestTrap?.hitAt != null &&
        !events.some((e) => e.label === "contato:peito")
      )
        events.push({ t: clock, label: "contato:peito" });
      if (m.lastSave && !events.some((e) => e.label === "contato:defesa"))
        events.push({ t: clock, label: "contato:defesa" });
      if (
        p.slide?.hitBall &&
        !events.some((e) => e.label === "contato:carrinho")
      )
        events.push({ t: clock, label: "contato:carrinho" });
    }
    return summary();
  }
  function summary() {
    return {
      time: clock,
      stage: stage(),
      events,
      footedness: p.footedness,
      player: { x: p.x, z: p.z, vx: p.vx, vz: p.vz },
      ball: { ...m.ball },
      shot: m.lastShot,
      reception: m.lastReception,
      turn: p.turnAction,
      header: p.header,
      feet: p.locomotion.feet.map((f) => ({
        x: f.x,
        y: f.y,
        z: f.z,
        contact: f.contact,
        special: f.special,
      })),
      hands: s.rigs[p.renderId ?? p.id]?.groundHands || [],
    };
  }
  function draw() {
    render(m, 0);
    s.ring.visible = s.marker.visible = s.landingMarker.visible = false;
    s.ballMesh.visible = spec.kind !== "gait";
    s.ballShadow.visible = spec.kind !== "gait";
    s.altinhaEffects.root.visible = false;
    s.pressRing.visible = s.shotBurst.visible = false;
    s.trail.forEach((o) => (o.visible = false));
    s.playerEffects.rows.forEach((o) => (o.root.visible = false));
    for (const q of m.players)
      if (q !== p) s.rigs[q.renderId ?? q.id].root.visible = false;
    const h = spec.kind === "bicycle" ? Math.PI * 1.5 : Math.PI / 2;
    s.camera.position.set(
      p.x + Math.sin(h) * 3.7 + Math.cos(h) * 2.4,
      2.2,
      p.z + Math.cos(h) * 3.7 - Math.sin(h) * 2.4,
    );
    s.camera.lookAt(p.x, 1.05, p.z);
    s.renderer.render(s.scene, s.camera);
  }
  return { begin, advance, draw, summary };
}
