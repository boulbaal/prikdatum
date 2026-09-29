#!/usr/bin/env python3
"""Maakt de statische pagina's in public/ uit de markdown in promo/ plus de FAQ.

Gebruik: python3 tools/gen_pages.py
Maakt: public/faq.html en public/privacy.html (Engels, x-default, stuurt door naar de taal van
de bezoeker), public/<taal>/faq.html en public/<taal>/privacy.html voor alle 23 talen (teksten in
tools/paginas_teksten.py), public/vergelijking.html, public/blog/*.html en public/sitemap.xml.
De pagina's delen één stijl (inline, niets extern) en linken naar de app in dezelfde taal.
"""
import html
import json
import os
import re
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paginas_teksten import P  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
PROMO = os.path.join(ROOT, 'promo')
SITE = 'https://whenly.vanali.workers.dev'
TALEN = 'en nl fr de es pt pl uk ru tr ar ur hi bn id vi zh ja ko sw zgh ku sn'.split()
NAMEN = {'en': 'English', 'nl': 'Nederlands', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español', 'pt': 'Português',
         'pl': 'Polski', 'uk': 'Українська', 'ru': 'Русский', 'tr': 'Türkçe', 'ar': 'العربية', 'ur': 'اردو',
         'hi': 'हिन्दी', 'bn': 'বাংলা', 'id': 'Bahasa Indonesia', 'vi': 'Tiếng Việt', 'zh': '中文', 'ja': '日本語',
         'ko': '한국어', 'sw': 'Kiswahili', 'zgh': 'ⵜⴰⵎⴰⵣⵉⵖⵜ', 'ku': 'Kurdî', 'sn': 'chiShona'}
RTL = {'ar', 'ur'}
GITHUB = 'https://github.com/boulbaal/whenly'

CSS = """
:root{--tekst:#1F2933;--gedempt:#5B6570;--lijn:#E3E7EB;--groen:#26784C;--lichtgroen:#E8F5EE}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--tekst);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.6}
.col{max-width:680px;margin:0 auto;padding:24px 16px 80px}
nav{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:15px;margin-bottom:28px}nav a{color:var(--groen);font-weight:600;text-decoration:none}nav .app{margin-inline-start:auto;background:var(--groen);color:#fff;padding:10px 16px;border-radius:8px}
h1{font-size:28px;line-height:1.25;margin:0 0 8px}h2{font-size:21px;margin:32px 0 8px}p{margin:0 0 16px}a{color:var(--groen)}
table{border-collapse:collapse;width:100%;font-size:15px;margin:0 0 16px}th,td{border:1px solid var(--lijn);padding:8px;text-align:start;vertical-align:top}th{background:var(--lichtgroen)}
.cta{display:inline-block;background:var(--groen);color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0 24px}
.voet{margin-top:40px;font-size:13px;color:var(--gedempt)}.datum{font-size:14px;color:var(--gedempt);margin:0 0 20px}
details{border:1px solid var(--lijn);border-radius:8px;padding:10px 14px;margin:0 0 10px}summary{font-weight:600;cursor:pointer}details p{margin:8px 0 0}
.taal{font:inherit;font-size:14px;color:var(--tekst);background:#fff;border:1px solid var(--lijn);border-radius:8px;padding:6px 8px;max-width:140px}
.col{overflow-wrap:anywhere}
@font-face{font-family:"Noto Sans Tifinagh";src:url(/fonts/noto-sans-tifinagh-tifinagh-400-normal.woff2) format("woff2");unicode-range:U+2D30-2D7F;font-display:swap}
:lang(zgh){font-family:"Noto Sans Tifinagh",Ebrima,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
:lang(ar),:lang(ur){font-family:"Segoe UI","Noto Naskh Arabic","Noto Sans Arabic","Geeza Pro",Tahoma,Arial,sans-serif}:lang(ur){line-height:1.8}
:lang(hi){font-family:"Nirmala UI","Noto Sans Devanagari","Kohinoor Devanagari",Mangal,Arial,sans-serif}
:lang(bn){font-family:"Nirmala UI","Noto Sans Bengali","Kohinoor Bangla",Vrinda,Arial,sans-serif}
:lang(zh){font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif}
:lang(ja){font-family:-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans CJK JP","Noto Sans JP",sans-serif}
:lang(ko){font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans CJK KR","Noto Sans KR",sans-serif}
"""


def inline(md):
    """**vet**, [tekst](url), `code`."""
    s = html.escape(md, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'`(.+?)`', r'<code>\1</code>', s)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2">\1</a>', s)
    s = re.sub(r'(?<![">])(https://whenly\.vanali\.workers\.dev)(?![\w/])', r'<a href="\1">\1</a>', s)
    return s


