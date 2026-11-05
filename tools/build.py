"""Build the Agon web books.

    python3 tools/build.py            # writes site/<slug>/index.html for every book in books/

Source format ("Agon markdown"): standard markdown (tables, lists, etc.) plus
  front matter     --- / key: value / ---  at the top of each book file
  :::note           a rules callout (start with ##### Title)
  :::sidebar        a lighter aside
  :::gm             a Historian-only note (purple)
  :::credit         art credit, attaches to the image just above it
  :::cards          every #### heading inside becomes its own card
  :::monsters       grid wrapper for :::monster stat blocks
  :::monster        stat block: ## Name, *meta line*, ___, **HP** :: 10 ..., ___, abilities, ___, **Exp** ...
  **Label:** :: value   consecutive lines become a property list
  [text](@player#id)    cross-book link (@lore, @player, @historian)
  ## Heading {#custom-id}   custom anchor
"""
import html, json, os, re, sys
import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS_DIR = os.path.join(ROOT, "books")
SITE = os.path.join(ROOT, "site")
VERSION = "1.2"

BOOK_ORDER = ["world-lore", "player-handbook", "historian-handbook"]
SHORT = {"lore": "world-lore", "player": "player-handbook", "historian": "historian-handbook"}
SHELF_LABEL = {"world-lore": "World Lore", "player-handbook": "Player's Handbook", "historian-handbook": "Historian's Handbook"}

MD_EXT = ["tables", "sane_lists", "attr_list", "smarty"]
MD_CFG = {"smarty": {"smart_angled_quotes": False, "smart_dashes": False}}

BAND = r"(Blue|Green|Yellow|Red)"
DIAGRAMS = {"attribute-triangle.svg", "theion-gauge.svg"}


def md(text):
    return markdown.markdown(text, extensions=MD_EXT, extension_configs=MD_CFG)


# ---------------------------------------------------------------- block tree
def parse_blocks(lines):
    """Return a list of ("text", str) and ("block", kind, children)."""
    out, buf, i = [], [], 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^:::(\w+)\s*$", line.strip())
        if m:
            if buf:
                out.append(("text", "\n".join(buf))); buf = []
            depth, j, inner = 1, i + 1, []
            while j < len(lines):
                s = lines[j].strip()
                if re.match(r"^:::\w+\s*$", s):
                    depth += 1
                elif s == ":::":
                    depth -= 1
                    if depth == 0:
                        break
                inner.append(lines[j]); j += 1
            if depth != 0:
                raise SystemExit(f"Unclosed :::{m.group(1)} near: {line!r}")
            out.append(("block", m.group(1), parse_blocks(inner)))
            i = j + 1
            continue
        buf.append(line); i += 1
    if buf:
        out.append(("text", "\n".join(buf)))
    return out


def props_to_html(text):
    """Turn runs of '**Label:** :: value' lines into <dl class=props>."""
    lines, out, run = text.split("\n"), [], []
    pat = re.compile(r"^\*\*(.+?):?\*\*:?\s*::\s*(.*)$")
    def flush():
        if run:
            items = "".join(f"<dt>{html.escape(k)}</dt><dd>{inline(v)}</dd>" for k, v in run)
            out.append(f'\n<dl class="props">{items}</dl>\n')
            run.clear()
    for ln in lines:
        m = pat.match(ln.strip())
        if m:
            run.append((m.group(1).strip().rstrip(":"), m.group(2).strip()))
        else:
            flush(); out.append(ln)
    flush()
    return "\n".join(out)


def inline(s):
    h = md(s)
    h = re.sub(r"^<p>|</p>$", "", h.strip())
    h = re.sub(rf"^{BAND}\b", lambda m: f'<span class="chip {m.group(1).lower()}">{m.group(1)}</span>', h)
    h = re.sub(r"^Daily\b", '<span class="chip daily">Daily</span>', h)
    return h


def render_text(t):
    return md(props_to_html(t))


