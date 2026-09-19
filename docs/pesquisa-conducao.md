# Pesquisa: condução, ritmo de toques e recuperação

18/09/2026. Complementa as [regras da mecânica](regras-da-mecanica.md). Alterações locais; publicação depende de pedido explícito.

## Fontes e aplicação

- [The FA — How to encourage running with the ball](https://www.thefa.com/bootroom/resources/coaching/how-to-encourage-running-with-the-ball): espaço permite toques maiores para ganhar velocidade; espaço restrito pede contatos menores para mudar ritmo/direção. Aplicação: intervalo e avanço aumentam com velocidade; curvas e frenagens antecipam contato corretivo.
- [FIFA Training Centre — Mastering ball control](https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/mastering-ball-control.php): exercícios combinam domínio próximo, mudanças de ritmo/direção e giros usando o pé dominante. Aplicação: preferência pelo direito conforme pedido do usuário, com outro pé disponível em recuperação urgente. Isso não significa que todo jogador real use sempre o direito.
- [The touch & go dribbling model](https://www.sciencedirect.com/science/article/abs/pii/S0960077920305828): o resumo distingue lançar a bola no toque e deslocar-se até o próximo encontro. Aplicação: impulso discreto seguido de trajetória física livre e aproximação do atleta. Foi consultado o resumo; não foi reproduzido o modelo integral do artigo.
- [Hong et al. — Physics-based Full-body Soccer Motion Control for Dribbling and Shooting, 2019](https://pure.kaist.ac.kr/en/publications/physics-based-full-body-soccer-motion-control-for-dribbling-and-s/): resumo institucional descreve ajuste do gesto ao lugar/instante do contato e planejamento conjunto de personagem e bola. Aplicação conceitual: prever próximo encontro e lançar somente no contato do pé. Nosso controlador não implementa o MPC completo desse trabalho.
- [PhysicsFC, 2025](https://arxiv.org/abs/2504.21216): combina habilidades físicas aprendidas e transições entre movimentos. Avaliado como referência; não treinamos políticas nem adicionamos redes de controle. Mantivemos controlador procedural leve, física Rapier e animação existente para preservar desempenho no browser.

## Implementação e escolhas de calibração

`src/dribbling.js` separa planejamento do toque, aproximação e ritmo. Na condução reta, o lançamento estima movimento futuro do atleta e compensa resistência da grama; depois a física assume a bola. Não há alvo de posição que arraste a bola continuamente.

O intervalo-base varia de0,42 a0,80s com a velocidade; segurar sprint multiplica esse intervalo por1,08 e o avanço-base por1,30. O primeiro toque na arrancada de sprint tem avanço nominal3× o equivalente sem sprint; a comparação usa a mesma amplitude de direcional, e o sinal de arrancada dura até o contato. Mais rápido permite mais apoios entre contatos e maior avanço; correções usam horizonte menor. O contato aguarda fase e alcance do pé. Esses valores são calibrações de gameplay, não números extraídos dos artigos.

Se a bola adianta, o jogador ajusta a trajetória através da aceleração e forças de apoio já existentes. Uma inversão precisa primeiro alcançar a bola que ainda segue no sentido anterior, então redirecioná-la pelo toque. Distância isolada não abandona a posse; disputas, lançamentos e regras de campo continuam válidos.

A percepção de recepção permanece ativa enquanto o gesto anterior se recupera. A previsão considera a velocidade relativa jogador/bola. As chances solicitadas anteriormente valem por tentativa física nova; uma falha admite nova tentativa após0,45s e novo apoio, nunca por sorteios repetidos a cada frame. Conduzir a própria bola não usa sorteio de perda.

## Limites

Trata-se de contato assistido por trajetória dos pés e movimento corporal procedural. Não é simulação muscular nem colisão rígida de cada osso/calçado. A bola pode ser interceptada; a assistência de condução não dá imunidade ao adversário. Em sprint ela normalmente desacelera entre contatos sem necessariamente parar por completo.


## Cortes independentes do corpo — 19/09/2026

Pedido: cortes de45°,90° e180° com a bola mudando rapidamente no toque, inclusive correndo; o corpo conserva inércia. Referência de intenção: cortes sucessivos como os de Garrincha, sem adicionar um botão ou animação especial.

No contato corretivo, a bola recebe a direção do comando, sem herdar a velocidade anterior do corpo. A comparação também usa o último toque (mudança acima de cerca de20°), para não perder o corte se o corpo começar a girar antes. O avanço nominal curto é0,30–0,72m, convertido em velocidade pelo atrito; não é uma distância garantida na física Rapier. A restrição anterior a velocidades corporais abaixo de4m/s foi removida para cortes. O contato varrido do pé continua obrigatório; bola longe requer aproximação, sem toque remoto.

A aproximação freia antes de giros acentuados quando a bola está a menos de1,85m. Depois do corte, a velocidade desejada de recuperação considera distância de frenagem (calibração6m/s²), evitando perseguir a bola parada em velocidade máxima. As forças dos apoios continuam controlando a velocidade real; o corpo pode ultrapassar bastante a bola num sprint e precisa recuperá-la. Proteção sob pressão mantém seu planejamento próprio para o lado livre.

Base biomecânica: [Dos’Santos et al., estudo de giros de180° (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8225134/) analisa frenagem, contato e propulsão; a reversão do corpo exige anular o momento na direção anterior. A separação entre direção instantânea do toque e frenagem corporal é uma escolha de gameplay informada por esse princípio; os valores não foram medidos nesse estudo.

Validação: testes de45°/90°/180° com bola alcançável verificam direção no primeiro contato e avanço residual do corpo; cortes sucessivos, recuperação de sprint, parada, proteção e condução reta continuam cobertos. Gesto dos pés e rotação ainda são procedurais, sem animação específica de Garrincha.
