# Paridade com o legado web

O destino ativo é Rust + Godot. `docs/regras-da-mecanica.md` registra os requisitos e revisões acumulados; o comportamento final e os testes do legado são referências para portar funcionalidades. Reutilizar um asset não implica ter portado seu controlador ou sua mecânica.

## Critério de avanço

Cada etapa precisa de comportamento jogável, cenário reproduzível, regressão do núcleo compartilhado e inspeção na engine. Compatibilidade offline/headless é obrigatória. Paridade exige comparar o mesmo cenário com os requisitos finais, não apenas fazer uma versão simplificada passar em seus próprios testes.

| Bloco | Critério de aceitação de paridade | Situação antes do treino 2v1 |
|---|---|---|
| Atleta | Assets existentes, locomoção, transições, contato, apoios, giros e recuperação | Assets e parte da apresentação reaproveitados; controlador incompleto |
| Bola/condução | Bola livre, toques de pés, cortes, aproximação e domínio | Física analítica e condução simplificada |
| Passes/disputa | Rasteiro, alto, profundidade, recepção, proteção, desarmes e carrinho | Ausentes |
| Equipes | 22 atletas, seleção, IA tática, goleiros, adversários | Um jogador |
| Partida | Reposições, cronômetro, regras e fluxo de menus | Arena de treino |
| Online | Mesmo núcleo, servidor autoritativo, salas, reconexão | Host headless sem rede |
| Persistência | Save/replay completo versionado, reprodução e divergência diagnosticada | Repetição em memória no mesmo build |

## Próxima fatia: treino 2v1

Escopo: jogador controlado, companheiro que recebe/devolve e defensor que disputa. Passe rasteiro carregado, recepção por proximidade/contacto e desarme com preparação ficam no Rust. Godot coleta intenções e apresenta os três estados. O objetivo é validar o circuito jogar → passar → receber → enfrentar oposição; não afirmar IA tática ou regras completas.

Aceitação:

- Pressionar passe não lança a bola; soltura agenda contato, alcance e cancelamento continuam obrigatórios.
- Companheiro alcançável recebe sem teletransporte da bola, e a devolução permite continuar a jogada.
- Defensor pode interceptar/disputar; desarme distante não concede posse.
- Nenhum consumidor gráfico decide posse, posição física, gol ou resultado.
- Pausa/foco não disparam ações acumuladas; reinício limpa todos os participantes/contadores.
- Mesma sequência de intenções produz o mesmo estado no mesmo build, incluindo IA.
- Cena nativa apresenta três atletas distintos, controles utilizáveis e o resultado de um passe.

Resultados e limitações da implementação devem ficar no documento da versão correspondente. Depois: completar domínio/passes/disputas, expandir equipes e goleiros, partida completa, online; refinamentos visuais acompanham cenários concretos de gameplay.
