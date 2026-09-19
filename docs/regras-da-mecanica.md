# Regras da mecânica — CAMPO

Documento de referência, atualizado em 18/09/2026. As regras mais recentes prevalecem sobre decisões antigas. “Usuário” identifica requisitos pedidos na conversa; “implementação” identifica calibrações escolhidas no projeto. Os números são parâmetros de gameplay, não medições de atletas reais.

## Escopo e prioridades — usuário

Jogo de futebol para navegador, local contra IA, por enquanto sem multiplayer. Aparência, física e performance são centrais. Referência de qualidade: futebol moderno de videogame; isso não significa que o protótipo já tenha essa fidelidade. A torcida não precisa de animação. Preferir movimentos humanos com joelhos, equilíbrio, transferência de peso e apoio dos pés, evitando deslizar pelo chão. Não publicar mudanças sem um pedido explícito de deploy (regra atual, substitui autorização anterior).

## Instrução obrigatória para IAs e agentes

Toda funcionalidade implementada deve ser descrita na documentação correspondente no mesmo trabalho em que foi implementada. A descrição deve explicar o comportamento observável, os controles ou APIs envolvidos, os parâmetros relevantes, as limitações conhecidas e como a funcionalidade foi validada. Se uma alteração mudar, remover ou substituir uma funcionalidade existente, a descrição anterior também deve ser atualizada imediatamente para refletir o comportamento atual; não deixar documentação contraditória, histórica ou desatualizada como se ainda fosse válida. Antes de concluir uma tarefa, o agente deve procurar referências à funcionalidade alterada em `README.md`, `docs/`, comentários relevantes, testes e `progress.md`, atualizando-as quando necessário. Requisitos do usuário, decisões de implementação e limitações devem permanecer claramente distinguidos.

## Controles — usuário e compatibilidade implementada

Layout alternativo: A passe rasteiro, B passe alto, X chute ao gol, Y passe em profundidade. RT correr, LT proteger/jockey, LB trocar jogador, RB colocado; Menu pausa. RT/LT nunca pausam. Suporte a Gamepad API com mapeamento padrão e calibração para 8BitDo Ultimate 3-mode for Xbox 81HB com layout não padrão. Conexão/desconexão, menus e perda de foco não podem causar chutes involuntários.

Teclado escolhido na implementação: WASD/setas mover, Shift correr, J passe rasteiro, L alto, I profundidade, Espaço gol, Q trocar, K desarme, Esc pausa, F tela cheia. B/X sem posse mantêm carrinho/desarme no controle.

## Movimento — usuário

Aceleração progressiva: início com esforço e inclinação à frente, seguido de aumento da amplitude até a velocidade de corrida. Andar e correr devem ter passadas distintas; andar abre menos as pernas. Cadência deve ser perceptível e mais rápida que nas primeiras versões. Preparação de um chute forte alonga a passada e reduz sua frequência. Apoios devem permanecer plantados enquanto suportam peso. Choques devem afetar movimento e equilíbrio.

Calibrações de implementação: massa78kg, controle de centro de massa e forças limitadas pelo atrito dos apoios, velocidade normal6,67m/s, sprint9,775m/s, jockey3,565m/s antes de stamina/preparação. Aumento de15% do deslocamento foi mantido. Modelos skinned com animação retargeted, busca de poses, distance matching, inertialização e IK. Não é simulação muscular, active ragdoll nem captura profissional de futebol.

## Bola e condução — usuário

A bola não pode ser presa a uma distância fixa do jogador nem acompanhar seu movimento por teletransporte ou atração contínua. Ter posse apenas permite contatos controlados. Entre toques ela rola, desacelera, quica e colide livremente. Os toques devem corresponder ao movimento dos pés. Ao parar ou mudar de direção, a bola conserva movimento até atrito ou próximo contato. Se adiantar demais numa condução sem disputa, o jogador deve aproximar-se e recuperar o próximo contato; distância sozinha não tira a posse. Deve parar sozinha sem precisar de outro jogador.

Implementação: bola dinâmica Rapier de0,43kg e raio0,11m, gravidade9,81m/s², CCD, passo fixo120Hz. Atrito de rolamento explícito aumentado de3,6 para5,8m/s², mais0,085 vezes a velocidade, apenas no chão; arrasto do ar é separado. A rotação também perde energia para impedir deriva residual. Contatos controlados usam varredura do pé e impulso discreto; a cápsula ampla do portador é ignorada para a bola, e a cápsula do chutador por180ms após o contato, para a bola passar entre as pernas; outros jogadores e traves continuam colidindo. A antiga perda automática aos2,3m foi removida. Adversário que alcança a bola, passe, chute, saída de campo e situações externas ainda podem encerrar a posse. São contatos assistidos, não uma simulação articulada completa do calçado.

