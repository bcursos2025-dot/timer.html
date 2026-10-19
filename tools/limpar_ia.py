#!/usr/bin/env python3
"""Detecta e limpa sinais de escrita de IA em texto (pt-BR e inglês).

Uso:
  python3 tools/limpar_ia.py arquivo.txt --relatorio
  python3 tools/limpar_ia.py arquivo.txt --saida limpo.txt [--sem-markdown] [--sem-emoji] [--agressivo]
  cat texto.txt | python3 tools/limpar_ia.py -

A limpeza mecânica tira caracteres invisíveis, resíduos de interface (utm_source=chatgpt,
oaicite, turn0search), aspas curvas e travessões. Não remove marca d'água estatística
(ex.: SynthID-Text): ela está na escolha das palavras. O relatório lista o que exige
reescrita humana. Catálogo: docs/escrita-ia/CATALOGO.md
"""
import argparse
import re
import sys
import unicodedata

INVISIVEIS = {
    "​": "", "‌": "", "‍": "", "⁠": "", "﻿": "",
    "­": "", "‎": "", "‏": "", "‪": "", "‫": "",
    "‬": "", "‭": "", "‮": "", "⁦": "", "⁧": "",
    "⁨": "", "⁩": "",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    " ": " ", " ": " ", "　": " ",
}

RESIDUOS = [
    r"[?&]utm_source=(?:chatgpt\.com|openai|claude\.ai|copilot)[^\s)\]]*",
    r":contentReference\[[^\]]*\](?:\{[^}]*\})?",
    r"[^]*",
    r"\bturn\d+(?:search|view|news|image|file)\d+\b",
    r"【\d+[^】]*】",
]

ASPAS = {"“": '"', "”": '"', "„": '"', "‘": "'", "’": "'", "‚": "'"}

# Muletas de abertura/fecho removidas só com --agressivo (frase inteira).
MULETAS = [
    r"^\s*(?:ótima|excelente|boa) (?:pergunta|observação)[!.]?\s*",
    r"^\s*(?:claro|com certeza|certamente|absolutamente)[!,.]\s*",
    r"^\s*(?:great|good|excellent) (?:question|point)[!.]?\s*",
    r"^\s*(?:certainly|sure|absolutely|of course)[!,.]\s*",
    r"\s*espero (?:que isso|ter) ajudad[oa]s?[!.]?\s*$",
    r"\s*se (?:precisar|tiver) (?:de )?(?:mais )?(?:alguma coisa|dúvidas?|ajuda)[^.!?]*[.!?]\s*$",
    r"\s*(?:i )?hope this helps[!.]?\s*$",
    r"\s*let me know if you (?:need|have|want)[^.!?]*[.!?]\s*$",
    r"\s*gostaria que eu[^?]*\?\s*$",
]

