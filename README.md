# CAMPO 26

Protótipo original de futebol 3D para navegador, com equipes fictícias. Three.js/WebGL, Rapier/WASM e Vite. Oferece partida offline, treino e multiplayer privado por código com backend autoritativo Node.js. O multiplayer foi implementado localmente; a publicação vigente continua sendo a versão anterior.

## Executar

```sh
npm install
npm run dev
```

Abra o endereço indicado pelo Vite. Para gerar arquivos estáticos: `npm run build`. Para testar a versão compilada: `npm run preview`.

## Multiplayer online (local)

Execute também `npm run server`, mantendo `npm run dev` aberto. Selecione **Online · por código**, crie uma sala e compartilhe o código/link. Os dois participantes confirmam **Estou pronto** e o criador inicia. Atlético ataca à direita; União, à esquerda. O menu online não pausa a partida. Sessões podem reconectar por até 30 s após a detecção de desconexão.

O servidor executa física e regras a 120 Hz em workers; clientes enviam comandos por WebSocket e recebem estados a 20 Hz. A apresentação usa interpolação de 75 ms; previsão local de movimento e compensação de latência ainda não estão implementadas. Salas ficam em memória, sem cadastro ou ranking. Offline e treino não dependem do backend.

[Operação, protocolo, limites, testes e publicação do backend](docs/backend.md). No desenvolvimento, os IPs IPv4 privados deste computador são aceitos automaticamente na porta 5173; abra esse endereço também no celular. Para domínio, HTTPS ou outra origem, configure `ALLOWED_ORIGINS` explicitamente. Não houve deploy do multiplayer.

## Jogar

- **WASD / setas:** mover (Atlético ataca para a direita).
- **Shift:** correr, consumindo fôlego.
- **J / L / I:** segurar para carregar passe rasteiro / alto / em profundidade; soltar agenda o contato da passada.
- **Direcional durante a carga:** escolher a mira, conservando a direção de deslocamento anterior.
- **Espaço:** segurar para carregar, soltar para chutar; a mira é assistida para o gol.
- **Q:** selecionar outro jogador próximo da bola.
- **K:** desarmar.
- **Esc:** pausar; configurações e controles também estão nesse menu.
- **F:** tela cheia.

Interface adaptável a telas pequenas. Suporta teclado e controles pela Gamepad API; não possui controles por toque.

### Controle Xbox / 8BitDo

Analógico esquerdo movimenta com velocidade proporcional e zona morta de 15%; RT corre, A passa, X carrega/solta o chute, B faz passe alto, Y faz passe em profundidade, LB troca jogador, Menu pausa. Sem bola, X desarma e B executa carrinho; LT marca/protege e RB modifica o chute para colocado. Nos menus, direcional/analógico navega, A confirma e B volta; esquerda/direita altera seletores. O teclado continua disponível.

Conecte o controle, abra o jogo e pressione um botão com a página em foco. Um indicador mostra a detecção. Ao conectar, reconectar ou sair de um menu, solte botões e centralize o analógico antes do próximo comando. Desconectar durante a partida pausa o jogo e cancela o chute carregado.

A detecção usa o layout `standard` do navegador ou o perfil aprendido. Foi removida a opção de forçar índices Xbox em relatórios Bluetooth não padronizados, pois isso podia confundir RT/LT com Menu/View. Abra **Configurações → Configurar botões do controle**, centralize os analógicos e siga os 9 botões indicados. O jogo reconhece gatilhos enviados como botões ou eixos e salva o perfil por dispositivo neste navegador. Mesmo em um layout reconhecido, essa configuração corrige remapeamentos específicos do aparelho. Somente Menu pausa.

Passes e chutes carregam ao segurar e são agendados ao soltar; a bola sai no contato da perna livre, não no evento do botão. Durante a carga, o direcional ajusta a mira sem redirecionar a corrida. Passes compensam a distância e o atrito; a carga aumenta seu ritmo. Chutes variam de9 a45m/s e possuem precisão dependente de força e distância. Gestos incluem giro, calcanhar e finalização comprometida com queda, apoio da mão e recuperação.

