# Instruções para agentes — CAMPO / FreeFutbol

## Preferência de colaboração do usuário

- Economizar tokens: respostas e atualizações curtas, evitar repetir pesquisas e contexto já documentados.
- Usar agentes Luna quando suficientes para a tarefa; reservar o agente principal para decisões, integração e revisão necessárias.

## Estado real do projeto

O produto ativo é a nova versão nativa em native/: Rust + Godot. Consulte native/AGENTS.md e native/README.md. O código JavaScript/Three.js/Rapier/Vite/Node na raiz é legado e referência; não desenvolver novas funcionalidades web para tarefas da versão nativa.
Leia README.md, docs/regras-da-mecanica.md e a documentação do módulo antes de editar.
docs/arquitetura-longo-prazo.md registra a proposta original. A primeira arena Rust/Godot está em implementação; funcionalidades do legado não devem ser presumidas no novo núcleo.
Não tratar diretórios ou comandos futuros como existentes.

## Escopo e contratos

- Trabalhar em uma issue/tarefa coerente por branch; preservar trabalho do usuário.
- Não reescrever módulos, adicionar dependências ou mudar engine para resolver uma alteração local.
- Física, regras e resultados vêm de Match. Cliente envia intenção; nunca confiar em posição, posse ou gol enviados pelo cliente.
- Preservar compatibilidade offline/online. Separar alterações de comportamento de refatorações mecânicas.
- Evitar novas dependências visuais no caminho headless. Match e MatchSession não importam Three.js; preservar essa fronteira e usar a sessão nos adapters de execução.
- Mudanças de protocolo precisam atualizar versão, compatibilidade e testes de pares de cliente/servidor.
- Não mudar golden files, tolerâncias ou budgets apenas para fazer testes passarem.

## Verificação

Comandos existentes:

~~~sh
npm test
npm run build
npm run test:browser
npm run test:online
npm run benchmark:server
npm run test:session
npm run test:session-browser
~~~

Consultar requisitos de execução dos testes de browser/online antes de iniciá-los.
Para lógica, executar regressões relevantes e a suíte completa antes de entregar.
Para apresentação, testar o fluxo afetado e inspecionar imagens e erros do navegador.
Para hot paths, medir antes/depois na mesma máquina, sem build/testes concorrentes.
Mudança apenas documental não exige repetir testes de gameplay.

Registrar comandos, resultados, versões, limitações e artefatos.
Não dizer que replay, CI, segurança ou performance foram validados quando apenas propostos.
Não apresentar um benchmark local sequencial como capacidade de produção.

## Segurança, proveniência e revisão

- Não introduzir segredos, execução remota de código, downloads implícitos ou scripts de instalação sem justificativa.
- Novas dependências precisam de fonte, licença, manutenção e revisão das transitivas.
- Assets precisam de proveniência, licença e permissão de redistribuição; “gratuito” não é uma licença.
- Código/asset gerado por IA deve ser declarado no PR. O humano que submete continua responsável.
- Toda proposta de merge precisa de revisão humana conforme CONTRIBUTING.md; agentes não contam como aprovadores humanos.
- Não alterar proteção de branch, publicar release ou fazer deploy sem instrução explícita correspondente.

## Documentação obrigatória

Funcionalidade implementada, alterada ou removida deve atualizar sua documentação no mesmo trabalho.
Revisar README.md, docs/, comentários, testes e progress.md para eliminar descrições contraditórias.
Separar fatos, decisões, metas e limitações. Preservar o histórico de progress.md e acrescentar o novo resultado.

Alterações na simulação ou no formato de estado exigem revisar SIMULATION_VERSION em src/core/session.js. Checkpoints não são snapshots visuais; não substituir a serialização completa pela telemetria arredondada.
