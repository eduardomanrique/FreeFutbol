# Experimento: cada cliente simula seu time

Branch: `codex/client-team-simulation`. Publicado em23/09/2026 na release `20260923-3676186704ca` (backend `20260923-ca8814c76126`). O commit da implementação é `31a27b4`.

## Testar

Execute `npm run server` e, em outro terminal, `npm run dev`. Abra o endereço do Vite em dois navegadores ou aparelhos na mesma rede. No menu **Online · por código**, escolha **Cada cliente simula seu time**, crie uma sala e entre com o código no outro aparelho. Ambos confirmam **Estou pronto**; o criador inicia.

Para comparar, crie outra sala com **Servidor simula a partida (comparação)**. O convidado herda o modo da sala. O modo tradicional continua disponível e é o padrão da API quando o campo `networkMode` é omitido. Clientes do experimento precisam anunciar `teamProtocol: 1` ao criar, entrar e autenticar.

Offline e treino continuam usando a simulação local completa.

## Responsabilidades

| Componente | Trabalho |
| --- | --- |
| Cliente de cada time | IA, ações, locomoção e colisão dos próprios 11 jogadores |
| Representação do adversário | Locomoção a partir dos comandos recebidos, extrapolação e correção suave |
| Cliente com autoridade da bola | Contatos locais, estado da bola, gols e reinícios |
| Outro cliente | Previsão da bola e pedido de autoridade ao detectar contato local |
| Servidor | Salas, identidade do time, validação estrutural, sequência, arbitragem de autoridade e encaminhamento |

O relay não instancia `Match`, Rapier ou um worker de partida. Guarda os últimos comandos e o estado da bola para reconexão. Continua sendo necessário um backend WebSocket acessível aos dois clientes.

## Comandos e economia de mensagens

Cada lote contém sequência, tempo da simulação, jogador selecionado e somente os jogadores que precisam de atualização. Há no máximo 20 lotes por segundo por cliente. Os números são arredondados a três casas decimais; cada jogador é uma linha compacta:

```text
[id, x, z, vx, vz, intençãoVX, intençãoVZ, frenteX, frenteZ, modo, fôlego, pose]
```

O modo distingue parado, andando, correndo, desarmando e carrinho. A pose inclui os estados necessários para reproduzir chute, passe, defesa e outras ações, sem transmitir toda a animação esquelética.

Uma atualização é gerada quando a intenção muda mais de 0,35 m/s, a posição diverge mais de 20 cm da previsão linear, ou muda uma ação/modo. Atualizações periódicas ocorrem a cada 0,5 s em movimento e 2 s parado. Um heartbeat de até 0,5 s mantém confirmação e seleção mesmo sem movimento. Pequenas mudanças podem se acumular até ultrapassar o limiar.

Confirmações de movimento seguem junto do próximo lote do adversário. Somente arbitragem de bola exige resposta imediata ao remetente. O protocolo ainda usa JSON; o ganho vem principalmente de transmitir alterações e remover snapshots completos.

## Atraso e correções

- O receptor extrapola a origem recebida por até 250 ms usando a velocidade informada.
- Erros menores que 12 cm são ignorados; pequenas correções para trás menores que 35 cm também.
- Erros intermediários são corrigidos gradualmente, sem reposicionar instantaneamente o jogador.
- Erros acima de 3 m e reposicionamentos de reinício aplicam correção imediata.
- Sem atualização por 750 ms, o jogador remoto começa a frear.

Os relógios são aproximados usando timestamps do relay e RTT. Essas tolerâncias são parâmetros iniciais de teste, não uma garantia de igualdade entre simulações.

## Choques e bola compartilhada

Cada cliente resolve seus jogadores dinâmicos contra cápsulas cinemáticas do adversário. Assim, um choque não permite que um cliente sobrescreva a posição pertencente ao outro. Com atraso, os dois lados podem enxergar contatos ligeiramente diferentes.

A bola tem uma única autoridade lógica, inicialmente o Atlético. Ao detectar uma recepção, desarme ou defesa local, o outro cliente pede a autoridade com a versão atual da bola. O relay aceita a primeira reivindicação válida recebida para essa versão, incrementa a versão e rejeita pedidos antigos. A decisão é por ordem de chegada, sem verificar a geometria do contato.

