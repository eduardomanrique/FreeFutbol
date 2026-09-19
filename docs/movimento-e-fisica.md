# Movimento e física: pesquisa e implementação

Atualizado em 17/09/2026. A implementação anterior aplicava princípios de passada e contato em um boneco procedural. A versão atual integra uma biblioteca de animações esqueléticas, busca de poses, curvas de distância, transições inerciais, correção da trajetória e Rapier/WASM. São implementações próprias; não utilizam código da Unreal.

## Sistemas ativos no jogo

| Técnica | Implementação | Limite atual |
| --- | --- | --- |
| Motion matching | `src/motion-matching.js` busca frames por posição/velocidade dos pés, velocidade do corpo e trajetória futura em três horizontes; pesquisa a 10 Hz por atleta. | Base pequena com idle, caminhada, corrida e sprint para frente. Mudanças de direção ainda dependem da rotação do corpo; não há biblioteca completa de cortes e giros. |
| Distance matching | Curvas acumuladas de distância por clip; inversão da curva faz a fase avançar pelos metros realmente percorridos após colisões. | Distâncias normalizadas para velocidades nominais, pois os clips são in-place. Sem clips específicos de partida e frenagem. |
| Inertialization | Diferenças de pose e velocidade linear/angular decaem ao entrar em um novo clip. | Transição customizada, com limites para evitar overshoot. |
| Root/stride warping | Janela de 0,24 s adapta a trajetória de aproximação até 24 cm ao alvo de preparação/recepção; Rapier resolve a correção contra obstáculos. Carga maior reduz cadência e amplia a perna livre. | Correção aditiva sobre o controlador, não reprodução de uma trajetória de root motion capturada. |
| Foot locking / IK | Apoio nos dedos com correção quadril–joelho–tornozelo sobre a pose animada, preservando o plano do joelho e a orientação do tornozelo. | Bacia ajustada à extensão possível das pernas. Alvos liberados quando ficam fora do alcance; não garante ausência de deslizamento em toda transição brusca. |
| Contato físico | Rapier 0.20.0/WASM, passo de 120 Hz, 22 cápsulas de 78 kg, bola de 0,43 kg, traves, chão, CCD e resposta normal/tangencial. | Cápsulas verticais com rotações bloqueadas, sem membros físicos nem ragdoll. |
| Equilíbrio e propulsão | Modelo reduzido de centro de massa, gravidade, forças de apoio e aderência governa a intenção de movimento. Reações de impacto modificam tronco e animação. | Não há músculos ou controlador de torques de um humano completo. Apoios físicos e pose capturada ainda são camadas distintas. |

O personagem agora tem uma malha contínua com skin e 65 ossos, retargeting offline, materiais de uniforme, cabelo e calçados. Os assets livres de Quaternius são CC0. A biblioteca padrão oferece locomoção geral: o chute foi criado como sequência própria de keyframes, sem alegar captura profissional de futebol. [Créditos e proveniência](../public/assets/athlete/CREDITS.md).

## Bola e interação

Chutes variam de 9 a 45 m/s conforme a carga, agendados ao soltar X/Espaço e liberados no contato do pé. Toques curtos recebem pouca elevação. Resistência de rolagem explícita: 5,8 m/s² + 0,085 × velocidade; arrasto quadrático no ar. Rapier acrescenta atrito de contato e restituição nos impactos. A bola chega ao repouso, sem manter velocidade constante.

Teste atual em gramado Rapier livre, sem jogadores: bolas rasteiras a 5 e 10 m/s param em aproximadamente **1,63 e 6,84 metros**, respectivamente. São parâmetros do jogo, não medições de gramado real. O integrador analítico usado para previsão curta possui valores ligeiramente diferentes (2,03 e 7,82 m), pois não reproduz contatos Rapier. Chutes fortes podem sair antes de parar.

A recepção usa quatro faixas em `src/reception.js`: corpo (raio 0,48 m, até 1,9 m de altura), perto (0,85 m), médio (1,30 m) e longo (2,25 m para planejar; o domínio exige aproximação até 1,12 m e proximidade real do pé). Todas as faixas tentam domínio automaticamente; médio/longo aproximam o pé/corpo, sem cone obrigatório de direcional. O jogador parado/andando vira-se para a bola e respeita comando de afastamento. As chances nominais são 99,9%, 98%, 95% e 90%, sorteadas uma vez por tentativa. A categoria não melhora automaticamente à medida que o jogador se aproxima, e uma falha não é repetida a cada frame. Contatos são verificados antes do passo Rapier para evitar que passes rápidos rebatam antes da tentativa. A previsão olha até 0,33 s; não há domínio de bolas fora da altura/alcance elegíveis.

A bola é dinâmica inclusive durante a posse. Condução usa impulsos discretos em contatos varridos do pé; não existe seguidor por alvo fixo. A preparação captura o deslocamento e redireciona a entrada para mira. Soltar agenda uma trajetória da perna livre; contato libera passe/chute. Passes calculam potência pela distância; finalizações usam índice de precisão por potência/distância. Giro, calcanhar e queda são camadas procedurais de corpo/IK; a mão do lado da queda busca o chão e participa da recuperação. Não é colisão articulada completa nem ragdoll.

