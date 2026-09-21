# Arquitetura de longo prazo — CAMPO / FreeFutbol

Versão 0.1 da proposta · 21/09/2026 · branch codex/arquitetura-longo-prazo.

**Status: proposta de arquitetura alvo.** O usuário escolheu uma nova implementação nativa independente em Rust/Godot; a primeira arena está em [native/](../native/README.md). O restante deste documento registra a análise e metas de longo prazo. A primeira etapa incremental em JavaScript está registrada em [núcleo v0.2](nucleo-v0.2.md). O jogo executável permanece em JavaScript, Three.js, Rapier/WASM e Node.js. Esta versão estabelece direção, alternativas, contratos e critérios de aceitação. Não constitui benchmark comparativo de engines nem garantia de alcançar a qualidade de EA Sports FC.

Convenções: **Fato** identifica código inspecionado ou documentação primária consultada; **Inferência** identifica consequência técnica provável que precisa de medição; **Recomendação** identifica uma decisão proposta. As páginas oficiais foram consultadas em 21/09/2026; páginas “stable” mudam. A seleção deverá fixar versões exatas, plugins, toolchains e licenças em um ADR.

## 1. Recomendação executiva

**Recomendação: evolução gradual para núcleo de simulação em Rust, servidor Linux nativo em Rust e cliente Godot 4, com GDScript tipado na apresentação e integração nativa fina.** Godot é o candidato preferido, sujeito ao vertical slice. Unreal é o concorrente obrigatório na avaliação de animação; Unity é uma alternativa se a equipe demonstrar produtividade significativamente maior. Não desenvolver uma engine gráfica própria.

Essa escolha prioriza um projeto aberto, auditável, reproduzível e sustentável por contribuições distribuídas. Não significa que Godot tenha hoje ferramentas de animação equivalentes às de Unreal. Se a prioridade dominante passar a ser obter apresentação de nível AAA com uma equipe experiente e financiada, Unreal com núcleo C++ independente passa a ser minha preferência. Essa seria uma mudança explícita de prioridades, custos e condições de licença.

A arquitetura híbrida é justificada por três requisitos juntos: servidor econômico, testes sem editor e liberdade para trocar a apresentação. Ela cobra um preço: duas toolchains, ponte nativa, exportação de dados de animação e debugging entre runtimes. Não criar uma plataforma genérica multi-engine: manter apenas o adaptador de produção escolhido depois da avaliação.

**Respostas diretas:**

| Pergunta | Decisão proposta |
| --- | --- |
| Reescrever ou evoluir? | Evoluir; portar módulos quando houver contrato, fixture e benefício demonstrado. |
| Separar núcleo e engine? | Sim. Física autoritativa, regras, controle motor e tática independem do renderizador. Transporte fica fora do núcleo. |
| Linguagem oficial do núcleo? | Rust; JavaScript permanece durante a transição. Não manter versões permanentes da mesma regra em três linguagens. |
| Cliente desktop? | Godot 4 como candidato principal, condicionado aos critérios deste documento. |
| Servidor? | Executável Rust/Linux usando o mesmo núcleo, sem Godot, GPU ou assets visuais. Node.js continua operacional até a substituição comprovada. |
| Mesma lógica offline/online? | A mesma biblioteca compilada em todos os executáveis; inputs ordenados por tick e snapshots completos. |
| Replays? | Comandos aceitos por tick, PRNG, versão exata, estado completo, checkpoints e hashes canônicos. |
| Agentes independentes? | Módulos com APIs pequenas, fixtures compartilhadas e ownership; uma issue por mudança coerente. |
| Quem aprova? | Humanos responsáveis; agentes implementam e podem revisar, mas não aprovam o próprio merge. |

### O que existe e merece ser preservado

**Inventário na redação inicial (antes da v0.2):** package.json e src/ contêm JavaScript ES modules, não TypeScript. Match, em src/simulation.js, já atende simulação headless e multiplayer. server/match-worker.js executa 120 ticks/s e publica 20 snapshots/s; shared/protocol.js define protocolo 1 e valida comandos. Match aceita gerador aleatório injetado, mas usa Math.random por padrão. src/motion-matching.js importa Three.js e é importado pela simulação: existe separação funcional, mas ainda não isolamento de dependências.

Os snapshots de apresentação não contêm todo o estado necessário para rollback/replay. Há testes de física, tática, recepção, cabeceio, contatos, protocolo, servidor, workers e condições de rede. Foram executados **149 testes com sucesso** e o build passou nesta investigação, com o aviso de chunks grandes. Isso é uma base de regressão útil; não comprova realismo, segurança completa nem capacidade de produção.

O multiplayer atual representa duas pessoas controlando equipes de 11. **22 atletas simulados não significa suporte a 22 clientes humanos.** O novo contrato deve permitir player slots; a carga de 22 conexões será avaliada separadamente.

### Baseline medida nesta branch

O benchmark existente foi reexecutado depois do término dos testes/build concorrentes.
Uma amostra isolada no Apple M3 Pro, Node 20.19.4, com dez segundos simulados por grupo:

| Partidas sequenciais | Tick agregado p95 | Tick agregado p99 | RSS do processo |
| --- | --- | --- | --- |
| 1 | 1,098 ms | 1,663 ms | 218 MiB |
| 4 | 3,348 ms | 4,446 ms | 237 MiB |
| 8 | 6,005 ms | 7,266 ms | 242 MiB |

Snapshots ficaram perto de 38,5–38,7 kB em JSON e 8,7–8,8 kB na compressão simulada,
equivalentes a aproximadamente 347–352 kB/s por partida com dois destinatários a 20 Hz.
São bytes estimados pelo script, não tráfego observado no transporte real. O p99 inclui
serialização/compressão nos ticks de publicação. RSS é do processo inteiro ao longo
dos grupos; não permite concluir memória incremental por partida. O campo
oneCorePercent do script usa tempo de parede, não medição direta de CPU.

**Limitações:** uma execução, RNG não fixado, aquecimento curto, sem sockets, TLS,
workers, pressão real de hospedagem ou 22 clientes. A primeira execução concorrente
com build/testes foi descartada. [Relatório bruto e ressalvas](benchmarks/2026-09-21-js-baseline.json).

**Inferência:** não há evidência aqui de que trocar JavaScript por Rust seja necessário
para suportar uma única partida. Há evidência suficiente para investigar volume dos
snapshots e fazer um benchmark real do servidor antes de justificar o port por custo.

