# Pesquisa de assets comerciais para animação de futebol

Pesquisa de fontes oficiais consultadas em **21/09/2026**. Não foram baixados assets, iniciadas compras ou feitas alterações no pipeline. Os termos de licença são contratos: antes de incorporar qualquer asset ao produto publicado, arquivar a página/termo vigente e confirmar a licença do item específico.

## Leitura rápida para este projeto

| Opção | Futebol verificável | Saída/integração | Custo observado | Decisão provisória |
|---|---|---|---|---|
| MetaHuman | Não é pack de futebol; é personagem/rig facial e corporal | DNA/RigLogic e ferramentas Epic; páginas consultadas não prometem um FBX genérico para Three.js | Incluído na licença UE; gratuito abaixo de US$ 1 mi de receita segundo a página MetaHuman | Não usar como solução de clips de futebol. A página atual declara uso com qualquer engine; o conteúdo/formato de distribuição depende do regime e da licença aplicáveis ao asset específico. |
| Rokoko Motion Library/Create | Biblioteca tem milhares de clips e um pack oficial de 12 animações esportivas; não foi verificado que esse pack seja futebol | FBX/BVH/CSV; Mixamo, HIK, UE5 Manny e retarget de personagem customizado no Studio | Clips da Motion Library observados entre US$ 3–20; Create/Studio Starter grátis, Basic desde US$ 10/m no anual | Melhor candidato para testar movimento; usar apenas clips com licença específica arquivada e manter FBX fora do GitHub público. |
| Studio33 Soccer 8 (ArtStation) | Mais de 600 animações, incluindo drible, passes, chutes, goleiro, tackles, traps e celebrações | FBX.zip (140 MB) e Unity package (260 MB) | US$ 900 Standard; US$ 2.700 Extended | Maior cobertura futebolística verificável; exige confirmar retarget e adequação ao esqueleto Three.js antes da compra. |
| Ntopia Football(soccer) Animation Pack (Fab) | 22 ações; passes, chutes, cabeceio, drible etc. | `.uasset`, UE Mannequin, UE 4.26–5.5, 30 FPS, 16 root-motion | Preço não exposto na consulta pública | Exemplo Fab verificável, mas formato UE-only dificulta o pipeline atual e a página tem nota 1,2/5 (5 avaliações). |
| Ailive Soccer Animation Pack (Fab) | 4 clips: comemoração, drible/chute, drible, chute | FBX, baseado no UE5 Manny, corpo inteiro, dedos, mocap levemente limpo | Preço não exposto na consulta pública | Exemplo Fab adicional, pequeno; mais acessível ao retarget via FBX, mas não cobre um jogo inteiro. |

“Qualidade” abaixo significa o que a fonte declara ou o que é observável na descrição/lista de clips. Não foi feita avaliação visual ou técnica, pois isso exigiria baixar/comprar os assets.

## 1. MetaHuman / Epic

### Fatos documentados