Impulsos e mudanças de regra geram eventos; checkpoints da bola são enviados a cada 0,5 s. Ambos preveem a trajetória entre eventos. Erros pequenos são suavizados; transferências de autoridade e grandes diferenças corrigem imediatamente. Reinícios enviam uma vez as 22 posições e passam a autoridade ao time que repõe a bola.

Essa arbitragem evita dois donos simultâneos, mas não reconstrói contatos no passado. Uma defesa e um gol muito próximos podem ser decididos pela ordem de chegada ao relay. O experimento confia nos clientes quanto à física, aos contatos e ao placar; destina-se inicialmente a partidas casuais entre amigos.

## Desconexão

O relay pausa o relógio quando um participante desconecta e usa a janela existente de reconexão de 30 s. Também detecta cinco segundos sem lotes de simulação, mesmo se o socket ainda responder a ping. Na retomada, ambos recebem os comandos e a bola armazenados.

É uma restauração aproximada: locomoção e controles são reiniciados, incluindo cancelamento de carga de chute. Não é um checkpoint completo de todos os estados internos do Rapier e da IA. Backpressure excessivo fecha o socket para reconectar pelo checkpoint, evitando descartar silenciosamente eventos de bola.

## Medições locais — 23/09/2026

Apple M3 Pro, Node 20.19.4. Microbenchmark de uma sala com dois clientes, 20 segundos simulados, mediana de três execuções alternadas após aquecimento:

| Medida por sala | Servidor tradicional | Clientes por time |
| --- | ---: | ---: |
| Tempo de processamento do servidor no ensaio | 658,13 ms | 28,72 ms |
| Saída comprimida somando os dois clientes | 354,81 kB/s | 24,23 kB/s |
| Entrada sem compressão somando os dois clientes | 5,26 kB/s | 37,67 kB/s |
| Mensagens de saída por segundo | 40 | 40,85 |

Redução de **95,6% no tempo de processamento do servidor** e **93,2% nos bytes de saída comprimidos** neste ensaio. O upload dos clientes aumenta e a quantidade de mensagens de saída fica semelhante.

O benchmark executa simulação, serialização, validação e compressão, mas não mede sockets reais, TLS, contenção de VPS ou capacidade de produção. Usa entradas comparáveis; as partidas divergem após contatos. O servidor tradicional transmite poses completas e não foi otimizado para este comparativo. Os valores não devem ser convertidos diretamente em número de salas suportadas ou custo mensal.

Na repetição final com dois navegadores reais (360 frames após aquecimento), ambos os modos mantiveram aproximadamente **60 FPS**:

| Navegador, por cliente | Servidor tradicional | Clientes por time |
| --- | ---: | ---: |
| Tempo médio de atualização do jogo | 0,416–0,426 ms | 0,508–0,539 ms |
| Tempo entre frames, percentil 95 | 17,3–17,4 ms | 16,8 ms |
| Erros JavaScript capturados | 0 | 0 |

O custo médio de atualização no cliente aumentou cerca de **24%** nessa amostra, sem queda de FPS no Mac. Essa função não inclui toda a renderização. A amostra é curta e não demonstra melhora na estabilidade dos frames; a conclusão útil é a transferência de trabalho do servidor para os clientes, com taxa de quadros mantida nesse hardware.

### Reproduzir e verificar

```sh
npm test
npm run build
npm run benchmark:teams
# Com backend e Vite já executando:
HEADED=1 npm run test:teams:browser
NETWORK_MODE=server HEADED=1 npm run test:teams:browser
npm run benchmark:teams:browser
```

O benchmark de navegador usa Chromium visível com Metal neste Mac, dois contextos a 1440×900 e qualidade alta. Seus resultados ficam em `output/relay/browser-comparison.json`. O microbenchmark gera `output/relay/comparison.json`. São artefatos locais ignorados pelo Git.

Os testes de simulação cobrem RTT de 0/80/150 ms, comandos dos dois times, chute, correções, contato corporal, recepção e defesa reais com transferência de autoridade, gol/saída/lateral, reivindicações simultâneas e antigas. O teste de backend cobre reconexão, relógio pausado, validação de time e ausência de worker. O navegador cobre criação da sala, movimento, chute, troca, recarga, interrupção da conexão e retomada com avanço de confirmações.

Falta medir em celulares físicos e redes móveis, incluindo jitter, perdas, suspensão do aplicativo e disputas prolongadas pela bola. A emulação mobile valida interface, não desempenho do aparelho.