# Sinais para o relatório: (categoria, regex, dica)
SINAIS = [
    ("Paralelismo negativo", r"\b(?:n[ãa]o (?:é|foi|são|era|se trata) (?:apenas |s[óo] |somente |simplesmente )?[^.;:!?]{1,80}?,\s*(?:mas|e sim|é|foi|são)|n[ãa]o (?:apenas|s[óo]|somente)[^.;:!?]{1,80}?mas (?:também|tamb[ée]m)|not (?:just|only|merely) [^.;:!?]{1,80}?(?:,|;)?\s*(?:but|it'?s|it is)|it'?s not [^.;:!?]{1,60}?,? it'?s)", "Diga o que a coisa é, sem o contraste montado."),
    ("Travessão", r"[—–]", "Troque por vírgula, ponto, dois-pontos ou parênteses."),
    ("Abertura/transição de chatbot", r"\b(?:no mundo (?:acelerado|digital|atual) de hoje|na era digital|em um (?:cenário|mundo) cada vez mais|é importante (?:notar|destacar|ressaltar|lembrar) que|vale (?:a pena )?(?:ressaltar|destacar|notar|lembrar) que|cabe (?:destacar|ressaltar|notar)|dito isso|nesse (?:sentido|contexto)|quando se trata de|vamos (?:mergulhar|explorar|embarcar|desvendar)|it'?s (?:important|worth) (?:to note|noting) that|in today'?s (?:fast-paced|digital)[^.]{0,30}|when it comes to|let'?s (?:dive|delve) (?:in|into)|in the (?:ever-evolving|realm of))\b", "Corte; comece pela informação."),
    ("Fecho/resumo de esboço", r"\b(?:em (?:resumo|suma|conclusão|última análise)|no geral|em síntese|para concluir|in (?:summary|conclusion)|overall|to sum up|ultimately)\b", "Corte o fecho que repete o que já foi dito."),
    ("Bajulação / voz de assistente", r"\b(?:ótima pergunta|excelente (?:pergunta|observação)|você tem toda a razão|como (?:um )?(?:modelo de linguagem|assistente)|great question|you'?re absolutely right|as an ai)\b", "Remova."),
    ("Vocabulário inflado", r"\b(?:crucial|cruciais|fundamental|fundamentais|pivotal|robust[oa]s?|multifacetad[oa]s?|intricad[oa]s?|panorama|tape[çc]aria|testemunho de|alavanc(?:ar|ando|a)|impuls(?:ionar|ionando)|potencializ(?:ar|ando)|holístic[oa]s?|sinergia|jornada|desbloquear|mergulhar|navegar (?:por|pelos|pelas)|inegável|inestimável|revolucionári[oa]s?|de ponta|delve|tapestry|testament|landscape|realm|leverag(?:e|ing)|seamless(?:ly)?|groundbreaking|game-?changer|cutting-edge|unlock|elevate|showcase|underscore|foster(?:ing)?|vibrant|nuanced|multifaceted)\b", "Troque por palavra simples e específica."),
    ("Gerúndio interpretativo no fim da frase", r",\s*(?:destacando|ressaltando|evidenciando|sublinhando|refletindo|demonstrando|garantindo|contribuindo|reforçando|consolidando|highlighting|underscoring|emphasizing|reflecting|ensuring|contributing|showcasing|demonstrating)\b[^.]{0,80}[.]", "Delete a oração; se o fato basta, deixe só o fato."),
    ("Atribuição vaga", r"\b(?:especialistas (?:dizem|apontam|afirmam)|estudos (?:mostram|indicam|apontam)|muitos (?:acreditam|especialistas)|é amplamente (?:considerad[oa]|reconhecid[oa])|segundo observadores|experts (?:say|believe)|studies (?:show|suggest)|widely (?:regarded|considered))\b", "Cite a fonte concreta ou corte."),
    ("Ênfase de importância/legado", r"\b(?:desempenha (?:um )?papel (?:crucial|fundamental|vital|essencial|importante)|momento (?:decisivo|crucial|marcante)|legado duradouro|marco (?:importante|histórico)|plays? a (?:crucial|vital|key|pivotal) role|lasting legacy|marks? a (?:pivotal|significant) moment)\b", "Mostre o fato; deixe o leitor concluir a importância."),
    ("Falsa dramaticidade", r"\b(?:aqui está o (?:ponto|segredo|truque)|a verdade é que|e é aí que|spoiler:|here'?s the (?:kicker|thing|catch)|the truth is)\b", "Diga a coisa direto."),
    ("Pergunta retórica respondida", r"[?]\s+(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^.!?]{0,40}[.!])", "Afirme direto."),
    ("Frases de efeito curtas em sequência", r"(?:\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\w+\.\s+){3,}", "Una em frase normal."),
    ("Tríade (a, b e c)", r"\b[\wÀ-ÿ-]+, [\wÀ-ÿ-]+(?:,)? (?:e|ou|and|or) [\wÀ-ÿ-]+\b", "Confirme se são mesmo três; senão reduza."),
    ("Negrito + dois-pontos em item", r"^\s*(?:[-*•]|\d+[.)])\s+\*\*[^*\n]+:?\*\*:?", "Escreva em prosa ou tire o negrito."),
    ("Marcador de lista / título markdown", r"^\s*(?:#{1,6}\s|[-*•]\s)", "Use prosa em resposta curta."),
    ("Emoji decorativo", r"[\U0001F300-\U0001FAFF☀-➿⭐✅❌]", "Remova."),
    ("Aspas curvas", r"[“”‘’]", "Padronize."),
]

RE_MD_NEGRITO = re.compile(r"(\*\*|__)(.+?)\1", re.S)
RE_MD_ITALICO = re.compile(r"(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])")
RE_MD_TITULO = re.compile(r"^\s{0,3}#{1,6}\s+", re.M)
RE_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐✅❌️]")


def contar_invisiveis(t):
    return {f"U+{ord(c):04X} ({unicodedata.name(c, '?')})": t.count(c) for c in INVISIVEIS if c in t}


