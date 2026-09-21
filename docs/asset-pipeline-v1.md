# Laboratório de atletas e pipeline de assets — v0.1

Implementado na branch codex/arquitetura-longo-prazo em 21/09/2026 usando a stack atual.
O pedido atual de implementação substitui a etapa “somente pesquisa” do texto de referência.
Não houve compra, download ou incorporação de novos assets externos.

## Abrir e usar

Execute npm run dev e abra /asset-lab.html, ou escolha **Laboratório** no menu do jogo.
O build inclui index.html e asset-lab.html. Esta é uma ferramenta de avaliação visual,
não um cliente Godot nem uma partida ou replay determinístico.

- Personagens: jogador base, variação corporal estreita e goleiro, todos derivados do
  modelo masculino Quaternius e esqueleto de 65 ossos existentes.
- A variação corporal é escala visual horizontal; **não é um modelo feminino**,
  não altera a partida e não valida a física de corpos diferentes.
- Uniformes: Atlético e União. Goleiros conservam a camisa amarela atual;
  os calções variam por equipe.
- Clips: espera, caminhada, corrida, sprint, reação a impacto e chute experimental.
  Os cinco primeiros são clips gerais retargetados; chute é autoria do projeto,
  não captura de futebol.
- Pausa, reinício, velocidade 0,25×/0,5×/1× e posição temporal. Clips não cíclicos param
  no último frame; reproduzir novamente reinicia.
- Arrastar/zoom de câmera, restauração e esqueleto sobreposto. Espaço pausa quando
  o foco não está num controle; F alterna fullscreen quando disponível.
- **Exportar ficha de revisão** baixa JSON com seleção, ossos, cobertura,
  inventário e hashes; não exporta meshes/texturas nem envia dados a serviços.

A prévia amostra clips sem as correções de IK, regras ou bola da partida. Avaliar
contato e jogabilidade no jogo continua obrigatório. Triângulos exibidos incluem
a cena de prévia, não são uma contagem de malha atribuída ao fornecedor.

## Pesquisa e decisão

Fontes oficiais, permissões, formatos, rigs, custos e ressalvas:

- [Quaternius, MakeHuman/MPFB, Kenney e Mixamo](pesquisa-assets-abertos.md).
- [MetaHuman, Rokoko, Studio33 e packs Fab](pesquisa-assets-comerciais.md).

As pesquisas distinguem fatos de inferências. Não houve avaliação dos arquivos
comerciais nem teste de importação nas três engines nativas.

| Cenário | Modelo | Animações | Motivo/limite |
| --- | --- | --- | --- |
| A — protótipo imediato | Quaternius existente | Clips CC0 + gestos procedurais identificados | Menor custo de integração; não representa qualidade final |
| B — comparação de engines | Mesmo Quaternius/rig em todas | Locomoção comum + pequena biblioteca esportiva própria/redistribuível | Comparação justa sem confundir engine com diferença de conteúdo |
| C — produto aberto ambicioso | Modelo original preparado em Blender; MPFB com assets centrais CC0 como alternativa | Captura/autoria própria com cessões e licença explícita | Controle artístico e de direitos; exige limpeza, otimização e equipe |

**Avaliação da hipótese inicial:** Quaternius e Blender são adequados agora. MPFB é
uma alternativa de geração, não dependência runtime ou mudança obrigatória de rig.
Mixamo não deve ser a biblioteca provisória padrão de um repositório que distribui
assets brutos: a locomoção CC0 existente já evita esse problema. Rokoko pode ajudar
na captura e limpeza, mas captura própria, resultado gerado e clip comprado têm
regimes distintos. Packs pagos ainda exigem testes de contato e retarget.

MetaHuman não é descartado por uma suposta obrigação universal de usar Unreal:
os termos atuais distinguem toolchains e conteúdo. É inadequado como padrão desta
primeira versão pela complexidade e condições de redistribuição de conteúdo fonte.

## Pacote mínimo do vertical slice

