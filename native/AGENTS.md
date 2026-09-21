# Nova versão nativa

- Esta árvore é o produto ativo: Rust + Godot. Não implementar novas funcionalidades no legado web para atender tarefas desta versão.
- Consultar ../docs/regras-da-mecanica.md como requisitos/aprendizados, distinguindo alvo e funcionalidade já implementada.
- game-core não depende de Godot, Node, rede, UI ou relógio. Simulação é a única autoridade sobre bola/jogador/regras.
- GDScript só apresenta e coleta intenção. Não duplicar física como fallback quando a extensão não carregar.
- Não prometer multiplayer/11×11/determinismo entre plataformas antes de implementação e testes.
- Novas dependências: explicar necessidade/proveniência/licença, fixar Cargo.lock e revisar código unsafe/FFI.
- Rodar python3 native/tools/native.py test e smoke; alterações visuais também requerem captura da engine real e inspeção.
- Preservar testes e fontes web como referência, sem importar seu runtime nesta árvore.
- Documentar controles, limitações e evidências; aprovação humana segue CONTRIBUTING.md antes de merge.
