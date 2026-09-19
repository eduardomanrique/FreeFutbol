# Mobilidade lenta e defesas com as mãos

Pesquisa e implementação local de18/09/2026. As referências orientam o comportamento; os valores numéricos abaixo são calibrações do jogo, não medições biomecânicas.

## Pesquisa aplicada

- [FIFA: Mastering ball control](https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/mastering-ball-control.php): domínio próximo combina movimentos corporais, toques com diferentes partes dos pés e mudança de direção para sair da pressão. Aplicamos passos curtos, maior resposta de giro ao comando em baixa velocidade, centro de massa um pouco mais baixo e liberdade para usar o pé disponível. Não adicionamos uma biblioteca completa de dribles nomeados.
- [FIFA: Learning to dive](https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/goalkeeping-fundamentals/learning-to-dive.php): postura preparada, joelhos flexionados e mãos abertas ajudam a baixar o corpo e atacar bolas baixas. Aplicamos preparação antes do salto e alvos das palmas ligados ao contato de defesa.
- [FIFA: Learning to dive at mid-height](https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/goalkeeping-fundamentals/learning-to-dive-at-mid-height.php): leitura da trajetória, transferência de peso e impulsão lateral precedem o encontro com a bola. Aplicamos previsão com gravidade/atrito e salto de velocidade limitada, seguido de aterrissagem e recuperação.
- [FIFA: Learning to dive high](https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/goalkeeping-fundamentals/learning-to-dive-high.php): coordenação dos apoios, extensão no ar e palmas abertas para alcançar bolas altas. Aplicamos diferentes alturas de lançamento corporal e braços estendidos por IK. A animação é procedural, não captura profissional do gesto.
- [FIFA: Defending the goal](https://www.fifatrainingcentre.com/en/environment/fifa-goalkeeper-training/sessions/goalkeeping-fundamentals-defending-the-goal.php): cobrir o ângulo, preparar-se e direcionar rebotes para uma região lateral segura. Aplicamos posicionamento entre bola e baliza e rebote lateral, em vez de sempre devolver ao centro.

## Tradução para o jogo

LT com posse ativa controle próximo; pouca amplitude no analógico também o ativa em baixa velocidade. Mantém velocidade máxima lenta, mas reduz o intervalo da passada para73% do normal e responde mais cedo à direção desejada. Aceleração continua limitada pelo apoio e atrito, sem inversão instantânea. Toques usam intervalo desejado de0,25–0,33s (0,24s em correções), avanço de0,30m e podem alternar os pés. Corrida mantém seu ritmo e preferência pelo direito.

Goleiros deixam de salvar apenas porque a bola entrou num raio amplo. O controlador prevê a passagem da bola e executa preparação (~0,19s após ajuste de dificuldade), voo com gravidade, alcance de braços limitado, contato varrido de mão/bola, aterrissagem e recuperação. Velocidade lateral do salto limitada a4,9m/s após ajuste de dificuldade; bolas próximas e fortes podem passar fora do alcance. A representação de contato usa pequenas esferas nas palmas, com alvos compartilhados pela animação IK.

Bola manejável no centro pode ser segurada. Nesse estado específico, ela acompanha as mãos até a reposição após recuperação; isso é uma restrição de agarrar com as mãos, diferente da condução com os pés, que permanece livre. Bola forte é rebatida para frente/lado. A cápsula vertical genérica é desativada contra a bola durante o mergulho para não gerar defesa invisível acima do corpo caído.

## Limites

Modelo reduzido de salto e braços: não há ragdoll articulado, pressão individual dos dedos ou animações autorais de goleiro. O contato é assistido por alvos de palmas com alcance finito. Sistema de regras ainda não inclui todas as restrições de recuo ao goleiro nem todos os tipos de cruzamentos/saídas. Essas lacunas não são regras oficiais de futebol.
