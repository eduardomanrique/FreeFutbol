# Arena nativa v0.2 — gesto e contato de chute

Implementação em `native/`, branch `codex/arquitetura-longo-prazo`. Esta etapa continua a arena de um jogador Rust/Godot; o legado web permanece preservado.

## Comportamento implementado

O núcleo Rust fornece `MotionPose` em coordenadas de mundo: pés esquerdo/direito, fase do gesto e indicação de chute ativo. `SIMULATION_VERSION = campo-native-0.2.0` identifica esse contrato também no snapshot da GDExtension; não é ainda um formato de replay persistente ou protocolo online. Os pacotes Cargo continuam na versão de desenvolvimento 0.1.0.

Segurar Espaço prepara o pé direito e acumula potência. Soltar inicia um gesto de 24 ticks (aproximadamente 200 ms), com contato por segmento varrido do pé contra a esfera da bola, raios aproximados de 0,16/0,11 m. O impulso só ocorre após esse teste e uma verificação de alcance de 1,05 m/altura de 0,40 m. O alvo do pé fica congelado após contato e sua extensão é limitada durante a conclusão. A bola que escapa antes do contato cancela a ação. Uma nova pressão durante o gesto exige soltar antes de armar outra carga.

A direção de movimento anterior é comprometida durante carga/gesto; entradas direcionais ajustam a mira lateral do gol positivo X. Pausa e perda de foco cancelam a ação. A pose de locomoção usa os clips locais retargetados de `motion.json`/`poses.bin` sobre o Skeleton3D glTF do atleta Quaternius, com interpolação entre frames e fase de passada integrada pela distância percorrida. Trocas idle/andar/correr e entrada no chute usam blend curto a partir da pose-base, sem acumular overlay quando o mesmo snapshot é reaplicado. Durante andar, trote e sprint, a metade do ciclo selecionada pelo clip cria uma âncora visual persistente para o pé de apoio quando o osso está próximo do chão; o anchor é fixado no plano `y=0,05` e liberado/replantado na troca de pé, parada, reversão de direção ou quando excede o alcance medido da perna. O cabelo é reparentado a um `BoneAttachment3D` do osso `Head`, preservando a transformação de bind. Durante o chute, um solver IK analítico de duas articulações usa overrides globais temporários em `thigh_r`/`calf_r`, limita o target ao alcance medido e alinha o terminal `ball_r` ao target Rust; os overrides são limpos antes de cada snapshot. Não decide colisão nem aplica impulso. C alterna câmera próxima/ampla.

## Limites

É uma aproximação para testar o contrato físico/visual: o modelo e os clips são os recursos Quaternius já inventariados, mas a integração nativa não declara motion matching do navegador, mocap, solver corporal ou eliminação completa do deslizamento. As âncoras de apoio são visuais, têm tolerância de alcance e não alteram os alvos autoritativos. O overlay de gesto pode alongar a perna visual nos extremos de alcance. A condução continua usando proximidade do jogador e toques discretos, sem varredura do pé. Continuam ausentes outros jogadores, goleiros, IA tática, passes dedicados, cabeceios, disputas, regras completas, multiplayer e replay em arquivo.

Repetição idêntica no mesmo build é testada; determinismo entre plataformas não foi validado. Nenhum download ou dependência nova foi adicionado: a cópia runtime nativa mantém `CREDITS.md` e `LICENSE-CC0.txt`, com revisão humana de proveniência pendente. Código assistido por IA, sujeito a revisão humana antes de merge.

## Verificação em 21/09/2026

Ambiente: Apple M3 Pro, Rust 1.98.1, Godot 4.6.1, godot-rust 0.5.5/API 4.6.

- `python3 native/tools/native.py test`: 16 testes Rust passaram; contato/impulso, alcance, cancelamento, rearmamento, mira, movimento comprometido, repetição e regressões anteriores.
- `python3 native/tools/native.py check`: formatação e clippy do workspace passaram com avisos tratados como erros.
- `python3 native/tools/native.py controls`: passou; controles, pausa/foco/reinício, câmera, versão e poses de duas instâncias da ponte.
- `python3 native/tools/native.py smoke`: 240 ticks na engine, exigindo movimento e chute com elevação da bola durante o gesto.
- Captura gráfica real produzida e inspecionada: `python3 native/tools/native.py smoke --capture output/native-v02/final.png`; imagem do gesto em `output/native-v02/final-strike.png`.
- `athlete_visual.gd` passou, verificando Skeleton3D importado, mesh real, 65 índices de ossos, interpolação/estabilidade de pose, âncora de apoio persistente por múltiplos ticks e replantio em alcance/reversão/reset, target de pé Rust, cabelo seguindo `Head` e erro `ball_r` de 0,054 m no tick do impulso real, exigindo também apoio acima do chão. Na sequência real, o deslocamento máximo do pé entre ticks foi de 0,056 m em 88 pares com a mesma âncora; não é o deslizamento acumulado do apoio. No sprint houve apoio ativo em 136 dos 150 ticks totais, incluindo trocas de pé; esse contador não mede drift do sprint. A captura próxima fixa em 12 m está em `output/native-athlete/final.png`, com contato em `final-strike.png` e revisão ampla em `final-wide.png`. A apresentação desloca o peso em até 0,28 m na direção do alvo durante a preparação, sem mover o corpo físico.

A cópia da biblioteca para o cliente agora substitui o arquivo atomicamente, evitando sobrescrever uma biblioteca mapeada pelo processo antigo. A primeira tentativa de importação sofreu SIGKILL; com a substituição atômica, importação e controles passaram. O smoke automatizado ignora perda de foco para que alternar janelas não cancele o roteiro; o jogo normal preserva o cancelamento de segurança.

Sem release/deploy, empacotamento assinado ou validação Windows/Linux/Intel. O host headless continua sem transporte de rede.
