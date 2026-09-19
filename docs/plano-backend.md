# Plano do backend — 19/09/2026

> **Histórico de planejamento, superado em 19/09/2026:** o usuário optou por servidor autoritativo. A implementação atual usa Node.js, Rapier e WebSocket, sem anfitrião autoritativo ou WebRTC/TURN. Consulte [backend.md](backend.md) para comportamento implementado e limitações. O restante deste documento preserva a proposta anterior, não o estado atual.

Status: proposta para implementação; nenhum serviço implementado ou publicado neste trabalho.

## Base e escopo

Este plano detalha o backend previsto em `plano-multiplayer.md` e `backlog-proximos-passos.md`: partidas privadas para duas pessoas, cada uma controla um time, entrada por código/link e cálculos do jogo nos clientes. Offline e treino continuam disponíveis. A regra de documentar funcionalidades no mesmo trabalho permanece obrigatória; deploy exige pedido explícito.

O projeto atual é estático, com Vite, Three.js e Rapier. `src/simulation.js` ainda mantém seleção, carga e último input globais e contém decisões específicas do time 0. O snapshot de diagnóstico não é um protocolo de restauração de partida.

## Arquitetura proposta

- Backend Node.js, JavaScript ESM e biblioteca `ws`, no mesmo repositório, em `server/`. HTTP para criar/entrar em salas e saúde; WebSocket para lobby e sinalização WebRTC.
- Salas e sessões em memória, uma instância inicialmente. Sem contas, ranking ou banco nesta etapa. Reiniciar o serviço invalida salas/sessões; o cliente informa o encerramento. Persistência e múltiplas instâncias ficam para uma necessidade posterior.
- WebRTC DataChannel para comandos e estados entre os navegadores. STUN e TURN fazem parte da entrega online: conexão direta quando possível e retransmissão quando necessária. TURN transporta pacotes, sem executar física; seu tráfego precisa ser medido separadamente.
- Anfitrião como autoridade da simulação: recebe intenções do convidado e confirma movimento, contatos, bola, posse, placar e reinícios. Cada pessoa controla exclusivamente seu time; o convidado prevê resposta local e reconcilia com o anfitrião. Não aceitar posições propostas pelo convidado como fatos definitivos.
- A autoridade única resolve conflitos de bola compartilhada. Duas simulações independentes confirmando gols ou contatos produziriam divergências. Esta é uma recomendação de implementação, não um requisito previamente aprovado.
- Limitações: vantagem de latência e possibilidade de adulteração pelo anfitrião. Sem migração de anfitrião nesta versão. Um modo competitivo exigiria autoridade dedicada.

## Experiência e ciclo de vida

Criar sala → compartilhar código/link → segundo jogador entra → ambos ficam prontos → anfitrião inicia → conexão e estado inicial confirmados → partida → resultado/encerramento.

Estados do backend: `waiting`, `ready`, `connecting`, `playing`, `finished`, `closed`. A sala comporta dois participantes, com time e papel atribuídos pelo servidor. Entradas concorrentes devem reservar a única vaga de forma atômica. Código curto é convite, não token de sessão.

Parâmetros iniciais propostos, ajustáveis por configuração: código aleatório de 6 caracteres sem caracteres ambíguos; lobby expira após 15 minutos sem atividade; heartbeat a cada 10 segundos; conexão considerada perdida após 30 segundos; retomada de sessão por até 30 segundos após detecção. Salas em jogo não expiram pelo prazo de inatividade do lobby.

Se faltar input recente, neutralizar comandos e cancelar carga pendente. Perda da conexão de jogo ou suspensão do anfitrião interrompe a partida; permitir retomada apenas se a mesma instância autoritativa ainda conservar o estado e ambos confirmarem uma nova sincronização. Recarregar/perder o anfitrião encerra a sessão. O menu local não pausa unilateralmente o jogo; pausa online depende dos dois jogadores.

## Contrato inicial

Rotas públicas propostas:

| Interface | Função |
| --- | --- |
| `POST /futebol/api/rooms` | Criar sala e retornar código, participante e token |
| `POST /futebol/api/rooms/join` | Entrar por código, respeitando capacidade e versão |
| `GET /futebol/api/healthz` | Saúde do backend, separada da saúde do site |
| `WSS /futebol/api/ws` | Autenticar sessão, lobby, sinalização e retomada |