## 2. Comparação das alternativas

As qualificações da tabela são **avaliações de engenharia**, não medições. Nenhuma linguagem determina sozinha FPS, custo por partida ou qualidade física.

| Dimensão | Unreal + C++ | Unity + C# | Godot + GDScript/C++/Rust | Bevy + Rust | Engine própria Rust/C++ | Híbrida: núcleo independente + engine |
| --- | --- | --- | --- | --- | --- | --- |
| Visual máximo prático | Referência forte para produção AAA | Muito alto com pipeline e equipe adequados | Alto; mais trabalho especializado para futebol AAA | Alto potencial, mais infraestrutura por construir | Teoricamente alto; execução muito arriscada | Herdado da engine escolhida |
| Animação/retargeting | Ferramentas integradas muito fortes | Pipeline humanoide maduro | Ferramentas úteis; validar lacunas avançadas | Maior trabalho de integração/autoria | Todo o pipeline é responsabilidade própria | Engine anima; núcleo possui contatos de gameplay |
| Física | Chaos integrado; calibrar futebol | Física integrada; calibrar futebol | Física integrada ou extensão | Biblioteca/plugin externo | Escolher biblioteca; não escrever solver sem necessidade | Um único backend autoritativo em todos os modos |
| IA tática | Ferramentas gerais; futebol é específico | Idem; bom ambiente de autoria | Idem; código/data próprios | ECS útil, não entrega tática | Tudo específico | Tática testável sem editor |
| Servidor autoritativo | Dedicado maduro | Build dedicado | Headless/export dedicado | Aplicação sem render | Binário mínimo sob controle | Binário do núcleo independente |
| CPU/RAM/tamanho | Medir build depurado; dependências de engine | Medir stripping, GC e loop | Medir recursos e scripts mantidos | Potencial enxuto se plugins mínimos | Potencial enxuto; custo de implementação alto | Potencial menor footprint; FFI só no cliente |
| Desktop | Windows/macOS/Linux; recursos variam por GPU | Windows/macOS/Linux | Windows/macOS/Linux | Validar matriz de dependências e drivers | Cada plataforma aumenta manutenção | Interseção engine, ponte e toolchain |
| Steam Deck | Exige perfil escalável | Exige perfil escalável | Exige perfil escalável | Exige perfil escalável | Exige perfil escalável | Teste Linux/Proton e controles |
| Consoles | Caminho comercial estabelecido | Caminho comercial estabelecido | Parceiros/port próprio sob NDA | Investigar toolchain e port | Maior risco de port e certificação | Ponte/core também precisam ser aceitos |
| Agentes de IA | C++ revisável; assets/Blueprints dificultam diff | C# acessível; cenas e assets requerem disciplina | Código e cenas textuais ajudam; Rust é integração comunitária | Texto e Cargo favorecem automação; APIs mudam | Texto simples, superfície técnica enorme | Bom com contratos; ruim se agentes atravessarem camadas |
| Revisão humana | C++ exige revisão de lifetime, threads e macros | Mais simples em lógica; atenção a GC/Unity API | Boa em módulos pequenos e dados textuais | Ownership ajuda, ECS/concorrência exigem domínio | Toda infraestrutura vira responsabilidade da equipe | Contratos e evidências reduzem contexto por PR |
| Testes | Forte, mas integração pode exigir engine | Forte; separar lógica pura | Headless e testes puros via núcleo | cargo test e execução headless | Grande liberdade, muitos testes por criar | Melhor isolamento de regras e apresentação |
| Determinismo/replay | Não presumir física bit a bit | Não presumir física bit a bit | Não presumir física bit a bit | Rust/ECS não garantem ordem determinística | Responsabilidade explícita | Mesma build + contratos; cross-platform precisa prova |
| Licença/liberdade | Proprietária, código acessível sob EULA | Proprietária, planos/termos comerciais | Engine MIT; bindings e assets têm próprias licenças | MIT/Apache-2.0 | Licença própria + dependências | Núcleo aberto; cliente herda condições da engine |
| Dependência externa | Alta em tooling e distribuição de engine | Alta em tooling/termos/pacotes | Menor lock-in; risco em plugins/parceiros | Menor lock-in; risco em churn/manutenção | Lock-in na própria equipe | Reduz lock-in do gameplay, não do conteúdo |
| Comunidade/ecossistema | Muito forte em produção 3D | Muito amplo em jogos e ferramentas | Amplo ambiente aberto; menor experiência AAA | Menor e em evolução | Sem ecossistema próprio inicialmente | Soma integração a ecossistemas existentes |
| Artistas/designers | Excelente ambiente integrado | Muito bom | Bom editor; pipeline avançado exige trabalho | Menor prontidão para contribuidores não programadores | Ferramentas terão de ser criadas | Bom se designers editarem dados pelo editor |
| Build/CI/distribuição | Compilação/cooking e runners caros | Editor, licenciamento CI, IL2CPP/pacotes | Export templates + libs por arquitetura | Cargo simples conceitualmente; builds ainda pesados | Todos os empacotadores e ferramentas próprios | Duas toolchains e ABI versionada |
| Manutenção 5–10 anos | Migrações, fornecedor, plugins, conteúdo binário | Migrações, planos, pacotes e pipeline | Investimento em animação e bindings | Migrações frequentes e editor/ecossistema | Maior custo estrutural | Custo inicial maior, migração futura mais localizada |

### Unreal Engine + C++

