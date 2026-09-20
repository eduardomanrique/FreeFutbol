# Backend autoritativo e partidas online

Publicado em19/09/2026 em https://kmworks.dev/futebol/. Esta arquitetura substitui a proposta inicial de anfitrião autoritativo/WebRTC dos planos históricos.

## Executar

Requer Node.js 20.19+; imagem de produção preparada com Node 22. Instale dependências com `npm ci` e execute em terminais separados:

```sh
npm run server
npm run dev
```

Abra o endereço do Vite. Para usar o celular na mesma rede, use o endereço **Network** exibido pelo Vite, como `http://192.168.x.x:5173`, também nos links de convite. Fora de produção e sem `ALLOWED_ORIGINS` explícito, o backend aceita automaticamente os IPs IPv4 privados das interfaces deste computador na porta 5173. A descoberta acontece ao iniciar o backend; reinicie-o se o IP mudar. O Vite usa porta fixa 5173 para não mudar silenciosamente a origem. Em **Modo de jogo → Online · por código**, crie uma sala ou entre com o código de seis caracteres. Cada participante confirma **Estou pronto**; o criador inicia. O criador joga com o Atlético, atacando para +x; o convidado joga com o União, atacando para −x. Os controles continuam em coordenadas do campo: esquerda/direita não são invertidas para o União.

O convite contém apenas `?room=CODIGO`. Tokens nunca entram no link. A sessão fica no sessionStorage da aba, permitindo recarregar e retomar a mesma partida enquanto o prazo de reconexão estiver aberto. Saída explícita encerra a sala dos dois; uma revanche exige nova sala. Partidas offline e treino continuam funcionando sem backend.

## Autoridade e simulação

- O processo HTTP/WebSocket mantém salas/sessões, verifica mensagens e distribui estados. Cada partida usa um worker Node separado, limitado por `MAX_MATCHES`.
- O worker executa `Match` e Rapier a 120 Hz, com controle independente por time, IA dos demais atletas e decisões oficiais de bola, apoios, contatos, carga, gols, relógio e reinícios.
- A física executa também a correção de aproximação ligada à locomoção. Os ossos, clips, texturas, câmera, estádio e renderização permanecem nos navegadores.
- O cliente envia intenções a até 30 Hz. Ações discretas entram numa fila junto de uma sequência crescente; mensagens repetidas/antigas são ignoradas. Potência é calculada pelo tempo de carga no servidor. Campos adicionais como time, placar, posição e potência não conferem autoridade ao cliente.
- O servidor envia estados visuais a 20 Hz, com posições, velocidades, pés físicos, ações e controles dos dois times. São snapshots de apresentação, não checkpoints de restauração da física.
- O transporte atual é WebSocket confiável, com compressão permessage-deflate de nível 1, sem reaproveitamento de contexto. Não requer WebRTC, STUN ou TURN.
- O cliente interpola com buffer de 75 ms e congela a última posição disponível quando faltam estados. Não implementa ainda previsão local/reaplicação de comandos ou compensação de latência dos contatos. A resposta a um comando inclui a rede e o buffer de apresentação.
- Fila de saída acima de 128 KiB faz o servidor pular snapshots substituíveis; acima de 1 MiB encerra aquela conexão para permitir retomada. Não acumula indefinidamente estados obsoletos.

O criador da sala só tem o privilégio de iniciar. Fechar sua aba não elimina imediatamente a simulação; o servidor pode retomá-la com a mesma sessão. Ainda não é um produto competitivo completo: não há contas, ranking, matchmaking, persistência de resultados ou proteção contra bots. As regras simplificadas do jogo permanecem.

## Pausa, falhas e ciclo de vida

Salas: `waiting → starting → playing → finished`, com `reconnecting` durante perda de conexão. O servidor exige dois participantes autenticados e prontos antes de iniciar. A única vaga de convidado é reservada sem operações assíncronas entre verificação e ocupação.

