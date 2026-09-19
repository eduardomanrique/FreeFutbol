# Plano de multiplayer por código — 18/09/2026

Proposta, ainda não implementada. Escopo inicial: duas pessoas, cada uma controla um time e troca o atleta selecionado; os demais atletas continuam com IA. Treino e partida offline continuam disponíveis. Entrada por código curto ou link, como a experiência descrita do Justcards. O código-fonte do Justcards não foi inspecionado; reaproveitar sua implementação depende dessa revisão.

## Dificuldade e arquitetura

Salas/códigos são de dificuldade baixa a média. Futebol online convincente tem dificuldade alta: a bola é compartilhada, há contatos rápidos entre pés e corpos, e a resposta local precisa parecer imediata apesar da rede. Usar UDP não resolve previsão, sincronização e divergências de física.

O projeto já tem simulação separada da interface e passo fixo de 120 Hz, uma boa base. Porém Match ainda usa selected, charge, charging, actionPlayer e lastInput globais e várias decisões pressupõem usuário no time 0. Precisamos transformar isso em estados por participante/time. O snapshot atual é de diagnóstico; não contém todo o estado necessário para restaurar física, pés, ações pendentes, cooldowns, IA e aleatoriedade. Não basta transmitir esse JSON ou rodar duas partidas independentes.

Para uma primeira versão privada entre amigos, recomendo WebRTC com um anfitrião autoritativo: ele decide o resultado dos contatos, posse e gols. O convidado envia comandos numerados e recebe estados. O anfitrião tem vantagem de latência e pode adulterar a partida; se ele sair, a primeira versão encerra a sessão. Para partidas competitivas, usar servidor autoritativo dedicado, com a mesma simulação compartilhada entre cliente e servidor. Separar autoridade e transporte desde o início facilita a evolução, mas a migração ainda exige trabalho e testes.

## Rede no navegador

Uma página web comum não abre sockets UDP arbitrários. WebRTC DataChannel permite atualizações sem ordem e sem retransmissão (`ordered:false,maxRetransmits:0`), adequadas para estados substituídos pelo próximo pacote. Ele normalmente usa UDP, mas redes restritas podem exigir relay/fallback. Criar também canal confiável para entrada, confirmação, início, placar e encerramento. Eventos de pressionar/soltar chute precisam de IDs e confirmação/redundância: perder um pacote não pode deixar o botão preso nem repetir um chute.

Servidor pequeno com HTTPS/WebSocket coordena códigos e sinalização. STUN ajuda a encontrar conectividade; TURN retransmite quando conexão direta falha, com custo de tráfego. Não tratar código curto como credencial: token de sessão separado, limite de tentativas e expiração da sala.

WebTransport oferece datagramas e streams para ligação cliente-servidor HTTP/3 e é alternativa para servidor dedicado; exige verificar suporte nos navegadores-alvo e infraestrutura QUIC. WebSocket também permite prototipar, mas retransmissão e ordenação podem atrasar estados novos quando um pacote se perde.

Fontes consultadas: [MDN — DataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel), [MDN — ICE/STUN/TURN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols), [MDN — WebTransport](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API).

## Etapas e critérios de conclusão

1. **Separar controle por time.** Dois conjuntos de comandos, seleção, carga e ações; atacar corretamente nas duas direções. Testar dois controles locais, chutes simultâneos e troca de atleta. Manter modo offline.
2. **Criar protocolo e autoridade.** IDs de sessão/tick/comando; snapshots compactos, eventos idempotentes, limites de input. Começar mantendo física a 120 Hz e transmitir estados a 20–30 Hz, comandos a 30–60 Hz; taxas são hipóteses a medir, não garantias de desempenho. Não transmitir vértices ou todos os ossos.
3. **Criar/entrar por código.** Sinalização, WebRTC, STUN/TURN, pronto/iniciar, versão compatível, timeout e mensagens de desconexão. Validar em redes diferentes, inclusive forçando TURN.
4. **Esconder a latência.** Prever movimento do atleta local, interpolar remotos com buffer adaptativo e reconciliar estados confirmados. Previsão da bola/contato é o ponto mais delicado; efeitos locais provisórios precisam ceder à autoridade sem duplicar impulso, posse ou gol. Guardar histórico suficiente para reaplicar comandos, sem presumir determinismo entre máquinas.
5. **Robustez e medição.** Testar 30/80/150 ms de RTT, jitter, 1–5% de perda, pacotes fora de ordem, comandos repetidos, aba suspensa e queda de conexão. Medir correções visíveis, erro de posição da bola, tempo input→resposta, largura de banda e custo de simulação. Definir política de pausa e reconexão; não deixar a pausa local parar unilateralmente a partida online.
6. **Servidor dedicado, se necessário.** Remover vantagem/autoridade do anfitrião, executar partidas no servidor, definir limites por máquina após benchmark, reconexão e observabilidade. Deploy somente quando solicitado.

## Estimativa de esforço

Estimativa de planejamento para uma pessoa experiente, dedicada, com o escopo 1×1 acima: protótipo funcional em aproximadamente 1–2 semanas; versão privada razoavelmente polida em 4–8 semanas no total. Servidor competitivo, reconexão sofisticada, proteção contra trapaça e suporte amplo podem exceder bastante esse intervalo. A precisão da previsão da bola e a refatoração do controle por time são os maiores fatores de incerteza. Não é prazo garantido nem medição de trabalho já executado.

## WebRTC versus UDP — esclarecimento de 18/09

DataChannel é SCTP sobre DTLS sobre ICE/UDP na pilha usual. Oferece segurança, mensagens, controle de congestionamento e modos confiáveis/parcialmente confiáveis. UDP bruto tem menos camadas e dá mais controle ao implementador, que teria de construir esses serviços. `ordered:false,maxRetransmits:0` evita esperar/retransmitir estados antigos, mas não elimina filas, congestionamento nem perdas. Usar mensagens pequenas e limitar bufferedAmount é parte do protocolo do jogo. TURN pode acrescentar caminho/custo e certos ambientes recorrem a transporte alternativo. Não há garantia universal de latência igual ao UDP nativo; medir RTT/jitter/perda e correções visíveis nas redes-alvo. Para o escopo de browser casual, WebRTC continua uma opção apropriada. Fonte normativa: [RFC8831](https://www.rfc-editor.org/rfc/rfc8831.html).
