# Futevôlei — especificação do modo

## Objetivo

Adicionar ao CAMPO 26 um modo de futevôlei reconhecível e fácil de jogar no celular. Ele compartilha a movimentação, os atletas, a física da bola, o renderizador e a infraestrutura online do jogo, mas tem objetivo, quadra, placar e regras de rally próprios. Não é uma partida de futebol de praia com uma rede decorativa.

Este documento define a proposta para implementação. O formato abaixo usa as regras comuns do futevôlei como base e adota partidas curtas e assistência de contato como escolhas arcade.

## Formato da partida

- Duplas: **2 contra 2**, numa quadra de areia dividida por uma rede.
- Atletas descalços. Sem goleiros, traves, laterais ou escanteios.
- A equipe precisa devolver a bola por cima da rede antes que ela toque o chão do próprio lado.
- Cada equipe pode dar até três toques por posse; o mesmo atleta não pode tocar duas vezes seguidas.
- Mãos, antebraços e braços não podem tocar a bola. Pés, pernas, coxas, peito, ombros e cabeça podem.
- Cada rally termina quando a bola cai na quadra, sai, não cruza a rede corretamente ou ocorre uma infração. O ponto vai para a equipe adversária.
- Para uma primeira versão arcade, usar partida curta até 15 pontos. Deixar a meta configurável facilita ajustar o ritmo sem alterar a lógica do rally.

## Modos de jogo

Na entrada do modo, oferecer duas opções claras:

- **Solo (offline):** uma pessoa controla um atleta; um parceiro de IA completa sua dupla e dois adversários de IA formam o outro lado. A partida começa sem conta, sala ou conexão à internet. A pessoa pode trocar o atleta controlado durante o rally, seguindo as regras normais de contato.
- **Multiplayer online:** de duas a quatro pessoas entram numa sala por código. Cada pessoa controla um atleta e a IA ocupa os assentos vazios.

O Solo e o Online usam as mesmas regras, quadra, física, placar e apresentação. O Solo deve usar a simulação local, sem depender do servidor; placar, rally e comportamento dos atletas continuam determinísticos o bastante para permitir repetir e ajustar partidas. No Solo, oferecer dificuldade da IA (Fácil, Normal e Difícil), alterando posicionamento e tempo de reação, sem mudar as regras.

