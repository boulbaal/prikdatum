#!/usr/bin/env python3
"""Maakt de statische pagina's in public/ uit de markdown in promo/ plus de FAQ.

Gebruik: python3 tools/gen_pages.py
Maakt: public/faq.html, public/vergelijking.html, public/blog/*.html, public/sitemap.xml
De pagina's delen één stijl (inline, niets extern) en linken naar de app.
"""
import html
import os
import re
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
PROMO = os.path.join(ROOT, 'promo')
SITE = 'https://whenly.vanali.workers.dev'

CSS = """
:root{--tekst:#1F2933;--gedempt:#5B6570;--lijn:#E3E7EB;--groen:#26784C;--lichtgroen:#E8F5EE}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--tekst);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.6}
.col{max-width:680px;margin:0 auto;padding:24px 16px 80px}
nav{display:flex;gap:16px;align-items:center;font-size:15px;margin-bottom:28px}nav a{color:var(--groen);font-weight:600;text-decoration:none}nav .app{margin-inline-start:auto;background:var(--groen);color:#fff;padding:10px 16px;border-radius:8px}
h1{font-size:28px;line-height:1.25;margin:0 0 8px}h2{font-size:21px;margin:32px 0 8px}p{margin:0 0 16px}a{color:var(--groen)}
table{border-collapse:collapse;width:100%;font-size:15px;margin:0 0 16px}th,td{border:1px solid var(--lijn);padding:8px;text-align:start;vertical-align:top}th{background:var(--lichtgroen)}
.cta{display:inline-block;background:var(--groen);color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0 24px}
.voet{margin-top:40px;font-size:13px;color:var(--gedempt)}.datum{font-size:14px;color:var(--gedempt);margin:0 0 20px}
details{border:1px solid var(--lijn);border-radius:8px;padding:10px 14px;margin:0 0 10px}summary{font-weight:600;cursor:pointer}details p{margin:8px 0 0}
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


def page(*, lang, title, desc, path, body, extra_head='', dir_='ltr', nav_app='Open de app', nav_faq='FAQ'):
    canon = SITE + path
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
<nav><a href="/">Whenly</a><a href="/faq">{nav_faq}</a><a href="/privacy">Privacy</a><a class="app" href="/">{nav_app}</a></nav>
{body}
<p class="voet"><a href="/">Whenly</a> · gratis, zonder account · free, no account</p>
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
    return title, page(lang='nl', title=title, desc=desc, path=path, body=body)


FAQ_NL = [
    ('Is Whenly gratis?', 'Ja. Whenly is volledig gratis en blijft gratis. Geen betaalmuur, geen reclame.'),
    ('Moet ik een account maken?', 'Nee. Niemand hoeft een account te maken, ook niet wie de afspraak aanmaakt. Je typt je naam en klikt je dagen aan.'),
    ('Werkt het op mijn telefoon?', 'Ja. Whenly werkt in elke browser en kan als app op je startscherm worden gezet (PWA), zonder appstore.'),
    ('In welke talen werkt Whenly?', 'Drieëntwintig talen, waaronder Nederlands, Engels, Frans, Duits, Spaans, Portugees, Pools, Oekraïens, Russisch, Turks, Arabisch, Urdu, Hindi, Bengaals, Indonesisch, Vietnamees, Chinees, Japans, Koreaans, Swahili, Tamazight, Koerdisch en Shona. De taal volgt je browser en is te wisselen via de wereldbol.'),
    ('Wat is het verschil met Doodle?', 'Whenly vraagt niemand om te registreren, toont geen reclame en is gratis. Je klikt dagen aan op een kalender in plaats van velden in te vullen, en een stoplicht toont wanneer iedereen kan.'),
    ('Kan ik voor iemand anders een datum invullen?', 'Ja. Kies "iemand anders invullen", typ een naam en klik de dagen voor die persoon aan.'),
    ('Wie kan mijn afspraak zien?', 'Iedereen met de link. De link is een lange willekeurige code die niet te raden is. Pagina\'s van afspraken worden niet geïndexeerd door zoekmachines. Deel de link dus alleen met je groep.'),
    ('Wat gebeurt er met mijn gegevens?', 'Alleen de titel, de namen en de aangeklikte dagen worden bewaard, niets anders. Geen e-mailadres, geen telefoonnummer, geen tracking, geen cookies van derden.'),
]
FAQ_EN = [
    ('Is Whenly free?', 'Yes. Whenly is completely free and stays free. No paywall, no ads.'),
    ('Do I need an account?', 'No. Nobody needs an account, not even the person who creates the poll. Type your name and tap your days.'),
    ('Does it work on my phone?', 'Yes. Whenly works in any browser and can be added to your home screen like an app (PWA), no app store needed.'),
    ('Which languages does Whenly support?', 'Twenty-three, including English, Dutch, French, German, Spanish, Portuguese, Polish, Ukrainian, Russian, Turkish, Arabic, Urdu, Hindi, Bengali, Indonesian, Vietnamese, Chinese, Japanese, Korean, Swahili, Tamazight, Kurdish and Shona. It follows your browser language and you can switch with the globe button.'),
    ('How is it different from Doodle?', 'Whenly asks nobody to sign up, shows no ads and is free. You tap days on a calendar instead of filling in fields, and a traffic light shows when everyone can make it.'),
    ('Can I fill in dates for someone else?', 'Yes. Choose "fill in for someone else", type a name and tap the days for that person.'),
    ('Who can see my poll?', 'Anyone with the link. The link is a long random code that cannot be guessed, and poll pages are not indexed by search engines. Share the link only with your group.'),
    ('What happens to my data?', 'Only the title, the names and the tapped days are stored, nothing else. No email address, no phone number, no tracking, no third-party cookies.'),
]


def faq_page():
    def blok(items):
        return '\n'.join(f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in items)
    body = '<h1>Veelgestelde vragen</h1><p class="datum">Frequently asked questions (English below)</p>\n' + blok(FAQ_NL)
    body += '\n<h2 lang="en">Frequently asked questions</h2>\n<div lang="en">' + blok(FAQ_EN) + '</div>'
    body += '\n<a class="cta" href="/">Open Whenly</a>'
    import json
    ld = {
        '@context': 'https://schema.org', '@type': 'FAQPage',
        'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in FAQ_NL + FAQ_EN],
    }
    extra = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>'
    return page(lang='nl', title='Veelgestelde vragen', desc='Antwoorden over Whenly: gratis, zonder account, 23 talen, privacy. FAQ in het Nederlands en Engels.', path='/faq', body=body, extra_head=extra)


PRIVACY_NL = """
<h1>Privacy</h1>
<p class="datum">Kort en zonder juridisch jargon. English below.</p>
<h2>Wat Whenly bewaart</h2>
<p>Alleen wat je zelf intypt: de titel van de afspraak, de namen van de deelnemers, de aangeklikte dagen en eventueel een uur. Verder niets. Geen e-mailadres, geen telefoonnummer, geen account, geen wachtwoord.</p>
<h2>Wat Whenly niet doet</h2>
<p>Geen tracking, geen advertenties, geen cookies van derden, geen analytics. Je browser onthoudt lokaal alleen je taal, je naam en welke naam de jouwe is in een afspraak, zodat je niet elke keer opnieuw hoeft te typen. Dat blijft op je eigen toestel.</p>
<h2>Wie kan een afspraak zien</h2>
<p>Iedereen met de link. De link is een lange willekeurige code die niet te raden is, en afspraakpagina's worden niet door zoekmachines geïndexeerd. Deel de link dus alleen met je groep. Iedereen met de link kan ook namen en dagen aanpassen of weghalen; als iemand een naam weghaalt, blijft dat 30 dagen als korte melding zichtbaar zodat de groep weet dat het geen fout van de app was.</p>
<h2>Hoe lang</h2>
<p>Een afspraak wordt automatisch en volledig verwijderd na 12 maanden zonder activiteit (geen bezoek, geen wijziging). Een weggehaalde naam verdwijnt definitief na 30 dagen.</p>
<h2>Waar</h2>
<p>De gegevens staan op servers van Cloudflare (Workers en D1). Whenly is open source; de code staat op <a href="https://github.com/boulbaal/whenly">GitHub</a>.</p>
<h2>Vragen of iets laten verwijderen</h2>
<p>Open een issue op <a href="https://github.com/boulbaal/whenly/issues">GitHub</a>. Wil je een afspraak eerder weg? Haal je naam weg via de knop onderaan de afspraak; de rest verdwijnt vanzelf na 12 maanden zonder activiteit.</p>
"""
PRIVACY_EN = """
<h2>Privacy (English)</h2>
<h2>What Whenly stores</h2>
<p>Only what you type yourself: the poll title, the participants' names, the tapped days and an optional time. Nothing else. No email address, no phone number, no account, no password.</p>
<h2>What Whenly does not do</h2>
<p>No tracking, no ads, no third-party cookies, no analytics. Your browser locally remembers only your language, your name and which name is yours in a poll, so you do not have to retype it. That stays on your own device.</p>
<h2>Who can see a poll</h2>
<p>Anyone with the link. The link is a long random code that cannot be guessed, and poll pages are not indexed by search engines, so share the link only with your group. Anyone with the link can also change or remove names and days; when someone removes a name, a short note stays visible for 30 days so the group knows it was not an app error.</p>
<h2>How long</h2>
<p>A poll is deleted automatically and completely after 12 months without activity (no visit, no change). A removed name disappears for good after 30 days.</p>
<h2>Where</h2>
<p>Data is stored on Cloudflare servers (Workers and D1). Whenly is open source; the code is on <a href="https://github.com/boulbaal/whenly">GitHub</a>.</p>
<h2>Questions or removal requests</h2>
<p>Open an issue on <a href="https://github.com/boulbaal/whenly/issues">GitHub</a>. Want a poll gone sooner? Remove your name with the button at the bottom of the poll; the rest disappears by itself after 12 months without activity.</p>
"""


def privacy_page():
    body = PRIVACY_NL + '<div lang="en">' + PRIVACY_EN + '</div>\n<a class="cta" href="/">Open Whenly</a>'
    return page(lang='nl', title='Privacy', desc='Wat Whenly bewaart (alleen titel, namen en dagen), hoe lang (12 maanden zonder activiteit) en wat het niet doet (geen tracking, geen reclame). NL en EN.', path='/privacy', body=body)


def main():
    vandaag = datetime.date.today().isoformat()
    paginas = []
    write('faq.html', faq_page()); paginas.append('/faq')
    write('privacy.html', privacy_page()); paginas.append('/privacy')

    t, h = md_page('vergelijking-whenly-doodle-when2meet.md', '/vergelijking',
                   'Eerlijke vergelijking van Whenly, Doodle en When2meet: account, reclame, kost, mobiel, talen, open source.')
    write('vergelijking.html', h); paginas.append('/vergelijking')

    t, h = md_page('blog-1-gratis-doodle-alternatieven.md', '/blog/gratis-doodle-alternatieven',
                   'Vijf gratis Doodle-alternatieven om samen een datum te prikken zonder account, met eerlijke voor- en nadelen.', datum='28 september 2026')
    write('blog/gratis-doodle-alternatieven.html', h); paginas.append('/blog/gratis-doodle-alternatieven')

    t, h = md_page('blog-2-datum-prikken-met-een-grote-groep.md', '/blog/datum-prikken-met-een-grote-groep',
                   'Praktische aanpak om met een grote groep een datum te vinden zonder dat het weken duurt.', datum='28 september 2026')
    write('blog/datum-prikken-met-een-grote-groep.html', h); paginas.append('/blog/datum-prikken-met-een-grote-groep')

    talen = 'en nl fr de es pt pl uk ru tr ar ur hi bn id vi zh ja ko sw zgh ku sn'.split()
    urls = [SITE + '/'] + [f'{SITE}/{l}/' for l in talen] + [SITE + p for p in paginas]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for u in urls:
        sm.append('  <url>')
        sm.append(f'    <loc>{u}</loc>')
        sm.append(f'    <lastmod>{vandaag}</lastmod>')
        if u == SITE + '/' or u.rstrip('/').rsplit('/', 1)[-1] in talen:
            sm.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/>')
            for l in talen:
                sm.append(f'    <xhtml:link rel="alternate" hreflang="{l}" href="{SITE}/{l}/"/>')
        sm.append('  </url>')
    sm.append('</urlset>')
    write('sitemap.xml', '\n'.join(sm) + '\n')


if __name__ == '__main__':
    main()
