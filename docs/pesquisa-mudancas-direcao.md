# Mudanças bruscas de direção — 18/09/2026

## Pesquisa e limites

- [Dos’Santos et al., 2021: treinamento de técnica e giros de 180°](https://www.mdpi.com/2075-4663/9/6/73): relaciona desempenho à frenagem, flexão dos membros inferiores e orientação do tronco/quadril/pé. Um giro de 180° requer reduzir e inverter o momento horizontal. Pesquisa de atletas; não fornece parâmetros prontos para animação de videogame.
- [Dos’Santos et al.: quando começar a frear](https://pubmed.ncbi.nlm.nih.gov/33377421/): estudo com 20 jogadores universitários mostra contribuição de vários apoios anteriores ao giro, não apenas do último pé. Fundamenta iniciar a preparação enquanto o atleta ainda se desloca na direção anterior.
- [Half-turn com bola, 2016](https://www.tandfonline.com/doi/abs/10.1080/14763141.2016.1162841): resumo destaca rotação do quadril de apoio, flexão/rotação do tronco e braços entre os fatores investigados. Usado como contexto; não reproduzimos a técnica experimental completa.

## Aplicação no jogo

A orientação antes dependia da velocidade atual, enquanto o impulso próximo já obedecia ao direcional. Isso criava a sequência artificial bola-primeiro/corpo-depois. Preservamos agora a intenção de saída antes de a aproximação automática da bola modificar a trajetória. Em cortes, ela orienta o corpo durante a frenagem, com velocidade angular limitada. A bola continua recebendo impulso só por contato.

A oposição entre velocidade e direção pedida determina intensidade de corte; ela aumenta com a velocidade de entrada. Essa intensidade abaixa o alvo do centro de massa em até 13 cm, com resposta contínua do suporte vertical existente. O quadril visual também abaixa antes da solução de joelhos, sem deslocar os alvos dos pés plantados. A recuperação da postura é suavizada ao sair do corte. Giro com ação de chute, proteção sob pressão ou bola fora do alcance preserva seus controles específicos.

São aproximações de jogabilidade e animação procedural. Não são simulação musculoesquelética completa nem movimento capturado de um atleta. A frenagem horizontal continua limitada por contato/atrito; não há inversão instantânea da velocidade ou torque articular completo. A preparação só começa quando o comando chega, sem antecipar inputs futuros.

## Validação

Regressão de cortes 90°/180° verifica rotação antes do contato que redireciona, abaixamento do centro de massa e preservação da posse. Regressões existentes cobrem recuperação, mudanças de direção e continuidade da condução. Teste visual específico registra os dois cortes após 0,3 s.
