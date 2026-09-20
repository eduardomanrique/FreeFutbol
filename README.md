# CAMPO 26

Protótipo original de futebol 3D para navegador, com equipes fictícias. Three.js/WebGL, Rapier/WASM e Vite. Oferece partida offline, treino e multiplayer privado por código com backend autoritativo Node.js. Frontend e backend multiplayer publicados em19/09/2026.

## Executar

```sh
npm install
npm run dev
```

Abra o endereço indicado pelo Vite. Para gerar arquivos estáticos: `npm run build`. Para testar a versão compilada: `npm run preview`.

## Multiplayer online

Execute também `npm run server`, mantendo `npm run dev` aberto. Selecione **Online · por código**, crie uma sala e compartilhe o código/link. Os dois participantes confirmam **Estou pronto** e o criador inicia. Atlético ataca à direita; União, à esquerda. O menu online não pausa a partida. Sessões podem reconectar por até 30 s após a detecção de desconexão.

O servidor executa física e regras a 120 Hz em workers; clientes enviam comandos por WebSocket e recebem estados a 20 Hz. A apresentação usa interpolação de 75 ms; previsão local de movimento e compensação de latência ainda não estão implementadas. Salas ficam em memória, sem cadastro ou ranking. Offline e treino não dependem do backend.

[Operação, protocolo, limites, testes e publicação do backend](docs/backend.md). No desenvolvimento, os IPs IPv4 privados deste computador são aceitos automaticamente na porta 5173; abra esse endereço também no celular. Para domínio, HTTPS ou outra origem, configure `ALLOWED_ORIGINS` explicitamente. O multiplayer está publicado em https://kmworks.dev/futebol/.

## Jogar

- **WASD / setas:** mover (Atlético ataca para a direita).
- **Shift:** correr, consumindo fôlego.
- **J / L / I:** segurar para carregar passe rasteiro / alto / em profundidade; soltar agenda o contato da passada.
- **Direcional durante a carga:** escolher a mira, conservando a direção de deslocamento anterior.
- **Espaço:** segurar para carregar, soltar para chutar; a mira é assistida para o gol.
- **Cabeceio em cruzamento:** pressione Espaço / X antes da chegada para finalizar ao gol, ou J / A para escorar. Usa a mesma janela de antecipação de 1 segundo: a aproximação e o salto são assistidos, e o desvio exige contato da bola com a cabeça.
- **Q:** trocar sem posse, priorizando cobertura defensiva ou um companheiro muito próximo da bola.
- **X:** desarmar.
- **Esc:** pausar; configurações e controles também estão nesse menu.
- **F:** tela cheia.

Interface adaptável a telas pequenas, com teclado, Gamepad API e controles multitoque em dispositivos touch.

### Celular

A partida permanece em **horizontal**, com placar, nome/fôlego e radar compactos. Ao entrar em campo ou voltar do menu, solicita tela cheia e trava de orientação landscape. No online, a tentativa também acontece ao tocar **Estou pronto** ou **Iniciar partida**, pois o navegador exige um gesto. Se a trava nativa for recusada e o aparelho estiver vertical, a interface gira para manter o jogo horizontal, com coordenadas de toque corrigidas.

O navegador pode recusar tela cheia; não é possível ocultar suas barras por CSS. O menu da partida oferece **Tela cheia** para tentar novamente. Há manifest com `display: fullscreen`, `orientation: landscape` e metadados de web app para abrir pelo ícone da Tela de Início no iPhone. Isso não instala o jogo automaticamente nem adiciona cache offline; o comportamento de instalação/tela cheia depende do navegador.

Os botões mudam conforme a posse do time: **Alto, Passe, Chute e Proteger** com posse; **Trocar e Desarme** sem posse. A posse permanece durante passes até o adversário tocar na bola. Além deles, há analógico e pausa:

- Analógico esquerdo: arraste para mover/mirar; a amplitude controla a velocidade. Na borda, corre automaticamente (90% da amplitude útil); recue abaixo de78% para parar de correr. O anel acende e mostra CORRENDO. Soltar/cancelar limpa a corrida.
- **Passe / Alto / Chute**: segure para carregar e solte para executar.
- **Proteger**: mantenha pressionado para reduzir a velocidade e controlar a bola de perto.
- Sem posse, **Desarme** executa o tackle.
- **Trocar** muda de jogador.
- **Ⅱ** abre o menu. Pausa, perda de foco, mudança de tamanho e interrupção de toque limpam comandos, cancelando a carga sem disparar.

