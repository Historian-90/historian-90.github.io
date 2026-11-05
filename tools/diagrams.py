"""Draw the theme-aware rules diagrams (they use the page's CSS variables, so build.py inlines them).
   python3 tools/diagrams.py -> site/art/attribute-triangle.svg, site/art/theion-gauge.svg
"""
import math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site", "art")
DISPLAY = 'font-family="Cinzel, Georgia, serif"'
LABEL = 'font-family="EB Garamond, Georgia, serif"'


def P(p):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in p)


def triangle():
    W, H, cx, top, base = 760, 640, 380, 50, 540
    V = [(cx, top), (cx - 290, base), (cx + 290, base)]
    c = (cx, 330)
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="The Attribute Triangle: Body, Mind and Soul, each with three traits of up to four points"><title>The Attribute Triangle</title>',
         f'<polygon points="{P(V)}" fill="var(--panel)" stroke="var(--rule)" stroke-width="3" stroke-linejoin="round"/>']
    for a, b in ((V[0], V[1]), (V[0], V[2]), (V[1], V[2])):
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        s.append(f'<line x1="{c[0]}" y1="{c[1]}" x2="{m[0]:.1f}" y2="{m[1]:.1f}" stroke="var(--hair)" stroke-width="2" stroke-dasharray="6 6"/>')
    blocks = [("BODY", [("Agility", 1), ("Strength", 4), ("Endurance", 1)], cx + 10, 165),
              ("MIND", [("Reasoning", 0), ("Wit", 0), ("Perception", 0)], cx - 108, 405),
              ("SOUL", [("Intuition", 0), ("Power", 0), ("Creativity", 0)], cx + 165, 405)]
    for name, traits, bx, by in blocks:
        s.append(f'<text x="{bx-14}" y="{by}" text-anchor="middle" {DISPLAY} font-size="22" font-weight="700" letter-spacing="3" fill="var(--accent)">{name}</text>')
        for i, (t, n) in enumerate(traits):
            ty = by + 32 + i * 30
            s.append(f'<text x="{bx-50}" y="{ty}" text-anchor="end" {LABEL} font-size="19" fill="var(--ink)">{t}</text>')
            for k in range(4):
                fill = "var(--ink)" if k < n else "none"
                s.append(f'<circle cx="{bx-36+k*20}" cy="{ty-6}" r="7" fill="{fill}" stroke="var(--ink)" stroke-width="1.8"/>')
    s += [f'<circle cx="{c[0]}" cy="{c[1]}" r="34" fill="var(--paper)" stroke="var(--accent)" stroke-width="3"/>',
          f'<text x="{c[0]}" y="{c[1]-6}" text-anchor="middle" {DISPLAY} font-size="11" letter-spacing="2" fill="var(--muted)">LEVEL</text>',
          f'<text x="{c[0]}" y="{c[1]+20}" text-anchor="middle" {DISPLAY} font-size="24" font-weight="700" fill="var(--ink)">3</text>',
          f'<text x="{cx}" y="{H-50}" text-anchor="middle" {LABEL} font-style="italic" font-size="17" fill="var(--muted)">Example: a level 3 character with Strength 4, Agility 1, and Endurance 1,</text>',
          f'<text x="{cx}" y="{H-26}" text-anchor="middle" {LABEL} font-style="italic" font-size="17" fill="var(--muted)">all 6 of their Body points spent</text>', '</svg>']
    return "\n".join(s)


def gauge():
    W, H, cx, cy = 760, 475, 250, 235
    bands = [("Húdōr", "Blue", "--b-blue", 2, 2), ("Aéras", "Green", "--b-green", 3, 3),
             ("Líthos", "Yellow", "--b-yellow", 4, 3), ("Photia", "Red", "--b-red", 5, 3)]
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="The Theion Gauge: four rings; Blue fills in 2 rounds, Green 3, Yellow 4, Red 5"><title>The Theion Gauge</title>',
         f'<circle cx="{cx}" cy="{cy}" r="215" fill="var(--panel)" stroke="var(--rule)" stroke-width="3"/>',
         f'<circle cx="{cx}" cy="{cy}" r="207" fill="none" stroke="var(--rule)" stroke-width="1" opacity=".5"/>']

    def arc(r0, r1, a0, a1):
        p = lambda r, a: (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        large = 1 if (a1 - a0) > 180 else 0
        (x0, y0), (x1, y1), (x2, y2), (x3, y3) = p(r1, a0), p(r1, a1), p(r0, a1), p(r0, a0)
        return f"M{x0:.1f},{y0:.1f} A{r1},{r1} 0 {large} 1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} A{r0},{r0} 0 {large} 0 {x3:.1f},{y3:.1f} Z"

    for i, (gk, col, var, n, filled) in enumerate(bands):
        r1 = 190 - i * 40
        r0 = r1 - 30
        for k in range(n):
            a0, a1 = -90 + k * 360 / n + 2, -90 + (k + 1) * 360 / n - 2
            op = 1 if k < filled else .14
            s.append(f'<path d="{arc(r0, r1, a0, a1)}" fill="var({var})" fill-opacity="{op}" stroke="var({var})" stroke-width="1.5"/>')
    s += [f'<circle cx="{cx}" cy="{cy}" r="26" fill="var(--paper)" stroke="var(--rule)" stroke-width="2"/>',
          f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy-205}" stroke="var(--ink)" stroke-width="3"/>',
          f'<circle cx="{cx}" cy="{cy}" r="7" fill="var(--ink)"/>',
          f'<text x="500" y="62" {DISPLAY} font-size="15" letter-spacing="2" fill="var(--muted)">BAND · FULL AFTER</text>']
    for i, (gk, col, var, n, _) in enumerate(bands):
        y = 110 + i * 78
        s += [f'<rect x="500" y="{y-22}" width="26" height="26" rx="3" fill="var({var})"/>',
              f'<text x="540" y="{y-2}" {DISPLAY} font-size="21" font-weight="700" fill="var(--ink)">{col}</text>',
              f'<text x="540" y="{y+24}" {LABEL} font-size="19" fill="var(--muted)"><tspan font-style="italic">{gk}</tspan> · {n} rounds</text>']
    s += [f'<text x="{W/2}" y="{H-4}" text-anchor="middle" {LABEL} font-style="italic" font-size="17" fill="var(--muted)">After round 3: Blue and Green are full; Yellow and Red are still filling</text>', '</svg>']
    return "\n".join(s)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "attribute-triangle.svg"), "w").write(triangle())
    open(os.path.join(OUT, "theion-gauge.svg"), "w").write(gauge())
    print("diagrams written")