def render_monster(children):
    text = "\n".join(c[1] for c in children if c[0] == "text")
    sections = re.split(r"^\s*___\s*$", text, flags=re.M)
    head = sections[0].strip().split("\n")
    name = re.sub(r"^#+\s*", "", head[0]).strip()
    meta = " ".join(h.strip() for h in head[1:] if h.strip())
    meta_html = inline(meta)
    meta_html = re.sub(r"\b(Minion|Standard|Elite|Legendary|Mythic)\b", r'<span class="tier \1">\1</span>', meta_html, count=1)
    parts = [f'<h3>{html.escape(name)}</h3>', f'<p class="meta">{meta_html}</p>']
    body = sections[1:]
    if body:
        stats = []
        for ln in body[0].strip().split("\n"):
            m = re.match(r"^\*\*(.+?)\*\*\s*::\s*(.*)$", ln.strip())
            if m:
                stats.append((m.group(1), m.group(2)))
        cells = []
        for k, v in stats:
            cls = ' class="wide"' if k in ("Traits", "Immune", "Weak") or len(v) > 24 else ""
            cells.append(f"<div{cls}><b>{html.escape(k)}</b><span>{inline(v)}</span></div>")
        parts.append('<div class="stats">' + "".join(cells) + "</div>")
        rest = body[1:]
        if len(rest) >= 2:
            abilities, reward = "\n___\n".join(rest[:-1]), rest[-1]
        elif rest:
            abilities, reward = rest[0], ""
        else:
            abilities, reward = "", ""
        ab = md(props_to_html(abilities.strip()))
        ab = re.sub(r"^<p><em>(.+?)</em></p>", r'<p class="flavor">\1</p>', ab, count=1)
        parts.append(ab)
        if reward.strip():
            parts.append(f'<div class="reward">{inline(reward.strip())}</div>')
    return '<div class="monster">' + "\n".join(parts) + "</div>"


def render_cards(children):
    html_parts = []
    for c in children:
        if c[0] == "block":
            html_parts.append(render_block(c)); continue
        chunks = re.split(r"^(?=#### )", c[1], flags=re.M)
        for ch in chunks:
            if not ch.strip():
                continue
            if ch.startswith("#### "):
                wide = "{.wide}" in ch.split("\n", 1)[0]
                ch = ch.replace(" {.wide}", "", 1)
                html_parts.append(f'<div class="card{" wide" if wide else ""}">' + render_text(ch) + "</div>")
            else:
                html_parts.append('<div class="card wide">' + render_text(ch) + "</div>")
    return '<div class="cards">' + "\n".join(html_parts) + "</div>"


def render_block(node):
    _, kind, children = node
    if kind == "monster":
        return render_monster(children)
    if kind == "cards":
        return render_cards(children)
    inner = render_nodes(children)
    if kind == "monsters":
        return f'<div class="monsters">{inner}</div>'
    if kind == "credit":
        txt = re.sub(r"</?(h\d|p)[^>]*>", " ", inner)
        txt = re.sub(r"\s+", " ", txt).strip()
        return f'<figcaption class="credit">{txt}</figcaption>'
    if kind in ("note", "sidebar", "gm"):
        cls = {"gm": "gmnote"}.get(kind, kind)
        return f'<div class="{cls}">{inner}</div>'
    return f'<div class="{kind}">{inner}</div>'


def render_nodes(nodes):
    return "\n".join(render_text(n[1]) if n[0] == "text" else render_block(n) for n in nodes)