def md_to_html(md):
    out = []
    lines = md.split('\n')
    i = 0
    para = []

    def flush():
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>')
            para.clear()

    while i < len(lines):
        ln = lines[i]
        if ln.startswith('# '):
            flush(); out.append('<h1>' + inline(ln[2:]) + '</h1>')
        elif ln.startswith('## '):
            flush(); out.append('<h2>' + inline(ln[3:]) + '</h2>')
        elif ln.startswith('|'):
            flush()
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'-+', c) for c in cells if c):
                    rows.append(cells)
                i += 1
            t = ['<table>']
            for r, cells in enumerate(rows):
                tag = 'th' if r == 0 else 'td'
                t.append('<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in cells) + '</tr>')
            t.append('</table>')
            out.append('\n'.join(t))
            continue
        elif ln.strip() == '':
            flush()
        else:
            para.append(ln.strip())
        i += 1
    flush()
    return '\n'.join(out)


def page(*, lang, title, desc, path, body, extra_head='', nav_app='Open de app', nav_faq='FAQ', nav_priv='Privacy', taalkeuze=None):
    """Eén pagina. Links in de nav volgen de taal (/<lang>/…), zodat wie in een taal zit, erin blijft.
    taalkeuze: de bladzijde ('faq' of 'privacy') waarvoor een taalmenu getoond wordt, of None."""
    canon = SITE + path
    dir_ = 'rtl' if lang in RTL else 'ltr'
    pre = '' if lang == 'nl' and path.startswith(('/vergelijking', '/blog/')) else f'/{lang}'
    app = f'{pre}/' if pre else '/'
    menu = ''
    if taalkeuze:
        opties = ''.join(f'<option value="{l}" lang="{l}"{" selected" if l == lang else ""}>{html.escape(NAMEN[l])}</option>' for l in TALEN)
        menu = (f'<select class="taal" aria-label="Language" onchange="try{{localStorage.setItem(\'prikdatum.lang\',this.value)}}catch(e){{}};'
                f'location.href=\'/\'+this.value+\'/{taalkeuze}\'">{opties}</select>')
    return f"""<!doctype html>
<html lang="{lang}" dir="{dir_}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · Whenly</title>
<meta name="description" content="{html.escape(desc, quote=True)}">
<link rel="canonical" href="{canon}">
<link rel="icon" href="/favicon.png" type="image/png">
<meta name="theme-color" content="#26784C">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Whenly">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(desc, quote=True)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
{extra_head}
<style>{CSS}</style>
</head>
<body>
<div class="col">
<nav><a href="{app}">Whenly</a><a href="{pre}/faq">{html.escape(nav_faq)}</a><a href="{pre}/privacy">{html.escape(nav_priv)}</a>{menu}<a class="app" href="{app}">{html.escape(nav_app)}</a></nav>
{body}
<p class="voet"><a href="{app}">Whenly</a> · gratis, zonder account · free, no account</p>
</div>
</body>
</html>
"""


def write(rel, content):
    p = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)
    print('geschreven', rel)


def md_page(md_file, path, desc, datum=None):
    with open(os.path.join(PROMO, md_file), encoding='utf-8') as f:
        md = f.read()
    title = re.search(r'^# (.+)$', md, re.M).group(1)
    body = md_to_html(md)
    if datum:
        body = body.replace('</h1>', f'</h1>\n<p class="datum">{datum}</p>', 1)
    body += f'\n<a class="cta" href="/">Probeer Whenly, gratis en zonder account</a>'
    return title, page(lang='nl', title=title, desc=desc, path=path, body=body, nav_app='Open de app', nav_faq='FAQ', nav_priv='Privacy')


def hreflangs(blad):
    """<link rel=alternate hreflang> voor /faq of /privacy: x-default en en op de wortel, de rest op /<taal>/."""
    out = [f'<link rel="alternate" hreflang="x-default" href="{SITE}/{blad}">']
    for l in TALEN:
        href = f'{SITE}/{blad}' if l == 'en' else f'{SITE}/{l}/{blad}'
        out.append(f'<link rel="alternate" hreflang="{l}" href="{href}">')
    return '\n'.join(out)


def kort(s, n=155):
    """Meta-omschrijving: afkappen op een woordgrens."""
    if len(s) <= n:
        return s
    return s[:n].rsplit(' ', 1)[0].rstrip(',.;:') + '…'


DOORSTUREN = """<script>(function(){var T=%s;try{var l=localStorage.getItem('prikdatum.lang');if(!l){var ls=navigator.languages||[navigator.language];for(var i=0;i<ls.length;i++){var b=String(ls[i]||'').toLowerCase().split('-')[0];if(T.indexOf(b)>=0){l=b;break}}}if(l&&l!=='en'&&T.indexOf(l)>=0)location.replace('/'+l+'/%s')}catch(e){}})()</script>"""


