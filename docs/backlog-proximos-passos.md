# Backlog de próximos passos

## Ação iniciada longe da bola

Quando o jogador clicar para passar ou chutar estando longe da bola, manter a ação pendente por até **0,5 segundo**. Se ele conseguir alcançar a bola dentro dessa janela, concluir a ação com a força, direção e tipo escolhidos no clique. Se não alcançar, cancelar sem mover a bola artificialmente. A janela deve respeitar domínio, apoio e contato físico.

## Precisão do chute forte

O chute forte está preciso demais. Aumentar a dispersão e/ou reduzir o índice de precisão conforme a força aumenta, mantendo a direção geral para o gol e preservando a possibilidade de uma finalização forte bem executada. Validar em distâncias curta, média e longa para não tornar todos os chutes aleatórios.

## Multiplayer por código — implementado localmente em 19/09

O usuário aprovou servidor autoritativo após discutir a proposta original de mensageiro leve. Foram implementados salas, sessões, controle por time, simulação no servidor, sincronização WebSocket e reconexão. Consulte [backend.md](backend.md).

Pendências para evolução competitiva: previsão local/reconciliação de comandos, compensação de latência, validação de redes reais/degradadas e benchmark no VPS. Contas, ranking e persistência não fazem parte da entrega atual. Deploy depende de pedido explícito.
