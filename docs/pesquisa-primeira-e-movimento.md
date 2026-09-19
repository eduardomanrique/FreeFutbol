# Toque de primeira e movimento sem sprint —19/09/2026

## Referências consultadas

- [Cappellini et al. — Motor Patterns in Human Walking and Running](https://journals.physiology.org/doi/10.1152/jn.00081.2006): compara cinemática e atividade de músculos dos membros/tronco. Caminhada inclui duplo apoio; corrida inclui fase aérea. Aplicação: preservar ciclos distintos e alterar contatos/elevação/coordenação, em vez de apenas desacelerar a animação de sprint.
- [Variant and Invariant Spatiotemporal Structures in Kinematic Coordination to Regulate Speed During Walking and Running](https://pmc.ncbi.nlm.nih.gov/articles/PMC6764191/): analisa coordenação de tronco, coxas, pernas e pés separando fases de apoio e voo. Aplicação: reduzir elevação dos pés e inclinação, suavizar braços no trote sem sprint, antecipar recuperação do apoio. Não reproduzimos os dados experimentais como animação.
- [FIFA Training Centre — John Peacock: Passing and receiving](https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/john-peacock-passing-and-receiving.php): reforça posicionamento corporal, percepção espacial, peso e timing do passe. Aplicação: preparar o contato antes da chegada, ajustar aproximação ao trajeto e separar mira/deslocamento. O toque de primeira implementado é uma regra de gameplay solicitada pelo usuário; não é um modelo biomecânico derivado desse exercício.

## Comportamento implementado

Um comando antes da chegada mantém intenção por1s. A perna livre inicia gesto curto quando a bola prevista entra no alcance; ao contato varrido pé-bola, o impulso da finalização substitui diretamente a velocidade de chegada. Não se aplica recepção/amortecimento antes e não se concede posse ao batedor. Alto/fora de alcance ou falta de pé disponível podem produzir erro; expirado o prazo, a recepção normal volta. Assistência busca um ponto na trajetória e guia o corpo até o contato, respeitando aceleração e colisões; a entrada de direção volta depois da ação.

Ao acionar sprint, inclusive andando/trotando e mudando de direção, o avanço nominal do primeiro toque equivale a3× o mesmo comando sem sprint. Medição isolada de rolagem com Rapier:1,000m contra2,982m. Durante a corrida, intervalo e avanço continuam maiores. Distância real durante a jogada depende de atrito, adversários e novos contatos; a bola continua livre.

Sem sprint, a animação usa caminhada em baixa velocidade e trote na velocidade normal alta, com mistura de braços para repouso e menos projeção do tronco. Apoios do trote têm menor fase aérea e pés mais baixos; sprint conserva maior voo e ação corporal. Velocidades máximas não foram reduzidas. Os limiares, fatores de mistura e tempos são calibrações de gameplay, não valores medidos nos artigos.

## Validação e limites

Testes verificam batidas em passes que chegam em movimento, retorno de um passe ao receptor selecionado sem domínio, expiração de1s, retorno do controle após contato, relação aproximada de3 no primeiro toque, diferença de postura/animação e altura/apoios do trote. Navegador registra preparação, contato e continuação, além de caminhada/trote/sprint. Ainda são clips retargeted e correções procedurais; não há captura profissional específica de passe de primeira, voleios altos ou novo sistema muscular.
