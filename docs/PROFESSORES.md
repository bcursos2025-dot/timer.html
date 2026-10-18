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

1. Abra `professor.html` e **crie a sua conta** (e-mail e senha). Confirme o e-mail.
2. No console: **Authentication → Usuários**, copie o **UID** da sua conta.
3. **Realtime Database → Dados**, passe o mouse na raiz, **+**, nome `admins`, e dentro dele **+** com o nome igual ao seu UID e valor `true` (booleano).
4. Entre em `admin.html`: você vê os cadastros pendentes. Antes de aprovar, confira nome, número e seccional no [Cadastro Nacional dos Advogados](https://cna.oab.org.br/).

## Testar sem tocar no banco real

Em `localhost`, abra qualquer página com `?mock=1` (por exemplo `professor.html?mock=1`): a Norma usa um banco falso guardado no navegador. Em `admin.html?mock=1`, depois de entrar, rode `NormaAdminTeste()` no console para virar admin. `?mock=0` desliga.

## O que ainda não existe

- **Pagamento e taxas** (R$ 10 por contrato, R$ 5 por comentário): precisam de um gateway com repasse (Asaas, Mercado Pago) e de um backend. Hoje a Norma não cobra nada.
- **Avaliação do aluno** com estrelas e comentário sobre o serviço (não influencia o ranking).
- **Comentários de alunos pagos**, **avisos por e-mail** ao professor quando chega pedido, **moderação** (hoje só o admin pode apagar comentário, pelo console).
- **Exclusão da conta pela própria pessoa**: por enquanto é a pedido ao responsável pelo site (a política de privacidade do app já diz isso).
- **Escala:** o ranking lê todos os comentários e curtidas. Aguenta centenas de professores e milhares de curtidas; depois disso vale guardar contadores prontos.
