# ADR 0002 — Nova versão nativa independente

Data: 21/09/2026. Direção explicitamente escolhida pelo usuário nesta tarefa.

O produto ativo é um novo jogo desktop em Rust + Godot. O código web permanece no repositório como legado e referência de requisitos, testes e aprendizados; não será o destino de novas funcionalidades. Este ADR substitui a interpretação anterior de continuar expandindo a web enquanto se preparava uma migração.

A primeira implementação fica em `native/`: núcleo Rust puro, GDExtension, cliente Godot e host headless usando a mesma biblioteca. Nenhuma chamada a JavaScript/Node/WASM é necessária para executar este jogo. A apresentação não tem autoridade sobre física ou resultados. Os cenários/notas do legado são requisitos de referência, não uma alegação de paridade funcional.

A arena inicial usa modelos procedurais próprios e física analítica simplificada para validar a execução e o contrato. Não é escolha definitiva de solver, pipeline artístico ou modelo tático. O teste comparativo de engines, o corpus multiplataforma e a fidelidade de futebol continuam sendo trabalho pendente. O host headless não é ainda um servidor multiplayer.

Godot-rust 0.5.5/API4.6 e Godot4.6.1 foram fixados para esta etapa; Cargo.lock registra transitivas. O core proíbe unsafe e não depende da engine. O bloco unsafe de registro de GDExtension é restrito à ponte e precisa de revisão humana antes de merge. Não foi alterada a licença do jogo, a proteção de branches ou a infraestrutura de produção.
