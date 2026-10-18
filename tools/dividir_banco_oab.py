#!/usr/bin/env python3
"""Divide o banco de questões da OAB em um JSON por exame e refaz o índice.

  python tools/dividir_banco_oab.py

Entrada 1: data/oab-questoes.json (banco original, validado por tools/validar_questoes.py).
           Questão sem o campo "exame" vai para o banco "norma-<disciplina>"; com "exame" (ex.: "XXXVIII"), para esse exame.
Entrada 2: qualquer data/oab/<id>.json que você colocar à mão (por exemplo uma prova anterior que você digitou ou licenciou).
Saída:     data/oab/<id>.json  (um por exame/banco)  e  data/oab/indice.json (leve; a página só baixa o exame aberto).

Formato de cada arquivo de exame (ver data/oab/LEIA-ME.md):
  { "id", "titulo", "tipo": "original" | "exame" | "exame_gabarito", "ano", "fonte", "aviso", "pdf_prova", "pdf_gabarito", "questoes": [ ... ] }
  "exame_gabarito" = prova anterior só com número, disciplina, assunto, gabarito e comentário próprio (sem copiar o texto da banca).
"""
import json
import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEM = os.path.join(RAIZ, 'data', 'oab-questoes.json')
PASTA = os.path.join(RAIZ, 'data', 'oab')

AVISO_ORIGINAL = ('Questões originais do Norma, redigidas com apoio de IA e conferidas contra o texto da lei '
                  '(o trecho citado existe no dispositivo). Não foram revisadas por advogado: confira o gabarito na lei.')


def slug(texto):
    t = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode('ascii').lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def gravar(caminho, obj):
    with open(caminho, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def ler(caminho):
    with open(caminho, encoding='utf-8') as f:
        return json.load(f)


def valida_questao(q, tipo='original'):
    """Devolve texto de erro ou None. Gabarito tem de existir entre as alternativas (ou entre A-D nas questões só com gabarito)."""
    if tipo == 'exame_gabarito':
        for campo in ('id', 'disciplina'):
            if campo not in q:
                return 'falta "%s"' % campo
        if q.get('anulada'):
            return None
        if q.get('gabarito') not in ('A', 'B', 'C', 'D'):
            return 'gabarito "%s" inválido (use A, B, C ou D; questão anulada: "anulada": true)' % q.get('gabarito')
        return None
    for campo in ('id', 'disciplina', 'enunciado', 'alternativas', 'gabarito'):
        if campo not in q:
            return 'falta "%s"' % campo
    alts = q['alternativas']
    if not isinstance(alts, dict) or len(alts) < 2:
        return 'alternativas inválidas'
    if q['gabarito'] not in alts and not q.get('anulada'):
        return 'gabarito "%s" não está nas alternativas' % q['gabarito']
    return None


def main():
    os.makedirs(PASTA, exist_ok=True)
    gerados = set()

    if os.path.exists(ORIGEM):
        banco = ler(ORIGEM)
        grupos = {}
        for q in banco.get('questoes', []):
            chave = ('exame-' + slug(q['exame'])) if q.get('exame') else ('norma-' + slug(q['disciplina']))
            grupos.setdefault(chave, []).append(q)
        for id_, qs in grupos.items():
            ehExame = id_.startswith('exame-')
            disc = qs[0]['disciplina']
            gravar(os.path.join(PASTA, id_ + '.json'), {
                'id': id_,
                'titulo': ('Exame ' + qs[0]['exame']) if ehExame else ('Banco Norma — ' + disc),
                'tipo': 'exame' if ehExame else 'original',
                'ano': qs[0].get('ano'),
                'fonte': qs[0].get('banca', 'Norma') if ehExame else 'Norma',
                'aviso': '' if ehExame else AVISO_ORIGINAL,
                'conferido_em': banco.get('conferido_em'),
                'questoes': qs,
            })
            gerados.add(id_ + '.json')

    # índice: lê todos os arquivos de exame da pasta (gerados agora ou colocados à mão)
    exames, erros = [], 0
    for nome in sorted(os.listdir(PASTA)):
        if not nome.endswith('.json') or nome == 'indice.json':
            continue
        d = ler(os.path.join(PASTA, nome))
        tipo = d.get('tipo', 'original')
        ids = set()
        for k in ('pdf_prova', 'pdf_gabarito'):
            if d.get(k) and not str(d[k]).startswith('https://'):
                erros += 1
                print('ERRO em %s: %s precisa começar com https://' % (nome, k))
        for q in d.get('questoes', []):
            if q.get('id') in ids:
                erros += 1
                print('ERRO em %s / %s: id repetido' % (nome, q.get('id')))
            ids.add(q.get('id'))
            e = valida_questao(q, tipo)
            if e:
                erros += 1
                print('ERRO em %s / %s: %s' % (nome, q.get('id', '?'), e))
        qs = d.get('questoes', [])
        contagem = {}
        for q in qs:
            contagem[q['disciplina']] = contagem.get(q['disciplina'], 0) + 1
        exames.append({
            'id': d.get('id', nome[:-5]), 'arquivo': nome, 'titulo': d.get('titulo', nome[:-5]),
            'tipo': tipo, 'ano': d.get('ano'), 'ordem': d.get('ordem'), 'fonte': d.get('fonte', ''),
            'total': len(qs), 'disciplinas': contagem,
            'kb': round(os.path.getsize(os.path.join(PASTA, nome)) / 1024),
        })
    exames.sort(key=lambda e: (e['tipo'] == 'original', -(e.get('ordem') or 0), -(e['ano'] or 0), e['titulo']))
    gravar(os.path.join(PASTA, 'indice.json'), {'versao': 1, 'total': sum(e['total'] for e in exames), 'exames': exames})
    print('%d arquivo(s) de exame, %d questões no índice, %d erro(s).' % (len(exames), sum(e['total'] for e in exames), erros))
    return 1 if erros else 0


if __name__ == '__main__':
    sys.exit(main())
