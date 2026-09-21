// Preview-only profiles. Physical dimensions and match rules are unchanged.
export const ATHLETE_PROFILES = [
  {
    id: "base",
    label: "Jogador base",
    role: "Linha",
    scale: [1, 1, 1],
    note: "Modelo masculino Quaternius já usado na partida.",
  },
  {
    id: "slim",
    label: "Variação corporal",
    role: "Linha",
    scale: [0.9, 1, 0.94],
    note: "Variação de largura para avaliação visual. Mesmo modelo e rig; não é um novo modelo feminino nem altera a física.",
  },
  {
    id: "keeper",
    label: "Goleiro",
    role: "Gol",
    scale: [1, 1, 1],
    note: "Mesmo esqueleto, uniforme de goleiro. As defesas procedurais são avaliadas na partida; ainda não há clips de defesa.",
  },
];

export const CLIP_LABELS = {
  idle: "Em espera",
  walk: "Caminhada",
  jog: "Corrida",
  sprint: "Sprint",
  impact: "Reação a impacto",
  kick: "Chute experimental",
};

// This is a gap inventory, not a claim that procedural gameplay is mocap.
export const SLICE_COVERAGE = [
  {
    id: "locomotion",
    label: "Caminhada e corrida",
    status: "provisional",
    detail: "Clips CC0 retargetados. Locomoção geral, não esportiva.",
  },
  {
    id: "braking",
    label: "Frenagem e mudança de direção",
    status: "procedural",
    detail: "Ajuste procedural no jogo; faltam clips esportivos dedicados.",
  },
  {
    id: "dribble",
    label: "Condução com os dois pés",
    status: "procedural",
    detail:
      "Contatos procedurais na partida; falta biblioteca bilateral de futebol.",
  },
  {
    id: "passes",
    label: "Passe curto, longo e cruzamento",
    status: "procedural",
    detail:
      "Compartilham gestos procedurais; precisam de captura ou autoria específica.",
  },
  {
    id: "strike",
    label: "Chute",
    status: "procedural",
    detail: "Sequência experimental própria, sem captura de movimento.",
  },
  {
    id: "header",
    label: "Cabeceio",
    status: "procedural",
    detail: "Implementado proceduralmente na partida; sem clip capturado.",
  },
  {
    id: "tackle",
    label: "Carrinho e disputa corporal",
    status: "procedural",
    detail:
      "Lógica existente e reação genérica; falta interação coordenada entre dois atletas.",
  },
  {
    id: "fall",
    label: "Queda e recuperação",
    status: "procedural",
    detail:
      "Correção procedural de apoio; requer autoria esportiva para o slice final.",
  },
  {
    id: "keeper",
    label: "Defesas de goleiro",
    status: "procedural",
    detail:
      "IK e movimento procedural no jogo; faltam clips específicos de defesa e recuperação.",
  },
  {
    id: "celebration",
    label: "Comemoração simples",
    status: "missing",
    detail: "Clip ainda não selecionado; pode ser provisório no slice.",
  },
];

export const STATUS_LABELS = {
  provisional: "Provisório",
  procedural: "Procedural no jogo",
  missing: "Pendente",
};

export function profileById(id) {
  return ATHLETE_PROFILES.find((p) => p.id === id) || ATHLETE_PROFILES[0];
}

export function previewTime(time, clip) {
  const end = (clip.count - 1) / clip.fps;
  return clip.loop
    ? ((time % clip.duration) + clip.duration) % clip.duration
    : Math.max(0, Math.min(end, time));
}