A bola permanece dinâmica durante a condução. O portador dá impulsos em contatos discretos dos pés; entre eles a bola conserva inércia e sofre atrito. Resistência explícita de5,8m/s² mais termo dependente da velocidade. No teste Rapier isolado, bolas a5/10m/s param em1,63/6,84m. Chutes fortes ainda podem sair antes de parar; esses valores são calibração de gameplay.

Domínio automático em todas as faixas enquanto alcançável: corpo99,9%, perto98%, médio95%, longo90%. Parado/andando, o jogador se vira para a bola; médio estende uma perna e longo aproxima com passada. Não exige direcional, mas respeita comando para sair do alcance. Chances por tentativa, sem novo sorteio a cada quadro. Goleiros mantêm regras separadas.

As [regras fixas da mecânica](docs/regras-da-mecanica.md) distinguem requisitos do usuário, calibrações e limitações. São a referência atual; não fazer deploy sem pedido explícito.

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

É uma base jogável, ainda sem fidelidade visual e de animação de um FIFA/EA FC moderno. Os atletas usam malhas estilizadas com animação esquelética, e as regras e a IA são simplificadas. Não implementa impedimentos, faltas/cartões, substituições, troca de lado/intervalo ou animações específicas de cobranças. O relógio mostra 90 minutos em tempo acelerado e muda o indicador de período na metade da duração, sem pausa de intervalo.

Veja a [pesquisa técnica, decisões e medições](docs/movimento-e-fisica.md).

Prioridades seguintes: clips específicos de futebol, partidas/frenagens/cortes multidirecionais, LODs, contatos pé-bola mais precisos, animações autorais de goleiro e regras completas. As métricas do Chromium automatizado não substituem benchmark em GPU real.

Medição local em 17/09/2026: Chromium com ANGLE Metal, Apple M3 Pro, viewport de 1440×900, 100 frames por qualidade após aquecimento: média de 60 FPS e mediana de 16,7 ms nos três modos; p95 de 17,5–17,6 ms nos três modos, com a skin, os acessórios e Rapier ativos. É uma amostra curta de uma máquina. Reproduzir em macOS com `node tests/performance.js` (abre uma janela de teste).


## Assets e geração da biblioteca

Assets CC0 de Quaternius; [créditos e alterações](public/assets/athlete/CREDITS.md). Os arquivos fonte ficam em `assets/source/athlete` e não entram no build servido. `npm run build:motion` retargeta e gera a base compacta em `public/assets/athlete`. Modelo, texturas, fontes e poses são locais. A execução requer navegador moderno com WebGL2 e WebAssembly.

## Publicação

Jogue em **https://kmworks.dev/futebol/** (também disponível em www). Publicado no VPS KMWorks usando Nginx não-root, Docker Compose e Traefik/HTTPS, como o Potions. Configuração em `deploy/infra/apps/futebol`; estado da publicação em `deploy/release.json`. Infraestrutura versionada em `kmworks-infra`.

Build usa caminhos relativos para funcionar em subdiretório. O release estático inclui apenas `dist/`, Dockerfile, nginx.conf e manifesto de hashes. O novo backend tem empacotamento separado e overlay de infraestrutura, ainda não aplicados; consulte [docs/backend.md](docs/backend.md). `/opt/futebol/current` aponta para um release versionado; consulte o README da infraestrutura para deploy e rollback.

Condução ajusta o avanço da bola e o intervalo entre toques à velocidade, com preferência pelo pé direito. Bolas adiantadas geram aproximação e recuperação automática; mudanças de direção exigem contato corretivo. A bola continua livre entre impulsos e pode ser tomada por adversários. Pesquisa, escolhas e limites: [docs/pesquisa-conducao.md](docs/pesquisa-conducao.md).

Controle próximo com LT/analógico suave e goleiros com saltos, contato das mãos, pegada/rebate e recuperação: [pesquisa e detalhes](docs/pesquisa-mobilidade-goleiro.md).

## Arena de treino

Na tela inicial, selecione **Arena de treino** em **Modo de jogo** e inicie. Todos os adversários, incluindo o goleiro, permanecem parados como obstáculos sólidos. Seu time continua ativo para praticar dribles, passes e finalizações, sem limite de tempo. O menu de pausa permite reiniciar ou voltar para selecionar **Partida**.
