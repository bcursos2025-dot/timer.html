# Leitor de PDF — v2, sobre a base oficial do pdf.js

## Por que a virada de base

A v1 era um leitor construído do zero. Funcionava, mas competia sozinho
contra décadas de engenharia da Adobe/Mozilla. Esta v2 usa **o visualizador
de referência oficial da Mozilla** — o mesmo motor que abre PDF dentro do
Firefox, usado por centenas de milhões de pessoas todos os dias — e adiciona
por cima só o que é realmente nosso: sincronização com GitHub, salvar direto
no arquivo do PC, e modo escuro forçado.

**Licença: Apache 2.0** (permissiva — pode usar, modificar e até vender,
só mantendo o aviso de licença, que já está no arquivo `LICENSE`).

## O que veio pronto (da Mozilla, não fui eu que fiz)

- Leitura, marca-texto (seleciona texto de verdade), caneta, carimbo,
  **assinatura eletrônica**, campo de texto
- Comentários com popup
- Busca, impressão, girar página, miniaturas, propriedades do documento
- Modos de rolagem: vertical, horizontal, por página, contínuo lado a lado
- Visualização de página única, dupla ou espalhada
- Modo escuro automático (segue o tema do sistema)
- Modo apresentação, zoom, ferramenta de mão vs. seleção de texto

## O que eu adicionei por cima (pasta `web/custom/`)

- **`github-sync.js`** — sincronização com um repositório GitHub (mesma
  lógica da v1, adaptada). Testei de verdade contra a API real do GitHub:
  confirmei que uma chamada com token inválido retorna erro 401 real e vira
  a mensagem certa em português — não é só teoria, o teste bateu no servidor
  de verdade do GitHub.
- **`app-hooks.js`** — a "cola": faz o botão "Abrir arquivo" usar a File
  System Access API (quando o navegador suporta — Chrome/Edge), guarda uma
  referência gravável do arquivo, e troca o comportamento do botão "Salvar"
  pra gravar direto no arquivo original em vez de baixar uma cópia nova.
  Também dispara o autosave (debounced, 1,5s) toda vez que uma marcação é
  criada, editada ou removida, usando o evento `editingstateschanged` que o
  próprio pdf.js já emite — não precisei inventar esse gancho, ele é um
  ponto de extensão documentado oficialmente (`webviewerloaded` +
  `initializedPromise`).
- **`custom.css`** — nosso tema (acento violeta) por cima do deles, sem
  mexer nas variáveis de tema claro/escuro originais.

## O que foi realmente testado, e o que não deu

Sendo direto: o app completo da Mozilla é grande demais pra eu simular
inteiro neste ambiente sandbox sem navegador de verdade (ele usa Web
Workers, WebAssembly, sistema de tradução com carregamento de arquivos —
tentar simular tudo isso no Node seria reconstruir um navegador do zero, e
não faz sentido, porque **esse código já foi testado em escala real pela
própria Mozilla e pelo uso do Firefox** — não é código não testado como era
a v1).

O que eu confirmei de verdade:
- O build oficial deles compila sem erro (rodei o processo de build
  completo, do zero, e funcionou).
- Toda referência de id (`getElementById`) no meu `app-hooks.js` existe
  de fato no `viewer.html` — sem nenhuma capturada.
- A ordem de carregamento dos scripts está correta: verifiquei contra o
  próprio código deles como eles decidem quando inicializar (checando
  `document.readyState`), e meu script usa exatamente a mesma lógica —
  então meu código só roda depois que o `PDFViewerApplication` já existe.
- A lógica de sincronização com GitHub (`github-sync.js`) isolada: testei
  configurar, persistir, limpar, e uma chamada real (não simulada) contra
  a API do GitHub, incluindo o tratamento de erro.

O que ainda pede uma conferência sua com o site no ar: o fluxo completo —
abrir um PDF de verdade, marcar, ver o autosave escrever no arquivo, e
puxar/enviar pro GitHub — porque isso exige um navegador de verdade
(Chrome/Edge) rodando o app inteiro, coisa que este ambiente não tem como
simular fielmente.

## Como publicar no GitHub Pages

