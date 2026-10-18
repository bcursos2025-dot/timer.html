# Professores, comentários e pedidos de correção — o que fazer no Firebase

Páginas: `professor.html` (cadastro do professor), `professores.html` (lista pública e pedido de correção), `admin.html` (você aprova), e a caixa de comentários dentro de `oab.html`. Até você fazer os passos 1 a 4, as páginas abrem e mostram mensagens claras (por exemplo "o login por e-mail e senha ainda não foi ligado"). O resto do site não depende disso.

> Tempo: uns 15 minutos. **Guarde uma cópia das regras atuais antes de mexer** (passo 3).

## Como funciona

| Quem | O que faz | Onde |
|---|---|---|
| Qualquer pessoa | vê professores aprovados, comentários e curtidas | sem login |
| Aluno (conta e-mail/senha) | curte comentários e envia pedido de correção | `professores.html`, `oab.html` |
| Professor | cria conta, preenche o cadastro (fica **pendente**) | `professor.html` |
| Você (admin) | confere o número da OAB e aprova ou recusa | `admin.html` |
| Professor aprovado | aparece na lista, comenta questões, recebe pedidos | `oab.html`, `professor.html` |

- O e-mail precisa estar **confirmado** (link que o Firebase envia) para o professor enviar o cadastro e comentar, e para o aluno enviar pedido. Isso reduz spam.
- O **perfil público** (`professores_aprovados`) não tem número da OAB nem e-mail. Esses dois ficam só em `professores_pendentes`, que só o dono e o admin leem.
- Comentário só de professor aprovado, com o nome do perfil aprovado (as regras impedem usar nome de outro). O aluno só curte e pede correção. Ninguém curte o próprio comentário.
- O pedido de correção é uma mensagem para o e-mail do aluno; **o pagamento não passa pela Norma ainda**. Professor e aluno combinam por e-mail.

## Perfil do professor, vídeo e avaliações

- **Foto e OAB:** o professor envia a foto (a página recorta e reduz sozinha para um JPEG pequeno) e o número da OAB no cadastro. Os dois só vão ao perfil público quando você aprova. O professor aprovado pode editar o perfil: a edição volta para análise, e o perfil público atual continua no ar até você aprovar.
- **Comentário em vídeo:** além do texto, o professor pode colar um link de vídeo do **YouTube** ou do **Google Drive** (compartilhado como "qualquer pessoa com o link"). Qualquer outro endereço é recusado. O vídeo fica no Drive/YouTube dele (a Norma não guarda nada); no site aparece um botão que abre o player.
- **Comentário formatado:** o professor escreve com uma barra de formatação (negrito, itálico, sublinhado, marca-texto em 6 cores, título de seção, citação da lei em destaque e lista) e vê a pré-visualização na hora. O botão **Modelo** insere uma estrutura pronta (Tema central, Legislação aplicável, Doutrina e jurisprudência, Análise das alternativas, Possível pegadinha, Conclusão). O comentário é guardado como texto com uma marcação curta (`**negrito**`, `__sublinhado__`, `{amarelo|trecho}`, `# Título`, `> citação`, `- item`) e desenhado por `js/norma-texto.js`, que só cria elementos permitidos: não aceita HTML, então não dá para injetar código. Limite: 6.000 caracteres.
- **Comentários do professor** aparecem no cartão dele, com link que abre a questão (`oab.html?q=47-001`).
- **Avaliações dos alunos:** de 1 a 5 estrelas e um texto curto. **Só quem pediu correção àquele professor pode avaliar** (uma avaliação por aluno). Não entram no ranking.
- **Admin:** `admin.html` mostra pendentes (com foto e OAB) e aprovados, e permite remover alguém da lista pública.

## Dúvidas dos alunos e anotações

- **Dúvida do aluno:** embaixo de cada questão (depois de responder), qualquer pessoa com conta e e-mail confirmado pode perguntar (10 a 600 caracteres). **Só professor aprovado responde**, com o editor formatado, e a resposta aparece com nome e OAB. A dúvida não pode ser editada; o aluno apaga a dele e o professor apaga a própria resposta (o admin apaga qualquer uma, pelo console).
- **Painel do professor:** `professor.html` lista as dúvidas **sem resposta**, com o botão "Abrir e responder" (`oab.html?q=47-001&dv=1`, que abre a questão com dúvidas e comentários mesmo sem a pessoa ter respondido).
- **Minha anotação:** em cada questão, um bloco recolhível só do aluno, com a mesma barra de formatação, salvo **neste aparelho** (`cb2_oab_notas`) e incluído no backup (junto com o progresso das questões).

## Ranking dos professores

`pontos = (curtidas ÷ comentários) × log2(1 + comentários)`

Quem recebe mais curtidas por comentário sobe, e quem comenta mais ganha um peso a mais (por exemplo 1 comentário com 1 curtida = 1,0 ponto; 50 comentários com 40 curtidas = 4,5 pontos). Estrelas e avaliações de serviço **não** entram. A conta está em `js/norma-dados.js` (`pontuacao`); dá para trocar.

## Passo 1 — Ligar o login por e-mail e senha

1. <https://console.firebase.google.com> → projeto **concurseiro-blindado**.
2. **Build → Authentication → Método de login → E-mail/senha → Ativar → Salvar.** (Deixe desligado o "link de e-mail".)
3. Opcional: em **Modelos**, ponha os e-mails de verificação e de redefinição de senha em **Português (Brasil)**.

