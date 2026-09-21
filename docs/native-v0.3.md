# Arena nativa v0.3 — treino 2v1

O cliente Godot agora apresenta o contrato de treino 2v1 do núcleo Rust. O jogador controlado, um companheiro e um defensor usam o mesmo atleta Quaternius; o companheiro mantém o uniforme vermelho e o defensor usa a variação azul. As três posições, velocidades, headings, pés e gestos chegam no snapshot autoritativo.

O cliente chama `advance_actions(x, z, sprint, shoot, cancel, pass, tackle)` para jogar. Uma ponte sem esse método produz um erro visível e interrompe o fluxo; `advance` fica restrito ao smoke legado. Não existe simulação substituta em GDScript. O snapshot preserva os campos anteriores e acrescenta `teammate`, `defender`, `possession`, `passes_completed` e `tackles_won`.

J mantém o passe armado até a liberação e K envia a intenção de desarme. No controle, A é passe, X é chute e B é desarme; o gatilho direito/Shift continua sendo corrida. Espaço permanece chute no teclado. Pausa e perda de foco cancelam e suprimem passe/chute até que a tecla ou botão seja liberado.

## Limites

O cliente apenas apresenta os estados fornecidos pelo Rust. Não decide posse, alcance, contato, passe, desarme, IA ou placar, e não aplica física Godot aos três atletas. Esta etapa não declara paridade com o jogo web, rede, multiplayer, 11v11, animação corporal completa ou uma disputa física articulada. A ABI antiga permanece disponível para regressões; o produto exige a nova ABI.

Os testes de integração do cliente verificam a leitura dos três dicionários, cores de equipe, carga/cancelamento de J, passe dirigido e recepção, comandos J/K e os contadores do snapshot. `training`, `controls`, `athlete` e `smoke` passaram com a ponte v0.3.1; as capturas inicial e pós-recepção estão em `output/native-2v1/final.png` e `final-receive.png`.

## Locomoção 0.3.1

O núcleo usa caminhada a 3,2 m/s e sprint a 9,775 m/s. A carga inicia uma desaceleração progressiva, mantém o corpo plantado durante o auto-release de 1,3 s e não relança enquanto o botão permanece pressionado. O presenter conserva o clip de locomoção enquanto a velocidade ainda está acima de 0,85 m/s; a preparação do chute entra por overlay e o clip kick só assume quando o corpo já freou.

`locomotion_visual.gd` passou com caminhada de 3,00 m em 120 ticks, parada de 0,35 m após a janela de repouso, sprint de 7,83 m no mesmo número de ticks, velocidade 0,00 m/s no tick 60 da carga, drift residual de carga abaixo de 0,20 m e exatamente uma entrada em `striking`. A métrica é uma sequência real do bridge, não snapshots injetados.

## Regras implementadas no núcleo

- O primeiro passe ativa os dois agentes de treino. Antes disso, ficam nas posições iniciais para permitir praticar o chute sozinho.
- O passe do jogador usa carga, soltura e varredura do pé; o alvo é o único companheiro. A velocidade é calibrada por distância e carga, limitada a 14 m/s. Ainda não há os passes altos/em profundidade ou a assistência completa da web.
- O companheiro aproxima-se da bola, reduz sua velocidade ao dominá-la e tenta devolver após 48 ticks. Essa devolução é um impulso por alcance, sem gesto articulado próprio. Uma interceptação limpa o passe pendente; domínio de bola solta não conta como novo passe.
- O defensor persegue a bola e intercepta quando é o contato elegível mais próximo. Ao dominar, segura posição: não conduz até o gol, não chuta e não tem IA tática. A disputa automática ocorre sobre bola solta, não é um sistema completo de marcação/desarme do portador.
- Segurar K por 27 ticks consecutivos (225 ms), próximo do defensor e da bola e voltado para ele, permite desarmar. Soltar, cancelar ou sair do alcance reinicia a preparação. Não há carrinho, faltas ou colisão corporal completa nesta etapa.
- A bola nunca é reposicionada por recepção ou posse. Recepção usa teste de alcance e impulso de redução de velocidade; continua sendo uma aproximação, sem domínio articulado completo. O estado de posse do treino ativo expira fora do alcance e pode ser recuperado por contato. Isso ainda difere da assistência de condução do legado.

## Evidências finais

Em 21/09/2026, Rust 1.98.1 e Godot 4.6.1 no Apple M3 Pro: 22 testes Rust; fmt/clippy do workspace; testes Godot training/controls/athlete e smoke. Após os últimos ajustes do núcleo, training, controls e smoke gráfico foram repetidos e passaram. Captura final em `output/native-2v1/review.png`. Não foram medidos capacidade de servidor online, determinismo entre plataformas ou paridade completa com o legado.

### Correção de condução/parada/carga — 0.3.1

Sem Shift, o limite passou de 6,67 para 3,2 m/s para atender ao pedido de caminhada curta; Shift mantém 9,775 m/s. Toques de caminhada usam previsão de encontro com avanço curto e intervalo de 0,28 s; sprint usa 0,42 s. Ao parar, um contato assistido dentro de 1,2 m reduz a velocidade da bola; fora do alcance ela conserva movimento e desacelera pela física. Não é ainda um solver articulado de calçado na condução.

Carga máxima em 0,315 s e liberação automática após 1,3 s, sem repetir até soltar. A intenção de deslocamento comprometida decai durante 24 ticks e o corpo freia por aceleração limitada. O golpe não volta a acelerar um jogador já parado. O limite de duração segue as notas do legado; não implementa ainda toda a dispersão/elevação especial da sobrecarga da web.

Validação final: 26 testes Rust e fmt/clippy passaram. Godot locomotion, training, controls, athlete e smoke passaram; após a remoção final da reaceleração, locomotion foi repetido. No mesmo intervalo de 120 ticks: caminhada 3,00 m e sprint 7,83 m; distância de frenagem do jogador 0,35 m no cenário. Teste exige bola final a até 1,2 m após parar, velocidade do corpo abaixo de 0,1 m/s no tick 60 da carga e exatamente um impulso de chute. Capturas inspecionadas em `output/native-locomotion/review.png` e `review-charge.png`. Resultados locais, sem alegação de equivalência final ao FC ou de ausência de todo deslizamento visual.
