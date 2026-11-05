"""Generate the Agon black-figure vignettes (Greek Geometric style) as SVG friezes.
   python3 tools/vignettes.py  -> site/art/*.svg
Clay ground, black figures, incised clay-colored lines, added red/white like real black-figure ware.
"""
import math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site", "art")
W, H = 1200, 440
CLAY, BLACK, RED, WHITE, INC = "#c8703f", "#1b130e", "#8f2f1c", "#f1e3c6", "#c8703f"
TOP, BOT = 40, H - 40          # frieze band limits; ground line at BOT

def f(n):
    return f"{n:.1f}".rstrip("0").rstrip(".")

def P(pts):
    return " ".join(f"{f(x)},{f(y)}" for x, y in pts)

# ------------------------------------------------------------------ frame
def meander_band(y, h=26):
    """Running meander (key) band, black on clay, between two rules."""
    s = [f'<rect x="0" y="{y}" width="{W}" height="{h}" fill="{CLAY}"/>',
         f'<rect x="0" y="{y}" width="{W}" height="3" fill="{BLACK}"/>',
         f'<rect x="0" y="{y+h-3}" width="{W}" height="3" fill="{BLACK}"/>']
    u = h - 10          # unit height
    step = u + 6
    x = 4
    d = []
    while x < W:
        x0, y0 = x, y + 5
        d.append(f"M{x0},{y0+u} V{y0} H{x0+u} V{y0+u-6} H{x0+6} V{y0+6}")
        x += step
    s.append(f'<path d="{" ".join(d)}" fill="none" stroke="{BLACK}" stroke-width="3" stroke-linecap="square"/>')
    return "\n".join(s)