- A [página oficial de licença do MetaHuman](https://www.metahuman.com/license) diz que MetaHuman está incluído na licença padrão da Unreal Engine, que é gratuito para quem fatura menos de US$ 1 milhão e que, acima do limite, aplicam-se os termos padrão da Unreal Engine. A mesma página afirma expressamente: “MetaHumans can be used with any engine or creative software”. Portanto, não é correto registrar simplesmente “MetaHuman só funciona na Unreal”.
- Desde o Unreal Engine 5.6, o [Creator é integrado ao Unreal Engine](https://www.metahuman.com/creator-download); novos usuários não são aceitos no antigo aplicativo web. A página de [download](https://www.metahuman.com/download?lang=en-US) lista Creator, Mesh to MetaHuman e Animator como componentes do Unreal Engine e também plugins para Maya/Houdini, USD via Marvelous Designer e conteúdo/integrações adicionais.
- O [MetaHuman Devkit](https://www.metahuman.com/devkit) é descrito pela Epic como tecnologia integrável fora da Unreal. O [OpenRigLogic](https://github.com/EpicGames/OpenRigLogic) (bibliotecas C++ nativas com bindings Python) é liberado sob MIT. Isso licencia o código OpenRigLogic, não transforma os personagens, meshes, texturas ou rigs MetaHuman em conteúdo MIT.
- O Devkit descreve o [formato DNA](https://www.metahuman.com/devkit) como interoperável e capaz de armazenar juntas, meshes, blend shapes, animated maps, LODs e relações entre eles. A página do MetaHuman diz que os personagens são “fully rigged”. Não foi encontrado número oficial de polígonos por personagem nas fontes consultadas.
- A documentação da Epic para o [MetaHuman Animator Markerless Motion Capture](https://www.metahuman.com/download?lang=en-US) diz que o plugin gera animação de corpo inteiro, incluindo mãos, diretamente para o esqueleto MetaHuman ou com retarget para outros tipos de personagem. Isso não documenta retarget direto para o esqueleto de atletas deste projeto, nem exportação pronta para Three.js.
- Não foi encontrada, nas páginas oficiais consultadas, uma biblioteca de clips de futebol do MetaHuman. O produto é uma tecnologia de personagem/captura e não substitui um pack de animações de drible, passe, chute e goleiro.

### Licença e distribuição

Os textos oficiais tratam de camadas diferentes e precisam ser lidos com o versionamento em mente:

1. A licença pública atual do [MetaHuman](https://www.metahuman.com/license) afirma que MetaHumans podem ser usados com qualquer engine ou software criativo. O [MetaHuman Devkit](https://www.metahuman.com/devkit) também documenta integração fora da Unreal.
2. Para conteúdo MetaHuman adquirido sob o [Epic Content License Agreement atual](https://www.unrealengine.com/eula/content), o **MetaHuman Content Addendum** diz que o conteúdo adquirido pode ser usado e compartilhado como UE-Only Content. O mesmo EULA separa o conteúdo licenciado da tecnologia e restringe distribuição do formato fonte, com exceções para colaboradores que desenvolvem o projeto. Também permite distribuir aplicativos/projetos e mídia renderizada com conteúdo incorporado, observadas as condições do acordo.
3. O [EULA antigo do MetaHuman Creator cloud](https://www.unrealengine.com/eula/mhc) informa expressamente que continua aplicável ao aplicativo em nuvem usado com Unreal Engine 5.5 ou anterior; para UE 5.6 em diante vale o EULA da Unreal. As proibições desse EULA antigo (por exemplo, restrições à tecnologia Creator em si) não devem ser apresentadas como se governassem automaticamente personagens criados pela toolchain nova.

Portanto, não há base para dizer que todo MetaHuman é restrito à Unreal, nem para dizer que todo personagem exportado é livre de restrições de conteúdo. A conclusão operacional depende de como o asset foi obtido, da versão/toolchain e do que será distribuído. Para este repositório:

- **Uso comercial:** a página MetaHuman indica a faixa de receita da licença UE; o conteúdo adquirido continua sujeito ao acordo específico e às condições UE-Only quando o adendo for aplicável.
- **Modificação:** é possível criar/customizar personagens pela ferramenta e usar o resultado em um projeto; isso não autoriza modificar ou redistribuir a tecnologia MetaHuman/Rig Logic nem amplia, por si só, a licença do conteúdo adquirido.
- **Projeto compilado:** o EULA de conteúdo contempla distribuir aplicativos e mídia com conteúdo incorporado, desde que o projeto agregue valor e não venda o asset isoladamente. Isso não significa que uma conversão para glTF/FBX elimine as condições aplicáveis ao conteúdo ou autorize um build fora do escopo da licença.
- **Asset fonte/raw no GitHub:** não publicar meshes, texturas, DNA, rigs ou pacotes MetaHuman em repositório público. O EULA restringe distribuição em formato fonte; OpenRigLogic é uma exceção separada sob MIT, desde que apenas o código MIT seja distribuído.
- **Polígonos/rig:** rig facial/corporal, DNA, blend shapes e LODs são documentados; contagem de triângulos/polígonos não é.

**Ponto jurídico pendente:** se a pipeline escolher Three.js ou outra engine fora da Unreal, conferir os termos do asset exato e da versão/toolchain no momento da aquisição, inclusive as condições de distribuição do formato convertido. Não usar o EULA cloud legado como bloqueio automático para conteúdo criado com UE 5.6+; tampouco presumir que reduzir a malha ou converter para glTF/FBX remove as restrições de conteúdo fonte/standalone.

## 2. Rokoko Motion Library e Rokoko Create

### O que é verificável

- A [Motion Library](https://support.rokoko.com/hc/en-us/articles/4410021302417-What-is-The-Motion-Library) é uma loja integrada ao Studio com assets de estúdios como Audiomotion e Centroid. O guia oficial informa **milhares** de assets, muitos gratuitos, e clips pagos normalmente entre **US$ 3 e US$ 20**, conforme a complexidade.
- O guia de compra diz que um clip comprado é baixado como **FBX contendo apenas movimento no esqueleto**, sem mesh/personagem; alguns têm animação de dedos. Portanto, não é um pacote de modelos nem uma licença para copiar o avatar de demonstração.
- A página atual do Studio documenta exportação para **FBX e BVH**, presets de esqueleto como Human IK e Mixamo, opções de mesh e overrides de exportação; o [Rokoko Create](https://create.rokoko.com/) também menciona FBX, BVH e CSV. O Studio suporta integração com Blender, Unreal, Unity, Maya, Houdini, Cinema 4D, MotionBuilder e iClone.
- O retarget de personagem próprio é um recurso pago: a tabela de [planos e preços](https://www.rokoko.com/pricing) lista importação/retarget de personagem customizado a partir do plano Basic. Create/Studio Starter dá 30 s/mês de Video-to-Motion, clips Text-to-Motion ilimitados e 5 importações de clips ao Studio; Basic dá 600 s/mês e 100 importações; Plus 3.000 s/mês e 1.000; Pro 15.000 s/mês e importações ilimitadas.
- O pack oficial [Rokoko mocap: 12 free sports animations](https://www.rokoko.com/resources/rokoko-mocap-12-free-sports-animations) declara 12 animações esportivas, corpo inteiro com dedos, FBX, Mixamo e 30 FPS, com uso em projetos comerciais. A página não lista os nomes nem afirma que as 12 são futebol; por isso deve ser tratado como **esporte genérico**, não como pack de futebol verificado.
- O [Rokoko Create](https://www.rokoko.com/products/studio/rokoko-create) declara uso comercial dos clips gerados por texto; a página diz que o modelo gera movimentos novos, não replicados diretamente dos assets de treino. Isso não transforma automaticamente assets da Motion Library em dados livres para treino de IA.

### Termos atuais e riscos de distribuição

Os [Rokoko Services – Standard Terms of Use, versão 2.0.1, efetiva em 16/07/2026](https://www.rokoko.com/services-terms-of-use) são a referência atual para Studio, Studio Preview e Create:

- O usuário conserva direitos sobre o próprio **User Content** e é responsável por direitos de terceiros. Isso cobre, por exemplo, vídeo enviado ao Create e resultados gerados, sujeito aos termos.
- A licença de Rokoko Assets (incluindo assets da Motion Library de terceiros) é limitada ao período em que a conta está ativa, salvo termos específicos do asset. É permitido baixar/copiá-los para fins legítimos, incluindo backup, e o texto reconhece cópias quando integradas em produções digitais. Fora do que o asset específico permitir, não é permitido reproduzir, distribuir, sublicenciar, alugar ou emprestar o asset.
- Os termos proíbem usar assets obtidos/fornecidos para desenvolver, treinar ou melhorar modelos/algoritmos de machine learning/IA sem consentimento escrito explícito da Rokoko.
- Os termos permitem colaboração entre usuários/Teams, mas exigem respeito às licenças de cada asset. Não existe, nas cláusulas globais consultadas, uma concessão genérica de redistribuição do FBX cru para o público.

Aplicação ao repositório:

- **Uso comercial:** é publicitado para os resultados do Create e para o pack gratuito de 12 esportes; para Motion Library, conferir a licença/termos do clip individual e a conta que o comprou.
- **Modificação:** Studio oferece edição, foot-lock, smoothing e loop; isso demonstra uma permissão operacional para editar o movimento, mas a licença específica do clip deve ser guardada para comprovar o direito de distribuir o resultado editado.
- **Projeto compilado:** animação integrada numa produção/jogo é a utilização pretendida e reconhecida pelos termos, sem expor o FBX como produto separado.
- **Asset fonte/raw no GitHub:** não publicar FBX/BVH/CSV cru. Usar armazenamento privado da equipe; no build, empacotar apenas os dados necessários ao jogo.
- **Rig/polígonos:** Motion Library entrega movimento no esqueleto e não mesh; polígonos não se aplicam. O pack gratuito declara Mixamo; não há contagem de ossos ou triângulos publicada.
- **Qualidade futebolística:** há prova oficial de 12 clips de esporte, mas nenhuma prova oficial, nas fontes consultadas, de que todos sejam futebol ou cubram condução, apoio, passe e goleiro. A qualidade final do retarget e a limpeza precisam de teste com uma amostra autorizada.

**Custo observado:** Starter US$ 0; preços exibidos em faturamento anual: Basic US$ 10/mês, Plus US$ 20/mês, Pro US$ 50/mês, Enterprise a partir de US$ 100/mês; faturamento mensal exibido: Basic US$ 12, Plus US$ 28, Pro US$ 70, Enterprise a partir de US$ 150. A Motion Library mostra historicamente US$ 3–20 por clip no guia oficial. Preços, limites e termos podem mudar.

## 3. Studio33 Interactive — Soccer 8

### Conteúdo verificável

O produto oficial do vendedor no [ArtStation Marketplace](https://www.artstation.com/marketplace/p/G5avz/studio33-interactive-soccer-8-full-soccer-animation-pack) declara **mais de 600 animações**, tipo Humanoid & Generic, com grupos como:

- 78 dribles, 115 traps/recepções, 99 tricks;
- 42 ações de defesa, 39 sprints, 42 joggings, 23 walks;
- passes baixos/médios/longos/lob, chutes, volleys, cabeceios, interceptações e tackles;
- 76 ações de goleiro, 32 keeper-ball, 4 diving-head, além de kick-off, aquecimento e 29 celebrações.

A lista é muito mais próxima da cobertura necessária para um jogo de futebol que os exemplos Fab pequenos. Ela é uma indicação de **quantidade e cobertura**, não uma garantia de qualidade visual, captura profissional, continuidade de root motion ou compatibilidade com o atleta atual.

O anúncio informa:

- `Studio33 Interactive [soccer 8] - FBX.zip`, 140 MB;
- `Studio33 Interactive [soccer 8] - Unity package.unitypackage`, 260 MB;
- informação de modelo: 3.626 polys, 2.069 verts e textura 512×512–50.

A página não decompõe se a contagem de polígonos é do atleta, da bola ou do test player; não usar esse número como orçamento confirmado da malha que será retargetada. Não há na página uma contagem de ossos, nomes de rig ou instruções de retarget para Three.js. O FBX é a única rota claramente útil para o pipeline atual; o pacote Unity é específico de Unity.

### Licença exata e distribuição

O anúncio mostra duas licenças e o [EUA padrão do ArtStation Marketplace](https://www.artstation.com/marketplace-product-eula) fornece os detalhes:

- **Standard Commercial, US$ 900:** uso pessoal ilimitado e uma obra comercial, limitada a 2.000 vendas ou 20.000 visualizações mensais, conforme aplicável.
- **Extended Commercial, US$ 2.700:** número ilimitado de obras comerciais sem limite de vendas ou visualizações.
- Para Stock Assets, o EUA permite copiar, usar, modificar, adaptar, traduzir, distribuir, exibir, transmitir, transmitir por broadcast e criar obras derivadas **dentro de Works** (filmes, jogos etc.).
- Pode-se compartilhar com colaboradores/contratados que precisam do asset para a obra, com acesso limitado; não se pode publicar, vender, licenciar ou redistribuir o produto isoladamente nem colocá-lo em um clearinghouse online.
- A licença é não exclusiva, mundial e normalmente perpétua, mas termina em caso de violação, reembolso ou cancelamento.

Aplicação:

- **Jogo compilado:** permitido como parte da obra, desde que a obra agregue valor e o asset não seja o produto isolado.
- **Alterações/retarget:** permitidos quando incorporados na obra. Guardar a licença e não publicar o FBX fonte.
- **Raw GitHub público:** proibido pela restrição de disponibilizar/distribuir o Product para terceiros baixarem/copiarem; GitHub privado de colaboradores é aceitável dentro da colaboração autorizada.
- **Limite comercial:** o Standard pode ser insuficiente para um produto que ultrapasse 2.000 vendas ou 20.000 views/mês; Extended elimina esses limites de vendas/visualizações, mas não elimina a proibição de redistribuir o asset isolado.

**Risco principal:** o anúncio é do vendedor e o pacote não expõe, na página pública, um mapa de retarget, versão do esqueleto ou qualidade de captura. Antes de comprar, exigir uma amostra/export de teste ou confirmar por escrito o esqueleto e o uso com um personagem GLB/Three.js.

## 4. Exemplos de packs de futebol no Fab (sem duplicar Studio33)

### Ntopia Studio — Football(soccer) Animation Pack

Página oficial: [Fab — Football(soccer) Animation Pack](https://www.fab.com/listings/8378f8cc-bf69-4afd-9136-fc6c46ce1426).

Fatos da página: **22 animações**, com passes, chutes, cabeceio, drible e outras ações; 16 têm root motion; 30 FPS; formato `.uasset`; rig UE Mannequin; compatibilidade declarada UE 4.26–4.27 e UE 5.0–5.5. A listagem tinha classificação média **1,2/5 em 5 avaliações**. Não há contagem de polígonos, número de ossos, FBX/BVH ou mesh fonte publicada. A página não mostrou preço na consulta pública; os campos de licença/preço exigem selecionar/visualizar a oferta.

A licença aplicável ao item deve ser verificada na tela de compra. A listagem consultada não expôs o tier selecionado; o [Fab EULA/Standard License](https://www.fab.com/eula) fornece o baseline da **Fab Standard**, tratado abaixo como hipótese condicional, não como licença já confirmada para este item. Se a oferta efetivamente for Fab Standard, ela permite:

- uso comercial ou privado;
- modificar/adaptar para incorporar ao projeto;
- distribuir comercialmente o projeto com o asset incorporado;
- usar ferramentas compatíveis, sem limitar a Unreal;
- compartilhar com colaboradores em repositório privado ou no projeto.

Ela proíbe revender ou redistribuir o asset isolado gratuitamente. A licença Reference-Only não entrega formato fonte. Assim, **se** Fab Standard for o tier confirmado, um build compilado pode ser distribuído com o `.uasset` incorporado, mas o arquivo fonte não deve ir para GitHub público. Como esta listagem oferece apenas `.uasset`/Unreal, a compatibilidade jurídica ampla do Fab não resolve a incompatibilidade técnica com Three.js: seria preciso retarget/export autorizado e tecnicamente viável, algo não documentado.

### Ailive — Soccer Animation Pack

Página oficial: [Fab — Soccer Animation Pack](https://www.fab.com/listings/79effd7a-8783-4cf2-be0e-f8c001f79a4a?lang=es-mx).

Fatos da página: pack de **4** animações de corpo inteiro com movimento de dedos, capturadas por mocap e “lightly cleaned”: `Celebrating_Goal`, `Dribbling_and_Shooting_in_Soccer`, `Dribbling_in_Soccer` e `Kick_a_Soccer_Ball`. São baseadas no UE5 Manny e a listagem oferece **FBX**. Não há polígonos, número de ossos, duração ou preço público verificável na consulta; a página marca conteúdo promocional e “Allows usage with AI: No / Generated with AI: No”.

Para licença e distribuição, **se a oferta selecionada for Fab Standard**, aplica-se a leitura acima: uso comercial, modificação dentro do projeto e build distribuível; não publicar o FBX cru ou revendê-lo isoladamente. Se o item tiver outro tier/termo, esse texto deve ser refeito com a licença efetivamente aceita. A origem “mocap, lightly cleaned” é uma descrição do vendedor, não uma medição de qualidade. Quatro clips não cobrem a biblioteca de movimentos do jogo, mas o FBX oferece um ponto de teste de retarget melhor que um `.uasset` fechado.

### Nota sobre outros resultados Fab

Também foi localizado o [Football Moves Pack](https://www.fab.com/listings/d55b01a5-2224-4257-b250-15af6a7e8c21?lang=pt-br), anunciado com 11 motions (chute, passe, recepção, goleiro e jogo), mas a página pública não expôs formato, preço, polígonos ou rig. Ele pode ser triado futuramente, mas não é uma recomendação técnica até esses dados serem confirmados.

## Comparação de formato, retarget e exposição do source

| Asset | Fonte/formato declarado | Retarget documentado | Polígonos/rig | Raw no GitHub público | Build compilado |
|---|---|---|---|---|---|
| MetaHuman | DNA/RigLogic; plugins Maya/Houdini; `.mhpkg` para publicação Fab; formato FBX/glTF não confirmado nas páginas usadas | Animator pode retargetar para outros tipos de personagem; destino Three.js não confirmado | DNA guarda juntas/meshes/blend shapes/LODs; polígonos não publicados | Não, salvo código OpenRigLogic MIT separado; conteúdo MetaHuman fonte é restrito | Depende da licença do conteúdo e da versão/toolchain; conversão não elimina restrições raw/standalone |
| Rokoko | Motion Library: FBX só movimento; Create/Studio: FBX, BVH, CSV conforme plano | Mixamo/HIK/UE5 Manny e personagem customizado no Studio Basic+ | Sem mesh na Motion Library; polígonos não aplicáveis | Não para FBX/BVH/CSV cru; manter privado | Sim, como animação integrada em produção, respeitando a licença do clip |
| Studio33 Soccer 8 | FBX.zip e Unity package | Humanoid & Generic declarado, mas mapa de ossos/destino não | 3.626 polys/2.069 verts/512×512–50 declarados sem decomposição; bones não documentados | Não; colaboradores apenas com acesso limitado | Sim, como parte de Work, dentro do limite Standard/Extended |
| Ntopia Fab | `.uasset`, UE Mannequin, 30 FPS, 16 root motion | Retarget para Three.js não documentado | Polígonos/bones não documentados | Não; se Fab Standard for confirmada, colaboração privada é permitida, asset isolado não | Se Fab Standard for confirmada, asset incorporado pode ser distribuído conforme o EULA |
| Ailive Fab | FBX, UE5 Manny; FPS não declarado | Retarget não explicitamente descrito; Manny facilita teste, mas não é garantia | Polígonos/bones não documentados | Não; mesma condição de tier Fab | Se Fab Standard for confirmada, asset incorporado pode ser distribuído conforme o EULA |

## Riscos e checklist antes de qualquer compra/incorporação

1. **Guardar termos e recibo.** Licenças e preços mudam; registrar URL, data, versão/ID do produto, tier comprado e recibo no inventário privado.
2. **Testar retarget numa cópia autorizada.** Verificar escala, eixos, root motion, contatos pé-bola, looping, mão/dedos e transições no esqueleto de 65 ossos do projeto. O anúncio de “Humanoid”, “Manny” ou “Mixamo” não prova compatibilidade automática.
3. **Separar fonte de build.** Source FBX/BVH/DNA/uasset fica fora de repositório público; o repositório contém apenas scripts, metadados e, se necessário, um artefato privado/licenciado. O build publicado pode conter dados transformados/integrados somente quando a licença permitir.
4. **Não treinar IA com assets.** Epic e Rokoko têm restrições explícitas ou equivalentes contra usar conteúdo em datasets/treino sem permissão; a marca “NoAI” do Fab reforça o risco, mas não substitui a leitura do EULA.
5. **Não anunciar qualidade sem teste.** “High quality”, “AAA” e “mocap” são descrições de marketplace. Fazer revisão visual, verificar clipping e medir custo de runtime antes de decidir.
6. **Confirmar formato de entrega.** Especialmente MetaHuman e Ntopia: o fato de um produto ser comercialmente utilizável não garante que o vendedor/Epic autorize exportar o source para GLB/FBX ou usar em Three.js.
7. **Revisão humana jurídica.** Prioridade: confirmar os termos do MetaHuman específico e da toolchain escolhida para uso fora da Unreal, verificar o tier Fab efetivamente selecionado para cada item, a permissão de redistribuir animações Rokoko após cancelamento/conta inativa e os limites exatos do Studio33 Standard para um produto publicado.

## Fontes oficiais

- [MetaHuman — License](https://www.metahuman.com/license)
- [Epic — MetaHuman Content Addendum / Content EULA](https://www.unrealengine.com/eula/content)
- [MetaHuman — Devkit/OpenRigLogic](https://www.metahuman.com/devkit)
- [Epic — MetaHuman Creator EULA](https://www.unrealengine.com/eula/mhc)
- [Rokoko — Studio](https://www.rokoko.com/products/studio)
- [Rokoko — Services Standard Terms of Use, v2.0.1 (16/07/2026)](https://www.rokoko.com/services-terms-of-use)
- [Rokoko — Motion Library](https://support.rokoko.com/hc/en-us/articles/4410021302417-What-is-The-Motion-Library)
- [Rokoko — Motion Library guide](https://support.rokoko.com/hc/en-us/articles/4410021327121-Getting-Started-Rokoko-Studio-Motion-Library)
- [Rokoko — Create](https://www.rokoko.com/products/studio/rokoko-create)
- [Rokoko — preços e planos](https://www.rokoko.com/pricing)
- [Rokoko — 12 free sports animations](https://www.rokoko.com/resources/rokoko-mocap-12-free-sports-animations)
- [ArtStation — Studio33 Soccer 8](https://www.artstation.com/marketplace/p/G5avz/studio33-interactive-soccer-8-full-soccer-animation-pack)
- [ArtStation — Marketplace Product & Services Agreement](https://www.artstation.com/marketplace-product-eula)
- [Fab — EULA / Fab Standard License](https://www.fab.com/eula)
- [Fab — Ntopia Football(soccer) Animation Pack](https://www.fab.com/listings/8378f8cc-bf69-4afd-9136-fc6c46ce1426)
- [Fab — Ailive Soccer Animation Pack](https://www.fab.com/listings/79effd7a-8783-4cf2-be0e-f8c001f79a4a?lang=es-mx)
