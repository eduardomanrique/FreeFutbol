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