### Ritmo e recuperação da condução — usuário (18/09)

Conduzir por toques separados, com preferência pelo pé direito. Ao andar, encurtar o avanço da bola e o intervalo entre contatos. Ao correr, aumentar o avanço e permitir mais passadas entre contatos. O pé esquerdo pode intervir em correções urgentes. A bola desacelera livremente entre toques e pode parar; em corrida contínua, não precisa parar completamente antes de cada contato.

A força do toque estima onde jogador e bola devem se encontrar na próxima passada, considerando velocidade, aceleração e resistência da grama. Mudanças de direção exigem frenagem/aproximação e novo toque para corrigir a trajetória. Não abandonar uma bola adiantada sem disputa, nem aplicar chance aleatória de perder a própria condução. A assistência movimenta o jogador através do sistema de aceleração existente; não teletransporta nem atrai a bola.

Calibração escolhida: intervalo desejado de0,42–0,80s conforme velocidade, menor em correções; antecipação de0,18s para aproximação. O contato real depende de alcance e fase do pé. Esses números são ajustes do jogo, não constantes biomecânicas. Pesquisa e decisões: [pesquisa-conducao.md](pesquisa-conducao.md).

## Domínio — usuário

Sempre tentar dominar uma bola alcançável, sem precisar apertar botão nem apontar o direcional para ela. Parado ou andando, virar o corpo para recebê-la. Alcance médio estica uma perna mantendo apoio; longo precisa de passada/aproximação. Sair do alcance interrompe a possibilidade de domínio; comando para afastar-se não deve ser substituído por perseguição automática.

Probabilidades mantidas do pedido anterior: corpo99,9%, perto98%, médio95%, longe90%. A regra antiga que exigia direcional para médio/longo foi substituída. “Sempre tentar” significa tentativa automática; não substitui esses percentuais por100%.

Implementação: faixas medidas do centro do jogador: corpo0,48m, perto0,85m, médio1,30m, longo2,25m. Antecipar trajetória por até1/3s; não puxar a bola à distância. Médio/longo precisam de contato próximo do pé para concluir. Virar automaticamente abaixo de3,5m/s. Pequena aproximação automática quando necessária, mantendo comando de afastamento. Uma amostra aleatória por tentativa física; após uma falha, permitir outra somente depois de0,45s e de um novo apoio do pé. Nunca sortear a cada frame. Percepção continua ativa durante a recuperação do gesto anterior; previsão considera também o deslocamento do receptor. Goleiros têm regras separadas de defesa. Domínio alto no corpo é assistido; não existe ainda animação dedicada completa de peito/cabeça.

## Preparação e instante do passe/chute — usuário

Todos os passes e chutes carregam enquanto o botão está pressionado. Apertar não lança a bola. Soltar fixa a força e agenda o contato: aguardar a perna livre vindo de trás. O pé recém-plantado não pode produzir lançamento instantâneo. O impulso só ocorre quando o pé alcança a bola. Se a bola escapar antes, cancelar a ação.

Ao apertar, guardar a direção de deslocamento atual. Durante a carga, o direcional passa a indicar a mira, sem redirecionar a corrida. Corpo/pernas devem preparar gesto compatível com a direção pretendida. Na liberação, manter o movimento comprometido até o contato; depois devolver controle normal. Pausa, reinício, perda de posse/foco ou desconexão cancelam preparação pendente.

Implementação: carga máxima em0,9s; força normalizada0–1. Nos passes, com analógico neutro conservar a última mira válida; sem mira inicial usar orientação do corpo. No chute ao gol, norte–sul neutro centraliza o alvo; a orientação corporal não define o destino. Um pé apoiado há menos de75ms não inicia novo golpe. Trajetória do pé tem preparação, contato e recuperação; tempo não substitui a checagem de contato. Atraso depende da passada e do alcance, não é uma espera fixa em milissegundos.

## Passes rasteiros e altos — usuário

