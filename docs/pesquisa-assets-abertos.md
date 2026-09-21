# Pesquisa de assets abertos para personagens

Pesquisa realizada em **21/09/2026** para o pipeline de assets v1 do CAMPO. As fontes abaixo são as páginas oficiais dos autores/proprietários consultadas nessa data. “Fato” reproduz o que a fonte declara; “inferência” é a consequência prática para este repositório e deve ser validada com um teste de importação/retargeting antes de adotar um pipeline.

## Decisão de escopo

Para o runtime e para um repositório público, **Quaternius Universal Base Characters + Universal Animation Library é a opção de menor risco documental entre as quatro**: a página declara CC0, formato glTF/FBX/OBJ/Blend, rig humanoide, retargeting e contagem média de 13 mil triângulos. MakeHuman/MPFB é uma boa ferramenta de geração e variação de personagens, mas adiciona Blender, exportação e limpeza de geometria ao pipeline. Kenney é uma opção CC0 simples para protótipos estilizados, porém a variante Animated Characters consultada só documenta idle, salto e corrida. Mixamo é útil como serviço de autorigging e fonte de referência/produção interna, mas os arquivos Mixamo não devem entrar como assets brutos num repositório ou produto distribuído.

Essa decisão é uma recomendação de engenharia, não uma conclusão jurídica. Para qualquer asset de terceiros, guardar a página, a licença e a versão/arquivo de origem junto do manifesto do build.

## Comparação rápida