**Fatos:** Unreal documenta Motion Matching com Pose Search e ferramentas de depuração, além de retargeting por IK Rig. Isso oferece uma base de autoria e diagnóstico relevante para transições, mudanças de direção e contatos. [Motion Matching](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine), [IK Retargeting](https://dev.epicgames.com/documentation/en-us/unreal-engine/ik-rig-animation-retargeting-in-unreal-engine).

O tutorial oficial de servidor dedicado usa um projeto C++ e uma build da engine a partir do código-fonte. Isso precisa entrar no orçamento de CI. A documentação de macOS apresenta requisitos diferentes por recurso gráfico; suporte a Mac não implica paridade de efeitos entre Intel e Apple Silicon. [Servidor dedicado](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-dedicated-servers-in-unreal-engine), [macOS](https://dev.epicgames.com/documentation/en-us/unreal-engine/macos-development-requirements-for-unreal-engine).

**Inferência:** é o caminho mais curto entre as alternativas para uma equipe de animação experiente produzir apresentação ambiciosa. Isso não fornece automaticamente bola convincente, arbitragem, goleiro ou decisões táticas.

**Recomendação:** se selecionada, usar C++ para núcleo independente de UObject, World e replication; Blueprints para apresentação e autoria limitada. Não é necessário introduzir Rust numa equipe competente em C++ apenas por preferência estética.

**Fato sobre licença:** acesso ao fonte não equivale a licença open source. A EULA regula redistribuição de código e ferramentas e lista combinações incompatíveis, incluindo GPL e determinadas situações envolvendo LGPL e CC BY-SA. O modelo padrão de royalties inclui taxa de 5% sobre receitas elegíveis acima da exclusão de US$ 1 milhão vitalício por produto; há exclusões e programas próprios. Não tratar esse resumo como a regra completa de todas as receitas. [EULA oficial, seções 4–6 e Royalty Addendum](https://www.unrealengine.com/eula/unreal).

### Unity + C#

**Fatos:** Unity oferece retargeting de humanoides e build Dedicated Server com remoção de trabalho e recursos desnecessários. Há limitações documentadas nas otimizações de conteúdo. A Runtime Fee foi cancelada; não deve ser usada como custo vigente na comparação. Planos e assinaturas continuam sujeitos aos termos comerciais. [Retargeting](https://docs.unity3d.com/6000.0/Documentation/Manual/Retargeting.html), [Dedicated Server](https://docs.unity3d.com/6000.0/Documentation/Manual/dedicated-server-optimizations.html), [preços e cancelamento](https://unity.com/products/pricing-updates).

**Inferência:** C# e editor maduro facilitam onboarding de agentes e designers. O custo está em manter dados, cenas, runtime, pacotes e pipeline coerentes. Evitar alocações no tick e medir pausas de GC; adotar ECS/Jobs/Burst somente quando perfis justificarem, sem misturar dois modelos de gameplay sem necessidade.

**Alternativa coerente:** Unity com núcleo C# puro e servidor .NET independente. Compartilhar código C# não torna PhysX do cliente disponível num processo .NET comum; o backend de física também precisa ser comum. Se Unity vencer por competências reais da equipe, reavaliar Rust em vez de impor FFI desnecessária.

### Godot + GDScript/C++/Rust

**Fatos:** Godot tem AnimationTree, retargeting de esqueletos 3D, exportação dedicada e modo headless; a licença da engine é MIT. Esses recursos não constituem um pipeline completo de futebol. [AnimationTree](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html), [retargeting](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/retargeting_3d_skeletons.html), [servidores](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_dedicated_servers.html), [licenças](https://docs.godotengine.org/en/stable/about/complying_with_licenses.html).

GDScript, C# e C++ são linguagens oficialmente suportadas; Rust depende de bindings comunitários, como godot-rust. As distribuições macOS suportam Intel e Apple Silicon, mas GPU, SO, renderer e extensões também precisam ser compatíveis. [FAQ](https://docs.godotengine.org/en/stable/about/faq.html), [godot-rust](https://godot-rust.github.io/book/), [requisitos](https://docs.godotengine.org/en/stable/about/system_requirements.html).

**Recomendação:** GDScript tipado para menus, câmeras e integração de cenas; Rust para simulação. Preferir godot-rust se a versão escolhida passar na matriz de builds. Alternativa: GDExtension C++ muito fina chamando uma ABI C do Rust; só adotar se reduzir um problema concreto de suporte. Não permitir regras distintas nas duas pontes.

**Inferência:** melhor equilíbrio para liberdade e colaboração aberta, mas com provável investimento próprio maior em motion matching, warping e ferramentas de inspeção de contato. Orçar isso antes da escolha definitiva.

### Bevy + Rust

**Fatos:** Bevy é uma engine ECS em Rust sob MIT/Apache-2.0. O próprio projeto alerta para funcionalidades ausentes e mudanças incompatíveis frequentes. [Repositório oficial](https://github.com/bevyengine/bevy).

**Inferência:** ótimo encaixe para agentes trabalhando em código, testes e sistemas de dados. Encaixe menos favorável para uma comunidade com animadores e designers que precisa de ferramentas prontas. ECS não resolve ordem determinística de sistemas, física, tática nem networking por si só.

**Recomendação:** candidato para ferramentas ou experimento delimitado, não cliente principal agora. Não acoplar game-core ao ECS de Bevy; isso apenas substituiria um tipo de dependência por outro.

### Rust/C++ com engine própria

**Inferência:** controle máximo sobre memória, dados, scheduler e binário. Porém editor, importadores, shaders, materiais, retargeting, depuração, UI, acessibilidade e distribuição consomem a capacidade que deveria melhorar futebol.

**Recomendação:** construir o simulador específico de futebol, não uma engine generalista. Usar bibliotecas maduras de física e transporte. C++ é uma opção válida se a equipe puder revisar memória e concorrência com competência; Rust reduz classes de erros no código seguro, mas não valida a lógica nem as bibliotecas unsafe.

### Híbrida

**Recomendação:** manter estado e decisões autoritativas fora da engine, mas aproveitar seu editor e renderização. Não executar um servidor remoto obrigatório para jogar offline: o cliente carrega a biblioteca localmente. FFI por buffers em lote por tick/frame, não uma chamada por osso.

**Inferência:** pode reduzir custo do servidor e tornar reprodução de bugs independente da máquina do artista. Pode também duplicar matemática, sistema de assets e ferramentas se o contrato for mal definido. O slice deve demonstrar o benefício líquido da ponte.

## 3. Arquitetura recomendada

### Dependências e execução

~~~text
                teclado / controle / bot / replay
                              |
                         CommandFrame
                              |
offline: host local ----> game-core <---- servidor: admissão de inputs
                         /    |    \
                    physics rules tactics
                              |
                      estado + eventos
                         /          \
            render snapshot       checkpoint completo
                   |                    |
             engine visual        replay / rollback
~~~

**Contrato proposto:** create(config, seed, gameplayData), step(commandsForTick), saveCheckpoint(), restoreCheckpoint(), stateHash(), renderSnapshot(). Tick inteiro monotônico; IDs estáveis; metros, segundos e radianos; eixo Y para cima e plano XZ, com conversões apenas nos adaptadores.

O núcleo não importa Godot, Unreal, Three.js, sockets, relógio do sistema, UI ou filesystem. Configuração e dados são entregues pelo host. Uma partida tem um dono de estado e uma ordem explícita: validar comandos admitidos → percepção/tática quando devida → intenção motora → contatos/física → regras → eventos/snapshot. Fechar a ordem exata em ADR e testes; nunca depender de ordem incidental de HashMap ou threads.

Começar com 120 Hz para preservar o contrato existente; comparar 60 Hz com substeps e 120 Hz no slice. Não escolher frequência apenas pelo número: CCD, velocidade da bola e erro de contato decidem. IA tática pode decidir a 10–20 Hz escalonados, enquanto controle motor e colisões atualizam em cada tick.

### Física e animação: a fronteira mais importante

**Recomendação:** Rapier em Rust como primeiro backend, pela continuidade conceitual com o protótipo. Validar versão, parâmetros e diferenças numéricas; portar de JS para Rust não garante equivalência bit a bit. Conservar wrappers que permitam substituir a biblioteca sem expor seus handles ao restante do jogo.

Física da bola: gravidade, arrasto, spin/Magnus quando calibrado, rolamento, restituição por superfície, CCD e impulsos de contato. Jogadores: controle motor reduzido com aceleração, apoio, equilíbrio simplificado, cápsulas e volumes de contato específicos. Não simular 22 corpos humanos com todos os músculos e articulações como requisito inicial.

**Contato não pode ser um callback visual disparado pela engine.** Chute, domínio, carrinho, cabeceio e defesa precisam de trajetórias e janelas autoritativas: action ID, fase, pé/cabeça/mão, posição relativa, alcance, apoio e impulso. Exportar dos clips dados compactos de root motion, marcadores e trajetórias de contato; esses dados de gameplay são versionados e carregados também no servidor.

O renderizador escolhe poses compatíveis, mistura, aplica IK e corrige erros cosméticos. Root motion que altera resultado pertence ao núcleo; o cliente não pode decidir sozinho o tick de impacto. Se o movimento visual exige alterar o contato, muda-se o dado compartilhado e revalida-se a simulação. Ragdoll cosmético não decide posse ou colisões.

Essa solução evita avaliar o esqueleto completo no servidor, mas exige provar que o proxy de contato é suficientemente fiel. É uma hipótese central do slice, não uma otimização já validada.

### IA de futebol

Três escalas: plano coletivo (formação, altura do bloco, pressão e transição), decisão individual (desmarque, passe, cobertura, interceptação) e controle motor (trajetória/apoio/contato). Usar utilidade, máquinas de estado e custos de passe/interceptação primeiro; futebol em campo aberto não precisa ser reduzido a navmesh.

Percepção e atraso de reação devem ser parâmetros explícitos. Toda consulta recebe estado da partida, não objetos da cena. Testar simetria entre equipes, ocupação de espaços, largura/profundidade, marcação, transição e regras, além de resultado de gols. LLMs não pertencem ao loop de partida; aprendizagem de políticas pode ser pesquisa futura com execução limitada, reproduzível e comparada a baseline.

### Networking e servidor

Comandos descrevem intenção; posição, gol, posse, fôlego e força final são calculados no servidor. A admissão limita taxa, tamanho, sequência, janela de ticks, slot autorizado e comandos impossíveis. Registrar o tick em que o servidor aceitou cada comando, incluindo neutralização por timeout.

Cliente online: predição usando o mesmo núcleo, histórico limitado de comandos e reconciliação com estado autoritativo; adversários podem ser interpolados. Predizer só o jogador local tem limites em disputas de bola: avaliar previsão de toda a partida ou uma região de interação consistente, sem acreditar que as futuras decisões remotas são conhecidas.

Não aplicar rewind de tiro instantâneo à bola de futebol. A bola tem trajetória contínua e disputas compartilhadas; rollback amplo pode revisar contatos de todos. Começar com servidor autoritativo, predição e correção, usando rollback limitado no cliente. Compensação adicional exige experimento e revisão de justiça.

Servidor alvo: Rust/Linux, match workers com estado isolado, scheduler medido, buffers reutilizáveis, nenhum renderer. Paralelizar partidas antes de paralelizar o solver de uma partida. Um processo por partida simplifica isolamento, mas aumenta overhead; comparar com pool pequeno e limites de blast radius. Tokio pode tratar I/O; o tick não deve bloquear o executor de rede.

Transporte: manter WebSocket durante a migração. Para desktop, avaliar QUIC com datagramas para estados/comandos redundantes e streams confiáveis para lobby/controle, usando implementação mantida. UDP especializado é alternativa, não autorização para escrever criptografia própria. Comparar perda, head-of-line, MTU, retransmissão, consumo e acesso por redes restritivas antes de trocar. Node.js pode continuar no lobby se economicamente razoável.

### Offline, determinismo e replay

Offline usa exatamente a mesma biblioteca e os mesmos dados de gameplay; muda quem fornece comandos e tempo. Modo online usa a biblioteca no servidor e na predição. Bibliotecas compiladas para diferentes arquiteturas ainda podem divergir numericamente.

Três contratos separados:

1. **Reprodução de bug:** mesma build, plataforma/toolchain e dados devem reproduzir cada tick.
2. **Determinismo entre plataformas:** alvo validado por corpus em Windows, Linux, macOS x86_64 e arm64; não pressuposto.
3. **Compatibilidade histórica:** replay antigo pode exigir runtime antigo ou reprodução por estados gravados. Não prometer reexecutá-lo no solver novo.

**Fato:** Rapier documenta determinismo entre plataformas sob condições específicas, incluindo enhanced-determinism, plataformas IEEE adequadas e cuidados com funções matemáticas de inicialização. Isso não torna a lógica externa determinística. Fixar features/versão e medir impacto, sem supor que todo modo SIMD é compatível. [Determinismo Rapier](https://rapier.rs/docs/user_guides/rust/determinism/).

**Recomendação:** PRNG especificado e com estado serializável; streams por sistema para evitar cascatas por consumo incidental. Proibir relógio real, RNG global, fast-math não aprovado e redução paralela de ordem variável no núcleo. Funções trigonométricas e arredondamento precisam da mesma política em todas as builds.

Replay contém simVersion, replayVersion, protocolVersion, commit/build hash, toolchain/features, config e hashes de dados, seed/estado PRNG, checkpoint inicial e comandos aceitos por tick. Checkpoints incluem estado de regras, cooldowns, apoio/gestos, histórico de percepção, filas e estado necessário do solver, inclusive caches quando relevantes. Snapshot visual não serve para isso.

Hash canônico exclui endereços, padding e cache cosmético; define ordem, representação de floats e tratamento de NaN. Testar execução contínua versus salvar/restaurar no meio, não apenas duas partidas desde o início. Localizar primeiro tick divergente e apresentar diff por sistema. Erro numérico tolerado é um teste de equivalência aproximada, não determinismo.

Para upgrades de solver, manter corpus antigo no runtime antigo e aprovar novas expectativas separadamente. Replay para assistir pode armazenar estados/keyframes suficientes para interpolação; replay para reproduzir bugs precisa reexecutar a lógica. Arquivos vindos de usuários são entradas não confiáveis, com limite de tamanho e processamento.

### Diretórios alvo

Não mover todos os arquivos agora. Criar os diretórios conforme módulos sejam extraídos.

~~~text
/
├── AGENTS.md
├── CONTRIBUTING.md
├── .github/
│   ├── CODEOWNERS
│   ├── pull_request_template.md
│   └── workflows/                 # plano; ainda não implementado
├── crates/
│   ├── game-core/                 # tick, MatchState, comandos, regras
│   ├── physics/                   # wrapper Rapier, bola e contatos
│   ├── tactics/                   # percepção, utilidade, planos coletivos
│   ├── animation/                 # controle motor/dados; sem renderer
│   ├── networking/                # schema, codecs, limites; sem gameplay
│   ├── replay/                    # gravação, restauração, hashes e CLI
│   └── sim-types/                 # IDs e DTOs mínimos; evitar depósito genérico
├── server/                       # Node atual; Rust só após gate de migração
├── client/
│   └── godot/                    # cenas, UI, materiais, animação visual
├── bindings/
│   ├── godot/                    # ponte fina
│   └── wasm/                     # ponte transitória para cliente web
├── tools/                        # bake de animação, inspeção, benchmarks
├── tests/
│   ├── scenarios/
│   ├── replays/
│   ├── network/
│   ├── visual/
│   └── performance/
├── assets/
│   ├── source/                   # Blender/clips originais
│   ├── manifests/                # proveniência/licença/hash por asset
│   ├── gameplay/                 # dados compactos de contato
│   └── generated/                # derivados reproduzíveis
├── docs/
│   ├── adr/
│   ├── architecture/
│   └── operations/
├── src/                          # protótipo preservado durante transição
└── shared/                       # protocolo atual
~~~

game-core orquestra physics, tactics e animation; estes dependem de tipos mínimos, não do estado interno completo do core. networking só codifica DTOs; replay pode chamar o núcleo, mas o núcleo não depende do gravador. APIs Rust internas normais; ABI C com handles opacos e buffers de ownership explícito apenas quando exigida pelo adaptador. Não atravessar FFI com panics, referências sem lifetime ou tipos internos do compilador.

## 4. Processo de contribuições por IA

Fluxo proposto:

**Issue → proposta técnica proporcional ao risco → implementação pelo agente → testes → replay/cenário → benchmark → pré-revisão humana quando necessária → PR → CI → aprovação humana → merge.**

Abrir draft PR cedo ajuda a colaboração; não é necessário bloquear todo desenvolvimento até a revisão final. Mudança pequena não exige um tratado, mas precisa de critério observável. Mudança estrutural exige ADR antes de expandir a implementação.

Cada issue informa módulo, comportamento atual/desejado, invariantes, orçamento de performance, fixtures e arquivos esperados. Agentes podem operar em branches/worktrees independentes; alteração de API compartilhada precisa ser coordenada. Não usar quantidade de código ou de testes como métrica de qualidade.

O autor humano responde pelo código produzido com IA. O PR declara ferramenta/modelo quando conhecido, partes geradas, origem de código/assets, comandos executados, resultados e limitações. Não exigir cadeia de pensamento nem transcrições com segredos. Revisão automática complementa revisão humana; concordância entre dois agentes não constitui aprovação humana.

### Aprovação obrigatória

Toda mudança incorporada à principal exige revisão humana independente do autor. Exigir dois responsáveis qualificados para física/contatos, arbitragem, protocolo/replay/serialização, predição e autoridade, unsafe/FFI, concorrência, novas dependências, licenças, CI/permissões, deploy e baselines de qualidade.

Se só existir um mantenedor, registrar que não há revisão independente disponível. Não contar o agente como segundo mantenedor nem simular aprovação. Trabalhos experimentais podem continuar em branch; merge sensível aguarda revisor habilitado.

Mudanças puramente editoriais, sem alterar regras/políticas, podem ter uma revisão. Alteração de CODEOWNERS, proteção de branch ou política de aprovação exige o mesmo rigor das áreas que protege.

### Arquivos de governança

AGENTS.md contém comandos reais, invariantes, limites de dependência, política de evidências e regra de documentação. CONTRIBUTING.md define fluxo e responsabilidade, sem autorizar publicação automática. CODEOWNERS mapeia responsáveis reais; o proprietário atual do remoto é o responsável inicial, a substituir por equipes à medida que forem formadas.

Proteger main por ruleset: PR obrigatório, checks exigidos, revisão de code owner, aprovação invalidada após mudanças, conversas resolvidas, ausência de force push/exclusão e bypass restrito e auditável. Agentes não recebem tokens de administrador ou credenciais de deploy.

**Fato:** CODEOWNERS solicita revisores, mas não obriga aprovação sem configuração correspondente. Quando há vários owners numa linha, uma aprovação pode bastar; não usar isso como prova de dois domínios revisados. Configurar número de aprovações e, se necessário, gate adicional de áreas. [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

Nesta versão, os arquivos de contribuição são adicionados localmente. Rulesets, equipes, permissões, CI hospedada e ambientes protegidos **não foram configurados no GitHub**.

### Dependências, licenças e assets

Não é possível garantir ausência total de vulnerabilidades; é possível reduzir risco com controles independentes. Pin de toolchain e lockfiles; diff de dependências transitivas; inventário/SBOM; scanner de vulnerabilidades e segredos; allowlist de licenças; revisão de build scripts, proc macros e dependências Git. cargo audit/deny e ferramentas equivalentes para npm são camadas, não prova de segurança.

**Recomendação de licença:** código próprio sob Apache-2.0 OR MIT, preservando avisos de terceiros; assets preferencialmente CC0, ou CC BY com atribuição automatizada. Não aplicar retroativamente sem autorização dos titulares. A árvore inspecionada não possui LICENSE de código na raiz; licenças CC0 de assets não licenciam automaticamente o jogo.

GPL/AGPL e CC BY-SA exigem decisão consciente de compatibilidade e estratégia; “open source” não significa que todas as licenças podem ser combinadas. Para manter a opção Unreal, a análise deve respeitar sua EULA. Assets “gratuitos” em marketplaces não são necessariamente redistribuíveis em repositório público. NC/ND não entram no pacote padrão recomendado.

Manifesto por asset: autor, URL/origem, licença SPDX quando aplicável, texto da licença, hash, modificações, atribuição, permissões de distribuição e arquivos derivados. Assets gerados por IA declaram ferramenta/data, origem das referências e revisão humana dos direitos; a geração não é prova de licença.

Não importar jogadores, marcas, uniformes ou capturas de EA/clubes sem autorização. Personagens e equipes fictícios permanecem padrão. Imports passam por limites de tamanho, validação estrutural e processamento isolado.

Qualidade: unidades, eixo, escala, root bone, bone count, nomes, LODs, orçamento de polígonos/texturas, compressão, root motion, marcadores de apoio/contato, clipping e foot sliding. Fontes editáveis em formatos abertos quando possível; binários grandes em LFS com orçamento de armazenamento. Revisão inclui vídeo e cena reproduzível, não só thumbnail.

### CI, protocolo, releases e segurança

| Camada | Quando | Evidência/gate |
| --- | --- | --- |
| Formatação, compilação, limites de imports | Todo PR | Sem dependência de renderer no núcleo |
| Unitários/propriedades | Todo PR | Invariantes físicos, regras, simetria, limites de inputs |
| Corpus de replay | Todo PR que altera gameplay | Hash exato por tick no domínio declarado; restore intermediário |
| Builds de plataforma | PR relevante / candidato | Windows, Linux, macOS Intel e arm64; ponte carregável |
| Fuzz e sanitizers | PR sensível + noturno | Codec/replay/FFI; ASan/UBSan/TSan para C++, Miri onde aplicável |
| Multiplayer | PR relevante | Offline/host/cliente, reconexão, inputs inválidos, perda/jitter/reordenação |
| Visuais | PR de apresentação | Câmeras/poses/seeds fixas; tolerância por GPU e inspeção humana |
| Performance | PR de hot path + noturno | Máquina dedicada, repetições, p95/p99, RSS, bytes e custo/partida |
| Soak/carga | Noturno e release | 1/8/32 salas, 2/22 clientes, crescimento de memória, crashes |
| Supply chain | Todo PR/release | Licenças, SBOM, segredos, vulnerabilidades, provenance |
| Release | Tag aprovada | Artefatos assinados, checksums, matriz compatível e rollback |

No protótipo: npm test, npm run build, npm run test:browser e npm run test:online conforme o módulo; o benchmark existente é baseline exploratória. Futuro Rust: fmt/clippy/test, corpus e benchmarks de release. Não introduzir todos os serviços/ferramentas antes de haver módulos para validá-los.

**Recomendação de isolamento:** PRs de forks em runners efêmeros sem segredos, sem credenciais de cloud, sem Docker socket privilegiado. Não executar código não confiável com pull_request_target ou em runner persistente de produção. Actions fixadas por SHA completo; cache de PR não deve contaminar release; permissões mínimas e identidade temporária na publicação. [Segurança de Actions](https://docs.github.com/en/actions/reference/security/secure-use).

Protocolo, simulação, replay e dados de gameplay têm versões independentes. Handshake negocia protocolMajor/minor, simVersion e gameplayDataHash; incompatibilidade de simulação recusa partida antes de entrar. Minor só para extensões realmente compatíveis; campos opcionais desconhecidos limitados/ignorados conforme schema. Fixtures golden de codecs e testes de pares de versões.

Releases reproduzíveis quando tecnicamente possível, com hashes de fontes e dependências, changelog, known issues, migrações e manifest de cliente/servidor. macOS requer estratégia de assinatura/notarização; Windows assinatura quando disponível; Linux define distribuição/base mínima. Nunca servir JavaScript novo contra servidor incompatível sem negociação.

Deploy: staging → canário → drenar partidas antigas → novas salas na versão nova → expansão, mantendo imagens antigas para rollback. Não migrar estado vivo entre solvers por acidente. Tokens de release/deploy são separados e ambientes exigem responsável humano. Não fazer deploy por merge automático enquanto essa política não for aprovada.

Servidor: validação de todo pacote, quotas de CPU/RAM/salas, filas e buffers limitados, timeouts, backpressure e limites de descompressão. Sessões autenticadas, tokens imprevisíveis/expiráveis, rate limit por sessão/IP com cuidado para NAT, TLS/transporte autenticado, proteção contra replay de comandos. Código de sala não é identidade suficiente.

Processos sem root, filesystem restrito, segredos fora da imagem, métricas de abuso e auditoria sem registrar tokens. Não executar mods enviados por jogadores no servidor padrão. DDoS precisa também de proteção de rede/hospedagem. Servidor autoritativo não impede bots ou vazamento de informações: transmitir apenas dados necessários e definir política anticheat compatível com Linux/Deck.

## 5. Plano de migração

| Caminho | Benefício | Custo/risco | Decisão |
| --- | --- | --- | --- |
| Continuar stack web integralmente | Entrega imediata; preserva testes e operação | Limites de pipeline artístico e custo por sala ainda a medir | Manter como baseline jogável |
| Reescrita completa agora | Liberdade estrutural | Regressões ocultas, meses sem jogo, abandono de conhecimento | Rejeitar agora |
| Modularizar e portar por contratos | Preserva comportamento e permite medir ganho | Adapters temporários e duas toolchains | Preferido |
| Novo cliente com núcleo antigo por algum tempo | Avalia apresentação cedo | Ponte JS/native temporária e fidelidade incompleta | Usar playback comum no experimento, não arquitetura definitiva |

Fases e saídas:

1. **Inventário/baseline:** registrar testes, cenários de bola/contato, hardware e traces. Corrigir primeiro ambiguidades de autoridade, seed e snapshot. Separar código de apresentação no caminho de Match. Saída: contrato do tick e corpus mínimo.
2. **Isolamento em JavaScript:** API estável, PRNG serializável, gravação de inputs aceitos, checkpoint completo e teste restore. Manter controles e comportamento atuais. Saída: bugs reproduzíveis sem navegador e import graph controlado.
3. **Primeiro módulo Rust:** portar bola e contatos numa arena pequena; Rapier e matemática fixados. Comparação diferencial JS/Rust com tolerâncias declaradas para o port, mais testes de invariantes. Não afirmar identidade de floats entre implementações.
4. **Núcleo compartilhado:** portar regras/controle motor/tática por cenários. Rust nativo para runner/servidor e WASM transitório para o cliente atual quando necessário. Dois runtimes temporários nunca controlam a mesma bola ao mesmo tempo.
5. **Slice de cliente:** Godot e Unreal com os mesmos dados; Unity com timebox caso exista responsável. Primeiro playback da mesma captura, depois integração interativa dos finalistas. Não portar o jogo inteiro seis vezes.
6. **Decisão e rollout:** escolher um cliente, manter servidor antigo disponível até paridade e soak. Roteamento por versão em staging, opt-in, canário e rollback. Remover duplicação de regras somente após equivalência aceita.

Não converter todo o JavaScript para TypeScript como etapa obrigatória de um port já planejado para Rust. JSDoc/checks locais podem reduzir risco onde o código continuará por mais tempo.

**Estimativas de planejamento, não compromisso:** 1–2 semanas para baseline/contratos; 2–4 para replay/isolamento; 4–8 para núcleo da arena e bridges; 4–6 para avaliação artística e multiplayer, com trabalho parcialmente sobreposto por equipe habilitada. Voluntariado, falta de mocap e ausência de especialistas podem multiplicar esses prazos. Replanejar após cada gate.

## 6. Vertical slice e métricas de decisão

O mínimo inclui **uma arena 1×1 + goleiro para qualidade de contato** e **uma partida 11×11 de cinco minutos para carga e tática**. O primeiro sozinho não decide a engine.

Conteúdo comum: campo/estádio simples, dois personagens retargetados, pacote pequeno de movimentos com licença aprovada, mesma câmera, iluminação comparável e mesmos níveis de detalhe. Sequências: sprint/frenagem, corte 45/90/180°, condução sob pressão, passe e domínio em movimento, chute carregado, cruzamento/cabeceio, disputa ombro a ombro, defesa e reposição. Avaliar também câmera próxima: transmissão esconde erros.

Executar offline e servidor remoto com dois clientes humanos; automatizar 22 conexões separadamente. RTT 0/50/100/150 ms, jitter 0/20 ms, perda 0/1/3% e interrupção de dois segundos. Registrar input→contato, correção, gols, posse, ack e divergência. Não comparar engines com físicas/inputs diferentes como se fosse benchmark de renderer.

Duas etapas justas: playback do mesmo trace para medir render/retargeting; gameplay compartilhado para medir FFI, predição e contato visual. Usar builds exportadas em release, não editor. Aquecimento, pelo menos cinco repetições, hardware/driver/energia registrados e cenas idênticas. Separar custo de simulação do custo de encode/rede. Não rodar benchmark junto de build/testes.

### Gates propostos

São **metas iniciais para negociação**, não resultados medidos. Fixar hardware e protocolo antes de executar; não afrouxar gates depois apenas para favorecer um candidato.

| Área | Meta inicial e medição |
| --- | --- |
| Desktop principal | 1080p médio, frame time p95 ≤16,7 ms e p99 ≤25 ms, 22 atletas |
| Mac Intel | Máquina física Intel com GPU Metal declarada; preset baixo 900p/30 fps, p95 ≤33,3 ms |
| Apple Silicon | Mac M1 8 GB como piso proposto; 1080p/60 em preset definido, medir memória total |
| PC/Linux | Ryzen 5 3600, GTX 1660 6 GB, 16 GB como referência proposta, mesma resolução/preset |
| Steam Deck | 1280×800 baixo, 40 fps estáveis como piso proposto (p95 ≤25 ms); buscar 60 e medir bateria |
| Servidor simulação | Linux x86_64, um core dedicado de Ryzen 5 5600 como bancada: tick p99 <2 ms a 120 Hz por partida |
| Capacidade real | Determinar N salas com CPU agregada <70%, sem backlog sustentado e duração do tick dentro do deadline; não extrapolar do teste isolado |
| Memória/binário | Processo de uma partida ≤128 MiB RSS; cada partida adicional ≤32 MiB incremental; imagem runtime ≤100 MiB comprimida, sem conteúdo visual |
| Rede | Meta ≤30 KiB/s downstream por cliente a 20 Hz; informar payload e overhead separadamente, 2 e 22 clientes |
| Determinismo | Zero diferenças de hash em 100 cenários ×10 minutos na mesma build; repetir na matriz antes de anunciar cross-platform |
| Restauração | Retomar 100 checkpoints intermediários e atingir hashes da execução contínua |
| Contato | Erro visual pé/cabeça→bola p95 ≤5 cm e desfasamento ≤1 tick nos contatos medidos; zero impactos sem alcance válido |
| Apoio | Deslizamento do pé plantado p95 ≤3 cm por janela de apoio; clipping avaliado por vídeo e métricas |
| Rede degradada | A 100 ms/1% perda, correção p95 do jogador ≤15 cm e da bola ≤25 cm; zero gol/posse permanente divergente após reconciliação |
| Resposta local | Input→resposta visual p95 ≤50 ms; separar início da preparação do momento intencional de contato |
| Confiabilidade | Soak 8 h sem crash; após aquecimento sem crescimento persistente >1 MiB/h por sala |
| Contribuição artística | Animador importa, retargeta e valida um clip em até meia jornada após onboarding; medir retrabalho |
| Contribuição técnica | Agente implementa a mesma pequena alteração em cada finalista; medir tempo até aprovação, defeitos e minutos de revisão humana |

Metas de memória e binário se aplicam ao servidor Rust independente; não fingir que são características medidas de Godot/Unreal. O custo final é CPU-hora + memória-hora + tráfego + operação por partida-minuto, com preços reais da hospedagem quando escolhida. Snapshot grande multiplicado por 22 pode dominar o custo.

Revisão perceptual: avaliação cega por jogadores, animador e especialista em gameplay, nota 1–5 para peso, contato, transições, leitura e controle; média ≥4 e nenhum item crítico <3. Capturar vídeos com os mesmos inputs e publicar diferenças. Métrica geométrica sozinha não define realismo.

### Regra de decisão

Primeiro eliminar candidatos que falhem licença/redistribuição aceitáveis, quatro alvos desktop, autoridade, reprodução de bugs ou piso de jogabilidade/performance. Consoles são futuro: exigir parecer de viabilidade e custos, não certificação já concluída.

Depois pontuar 0–5 com evidências: animação/contato 25%, produtividade de artistas 15%, performance desktop 15%, contribuição/revisão 15%, liberdade/manutenção 15%, build/plataformas/consoles 10%, integração do núcleo/rede 5%. Pesos somam 100%; registrar notas brutas, incerteza e horas gastas, sem inventar notas antes do experimento.

Servidor é gate compartilhado; o mesmo Rust deve ter o mesmo custo nos candidatos. Só pontuar diferenças reais de integração. Exigir vantagem ≥10 pontos em 100 e parecer humano para trocar o candidato preferido; empate preserva Godot pela direção aberta escolhida. Repetir cenários com diferença dentro da variância. Se nenhum passar, reduzir escopo ou corrigir núcleo/assets, sem declarar vencedor artificial.

## 7. Riscos técnicos e de governança

| Risco | Sinal inicial | Mitigação / gatilho de decisão |
| --- | --- | --- |
| Biblioteca de movimentos insuficiente | Transições artificiais apesar de renderer bom | Investir em captura/autoria/licença; não esperar que engine invente futebol |
| Proxy de contato diverge da pose | Bola reage longe do pé | Bake de curvas compartilhadas; rever fronteira núcleo/animação |
| Godot exige tooling demais | Slice consome orçamento criando editor/plugins | Comparar com Unreal e reabrir ADR |
| FFI/bindings instáveis | Quebras por upgrade ou por arquitetura | Ponte fina, versões fixas, testes de carregamento; fallback ABI C |
| Determinismo prometido sem prova | Replay falha em arm64/restore | Corpus por target, PRNG e matemática controlados, runtime histórico |
| Reescrita interminável | Dois jogos incompletos e lógica duplicada | Gates de migração, um dono por regra, retirar ponte transitória após paridade |
| Latência em disputa de bola | Correções frequentes e sensação de injustiça | Teste adversarial de rede e janela de predição limitada |
| Footprint cresce com features | Servidor carrega clips/texturas ou aloca por tick | Import graph, dados compactos, profiling e budgets |
| 22 conexões confundidas com 22 atletas | Banda/encode cresce inesperadamente | Carga com 22 clientes e compressão/deltas medidos |
| PRs de IA saturam revisão | Cresce backlog de contribuições “verdes” sem inspeção | WIP limitado, issues aceitas, PRs pequenos, responsável humano |
| Mudança indevida de baseline | Teste passa só porque golden foi atualizado | Aprovação separada para resultados esperados |
| Supply chain e assets | Dependência abandonada/arquivo sem direitos | Inventário, proveniência, allowlist e revisão |
| Ausência de mantenedores | Módulo crítico conhecido por uma pessoa | Pelo menos dois responsáveis por área, docs e rotação |
| Consoles/Rust sob NDA | Plugin/toolchain sem suporte no SDK alvo | Parecer de parceiro cedo; camada privada mínima e orçamento de port |
| Mac Intel envelhece | SDK/engine deixa de exportar alvo | Fixar piso suportado, CI física e política explícita de depreciação |

**Fatos de plataforma:** consoles exigem acesso e SDKs restritos; Godot aponta para terceiros ou port próprio, não para exportação pública irrestrita. Rust desktop não demonstra automaticamente suporte aos consoles. [Godot e consoles](https://godotengine.org/consoles/), [targets Rust](https://doc.rust-lang.org/rustc/platform-support.html).

Steam Deck requer validação do jogo e de suas dependências, seja Linux nativo ou Proton; não decorre apenas da engine selecionada. [Steamworks FAQ](https://partner.steamgames.com/doc/steamhardware/steamdeck/faq). Unity documenta Windows, macOS Intel/Apple Silicon e Linux, mas cada versão e pacote deve ser validado. [Requisitos Unity](https://docs.unity3d.com/6000.0/Documentation/Manual/system-requirements.html).

### Custo de 5–10 anos

Planejar três cenários, sem inventar um preço universal: comunidade pequena, equipe financiada e produto comercial. Em cada um somar desenvolvimento de ferramentas, autoria/captura, revisão humana, CI por plataforma, armazenamento de assets, hosting/egress, atualização de dependências, licenças e ports/certificação.

Unreal desloca custo para toolchain pesada, condições comerciais e conhecimento específico, mas pode economizar anos em tooling artístico. Unity facilita C# e autoria, com risco de pacotes/termos. Godot reduz dependência contratual, mas pode aumentar trabalho de animação. Bevy aumenta exposição a migrações e ferramentas em evolução. Engine própria concentra o maior passivo de infraestrutura. A híbrida compra opções futuras ao preço de integração hoje.

Reservar capacidade recorrente para upgrades e segurança, medir horas reais por atualização e ter ao menos dois mantenedores do núcleo e da ponte. Não prometer um projeto dessa ambição mantido apenas por geração automática de código.

## 8. Decisão final e próximos passos

**Aprovar como direção: evolução gradual, Rust no núcleo, servidor Rust independente e Godot como primeiro candidato de cliente.** Tratar Unreal como comparação obrigatória de qualidade/animação e como alternativa se Godot não passar nos gates dentro do orçamento aceito. Não começar uma engine própria, não manter seis clientes e não descartar o protótipo.

Primeira implementação recomendada após esta proposta (iniciada na [v0.2](nucleo-v0.2.md), com sessão compartilhada, PRNG, checkpoints e replay no mesmo runtime): formalizar o contrato de Match, retirar dependências visuais do caminho headless, introduzir PRNG serializável e um replay que restaure estado completo. Esses passos têm valor mesmo que a engine final mude.

A decisão definitiva precisa de: artefatos do slice, builds nos quatro targets, medições reproduzíveis, parecer de animador, avaliação de licenças, plano de console e responsáveis pela manutenção. Sem essas evidências, “Godot + Rust” continua uma recomendação fundamentada, não uma conclusão experimental.