def limpar(texto, sem_markdown=False, sem_emoji=False, agressivo=False):
    for c, r in INVISIVEIS.items():
        texto = texto.replace(c, r)
    for padrao in RESIDUOS:
        texto = re.sub(padrao, "", texto)
    for c, r in ASPAS.items():
        texto = texto.replace(c, r)
    # travessão cercado de espaço vira vírgula; entre números/palavras vira hífen
    texto = re.sub(r"\s+[—–]\s+", ", ", texto)
    texto = re.sub(r"(?<=\S)[—–](?=\S)", "-", texto)
    if sem_markdown:
        texto = RE_MD_TITULO.sub("", texto)
        texto = RE_MD_NEGRITO.sub(r"\2", texto)
        texto = RE_MD_ITALICO.sub(r"\1", texto)
        texto = re.sub(r"^\s*[-*•]\s+", "", texto, flags=re.M)
    if sem_emoji:
        texto = RE_EMOJI.sub("", texto)
    if agressivo:
        for padrao in MULETAS:
            texto = re.sub(padrao, "", texto, flags=re.I)
        texto = re.sub(r"\b(?:é importante (?:notar|destacar|ressaltar) que|vale (?:a pena )?(?:ressaltar|destacar|notar) que|cabe (?:destacar|ressaltar|notar) que|it'?s important to note that)\s*", "", texto, flags=re.I)
        texto = re.sub(r"\b(?:em (?:resumo|suma|conclusão|síntese)|no geral|in (?:summary|conclusion)|overall),\s*", "", texto, flags=re.I)
        texto = re.sub(r"(^|[.!?]\s+)(?!\w*://)([a-zà-ÿ])", lambda m: m.group(1) + m.group(2).upper(), texto)
        texto = re.sub(r"(?:\n|^)\s*(?:em (?:resumo|suma|conclusão|síntese)|in (?:summary|conclusion))[.,]?\s*$", "", texto, flags=re.I)
    texto = re.sub(r"[ \t]+\n", "\n", texto)
    texto = re.sub(r" {2,}", " ", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip() + "\n"


def relatorio(texto):
    palavras = max(len(re.findall(r"\w+", texto)), 1)
    linhas, total = [], 0
    inv = contar_invisiveis(texto)
    if inv:
        total += sum(inv.values())
        linhas.append("Caracteres invisíveis (limpeza automática resolve):")
        linhas += [f"  {k}: {v}" for k, v in inv.items()]
    for padrao in RESIDUOS:
        n = len(re.findall(padrao, texto))
        if n:
            total += n
            linhas.append(f"Resíduo de interface de chat: {n}x (limpeza automática resolve)")
    for nome, padrao, dica in SINAIS:
        ocorr = list(re.finditer(padrao, texto, re.M | re.I if nome not in ("Pergunta retórica respondida", "Frases de efeito curtas em sequência", "Gerúndio interpretativo no fim da frase") else re.M))
        if not ocorr:
            continue
        total += len(ocorr)
        linhas.append(f"{nome}: {len(ocorr)}x. {dica}")
        for m in ocorr[:3]:
            ini = max(m.start() - 25, 0)
            trecho = texto[ini:m.end() + 25].replace("\n", " ")
            linhas.append(f"    …{trecho}…")
    dens = total / palavras * 1000
    veredito = "baixa" if dens < 8 else "média" if dens < 20 else "alta"
    cab = f"{palavras} palavras, {total} sinais ({dens:.1f} por 1000). Densidade de marcas de IA: {veredito}.\n(Heurística: um sinal isolado não prova nada; o que conta é o conjunto.)\n"
    return cab + "\n".join(linhas) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada", help="arquivo de texto, ou - para ler da entrada padrão")
    ap.add_argument("--saida", help="grava o texto limpo neste arquivo (padrão: imprime)")
    ap.add_argument("--relatorio", action="store_true", help="só mostra o relatório de sinais, sem limpar")
    ap.add_argument("--sem-markdown", action="store_true", help="remove títulos, negrito, itálico e marcadores")
    ap.add_argument("--sem-emoji", action="store_true", help="remove emojis")
    ap.add_argument("--agressivo", action="store_true", help="remove muletas de abertura/fecho")
    a = ap.parse_args()

    texto = sys.stdin.read() if a.entrada == "-" else open(a.entrada, encoding="utf-8").read()

    if a.relatorio:
        sys.stdout.write(relatorio(texto))
        return
    limpo = limpar(texto, a.sem_markdown, a.sem_emoji, a.agressivo)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(limpo)
        sys.stderr.write(relatorio(limpo))
    else:
        sys.stdout.write(limpo)


if __name__ == "__main__":
    main()