As regras publicadas descrevem o limite de três toques, a proibição de toque consecutivo pelo mesmo atleta e o contato permitido com o corpo, exceto braços e mãos. Dimensões, pontuação e detalhes de saque podem variar entre competições; o jogo deve tratar a meta de 15 pontos e a assistência de contato como regras próprias do CAMPO 26. [Regras do Futevôlei](https://www.futevolei.com.br/Regras2.html) · [Regras internacionais da FIFV](https://footvolley.org/wp-content/uploads/2021/07/rules_en.pdf)

## Fluxo e controles

O fluxo básico de uma jogada deve ensinar a sequência **recepção → levantada → ataque**, sem exigir combinações longas de botões.

- O analógico move o atleta e continua sendo a principal forma de chegar à bola.
- **Passe** executa um toque controlado, normalmente direcionado ao parceiro.
- **Alto** tenta levantar a bola para preparar o ataque.
- **Chute** tenta mandar a bola à quadra adversária; o resultado depende de posição, altura, direção e tempo do contato.
- A direção do analógico influencia o alvo. O jogo deve oferecer uma janela de assistência de contato adequada ao celular, sem transformar um toque distante em acerto automático.
- O saque começa com uma indicação visível do atleta que saca e uma ação simples de chute. Não exigir que o jogador arraste a bola ou faça gestos precisos na tela.
- As ações e os rótulos dos botões devem mudar ao entrar no modo, para que “Passe”, “Alto” e “Chute” comuniquem toque, levantamento e ataque.

O HUD mostra placar, equipe sacadora, jogador selecionado e contador de toques da equipe (`0/3`, `1/3`, `2/3`). O contador zera quando a bola cruza a rede ou o rally termina. Uma indicação curta — “Recepção”, “Levante” ou “Ataque” — ajuda a entender o próximo papel.

## Parceiro e adversários controlados pela IA

Com dois atletas por lado, a IA precisa coordenar posições, não apenas correr para a bola:

- No primeiro toque, o parceiro procura espaço para receber a levantada.
- No segundo, o parceiro sem a bola se prepara para atacar, enquanto o atleta do toque procura se afastar.
- No terceiro, o portador tenta colocar a bola em espaço livre da quadra adversária.
- Na defesa, um atleta cobre a bola curta e o outro protege a parte funda da quadra. Eles trocam de função conforme a trajetória.
- A IA não deve violar a regra de dois toques consecutivos do mesmo atleta. Se o parceiro estiver longe, priorizar uma devolução segura em um toque.

A seleção do jogador deve favorecer quem consegue alcançar o próximo contato. A troca manual continua disponível, mas não pode causar uma inversão inesperada de direção ou tomar o controle do atleta durante uma animação de toque.

## Multiplayer online — requisito de primeira versão

O modo deve entrar no lançamento como uma opção **online em tempo real**, usando as salas por código já existentes. A partida precisa funcionar com **2 a 4 pessoas online**: pelo menos uma pessoa em cada lado; assentos vazios são completados pela IA. Com quatro pessoas, cada uma controla um atleta. Em partidas com menos pessoas, cada participante continua controlando um único atleta e a IA controla os assentos restantes.

### Sala e início

- O criador escolhe **Futevôlei** na mesma tela de modos e cria uma sala por código.
- A sala anuncia `mode: "futevolei"`, versão do protocolo e assentos disponíveis. Os assentos identificam equipe e posição (`team`, `playerSlot`), não apenas o lado da equipe.
- Jogadores podem escolher lado ou receber o lado com menos pessoas. Uma sala não começa com todos os humanos no mesmo lado.
- Antes do início, todos veem os quatro assentos e quem é humano ou IA. O anfitrião inicia depois de haver ao menos uma pessoa em cada lado.
- Se uma pessoa cair da conexão, a IA assume temporariamente o assento; a pessoa pode voltar à sala e recuperar seu jogador enquanto a partida continuar.

### Estado de rede

O servidor continua sendo a autoridade do resultado. Cada ação humana é associada ao assento e ao atleta controlado. A simulação online precisa sincronizar, além das posições e da bola:

- estado do rally (`serve`, `inPlay`, `point`, `paused`, `finished`), equipe sacadora e placar;
- último atleta que tocou na bola, tipo de contato, ordem e contador de toques por equipe;
- eventos de saque, contato legal ou ilegal, bola fora, bola no chão, ponto e reinício;
- posições, velocidades, orientações e animações necessárias dos quatro atletas.

Eventos que alteram pontuação, toque, saque ou validade da jogada devem ter sequência/ID e ser aplicados uma única vez. O servidor valida toque consecutivo, limite de três toques, mãos/braços, bola fora e cruzamento da rede; o cliente não decide sozinho o ponto. Estados frequentes de movimento e bola podem ser interpolados, mas um contato aceito pelo servidor corrige previsões locais sem aplicar impulso, ponto ou som duas vezes.

O multiplayer atual organiza a simulação principalmente por equipe. Para este modo, ampliar a sala para quatro assentos e comandos por atleta; não reutilizar a seleção global do time como se cada participante controlasse a dupla inteira. Manter a arquitetura autoritativa descrita em [backend.md](backend.md) e versionar a mudança do protocolo para que clientes antigos não entrem numa sala incompatível.

Pausar localmente não pode congelar a partida dos demais. Desconexão, reconexão, abandono e substituição temporária por IA devem ser estados explícitos da sala.

## Arena e direção visual

- Areia clara com marcas de quadra nítidas, rede central com postes, antenas e sombra projetada.
- Fundo de praia estilizado: mar, céu quente, palmeiras e estruturas de arena com formas simples e leitura limpa em tela pequena.
- Atletas descalços, com roupa leve de praia. Pés e contatos com a areia devem ficar visíveis.
- Levantadas deixam um arco curto e luminoso. Ataques fortes podem criar rastro colorido e uma explosão cartunesca de areia no ponto de contato; efeitos não podem esconder a bola ou a rede.
- A câmera acompanha o rally e mantém os dois lados da rede visíveis. No celular, priorizar enquadramento próximo o bastante para ler os atletas, sem cortar a trajetória alta da bola.
- Sons curtos distinguem toque, levantada, ataque, bola na areia e ponto.

## Critérios de aceite

- [ ] A partida inicia com quatro atletas, dois em cada lado, sem goleiros ou gols.
- [ ] O modo Solo inicia offline com uma pessoa e três atletas de IA, sem criar sala ou exigir conexão.
- [ ] A dificuldade da IA pode ser alterada no Solo e afeta posicionamento e tempo de reação, sem alterar as regras.
- [ ] Bola no chão, fora, quarto toque, toque consecutivo ilegal ou contato com braço/mão encerra o rally para o lado correto.
- [ ] O contador de toques acompanha a equipe e reinicia no cruzamento da rede e no próximo rally.
- [ ] Passe, Alto e Chute produzem contatos distintos, com direção e altura compreensíveis no celular.
- [ ] A IA evita sobreposição, cobre as áreas curta e funda e respeita a ordem de toques.
- [ ] Duas pessoas em equipes opostas conseguem jogar online; uma terceira e uma quarta ocupam os assentos restantes.
- [ ] Assentos vagos funcionam com IA. Queda e retorno de conexão não duplicam contatos nem pontos.
- [ ] O servidor decide placar, saque, toque legal, fim do rally e reinício; clientes exibem o mesmo resultado.
- [ ] A partida continua correta com latência, jitter, pacotes repetidos e reconexão.
- [ ] A bola e os efeitos permanecem legíveis em telas pequenas e com qualidade gráfica reduzida.

## Fora do escopo inicial

Ranking público, torneios, partidas 3×3/4×4, regras específicas de cada federação, replay e matchmaking aleatório ficam para depois. Validar primeiro o 2×2 Solo contra IA e o 2×2 online por código, com IA nos lugares vazios e partidas curtas.