Não há botões Correr ou Colocado no touch, nem combinação entre botões de ação. Colocado continua disponível pelo controle físico. Mover/mirar com o analógico enquanto usa uma ação funciona com dois dedos.

Durante a partida, a câmera fica20% mais perto no celular (jogadores aproximadamente25% maiores), mantendo o ângulo e os modos Transmissão/Tática. Desktop e câmera do menu inicial mantêm as distâncias anteriores. A câmera usa as dimensões efetivas da interface, inclusive quando girada. O menu inicial permite rolagem tanto em retrato quanto em paisagem. Validação automatizada em Chromium com emulação touch (320×568, 390×844 e 844×390), gestos multitoque, ações com contato na bola, corrida por amplitude e fallback sem fullscreen. Safari/iPhone e Android físicos ainda precisam de validação; não há medição de desempenho em hardware mobile.

### Controle Xbox / 8BitDo

Analógico esquerdo movimenta com velocidade proporcional e zona morta de 15%; RT corre, A passa, X carrega/solta o chute, B faz passe alto, Y faz passe em profundidade, LB troca jogador, Menu pausa. Sem bola, X desarma e B executa carrinho; LT marca/protege e RB modifica o chute para colocado. Nos menus, direcional/analógico navega, A confirma e B volta; esquerda/direita altera seletores. O teclado continua disponível.

**Proteger (LT)** reduz a velocidade e ativa controle próximo da bola; sem posse, permite movimentação mais lenta de marcação. Parte da proteção corporal contra adversários próximos já é automática. **Colocado (RB + X)** só modifica um chute: mantenha RB pressionado quando soltar X. RB sozinho não chuta. A implementação reduz a velocidade do chute em14%, melhora o índice de precisão em até0,07 (limitado a0,99) e adiciona curva; não garante gol. Os outros botões de ação não exigem combinações. Correr e marcar em movimento usam RT/LT junto do analógico.

Conecte o controle, abra o jogo e pressione um botão com a página em foco. Um indicador mostra a detecção. Ao conectar, reconectar ou sair de um menu, solte botões e centralize o analógico antes do próximo comando. Desconectar durante a partida pausa o jogo e cancela o chute carregado.

A detecção usa o layout `standard` do navegador ou o perfil aprendido. Foi removida a opção de forçar índices Xbox em relatórios Bluetooth não padronizados, pois isso podia confundir RT/LT com Menu/View. Abra **Configurações → Configurar botões do controle**, centralize os analógicos e siga os 9 botões indicados. O jogo reconhece gatilhos enviados como botões ou eixos e salva o perfil por dispositivo neste navegador. Mesmo em um layout reconhecido, essa configuração corrige remapeamentos específicos do aparelho. Somente Menu pausa.

Passes e chutes carregam ao segurar e são agendados ao soltar; a bola sai no contato da perna livre, não no evento do botão. Comando de passe/chute antes de a bola chegar fica guardado por1s desde o pressionamento. O jogador prepara o gesto na chegada e bate de primeira no contato do pé, sem dominar ou parar a bola antes; se não alcançar dentro do prazo, cancela. Vale para o atleta selecionado e cancela com troca, pausa ou reinício. No controle físico, Chute/Alto contra posse adversária continuam desarme/carrinho. No touch, o modo defensivo mostra Trocar e Desarme. Durante um passe do próprio time, os botões ofensivos permanecem disponíveis para antecipar a ação. Ao iniciar passe/chute, a assistência assume a aproximação e o posicionamento para o contato; a direção normal volta após a batida ou cancelamento. Durante a carga com posse, o direcional ajusta a mira. Passes compensam a distância e o atrito; a carga aumenta seu ritmo. Chutes de frente variam de5,4 a27m/s sem embalo (40% menos força); de costas usam15% da força anterior, chegando a6,75m/s. Ângulos intermediários reduzem força e precisão progressivamente. Passes altos têm arco acima da altura de um jogador, inclusive com pouca carga. Gestos incluem giro, calcanhar e finalização comprometida com queda, apoio da mão e recuperação.

A bola permanece dinâmica durante a condução. O portador dá impulsos em contatos discretos dos pés; entre eles a bola conserva inércia e sofre atrito. Resistência explícita de5,8m/s² mais termo dependente da velocidade. No teste Rapier isolado, bolas a5/10m/s param em1,63/6,84m. Chutes fortes ainda podem sair antes de parar; esses valores são calibração de gameplay.

