# Banco de questões da OAB (por exame)

- `indice.json`: lista leve de exames (a página baixa só isto ao abrir). **Gerado**: não edite à mão.
- `<id>.json`: um arquivo por exame ou banco. A página só baixa o exame que a pessoa abrir.
- Para refazer o índice e dividir o banco original: `python tools/dividir_banco_oab.py` (na pasta do site).

## Formato de um arquivo de exame
```json
{
  "id": "exame-xxxviii",
  "titulo": "Exame XXXVIII",
  "tipo": "exame",            // "exame" (prova anterior) ou "original" (questão própria do Norma)
  "ano": 2023,
  "fonte": "FGV",
  "aviso": "",                // texto mostrado no topo da página (obrigatório em questão original)
  "questoes": [
    {
      "id": "XXXVIII-001",    // único no site inteiro
      "disciplina": "Ética Profissional",
      "assunto": "Mandato e procuração",
      "enunciado": "...",
      "alternativas": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "gabarito": "B",
      "comentario": "...",
      "fonte": { "lei": "l8906", "dispositivo": "Art. 5º, § 1º", "trecho": "..." }
    }
  ]
}
```
- `fonte.lei` é o código da lei em `leis/` (o link vira `leis.html#l8906/5`).
- Prova anterior da FGV: o texto das questões é da FGV. Antes de publicar, decida entre (a) linkar o PDF oficial, (b) pedir licença, (c) publicar só gabarito, assunto e comentário próprio. Nada foi copiado da FGV para este banco.
- Questão com `"exame": "XXXVIII"` em `data/oab-questoes.json` vai sozinha para o arquivo desse exame.

## Prova anterior só com gabarito (tipo "exame_gabarito")
O texto das questões da FGV **não** é copiado para o site. Cada questão guarda só número, disciplina, assunto, gabarito, página do PDF e o seu comentário. A página mostra o botão "Abrir a prova oficial (PDF)" (abre na página da questão), a pessoa marca A-D e vê o gabarito e o comentário. Questão anulada vale acerto.

Como criar um exame:
1. Copie `modelo-exame.csv` e preencha no Excel/Planilhas (uma linha por questão; colunas explicadas no topo de `tools/csv_para_exame.py`).
2. `python tools/csv_para_exame.py planilha.csv --id exame-xxxviii --titulo "Exame XXXVIII" --ano 2023 --pdf-prova https://oab.fgv.br/arq/... --pdf-gabarito https://oab.fgv.br/arq/...`
3. O script confere tudo (gabarito A-D, números repetidos, https) e refaz o `indice.json`. Se algo estiver errado, não grava nada.

Formato do arquivo gerado: `{ id, titulo, tipo:"exame_gabarito", ano, fonte, aviso, pdf_prova, pdf_gabarito, questoes:[{ id, numero, disciplina, assunto, gabarito, anulada?, pagina?, comentario?, fonte?:{lei,dispositivo} }] }`.
Atenção: gabarito PRELIMINAR pode não refletir as anulações finais; prefira o definitivo.

Dica: os links em `origem.txt` (pasta das provas) vêm com http://; troque por https://oab.fgv.br/... (testado: o https responde com o PDF).
