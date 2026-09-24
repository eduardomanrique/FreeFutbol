# App mobile

O CAMPO 26 pode ser empacotado como app iOS e Android com Capacitor. O app reutiliza a partida web compilada junto dele: Three.js/WebGL, Rapier/WASM, interface touch e modos offline funcionam sem carregar a página do site. A tela fica travada em paisagem e usa a área toda do aparelho.

## Preparar e abrir

Instale as dependências uma vez e gere/sincronize os assets mobile:

```sh
npm install
npm run mobile:sync
```

Abra o projeto nativo no Xcode ou Android Studio:

```sh
npm run mobile:ios
npm run mobile:android
```

O projeto iOS exige Xcode e CocoaPods; o Android exige Android Studio/SDK. Para distribuir, configure a equipe de assinatura Apple no Xcode e a chave de assinatura Android antes de criar os arquivos de loja. O identificador `dev.kmworks.campo26` é provisório e deve ser trocado se não estiver disponível nas contas de publicação.

## Controles

Os controles touch existentes continuam disponíveis. No app, a leitura do controle físico usa uma ponte nativa para alimentar o mesmo formato Gamepad padrão já consumido pelo jogo. iOS recebe controles suportados pelo GameController; Android lê eventos de gamepad, joystick e direcional do sistema. Analógicos, direcional, botões frontais, ombros e gatilhos são expostos ao jogo, que conserva o mapeamento e a calibração atuais.

A ponte não foi validada com um controle físico nesta máquina. Alguns controles Android reportam botões/índices próprios; o fluxo existente de configuração de botões permite calibrar esses casos. Vibração não está implementada.

## Multiplayer

O build mobile aponta a API e o WebSocket para `https://kmworks.dev`. O backend precisa responder CORS aos esquemas locais usados pelo WebView (`capacitor://localhost` no iOS e `https://localhost` no Android). A lista foi adicionada à configuração versionada do backend, mas requer uma publicação do backend para partidas online pelo app. Até essa publicação, os modos offline e treino funcionam; não há mudança no servidor remoto feita por este pacote.

## Antes das lojas

- Escolher o identificador definitivo de app e os dados de privacidade/loja.
- Gerar ícone, capturas de tela e materiais de publicação para os dois sistemas.
- Configurar assinatura iOS e Android nas contas correspondentes.
- Instalar em aparelhos reais, validar controles touch/físicos, WebGL, áudio, desempenho, suspensão/retorno e multiplayer.
- Publicar a origem CORS do backend antes de validar salas online no app.

Capacitor 7 foi escolhido por compatibilidade com Node 20 neste ambiente. A versão instalada está em manutenção estendida; antes de publicar nas lojas, revisar a migração para Capacitor 8 e Node 22.
