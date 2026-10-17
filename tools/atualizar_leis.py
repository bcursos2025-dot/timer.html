#!/usr/bin/env python3
"""Baixa leis do Planalto (texto oficial, domínio público) e converte para JSON que o site lê.

Uso:   python tools/atualizar_leis.py            (todas)
       python tools/atualizar_leis.py l8906 cf88  (só algumas)

Saída: leis/<id>.json e leis/index.json
Trechos RISCADOS no Planalto (revogados ou declarados inconstitucionais) ficam de fora do texto
vigente; as notas entre parênteses ("Redação dada pela...", "Vide...") vão para o campo de notas.
Falha em uma lei não derruba as outras (o JSON antigo dela é mantido).
"""
import datetime, html, json, os, re, sys, time, unicodedata, urllib.request
from html.parser import HTMLParser

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, 'leis')
UA = 'Mozilla/5.0 (compatible; ConcurseiroBlindado-Leis/1.0)'
P = 'https://www.planalto.gov.br/ccivil_03/'

# id, nome curto, identificação da norma, URL oficial
LEIS = [
    ('l8906',  'Estatuto da Advocacia e da OAB', 'Lei nº 8.906/1994',                    P + 'leis/l8906.htm'),
    ('cf88',   'Constituição Federal',           'Constituição da República de 1988',    P + 'constituicao/constituicao.htm'),
    ('cpc',    'Código de Processo Civil',       'Lei nº 13.105/2015',                   P + '_ato2015-2018/2015/lei/l13105.htm'),
    ('cc',     'Código Civil',                   'Lei nº 10.406/2002',                   P + 'leis/2002/l10406compilada.htm'),
    ('cp',     'Código Penal',                   'Decreto-Lei nº 2.848/1940',            P + 'decreto-lei/del2848compilado.htm'),
    ('cpp',    'Código de Processo Penal',       'Decreto-Lei nº 3.689/1941',            P + 'decreto-lei/del3689compilado.htm'),
    ('clt',    'CLT',                            'Decreto-Lei nº 5.452/1943',            P + 'decreto-lei/del5452.htm'),
    ('cdc',    'Código de Defesa do Consumidor', 'Lei nº 8.078/1990',                    P + 'leis/l8078compilado.htm'),
    ('ctn',    'Código Tributário Nacional',     'Lei nº 5.172/1966',                    P + 'leis/l5172compilado.htm'),
    ('eca',    'Estatuto da Criança e do Adolescente', 'Lei nº 8.069/1990',              P + 'leis/l8069.htm'),
    ('l9099',  'Juizados Especiais',             'Lei nº 9.099/1995',                    P + 'leis/l9099.htm'),
    ('l8429',  'Improbidade Administrativa',     'Lei nº 8.429/1992',                    P + 'leis/l8429.htm'),
    ('l9784',  'Processo Administrativo Federal', 'Lei nº 9.784/1999',                   P + 'leis/l9784.htm'),
    ('lindb',  'LINDB',                          'Decreto-Lei nº 4.657/1942',            P + 'decreto-lei/del4657compilado.htm'),
    ('lep',    'Lei de Execução Penal',          'Lei nº 7.210/1984',                    P + 'leis/l7210.htm'),
    ('l12016', 'Mandado de Segurança',           'Lei nº 12.016/2009',                   P + '_ato2007-2010/2009/lei/l12016.htm'),
]

NOTA_RE = re.compile(
    r'\(\s*(?:Reda[cç][aã]o dada|Inclu[ií]d[oa]|Revogad[oa]|Vide|Vig[eê]ncia|Regulamento|Produ[cç][aã]o de efeito|'
    r'Express[aã]o|Vetad[oa]|Renumerad[oa]|Promulga[cç][aã]o|Suprimid[oa]|Reda[cç][aã]o anterior|Mensagem|Declarad|'
    r'Texto|Resolu[cç][aã]o|Veto|Convers[aã]o|Lei n|Decreto|Emenda|Ato|Suspens[aã]o|Suspensa)[^)]*(?:\)|$)', re.I)