Referência normativa: [regras da mecânica](regras-da-mecanica.md), incluindo os números e distinção entre pedidos e escolhas de implementação.

## Arquitetura e desempenho

1. Entrada/IA determina a intenção; o modelo reduzido calcula deslocamento e equilíbrio.
2. A janela de interação acrescenta correção limitada de trajetória.
3. Rapier resolve cápsulas, bola, gramado e traves, com CCD.
4. O controlador consulta a base e avança a animação pela distância resolvida.
5. Three.js aplica a pose à skin, a reação do tronco e o IK de contato.

A preparação da biblioteca acontece offline em `scripts/build-motion-library.mjs`. O navegador carrega somente poses retargetadas e os assets de renderização; não processa a biblioteca fonte inteira. A base utiliza cerca de 359 KiB de poses e 72 KiB de metadados, além de modelo e texturas. Rapier e Three.js estão em chunks separados para cache.

`tests/motion.test.js` verifica dados esqueléticos, busca de fases, inversão da curva, correção de trajetória e integração na partida. `tests/rapier.test.js` mede colisão entre massas, conservação de momento, repouso e CCD a 90 m/s contra uma trave fina. Os testes antigos do boneco procedural permanecem como testes do controlador reduzido; não constituem prova de qualidade da nova skin.

## Fontes primárias

- [Epic — Motion Matching](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine).
- [Epic — Distance Matching](https://dev.epicgames.com/documentation/unreal-engine/distance-matching-in-unreal-engine?lang=en-US).
- [Epic — Motion Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-warping-in-unreal-engine).
- [Daniel Holden — Inverse Kinematics and Foot Locking](https://theorangeduck.com/page/inverse-kinematics-foot-locking).
- [Daniel Holden — Spring-Roll-Call](https://theorangeduck.com/page/spring-roll-call).
- [Rapier — JavaScript rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/).
- [Rapier — Character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/). Referência de integração; o jogo usa cápsulas dinâmicas, não esse controller cinemático.
- [Quaternius — Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html).
- [Quaternius — Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html).

A estrutura está implementada, mas a qualidade final ainda é de protótipo. Para aproximar-se de jogos modernos, faltam principalmente animações de futebol de maior qualidade e variedade, transições multidirecionais, domínio progressivo e sincronização detalhada de pé e bola.

## Ajuste de percepção da passada e repouso

A seleção agora tem faixas com histerese para caminhada, corrida e sprint. A amplitude e a altura do pé são menores ao andar; a fase de animação compensa a amplitude para continuar seguindo o deslocamento. A propulsão começa limitada a 6,4 m/s² e diminui com a velocidade, sempre respeitando contato e aderência. Em teste sem oposição, sprint atinge cerca de 3 m/s em 0,5 s, 5,25 m/s em 1 s e 8,36 m/s em 2 s. Inclinação de corpo e tronco respondem à aceleração e diminuem depois da arrancada.

O atrito agora dissipa também a rotação física residual da bola; abaixo do limiar de repouso, velocidades linear e angular são zeradas juntas. Cargas baixas de chute usam curva menos agressiva (9 + 36 × carga^1,1), preservando o máximo de 45 m/s. Na calibração anterior de17/09, testes com chutes de carga0%,10% e25% pararam após aproximadamente 13,8, 23,7 e 43,7 metros e não se moveram novamente nos dez segundos simulados sem interferência. Chutes fortes ainda podem sair antes de parar.

## Ritmo e domínio assistido — 18/09/2026

Velocidade desejada dos jogadores multiplicada por 1,15; propulsão máxima de 7,55 m/s², limitada pelo apoio/aderência. Intervalo físico das passadas reduzido em 10%; cadência visual de caminhada e corrida acelerada; gestos de chute terminam 15% mais rápido. Faixas de seleção de animação foram ajustadas para conservar corrida normal versus sprint.

`tests/reception.test.js` verifica os quatro limiares de probabilidade sobre 10.000 valores uniformemente distribuídos, classificação automática, bolas rápidas, falha sem repetição e espera pela passada. Cenários reais em navegador verificam corpo/perto sem comando, médio/longo sem comando com aproximação e saída voluntária do alcance. Isso valida o mecanismo, não promete a mesma porcentagem observada em uma amostra pequena ou disputas entre vários jogadores.

## Revisão de condução e recepção — 18/09/2026

Planejamento por próximo contato: impulso de acordo com velocidade, aceleração e resistência da grama, seguido de fase livre. Preferência pelo direito; corrida permite maior avanço e mais passadas entre toques. Aproximação automática recupera bolas adiantadas sem cancelar posse por distância; curvas/frenagens antecipam correção. Percepção da recepção considera velocidade relativa e permanece ativa durante cooldown de gesto. Detalhes, fontes e limites em [pesquisa-conducao.md](pesquisa-conducao.md); requisitos em [regras-da-mecanica.md](regras-da-mecanica.md).
