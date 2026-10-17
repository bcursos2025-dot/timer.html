#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Conferência automática do banco de questões da OAB (1ª fase).

Lê data/oab-questoes.json e leis/*.json e confirma, para cada questão, que o campo
fonte.trecho aparece LITERALMENTE (ignorando maiúsculas, acentos e espaços repetidos)
dentro do dispositivo citado em fonte.dispositivo (ex.: "Art. 7º, XVI", "Art. 5º, § 2º",
"Art. 3º-A, parágrafo único", "Art. 7º, § 3º, II, a"). Só então grava verificado:true.
Questão que falhar fica com verificado:false e o motivo é listado. Código de saída 1 se
alguma falhar, 0 se todas passarem.

O QUE A CONFERÊNCIA GARANTE: o trecho citado existe no dispositivo citado, no texto de lei
baixado do Planalto (leis/*.json), e a questão tem a estrutura esperada.
O QUE ELA NÃO GARANTE: que o gabarito e o comentário estejam corretos. Isso depende de revisão
humana. Por isso o site mostra as questões como "conferidas com o texto da lei", não como
"revisadas por advogado".

Também rejeita dispositivos anotados no texto da lei com controle de constitucionalidade
(ADI/ADPF/ADC), revogação, "Vigência" ou suspensão, para evitar perguntas que dependam de
jurisprudência ou de alteração recente.

Uso:
    python tools/validar_questoes.py              confere e grava verificado:true/false
    python tools/validar_questoes.py --sem-gravar só confere (não altera o arquivo)
    python tools/validar_questoes.py -v           mostra também as questões aprovadas
"""
import argparse
import collections
import datetime
import json
import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ_QUESTOES = os.path.join(RAIZ, 'data', 'oab-questoes.json')
DIR_LEIS = os.path.join(RAIZ, 'leis')

# mesmos nomes de disciplina que o Painel (js/desempenho.js) agrupa
DISCIPLINAS = [
    'Ética Profissional', 'Direito Constitucional', 'Direito Civil', 'Direito Processual Civil',
    'Direito Penal', 'Direito Processual Penal', 'Direito do Trabalho', 'Direito do Consumidor',
    'ECA', 'Direito Tributário',
]
MIN_QUESTOES_POR_DISCIPLINA = 12

# notas do Planalto que indicam jurisprudência / revogação / vigência: dispositivo evitado
RE_NOTA_PROIBIDA = re.compile(
    r'\b(ADI|ADIN|ADPF|ADC|ADO)\b|revogad|vig[eê]ncia|produ[cç][aã]o de efeito|suspens|'
    r'inconstitucional|s[uú]mula|\(vetado\)|execu[cç][aã]o suspensa', re.I)

_TRAD = str.maketrans({
    'º': 'o', '°': 'o', 'ª': 'a', '–': '-', '—': '-', '−': '-', '‑': '-', '‒': '-',
    '“': '"', '”': '"', '«': '"', '»': '"', '‘': "'", '’': "'", ' ': ' ',
})


def norm(s):
    """minúsculas, sem acentos, travessões/aspas unificados, espaços colapsados."""
    s = unicodedata.normalize('NFD', str(s).translate(_TRAD))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', s.casefold()).strip()


RE_ART = re.compile(r'^Art(?:\.|igo)\s*(\d+(?:\.\d+)?)\s*[ºo°]?\s*(?:-\s*([A-Z]{1,2}))?(?![A-Za-z0-9])', re.I)
RE_PAR = re.compile(r'^§\s*(\d+)\s*[ºo°]?\s*(?:-\s*([A-Z]))?', re.I)
RE_PAR_UNICO = re.compile(r'^Par[aá]grafo\s+[uú]nico', re.I)
RE_INC = re.compile(r'^([IVXLCDM]+)\s*(?:-\s*([A-Z]))?\s*[-–—−.)]', re.U)
RE_ALI = re.compile(r'^([a-z])\s*\)')


def chave_artigo(texto):
    m = RE_ART.match(texto)
    if not m:
        return None
    return m.group(1) + ('-' + m.group(2).upper() if m.group(2) else '')


def chave_par(texto):
    if RE_PAR_UNICO.match(texto):
        return '§u'
    m = RE_PAR.match(texto)
    if m:
        return '§' + m.group(1) + ('-' + m.group(2).upper() if m.group(2) else '')
    return None


def chave_inc(texto):
    m = RE_INC.match(texto)
    if m:
        return m.group(1) + ('-' + m.group(2).upper() if m.group(2) else '')
    return None


def chave_ali(texto):
    m = RE_ALI.match(texto)
    return m.group(1) if m else None


def interpretar_dispositivo(s):
    """'Art. 7º, § 2º, II, a' -> ('7', {'par': '§2', 'inc': 'II', 'ali': 'a', 'caput': False}) ou (None, erro)."""
    s = (s or '').strip()
    m = RE_ART.match(s)
    if not m:
        return None, 'dispositivo deve começar por "Art. N" (ex.: "Art. 7º, XVI")'
    num = m.group(1) + ('-' + m.group(2).upper() if m.group(2) else '')
    resto = s[m.end():]
    alvo = {'par': None, 'inc': None, 'ali': None, 'caput': False}
    for tok in [t.strip() for t in re.split(r'[,;]', resto) if t.strip()]:
        tn = norm(tok)
        if tn == 'caput':
            alvo['caput'] = True
        elif tn.startswith('§') or tn.startswith('paragrafo'):
            k = '§u' if tn.startswith('paragrafo') else chave_par(tok)
            if not k:
                return None, 'parágrafo não reconhecido em "%s"' % tok
            alvo['par'] = k
        elif re.fullmatch(r'inciso\s+[IVXLCDM]+(?:-[A-Z])?', tok, re.I) or re.fullmatch(r'[IVXLCDM]+(?:-[A-Z])?', tok):
            alvo['inc'] = re.sub(r'(?i)^inciso\s+', '', tok).upper()
        elif re.fullmatch(r'(?:al[ií]nea\s+)?([a-z])\)?', tok):
            alvo['ali'] = re.fullmatch(r'(?:al[ií]nea\s+)?([a-z])\)?', tok).group(1)
        else:
            return None, 'parte do dispositivo não reconhecida: "%s"' % tok
    if alvo['caput'] and (alvo['par'] or alvo['inc'] or alvo['ali']):
        return None, '"caput" não combina com parágrafo/inciso/alínea'
    if alvo['ali'] and not alvo['inc']:
        return None, 'alínea exige o inciso (ex.: "Art. 7º, VI, a")'
    return (num, alvo), None


def blocos_do_dispositivo(doc, num, alvo):
    """devolve (lista de (índice, bloco), erro). Usa a PRIMEIRA ocorrência do artigo,
    a mesma que o link leis.html#lei/N abre."""
    B = doc['blocos']
    ini = next((i for i, b in enumerate(B) if b[0] == 'art' and chave_artigo(b[1]) == num), None)
    if ini is None:
        return None, 'artigo %s não encontrado em %s' % (num, doc['id'])
    fim = ini + 1
    while fim < len(B) and B[fim][0] not in ('art', 'tit'):
        fim += 1
    caminhos = {}
    par = inc = ali = None
    for k in range(ini, fim):
        tipo, texto = B[k][0], B[k][1]
        if tipo == 'art':
            caminhos[k] = (None, None, None)
        elif tipo == 'par':
            par, inc, ali = chave_par(texto) or ('?%d' % k), None, None
            caminhos[k] = (par, None, None)
        elif tipo == 'inc':
            inc, ali = chave_inc(texto) or ('?%d' % k), None
            caminhos[k] = (par, inc, None)
        elif tipo == 'ali':
            ali = chave_ali(texto) or ('?%d' % k)
            caminhos[k] = (par, inc, ali)
        else:  # txt
            caminhos[k] = (par, inc, ali)
    if alvo['caput']:
        return [(ini, B[ini])], None
    if not (alvo['par'] or alvo['inc'] or alvo['ali']):
        return [(k, B[k]) for k in range(ini, fim)], None
    sel = []
    for k in range(ini, fim):
        p, i, a = caminhos[k]
        if p != alvo['par']:
            continue
        if alvo['inc'] and i != alvo['inc']:
            continue
        if alvo['ali'] and a != alvo['ali']:
            continue
        if k == ini:
            continue
        sel.append((k, B[k]))
    if not sel:
        return None, 'dispositivo "%s" não existe no artigo %s' % (
            ', '.join(x for x in (alvo['par'], alvo['inc'], alvo['ali']) if x), num)
    return sel, None


def carregar_lei(id_lei, cache):
    if id_lei in cache:
        return cache[id_lei]
    caminho = os.path.join(DIR_LEIS, id_lei + '.json')
    if not re.fullmatch(r'[a-z0-9_-]+', id_lei or '') or not os.path.isfile(caminho):
        cache[id_lei] = None
        return None
    with open(caminho, encoding='utf-8') as f:
        doc = json.load(f)
    cache[id_lei] = doc
    return doc


def conferir(q, cache, vistos_id, vistos_enun):
    """lista de problemas (vazia = aprovada)."""
    erros = []
    if not isinstance(q, dict):
        return ['questão não é um objeto']
    qid = q.get('id')
    if not isinstance(qid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{3,40}', qid):
        erros.append('id ausente ou inválido')
    elif qid in vistos_id:
        erros.append('id repetido')
    else:
        vistos_id.add(qid)
    if q.get('disciplina') not in DISCIPLINAS:
        erros.append('disciplina fora da lista: %r' % q.get('disciplina'))
    ass = q.get('assunto')
    if not isinstance(ass, str) or not (3 <= len(ass.strip()) <= 60):
        erros.append('assunto ausente ou com mais de 60 caracteres')
    enun = q.get('enunciado')
    if not isinstance(enun, str) or len(enun.strip()) < 40:
        erros.append('enunciado ausente ou curto demais')
    else:
        ne = norm(enun)
        if ne in vistos_enun:
            erros.append('enunciado repetido (%s)' % vistos_enun[ne])
        else:
            vistos_enun[ne] = qid
    alts = q.get('alternativas')
    if not isinstance(alts, dict) or sorted(alts.keys()) != ['A', 'B', 'C', 'D']:
        erros.append('alternativas devem ser exatamente A, B, C e D')
    else:
        textos = [norm(alts[k]) if isinstance(alts[k], str) else '' for k in 'ABCD']
        if any(len(t) < 3 for t in textos):
            erros.append('alternativa vazia')
        if len(set(textos)) < 4:
            erros.append('alternativas repetidas')
        if any(re.search(r'\b(todas as anteriores|nenhuma das anteriores|todas as alternativas|ambas as)\b', t) for t in textos):
            erros.append('alternativa do tipo "todas/nenhuma das anteriores" (as letras são embaralhadas)')
    if q.get('gabarito') not in ('A', 'B', 'C', 'D'):
        erros.append('gabarito deve ser A, B, C ou D')
    com = q.get('comentario')
    if not isinstance(com, str) or len(com.strip()) < 30:
        erros.append('comentário ausente ou curto demais')
    elif re.search(r'alternativa\s+[A-D]\b|\(\s*[A-D]\s*\)|\bletra\s+[A-D]\b', com, re.I):
        erros.append('comentário cita letra de alternativa (deve falar do conteúdo)')

    fonte = q.get('fonte')
    if not isinstance(fonte, dict):
        erros.append('fonte ausente')
        return erros
    id_lei, disp, trecho = fonte.get('lei'), fonte.get('dispositivo'), fonte.get('trecho')
    if not isinstance(trecho, str) or not trecho.strip():
        erros.append('fonte.trecho ausente')
        return erros
    doc = carregar_lei(id_lei, cache)
    if doc is None:
        erros.append('lei %r não existe em leis/' % id_lei)
        return erros
    alvo, erro = interpretar_dispositivo(disp)
    if erro:
        erros.append(erro)
        return erros
    blocos, erro = blocos_do_dispositivo(doc, *alvo)
    if erro:
        erros.append(erro)
        return erros
    nt = norm(trecho)
    if len(nt) < 25 or len(nt.split()) < 5:
        erros.append('trecho curto demais (mínimo 25 caracteres e 5 palavras): cite a frase da lei')
    achou = [(k, b) for k, b in blocos if nt in norm(b[1])]
    if not achou:
        erros.append('trecho NÃO aparece literalmente em %s, %s' % (id_lei, disp))
    else:
        k, b = achou[0]
        notas = ' '.join(b[2]) if len(b) > 2 and b[2] else ''
        if RE_NOTA_PROIBIDA.search(notas) or RE_NOTA_PROIBIDA.search(b[1][:20]):
            erros.append('dispositivo anotado no Planalto (%s): evite jurisprudência/revogação/vigência' % notas.strip()[:80])
    return erros


def gravar(caminho, dados):
    cab = [(k, v) for k, v in dados.items() if k != 'questoes']
    partes = ['{\n']
    for k, v in cab:
        partes.append(' %s: %s,\n' % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False)))
    partes.append(' "questoes": [\n')
    partes.append(',\n'.join('  ' + json.dumps(q, ensure_ascii=False) for q in dados['questoes']))
    partes.append('\n ]\n}\n')
    tmp = caminho + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(partes))
    os.replace(tmp, caminho)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='Confere as questões da OAB contra o texto das leis.')
    ap.add_argument('--sem-gravar', action='store_true', help='só confere; não altera o JSON')
    ap.add_argument('-v', '--verboso', action='store_true', help='lista também as questões aprovadas')
    ap.add_argument('--arquivo', default=ARQ_QUESTOES, help='caminho do JSON de questões')
    args = ap.parse_args()

    with open(args.arquivo, encoding='utf-8') as f:
        dados = json.load(f)
    if isinstance(dados, list):
        dados = {'versao': 1, 'questoes': dados}
    questoes = dados.get('questoes')
    if not isinstance(questoes, list) or not questoes:
        print('ERRO: o arquivo não tem a lista "questoes".')
        return 2

    cache, vistos_id, vistos_enun = {}, set(), {}
    falhas = []
    por_disc = collections.Counter()
    por_disc_ok = collections.Counter()
    gab = collections.Counter()
    for q in questoes:
        erros = conferir(q, cache, vistos_id, vistos_enun)
        qid = q.get('id', '?') if isinstance(q, dict) else '?'
        disc = q.get('disciplina', '?') if isinstance(q, dict) else '?'
        por_disc[disc] += 1
        if isinstance(q, dict):
            q['verificado'] = not erros
        if erros:
            falhas.append((qid, erros))
        else:
            por_disc_ok[disc] += 1
            gab[q['gabarito']] += 1
            if args.verboso:
                print('ok   %s  %s' % (qid, q['fonte']['dispositivo']))

    for qid, erros in falhas:
        print('FALHA %s' % qid)
        for e in erros:
            print('      - %s' % e)

    total, ok = len(questoes), len(questoes) - len(falhas)
    leis_usadas = sorted({q['fonte']['lei'] for q in questoes if isinstance(q, dict) and isinstance(q.get('fonte'), dict) and cache.get(q['fonte'].get('lei'))})
    print('\nResumo por disciplina (aprovadas/total):')
    for d in DISCIPLINAS:
        marca = '' if por_disc_ok[d] >= MIN_QUESTOES_POR_DISCIPLINA else '   <- abaixo de %d' % MIN_QUESTOES_POR_DISCIPLINA
        print('  %-26s %3d/%-3d%s' % (d, por_disc_ok[d], por_disc[d], marca))
    print('Gabaritos das aprovadas: ' + ', '.join('%s=%d' % (k, gab[k]) for k in 'ABCD'))
    print('Leis usadas: ' + ', '.join('%s (baixada em %s)' % (i, cache[i].get('baixado_em', '?')) for i in leis_usadas))
    print('\n%d de %d questões conferidas com o texto da lei; %d com falha.' % (ok, total, len(falhas)))

    if not args.sem_gravar:
        dados['conferido_em'] = datetime.date.today().isoformat()
        dados['leis_baixadas_em'] = {i: cache[i].get('baixado_em') for i in leis_usadas}
        dados['total'] = total
        dados['verificadas'] = ok
        gravar(args.arquivo, dados)
        print('Arquivo atualizado: %s' % os.path.relpath(args.arquivo, RAIZ))
    return 1 if falhas else 0


if __name__ == '__main__':
    sys.exit(main())
