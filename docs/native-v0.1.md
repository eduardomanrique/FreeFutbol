# Nova versão nativa — evidências da primeira arena

Data: 21/09/2026. Branch: `codex/arquitetura-longo-prazo`.

## Resultado

Nova árvore independente `native/`, com núcleo Rust, ponte GDExtension, cliente Godot e executável headless consumindo o mesmo core. Campo, bola, atleta procedural, condução, movimento, corrida, chute carregado, gols de treino, pausa e reinício. O legado web foi preservado, sem novas funcionalidades nesta etapa. A decisão explícita está no [ADR 0002](adr/0002-nova-versao-nativa.md).

## Ambiente executado

- macOS Apple Silicon, Apple M3 Pro.
- Rust 1.98.1, Godot 4.6.1 `14d19694e`, godot-rust 0.5.5/API4.6, Cargo.lock versionado.
- Renderer Godot Compatibility; saída identificou OpenGL 4.1 Metal no dispositivo Apple M3 Pro.
- Ferramentas instaladas localmente em `.tools/`, fora do versionamento. Não foi usado um browser para executar ou testar o jogo.

## Verificações

- Build real da extensão Rust: passou; Godot carregou a classe CampoSimulation.
- `python3 native/tools/native.py test`: nove testes do núcleo passaram, incluindo repetição de comandos a partir de clone, inputs inválidos, aceleração/velocidade, condução, rebote, chute, cancelamento e gol com bola inteira cruzando.
- `python3 native/tools/native.py check`: rustfmt e Clippy passaram, sem warnings no workspace.
- `python3 native/tools/native.py controls`: cena real carregada, eventos de teclado injetados pela API Godot; movimento, carga, pausa sem avanço de tick, cancelamento, retorno sem chute involuntário, reinício e equivalência entre duas instâncias da ponte passaram.
- `python3 native/tools/native.py smoke`: 240 ticks com carga/liberação e movimento, sem renderer; passou.
- Smoke gráfico com captura: executado em janela nativa, imagem inspecionada em `output/native/arena.png`. Corrigidos marcações, orientação das redes, iluminação e enquadramento após inspeção.
- Host headless executou 1.200 ticks sem Godot, com um gol no cenário de entrada. O tempo local curto não é benchmark de capacidade multiplayer ou comparação com o legado 11×11.

A primeira tentativa usou godot-rust0.4.5/API4.5 e apresentou falha no editor durante geração de ajuda. A combinação final foi alinhada para0.5.5/API4.6 e passou importação e execução. Não há fallback de simulação GDScript para esconder falha da biblioteca.

## Limites

É uma arena técnica inicial, não paridade visual ou mecânica com o legado. Atleta original procedural, física analítica aproximada e host sem rede. Ainda não há 11×11, IA, goleiro, cabeceio, disputa, regras completas, animação de futebol final, multiplayer ou replay persistente. Checkpoints nos testes são clones em memória, não formato estável de save/replay.

Windows, Linux, Intel macOS e Steam Deck não foram executados. Mapeamentos GDExtension são preparação, não certificação desses builds. Controle físico foi mapeado mas não testado com hardware. Sem exportação distribuível, assinatura, release, deploy ou merge. Engine, ponte e transitivas constam do [inventário de dependências](../native/third-party/DEPENDENCIES.md).
