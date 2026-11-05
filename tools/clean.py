"""Strip Homebrewery page-layout markup from the Agon V1 source and emit plain
"Agon markdown": standard markdown plus fenced blocks (:::note, :::sidebar,
:::monster, :::credit) that build.py understands.

Usage: python3 clean.py SRC START END > out.md   (1-based inclusive line range)
"""
import re, sys

BLOCK_MAP = {
    "note": "note", "descriptive": "sidebar", "monster": "monster",
    "purple": "sidebar", "artist": "credit",
}
UNWRAP = {"wide", "keep", "toc", "width", "margin-top"}

def block_kind(line):
    m = re.match(r"^\s*\{\{([a-zA-Z-]+)", line)
    return m.group(1) if m else None

def clean(lines):
    out, stack = [], []
    skip_style = False
    for raw in lines:
        line = raw.rstrip("\n")
        s = line.strip()
        if skip_style:
            if s.startswith("</style>"):
                skip_style = False
            continue
        if s.startswith("<style"):
            skip_style = True
            continue
        if s in ("\\page", "\\column", ":", "::"):
            out.append("")
            continue
        if re.match(r"^\{\{(pageNumber|footnote|width|margin-top)[^}]*\}\}\s*$", s):
            continue
        # positioned <img> → figure
        m = re.match(r"^<img src='([^']+)'", s)
        if m:
            out.append(f"![]({m.group(1)})")
            continue
        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*\{[^}]*\}\s*$", s)
        if m:
            out.append(f"![{m.group(1)}]({m.group(2)})")
            continue
        # block open (not closed on the same line)
        k = block_kind(s)
        if k and not s.endswith("}}"):
            kind = BLOCK_MAP.get(k.split(",")[0], None)
            if k in UNWRAP or kind is None:
                stack.append(None)
            else:
                stack.append(kind)
                out.append(f":::{kind}")
            continue
        if s == "}}" and stack:
            kind = stack.pop()
            if kind:
                out.append(":::")
            continue
        # inline cleanup
        line = re.sub(r"\{color:[^}]*\}", "", line)
        line = re.sub(r"\{\{fa[rs],[^}]*\}\}", "", line)
        line = line.replace("'o |", "o |").replace("'o\n", "o")
        line = re.sub(r"(\d)'o\b", r"\1o", line)
        out.append(line.rstrip())
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"

if __name__ == "__main__":
    src, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    with open(src, encoding="utf-8") as f:
        lines = f.readlines()[a - 1:b]
    sys.stdout.write(clean(lines))