| Elemento | Nesta versão | Para o slice completo |
| --- | --- | --- |
| Jogador masculino | Modelo existente | Validar LOD, pesos, materiais e contato |
| Jogadora ou variação corporal | Escala visual do mesmo corpo | Corpo independente/jogadora com pesos e contato revisados |
| Goleiro | Mesmo rig e uniforme próprio | Luvas e biblioteca específica |
| Dois uniformes | Materiais procedurais | Texturas/roupas próprias com orçamento/licença |
| Esqueleto comum | 65 ossos | Mapeamento/exportação testados por engine |
| Caminhada/corrida | Clips CC0 gerais | Podem ser provisórios inicialmente |
| Frenagem/cortes | Procedural na partida | Clips de apoio, giro e desaceleração |
| Condução bilateral | Contatos procedurais na partida | Captura/autoria de ambos os pés, ritmos e curvas |
| Passe curto/longo, chute/cruzamento | Gestos procedurais compartilhados | Apoio, impacto e follow-through esportivos |
| Cabeceio | Procedural na partida | Preparação, salto, contato e aterrissagem |
| Carrinho/disputa corporal | Lógica procedural e reação genérica | Interações coordenadas entre atletas |
| Queda/recuperação | Apoios procedurais | Autoria esportiva; ragdoll não basta |
| Defesa de goleiro | IK e controle procedural | Defesa baixa/alta/lateral, agarrar/desviar e recuperar |
| Comemoração | Pendente | Clip genérico provisório com licença adequada |

Locomoção, idle e comemoração podem ser provisórios. Gestos que definem contato,
transferência de peso e interação exigem captura/autoria específica e validação
com a física. Quantidade de clips não mede qualidade de futebol.

## Inventário e validação

[athlete-v1.json](../assets/manifests/athlete-v1.json) registra os 15 arquivos existentes
em assets/source/athlete e public/assets/athlete: tamanho, SHA-256, papel, origem,
evidência e situação de licença. Data de acesso conhecida não foi inventada como
data de download. Aprovação humana permanece explicitamente pendente.

~~~sh
npm run validate:assets
npm run test:assets
npm run test:asset-lab
npm run build
~~~

O teste de navegador requer servidor local na porta 5173; TEST_BASE_URL permite
testar outro endereço, inclusive o preview do build.

O build valida integridade, inventário, paths/URIs locais, existência de licença,
rig e poses antes do Vite. A verificação não certifica direitos autorais nem permite
aprovar um asset apenas mudando um campo. Atualizar hashes exige revisão do diff.

Oito referências de imagens ausentes são exceções explícitas: mapas originais do
modelo fonte carregado com materiais simples e normal map do cabelo não utilizado.
São avisos, não downloads ou permissão geral para buffers/texturas runtime faltantes.
O glTF fonte não deve ser tratado como pacote completo de materiais.

npm run build:motion mantém o gerador existente de motion.json, poses.bin e athlete.gltf.
Após modificá-lo, revisar derivados, atualizar inventário e repetir validações.
A v0.1 não atualiza hashes automaticamente para evitar aceitar alterações inesperadas.

## Checklist de admissão

- [ ] URL oficial, autor/empresa e identificador/versão.
- [ ] Licença exata e texto salvo; recibo/tier se aplicável.
- [ ] Data de download verdadeira ou desconhecida; SHA-256 e tamanho.
- [ ] Formato e auxiliares completos, sem referências remotas inesperadas.
- [ ] Rig, hierarquia, nomes, pose de referência, escala, unidades e eixos.
- [ ] Permissão comercial e de modificação/retarget.
- [ ] Permissão para distribuir o jogo compilado.
- [ ] Permissão separada para publicar fonte/raw no GitHub.
- [ ] Atribuição, avisos e direitos de imagem/marca.
- [ ] Licença de código, modelo, textura, animação e derivados.
- [ ] Importação, orçamento de polígonos/texturas/ossos e LODs.
- [ ] Deformação, foot sliding, contato, root motion e transições.
- [ ] Revisão humana, riscos conhecidos e pendências registrados.

## Respostas objetivas

1. **Modelo agora:** Quaternius existente.
2. **Modelo no slice:** mesmo Quaternius como baseline comum; corpo alternativo com retarget/licença verificados.
3. **Evitar:** biblioteca pública dependente de raw Mixamo/MetaHuman/comerciais e mudanças baseadas só na promessa “AAA”.
4. **Provisórios:** espera, caminhada/corrida, comemoração e reações genéricas de demonstração.
5. **Próprios/licenciados especificamente:** condução, passes, chutes, cabeceios, disputas, quedas e goleiro.
6. **GitHub:** CC0 comprovado, conteúdo próprio com direitos/licença definidos, ferramentas/metadados; CC BY com obrigações cumpridas.
7. **Fora do repositório:** raw comercial sem direito de redistribuição, conteúdo restrito Mixamo, recibos privados e licença incerta. Converter/bakear não elimina restrições.
8. **Próximo passo:** revisar os clips no laboratório e selecionar uma sequência pequena de condução, passe e chute para captura/autoria própria com marcadores de contato; validá-la antes de ampliar o catálogo.
