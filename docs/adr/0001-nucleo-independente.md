# ADR 0001 — Núcleo independente e avaliação do cliente desktop

Data: 21/09/2026
Status: **Proposta original**. A escolha posterior de uma implementação nativa independente está registrada no [ADR 0002](0002-nova-versao-nativa.md); a avaliação comparativa completa de engines ainda não foi realizada.

## Contexto

Browser deixou de ser requisito obrigatório. O protótipo JavaScript compartilha
Match entre cliente e servidor. Na redação inicial havia dependências visuais no caminho headless
e não havia replay completo restaurável. A etapa [v0.2](../nucleo-v0.2.md) introduziu isolamento,
sessão compartilhada, checkpoint e replay no mesmo runtime; Rust/Godot continuam propostos. O objetivo de longo prazo combina qualidade
de futebol, 11×11, servidor econômico, colaboração aberta e desktop multiplataforma.

## Decisão proposta

Evoluir gradualmente para núcleo Rust independente, servidor Rust/Linux e cliente
Godot 4 com apresentação em GDScript tipado. Avaliar Unreal como concorrente obrigatório
no slice de animação; manter o cliente atual como baseline durante a migração.

Regras, tática, controle motor e contatos têm uma única implementação. Engine visual
consome estado/eventos e dados de animação compatíveis. Transporte e relógio pertencem
ao host. Exportação de dados de contato permite servidor sem esqueleto visual completo.

## Alternativas

Unreal/C++ oferece um caminho forte para animação AAA, com condições proprietárias.
Unity/C# é alternativa produtiva, inclusive com núcleo C# independente.
Bevy/Rust tem vantagens de código e custos atuais de tooling/migração.
Engine própria não se justifica. Reescrita total imediata amplia risco sem evidência.

## Consequências

Vantagens: testes sem editor, potencial servidor enxuto, liberdade de apresentação.
Custos: duas toolchains, bridge, bake de contatos e manutenção dos bindings.
Riscos: divergência entre pose e contato, determinismo incompleto e falta de movimentos.

## Confirmação ou substituição

Aplicar os gates, pesos e cenários de
[arquitetura-longo-prazo.md](../arquitetura-longo-prazo.md).
Registrar versões exatas, resultados, horas de implementação e revisores.
Reabrir a escolha se Godot não alcançar o piso de qualidade dentro do orçamento,
se a ponte impedir plataforma obrigatória ou se mudar a prioridade de liberdade.

Este ADR não declara Rust/Godot já integrados e não aprova deploy.
