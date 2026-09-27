> Pesquisa histórica anterior à migração. O branch `codex/babylon-havok` agora renderiza com Babylon e simula colisões com Havok; números identificados como Rapier abaixo pertencem à versão anterior. Consulte o README para arquitetura atual.

# Movimento: referências e escolhas do jogo

## Chute em movimento

O estudo de Augustus, Hudson e Smith (2021) descreve como a perna de apoio regula a desaceleração do corpo e a transferência de movimento para a pelve e a perna de chute: [registro do estudo](https://eprints.chi.ac.uk/id/eprint/5781/). A sequência entre segmentos também depende do ângulo de aproximação: [Augustus et al., 2024](https://doi.org/10.1016/j.jbiomech.2023.111920).

No jogo: preparação mais longa, apoio à frente na posição prevista da bola e golpe mais rápido. A velocidade horizontal perde no máximo 6% suavemente durante o apoio; a frenagem normal retorna quando o pé que chutou aterrissa. **6% é um ajuste visual de gameplay, não um valor medido nesses estudos.** Colisões podem interromper a sequência.

## Cabeceio

A orientação do corpo e o momento do contato são relevantes para direcionar o cabeceio: [FIFA Training Centre](https://www.fifatrainingcentre.com/en/practice/beach-soccer/block-1/heading.php). No jogo, a força de saída depende sobretudo da velocidade de chegada, com impulso adicional limitado. Os coeficientes são aproximações de gameplay.

## Goleiro

O controle clássico é segurar Y: [EA, controles Xbox](https://www.ea.com/able/resources/fifa/fifa-22/xbox-one/basic-controls); no PlayStation, segurar Triângulo: [EA, controles PS4](https://www.ea.com/able/resources/fifa/fifa-22/ps4/basic-controls). Implementado sem posse, com retorno ao soltar, tecla R e botão de toque. O uso das mãos permanece restrito à própria área.

## Modelo 3D

A malha e o esqueleto são elementos separados em um personagem articulado: [Three.js SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html). Mantivemos o esqueleto e a cinemática do jogo; as chuteiras ganharam geometria de sola plana, calcanhar estreito e biqueira baixa, com detalhes procedurais de cadarços e sola, sem acrescentar chamadas de desenho por jogador.

## Defesa

Sem posse, o corpo se orienta para a bola somente em marcação próxima: entrada a 3 m, saída a 3,6 m para evitar oscilações. Fora dessa distância, segue o deslocamento e não gira para a bola ao parar. A corrida permanece livre; a cabeça pode acompanhar a bola com suavização e limite anatômico. Não aplica a postura contra o próprio companheiro que tem posse. Esta regra substitui a anterior de duas passadas.

## Chute colocado de chapa (atualização)

[Nunome et al. (2002)](https://pubmed.ncbi.nlm.nih.gov/12471312/) compararam chute de peito do pé e chute com a face interna. A rotação externa do quadril participa da orientação da coxa/perna para apresentar a face medial à bola. [Nunome et al. (2023/2025)](https://pubmed.ncbi.nlm.nih.gov/37357794/) observaram mudanças na contribuição da extensão do joelho, rotação do quadril e fixação do tornozelo conforme o esforço.

Aplicação: no chute colocado, o joelho abre junto com o pé, a chuteira fica aproximadamente nivelada no contato, a região interna encontra a bola e o pé retorna gradualmente. A amplitude de 1,3 radianos do pé e a interpolação usadas são decisões de animação, não valores prescritos por esses trabalhos. A cavadinha mantém seu gesto próprio; canhotos espelham o movimento.

Passes agora usam abertura total de 180° até 1/3 de força, 90° até 2/3 e 40° acima de 2/3. Seleciona-se o companheiro mais próximo dentro do cone, independentemente da distância. Sem candidato, sai um passe sem assistência na direção apontada. Essa atualização substitui a regra anterior de cone dependente da distância.


## Posse manual do goleiro e área da areia

O encaixe seleciona o goleiro da equipe humana, cancela comandos pendentes e mantém a bola até uma escolha explícita: passe para lançar com as mãos, chute para soltá-la e dar um chutão. A movimentação com a bola nas mãos é limitada à própria área; a IA adversária mantém sua distribuição automática.

Na areia, a área é definida pela linha de gol e uma linha imaginária a 9 m, em toda a largura, indicada por bandeiras amarelas nas duas laterais: [FIFA](https://inside.fifa.com/en/news/brief-guide-to-beach-soccer-rules). Implementadas quatro bandeiras fora das laterais e o mesmo limite de 9 m nas verificações de mão/posse. Isso não representa implementação integral das regras oficiais de beach soccer.

## 2026-09-27 — Condução coordenada com a passada

Pesquisa solicitada antes de continuar refinando o gesto. Fontes:
- US Youth Soccer, Skills School, pp. 18–19: https://www.fysa.com/wp-content/uploads/sites/224/2024/02/skills_school_manual.pdf — distingue drible próximo de corrida com bola; equilíbrio, gesto de corrida, contato e sequência dependem da situação.
- Zago et al., 2016, Dribbling determinants in sub-elite youth soccer players: https://pubmed.ncbi.nlm.nih.gov/26067339/ — dez sub-13 em teste de drible; grupo mais rápido usou maior cadência de contatos, menor amplitude de flexão de quadril/joelho e menor oscilação do COM. Não estabelece frequência universal nem testa caminhada adulta.
- FA, Top tips for receiving the ball: https://www.thefa.com/bootroom/resources/coaching/top-tips-for-receiving-the-ball — recomenda encontro com a trajetória da bola para domínio na passada natural (recepção, não prova direta sobre condução contínua).
- FIFA, Mastering ball control: https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/mastering-ball-control.php — postura relaxada, diversas superfícies dos pés, movimentos adequados ao espaço/pressão.

Inferência para implementação: dosar o impulso no contato anterior para que a bola reencontre o pé na próxima passagem natural; respeitar desaceleração física entre contatos. Evitar resolver condução rotineira apenas estendendo IK até a bola. Cadência dominante a cada dois passos é um padrão solicitado de condução simples, não uma lei geral do esporte. A locomoção também se adapta à bola, não é reprodução rígida de caminhada sem bola.

Implementação local: condução simples com LT mantém a pose de caminhada e sincroniza a fase visual aos apoios físicos. O toque calcula um impulso para o próximo encontro previsto; não reposiciona a bola entre contatos. Dois passos por toque dominante são uma opção de comportamento para essa condução, preservando gestos específicos de proteção/parada/virada. Auditoria visual e temporal reproduzível em scripts/verify-natural-carry.mjs.

## 2026-09-27 — Diagnóstico das perdas de controle e escolha do motor

Reprodução local sem adversários: ao manter LT por 2 s e pedir sprint por 3 s, o jogador terminava quase parado (0,005 m/s), com a bola 0,97 m atrás e sem novo toque desde 1,89 s. Não era apenas uma impressão da câmera. A bola tinha recebido um impulso de caminhada, mas a velocidade desejada do corpo saltava imediatamente para sprint. A recuperação calculava velocidade zero numa posição atrás da bola. Outra falha aplicava a espera de 4/6 passos depois de uma parada com a sola, bloqueando a retomada.

Correção localizada: conservar o ritmo previsto pelo último toque até poder dar o impulso de aceleração no contato seguinte; corrigir a recuperação de uma bola ultrapassada; tratar saída após parada separadamente da cadência da condução contínua. Preservados impulsos discretos e bola livre entre contatos. A nova matriz cobre 108 combinações de pé, distância inicial e momento da transição, exigindo deslocamento, toque recente e distância recuperável — posse nominal sozinha não basta. As galerias anteriores omitiram os primeiros 4,5 s da corrida; acrescentadas quatro sequências sem aquecimento para não ocultar a arrancada.

Limitações ainda visíveis no projeto: resistência de rolamento explicitamente arcade (gramado: 5,8 + 0,085 × velocidade, em m/s²); animações genéricas Walk/Jog/Sprint adaptadas ao jogador, com controle procedural para ações de futebol. Impulsos fortes e frenagem rápida da bola contribuem para aparência artificial. Alterar toda a calibração física exige rever passes, paradas e previsões conjuntamente. A auditoria visual das novas sequências encontrou contatos de condução a até 0,166 m da ponta renderizada, mas a frenagem chegou a 0,395 m: a sincronização das ações especiais ainda merece revisão, sem declarar realismo integral.

Fontes primárias consultadas:
- [Three.js — Animation System](https://threejs.org/manual/pages/animation-system.html): suporta clips, mistura e sincronização; não fornece regras de condução de futebol. O projeto já usa Three.js e Rapier. A falha reproduzida está no controlador próprio, não demonstra deficiência do renderizador.
- [Rapier — Character controller](https://www.rapier.rs/docs/user_guides/rust/character_controller/): resolve deslocamentos com obstáculos; a documentação ressalta que controle de personagem depende do jogo e pode precisar de personalização.
- [Babylon.js — Specifications](https://www.babylonjs.com/specifications/): integra Havok, character controller, animação e retargeting. Pode reduzir trabalho de integração, mas a lista de recursos não oferece uma mecânica pronta de futebol.
- [Unreal — Game Animation Sample](https://dev.epicgames.com/documentation/unreal-engine/game-animation-sample-project-in-unreal-engine): oferece locomoção capturada e Motion Matching. É uma base mais completa para animação humana; o próprio exemplo se concentra em animação/travessia, não em um jogo de futebol. Migrar é uma decisão de arquitetura, não correção pontual.
- [EA SPORTS FC 26 — Gameplay Deep Dive](https://www.ea.com/ro/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-gameplay-deep-dive): descreve ajustes conjuntos de tempo do contato, trajetória da bola, pose e velocidade de saída. Isso apoia uma abordagem integrada; não constitui biblioteca pública reutilizável.

Recomendação técnica: para manter o jogo web atual, corrigir o controlador e ampliar animações específicas de futebol antes de trocar Three.js. Avaliar Unreal se o objetivo passar a priorizar uma produção maior com ferramentas de animação integradas, considerando uma migração substancial. Nenhuma biblioteca foi instalada ou migrada nesta investigação.