# ---------------------------------------------------------------- post-processing
def slugify(s):
    s = html.unescape(re.sub(r"<[^>]+>", "", s)).lower()
    s = s.replace("ē", "e").replace("ō", "o").replace("í", "i").replace("ó", "o").replace("á", "a").replace("’", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "section"


def postprocess(body):
    # figures
    def fig(m):
        alt, src = m.group(1), m.group(2)
        if src.startswith("art/"):
            name = os.path.basename(src)
            svg = open(os.path.join(SITE, "art", name), encoding="utf-8").read()
            uid = re.sub(r"\W", "", name.rsplit(".", 1)[0])
            svg = svg.replace('id="glaze"', f'id="glaze-{uid}"').replace("url(#glaze)", f"url(#glaze-{uid})")
            kind = "diagram" if name in DIAGRAMS else "vignette"
            return f'<figure class="{kind}">{svg}</figure>'
        cls = "print" if "metmuseum.org" in src or "wikimedia.org" in src else ""
        return f'<figure class="{cls}"><img src="{src}" alt="{alt}" loading="lazy"></figure>'
    body = re.sub(r'<p><img alt="([^"]*)" src="([^"]+)" ?/?></p>', fig, body)
    body = re.sub(r"</figure>\s*(<figcaption class=\"credit\">.*?</figcaption>)", r"\1</figure>", body, flags=re.S)
    # table wrappers and group rows
    body = body.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    def grp(m):
        row = m.group(0)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) > 1 and re.fullmatch(r"\s*<em>.*</em>\s*", cells[0]) and all(not c.strip() for c in cells[1:]):
            return f'<tr class="group"><td colspan="{len(cells)}">{re.sub("</?em>", "", cells[0])}</td></tr>'
        return row
    body = re.sub(r"<tr>.*?</tr>", grp, body, flags=re.S)
    # spell / affinity meta lines that start with a band name
    body = re.sub(rf"<p><em>{BAND}\b", lambda m: f'<p><em><span class="chip {m.group(1).lower()}">{m.group(1)}</span>', body)
    # cross-book links
    body = re.sub(r'href="@(\w+)(#[^"]*)?"', lambda m: f'href="../{SHORT[m.group(1)]}/index.html{m.group(2) or ""}"', body)
    # heading ids + TOC
    seen, toc = {}, []
    def head(m):
        lvl, attrs, inner = int(m.group(1)), m.group(2) or "", m.group(3)
        idm = re.search(r'id="([^"]+)"', attrs)
        hid = idm.group(1) if idm else slugify(inner)
        base, n = hid, 2
        while hid in seen:
            hid = f"{base}-{n}"; n += 1
        seen[hid] = 1
        attrs = re.sub(r'\s*id="[^"]+"', "", attrs)
        if lvl <= 3:
            toc.append((lvl, hid, html.unescape(re.sub(r"<[^>]+>", "", re.sub(r'<span class="num">.*?</span>', "", inner))).strip()))
        anchor = f'<a class="anchor" href="#{hid}" aria-label="Link to this section">¶</a>' if lvl <= 4 else ""
        out = f'<h{lvl} id="{hid}"{attrs}>{inner}{anchor}</h{lvl}>'
        if lvl == 1:
            out += '<div class="meander partline"></div>'
        return out
    body = re.sub(r"<h([1-5])((?:\s+[^>]*)?)>(.*?)</h\1>", head, body, flags=re.S)
    return body, toc


def toc_html(toc):
    flat = "".join(f'<li class="l{l}"><a href="#{h}">{html.escape(t)}</a>' for l, h, t in toc)
    return fix_lists(flat)


def fix_lists(s):
    # Rebuild nesting robustly from the flat (level, link) sequence.
    items = re.findall(r'<li class="l(\d)">(<a [^>]+>.*?</a>)', s)
    root = {"children": [], "lvl": 0}
    path = [root]
    for lvl, a in items:
        lvl = int(lvl)
        while len(path) > 1 and path[-1]["lvl"] >= lvl:
            path.pop()
        node = {"lvl": lvl, "a": a, "children": []}
        path[-1]["children"].append(node); path.append(node)
    def emit(nodes, top=False):
        if not nodes:
            return ""
        inner = "".join(f'<li class="l{n["lvl"]}">{n["a"]}{emit(n["children"])}</li>' for n in nodes)
        return f'<ol class="toc" id="toc">{inner}</ol>' if top else f"<ol>{inner}</ol>"
    return emit(root["children"], top=True)


# ---------------------------------------------------------------- page
def read_book(path):
    raw = open(path, encoding="utf-8").read()
    meta = {}
    m = re.match(r"^---\n(.*?)\n---\n", raw, re.S)
    if m:
        for ln in m.group(1).split("\n"):
            if ":" in ln:
                k, v = ln.split(":", 1); meta[k.strip()] = v.strip()
        raw = raw[m.end():]
    return meta, raw


SEARCH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l4 4" stroke="currentColor" stroke-width="1.6"/></svg>'


def shelf(current):
    links = []
    for slug in BOOK_ORDER:
        cur = ' aria-current="page"' if slug == current else ""
        gm = ' class="gm"' if slug == "historian-handbook" else ""
        links.append(f'<a href="../{slug}/index.html"{cur}{gm}>{SHELF_LABEL[slug]}</a>')
    return "".join(links)


HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<script>try{{var t=new URLSearchParams(location.search).get('theme')||localStorage.getItem('agon-books-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}}catch(e){{}}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{prefix}books.css?v={v}">
</head>
"""


def topbar(current, with_toc=True):
    toc_btn = '<button class="iconbtn" id="tocToggle" aria-controls="side" aria-expanded="false">Contents</button>' if with_toc else ""
    return f"""<header class="topbar">
  {toc_btn}
  <a class="brand" href="../index.html">A<span>·</span>G<span>·</span>O<span>·</span>N</a>
  <nav class="shelf" aria-label="Books">{shelf(current)}</nav>
  <div class="spacer"></div>
  <button class="iconbtn" id="themeBtn" title="Switch light / dark">Theme: Auto</button>
</header>"""


def build_book(path):
    meta, raw = read_book(path)
    slug = meta["slug"]
    body = render_nodes(parse_blocks(raw.split("\n")))
    body, toc = postprocess(body)
    gm = meta.get("gm") == "true"
    page = HEAD.format(title=f'{meta["title"]} · Agon', prefix="../", v=VERSION) + f"""<body data-book="{slug}">
{topbar(slug)}
<div class="layout">
  <aside class="side" id="side" aria-label="Contents">
    <nav class="shelf-mobile" aria-label="Books">{shelf(slug)}</nav>
    <div class="search" role="search">
      {SEARCH_SVG}
      <input id="q" type="search" placeholder="Search this book…" autocomplete="off" aria-label="Search this book">
      <div class="hits" id="hits" aria-live="polite"></div>
    </div>
    <nav>{toc_html(toc)}</nav>
  </aside>
  <main>
    <header class="masthead{' gm' if gm else ''}">
      <div class="kicker">{html.escape(meta.get('kicker', 'Agon'))}</div>
      <h1>{html.escape(meta['title'])}</h1>
      <div class="sub">{html.escape(meta.get('sub', ''))}</div>
      <div class="meander"></div>
    </header>
    <article class="prose" id="content">
{body}
    </article>
    <footer class="bookfoot"><div class="meander"></div>Agon · {html.escape(meta['title'])} · v{VERSION}<br><small>Black-figure vignettes and diagrams were drawn for Agon. Historical prints are public domain (CC0) from The Metropolitan Museum of Art's Open Access collection.</small></footer>
  </main>
</div>
<script src="../books.js?v={VERSION}"></script>
</body>
</html>
"""
    os.makedirs(os.path.join(SITE, slug), exist_ok=True)
    with open(os.path.join(SITE, slug, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    return meta, len(toc)


def build_library(metas):
    cards = []
    for slug in BOOK_ORDER:
        m = metas[slug]
        gm = " gm" if m.get("gm") == "true" else ""
        cards.append(f"""<a class="bookcard panel{gm}" href="{slug}/index.html"><div class="kicker">{html.escape(m.get('kicker',''))}</div>
<h2>{html.escape(m['title'])}</h2><p>{html.escape(m.get('blurb', m.get('sub','')))}</p></a>""")
    page = HEAD.format(title="Agon · The Library", prefix="", v=VERSION) + f"""<body>
<header class="topbar"><a class="brand" href="index.html">A<span>·</span>G<span>·</span>O<span>·</span>N</a><div class="spacer"></div>
<button class="iconbtn" id="themeBtn">Theme: Auto</button></header>
<div class="library">
  <header class="masthead"><div class="kicker">The rules of the Great Game</div><h1>The Library</h1>
  <div class="sub">A tabletop roleplaying game of demi-gods, their Aegis, and the swords that hang above them.</div><div class="meander"></div></header>
  <div class="grid">{''.join(cards)}</div>
</div>
<script src="books.js?v={VERSION}"></script>
</body></html>"""
    with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)


if __name__ == "__main__":
    metas = {}
    for slug in BOOK_ORDER:
        p = os.path.join(BOOKS_DIR, slug + ".md")
        if os.path.exists(p):
            meta, n = build_book(p)
            metas[slug] = meta
            print(f"built {slug}: {n} contents entries")
    if len(metas) == len(BOOK_ORDER):
        build_library(metas)
        print("built library index")
