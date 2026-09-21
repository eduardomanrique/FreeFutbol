# CAMPO nativo — arena v0.3 Rust + Godot

Esta é a nova versão do jogo. O código web na raiz é legado e referência histórica; este executável não usa navegador, Vite, Three.js, Node ou a física JavaScript.

## Executar

Pré-requisitos: Rust/Cargo e Godot 4.6.1, Python 3 para os comandos de desenvolvimento. A configuração testada está registrada abaixo. Se Godot não estiver no PATH, defina `GODOT_BIN` para o executável (no macOS, dentro de `Godot.app/Contents/MacOS/Godot`). As ferramentas locais em `.tools/`, quando presentes, são usadas sem modificar seu PATH global.

Da raiz do repositório:

~~~sh
python3 native/tools/native.py test
python3 native/tools/native.py check
python3 native/tools/native.py controls
python3 native/tools/native.py training
python3 native/tools/native.py run
~~~

No macOS também é possível abrir `native/Jogar-CAMPO.command`. O comando compila a extensão Rust, copia a biblioteca para o projeto Godot, importa o projeto e abre uma janela nativa. Ele não instala Godot automaticamente; Cargo/rustup podem buscar as dependências e a toolchain fixadas.

~~~sh
# Construir só a extensão
python3 native/tools/native.py build
# Testar a ponte e a cena sem interface
python3 native/tools/native.py smoke
# Executar a cena nativa e guardar uma captura real
python3 native/tools/native.py smoke --capture output/native/arena.png
# Host sem engine gráfica, usando o mesmo núcleo
python3 native/tools/native.py server
~~~

## Separação

- `crates/game-core`: estado e simulação Rust, sem Godot, relógio, filesystem ou dependências externas. Tick de 120 Hz; entradas explícitas. Movimento, condução, carga/liberação de chute e trajetória da bola pertencem ao núcleo.
- `crates/godot-bridge`: GDExtension com godot-rust. Converte intenções e snapshots; não implementa futebol.
- `crates/server`: executável headless que exercita a mesma biblioteca. **Ainda não é servidor online**: transporte, autenticação, salas e sincronização não estão implementados nesta versão.
- `client`: cena Godot, entrada, câmera, HUD e apresentação dos três atletas do treino 2v1. O presenter usa o Skeleton3D glTF, cabelo e uniformes locais, interpola os clips retargetados de `motion.json`/`poses.bin` por fase de deslocamento, mantém uma âncora visual do pé de apoio durante locomoção, recebe alvos de pés/gesto de cada dicionário do snapshot e não acumula overlay ao reaplicar o mesmo estado. O chute usa um solver IK analítico de duas articulações, sem alterar a física Rust. Não há segundo solver Godot alterando a bola/jogadores.
- `tools`: build e execução locais, sem ferramentas web.

Controles: WASD/setas caminhar (até 3,2 m/s); Shift correr (até 9,775 m/s); segurar e soltar Espaço chutar; R reiniciar; C alternar câmera próxima/ampla; Esc pausar/retomar. Controle físico: analógico esquerdo, RT ou RB correr, A chutar, Start pausar e Back reiniciar (mapeamento implementado, sem validação com hardware nesta entrega).

O tick é fixo e não recebe delta arbitrário do cliente. A engine chama o núcleo a 120 Hz; pausa e perda de foco cancelam ações pendentes. O núcleo é compilado tanto no host headless quanto na extensão, sem duas implementações de gameplay.

## Escopo desta entrega

Arena de treino 2v1: campo, gols, bola, corrida, condução, chute carregado, passe, desarme, posse e contadores vindos do núcleo Rust, reinício e pausa. O jogador e o companheiro usam o uniforme vermelho; o defensor usa azul. Os controles são J/A para passe, Espaço/X para chute e K/B para desarme. Isso não declara paridade com o motion matching do navegador, IK completo, mocap ou ausência total de foot sliding.

A física inicial é analítica e simplificada. Laterais e trechos da linha de fundo fora da boca do gol rebatem a bola como limites de uma arena de treino; não há cobrança de lateral/escanteio, nem colisão cilíndrica dedicada com cada trave. Não é port completo do Rapier do legado nem prova de realismo competitivo. O chute usa preparação, varredura do pé direito e conclusão do gesto; o impulso exige contato aproximado e alcance de 1,05 m. Durante carga/gesto, o movimento anterior é mantido e a direção ajusta a mira. A condução ainda usa toques por proximidade, sem contato articulado dos pés. Não há simulação biomecânica completa. As notas de `docs/regras-da-mecanica.md` orientam a evolução; não indicam que todas aquelas funcionalidades já existem aqui.

Ainda faltam 11×11, IA tática, goleiros, passes altos/em profundidade, cabeceios, disputas completas, regras completas, multiplayer e replay persistente. O solver visual e as âncoras usam o alcance do rig e não substituem contato físico articulado; o teste visual registrou apoio ativo em 136 dos 150 ticks de sprint, incluindo trocas de pé; em outra sequência, o deslocamento máximo entre ticks do pé com âncora preservada foi 0,056 m em 88 pares de amostras, sem medir deslizamento acumulado. Testes de repetição/continuação no mesmo build não garantem determinismo entre arquiteturas. Nenhum download ou asset externo novo foi incorporado; a cópia runtime nativa mantém `CREDITS.md` e `LICENSE-CC0.txt`, com aprovação humana da proveniência ainda pendente conforme `assets/manifests/athlete-v1.json`.

## Dependências e versões

Godot 4.6.1 (MIT), godot-rust `godot = 0.5.5` (MPL-2.0), compilado para API Godot 4.6. O runtime 4.6.1 e a API 4.6 pertencem à mesma linha, conforme o [contrato oficial de compatibilidade](https://godot-rust.github.io/book/toolchain/compatibility.html). `Cargo.lock` fixa as dependências transitivas; não usar dependência Git flutuante. Integração segue o [guia oficial de GDExtension Rust](https://godot-rust.github.io/book/intro/hello-world.html).

As bibliotecas copiadas ficam dentro de `res://bin/`, como exigido para futura exportação. Os mapeamentos de plataforma não são prova de builds multiplataforma: cada plataforma/arquitetura precisa compilar sua própria biblioteca. A biblioteca macOS local não é automaticamente universal Intel/ARM. Exportações distribuíveis, assinatura/notarização, templates e consoles são etapas posteriores.

O [inventário das dependências resolvidas](third-party/DEPENDENCIES.md) registra licenças e fontes, incluindo MPL-2.0 nos crates de godot-rust.

O código novo permanece sujeito à definição da licença do projeto. Não considerar as licenças das ferramentas como licença automaticamente aplicada ao jogo. O único `unsafe` autoral é o registro exigido por GDExtension; o núcleo proíbe unsafe.

## Validação

Resultados atuais: [v0.3](../docs/native-v0.3.md), com contrato `campo-native-0.3.1`; histórico: [v0.2](../docs/native-v0.2.md) e [v0.1](../docs/native-v0.1.md). Nenhum deploy ou release foi realizado.