class Paragrafos(HTMLParser):
    """Junta o HTML em parágrafos; guarda, para cada pedaço de texto, se estava riscado."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paras = []        # [{'center': bool, 'partes': [(texto, riscado)]}]
        self.atual = None
        self.riscado = 0
        self.ignorar = 0       # <script>, <style>
        self.pilha = []        # (tag, riscada?) das tags abertas
        self.nivel_p = 0       # tamanho da pilha quando o parágrafo atual abriu
        self.sup = 0           # dentro de <sup> (ordinais: 1<sup>o</sup>)

    def _fecha(self):
        if self.atual and any(t.strip() for t, _ in self.atual['partes']):
            self.paras.append(self.atual)
        self.atual = None
        # tags inline que ficaram abertas dentro do parágrafo não podem vazar para o próximo
        while len(self.pilha) > self.nivel_p:
            _, st = self.pilha.pop()
            self.riscado -= st
        self.riscado = max(0, self.riscado)

    VAZIAS = {'br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'area', 'base', 'wbr'}
    BLOCOS = ('p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'div', 'blockquote', 'li')

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'):
            self.ignorar += 1
            return
        if tag == 'br':
            if self.atual is not None:
                self.atual['partes'].append((' ', self.riscado > 0))
            return
        if tag in self.VAZIAS:
            return
        if tag in self.BLOCOS:
            self._fecha()
            centro = (a.get('align') or '').lower() == 'center' or tag.startswith('h')
            self.atual = {'center': centro, 'partes': []}
            self.nivel_p = len(self.pilha)
        # riscado = <strike>/<s>/<del> OU estilo CSS "text-decoration: line-through" (CLT, CPC, ECA...)
        st = tag in ('strike', 's', 'del') or 'line-through' in (a.get('style') or '').lower()
        if tag == 'sup':
            self.sup += 1
        self.pilha.append((tag, 1 if st else 0))
        self.riscado += 1 if st else 0

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.ignorar = max(0, self.ignorar - 1)
            return
        if tag in self.VAZIAS:
            return
        # fecha a tag correspondente (e as que ficaram abertas dentro dela) sem passar do parágrafo atual
        for i in range(len(self.pilha) - 1, self.nivel_p - 1, -1):
            if self.pilha[i][0] == tag:
                for _, st in self.pilha[i:]:
                    self.riscado -= st
                del self.pilha[i:]
                break
        self.riscado = max(0, self.riscado)
        if tag == 'sup':
            self.sup = max(0, self.sup - 1)
        if tag in ('p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'li'):
            self._fecha()

    def handle_data(self, data):
        if self.ignorar:
            return
        if self.sup and data.strip().lower() in ('o', 'º', '°'):
            data = 'º'
        elif self.sup and data.strip().lower() in ('a', 'ª'):
            data = 'ª'
        if self.atual is None:
            self.atual = {'center': False, 'partes': []}
        self.atual['partes'].append((data, self.riscado > 0))

    def close(self):
        super().close()
        self._fecha()


def limpa(s):
    s = unicodedata.normalize('NFC', html.unescape(s)).replace('\xa0', ' ').replace('​', '')
    return re.sub(r'\s+', ' ', s).strip()


def baixar(url):
    ultimo = None
    for tentativa in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'pt-BR'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa
            ultimo = e
            time.sleep(2 * (tentativa + 1))
    raise RuntimeError('não consegui baixar %s: %s' % (url, ultimo))


def decodifica(raw):
    m = re.search(rb'charset=["\']?([A-Za-z0-9_\-]+)', raw[:3000])
    cs = (m.group(1).decode('ascii').lower() if m else 'cp1252')
    if cs in ('iso-8859-1', 'latin-1', 'latin1', 'windows-1252'):
        cs = 'cp1252'
    try:
        return raw.decode(cs)
    except Exception:
        return raw.decode('cp1252', errors='replace')


RE_ART = re.compile(r'^Art(?:\.|igo)?\s*\d', re.I)
RE_PAR = re.compile(r'^(§\s*\d|Par[aá]grafo [uú]nico)', re.I)
RE_INC = re.compile(r'^[IVXLCDM]+\s*[-–—]')
RE_INC_L = re.compile(r'^([IVXCDM]*[Il][IVXLCDMl]*)(\s*[-–—].*)$')   # "Il", "Ill", "Vl" (L minúsculo na fonte)
RE_ALI = re.compile(r'^[a-z]\)\s')
RE_TIT = re.compile(r'^(T[IÍ]TULO|CAP[IÍ]TULO|SE[CÇ][AÃ]O|SUBSE[CÇ][AÃ]O|LIVRO|PARTE|DISPOSI[CÇ][OÕ]ES|ANEXO|PRE[AÂ]MBULO)', re.I)
RE_RODAPE = re.compile(r'^(Bras[ií]lia|Rio de Janeiro),\s*\d|^Este texto n[aã]o substitui', re.I)


def converte(texto_html):
    p = Paragrafos()
    p.feed(texto_html)
    p.close()
    blocos = []
    comecou = False
    em_assinatura = False
    for par in p.paras:
        vigente = limpa(''.join(t for t, r in par['partes'] if not r))
        todo = limpa(''.join(t for t, _ in par['partes']))
        if not todo:
            continue
        # parágrafo inteiramente riscado = dispositivo revogado/inconstitucional: fora do texto vigente
        if not vigente or (vigente != todo and len(vigente) < 12):
            continue
        notas = [limpa(n) for n in NOTA_RE.findall(vigente)]
        corpo = limpa(NOTA_RE.sub('', vigente))
        corpo = re.sub(r'\s+([,;.:])', r'\1', corpo)
        corpo = re.sub(r'([;:.])\.$', r'\1', corpo)            # D8: ponto solto ("...;." / "..")
        # rótulo "Vigência" que o Planalto cola depois das notas (sem parênteses): é nota, não texto da lei
        if re.search(r'\s+Vig[eê]ncia$', corpo):
            corpo = re.sub(r'\s+Vig[eê]ncia$', '', corpo)
            notas.append('(Vigência)')
        corpo = re.sub(r'(\d)\s+([ºª])(?=[\s.,;:)\-]|$)', r'\1\2', corpo)    # "§ 1 º" -> "§ 1º"
        corpo = re.sub(r'^Art\s+(?=\d)', 'Art. ', corpo)         # "Art 1.636." -> "Art. 1.636."
        m_l = RE_INC_L.match(corpo)
        if m_l and not RE_INC.match(corpo):                       # D7: "Il - ...", "Ill - ...", "Vl - ..."
            corpo = m_l.group(1).replace('l', 'I') + m_l.group(2)
        if not corpo:
            continue
        # D5: data/assinaturas no fim da lei não são texto da lei
        if RE_RODAPE.match(corpo):
            em_assinatura = True
            continue
        if em_assinatura:
            if RE_ART.match(corpo) or RE_TIT.match(corpo):
                em_assinatura = False
            else:
                continue
        # sobra de dispositivo vetado/revogado ("IX-A -;", "§ 1º.", "b).", "1);"): não é texto vigente
        if len(corpo) <= 30 and any(re.search(r'vetad|revogad', n, re.I) for n in notas):
            continue
        if len(corpo) <= 4 and not RE_ART.match(corpo):
            continue
        if RE_ART.match(corpo):
            comecou = True
            tipo = 'art'
        elif not comecou:
            if RE_TIT.match(corpo):
                comecou = True
                tipo = 'tit'
            else:
                continue            # cabeçalho do site / ementa
        elif RE_PAR.match(corpo):
            tipo = 'par'
        elif RE_INC.match(corpo):
            tipo = 'inc'
        elif RE_ALI.match(corpo):
            tipo = 'ali'
        elif par['center'] or RE_TIT.match(corpo):
            tipo = 'tit'
        else:
            tipo = 'txt'
        if tipo == 'tit' and len(corpo) > 160:
            tipo = 'txt'
        b = [tipo, corpo]
        if notas:
            b.append(notas)
        blocos.append(b)
    # remove "tit" duplicados em sequência e lixo de rodapé
    limpos = []
    for b in blocos:
        if limpos and limpos[-1][0] == b[0] == 'tit' and limpos[-1][1] == b[1]:
            continue
        limpos.append(b)
    return limpos


def numero_art(txt):
    m = re.match(r'^Art(?:\.|igo)\s*([0-9]+(?:\.[0-9]+)?[ºo°]?(?:-[A-Z]{1,2})?)', txt, re.I)
    return m.group(1) if m else ''


def main(ids):
    os.makedirs(SAIDA, exist_ok=True)
    idx_path = os.path.join(SAIDA, 'index.json')
    try:
        indice = {l['id']: l for l in json.load(open(idx_path, encoding='utf-8')).get('leis', [])}
    except Exception:
        indice = {}
    hoje = datetime.date.today().isoformat()
    falhas = []
    for (lid, nome, norma, url) in LEIS:
        if ids and lid not in ids:
            continue
        try:
            blocos = converte(decodifica(baixar(url)))
            n_art = sum(1 for b in blocos if b[0] == 'art')
            if n_art < 3:
                raise RuntimeError('só %d artigos reconhecidos (estrutura inesperada)' % n_art)
            doc = {'id': lid, 'nome': nome, 'norma': norma, 'fonte': url, 'baixado_em': hoje,
                   'artigos': n_art, 'blocos': blocos}
            caminho = os.path.join(SAIDA, lid + '.json')
            novo = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
            antigo = open(caminho, encoding='utf-8').read() if os.path.exists(caminho) else ''
            # só regrava se o TEXTO mudou (evita commit diário sem mudança)
            if antigo:
                try:
                    if json.loads(antigo).get('blocos') == blocos:
                        doc['baixado_em'] = json.loads(antigo).get('baixado_em', hoje)
                        novo = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
                except Exception:
                    pass
            open(caminho, 'w', encoding='utf-8', newline='\n').write(novo)
            indice[lid] = {'id': lid, 'nome': nome, 'norma': norma, 'fonte': url, 'atualizado': doc['baixado_em'],
                           'artigos': n_art, 'blocos': len(blocos), 'bytes': len(novo.encode('utf-8'))}
            print('ok   %-7s %5d artigos %6d blocos %7.0f KB' % (lid, n_art, len(blocos), len(novo.encode('utf-8')) / 1024))
        except Exception as e:  # noqa
            falhas.append(lid)
            print('FALHA %-7s %s' % (lid, e))
    ordem = [l[0] for l in LEIS]
    lista = sorted(indice.values(), key=lambda l: ordem.index(l['id']) if l['id'] in ordem else 99)
    json.dump({'gerado_em': hoje, 'leis': lista}, open(idx_path, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    if falhas:
        print('\nLeis com falha (mantive o arquivo antigo, se existia):', ', '.join(falhas))
    return 1 if (falhas and len(falhas) == len([l for l in LEIS if not ids or l[0] in ids])) else 0


if __name__ == '__main__':
    sys.exit(main(set(sys.argv[1:])))
