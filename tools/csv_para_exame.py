#!/usr/bin/env python3
"""Transforma a planilha de uma prova anterior (CSV) em data/oab/<id>.json e refaz o índice.

  python tools/csv_para_exame.py planilha.csv --id exame-xxxviii --titulo "Exame XXXVIII" --ano 2023 --pdf-prova https://... --pdf-gabarito https://...

A planilha pode ser salva do Excel/Google Planilhas ("CSV"), com vírgula ou ponto e vírgula. Modelo: data/oab/modelo-exame.csv
Colunas (a primeira linha é o cabeçalho):
  numero        número da questão na prova (1 a 80)
  disciplina    como no seu estudo (ex.: Ética Profissional)
  assunto       tema curto (ex.: Mandato e procuração)
  gabarito      A, B, C ou D (gabarito DEFINITIVO da banca); deixe vazio se a questão foi anulada
  anulada       "sim" se foi anulada pela banca
  pagina        página do PDF da prova onde está a questão (opcional; abre o PDF nela)
  comentario    comentário de PROFESSOR ou ALUNO (nunca texto da banca, de curso ou gerado por IA)
  autor         quem escreveu o comentário (obrigatório quando houver comentário; sem autor ele não aparece no site)
  lei, dispositivo   opcionais: código da lei em leis/ (ex.: l8906) e o dispositivo (ex.: Art. 5º, § 1º)

Nada aqui copia enunciado nem alternativas da FGV: a pessoa abre o PDF oficial e marca A-D no site.
"""
import argparse
import csv
import io
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, 'data', 'oab')


def principal():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv')
    ap.add_argument('--id', required=True, help='ex.: exame-xxxviii (letras minúsculas, números e hífen)')
    ap.add_argument('--titulo', required=True)
    ap.add_argument('--ano', type=int)
    ap.add_argument('--fonte', default='FGV')
    ap.add_argument('--ordem', type=int, help='número do exame, para ordenar a lista (47 vem antes de 46)')
    ap.add_argument('--pdf-prova', default='')
    ap.add_argument('--pdf-gabarito', default='')
    ap.add_argument('--saida', default=PASTA, help='pasta de saída (padrão: data/oab)')
    a = ap.parse_args()

    if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', a.id):
        sys.exit('--id inválido: use só letras minúsculas, números e hífen (ex.: exame-xxxviii).')
    for u in (a.pdf_prova, a.pdf_gabarito):
        if u and not u.startswith('https://'):
            sys.exit('Os endereços dos PDFs precisam começar com https://')

    with open(a.csv, encoding='utf-8-sig', newline='') as f:
        texto = f.read()
    try:
        dialeto = csv.Sniffer().sniff(texto.split('\n', 1)[0], delimiters=',;\t')
    except csv.Error:
        dialeto = csv.excel
    linhas = list(csv.DictReader(io.StringIO(texto), dialect=dialeto))
    if not linhas:
        sys.exit('A planilha está vazia.')
    prefixo = a.id.replace('exame-', '').upper()
    questoes, vistos, problemas = [], set(), 0
    for i, l in enumerate(linhas, start=2):
        l = {(k or '').strip().lower(): (v or '').strip() for k, v in l.items()}
        n = l.get('numero', '')
        if not n.isdigit() or n in vistos:
            print('Linha %d: número "%s" inválido ou repetido.' % (i, n)); problemas += 1; continue
        vistos.add(n)
        anulada = l.get('anulada', '').lower() in ('sim', 's', '1', 'true', 'x')
        gab = l.get('gabarito', '').upper()
        if not anulada and gab not in ('A', 'B', 'C', 'D'):
            print('Linha %d (questão %s): gabarito "%s" inválido.' % (i, n, gab)); problemas += 1; continue
        if not l.get('disciplina'):
            print('Linha %d (questão %s): falta a disciplina.' % (i, n)); problemas += 1; continue
        q = {'id': '%s-%03d' % (prefixo, int(n)), 'numero': int(n), 'disciplina': l['disciplina'], 'assunto': l.get('assunto', ''),
             'gabarito': '' if anulada else gab}
        if anulada:
            q['anulada'] = True
        if l.get('pagina', '').isdigit():
            q['pagina'] = int(l['pagina'])
        if l.get('comentario'):
            if l.get('autor'):
                q['comentario'] = l['comentario']; q['comentario_por'] = l['autor']
            else:
                print('Aviso: questão %s tem comentário sem autor; ele não será gravado.' % n)
        if l.get('lei'):
            q['fonte'] = {'lei': l['lei'], 'dispositivo': l.get('dispositivo', '')}
        questoes.append(q)
    if problemas:
        sys.exit('%d linha(s) com problema; nada foi gravado. Corrija a planilha e rode de novo.' % problemas)

    questoes.sort(key=lambda q: q['numero'])
    sem_com = sum(1 for q in questoes if not q.get('comentario'))
    obj = {'id': a.id, 'titulo': a.titulo, 'tipo': 'exame_gabarito', 'ano': a.ano, 'ordem': a.ordem, 'fonte': a.fonte,
           'aviso': 'O texto das questões é da %s: abra a prova oficial pelo botão e marque aqui a sua resposta. '
                    'Gabarito conforme o gabarito definitivo divulgado pela banca; assuntos são do Norma. Comentários só aparecem quando escritos por professores ou alunos, com o nome do autor.' % a.fonte,
           'pdf_prova': a.pdf_prova, 'pdf_gabarito': a.pdf_gabarito, 'questoes': questoes}
    os.makedirs(a.saida, exist_ok=True)
    destino = os.path.join(a.saida, a.id + '.json')
    with open(destino, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print('Gravado %s com %d questões (%d sem comentário).' % (destino, len(questoes), sem_com))
    if len(questoes) != 80:
        print('Aviso: a prova da 1ª fase tem 80 questões; esta planilha tem %d.' % len(questoes))
    if os.path.abspath(a.saida) == os.path.abspath(PASTA):
        sys.exit(subprocess.call([sys.executable, os.path.join(RAIZ, 'tools', 'dividir_banco_oab.py')]))


if __name__ == '__main__':
    principal()