Domínio automático de **bola livre** em todas as faixas enquanto alcançável: corpo99,9%, perto98%, médio95%, longo90%. Parado/andando, o jogador se vira para a bola; médio estende uma perna e longo aproxima com passada. Não exige direcional, mas respeita comando para sair do alcance. Chances por tentativa, sem novo sorteio a cada quadro. Goleiros mantêm regras separadas.

As [regras fixas da mecânica](docs/regras-da-mecanica.md) distinguem requisitos do usuário, calibrações e limitações. São a referência atual; não fazer deploy sem pedido explícito.

Quando a bola já tem dono, o alcance automático do adversário é menor: até0,70m da bola no instante atual, sem previsão/aproximação longa, bola abaixo de0,50m e contato do pé a menos de0,22m. Mantém disputa por0,22s e exige estar mais perto da bola que o portador. O corpo bloqueia a tentativa através de um corredor de0,50m, inclusive por trás/diagonal. Bola exposta ainda pode ser roubada; desarme por botão continua sendo uma ação separada. Após um passe/chute, o corpo do passador continua bloqueando a recepção através dele por0,35s; isso também cobre bola junto aos pés com marcador atrás, sem impedir interceptação pela frente. Validado por109 testes e cenários de navegador que acompanham o passe para frente após o contato, além de proteção e fuga.

O ritmo dos jogadores foi aumentado: deslocamento 15% mais rápido, propulsão e gestos mais rápidos, preservando aceleração gradual e distinção entre caminhada, corrida e sprint.

A locomoção usa um modelo físico simplificado de centro de massa (78 kg), gravidade, forças de apoio e limite de aderência. Aceleração e frenagem dependem dos pés em contato; durante a fase aérea não há força horizontal de propulsão. A pose visual vem de clips retargetados para um personagem com skin e 65 ossos, com busca de poses/trajetórias, curvas de distância e transições inerciais. O apoio dos dedos é corrigido com IK preservando o joelho e a orientação do tornozelo. Uma janela limitada adapta a aproximação à bola; carga maior reduz cadência e amplia a perna livre.

O modelo de equilíbrio continua reduzido: não simula músculos ou torques de cada articulação. Rapier resolve colisões por cápsulas verticais, bola e traves com CCD. Não há ragdoll. A biblioteca CC0 de Quaternius contém locomoção geral; o chute é uma sequência própria de keyframes. Não é animação capturada de futebol nem qualidade visual AAA.

