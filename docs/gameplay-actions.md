# Carrinhos, acrobacias e superfícies

O comando de desarme agora inicia um carrinho com deslocamento e contato real com a bola. Contato nas pernas derruba o adversário; tocar primeiro na bola não permite atropelar o jogador depois. Fora da rua, isso interrompe a partida por falta. De frente, o adversário tenta saltar; a chance depende da stamina. Pelas costas não há essa tentativa de esquiva. Estrelas acompanham a cabeça durante a queda e recuperação.

Faltas perto da área montam uma barreira de até três jogadores. Dentro da área são pênaltis. A rua mantém o jogo correndo mesmo com contato. O botão de chute cobra a falta.

Para tentar uma bicicleta, prepare um chute de primeira num cruzamento descendente, de costas para o gol, perto da área adversária e com espaço livre. O jogador precisa estar devagar; fora da areia, há um intervalo mínimo de 18 segundos entre tentativas. Na areia o intervalo é de 3 segundos, a janela de altura, orientação e distância é mais ampla, e a IA também tenta finalizar cruzamentos de bicicleta. O contato com a bola precisa realmente acontecer durante a animação. Não há um botão que force bicicletas em qualquer situação.

Rastros de vento aparecem ao atingir velocidade de sprint. Após gols, quem marcou comemora parado enquanto os adversários ficam com as mãos na cabeça, antes do reinício. Goleiros avançam para abafar adversários próximos e capturam bolas baixas com as mãos.

A areia dissipa muito mais os quiques e aumenta a resistência conforme a bola perde velocidade. Rua e quadra rolam e quicam mais que a grama. Essas são escolhas arcade solicitadas: o futsal oficial usa uma bola de quique reduzido, e o futebol de areia oficial não usa barreiras.

Referências consultadas:
- IFAB, faltas e jogo perigoso: https://theifab.com/laws/latest/fouls-and-misconduct/
- FIFA, regras de futebol de areia: https://inside.fifa.com/tournaments/mens/beachsoccerworldcup/russia2021/news/brief-guide-to-beach-soccer-rules
- FIFA, regras de futsal (edição 2020/21): https://fam.org.my/sites/default/files/2024-11/FIFA%20Futsal%20Laws%20of%20the%20Game%202020%20and%202021.pdf

Validação: `npm test`; `node tests/gameplay-actions-browser.js` com o Vite em localhost:5173. A segunda rotina captura corrida, carrinho/falta, esquiva, barreira, bicicleta, goleiro e comemoração em `output/gameplay-actions`.

## Ajustes de domínio e reposição

Proteger só atua enquanto o botão estiver pressionado. Ao soltar a direção, o atleta procura um contato para frear a bola perto do pé. A areia usa cinco jogadores por lado (um goleiro e quatro de linha), com resistência maior à rolagem.

Os passes têm 80% menos falhas de domínio assistido entre companheiros e 80% menos interceptações automáticas ao lado de defensores parados. Mover o defensor em direção à trajetória garante a tentativa de recepção, mas ele ainda precisa alcançar a bola. Chutar diretamente no corpo continua causando colisão.

Nas saídas, o goleiro procura um companheiro com espaço. Bolas fora geram uma pausa de 2,2 segundos para os times se reorganizarem, antes de liberar a cobrança.

Cortes suaves preservam quase toda a força do toque anterior, redirecionando a bola somente no contato físico do pé. A condução antecipa a curva para manter o ritmo; inversões bruscas continuam exigindo um toque curto e frenagem.

## Parada, chute carregado e bola fora

Ao soltar a direção depois do sprint, o atleta desacelera e dosa o toque para a bola parar junto com ele, à frente do corpo. A areia ficou num ajuste intermediário de rolagem, mantendo o quique baixo.

Segurar Chute carrega a força sem interromper a corrida ou a condução e sem disparar sozinho. A preparação começa ao soltar: quanto maior a força, mais ampla a passada de apoio. Cruzamentos só iniciam a preparação da finalização após a soltura.