def frame(body, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{title}">
<title>{title}</title>
<rect width="{W}" height="{H}" fill="{CLAY}"/>
<radialGradient id="glaze" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
{meander_band(0, 34)}
{meander_band(H-34, 34)}
<line x1="0" y1="{BOT}" x2="{W}" y2="{BOT}" stroke="{BLACK}" stroke-width="5"/>
{body}
<rect y="34" width="{W}" height="{H-68}" fill="url(#glaze)"/>
</svg>'''

# ------------------------------------------------------------------ primitives
def circle(cx, cy, r, fill=BLACK, extra=""):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}" {extra}/>'

def line(x1, y1, x2, y2, w=6, c=BLACK, cap="round"):
    return f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{c}" stroke-width="{w}" stroke-linecap="{cap}"/>'

def poly(pts, fill=BLACK, extra=""):
    return f'<polygon points="{P(pts)}" fill="{fill}" {extra}/>'

def path(d, fill=BLACK, stroke="none", w=0, extra=""):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" {extra}/>'

def person(x, ground=BOT, h=230, face=1, arms=None, crest=True, ears=False, stride=1.0, legs=True, kneel=False):
    """Geometric-style figure. face=1 looks right, -1 left.
    arms: list of (angle_deg from shoulder, length factor) in figure space (0 = forward horizontal, 90 = up)."""
    s = h / 230
    out = []
    hip_y = ground - 120 * s if not kneel else ground - 70 * s
    sh_y = hip_y - 78 * s
    neck_y = sh_y - 6 * s
    head_r = 17 * s
    head = (x + 4 * s * face, neck_y - head_r - 2 * s)
    # legs
    if legs:
        if kneel:
            out.append(poly([(x - 6*s, hip_y), (x + 6*s, hip_y), (x + 40*s*face, ground - 8*s), (x + 26*s*face, ground)]))
            out.append(poly([(x - 4*s, hip_y), (x + 8*s, hip_y), (x - 20*s*face, ground - 10*s), (x - 34*s*face, ground)]))
            out.append(line(x - 34*s*face, ground - 3*s, x - 58*s*face, ground - 3*s, 7*s))
        else:
            sp = 34 * s * stride
            for dx, k in ((sp * face, 1), (-sp * 0.8 * face, -1)):
                knee = (x + dx * 0.55, hip_y + 62 * s)
                foot = (x + dx, ground - 2 * s)
                out.append(poly([(x - 7*s, hip_y), (x + 7*s, hip_y), (knee[0] + 7*s, knee[1]), (foot[0] + 5*s, foot[1]), (foot[0] - 5*s, foot[1]), (knee[0] - 7*s, knee[1])]))
                out.append(circle(knee[0], knee[1] + 20*s, 8*s))      # calf swell
                out.append(line(foot[0], foot[1], foot[0] + 16*s*face, foot[1], 6*s))
    # torso: inverted triangle (Geometric)
    out.append(poly([(x - 34*s, sh_y), (x + 34*s, sh_y), (x + 4*s, hip_y), (x - 4*s, hip_y)]))
    # neck + head
    out.append(line(x + 2*s*face, sh_y, head[0], head[1], 9*s))
    out.append(circle(head[0], head[1], head_r))
    out.append(poly([(head[0] + head_r*0.9*face, head[1] - 2*s), (head[0] + (head_r + 9*s)*face, head[1] + 4*s), (head[0] + head_r*0.6*face, head[1] + 9*s)]))  # nose/beard
    out.append(circle(head[0] + 6*s*face, head[1] - 3*s, 2.6*s, CLAY))  # reserved eye
    if crest:
        out.append(path(f"M{f(head[0]-4*s*face)},{f(head[1]-head_r+2*s)} q{f(-30*s*face)},{f(-26*s)} {f(-54*s*face)},{f(-4*s)} q{f(-10*s*face)},{f(16*s)} {f(-8*s*face)},{f(26*s)}", fill="none", stroke=BLACK, w=7*s))
    if ears:
        out.append(poly([(head[0] - 10*s, head[1] - 12*s), (head[0] - 2*s, head[1] - 34*s), (head[0] + 4*s, head[1] - 14*s)]))
        out.append(poly([(head[0] + 6*s, head[1] - 14*s), (head[0] + 14*s, head[1] - 33*s), (head[0] + 18*s, head[1] - 10*s)]))
    # arms
    hands = []
    for ang, ln in (arms or [(-60, 1), (-100, 1)]):
        a = math.radians(ang)
        sx = x + 26 * s * face * (1 if math.cos(a) >= -0.05 else -1)
        ex = sx + math.cos(a) * 82 * s * ln * face
        ey = sh_y + 4 * s - math.sin(a) * 82 * s * ln
        out.append(line(sx, sh_y + 4*s, ex, ey, 8*s))
        hands.append((ex, ey))
    return "\n".join(out), {"head": head, "hands": hands, "sh": (x, sh_y), "hip": (x, hip_y), "s": s}

def round_shield(cx, cy, r):
    return "\n".join([circle(cx, cy, r), f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r-7)}" fill="none" stroke="{INC}" stroke-width="2.5"/>',
                      f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*0.38)}" fill="{RED}"/>'])

def spear(x1, y1, x2, y2):
    a = math.atan2(y2 - y1, x2 - x1)
    tip = (x2 + math.cos(a) * 26, y2 + math.sin(a) * 26)
    l, r = (x2 + math.cos(a + 1.9) * 9, y2 + math.sin(a + 1.9) * 9), (x2 + math.cos(a - 1.9) * 9, y2 + math.sin(a - 1.9) * 9)
    return line(x1, y1, x2, y2, 5) + poly([tip, l, r])

def sword(x, y, ang, L=120, fill=BLACK):
    a = math.radians(ang)
    dx, dy = math.cos(a), -math.sin(a)
    px, py = -dy, dx
    tip = (x + dx * L, y + dy * L)
    base = [(x + px * 9, y + py * 9), (x + dx * L * .62 + px * 12, y + dy * L * .62 + py * 12), tip,
            (x + dx * L * .62 - px * 12, y + dy * L * .62 - py * 12), (x - px * 9, y - py * 9)]
    guard = line(x + px * 20, y + py * 20, x - px * 20, y - py * 20, 7, fill)
    grip = line(x, y, x - dx * 26, y - dy * 26, 8, fill)
    return poly(base, fill) + guard + grip + f'<line x1="{f(x+dx*10)}" y1="{f(y+dy*10)}" x2="{f(x+dx*L*.8)}" y2="{f(y+dy*L*.8)}" stroke="{INC}" stroke-width="2"/>'

def bird(x, y, s=1):
    return path(f"M{x},{y} q{12*s},{-12*s} {24*s},0 q{12*s},{-12*s} {24*s},0", fill="none", stroke=BLACK, w=4)

def dots(x1, y1, x2, y2, n, r=4, c=BLACK):
    return "".join(circle(x1 + (x2 - x1) * i / (n - 1), y1 + (y2 - y1) * i / (n - 1), r, c) for i in range(n))

def rosette(cx, cy, r=14):
    out = [circle(cx, cy, r * .35)]
    for i in range(8):
        a = i * math.pi / 4
        out.append(circle(cx + math.cos(a) * r * .75, cy + math.sin(a) * r * .75, r * .22))
    return "".join(out)

def filler(xs, y=95):
    return "".join(rosette(x, y, 12) for x in xs)

def column(x, top, broken=False, w=34):
    out = [f'<rect x="{f(x-w/2)}" y="{f(top)}" width="{w}" height="{f(BOT-top)}" fill="{BLACK}"/>']
    for k in (-8, 0, 8):
        out.append(line(x + k, top + 12, x + k, BOT - 10, 2, INC, "butt"))
    if broken:
        out.append(poly([(x - w/2, top), (x - 4, top - 18), (x + 6, top - 6), (x + w/2, top - 22), (x + w/2, top)]))
    else:
        out.append(f'<rect x="{f(x-w/2-10)}" y="{f(top-14)}" width="{w+20}" height="14" fill="{BLACK}"/>')
    return "".join(out)

def d20(cx, cy, r, fill=WHITE):
    pts = [(cx + r * math.cos(math.radians(90 + 60 * i)), cy - r * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    inner = [(cx, cy - r * .5), (cx + r * .45, cy + r * .28), (cx - r * .45, cy + r * .28)]
    s = poly(pts, fill, f'stroke="{BLACK}" stroke-width="3"') + poly(inner, "none", f'stroke="{BLACK}" stroke-width="2.5"')
    for p in pts[::1]:
        q = min(inner, key=lambda t: (t[0] - p[0]) ** 2 + (t[1] - p[1]) ** 2)
        s += line(p[0], p[1], q[0], q[1], 2, BLACK)
    return s

def crystal(cx, cy, s=1, fill=WHITE):
    return poly([(cx, cy - 22*s), (cx + 9*s, cy - 4*s), (cx + 5*s, cy + 12*s), (cx - 6*s, cy + 12*s), (cx - 10*s, cy - 2*s)], fill, f'stroke="{BLACK}" stroke-width="2.5"') + \
        line(cx, cy - 22*s, cx - 1*s, cy + 12*s, 1.5)

# ------------------------------------------------------------------ scenes
def nomansland():
    b = []
    b.append(column(150, 210, broken=True)); b.append(column(230, 250, broken=True)); b.append(column(310, 180))
    b.append(poly([(130, BOT), (360, BOT), (350, BOT - 14), (140, BOT - 14)]))  # stylobate rubble
    # tilted satellite dish
    b.append(path(f"M820,{BOT} l40,-120 l40,120 z"))
    b.append(path("M760,210 q120,-90 220,40 q-120,40 -220,-40 z", fill=BLACK))
    b.append(path("M772,214 q110,-70 196,34", fill="none", stroke=INC, w=2.5))
    b.append(line(860, 236, 860, 300, 9)); b.append(line(870, 222, 905, 160, 5)); b.append(circle(907, 156, 9, RED))
    b.append(poly([(745, BOT), (980, BOT), (960, BOT - 12), (770, BOT - 16)]))
    # lone traveler with spear
    fig, k = person(560, h=210, face=1, arms=[(-40, 1), (-110, .8)], stride=1.2)
    b.append(fig)
    hx, hy = k["hands"][0]
    b.append(spear(hx - 70, hy + 60, hx + 40, hy - 50))
    b.append(round_shield(k["sh"][0] - 26, k["sh"][1] + 40, 34))
    b.append(bird(420, 110)); b.append(bird(470, 90, .8)); b.append(bird(1040, 120))
    b.append(filler([60, 1120]))
    return frame("\n".join(b), "A traveler crosses the wilds past broken columns and a fallen satellite dish")

def exchange():
    b = []
    # balance (homage to the Taleides weighing scene)
    b.append(line(600, 90, 600, BOT, 9)); b.append(poly([(560, BOT), (640, BOT), (600, BOT - 30)]))
    b.append(line(470, 120, 730, 100, 8)); b.append(circle(600, 110, 9, RED))
    for px, py in ((470, 120), (730, 100)):
        b.append(line(px, py, px - 34, py + 70, 2.5)); b.append(line(px, py, px + 34, py + 70, 2.5))
        b.append(path(f"M{px-44},{py+70} h88 q-10,26 -44,26 q-34,0 -44,-26 z"))
    # crystals on left pan, obol "coins" (rings) on right pan
    for i, cx in enumerate((448, 470, 492)):
        b.append(crystal(cx, 168 - (i == 1) * 8, .9))
    for i in range(3):
        b.append(f'<circle cx="{712 + i*18}" cy="{158 - i*2}" r="9" fill="{RED}" stroke="{BLACK}" stroke-width="2.5"/>')
    # seller with a sack of crystals
    fig, k = person(300, h=225, face=1, arms=[(-10, 1), (-70, .8)])
    b.append(fig)
    hx, hy = k["hands"][1]
    b.append(path(f"M{f(hx-20)},{f(hy)} q-20,40 10,60 q40,10 40,-30 q-10,-30 -50,-30 z"))
    b.append(crystal(hx + 8, hy - 6, .8))
    # clerk behind a terminal
    fig2, k2 = person(900, h=225, face=-1, arms=[(-20, .9), (-60, .7)], crest=False)
    b.append(fig2)
    b.append(f'<rect x="760" y="{BOT-150}" width="80" height="150" fill="{BLACK}"/>')
    b.append(f'<rect x="770" y="{BOT-140}" width="60" height="44" fill="{WHITE}" stroke="{BLACK}" stroke-width="3"/>')
    b.append(dots(778, BOT - 118, 822, BOT - 118, 5, 3.5, BLACK))
    b.append(line(800, BOT - 150, 800, BOT - 190, 4)); b.append(circle(800, BOT - 194, 6, RED))
    b.append(filler([90, 1110, 200, 1000]))
    return frame("\n".join(b), "Didra crystals are weighed against obol at an exchange")

def covenant():
    b = []
    # Aegis (with feline ears) dissolving into a sword that flies to the master's hand
    fig, k = person(250, h=225, face=1, arms=[(-30, .9), (40, .9)], crest=False, ears=True)
    b.append(fig)
    # dissolving trail
    for i in range(14):
        t = i / 13
        x = 330 + t * 380
        y = 170 + math.sin(t * math.pi * 2) * 34 - t * 20
        b.append(circle(x, y, 9 - t * 5, BLACK if i % 3 else RED))
    # flying sword
    b.append(sword(700, 150, 10, 130))
    # master reaching
    fig2, k2 = person(960, h=235, face=-1, arms=[(15, 1.05), (-70, .8)])
    b.append(fig2)
    b.append(round_shield(k2["sh"][0] + 30, k2["sh"][1] + 50, 40))
    b.append(filler([80, 1120, 560]))
    return frame("\n".join(b), "An Aegis becomes a sword and flies to its master's hand")

def resurrection():
    b = []
    # altar with flames
    b.append(f'<rect x="545" y="{BOT-120}" width="110" height="120" fill="{BLACK}"/>')
    b.append(f'<rect x="530" y="{BOT-134}" width="140" height="16" fill="{BLACK}"/>')
    b.append(line(560, BOT - 90, 640, BOT - 90, 3, INC)); b.append(line(560, BOT - 60, 640, BOT - 60, 3, INC))
    for dx, hgt in ((-35, 50), (-10, 80), (15, 62), (38, 44)):
        b.append(path(f"M{600+dx-14},{BOT-134} q8,{-hgt*0.6} 14,{-hgt} q6,{hgt*0.5} 14,{hgt} z", fill=RED, stroke=BLACK, w=3))
    # sun disc above
    b.append(circle(600, 110, 34)); b.append(f'<circle cx="600" cy="110" r="24" fill="none" stroke="{INC}" stroke-width="2.5"/>')
    for i in range(12):
        a = i * math.pi / 6
        b.append(line(600 + math.cos(a) * 44, 110 + math.sin(a) * 44, 600 + math.cos(a) * 58, 110 + math.sin(a) * 58, 5))
    # dissipating figure (left), only scattered dots below the waist
    fig, k = person(300, h=220, face=1, arms=[(-120, .9), (-60, .9)], legs=False)
    b.append(fig)
    for i in range(30):
        x = 270 + (i * 37) % 90 + (i % 3) * 6
        y = k["hip"][1] + 10 + (i * 53) % 110
        b.append(circle(x + i * 2, y, 5 - (i % 3), BLACK))
    # risen figure (right), arms raised
    fig2, k2 = person(880, h=235, face=-1, arms=[(70, .95), (110, .95)])
    b.append(fig2)
    b.append(dots(700, 200, 820, 140, 7, 5, RED))
    b.append(filler([90, 1110]))
    return frame("\n".join(b), "A dissipated demi-god rises again at a blessed altar")

def game():
    b = []
    # Homage to Exekias: two warriors bent over a game, spears behind, shields resting
    b.append(f'<rect x="560" y="{BOT-110}" width="80" height="110" fill="{BLACK}"/>')
    b.append(line(570, BOT - 80, 630, BOT - 80, 2.5, INC))
    b.append(d20(600, BOT - 140, 26))
    for side in (-1, 1):
        x = 600 - side * 210
        fig, k = person(x, h=225, face=side, arms=[(-35, 1.0), (-15, .9)], kneel=True)
        b.append(fig)
        sx = x - side * 70
        b.append(spear(sx, BOT, sx + side * 40, 70))
        b.append(round_shield(x - side * 150, BOT - 70, 62))
    b.append(filler([600, 80, 1120]))
    return frame("\n".join(b), "Two warriors play at a game board with a twenty-sided die")

def renown():
    b = []
    # a champion on a plinth, crowd hailing; modern visored helm and rifle
    b.append(f'<rect x="520" y="{BOT-60}" width="160" height="60" fill="{BLACK}"/>')
    b.append(line(530, BOT - 30, 670, BOT - 30, 3, INC))
    fig, k = person(600, ground=BOT - 60, h=230, face=1, arms=[(80, 1.0), (-70, .8)])
    b.append(fig)
    hx, hy = k["hands"][0]
    b.append(f'<rect x="{f(hx-6)}" y="{f(hy-70)}" width="10" height="80" fill="{BLACK}"/>')    # banner pole
    b.append(path(f"M{f(hx+4)},{f(hy-70)} h70 l-14,22 l14,22 h-70 z", fill=RED, stroke=BLACK, w=3))
    # rifle slung
    rx, ry = k["hands"][1]
    b.append(poly([(rx - 70, ry - 10), (rx + 40, ry - 30), (rx + 44, ry - 20), (rx - 66, ry)]))
    b.append(line(rx - 30, ry - 14, rx - 36, ry + 14, 6))
    # visor band on helmet
    hx2, hy2 = k["head"]
    b.append(line(hx2 - 6, hy2 - 2, hx2 + 18, hy2 - 2, 4, INC))
    for x, face in ((240, 1), (360, 1), (840, -1), (960, -1)):
        f2, _ = person(x, h=170, face=face, arms=[(75, .9), (60, .8)], crest=(x in (240, 960)))
        b.append(f2)
    b.append(filler([90, 1110, 470, 730]))
    return frame("\n".join(b), "A champion is hailed by the crowd")

def divine():
    b = []
    # demi-god channels lightning and fire; above, a sword hangs by a thread
    b.append(line(600, 34, 600, 52, 1.6))
    b.append(sword(600, 52, -90, 92))
    fig, k = person(600, h=200, face=1, arms=[(30, 1.0), (150, 1.0)], crest=True)
    b.append(fig)
    (rx, ry), (lx, ly) = k["hands"]
    zig = [(rx, ry), (rx + 60, ry - 30), (rx + 40, ry + 6), (rx + 130, ry - 40), (rx + 105, ry), (rx + 230, ry - 52)]
    b.append(f'<polyline points="{P(zig)}" fill="none" stroke="{BLACK}" stroke-width="10" stroke-linejoin="miter"/>')
    b.append(f'<polyline points="{P(zig)}" fill="none" stroke="{WHITE}" stroke-width="3"/>')
    sx, sy = k["sh"][0] - 26 * k["s"], k["sh"][1]
    dx, dy = lx - sx, ly - sy
    n = math.hypot(dx, dy); dx, dy = dx / n, dy / n
    for i, s_ in enumerate((1.15, .95, .8, .62)):
        cx, cy = lx + dx * (34 + i * 52), ly + dy * (34 + i * 52) + 14
        b.append(path(f"M{f(cx-18*s_)},{f(cy+20*s_)} q{f(4*s_)},{f(-34*s_)} {f(18*s_)},{f(-52*s_)} q{f(14*s_)},{f(18*s_)} {f(18*s_)},{f(52*s_)} z", fill=RED, stroke=BLACK, w=3))
    b.append(filler([90, 1110]))
    return frame("\n".join(b), "A demi-god calls lightning and fire while a sword hangs above by a thread")

SCENES = {"no-mans-land": nomansland, "exchange": exchange, "covenant": covenant, "resurrection": resurrection,
          "game": game, "renown": renown, "divine-power": divine}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SCENES.items():
        with open(os.path.join(OUT, f"{name}.svg"), "w") as fh:
            fh.write(fn())
        print("wrote", name)