1. Suba esta pasta inteira (`pdf-viewer-v2/`) pra um repositório.
2. Em **Settings → Pages**, aponte pra branch/pasta certa.
3. O visualizador fica em `https://seu-usuario.github.io/repo/web/viewer.html`.

## Como configurar a sincronização com GitHub

Igual à v1: crie um token fine-grained (escopo "Contents: Read and write")
restrito ao repositório onde os PDFs vão ficar, e preencha token, usuário,
repositório, caminho do arquivo e branch no botão de engrenagem da barra de
ferramentas.

## Checklist pra você validar ao vivo

- [ ] Abrir um PDF pelo botão de abrir (menu de ferramentas) no Chrome/Edge
      — deve pedir a pasta/arquivo pelo seletor nativo do sistema.
- [ ] Marcar um trecho de texto e ver se o indicador de sincronização muda
      pra "pendente" e depois "salvo" sozinho, sem clicar em Salvar.
- [ ] Fechar e reabrir o mesmo arquivo no seu PC — a marcação deve estar lá.
- [ ] Configurar a sincronização com um repositório de teste e confirmar
      que o commit aparece no GitHub.
- [ ] Testar busca, impressão, e os modos de rolagem/espalhamento na barra
      de ferramentas secundária.
- [ ] Ligar o modo escuro forçado e conferir com um PDF de texto e um com
      imagem de fundo (nesse a cor vai inverter — é esperado).

## Biblioteca de PDFs + cronômetro de leitura (adicionado depois)

Três arquivos novos em `web/custom/`, mais ajustes no `app-hooks.js` e no
`github-sync.js` original:

- **`pdf-library.js`** — gerencia um `manifest.json` no mesmo repositório
  GitHub já configurado (`_biblioteca/manifest.json`, arquivos em
  `_biblioteca/pdfs/`). Permite ter vários PDFs no mesmo repo, cada um com
  seu próprio caminho — antes só dava pra sincronizar um arquivo fixo.
- **`reading-tracker.js`** — conta tempo por página (pausa sozinho se a
  aba perde foco/visibilidade), grava local sempre e, se o navegador
  estiver pareado (mesmo código de 6 dígitos que a extensão já gera),
  manda pro Firebase em `dispositivos/{id}/leituraPdf`. Assume dwell
  mínimo de 4s numa página pra contá-la como "lida" (evita inflar só de
  passar rápido) — esse número está em `PAGINA_LIDA_MIN_MS`, dá pra
  ajustar.
- **`app-hooks.js`** — agora lê `?ghpath=&pdfid=&pdfnome=` na URL: se
  vier da Biblioteca, baixa o PDF direto do GitHub (essencial no iPhone,
  que não tem File System Access API) e liga o cronômetro. O autosave
  passa a mandar pro caminho certo da Biblioteca em vez do arquivo fixo
  antigo quando aplicável.
- **`github-sync.js`** — os métodos `pull`/`push` ganharam um parâmetro
  `path` opcional (antes só sabiam falar de um arquivo fixo do
  `config`), mais `pullJson`/`pushJson`/`deleteFile` novos pro manifesto.
  Fluxo antigo (um arquivo só, sem Biblioteca) continua idêntico.

**O que eu não consegui testar aqui** (mesma limitação de sempre — este
ambiente não tem um Chrome/Safari de verdade pra abrir o app completo):
o fluxo ponta-a-ponta de adicionar um PDF pela Biblioteca do site, abrir
no iPhone, marcar algo, e ver o PC puxar a mudança; e se o cronômetro de
leitura realmente pausa/retoma corretamente em todas as combinações de
minimizar/trocar de app no iOS Safari (o comportamento de
`visibilitychange` em PWA "adicionado à tela de início" pode variar um
pouco de versão pra versão do iOS). Testei manualmente: a sintaxe de
todos os arquivos novos/editados (`node --check`), que os ids
referenciados em `app-hooks.js`/`reading-tracker.js` existem de fato no
`viewer.html`, e que a lógica de merge local+remoto do cronômetro não
duplica tempo ao somar sessão anterior + sessão atual (revisão manual
linha a linha, não um teste automatizado rodando de verdade).
