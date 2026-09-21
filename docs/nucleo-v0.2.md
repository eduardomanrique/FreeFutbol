# Núcleo jogável v0.2

Esta etapa da nova versão evolui o jogo principal no mesmo repositório. O cliente continua em Three.js e o servidor em Node.js; não é ainda o cliente desktop Godot nem o núcleo Rust propostos no ADR.

## Implementado

- `src/core/session.js`: sessão compartilhada pelo cliente offline e pelo worker autoritativo. Passo fixo de 120 Hz, seed explícita, PRNG Mulberry32, comandos de ação e entradas dos dois times.
- `src/core/root-motion-warp.js`: correção de trajetória independente da apresentação. A importação transitiva de Match não carrega Three.js. A biblioteca visual fornece seus próprios controllers.
- `src/core/state-codec.js`: estado completo preservando referências compartilhadas, `undefined`, zero negativo e instâncias de RootMotionWarp. Controllers visuais são recriados; não fazem parte da autoridade.
- Checkpoint: estado da partida, tick, RNG e snapshot binário do Rapier com handles dos corpos/colliders. O snapshot de telemetria arredondado continua separado.
- No menu de pausa offline: **Salvar e sair** no navegador e **Exportar replay** em JSON. O início oferece continuação do último save desse navegador/origem. Exportar não publica dados na rede. O servidor não mantém a gravação em memória.

A sessão ativa a mesma correção de trajetória com e sem biblioteca visual. A API antiga `Match` permanece para testes e migração, mas novos adaptadores devem usar `MatchSession`; alterações diretas ao Match não entram na fita de comandos.

## Replay e compatibilidade

O replay contém checkpoint inicial, entradas por tick, ações ordenadas e checksum final. Após retomar um save, inicia-se um novo segmento de gravação. A pausa é estado de interface; não avança a simulação e o checkpoint registra o modo de jogo anterior.

~~~sh
npm run test:session
npm run test:session-browser
npm run replay:verify -- caminho/partida.json
~~~

O verificador executa a partida sem renderer e falha se o resultado divergir. O CLI usa Node e destina-se a gravações desse ambiente. O teste de navegador verifica a gravação exportada dentro do Chromium, importando o mesmo núcleo sem anexar controllers visuais. Foi observada divergência numérica entre Chromium e Node, mesmo nesta máquina; exportações do browser não têm equivalência exata garantida no CLI. Isso é reprodução técnica de simulação, ainda sem interface de câmera/linha do tempo para assistir. O checksum inclui o estado completo e o mundo Rapier; é diagnóstico, **não assinatura de segurança**.

A versão de simulação `campo-core-0.2.0`, taxa de ticks e versão do Rapier precisam coincidir. Mudanças de comportamento, dados ou serialização exigem revisar/incrementar essa versão. Não há migração automática de saves antigos nem garantia de determinismo entre versões, engines, arquiteturas ou runtimes diferentes. Regressões devem fixar revisão de código, lockfile, dados e ambiente. Testes de continuação verificam igualdade por tick no ambiente executado; testes entre plataformas continuam pendentes.

Limites: 100 mil comandos ou 30 minutos por segmento; ao atingir qualquer limite, a gravação é descartada e exportar apresenta erro, sem interromper o jogo. Salvar/retomar abre outro segmento. O CLI limita arquivos a 32 MiB, e a UI limita saves a 4 MiB. As estruturas têm limites adicionais de nós, campos e bytes da física.

Saves são locais e replays são artefatos de desenvolvimento de origem confiável. O formato não é aceito por nenhum endpoint do servidor; não há importação arbitrária na UI. Não executar replays desconhecidos em processos privilegiados: o checksum não autentica o autor e a restauração usa também o parser WASM do Rapier. Um serviço público de replay exigiria isolamento, validação semântica completa e quotas próprias.

## Fronteiras e próximos passos

`src/core/` controla a sessão e persistência; `src/simulation.js`, física e módulos táticos existentes continuam sendo a implementação de regras. `server/match-worker.js` adapta relógio, transporte e intenções para a sessão; `src/main.js` adapta teclado/controle, armazenamento e apresentação. O protocolo de snapshots existente não mudou.

A próxima migração pode trocar o núcleo por um adapter Rust mantendo este contrato, cenários e evidências. Antes disso, faltam corpus persistente de replays revisados, CI entre sistemas operacionais, validação semântica para importações não confiáveis e comparação de vertical slice nativo. Qualidade de animação/arte e regras de futebol ainda têm as limitações documentadas no projeto.

## Evidência local de custo

[Microbenchmark v0.2](benchmarks/session-v0.2.json): três rodadas na mesma máquina, Match direto versus sessão sem/com gravação, cada uma com 600 ticks de aquecimento e 1.200 medidos. Os resultados curtos variam com JIT/GC e não justificam alegar ganho de desempenho. Não incluem renderer, rede, workers nem serialização; não são estimativa de capacidade de produção.