Para o **8BitDo Ultimate 3-mode Controller for Xbox (81HB)**, a [página oficial de compatibilidade Apple](https://www.8bitdo.com/apple/) indica **Bluetooth e macOS 15.2+**; não oferece conexão por cabo no Mac para esse modelo. Coloque a chave em Mobile/Bluetooth, ligue, segure Pair por 3 segundos e selecione “8BitDo Ultimate 3mode Xbox” em Ajustes do Sistema → Bluetooth. Se o navegador não o detectar, abra o jogo em Safari ou Chrome e pressione novamente um botão com a página em foco.

Validação: `npm run test:controller` injeta um controle virtual na Gamepad API de uma janela Chromium separada e testa botões, eixos, menus, desconexão e reconexão. Não substitui teste do dispositivo físico. Sem vibração nesta versão.

## Implementação

### Regra de documentação para IAs

Toda funcionalidade implementada deve ser descrita na documentação correspondente no mesmo trabalho. Quando uma funcionalidade for alterada, removida ou substituída, todas as descrições afetadas também devem ser atualizadas para refletir o comportamento atual. Antes de concluir mudanças, revisar `README.md`, `docs/`, comentários, testes e `progress.md` em busca de referências desatualizadas. A documentação deve registrar comportamento observável, controles/APIs, parâmetros relevantes, limitações e validação, distinguindo requisitos do usuário de decisões de implementação.

- Simulação em passos fixos de 1/120 s, independente da renderização.
- Gravidade, arrasto aéreo, atrito de rolagem, restituição, efeito lateral simplificado, colisões com postes e travessão.
- Condução por contatos discretos, bola dinâmica, passes/chutes carregados e sincronizados com o pé, desarmes e colisões.
- 11 contra 11, posicionamento por formação, pressão, passes e finalizações da IA, goleiros com defesa e reposição.
- Gols, placar, reinício, lateral, escanteio e tiro de meta simplificados. Partidas de 3, 6 ou 10 minutos.
- Estádio sem torcida animada, gramado procedural, iluminação direcional e sombras. Assentos renderizados em instâncias; atletas em malhas com skin e geometria compartilhada.
- Câmeras de transmissão e tática; três níveis gráficos. Desempenho desativa sombras e limita resolução. Texturas e fontes locais.
- `window.render_game_to_text()` expõe estado serializado; `window.advanceTime(ms)` permite avanço determinístico da simulação para testes.

## Validação

```sh
npm test
npx playwright install chromium
# Com npm run dev na porta 5173:
npm run test:browser
```

`tests/web_game_playwright_client.js` é uma cópia local do cliente da skill develop-web-game, com tolerância de carregamento aumentada para60s e dependência Playwright local. Capturas e estados ficam em `output/`, ignorado pelo Git. O hook de cenários `window.__test` só existe com `?test` na URL.

## Limites desta versão

É uma base jogável, ainda sem fidelidade visual e de animação de um FIFA/EA FC moderno. Os atletas usam malhas estilizadas com animação esquelética, e as regras e a IA são simplificadas. Não implementa impedimentos, faltas/cartões, substituições, troca de lado/intervalo ou um conjunto completo de animações específicas de cobranças; lateral já usa gesto com as mãos e escanteio usa contato do pé. O relógio mostra 90 minutos em tempo acelerado e muda o indicador de período na metade da duração, sem pausa de intervalo.

Veja a [pesquisa técnica, decisões e medições](docs/movimento-e-fisica.md).

Prioridades seguintes: clips específicos de futebol, partidas/frenagens/cortes multidirecionais, LODs, contatos pé-bola mais precisos, animações autorais de goleiro e regras completas. As métricas do Chromium automatizado não substituem benchmark em GPU real.

Medição local em 17/09/2026: Chromium com ANGLE Metal, Apple M3 Pro, viewport de 1440×900, 100 frames por qualidade após aquecimento: média de 60 FPS e mediana de 16,7 ms nos três modos; p95 de 17,5–17,6 ms nos três modos, com a skin, os acessórios e Rapier ativos. É uma amostra curta de uma máquina. Reproduzir em macOS com `node tests/performance.js` (abre uma janela de teste).


## Assets e geração da biblioteca

Assets CC0 de Quaternius; [créditos e alterações](public/assets/athlete/CREDITS.md). Os arquivos fonte ficam em `assets/source/athlete` e não entram no build servido. `npm run build:motion` retargeta e gera a base compacta em `public/assets/athlete`. Modelo, texturas, fontes e poses são locais. A execução requer navegador moderno com WebGL2 e WebAssembly.

## Publicação

Jogue em **https://kmworks.dev/futebol/** (também disponível em www). Publicado no VPS KMWorks usando Nginx não-root, Docker Compose e Traefik/HTTPS, como o Potions. Configuração em `deploy/infra/apps/futebol`; estado da publicação em `deploy/release.json`. Infraestrutura versionada em `kmworks-infra`.

Build usa caminhos relativos para funcionar em subdiretório. O release estático inclui apenas `dist/`, Dockerfile, nginx.conf e manifesto de hashes. O backend tem empacotamento separado e overlay de infraestrutura, publicados junto do frontend; consulte [docs/backend.md](docs/backend.md). `/opt/futebol/current` e `/opt/futebol/backend-current` apontam para releases versionados; consulte o README da infraestrutura para deploy e rollback.

Condução ajusta o avanço da bola e o intervalo entre toques à velocidade, com preferência pelo pé direito. Segurar correr alonga os toques; ao acionar sprint, mesmo andando ou trotando e em qualquer direção, o primeiro toque avança3× a distância sem sprint para a mesma amplitude do direcional. Sem sprint, caminhada/trote usam tronco mais vertical, braços contidos e pés mais baixos; sprint mantém passada e ação corporal mais amplas. Os direcionais orientam cada contato com a bola, e o jogador a persegue com inércia e frenagem até se reposicionar; mudanças de direção usam contato corretivo que pode cortar a bola imediatamente para45°,90° ou180°, inclusive correndo. O corpo conserva inércia e freia pelos apoios; cortes em sprint podem exigir recuperação maior. A bola continua livre entre impulsos e pode ser tomada por adversários. Pesquisa, escolhas e limites: [docs/pesquisa-conducao.md](docs/pesquisa-conducao.md).

Controle próximo com LT/analógico suave e goleiros com saltos, contato das mãos, pegada/rebate e recuperação: [pesquisa e detalhes](docs/pesquisa-mobilidade-goleiro.md).

## Arena de treino

Na tela inicial, selecione **Arena de treino** em **Modo de jogo** e inicie. Todos os adversários, incluindo o goleiro, permanecem parados como obstáculos sólidos. Seu time continua ativo para praticar dribles, passes e finalizações, sem limite de tempo. O menu de pausa permite reiniciar ou voltar para selecionar **Partida**.