Semiassistidos: direcional escolhe um companheiro nessa direção. A potência é relativa à distância: toque fraco deve chegar tanto a companheiro próximo quanto distante. Mais carga aumenta o ritmo/velocidade de chegada, não simplesmente multiplica uma velocidade fixa insuficiente para passes longos. Passe alto ajusta arco e velocidade horizontal à distância.

Implementação: escolher companheiro por alinhamento com a mira e distância, incluindo goleiro com penalização leve. Antecipar seu deslocamento; passe em profundidade adiciona espaço à frente. Passe rasteiro calcula velocidade inicial compensando resistência da grama e mira velocidade de chegada de2,6 a9,1m/s, com12% de compensação para a perda inicial por escorregamento no solver. Alto resolve velocidade com previsão de arrasto e gravidade. Interceptações e deslocamento posterior do receptor podem impedir a conclusão; assistência não garante passe imune à defesa.

## Chute ao gol — usuário

Sempre direcionado ao gol adversário, mesmo de costas, com força definida na soltura e lançamento no contato da passada. Quanto maior a força e/ou distância, menor a precisão. Manter uma medida explícita desses fatores. Direcionais durante preparação ajustam a mira; golpes de lado/para trás exigem gesto correspondente.

Implementação: somente norte–sul escolhe o ponto na largura da baliza (−3,2 a+3,2m); leste–oeste não altera a mira. Neutro mira o centro. A antiga exceção de chutar lateralmente/para trás conforme o direcional foi substituída. O gesto de giro/calcanhar compara a orientação corporal com a direção real do gol. Velocidade9 +36×potência^0,75 m/s (máximo45m/s); colocado multiplica por0,86. Índice de precisão = clamp(0,985 −0,14×potência² −0,0045×max(0,distância−16) + bônus,0,35,0,99). Colocado soma0,07; finalização comprometida com queda soma0,06. Dispersão em metros=(1−índice)×(0,7+0,08×distância), com erro simétrico sorteado no contato ao longo da linha do gol; pode resultar em bola para fora, mas nunca escolher um lançamento para o lado oposto do campo. Índice não é probabilidade de gol; defensor, goleiro, arco e direção continuam relevantes.

## Direção, giro, calcanhar e equilíbrio — usuário

Passe/chute para trás ou de lado deve girar corpo e quadril conforme necessário. Totalmente para trás favorece calcanhar. Passes difíceis em movimento podem desequilibrar; finalizações fortes de lado/atrás podem comprometer equilíbrio e terminar em queda para obter precisão.

Implementação: calcanhar para desvio maior que154,8° em relação à orientação inicial, sem giro completo. Acima de40° usar preparação com giro. Desequilíbrio aumenta com ângulo, velocidade e potência; recuperação temporária reduz mobilidade. Finalização com potência>0,8 e ângulo entre63° e152° usa gesto de queda e recuperação de1,05s, com bônus pequeno de precisão. Trata-se de camada procedural de corpo/IK, não de ragdoll nem animação final cinematográfica. Os critérios numéricos são calibração e podem ser ajustados sem mudar a intenção da regra.

### Mãos nas quedas — usuário (complemento)

Quedas precisam incluir reação dos braços/mãos. O braço do lado da queda procura o chão antes do impacto do tronco; dedos abertos e palma orientada para apoiar. A mão permanece ancorada durante a fase de apoio, com cotovelo flexionado, e participa do impulso visual de recuperação. O outro braço contribui para equilíbrio. Implementação com IK de dois segmentos e fases de descida, apoio e subida; não representa força física individual nos dedos/punhos. Aplicar esta regra também a futuras animações de queda.

## Regras existentes escolhidas pela implementação

22 jogadores, campo92×60m, gol7,32×2,44m. IA e seleção automática do receptor após passe; recepção de jogador do time do usuário pode transferir seleção. Partida possui placar, pausa, reinício e reposições simplificadas. Gols, postes, travessão, saída lateral e de fundo; faltas, impedimentos, cartões, substituições e intervalos completos ainda não implementados. Não apresentar essas lacunas como regras definitivas do futebol.

## Validação obrigatória

Checar sequência pressionar → carregar/mirar → soltar → passada/contato → trajetória. Testar parado, andando, correndo, mudanças de direção, perda de posse, pausa e ambos os layouts de controle. Verificar parada espontânea da bola, condução com intervalos sem contato e médio/longo sem direcional. Inspecionar imagens e erros de navegador. FPS deve ser medido com GPU real; renderização por software dos testes não representa desempenho do aparelho. Publicação apenas quando pedida.