## Passo 2 — Autorizar o endereço do site

**Authentication → Configurações → Domínios autorizados → Adicionar domínio:** `bcursos2025-dot.github.io` (só o domínio, sem `https://`).

## Passo 3 — Acrescentar as regras (sem apagar as que já existem)

1. **Build → Realtime Database → Regras.** Selecione tudo, copie e **salve num arquivo de texto no seu computador** (é a sua cópia de segurança; o chat e a comunidade já dependem dessas regras).
2. Abra `database.rules.professores.json` deste repositório. Ele contém **seis blocos novos**: `admins`, `professores_pendentes`, `professores_aprovados`, `comentarios`, `curtidas`, `pedidos`.
3. No editor do console, cole **esses seis blocos dentro de `"rules": { ... }`**, junto dos que já existem (cuidado com a vírgula entre os blocos). **Não troque o arquivo todo.**
4. **Publicar.** Se o editor sublinhar algo em vermelho, não publique: confira as vírgulas.

### Teste no Simulador de regras (Rules Playground)
Na mesma tela, botão **Simulador de regras**. Marque **Autenticado** e informe o UID quando indicado. Resultados esperados (nenhum teste grava de verdade):

| Operação | Local | Quem | Esperado |
|---|---|---|---|
| Leitura | `/professores_aprovados` | sem login | permitido |
| Leitura | `/professores_pendentes` | login comum | **negado** |
| Leitura | `/professores_pendentes/uidA` | login `uidA` | permitido |
| Leitura | `/professores_pendentes/uidA` | login `uidB` | **negado** |
| Leitura | `/comentarios` e `/curtidas` | sem login | permitido |
| Leitura | `/pedidos/uidP` | login `uidP` | permitido |
| Leitura | `/pedidos/uidP` | login `uidA` ou sem login | **negado** |
| Gravação | `/professores_aprovados/uidA` | login comum | **negado** |
| Gravação | `/admins/uidA` | qualquer | **negado** (só pelo console) |
| Gravação | `/comentarios/47-001/x` | login de quem **não** está em `professores_aprovados` | **negado** |
| Gravação | `/curtidas/47-001/c1/uidA` com valor `true` | login `uidB` | **negado** |

## Passo 4 — Tornar você administrador

O e-mail **b.cursos2025@gmail.com**, depois de confirmado, já é administrador (as regras do banco conferem esse e-mail; está em `database.rules.professores.json` e em `EMAIL_ADMIN` de `js/norma-dados.js`).

1. Abra `professor.html` e **crie a conta com esse e-mail**. Confirme o e-mail pelo link que o Firebase envia e clique em **Já confirmei**.
2. Deve aparecer o botão **Painel do admin**. Ele abre `admin.html`, onde você aprova ou recusa cadastros. Antes de aprovar, confira nome, número e seccional no [Cadastro Nacional dos Advogados](https://cna.oab.org.br/).

Outros administradores: no console, **Realtime Database → Dados**, crie `admins/<UID da pessoa>` com valor `true`.

## Testar sem tocar no banco real

Em `localhost`, abra qualquer página com `?mock=1` (por exemplo `professor.html?mock=1`): a Norma usa um banco falso guardado no navegador. Em `admin.html?mock=1`, depois de entrar, rode `NormaAdminTeste()` no console para virar admin. `?mock=0` desliga.

## O que ainda não existe

- **Pagamento e taxas** (R$ 10 por contrato, R$ 5 por comentário): precisam de um gateway com repasse (Asaas, Mercado Pago) e de um backend. Hoje a Norma não cobra nada.
- **Avaliação do aluno** com estrelas e comentário sobre o serviço (não influencia o ranking).
- **Comentários de alunos pagos**, **avisos por e-mail** ao professor quando chega pedido, **moderação** (hoje só o admin pode apagar comentário, pelo console).
- **Exclusão da conta pela própria pessoa**: por enquanto é a pedido ao responsável pelo site (a política de privacidade do app já diz isso).
- **Escala:** o ranking lê todos os comentários e curtidas. Aguenta centenas de professores e milhares de curtidas; depois disso vale guardar contadores prontos.

## Login com Apple (código pronto, desligado)

O código de "Entrar com Apple" já está em `js/norma-dados.js` (`entrarApple`) e `js/norma-auth-ui.js`, mas o botão só aparece quando `LOGIN_APPLE = true`. **Sem a conta paga da Apple não funciona**: o Firebase exige um Services ID, Team ID, Key ID e uma chave privada, que só o Apple Developer Program (US$ 99/ano) fornece. Ligar o provedor "Apple" no console, sem essas credenciais, deixa o botão dar erro.

Para ligar quando tiver a conta: crie o Services ID e a chave "Sign in with Apple" no portal da Apple, preencha o provedor Apple no Firebase (Authentication → Método de login → Apple) com esses dados, adicione o domínio `concurseiro-blindado.firebaseapp.com` como domínio e URL de retorno no Services ID, e então troque `LOGIN_APPLE` para `true`.

**Login com Google (ligado, gratuito):** o botão "Continuar com o Google" aparece no diálogo de entrada. Exige o provedor Google ligado em Authentication (já está) e o domínio do site em Domínios autorizados. Se a pessoa já tem conta de e-mail e senha com o mesmo e-mail, o Firebase junta as duas (mesma conta). Recomendação: manter desligado o provedor "Smartphone" (SMS), que o site não usa.
