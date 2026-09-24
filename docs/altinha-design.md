# Altinha em roda

Você controla a roda de quatro jogadores: ao passar, assume imediatamente
o recebedor. Os outros se reposicionam; o próximo toque é sempre seu.
A câmera enquadra o grupo e acompanha o deslocamento. Não há limite de tempo.

| Ação                      | Teclado      | Xbox               | Celular    |
| ------------------------- | ------------ | ------------------ | ---------- |
| Mover livremente          | WASD / setas | Analógico esquerdo | Direcional |
| Dominar / levantar a bola | J            | A                  | Dominar    |
| Estilo                    | Espaço       | X                  | Estilo     |
| Volta ao mundo            | L            | B                  | Truque     |
| Passar                    | K            | Y                  | Passar     |

Dominar usa pé, coxa, peito ou ombro conforme a altura/posição e não pontua.
Cabeça, ombro e peito exigem contato com a superfície visível do corpo. Ao pedir o toque, o atleta faz uma aproximação curta e abaixa o corpo até 26 cm para encaixar a bola; movimento manual tem prioridade. Essa ajuda não busca bolas distantes. Estilo usa chapa;
direção lateral escolhe trivela/toque cruzado, para baixo escolhe calcanhar e
bola alta permite cabeçada ou ombro com direção lateral. Passar + direção escolhe um parceiro; sem direção,
os destinos alternam. Segure K / Y / Passar para dosar a força na barra e solte para preparar o contato. Toques fracos ficam curtos; fortes sobem mais e passam do parceiro. Há uma pequena variação de direção, maior com força alta: mova o recebedor para alcançar a bola. Pode preparar a devolução de primeira durante o voo,
ou dominar antes de passar. O marcador acompanha o personagem controlado.

No início e após uma queda, um comando começa a levantada. A bola permanece
no chão até a aproximação e contato do pé. As tentativas alternam puxada de
sola, cavadinha e puxada cruzada.

A volta ao mundo é preparada quando a bola desce: um primeiro toque baixo a
levanta pouco. A coxa sobe pelo quadril, mantendo o joelho bem dobrado; ele abre só cerca de 18° durante a passagem do pé sobre a bola. O segundo contato pontua. A manobra
exige alcance; a bola não é presa ao personagem.

Estilo vale 10 pontos-base e volta ao mundo vale 25. Variar aumenta o combo
(até dobrar a recompensa); repetir um movimento recente reduz os pontos.
Na terceira ocorrência na janela dos quatro movimentos recentes, ele não
pontua. Cada pontuação varia cores, partículas e anéis na areia.

Cabeçadas preparadas que ficariam altas demais podem virar uma cabeçada de esforço: o atleta acompanha continuamente a descida com a cabeça, avança no mergulho e cai de joelhos antes de se levantar. O salvamento já comprometido completa a aproximação automaticamente. A devolução é mais reta e rápida, mirando a altura do corpo de um parceiro. Dominar recebe essa bola no peito, com o peito estufado; Estilo permite devolver de cabeça. Bolas realmente distantes ainda podem cair.

Estilo com direção lateral e bola alta inicia a sequência ombro a ombro. O ombro aproxima-se um pouco do centro de equilíbrio, sobe no impulso e desce na recuperação; a bola cruza para o outro lado com dois contatos separados.

Ao pedir Passar de costas para o parceiro, uma bola acima de 1,7 m permite bicicleta; entre 1,05 e 1,7 m, calcanhar alto. O personagem mantém a orientação quando você solta o direcional. Os passes normais entre jogadores sobem mais, dando tempo para a próxima jogada; cabeçadas de esforço mantêm a trajetória rápida.

Um aro azul com cruz marca a previsão de queda das bolas altas, na altinha e nos modos de partida. A previsão considera gravidade, arrasto e efeito e é recalculada após mudanças de trajetória.

A bola no chão zera pontos e combo, mostra o resultado por 1,35 segundo e
prepara nova tentativa com o último jogador que realmente tocou na bola, inclusive quando um passe não chega ao destinatário. O recorde fica salvo neste navegador/dispositivo.

## Animação compartilhada e referências

A solução de pernas limita o joelho à flexão em um único eixo; a orientação
da perna vem do quadril. Isso vale para o solver compartilhado de todos os modos. A altinha acrescenta perna de apoio flexionada, transferência
de peso, contrarrotação do tronco, braços de equilíbrio e recuperação gradual.
Nos outros modos, domínios com abertura do pé/amortecimento do tronco e passes
com desvio do olhar aparecem ocasionalmente em espaço livre. São camadas visuais,
sem alteração da física ou do tempo de comando, e param diante de nova ação.

Referências observadas, não captura automática de movimentos:

- [Altinha na praia enviada pelo usuário](https://www.youtube.com/shorts/Dz26nuux5Pg)
- [Arthurzinnv — segunda referência](https://www.youtube.com/shorts/s6xXJuvx39c)
- [Adidas: controle, equilíbrio e volta ao mundo](https://www.adidas.com/us/blog/865374-how-to-juggle-a-soccer-ball)
- [Unity: direção de flexão em Two Bone IK](https://docs.unity.cn/Packages/com.unity.animation.rigging%400.3/manual/constraints/TwoBoneIKConstraint.html)
- [Daniel Holden: transições de animação](https://www.theorangeduck.com/page/dead-blending)