## Proteção e disputa próxima — usuário (18/09, revisão)

Ao detectar marcação próxima, o portador deve colocar a bola no lado oposto ao adversário e usar o corpo como barreira. Toques curtos de proteção mantêm possibilidade de sair para espaço livre ou passar; não prender dois jogadores num ciclo de roubos instantâneos. Movimentar a bola apenas no contato do pé, preservando trajetória livre entre contatos.

Calibração de implementação: ameaça mais próxima até2,1m; alvo de proteção cerca de0,78m no lado livre, combinado com deslocamento escolhido. Contornar pressão frontal em vez de insistir diretamente contra o defensor. Preparação de passe/chute conserva sua mira e gesto, sem ser substituída pelo toque de proteção.

Recepção de bola livre continua automática. Para tomar bola conduzida, exigir contato do pé, acesso sem atravessar o corpo do portador,0,22s de preparação da disputa e vantagem de proximidade de0,12m sobre o portador. Quem perde a posse recupera-se por0,65s antes de nova recepção/desarme. Isso evita alternância a cada frame; não bloqueia outros defensores nem torna a bola imune quando exposta. Desarme explícito também respeita o bloqueio do corpo e a recuperação. Os tempos e distâncias são calibrações do jogo.

## Drible em modo lento e goleiro — usuário (18/09)

Modo lento com posse deve permitir driblar e mudar de direção com agilidade, sem simplesmente reproduzir corrida em câmera lenta. LT e baixa amplitude do analógico ativam controle próximo: passos mais curtos, centro de massa mais baixo, giro mais rápido e toques próximos com o pé disponível. Corrida mantém aceleração progressiva e maior avanço da bola. A liberdade de alternar os pés neste modo complementa a preferência pelo direito na condução normal.

Goleiro deve tentar usar as mãos e saltar para bolas nos cantos. Preparar postura, ler trajetória, impulsionar, estender mãos, tocar a bola, aterrissar e recuperar. Segurar bolas manejáveis; rebater bolas fortes para o lado. Defesa depende do alcance real dos alvos das palmas, não de um raio de captura no corpo. Não garantir defesa de todo chute. Durante uma pegada, a bola acompanha as mãos até a reposição; a regra de bola livre entre toques continua valendo para condução com os pés.

Pesquisa, calibrações e limites em [pesquisa-mobilidade-goleiro.md](pesquisa-mobilidade-goleiro.md). Implementação procedural com IK e trajetória de salto; não representa simulação muscular ou ragdoll completo.


## Acessibilidade de gols e câmera de transmissão —18/09

Boas chances próximas e bem colocadas devem ser convertidas com mais facilidade. Recalibração: carga média gera mais velocidade, precisão próxima melhora e o goleiro prepara o salto por0,19s, com limite lateral de4,9m/s. Chutes fracos no centro continuam defendáveis; força/distância ainda reduzem precisão. O toque mínimo mantém9m/s e a carga máxima45m/s.

A câmera padrão de transmissão deve mostrar apenas a região da jogada, com jogadores maiores e acompanhamento suave da bola. Não enquadrar o campo inteiro durante o jogo normal. Pequena antecipação da velocidade ajuda a acompanhar passes/chutes; seguir também as laterais e as duas áreas. Modo tático amplo continua opção manual. Calibração de transmissão: altura25m, recuo31m e antecipação limitada a3m/2m, com ajuste para telas estreitas.

## Arena de treino — usuário (18/09)

Modo separado selecionável antes de entrar em campo. Adversários, incluindo o goleiro, ficam fixos nas posições: não perseguem, dominam, desarmam, passam ou defendem. Permanecem obstáculos sólidos; uma bola pode rebater no corpo. Companheiros e jogador controlado mantêm funcionamento normal para treinar condução, passes e finalização.

Treino sem limite de tempo, com pausa, reinício e saída pelo menu. Gols e reposições preservam o modo, com bola devolvida ao time do usuário. Voltar para Partida reativa o comportamento normal dos adversários. Estas opções de treino não modificam as regras da partida comum.

## Direção do toque próximo e arrancada — usuário (18/09)
Quando a bola está ao alcance do pé e o jogador está parado/andando, o contato de condução deve enviá-la na direção pedida no analógico, inclusive diagonais, sem esperar a velocidade anterior do corpo apontar para lá. Isso não altera a trajetória à distância: o impulso exige contato pé-bola. A proteção sob pressão continua escolhendo espaço seguro. Mudanças de direção próximas podem antecipar o próximo gesto; fora de alcance, primeiro é necessário alcançar a bola.