def faq_page(lang, wortel=False):
    """/faq (wortel, Engels, stuurt door naar de taal van de bezoeker) of /<lang>/faq."""
    d = P[lang]
    items = list(zip(d['q'], d['a']))
    body = f'<h1>{html.escape(d["faq_title"])}</h1>\n'
    body += '\n'.join(f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in items)
    body += f'\n<a class="cta" href="/{lang}/">{html.escape(d["open"])}</a>'
    ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang,
          'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in items]}
    extra = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>\n' + hreflangs('faq')
    if wortel:
        extra += '\n' + DOORSTUREN % (json.dumps(TALEN), 'faq')
    path = '/faq' if (wortel or lang == 'en') else f'/{lang}/faq'
    return page(lang=lang, title=d['faq_title'], desc=kort(d['a'][0] + ' ' + d['a'][1]), path=path, body=body, extra_head=extra,
                nav_app=d['open'], nav_faq=d['faq'], nav_priv=d['privacy'], taalkeuze='faq')


def privacy_page(lang, wortel=False):
    """/privacy (wortel, Engels, stuurt door) of /<lang>/privacy."""
    d = P[lang]
    body = f'<h1>{html.escape(d["priv_title"])}</h1>\n'
    for h, p in zip(d['h'], d['p']):
        p = html.escape(p).replace('GITHUB', f'<a href="{GITHUB}">GitHub</a>')
        body += f'<h2>{html.escape(h)}</h2>\n<p>{p}</p>\n'
    body += f'<a class="cta" href="/{lang}/">{html.escape(d["open"])}</a>'
    extra = hreflangs('privacy')
    if wortel:
        extra += '\n' + DOORSTUREN % (json.dumps(TALEN), 'privacy')
    path = '/privacy' if (wortel or lang == 'en') else f'/{lang}/privacy'
    return page(lang=lang, title=d['priv_title'], desc=kort(d['p'][0]), path=path, body=body, extra_head=extra,
                nav_app=d['open'], nav_faq=d['faq'], nav_priv=d['privacy'], taalkeuze='privacy')


def main():
    vandaag = datetime.date.today().isoformat()
    paginas = []
    write('faq.html', faq_page('en', wortel=True))
    write('privacy.html', privacy_page('en', wortel=True))
    for l in TALEN:
        # /en/faq bestaat ook (de app linkt altijd naar /<taal>/…), maar wijst met canonical naar /faq
        write(f'{l}/faq.html', faq_page(l))
        write(f'{l}/privacy.html', privacy_page(l))

    t, h = md_page('vergelijking-whenly-doodle-when2meet.md', '/vergelijking',
                   'Eerlijke vergelijking van Whenly, Doodle en When2meet: account, reclame, kost, mobiel, talen, open source.')
    write('vergelijking.html', h); paginas.append('/vergelijking')

    t, h = md_page('blog-1-gratis-doodle-alternatieven.md', '/blog/gratis-doodle-alternatieven',
                   'Vijf gratis Doodle-alternatieven om samen een datum te prikken zonder account, met eerlijke voor- en nadelen.', datum='28 september 2026')
    write('blog/gratis-doodle-alternatieven.html', h); paginas.append('/blog/gratis-doodle-alternatieven')

    t, h = md_page('blog-2-datum-prikken-met-een-grote-groep.md', '/blog/datum-prikken-met-een-grote-groep',
                   'Praktische aanpak om met een grote groep een datum te vinden zonder dat het weken duurt.', datum='28 september 2026')
    write('blog/datum-prikken-met-een-grote-groep.html', h); paginas.append('/blog/datum-prikken-met-een-grote-groep')

    talen = TALEN
    # (url, hreflang-groep of None); /en/faq en /en/privacy niet: die zijn canonical naar de wortel
    urls = [(SITE + '/', 'app')] + [(f'{SITE}/{l}/', 'app') for l in talen]
    for blad in ('faq', 'privacy'):
        urls.append((f'{SITE}/{blad}', blad))
        urls += [(f'{SITE}/{l}/{blad}', blad) for l in talen if l != 'en']
    urls += [(SITE + p, None) for p in paginas]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for u, groep in urls:
        sm.append('  <url>')
        sm.append(f'    <loc>{u}</loc>')
        sm.append(f'    <lastmod>{vandaag}</lastmod>')
        if groep == 'app':
            sm.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/>')
            for l in talen:
                sm.append(f'    <xhtml:link rel="alternate" hreflang="{l}" href="{SITE}/{l}/"/>')
        elif groep:
            sm.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/{groep}"/>')
            for l in talen:
                href = f'{SITE}/{groep}' if l == 'en' else f'{SITE}/{l}/{groep}'
                sm.append(f'    <xhtml:link rel="alternate" hreflang="{l}" href="{href}"/>')
        sm.append('  </url>')
    sm.append('</urlset>')
    write('sitemap.xml', '\n'.join(sm) + '\n')


if __name__ == '__main__':
    main()