O menu online **não pausa a partida**. Abrir o menu, perder foco ou desconectar o controle cancela a preparação local e envia comandos neutros; os outros atletas continuam. Não há pausa por acordo nesta entrega. Sem input recente por 500 ms, o servidor neutraliza movimento e cancela a ação pendente daquele participante.

Quando detecta uma desconexão de socket, o servidor interrompe o avanço da partida e concede 30 s para autenticar a mesma sessão novamente. A simulação retoma depois que ambos estão conectados. Heartbeats WebSocket acontecem a cada 10 s; a detecção de uma conexão morta pode levar até aproximadamente 20 s. No cliente, tráfego ausente por 5 s dispara tentativa de reconexão. A retomada envia um estado completo de apresentação e reinicia a numeração acima da última sequência aceita.

Salas de espera e resultados expiram após 15 minutos sem interação relevante. Participante que reserva vaga e não conecta também está sujeito ao prazo de 30 s. Reiniciar o backend ou falhar um worker encerra as sessões afetadas com mensagem explícita. Não há restauração após reinício do processo nem execução em múltiplas instâncias.

## Interfaces

Todas as rotas ficam sob `/futebol/api`, inclusive no ambiente local.

| Interface | Contrato |
| --- | --- |
| `GET /healthz` | Saúde, versão do protocolo, número de salas e partidas |
| `POST /rooms` | `{version:1,duration:180\|360\|600}` → sala, time e token |
| `POST /rooms/join` | `{version:1,code:"ABC234"}` → sala, time e token |
| `WS /ws` | Primeira mensagem `{type:"auth",version:1,token}` em até 5 s |

Após autenticar: `ready` com `value`, `start`, `leave`, `ping` com `sent`, e `input` com `{seq,x,z,sprint,jockey,finesse,events}`. Eixos finitos no intervalo [−1,1]. Até 12 eventos por input; tipos `begin` (action: pass/lob/through/shoot), `release`, `switch`, `tackle`, `slide`, `cancel`.

Respostas: `authenticated` (time e última sequência), `room`, `snapshot` (state com tick e acknowledgements dos dois times), `pong`, `error`, `closed`. O estado oficial da bola/placar nunca é recebido do cliente. Contratos compartilhados ficam em `shared/protocol.js`.

## Limites e configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface de escuta; Docker usa `0.0.0.0` |
| `PORT` | `8787` | Porta interna |
| `ALLOWED_ORIGINS` | Localhost e, em desenvolvimento, IPv4 privados deste computador na porta 5173 | Lista explícita substitui a descoberta; valores separados por vírgula |
| `MAX_ROOMS` | `8` | Máximo de salas em memória |
| `MAX_MATCHES` | `2` | Máximo de workers simultâneos |
| `TRUST_PROXY` | desativado | `1` usa último endereço de X-Forwarded-For para limites por IP |

Ative TRUST_PROXY somente atrás do proxy confiável, sem exposição direta da porta. Requisições HTTP de criação/entrada: 40/min/IP; upgrades WebSocket: 60/min/IP; mensagens: 90/s/conexão. Corpo HTTP até 2 KiB, WebSocket até 8 KiB. Tokens criptográficos de 32 bytes, diferentes do código público. Autenticação e origem são obrigatórias; o código da sala por si só não substitui a sessão. Logs registram criação/encerramento, falhas e métricas ao término, sem tokens. HTTPS/WSS é obrigatório na publicação via Traefik.

Os limites são guardas iniciais, não capacidade comprovada do VPS. Recursos Docker publicados: 1 CPU, 768 MiB, duas partidas. O orçamento deve ser ajustado após benchmark no servidor de destino.

## Validação e desempenho

```sh
npm test
npm run build
npm run benchmark:server
# Com backend e Vite ativos:
npm run test:online
npm run test:browser
npm run test:controller
```