Partir do repouso com corrida inicia fase curta de propulsão e inclinação na direção do movimento, com primeiro toque mais comprido que na caminhada. A velocidade cresce progressivamente, limitada por apoio e atrito. A arrancada não se repete só porque um corte reduziu a velocidade. Calibração atual: fase de 0,65 s, acionada abaixo de 1,2 m/s; resposta direcional próxima até 1,12 m e abaixo de 4 m/s, em caminhada, correção de direção ou início do movimento. Valores são escolhas de jogabilidade, não constantes biomecânicas.

## Cortes bruscos e giro coordenado — usuário (18/09)
Mudanças fortes de direção devem preparar o corpo durante a frenagem: abaixar centro de massa, flexionar joelhos e começar a orientar o corpo para a saída enquanto o pé prepara/redireciona a bola. O giro não espera a bola inverter sua trajetória. Isso não exige simultaneidade matemática nem permite mudar a bola antes do contato; as fases se sobrepõem. Quanto maior a oposição entre movimento e comando e maior a velocidade, maior a flexão; a postura recupera gradualmente. Inércia, apoio e limites de atrito continuam ativos. Calibração procedural atual: até 13 cm adicionais de abaixamento; não é constante biomecânica. Pesquisa e limites em pesquisa-mudancas-direcao.md.

## Caminhada distinta da corrida — usuário (18/09)
Caminhar usa o ciclo esquelético Walk_Loop, com postura, braços e ritmo próprios; não deve parecer corrida reduzida. Controle próximo mantém caminhada até 4,2 m/s, evitando seleção de trote no topo da velocidade de LT. Cadência visual da caminhada preserva mais do ciclo original; inclinação de propulsão é menor, exceto durante arrancadas e cortes. No modo próximo, abaixo desse limite, não se programa fase aérea de corrida. Transições são suavizadas; o contato com a bola continua podendo modificar a pose da perna que toca.

## Apoio, toque rápido e limite da carga — usuário (18/09, revisão mais recente)
Passes e finalizações fortes precisam de apoio plantado ao lado da bola, com golpe pela perna oposta. Ao começar a carregar, a colocação do apoio já deve iniciar. A perna do chute recua progressivamente durante a carga; a de apoio não é usada como perna de preparação. Apoio já bem posicionado é reutilizado; bola afastada exige nova colocação.

Exceção solicitada: toque de baixa força parado ou andando usa gesto rápido sem exigir uma passada de apoio dedicada. Calibração atual: força até 22% e velocidade abaixo de 3,7 m/s; gesto de 0,16 s, ainda com contato real pé-bola e pé disponível. O jogo interpreta curto pela baixa carga, preservando a assistência de distância dos passes.

Não é permitido sustentar indefinidamente a pose de carga. Após 1,3 s segurando, a ação é liberada automaticamente com força máxima; o contato físico continua obrigatório. Sai um chutão alto, com dispersão, sem assistência de receptor no passe. Parâmetros atuais:45m/s, impulso vertical12m/s e desvio angular até0,35rad. Isso aumenta a chance de sair do campo ou passar sobre o gol, sem garantir que toda bola saia. Soltar depois não repete a ação. Antes do limite, soltar determina a força normalmente.

Colocação de apoio: passada0,18s, alvo lateral0,28m, tolerância de proximidade0,65m. Todos os valores são calibrações de jogabilidade, não constantes biomecânicas. Condução normal mantém seus toques próprios.

## Carga rápida e chute com embalo — usuário (18/09)
A barra enche em0,315s (35% dos0,9s anteriores). O limite de segurar demais continua em1,3s. Ao carregar, um toque de condução anteriormente agendado não pode parar/redirecionar a bola; ela segue a física livre até o contato do chute. A preparação usa previsão de rolamento para colocar o apoio na região futura de contato. Durante a aproximação do chute, não se usa o comando de recuperação para trás da condução. O corpo freia/aproxima com inércia, inclina-se um pouco para trás quando carrega sobre apoio e acompanha o contato. Finalizações iniciadas em movimento podem receber até2,5m/s adicionais proporcionais à carga e à velocidade residual na direção do chute. Não há bônus para chutes iniciados parado; os parâmetros são calibrações de jogabilidade.
