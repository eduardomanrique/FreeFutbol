# Backlog de próximos passos

## Ação iniciada longe da bola

Quando o jogador clicar para passar ou chutar estando longe da bola, manter a ação pendente por até **0,5 segundo**. Se ele conseguir alcançar a bola dentro dessa janela, concluir a ação com a força, direção e tipo escolhidos no clique. Se não alcançar, cancelar sem mover a bola artificialmente. A janela deve respeitar domínio, apoio e contato físico.

## Precisão do chute forte

O chute forte está preciso demais. Aumentar a dispersão e/ou reduzir o índice de precisão conforme a força aumenta, mantendo a direção geral para o gol e preservando a possibilidade de uma finalização forte bem executada. Validar em distâncias curta, média e longa para não tornar todos os chutes aleatórios.

## Multiplayer inspirado no Justcards

Planejar uma arquitetura em que cada cliente controla os jogadores do seu próprio lado e envia atualizações para o outro cliente. O backend seria bem leve, funcionando principalmente como servidor de mensagens/sinalização, sem executar toda a física. Uma mensagem pode descrever a próxima ação ou intenção — por exemplo, posição-alvo e velocidade — e os cálculos gerais podem acontecer nos clientes.

Antes de implementar, definir sincronização de ticks, autoridade sobre bola/contatos/gols, correção de divergências, perda e ordem de mensagens, reconexão e proteção contra trapaça. Comparar o custo dessa abordagem com um servidor autoritativo quando o multiplayer entrar no escopo.