Mensagens WebSocket: `session.resume`, `room.ready`, `room.start`, `room.leave`, `signal.offer`, `signal.answer`, `signal.ice`, `room.state` e `error`. Toda mensagem tem versão, tipo e ID; servidor deriva identidade/sala da sessão autenticada. Confirmações de pedidos e IDs evitam efeitos duplicados. Eventos de lobby não representam validação independente do placar.

Autenticar o WebSocket com primeira mensagem sob TLS e timeout curto, sem token em URL. Antes da autenticação, não permitir inscrição ou sinalização. Validar Origin, esquema, tamanho e frequência; limitar criação/entrada por IP e sessão. Token imprevisível e separado do código, logs sem tokens ou conteúdo de sinalização. Credenciais TURN temporárias apenas para sessões autorizadas.

No WebRTC: canal confiável para início, eventos únicos, confirmação e encerramento; canal sem ordem/retransmissão para estados substituíveis. Inputs levam sequência e tick; pressionar/soltar ações exige ID e confirmação/redundância para evitar chutes duplicados ou botões presos. Vincular negociação aos dois participantes autenticados.

Manter inicialmente física a 120 Hz; experimentar snapshots a 20–30 Hz e inputs a 30–60 Hz. São hipóteses de medição. Separar estado visual compacto do estado completo necessário à reconciliação, incluindo ações pendentes e fases físicas relevantes. Não transmitir todos os ossos. Limitar buffers e descartar snapshots antigos antes que acumulem atraso.

## Ordem de implementação e aceite

1. **Backend de salas.** Estrutura `server/`, contratos compartilhados em `shared/`, HTTP, sessões, lobby, expiração, heartbeat e testes. Aceite: dois clientes criam/entram/iniciam; terceiro, token inválido, versão incompatível e repetição de pedidos são tratados corretamente.
2. **Conexão entre navegadores.** Adaptador em `src/network/`, sinalização e STUN/TURN, interface criar/entrar/pronto. Aceite: conexão entre redes diferentes, teste forçando TURN e erro compreensível quando indisponível. Ainda não significa multiplayer jogável.
3. **Simulação por participante.** Remover pressupostos de time 0; seleção, carga, troca e ações independentes; mapear controles nas duas direções. Aceite: ações simultâneas dos dois lados e regressão de treino/offline.
4. **Partida sincronizada.** Autoridade, inputs numerados, estado inicial completo, snapshots, previsão/interpolação e reconciliação. Aceite: contatos/gols únicos, nenhum impulso duplicado e retomada a partir de estado confirmado. Isolar transporte para permitir testes locais antes da rede real.
5. **Robustez e integração operacional.** Testar 30/80/150 ms de RTT, jitter, 1–5% de perda, duplicação, desconexão, suspensão de aba, retomada e encerramento. Registrar erro da bola, correções visíveis, latência de resposta, bytes por segundo, recursos por sala e uso de TURN; definir limites de capacidade a partir das medições.

Usar `node:test` para salas/protocolo e clientes WebSocket reais nos testes de integração; dois contextos de navegador para o fluxo completo. Testar a rede degradada no caminho real de WebRTC. Atualizar README, documentação afetada e progress.md junto de cada entrega.

## Infraestrutura

Preparar serviço Docker separado para backend no VPS existente, com Traefik/HTTPS. Rota `/futebol/api` deve ter prioridade sobre o frontend `/futebol/` e suportar upgrade WebSocket. O Nginx atual continua servindo o jogo. TURN exige configuração própria de conectividade/portas, não apenas uma rota HTTP no Traefik.

O empacotamento atual inclui somente o frontend; precisará incluir release versionado do backend, compatibilidade entre versões de protocolo e rollback coordenado. Logs estruturados e métricas de salas/conexões/erros devem existir desde o primeiro serviço. Não copiar o orçamento de recursos do Nginx para o backend sem medição. Publicação fica para solicitação explícita.

## Referências técnicas

- [WebRTC: conexão, sinalização e ICE](https://webrtc.org/getting-started/peer-connections).
- [WebRTC: DataChannels](https://webrtc.org/getting-started/data-channels).
- [ws: servidor Node.js, autenticação e heartbeat](https://github.com/websockets/ws).