Os testes de backend abrem sockets reais locais e workers, verificando também limite de capacidade, isolamento de falha de worker, rejeição de sequências antigas e neutralização de inputs vencidos. Um proxy de teste aplica RTT simulado de 30/80/150 ms, jitter de até 8 ms por sentido e omissão periódica de snapshots: os estados oficiais recebidos no mesmo tick permanecem iguais nos dois clientes. Essa omissão modela descarte de snapshots, não perda de pacotes TCP. O teste online abre dois contextos Chromium independentes, testa criação/entrada, movimento dos dois lados, chute, troca por teclado/controle virtual, menu sem pausa, reload, queda/reconexão e saída. Os snapshots e capturas ficam em `output/online/`.

`benchmark:server` mede simulação compartilhada e serialização/compressão para 1, 4 e 8 partidas por dez segundos simulados, após aquecimento. Usa um único thread sequencial: não é benchmark de rede, TLS, workers ou carga concorrente do VPS. Mede também bytes por snapshot e tráfego estimado aos dois clientes. O relatório fica em `output/backend/benchmark.json`; não interpretar memória acumulada do processo como memória por partida.

Validação de redes reais diferentes, perda de pacotes TCP, qualidade perceptiva sob atraso e capacidade do VPS continua necessária antes de disponibilizar um modo competitivo público. WebSocket pode acumular atraso por retransmissão; os limites de fila mitigam acúmulo, sem eliminar essa característica.

### Medição local inicial

Apple M3 Pro, Node 20.19.4, 19/09/2026, dez segundos simulados por cenário. Amostra curta com serialização e uma compressão nível 1 por snapshot:

| Partidas no loop | Tempo de execução | Equivalente de um núcleo | p99 do passo agregado |
| --- | --- | --- | --- |
| 1 | 342 ms | 3,4% | 1,05 ms |
| 4 | 1.004 ms | 10,0% | 3,61 ms |
| 8 | 1.708 ms | 17,1% | 5,24 ms |

Snapshots médios de aproximadamente 35,8 kB sem compressão e 7,5 kB comprimidos, estimando cerca de 300 kB/s de saída por partida somando dois clientes. Os valores de tamanho são aproximações; o relatório bruto usa bytes. Na operação real a compressão é feita separadamente por socket e há overhead de rede. A memória RSS acumulada do processo variou de 198 a 261 MiB nos três cenários; isso não mede o consumo de uma implantação com múltiplos workers. O resultado indica viabilidade local, não dimensiona o VPS.

## Publicação

Primeiro deploy do backend executado em19/09/2026. `server/Dockerfile` e seu dockerignore constroem a imagem do backend. `deploy/package-backend.py` prepara arquivo versionado e SHA256SUMS em diretório temporário, sem alterar o manifesto da publicação vigente.

`deploy/infra/apps/futebol/docker-compose.backend.yml` é um overlay opt-in. Sua rota Traefik de prioridade 200 preserva `/futebol/api/` e prevalece sobre a rota estática de prioridade 100. O serviço não publica porta diretamente. O frontend continua no Nginx existente.

Frontend e backend publicados usam protocolo1. O script antigo `activate-vps.sh` continua responsável apenas pelo frontend; não o usar como se já ativasse o backend. `deploy/activate-stack.sh <frontend-id> <backend-id>` verifica os dois arquivos, salva backups, constrói imagens versionadas e atualiza somente os dois serviços, verificando saúde e preservando IDs dos demais containers. Rollback precisa manter versões compatíveis e encerra as partidas em andamento quando reinicia o backend.

### Release publicado e validação

Frontend20260920-960c5ccb638f; backend20260920-da3b2194709c. Containers saudáveis, healthchecks HTTPS principal/www com protocolo1. Teste público de dois navegadores passou: sala, times, chute, movimento, troca, menu, recarga, interrupção/reconexão, saída e viewport mobile. Sem erros de página no teste de frontend. Backup em `/opt/futebol/deploy-backups/stack-20260920-960c5ccb638f`. Limites iniciais:8 salas e2 partidas simultâneas. Não representa benchmark de capacidade do VPS.