No campo, areia e quadra, a bola continua se movendo fora das linhas por2 segundos antes da reposição. Depois ocorre a pausa já existente para reorganizar os times. Os pisos, paredes, calçadas e caixotes receberam texturas procedurais compartilhadas e relevo leve.

## Faixas de chute, esforço e troca defensiva

A barra do chute colocado (RB + chute) avança 15% mais devagar que a normal: demora aproximadamente 18% mais para carregar, incluindo a faixa estreita de longa distância.

Chute colocado até 65% de força (inclusive) sai rasteiro, mantendo a curva. A velocidade de saída do rasteiro recebeu aumento adicional de 50%, ampliando também o alcance, sem garantir gol contra o goleiro. Acima de 65%, volta a ganhar altura conforme a força. Cavadinhas mantêm sua trajetória aérea.

A faixa de 85% a 90% (inclusive) produz uma batida forte e um pouco elevada para longa distância. Acima de90%, a força excessiva gera uma finalização muito forte, alta e fora do alvo. A barra marca as faixas em amarelo/vermelho e muda o texto. A zona de85–90% dura120ms para permitir a soltura no celular; segurar continua sem travar a movimentação. A regra de excesso também vale para finalizações aéreas.

Se a bola escapar durante uma ação já solta após a posse, o jogador tenta alcançá-la por até2,4s, dentro de6m. O chute só ocorre com contato físico do pé. Em esforço com velocidade, pode finalizar caindo. Domínio/toque adversário, distância excessiva ou tempo esgotado encerram a tentativa; não há segundo chute automático depois da finalização.

Sem posse da equipe, Trocar alterna entre o jogador de linha mais próximo à frente da bola e o mais próximo atrás dela, considerando o sentido de ataque. Recalcula os candidatos a cada toque e ignora jogadores indisponíveis. Se apenas um lado tem jogadores, usa o próximo elegível.

Os vasos da rua/quadra e as palmeiras da praia agora usam folhas de modelo glTF com texturas fotográficas, recorte alpha e normais. Troncos curvos usam mapas de casca. Assets CC0 de1K são compartilhados, locais e incluídos no aplicativo; créditos em `public/assets/vegetation/ATTRIBUTION.md`.

## Gol a gol, cavadinha e segundo defensor

Gol a gol é um modo1×1 contra a IA numa quadra de parque40×20m. Cada atleta defende e ataca apenas no seu lado. Pode buscar bolas na faixa externa de8m; não há lateral/escanteio, e o cercado externo devolve a bola. Chutes precisam sair de dentro da própria metade pintada. Áreas retangulares de6m estão destacadas em ocre.

Dentro da área, as mãos podem defender; segurar Mãos fora da área só pune quando há contato real com a bola: pênalti para o adversário. Depois da defesa, o jogador deixa a bola cair aos próprios pés. O pênalti usa cobrança com contato do pé, pausa de1,2s, goleiro na linha e retorno do cobrador ao seu campo. O defensor controlado pode ajustar sua posição lateral na linha antes do chute. Os outros modos já aplicam pênalti a faltas dentro da área; a rua continua sem faltas.

A cavadinha usa trajetória mais lenta e arqueada, com queda abaixo do travessão. No esquema Alternativo atual: LB+X no Xbox (L1+botão de chute no PlayStation), Q+Espaço no teclado, ou botão Cavadinha no celular. Mantém a regra de erro por força acima de90%.

Segurar RB/R1, E ou Pressão chama o companheiro elegível mais próximo, sem trocar o jogador controlado. O auxiliar recebe um aro azul, cerca pela direção do próprio gol e tem cerca de4s de esforço contínuo antes de cansar. Soltar encerra a pressão; não funciona no1×1. Modificadores seguem os controles clássicos documentados pela EA: https://www.ea.com/able/resources/fifa/fifa-22/ps4/basic-controls (cavadinha L1+chute; segundo defensor R1).

A facilidade de finalização recebeu ajuste pequeno: dispersão de chutes comuns reduzida8% e preparação de defesa do goleiro aumentada de260 para280ms. Não há gol automático; contato, direção, goleiro e erro de excesso de força continuam valendo.
