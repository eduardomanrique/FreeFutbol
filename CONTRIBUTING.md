# Contribuindo com CAMPO / FreeFutbol

Estas regras são a proposta inicial de governança desta branch. A ativação de rulesets,
checks e equipes no GitHub é uma etapa administrativa separada. Consulte
[a arquitetura proposta](docs/arquitetura-longo-prazo.md) e [AGENTS.md](AGENTS.md).

## Fluxo

Issue → proposta técnica proporcional ao risco → implementação → testes → cenário/replay
→ benchmark quando aplicável → pré-revisão humana quando necessária → PR → CI
→ aprovação humana → merge.

Draft PRs podem ser abertos cedo. Cada issue deve informar comportamento esperado,
módulo, invariantes, cenário de aceitação e orçamento de performance relevante.
Refatorações amplas, formatos persistidos, mudança de física ou novas dependências
precisam de justificativa explícita; decisões estruturais usam ADR.

Submeta mudanças pequenas, com descrição do problema, resultado e evidências.
Não misture mudança visual, nova física e reformatação de toda a árvore num único PR.
Se um contrato compartilhado mudar, indique os consumidores afetados.

## Contribuições assistidas por IA

IA é permitida. Declare ferramenta/modelo quando conhecido, arquivos/partes assistidas,
origem de trechos ou assets e revisão feita por uma pessoa. Não publique segredos,
conversas privadas ou raciocínio interno da ferramenta.

O autor humano é responsável por entender, testar e defender a alteração.
Revisão feita por outro agente é útil, mas não substitui aprovação humana.
Testes gerados a partir da própria implementação precisam ser confrontados com
invariantes ou resultados definidos independentemente.

A nova versão nativa ainda não possui replay persistente. O replay técnico do legado web não prova determinismo da versão nativa. Até sua implementação,
forneça teste/cenário reproduzível com inputs, seed quando possível e resultado esperado;
não chame um snapshot visual de checkpoint restaurável.

## Revisões

- Todo merge exige revisão humana independente do autor.
- Exigir dois revisores qualificados para física/contatos, regras, rede/autoridade,
  protocolo/replay, unsafe/FFI/concorrência, dependências/licenças, CI e deploy.
- Alterações de baselines, critérios de aceitação ou políticas também exigem revisão.
- Se não houver revisores suficientes, manter a proposta em branch e registrar a
  limitação. Não contar contas de agentes como revisores humanos.
- Aprovação perde validade após mudanças relevantes; revisar o diff final.

CODEOWNERS apenas define responsáveis. Proteção de branch, checks obrigatórios e
contagem de aprovações precisam ser configurados no GitHub. Não usar o arquivo como
alegação de que esses controles já estão ativos.

## Testes e evidências

Execute os comandos relevantes descritos em AGENTS.md. Para gameplay, inclua fixture
que falhava antes e passa depois, além das regressões pertinentes. Para apresentação,
inclua capturas/vídeos e inspeção humana. Para performance, registrar hardware,
versão, carga, warmup, repetições e p95/p99; não executar junto de outras verificações.

Se um item não se aplica, explique brevemente. Teste não executado não é teste aprovado.
Atualize a documentação do comportamento e progress.md.

## Licenças e arquivos de terceiros

A licença do código na raiz ainda precisa ser formalmente definida pelos titulares.
Esta proposta recomenda Apache-2.0 OR MIT para código próprio, sem aplicar essa
licença automaticamente a contribuições históricas.

Manter atribuições e textos de licença de terceiros. Para cada novo asset/dependência,
informar fonte, versão/hash, licença, autores e condições de redistribuição.
Não adicionar assets extraídos de outros jogos ou pacotes de marketplace sem direito
de distribuição pública dos arquivos fonte. Conteúdo gerado por IA segue os mesmos
critérios de proveniência e revisão.

## Releases e deploys

Um PR aprovado não autoriza publicação. Releases requerem artefatos verificados,
compatibilidade de versões, changelog e rollback. Deploy passa por ambiente de teste,
aprovação explícita e drenagem das partidas em curso quando houver mudança incompatível.
Nunca armazenar tokens de produção no repositório ou disponibilizá-los a PRs de forks.