| Fonte | Licença do asset | Comercial/modificação | Arquivo bruto no GitHub | Formatos/rig declarados | Futebol e retargeting | Custo e risco principal |
| --- | --- | --- | --- | --- | --- | --- |
| [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0 1.0; a página também indica uso pessoal, educacional e comercial | Sim; CC0 permite copiar, modificar e distribuir inclusive comercialmente | **Sim, em princípio**, inclusive fonte, respeitando a proveniência e sem sugerir endosso | FBX, OBJ, Blend e glTF; rig humanoide; média declarada de 13k triângulos; versão Source inclui Blend rigado | Retargeting é explicitamente declarado; a biblioteca compatível declara 120+ animações e locomoção em 8 direções, mas não lista futebol/chute | Download padrão gratuito; o Source/mais variedade é ligado a chaves/Patreon. Risco baixo de licença; risco técnico é a biblioteca geral não fornecer movimentos de futebol |
| [MakeHuman](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md) / [MPFB](https://static.makehumancommunity.org/about/license.html) | Código MakeHuman AGPL; código MPFB GPL; assets centrais CC0; assets de usuários podem ter outra licença | Assets centrais e saídas são declarados livres para uso e derivação; o código mantém suas próprias licenças | **Assets centrais e saídas: sim, conforme CC0**; código de MakeHuman/MPFB deve manter AGPL/GPL; assets de terceiros: verificar individualmente | Exportação documentada inclui FBX; o texto de licença cita FBX, OBJ, DAE e MHX2; rigs Default, GameEngine, CMU MB e Mixamo | Há rig GameEngine para exportação e rig Mixamo; MPFB documenta integração Mixamo e avisa que formas diferentes podem deformar o resultado. Não há pacote oficial de futebol | Gratuito/open source; MPFB exige Blender 4.2+; risco é confundir licença do aplicativo com a dos assets e aceitar assets comunitários sem revisar licença |
| [Kenney Animated Characters 3](https://kenney-assets.itch.io/animated-characters-3) | CC0 1.0 | Sim; a página diz que não exige permissão nem atribuição | **Sim, em princípio**, por ser CC0; não usar o logo Kenney para sugerir projeto oficial | A página declara modelo rigado, 4 skins e 3 animações; não especifica formato interno nem um padrão de esqueleto. O bundle geral cita OBJ, FBX, GLTF e outros formatos, mas isso não prova o formato desta variante | Idle, jump (pose) e running são os únicos clips explicitamente listados; não há futebol nem padrão de retargeting documentado | Gratuito/name-your-price; risco baixo de licença, risco técnico de pipeline e de adequação ao visual/rig do CAMPO |
| [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) / [upload e rigging](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html) | Não é CC0/open source: conteúdo Adobe sob os Termos Adobe; FAQ descreve uso royalty-free | FAQ autoriza projetos pessoais, comerciais e sem fins lucrativos; Termos permitem modificar antes de incorporar no produto final | **Não distribuir** Mixamo Content como arquivo isolado/raw. O produto final pode incorporar o conteúdo; um pacote GitHub com FBX/anim bruto cria risco direto | Upload documentado: FBX, OBJ ou ZIP; personagem já rigado para upload deve ser FBX; o serviço mapeia o esqueleto ao sistema Mixamo. A documentação pública consultada não fixa contagem de polígonos nem uma lista de formatos de download | Autorigging/animação para humanoides bípedes; catálogo público sem login não permitiu confirmar clips de futebol. A integração MPFB usa FBX e “without skin” | Gratuito com Adobe ID e sem assinatura Creative Cloud; risco de dependência de serviço/conta, termos mutáveis e proibição de distribuição bruta |

As permissões “em princípio” para GitHub significam a licença autoriza a redistribuição; ainda é necessário manter avisos/proveniência e conferir se o arquivo específico é asset central. CC0 não transfere marcas, direitos de imagem ou garante titularidade de terceiros.

## Fontes e fatos por opção

### Quaternius Universal Base Characters

**Fatos documentados.** A página oficial (agosto de 2025) descreve seis modelos em proporções Superhero, Regular e Teen, masculino e feminino, vinte penteados, topologia otimizada para animação e **rig humanoide com retargeting em qualquer engine**. Declara média de **13k triângulos**, compatibilidade com a Universal Animation Library e licença **CC0**, com uso pessoal, educacional e comercial. A página lista FBX, OBJ, Blend e glTF. A versão Source inclui os arquivos `.blend` rigados; o próprio site separa o download padrão de Source keys/Patreon e diz que 60–70% do pack é gratuito.

A página da [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) declara 120+ animações, rig humanoide universal, arquivos Blend na versão Source, exportações testadas em Godot/Unity/Unreal e locomoção em oito direções, jog, sprint, empurrão, rastejar, nadar, sentar e morte. O texto não declara clips de futebol, chute, passe ou cabeceio.

**Inferência para CAMPO.** É o melhor encaixe inicial para o personagem já usado pelo projeto: glTF/FBX são caminhos conhecidos no ecossistema Three.js, o triângulo médio é verificável na fonte e o rig foi pensado para retargeting. A biblioteca resolve locomoção geral, mas o jogo ainda precisa criar/licenciar clips específicos de futebol e validar nomes de ossos, escala, mãos/pés e root motion. A licença permite colocar os arquivos-fonte em GitHub, mas a equipe deve registrar a URL oficial e o hash/versão do arquivo obtido.

### MakeHuman e MPFB

**Fatos documentados.** O projeto explica a separação: código-fonte do MakeHuman é **AGPL**; código do MPFB é **GPL**; os assets centrais (malha base, proxies, targets/modificadores, texturas, roupas, poses e expressões) são **CC0**. A equipe também declara que exportações FBX/OBJ/DAE/MHX2, integração via MPFB, dados gerados por scripts/plugins, renders e arquivos salvos são tratados como dados do usuário, sem reivindicação sobre a saída. A exceção é importante: assets baixados dos repositórios comunitários podem ter licença diferente.

MPFB é um addon de Blender; a documentação atual pede Blender pelo menos 4.2. Para rigs, documenta Default, GameEngine, CMU MB e Mixamo. O GameEngine é descrito como adequado para aplicações externas e com 100% de compatibilidade com o sistema Mechanim da Unity (no caso indicado). A exportação recomenda preparar uma cópia, remover helpers/bake de shape keys quando necessário, usar material GameEngine e exportar FBX. A documentação de Mixamo recomenda um “reduced doll”, exportação FBX e download da animação sem skin.

**Inferência para CAMPO.** MakeHuman/MPFB pode gerar variações de corpo, roupa e morphs, e o rig Mixamo facilita um caminho de retargeting, mas o pipeline passa a depender de Blender e de uma etapa de limpeza/exportação. A própria documentação alerta que reutilizar uma animação em personagens com formas diferentes pode parecer estranho; portanto não assumir que um clip retargetado é visualmente pronto para futebol. Não foi encontrada contagem oficial de polígonos para o basemesh/rig; escolher proxy e medir o arquivo exportado no pipeline.

### Kenney Animated Characters

**Fatos documentados.** A página oficial do asset pack [Animated Characters 3](https://kenney-assets.itch.io/animated-characters-3) descreve um modelo animado e rigado, quatro skins (humano masculino/feminino e zombie masculino/feminino) e três animações: Idle, Jump (pose) e Running. Declara **CC0 1.0 Universal**, uso em qualquer projeto incluindo comercial, sem necessidade de pedir permissão ou atribuir. O download é um ZIP de 689 kB e é name-your-price.

O [suporte oficial da Kenney](https://kenney.nl/support) confirma que os assets nas páginas de assets são CC0, que uso comercial é permitido e atribuição não é obrigatória. Também pede não usar o logo Kenney, reservado para projetos oficiais. O bundle comercial “Game Assets All-in-1” descreve formatos que variam por asset (incluindo OBJ, FBX e GLTF) e reúne muitos packs; isso não permite afirmar que cada formato existe em Animated Characters 3 sem abrir o ZIP.

**Inferência para CAMPO.** É adequado para mockup low-poly e testes de skin/animador, mas a variante documentada não oferece futebol e não documenta um esqueleto humanoide padronizado ou retargeting entre personagens. Deve ser importado como um candidato separado, com teste de escala, hierarquia, pesos e clips antes de misturar com o rig Quaternius. CC0 autoriza redistribuir o ZIP/arquivos, mas créditos opcionais e a proibição de usar o logo devem ser preservados como regra de marca.

### Mixamo

**Fatos documentados.** A FAQ oficial (última atualização exibida: 14/09/2021) diz que o serviço é gratuito para quem tem Adobe ID, sem assinatura Creative Cloud adicional, e que personagens/animações podem ser usados royalty-free em projetos pessoais, comerciais e sem fins lucrativos, incluindo jogos. A FAQ limita autorigging e bibliotecas a humanoides bípedes, recomenda salvar localmente o personagem rigado e lista requisitos de malha/pose/centro para autorigging. A página de upload documenta FBX, OBJ e ZIP para entrada; personagem já rigado deve ser FBX; depois do rigging, o esqueleto é mapeado para o sistema Mixamo.

Os [Termos Gerais da Adobe, seção 3.6](https://www.adobe.com/legal/terms.html) dizem que Content Files podem ser modificados antes de serem incorporados ao End Use, mas só podem ser reproduzidos/distribuídos em conexão com o End Use; é proibida a distribuição em base isolada. Os [Termos adicionais do Mixamo](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf), efetivos em 23/06/2021, também proíbem usar o serviço, conteúdo ou output para treinar/testar/melhorar sistemas de IA/ML.

**Inferência para CAMPO.** Um jogo compilado ou aplicação final que incorpore a animação é o caso de uso pretendido; publicar FBX/anim raw em `assets/source`, GitHub, um pacote de engine ou um asset store não é uma distribuição segura. O serviço pode ser usado numa máquina de produção interna para gerar/bakear clips, mas o manifesto precisa marcar cada clip como Mixamo e impedir redistribuição bruta. Não contar com Mixamo como dependência no runtime nem como única fonte reproduzível: exige conta/serviço online, o histórico guardado é limitado ao último personagem e a Adobe pode alterar/encerrar ofertas gratuitas conforme os termos.

## Licença versus software

“Software livre/open source” e “asset livre” são contratos diferentes:

- **Quaternius:** a página licencia os assets CC0; não há um software Quaternius incorporado no runtime. Licenças da engine e ferramentas usadas para converter os arquivos continuam separadas.
- **MakeHuman/MPFB:** AGPL/GPL se aplicam ao código dos aplicativos/addon. Isso não transforma os personagens exportados em AGPL: os assets centrais e a saída declarada pelo projeto são CC0. Um asset comunitário importado pelo MPFB mantém sua própria licença.
- **Kenney:** o pack é asset CC0; a página não oferece um software que precise ser incorporado.
- **Mixamo:** é um serviço/conteúdo proprietário da Adobe. “Gratuito” e “royalty-free” na FAQ não significam CC0, licença de código aberto ou direito de publicar os arquivos-fonte.

## Regras práticas para o pipeline v1

1. Preferir Quaternius para o atleta base e manter a fonte em `assets/source/athlete` somente com um `CREDITS.md` que registre URL, data, licença e alterações. Distribuir no build os derivados glTF/poses necessários.
2. Se MakeHuman/MPFB for usado para variações, congelar versão de Blender/MPFB, selecionar apenas assets marcados CC0, usar um proxy de resolução conhecida e exportar um arquivo já limpo. Não copiar automaticamente assets comunitários sem ler a licença de cada item.
3. Usar Kenney apenas depois de um teste de importação que documente formato real, esqueleto e triângulos do arquivo escolhido. Não misturar clips sem uma etapa explícita de mapeamento/retargeting.
4. Usar Mixamo, quando necessário, como etapa interna de autorigging/produção. Não comitar nem publicar arquivos Mixamo raw; comitar apenas metadados e ferramentas próprias; distribuir resultados incorporados somente quando os termos permitirem. Conversão ou bake não torna um clip raw redistribuível no GitHub. Não usar esse conteúdo para treinamento ou avaliação de IA/ML.
5. Para qualquer fonte, não alegar futebol, captura de movimento, número de polígonos ou compatibilidade de engine que a fonte não documente. Medir localmente o arquivo final e marcar o resultado como medição do pipeline.

## Links oficiais consultados

- [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)
- [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
- [MakeHuman LICENSE.md](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md)
- [MakeHuman Community — licença](https://static.makehumancommunity.org/about/license.html)
- [MPFB — rigs](https://static.makehumancommunity.org/mpfb/docs/characters/rig.html)
- [MPFB — exportação](https://static.makehumancommunity.org/mpfb/docs/exporting.html)
- [MPFB — integração com Mixamo](https://static.makehumancommunity.org/mpfb/docs/rigging_posing/mixamo.html)
- [Kenney — Animated Characters 3](https://kenney-assets.itch.io/animated-characters-3)
- [Kenney — suporte e licença dos assets](https://kenney.nl/support)
- [Adobe — Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- [Adobe — upload e rigging no Mixamo](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html)
- [Adobe — Termos Gerais, seção 3.6 Content Files](https://www.adobe.com/legal/terms.html)
- [Adobe — Termos adicionais do Mixamo](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf)
- [Creative Commons — CC0 1.0 deed](https://creativecommons.org/publicdomain/zero/1.0/)
