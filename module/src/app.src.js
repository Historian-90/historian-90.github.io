// Agon Module — the Historian's module reader.
// Module text lives ONLY in this browser's storage. Nothing is written to the room.
import OBR from "@owlbear-rodeo/sdk";
import { marked } from "marked";
import * as yaml from "js-yaml";

const VERSION = "1.2.1";
const POP = "com.agon.module/popover";
const BOOKS = {
  player: "/books/player-handbook/index.html",
  historian: "/books/historian-handbook/index.html",
  lore: "/books/world-lore/index.html",
};
const chan = (() => { try { return new BroadcastChannel("agon-module"); } catch { return null; } })();
const inOBR = OBR.isAvailable;
const INIT_KEY = "rodeo.owlbear.initiative-tracker/metadata";
const CARD_KEY = "com.agon/card";
// Appendix 3 statuses: [name, boon|curse, resisting trait]
const STATUSES = [["Regenerating", "boon", ""], ["Shielded", "boon", ""], ["Nimble", "boon", ""], ["Bleeding", "curse", "End"], ["Burning", "curse", "End"], ["Poisoned", "curse", "End"], ["Stunned", "curse", "End"], ["Frail", "curse", "End"], ["Slowed", "curse", "Str"], ["Bound", "curse", "Agi"], ["Prone", "curse", "Agi"], ["Blinded", "curse", "Per"], ["Deafened", "curse", "Per"], ["Silenced", "curse", "Pwr"], ["Charmed", "curse", "Wit"], ["Amnesia", "curse", "Rsn"], ["Doomed", "curse", "Int"]];
const TRAIT = { agi: "agility", str: "strength", end: "endurance", per: "perception", wit: "wit", rsn: "reasoning", rea: "reasoning", int: "intuition", pwr: "power", pow: "power", cre: "creativity" };
const traitKey = (s) => TRAIT[String(s).slice(0, 3).toLowerCase()] || null;
const ELEMENTS = ["Fire", "Ice", "Water", "Earth", "Wind", "Lightning", "Metal", "Light", "Shadow"];
const STRONG = { Fire: "Ice", Water: "Fire", Earth: "Lightning", Wind: "Earth", Lightning: "Metal", Ice: "Water", Metal: "Wind", Light: "Shadow" };
let party = [];        // [{id, name, card}] from tokens linked to Agon sheets
let lastVs = null;     // last resolved roll vs a target (shown in the side panel)

/* ---------------- storage ---------------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const prefs = Object.assign({ theme: "auto", size: "full", tab: "scenes", peek: true }, LS.get("agon-module:prefs", {}));
const savePrefs = () => LS.set("agon-module:prefs", prefs);
let lib = LS.get("agon-module:lib", { active: null, items: {} });
const saveLib = () => LS.set("agon-module:lib", lib) || toast("Browser storage is full or blocked.");

let M = null;          // parsed module
let S = null;          // per-module play state
let modKey = null;
let view = { kind: "overview" };
const back = [], fwd = [];
let peekId = null;
let rolls = LS.get("agon-module:rolls", []);   // private roll history, kept across close/reopen
const ROLL_CAP = 300;
const saveRolls = () => LS.set("agon-module:rolls", rolls);
// UI state that survives closing the popover (Owlbear destroys the iframe on close)
function saveUI() { if (!S) return; S.ui = { peekId, lastVs, main: $("#main")?.scrollTop || 0, side: $("#side .sbody")?.scrollTop || 0, peek: $("#peek")?.scrollTop || 0 }; saveState(); }
let uiTimer = null; const saveUISoon = () => { clearTimeout(uiTimer); uiTimer = setTimeout(saveUI, 250); };
function setPeek(id) { peekId = id; renderPeek(); saveUI(); }
let curScene, routeIdx = 0;

const blankState = () => ({ flags: {}, clocks: {}, notes: {}, combat: [], log: [], visited: {}, view: null, open: {}, target: "" });
const saveState = () => modKey && LS.set("agon-module:state:" + modKey, S);

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const md = (s) => renderMd(String(s ?? ""));
const mdInline = (s) => marked.parseInline(wiki(String(s ?? "")));
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/* ---------------- dice ---------------- */
const rnd = (n) => 1 + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * n);
function rollExpr(expr, label, opts = {}) {
  const clean = String(expr).replace(/[−–]/g, "-").replace(/\s+/g, "").toLowerCase();
  if (!/^[0-9d+\-]+$/.test(clean) || !/d\d/.test(clean)) { toast("Can't roll “" + expr + "”"); return null; }
  let total = 0; const parts = []; let nat = null;
  for (const term of clean.match(/[+\-]?[^+\-]+/g)) {
    const sign = term[0] === "-" ? -1 : 1;
    const t = term.replace(/^[+\-]/, "");
    const m = t.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = Math.min(+(m[1] || 1), 100), f = +m[2];
      const r = Array.from({ length: n }, () => rnd(f));
      if (f === 20 && n === 1) nat = r[0];
      total += sign * r.reduce((a, b) => a + b, 0);
      parts.push((sign < 0 ? "−" : "") + `${n}d${f}[${r.join(",")}]`);
    } else if (/^\d+$/.test(t)) { total += sign * +t; parts.push((sign < 0 ? "− " : "+ ") + t); }
  }
  const r = { label: label || expr, expr, total, detail: parts.join(" "), nat, crit: opts.crit, at: Date.now() };
  rolls.unshift(r); rolls = rolls.slice(0, ROLL_CAP); saveRolls();
  renderTray(true);
  return r;
}
function natNote(r) {
  if (r.nat == null) return "";
  if (r.nat === 20) return `<em class="dvn">Divine Strike / Critical Success</em>`;
  if (r.crit && r.nat >= r.crit) return `<em class="crt">nat ${r.nat}: in crit range</em>`;
  return `<em>nat ${r.nat}</em>`;
}

/* ---------------- parsing ---------------- */
// Directive blocks:  :::type args  ... :::   (may nest)
function extractBlocks(text) {
  const lines = text.split("\n"); const out = []; const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^:::\s*([a-z][\w-]*)\s*(.*)$/i);
    if (!m) { out.push(lines[i]); continue; }
    let depth = 1; const body = []; i++;
    for (; i < lines.length; i++) {
      if (/^:::\s*[a-z]/i.test(lines[i])) depth++;
      else if (/^:::\s*$/.test(lines[i])) { depth--; if (depth === 0) break; }
      body.push(lines[i]);
    }
    blocks.push({ type: m[1].toLowerCase(), args: m[2].trim(), body: body.join("\n") });
    out.push("", `<div class="blk" data-b="${blocks.length - 1}"></div>`, "");
  }
  return { text: out.join("\n"), blocks };
}
function loadYaml(body, where) {
  try { const v = yaml.load(body); return v == null ? {} : v; }
  catch (e) { return { __error: `${where}: ${e.message.split("\n")[0]}` }; }
}
function idTitle(args) { const [id, ...rest] = args.split(/\s+/); return { id: (id || "").toLowerCase(), title: rest.join(" ") }; }

// Pass 1: register every entity so [[links]] can resolve anywhere.
function register(text, ent, ctx) {
  const { blocks } = extractBlocks(text);
  for (const b of blocks) {
    if (["npc", "monster", "table", "clock"].includes(b.type)) {
      const { id, title } = idTitle(b.args);
      if (!id) continue;
      const data = b.type === "monster" && !b.body.trim() ? { book: id } : loadYaml(b.body, b.type + " " + id);
      ent[id] = { id, type: b.type, data, title: data.name || data.label || title || id, scene: ctx.scene };
    }
    if (b.type === "flags") {
      const d = loadYaml(b.body, "flags");
      for (const [id, label] of flagPairs(d)) M.flags.push({ id, label, scene: ctx.scene });
    }
    if (b.type === "route") M.routes.push({ title: b.args || "Off script", scene: ctx.scene, n: M.routes.length });
    register(b.body, ent, ctx);
  }
}
function flagPairs(d) {
  if (Array.isArray(d)) return d.map((x) => typeof x === "string" ? [slug(x), x] : Object.entries(x)[0]);
  if (d && typeof d === "object" && !d.__error) return Object.entries(d);
  return [];
}

function parseModule(src) {
  src = src.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  let meta = {};
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) { meta = loadYaml(fm[1], "front matter"); src = src.slice(fm[0].length); }
  M = { meta, preface: "", chapters: [], ent: {}, routes: [], flags: [], scenes: {}, order: [] };

  // split by # and ## headings (outside directive blocks)
  const lines = src.split("\n"); let depth = 0;
  let cur = { kind: "preface", lines: [] }; const secs = [cur];
  for (const ln of lines) {
    if (/^:::\s*[a-z]/i.test(ln)) depth++; else if (/^:::\s*$/.test(ln) && depth > 0) depth--;
    let h = depth === 0 && ln.match(/^(#{1,2})\s+(.+?)\s*(?:\{#([\w-]+)\})?\s*$/);
    if (h && h[1].length === 2 && !secs.some((x) => x.kind === "chapter")) h = null; // ## in the preface stays in the preface
    if (h) { cur = { kind: h[1].length === 1 ? "chapter" : "scene", title: h[2], id: (h[3] || slug(h[2])).toLowerCase(), lines: [] }; secs.push(cur); }
    else cur.lines.push(ln);
  }
  let ch = null;
  for (const s of secs) {
    const body = s.lines.join("\n");
    if (s.kind === "preface") { M.preface = body; continue; }
    if (s.kind === "chapter") { ch = { id: s.id, title: s.title, body, scenes: [] }; M.chapters.push(ch); M.scenes[s.id] = { ...ch, isChapter: true }; M.order.push(s.id); continue; }
    if (!ch) { ch = { id: "chapter", title: "Scenes", body: "", scenes: [] }; M.chapters.push(ch); }
    let id = s.id; while (M.scenes[id]) id += "-2";
    const sc = { id, title: s.title, body, chapter: ch.id };
    ch.scenes.push(sc); M.scenes[id] = sc; M.order.push(id);
  }
  register(M.preface, M.ent, { scene: null });
  for (const c of M.chapters) { register(c.body, M.ent, { scene: c.id }); for (const sc of c.scenes) register(sc.body, M.ent, { scene: sc.id }); }
  return M;
}

/* ---------------- rendering markdown + blocks ---------------- */
function wiki(s) {
  return s.replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => {
    id = id.toLowerCase();
    const e = M.ent[id] || M.scenes[id];
    const text = label || (e ? e.title : id);
    return `<a class="xref${e ? " t-" + (M.ent[id] ? e.type : "scene") : " missing"}" data-ref="${id}" href="#">${esc(text)}</a>`;
  });
}
function bookLinks(html) {
  return html.replace(/href="@(player|historian|lore)#([\w-]+)"/g, (_, b, a) => `href="${BOOKS[b]}#${a}" target="_blank" rel="noopener" class="book"`);
}
function renderMd(text) {
  const { text: t, blocks } = extractBlocks(text);
  let html = marked.parse(wiki(t));
  html = html.replace(/<div class="blk" data-b="(\d+)"><\/div>/g, (_, n) => renderBlock(blocks[+n]));
  return bookLinks(html);
}
const errBox = (d) => `<div class="err">⚠ ${esc(d.__error)}</div>`;

function renderBlock(b) {
  const T = b.type;
  if (T === "read") return `<aside class="read"><div class="lbl">Read aloud</div>${md(b.body)}</aside>`;
  if (T === "tip") return `<aside class="tip"><div class="lbl">${esc(b.args || "Historian's note")}</div>${md(b.body)}</aside>`;
  if (T === "secret") return `<aside class="secret"><div class="lbl">🔒 ${esc(b.args || "Secret")}</div>${md(b.body)}</aside>`;
  if (T === "route") {
    const mine = M.routes.filter((x) => x.scene === curScene);
    const r = (curScene !== undefined && mine[routeIdx++]) || M.routes.find((x) => x.title === (b.args || "Off script")) || {};
    return `<details class="route" data-route="${r.n ?? ""}"><summary><span class="lbl">Off script</span> ${mdInline(b.args || "If the players go another way")}</summary><div class="rbody">${md(b.body)}</div></details>`;
  }
  if (T === "glance") {
    const d = loadYaml(b.body, "glance"); if (d.__error) return errBox(d);
    return `<div class="glance">${Object.entries(d).map(([k, v]) => `<div><b>${esc(k)}</b><span>${mdInline(Array.isArray(v) ? v.join(" · ") : v)}</span></div>`).join("")}</div>`;
  }
  if (T === "check") return renderCheck(b);
  if (T === "encounter") return renderEncounter(b);
  if (["npc", "monster", "table", "clock"].includes(T)) {
    const { id } = idTitle(b.args);
    const e = M.ent[id]; if (!e) return "";
    if (e.data.__error) return errBox(e.data);
    if (T === "clock") return renderClock(e);
    // Definitions collapse inline; they open fully in the side panel.
    return `<div class="defn t-${T}" data-def="${id}">${renderEntity(e, true)}</div>`;
  }
  if (T === "flags") {
    const d = loadYaml(b.body, "flags"); if (d.__error) return errBox(d);
    return `<div class="flags">${flagPairs(d).map(([id, label]) => flagBox(id, label)).join("")}</div>`;
  }
  return `<div class="err">Unknown block “:::${esc(T)}”.</div>${md(b.body)}`;
}
function flagBox(id, label) {
  return `<label class="flag"><input type="checkbox" data-flag="${esc(id)}" ${S.flags[id] ? "checked" : ""}> ${mdInline(label)}</label>`;
}
function renderCheck(b) {
  const d = loadYaml(b.body, "check"); if (d.__error) return errBox(d);
  const head = [d.trait && `${esc(d.trait)} Trial`, d.tn != null && `TN ${esc(d.tn)}`, d.vs && `vs ${esc(d.vs)}`, d.who && `· ${esc(d.who)}`].filter(Boolean).join(" ");
  const rows = [["crit", "Natural 20"], ["success", "Success"], ["close", "Close Call (1–4 under)"], ["fail", "Failure (5+ under)"]]
    .filter(([k]) => d[k]).map(([k, l]) => `<tr class="o-${k}"><th>${l}</th><td>${mdInline(d[k])}</td></tr>`).join("");
  return `<div class="check"><div class="chead"><span class="lbl">Check</span> <b>${mdInline(b.args || "")}</b> <span class="cmeta">${head}</span></div>${d.when ? `<p class="cwhen">${mdInline(d.when)}</p>` : ""}<table>${rows}</table>${d.note ? `<p class="cnote">${mdInline(d.note)}</p>` : ""}</div>`;
}
function parseFoe(s) {
  if (typeof s === "object") { const [id, n] = Object.entries(s)[0]; return { id: id.toLowerCase(), n: +n || 1 }; }
  const m = String(s).match(/^\s*(?:(\d+)\s*[x×]\s*)?([\w-]+)(?:\s*[x×]\s*(\d+))?/i);
  return m ? { id: m[2].toLowerCase(), n: +(m[1] || m[3] || 1) } : null;
}
function renderEncounter(b) {
  const d = loadYaml(b.body, "encounter"); if (d.__error) return errBox(d);
  const foes = (d.foes || []).map(parseFoe).filter(Boolean);
  const fl = foes.map((f) => `<li><b>${f.n} ×</b> ${wiki(`[[${f.id}]]`)}</li>`).join("");
  const enc = esc(JSON.stringify(foes));
  const rest = ["threat", "terrain", "setup", "tactics", "morale", "scaling", "reward"].filter((k) => d[k])
    .map((k) => `<div><b>${k[0].toUpperCase() + k.slice(1)}</b><span>${mdInline(d[k])}</span></div>`).join("");
  return `<div class="encounter"><div class="ehead"><span class="lbl">Encounter</span> <b>${mdInline(b.args || "")}</b><button class="btn sm run" data-run='${enc}' data-name="${esc(b.args)}">⚔ Run</button></div><ul class="foes">${fl}</ul><div class="glance">${rest}</div></div>`;
}
function renderClock(e) {
  const d = e.data; const n = +d.segments || 4; const v = S.clocks[e.id] || 0;
  const steps = (d.steps || []).map((s, i) => `<li class="${i < v ? "done" : ""}">${mdInline(s)}</li>`).join("");
  return `<div class="clock" data-clock="${e.id}"><div class="chead"><span class="lbl">Clock</span> <b>${esc(e.title)}</b> <span class="segs">${Array.from({ length: n }, (_, i) => `<button class="seg ${i < v ? "on" : ""}" data-seg="${i + 1}" title="${i + 1}/${n}"></button>`).join("")}</span><span class="cmeta">${v}/${n}</span></div>${d.text ? `<p>${mdInline(d.text)}</p>` : ""}${steps ? `<ol>${steps}</ol>` : ""}</div>`;
}

/* ---------- entities ---------- */
const bookCache = {};
async function bookMonster(id) {
  if (bookCache[id] !== undefined) return bookCache[id];
  try {
    if (!bookCache.__doc) {
      const r = await fetch(BOOKS.historian, { cache: "no-cache" });
      bookCache.__doc = new DOMParser().parseFromString(await r.text(), "text/html");
    }
    const h = bookCache.__doc.getElementById(id); const card = h && h.closest(".monster");
    if (!card) return (bookCache[id] = null);
    const c = card.cloneNode(true); $$(".anchor", c).forEach((a) => a.remove());
    const out = { name: $("h3", c)?.textContent.trim(), meta: $(".meta", c)?.innerHTML, stats: [], flavor: $(".flavor", c)?.innerHTML, actions: [], reward: $(".reward", c)?.innerHTML };
    $$(".stats > div", c).forEach((s) => out.stats.push([$("b", s).textContent, $("span", s).innerHTML]));
    $$(":scope > p:not(.meta):not(.flavor)", c).forEach((p) => out.actions.push(p.innerHTML));
    return (bookCache[id] = out);
  } catch { return (bookCache[id] = null); }
}
function monsterHP(e) {
  const d = e.data; if (d.hp) return +d.hp;
  const bm = d.book && bookCache[d.book]; const hp = bm && bm.stats.find((s) => s[0] === "HP");
  return hp ? parseInt(hp[1]) || 0 : 0;
}
function renderEntity(e, inline) {
  const d = e.data;
  if (e.type === "npc") {
    const rows = [["Role", d.role], ["Look", d.look], ["Voice", d.voice], ["Wants", d.wants], ["Fears", d.fears], ["Leverage", d.leverage], ["Attitude", d.attitude]]
      .filter((r) => r[1]).map(([k, v]) => `<div><b>${k}</b><span>${mdInline(v)}</span></div>`).join("");
    const list = (k, l) => d[k] ? `<h5>${l}</h5><ul>${[].concat(d[k]).map((x) => `<li>${mdInline(x)}</li>`).join("")}</ul>` : "";
    return `<div class="card npc"><div class="cardh"><span class="lbl">NPC</span><h4>${esc(e.title)}</h4>${d.quote ? `<q>${mdInline(d.quote)}</q>` : ""}</div>${inline ? `<button class="btn sm open" data-ref="${e.id}">Open card</button>` : `<div class="glance">${rows}</div>${list("knows", "Knows")}${list("lies", "Will lie about")}${list("lines", "Lines")}${d.secret ? `<aside class="secret"><div class="lbl">🔒 Secret</div>${md(d.secret)}</aside>` : ""}${d.stats ? `<h5>In a fight</h5><p>${mdInline(d.stats)}</p>` : ""}${d.notes ? md(d.notes) : ""}`}</div>`;
  }
  if (e.type === "monster") {
    const head = `<div class="cardh"><span class="lbl">Stat block</span><h4>${esc(e.title)}</h4></div>`;
    if (inline) return `<div class="card monster">${head}<button class="btn sm open" data-ref="${e.id}">Open stat block</button></div>`;
    return `<div class="card monster" data-mon="${e.id}">${head}<div class="mbody">Loading…</div></div>`;
  }
  if (e.type === "table") {
    const rows = tableRows(d);
    return `<div class="card rtable" data-table="${e.id}"><div class="cardh"><span class="lbl">${esc(d.kind || "Table")}</span><h4>${esc(e.title)}</h4><button class="btn sm rollt" data-table="${e.id}">🎲 ${esc(tableDie(d, rows))}</button></div>${d.text ? `<p>${mdInline(d.text)}</p>` : ""}<table>${rows.map((r, i) => `<tr data-i="${i}"><th>${esc(r.roll)}</th><td>${mdInline(r.text)}</td></tr>`).join("")}</table></div>`;
  }
  return "";
}
async function fillMonster(el) {
  const e = M.ent[el.dataset.mon]; const d = e.data;
  let bm = d.book ? await bookMonster(d.book) : null;
  const meta = [d.kind, d.threat, d.element, d.level != null && `Level ${d.level}`].filter(Boolean).join(" · ");
  const stats = [];
  const over = { HP: d.hp, Evasion: d.evasion, Speed: d.speed, Traits: d.traits, Resistance: d.resistance };
  if (bm) bm.stats.forEach(([k, v]) => stats.push([k, over[k] != null ? esc(over[k]) : v]));
  for (const [k, v] of Object.entries(over)) if (v != null && !stats.find((s) => s[0] === k)) stats.push([k, esc(v)]);
  const acts = (d.actions || []).map((a) => typeof a === "string" ? `<p>${mdInline(a)}</p>` : `<p><strong><em>${esc(a.name)}${a.tag ? ` (${esc(a.tag)})` : ""}.</em></strong> ${mdInline(a.text || "")}</p>`).join("");
  const reward = [d.exp != null && `<strong>Exp</strong> ${esc(d.exp)}`, d.didra != null && `<strong>Didra</strong> ${esc(d.didra)}`].filter(Boolean).join(" · ");
  const hp = monsterHP(e);
  el.querySelector(".mbody").innerHTML =
    `<p class="meta"><em>${meta || bm?.meta || ""}</em></p>` +
    `<div class="stats">${stats.map(([k, v]) => `<div class="${k === "Traits" ? "wide" : ""}"><b>${esc(k)}</b><span>${v}</span></div>`).join("")}</div>` +
    (d.flavor ? `<p class="flavor">${mdInline(d.flavor)}</p>` : bm?.flavor ? `<p class="flavor">${bm.flavor}</p>` : "") +
    (d.replace_actions ? "" : (bm ? bm.actions.map((a) => `<p>${a}</p>`).join("") : "")) + acts +
    (d.tactics ? `<h5>Tactics</h5>${md(d.tactics)}` : "") +
    `<div class="reward">${reward || bm?.reward || ""}</div>` +
    `<div class="mfoot"><button class="btn sm add" data-add="${e.id}">+ Add to combat${hp ? ` (${hp} HP)` : ""}</button>${d.book ? `<a class="book" target="_blank" rel="noopener" href="${BOOKS.historian}#${esc(d.book)}">Book ↗</a>` : ""}</div>`;
  if (!bm && d.book) el.querySelector(".mbody").insertAdjacentHTML("afterbegin", `<div class="err">Couldn't load “${esc(d.book)}” from the Historian's Handbook.</div>`);
  dice(el);
  // Riders ("on a hit, the target is Stunned") borrow the creature's main attack roll.
  const main = $$("button.die", el).find((b) => /^d20\+/.test(b.dataset.expr));
  if (main) $$(".mbody > p", el).forEach((p) => {
    if ($$("button.die", p).some((b) => /^d20\+/.test(b.dataset.expr))) return;
    if (!/\bon a hit\b|\band (claw|bite|strike|gore|slam)s?\b/i.test(p.textContent)) return;
    const b = document.createElement("button"); b.className = "die rider"; b.textContent = "⚔ resolve";
    b.dataset.expr = main.dataset.expr; if (main.dataset.crit) b.dataset.crit = main.dataset.crit; b.dataset.rider = "1";
    const act = p.querySelector("em")?.textContent.replace(/\.$/, "") || "Rider";
    b.dataset.label = [e.title, act, "Hit"].join(" · "); b.title = `Uses ${main.closest("p")?.querySelector("em")?.textContent.replace(/\.$/, "") || "the main attack"}'s Hit and damage, plus this ability's effects`;
    p.append(" ", b);
  });
}
function tableRows(d) {
  const rows = (d.rows || []).map((r, i) => {
    if (Array.isArray(r)) return { roll: String(r[0]), text: String(r[1] ?? "") };
    if (typeof r === "object") { if ("roll" in r) return { roll: String(r.roll), text: String(r.text ?? r.result ?? "") }; const [k, v] = Object.entries(r)[0]; return { roll: String(k), text: String(v) }; }
    const m = String(r).match(/^\s*(\d+(?:\s*[-–]\s*\d+)?\+?)\s*[:|]\s*(.*)$/);
    return m ? { roll: m[1], text: m[2] } : { roll: String(i + 1), text: String(r) };
  });
  return rows;
}
function tableDie(d, rows) { return d.die || "d" + rows.length; }
function rollTable(id) {
  const e = M.ent[id]; const rows = tableRows(e.data); const die = tableDie(e.data, rows);
  const r = rollExpr(die, e.title); if (!r) return;
  const hit = rows.findIndex((row) => {
    const s = row.roll.replace(/[–]/g, "-").replace(/\s/g, "");
    let m;
    if ((m = s.match(/^(\d+)-(\d+)$/))) return r.total >= +m[1] && r.total <= +m[2];
    if ((m = s.match(/^(\d+)\+$/))) return r.total >= +m[1];
    return +s === r.total;
  });
  if (hit >= 0) { r.detail += ` → ${rows[hit].text.replace(/[*_`]|\[\[|\]\]/g, "")}`; saveRolls(); renderTray(); }
  $$(`.rtable[data-table="${id}"] tr`).forEach((tr) => tr.classList.toggle("hit", +tr.dataset.i === hit));
}

/* ---------------- dice auto-linking ---------------- */
function dice(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest("button,a,textarea,input,.nodice,h1,h2,h3,h4,#vs,#hist") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  const re = /\b(Hit\s*[+−-]\s*\d+)|(\b\d*d(?:4|6|8|10|12|20|100)(?:\s*[+−–-]\s*\d+)?)\b/g;
  for (const n of nodes) {
    if (!re.test(n.data)) continue; re.lastIndex = 0;
    const frag = document.createDocumentFragment(); let last = 0; let m;
    const card = n.parentElement.closest("[data-mon],.card,.encounter");
    const title = card?.querySelector("h4")?.textContent || "";
    const pline = n.parentElement.closest("p,li,td")?.textContent || "";
    const crit = +(pline.match(/crit\s*(\d+)/i)?.[1] || 0) || undefined;
    const act = n.parentElement.closest("p")?.querySelector("em")?.textContent.replace(/\.$/, "") || "";
    while ((m = re.exec(n.data))) {
      frag.append(n.data.slice(last, m.index));
      const b = document.createElement("button"); b.className = "die"; b.textContent = m[0];
      if (m[1]) { b.dataset.expr = "d20+" + m[1].replace(/\D/g, ""); b.dataset.label = [title, act, "Hit"].filter(Boolean).join(" · "); if (crit) b.dataset.crit = crit; }
      else { b.dataset.expr = m[2]; b.dataset.label = [title, act].filter(Boolean).join(" · ") || m[2]; }
      frag.append(b); last = m.index + m[0].length;
    }
    frag.append(n.data.slice(last)); n.replaceWith(frag);
  }
}

/* ---------------- views ---------------- */
function go(v, push = true) {
  if (push && view) { back.push(view); fwd.length = 0; }
  view = v; if (S) { S.view = v; if (v.kind === "scene") S.visited[v.id] = true; saveState(); }
  render();
}
function render() {
  document.documentElement.dataset.size = prefs.size;
  $("#title").textContent = M ? (M.meta.title || "Untitled module") : "Agon Module";
  $("#back").disabled = !back.length; $("#fwd").disabled = !fwd.length;
  renderSide(); renderMain(); renderPeek(); renderTray();
}
function renderMain() {
  const main = $("#main");
  if (!M || view.kind === "library") { main.innerHTML = libraryHTML(); bindMain(); return; }
  if (view.kind === "search") { main.innerHTML = searchHTML(view.q); bindMain(); return; }
  if (view.kind === "scene" && M.scenes[view.id]) {
    const sc = M.scenes[view.id];
    const i = M.order.indexOf(sc.id);
    const prev = M.order[i - 1], next = M.order[i + 1];
    const ch = sc.isChapter ? null : M.chapters.find((c) => c.id === sc.chapter);
    curScene = sc.id; routeIdx = 0;
    const bodyHtml = renderMd(sc.body); curScene = undefined;
    main.innerHTML = `<article class="scene">
      ${ch ? `<div class="crumb"><a href="#" class="xref" data-ref="${ch.id}">${esc(ch.title)}</a></div>` : ""}
      <h1>${esc(sc.title)}</h1>
      ${bodyHtml}
      ${sc.isChapter ? `<ol class="toc">${M.chapters.find((c) => c.id === sc.id).scenes.map((s) => `<li><a href="#" class="xref" data-ref="${s.id}">${esc(s.title)}</a></li>`).join("")}</ol>` : ""}
      <section class="notes"><h5>Historian's notes for this scene <small>(only in this browser)</small></h5><textarea data-note="${sc.id}" placeholder="What happened here, names you made up, things to remember…">${esc(S.notes[sc.id] || "")}</textarea></section>
      <nav class="pager">${prev ? `<a href="#" class="xref" data-ref="${prev}">← ${esc(M.scenes[prev].title)}</a>` : "<span></span>"}${next ? `<a href="#" class="xref" data-ref="${next}">${esc(M.scenes[next].title)} →</a>` : ""}</nav>
    </article>`;
  } else {
    const m = M.meta;
    const facts = [["Level", m.level], ["Players", m.players], ["Length", m.length], ["Tone", m.tone], ["Version", m.version]].filter((x) => x[1]);
    main.innerHTML = `<article class="scene overview">
      <div class="crumb">Module ${esc(m.module ?? "")}</div>
      <h1>${esc(m.title || "Untitled module")}</h1>${m.subtitle ? `<p class="sub">${esc(m.subtitle)}</p>` : ""}
      ${facts.length ? `<div class="glance">${facts.map(([k, v]) => `<div><b>${k}</b><span>${esc(v)}</span></div>`).join("")}</div>` : ""}
      ${m.summary ? `<p class="lead">${mdInline(m.summary)}</p>` : ""}
      ${(curScene = null, routeIdx = 0, "")}${renderMd(M.preface)}${(curScene = undefined, "")}
      <h2>Contents</h2>
      ${M.chapters.map((c) => `<h3><a href="#" class="xref" data-ref="${c.id}">${esc(c.title)}</a></h3><ol class="toc">${c.scenes.map((s) => `<li><a href="#" class="xref" data-ref="${s.id}">${esc(s.title)}</a>${S.visited[s.id] ? ' <span class="seen">✓</span>' : ""}</li>`).join("")}</ol>`).join("")}
    </article>`;
  }
  bindMain();
  if (view.route != null) {
    const d = $(`details.route[data-route="${view.route}"]`, main);
    if (d) { d.open = true; d.classList.add("flash"); setTimeout(() => d.scrollIntoView({ block: "center" }), 30); }
    view.route = null;
  } else if (view.anchor) { const a = document.getElementById(view.anchor); a?.scrollIntoView(); }
  else main.scrollTop = 0;
}
function bindMain() {
  const main = $("#main");
  $$("[data-mon]", main).forEach(fillMonster);
  dice(main);
  // keep details open state per route
  $$("details.route", main).forEach((d) => { const k = view.id + ":" + d.dataset.route; if (S?.open[k]) d.open = true; d.addEventListener("toggle", () => { S.open[k] = d.open; saveState(); }); });
}

function renderSide() {
  const side = $("#side");
  const tabs = [["scenes", "Scenes"], ["routes", "Off Script"], ["cast", "Cast"], ["bestiary", "Bestiary"], ["tables", "Tables"], ["tracker", "Tracker"]];
  if (!M) { side.innerHTML = `<div class="empty">No module loaded.</div>`; return; }
  const tab = prefs.tab;
  let body = "";
  if (tab === "scenes") {
    body = `<a href="#" class="item ${view.kind === "overview" ? "cur" : ""}" data-go="overview">Overview</a>` + M.chapters.map((c) => `<div class="grp"><a href="#" class="item chap ${view.id === c.id ? "cur" : ""}" data-ref="${c.id}">${esc(c.title)}</a>${c.scenes.map((s) => `<a href="#" class="item ${view.id === s.id ? "cur" : ""}" data-ref="${s.id}">${S.visited[s.id] ? '<span class="seen">✓</span>' : ""}${esc(s.title)}</a>`).join("")}</div>`).join("");
  } else if (tab === "routes") {
    const q = (prefs.rq || "").toLowerCase();
    const by = {};
    M.routes.filter((r) => !q || r.title.toLowerCase().includes(q)).forEach((r) => (by[r.scene] ??= []).push(r));
    body = `<input class="filter" id="rq" placeholder="Filter: “attack”, “lie”, “leave town”…" value="${esc(prefs.rq || "")}">` +
      (Object.keys(by).length ? Object.entries(by).map(([sc, rs]) => `<div class="grp"><div class="gh">${esc(M.scenes[sc]?.title || "General")}</div>${rs.map((r) => `<a href="#" class="item route" data-routego="${r.n}" data-scene="${sc}">${esc(r.title.replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || M.ent[a]?.title || a))}</a>`).join("")}</div>`).join("") : `<div class="empty">No routes match.</div>`);
  } else if (tab === "cast" || tab === "bestiary" || tab === "tables") {
    const type = { cast: "npc", bestiary: "monster", tables: "table" }[tab];
    const list = Object.values(M.ent).filter((e) => e.type === type);
    if (tab === "tables") {
      const by = {}; list.forEach((e) => (by[e.data.kind || "Other"] ??= []).push(e));
      body = Object.entries(by).map(([k, es]) => `<div class="grp"><div class="gh">${esc(k)}</div>${es.map((e) => `<a href="#" class="item ${peekId === e.id ? "cur" : ""}" data-ref="${e.id}">${esc(e.title)}</a>`).join("")}</div>`).join("");
    } else {
      body = list.map((e) => `<a href="#" class="item ${peekId === e.id ? "cur" : ""}" data-ref="${e.id}">${esc(e.title)}<small>${esc(type === "npc" ? (e.data.role || "") : [e.data.threat, e.data.level != null ? "L" + e.data.level : ""].filter(Boolean).join(" · ") || (e.data.book ? "from the book" : ""))}</small></a>`).join("");
    }
    if (!list.length) body = `<div class="empty">None in this module yet.</div>`;
  } else if (tab === "tracker") body = trackerHTML();
  side.innerHTML = `<nav class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</nav><div class="sbody">${body}</div>`;
  const rq = $("#rq"); if (rq) { rq.oninput = () => { prefs.rq = rq.value; savePrefs(); const pos = rq.selectionStart; renderSide(); const n = $("#rq"); n.focus(); n.setSelectionRange(pos, pos); }; }
  if (tab === "tracker") dice(side);
  refreshTargetBar();
}
function trackerHTML() {
  const clocks = Object.values(M.ent).filter((e) => e.type === "clock");
  const combat = S.combat.map((c, i) => `<div class="cbt ${c.hp <= 0 ? "down" : ""} ${S.target === "c:" + c.uid ? "tgt" : ""}"><div class="cn"><input value="${esc(c.name)}" data-cname="${i}"><button class="x" data-crem="${i}" title="Remove">×</button></div>
    <div class="ch"><button data-hp="${i}" data-d="-1" title="Damage">−</button><input class="amt" type="number" min="0" placeholder="amt" data-amt="${i}"><button data-hp="${i}" data-d="1" title="Heal">+</button><span class="hpv"><b>${c.hp}</b>/${c.max}</span><label class="ev ${c.evaOverride != null ? "ovr" : ""}" title="${c.evaOverride != null ? `Evasion (your override; the stat block says ${cStats(c).base}). Clear the box to go back.` : "Evasion, from the stat block. Type a number to override."}">Ev<input type="number" value="${cStats(c).eva}" data-ceva="${i}"></label></div>
    <div class="ci"><button class="btn xs" data-init="${i}" title="Roll d20 + Agility modifier (${fmtMod(2 * (cStats(c).traits.agility || 0))})">⚡ Init${c.init != null ? ` <b>${c.init}</b>` : ""}</button><button class="btn xs ${c.token ? "linked" : ""}" data-link="${i}" title="${c.token ? "Linked token. Click to unlink." : "Select a token on the map, then click to link it"}">${c.token ? "🔗 " + esc(c.tokenName || "token") : "🔗 Link token"}</button><button class="btn xs" data-tgt="${i}" title="Make this the target">🎯</button>${c.ref ? `<a href="#" class="xref" data-ref="${c.ref}">stats</a>` : ""}</div>
    <input class="cnote" placeholder="conditions, notes" value="${esc(c.note || "")}" data-cnote="${i}"></div>`).join("");
  return `<div class="grp"><div class="gh">Combat <button class="btn xs" id="addfoe">+ custom</button>${S.combat.length ? '<button class="btn xs" id="initall" title="Roll initiative for every foe without one">⚡ all</button><button class="btn xs" id="clearcbt">clear</button>' : ""}</div>${combat || '<div class="empty">Use ⚔ Run on an encounter, or “Add to combat” on a stat block.</div>'}</div>
  <div class="grp"><div class="gh">Story flags</div>${M.flags.length ? M.flags.map((f) => flagBox(f.id, f.label)).join("") : '<div class="empty">This module has no flags.</div>'}</div>
  <div class="grp"><div class="gh">Clocks</div>${clocks.length ? clocks.map(renderClock).join("") : '<div class="empty">No clocks.</div>'}</div>
  <div class="grp"><div class="gh">Session log</div><form id="logf"><input id="logi" placeholder="Quick note, Enter to add"></form>${S.log.slice().reverse().map((l, i) => `<div class="logl"><time>${new Date(l.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time> ${esc(l.text)} <button class="x" data-lrem="${S.log.length - 1 - i}">×</button></div>`).join("")}</div>
  <div class="grp"><button class="btn sm" id="resetst">Reset play state…</button></div>`;
}
function renderPeek() {
  const p = $("#peek");
  if (!peekId || !M || !M.ent[peekId]) { p.classList.remove("on"); p.innerHTML = ""; return; }
  const e = M.ent[peekId];
  p.classList.add("on");
  p.innerHTML = `<div class="peekbar"><span>${esc({ npc: "Cast", monster: "Bestiary", table: "Table", clock: "Clock" }[e.type])}</span>${e.scene ? `<a href="#" class="xref" data-ref="${e.scene}">in ${esc(M.scenes[e.scene]?.title || "")}</a>` : ""}<button class="x" id="peekx" title="Close">×</button></div>${e.type === "monster" ? targetBar() : ""}<div class="peekbody">${e.type === "clock" ? renderClock(e) : renderEntity(e, false)}</div>`;
  $$("[data-mon]", p).forEach(fillMonster);
  dice(p);
}
function fmtTime(t) { const d = new Date(t); return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }); }
function openHistory() { $("#hist").classList.add("on"); renderHistory(); $("#histq").focus(); }
function closeHistory() { $("#hist").classList.remove("on"); }
function renderHistory() {
  const q = ($("#histq")?.value || "").toLowerCase();
  const list = rolls.filter((r) => !q || (r.label + " " + r.detail).toLowerCase().includes(q));
  let day = "";
  $("#histlist").innerHTML = list.length ? list.map((r) => {
    const d = new Date(r.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const head = d !== day ? `<div class="hday">${(day = d)}</div>` : "";
    return `${head}<div class="hrow"><time>${fmtTime(r.at)}</time><span class="hl">${esc(r.label)}</span><b>${r.total}</b>${natNote(r)}<span class="hd">${esc(r.detail)}</span></div>`;
  }).join("") : `<div class="empty">${rolls.length ? "No rolls match." : "No private rolls yet."}</div>`;
  $("#histcount").textContent = `${rolls.length} roll${rolls.length === 1 ? "" : "s"} kept (newest first, up to ${ROLL_CAP})`;
}
function renderTray(flash) {
  const t = $("#rolls");
  if ($("#hist.on")) renderHistory();
  t.innerHTML = rolls.slice(0, 8).map((r, i) => `<div class="roll ${i === 0 && flash ? "new" : ""}" title="${esc(r.detail)}"><span class="rl">${esc(r.label)}</span><b>${r.total}</b>${natNote(r)}${i === 0 ? `<span class="rd">${esc(r.detail)}</span>` : ""}</div>`).join("") || `<span class="hint">Click any dice or “Hit +N” to roll privately. Only you see these.</span>`;
}

/* ---------------- library ---------------- */
function libraryHTML() {
  const items = Object.entries(lib.items);
  return `<article class="scene library"><h1>Module Library</h1>
  <p class="lead">Modules are stored <b>only in this browser</b>. Nothing here is uploaded or sent to the room, so players can't see it, even by digging through the extension's files.</p>
  ${!inOBR ? `<aside class="tip"><div class="lbl">Outside Owlbear</div><p>You're viewing the reader directly. Its storage is separate from the copy inside Owlbear, so import your module in Owlbear too.</p></aside>` : ""}
  <div class="libbtns"><label class="btn">📂 Import module (.md)<input type="file" id="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden></label><button class="btn" id="demo">Load the demo module</button></div>
  <div id="drop">…or drop a module file here.</div>
  ${items.length ? `<table class="libt"><tr><th>Module</th><th>Imported</th><th></th></tr>${items.map(([k, it]) => `<tr class="${k === modKey ? "cur" : ""}"><td><b>${esc(it.title)}</b><br><small>${(it.text.length / 1024).toFixed(1)} kB</small></td><td><small>${new Date(it.at).toLocaleString()}</small></td><td class="acts"><button class="btn sm" data-open="${k}">${k === modKey ? "Open ✓" : "Open"}</button><button class="btn sm" data-dl="${k}">Download</button><button class="btn sm danger" data-del="${k}">Delete</button></td></tr>`).join("")}</table>` : `<p class="empty">No modules yet. Load the demo to try the reader.</p>`}
  <h3>Updating a module</h3><p>Import a newer file with the same title and it replaces the old one. Your notes, flags, clocks and combat tracker are kept.</p>
  <p class="ver">Agon Module v${VERSION}</p></article>`;
}
function importText(text, name) {
  let title;
  if (/^\s*<(!doctype|html)/i.test(text)) { toast(name + " is a web page, not a module file."); return; }
  try { const p = parseModule(text); title = p.meta.title || name.replace(/\.\w+$/, "");
    if (!p.chapters.length && !p.preface.trim()) { toast(name + " has no chapters or scenes. Is it a module file?"); return; } }
  catch (e) { toast("Couldn't read " + name + ": " + e.message); return; }
  const key = "m-" + hashStr(title);
  lib.items[key] = { title, text, at: Date.now() };
  lib.active = key; saveLib(); openModule(key); toast("Imported “" + title + "”.");
}
function openModule(key) {
  const it = lib.items[key]; if (!it) return;
  try { parseModule(it.text); } catch (e) { toast("Module error: " + e.message); M = null; return; }
  modKey = key; lib.active = key; saveLib();
  S = Object.assign(blankState(), LS.get("agon-module:state:" + key, {}));
  S.combat.forEach((c) => { c.uid ??= Math.random().toString(36).slice(2, 9); if (c.ref) { delete c.eva; delete c.traits; delete c.element; } });
  back.length = 0; fwd.length = 0;
  const ui = S.ui || {}; peekId = ui.peekId && M.ent[ui.peekId] ? ui.peekId : null; lastVs = ui.lastVs || null;
  view = S.view && (S.view.kind !== "scene" || M.scenes[S.view.id]) ? S.view : { kind: "overview" };
  if (view.kind === "library") view = { kind: "overview" };
  render();
  restoreScroll(ui);
  prefetchBook();
}
function restoreScroll(ui) {
  const apply = () => {
    if (ui.main) $("#main").scrollTop = ui.main;
    if (ui.side && $("#side .sbody")) $("#side .sbody").scrollTop = ui.side;
    if (ui.peek && $("#peek")) $("#peek").scrollTop = ui.peek;
  };
  apply(); setTimeout(apply, 150); setTimeout(apply, 600); // stat blocks load async and change height
}
async function prefetchBook() {
  const need = Object.values(M.ent).filter((e) => e.type === "monster" && e.data.book);
  if (!need.length) return;
  for (const e of need) { const bm = await bookMonster(e.data.book); if (bm?.name && !e.data.name) e.title = bm.name; }
  const ui = { main: $("#main").scrollTop, side: $("#side .sbody")?.scrollTop, peek: $("#peek").scrollTop }; render(); restoreScroll(ui);
}

/* ---------------- search ---------------- */
function searchHTML(q) {
  const ql = q.toLowerCase().trim(); if (!ql) return `<article class="scene"><h1>Search</h1></article>`;
  const strip = (s) => s.replace(/:::[\w-]*.*$/gm, "").replace(/[#*_>`\[\]{}|]/g, " ").replace(/\s+/g, " ");
  const hits = [];
  for (const id of M.order) {
    const sc = M.scenes[id]; const txt = strip(sc.body); const i = txt.toLowerCase().indexOf(ql);
    if (sc.title.toLowerCase().includes(ql) || i >= 0) hits.push({ id, title: sc.title, kind: sc.isChapter ? "Chapter" : "Scene", snip: i >= 0 ? txt.slice(Math.max(0, i - 60), i + 90) : "" });
  }
  for (const e of Object.values(M.ent)) {
    const txt = JSON.stringify(e.data).replace(/["{}\[\],]/g, " ");
    const i = txt.toLowerCase().indexOf(ql);
    if (e.title.toLowerCase().includes(ql) || i >= 0) hits.push({ id: e.id, title: e.title, kind: { npc: "NPC", monster: "Stat block", table: "Table", clock: "Clock" }[e.type], snip: i >= 0 ? txt.slice(Math.max(0, i - 60), i + 90) : "" });
  }
  const hl = (s) => esc(s).replace(new RegExp(ql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`);
  return `<article class="scene"><h1>Search: “${esc(q)}”</h1>${hits.length ? hits.map((h) => `<div class="hit"><a href="#" class="xref" data-ref="${h.id}">${esc(h.title)}</a> <small>${h.kind}</small>${h.snip ? `<p class="nodice">…${hl(h.snip)}…</p>` : ""}</div>`).join("") : "<p>No matches.</p>"}</article>`;
}

/* ---------------- combat engine: targets, attacks, initiative ---------------- */
const fmtMod = (n) => (n < 0 ? "−" : "+") + Math.abs(n);
const stripTags = (h) => String(h ?? "").replace(/<[^>]+>/g, "").trim();
function parseTraits(str) {
  const out = {};
  String(str || "").split(/[,;]/).forEach((part) => { const m = part.trim().match(/^([A-Za-z]+)\.?\s*(-?\d+)/); const k = m && traitKey(m[1]); if (k) out[k] = +m[2]; });
  return out;
}
function monStats(e) {
  const d = e.data; const bm = d.book && bookCache[d.book];
  const book = (k) => { const s = bm?.stats.find((x) => x[0] === k); return s ? stripTags(s[1]) : null; };
  const hp = parseInt(d.hp ?? book("HP")) || 10;
  const eva = parseInt(d.evasion ?? book("Evasion")) || 10;
  const traits = parseTraits(d.traits ?? book("Traits"));
  const metaTxt = [d.element, d.kind, stripTags(bm?.meta)].join(" ");
  const element = d.element || ELEMENTS.find((x) => new RegExp("\\b" + x + "\\b").test(metaTxt)) || null;
  return { hp, eva, traits, element };
}
// A combat entry's live stats: from its stat block, unless the Historian typed an Evasion override.
function cStats(c) {
  const st = c.ref && M.ent[c.ref] ? monStats(M.ent[c.ref]) : { eva: c.eva ?? 10, traits: c.traits || {}, element: c.element || null };
  return { base: st.eva, eva: c.evaOverride ?? st.eva, traits: st.traits || {}, element: st.element };
}
function getTarget() {
  if (!S || !S.target) return null;
  const [kind, id] = [S.target.slice(0, 1), S.target.slice(2)];
  if (kind === "p") {
    const p = party.find((x) => x.id === id); if (!p) return null; const c = p.card;
    return { kind: "party", key: S.target, name: p.name, eva: +c.eva || 10, dodge: +c.dodge || 1, parry: +c.parry || 1, traits: c.traits || {}, hp: c.hp, max: c.hpMax, status: c.status || [], element: null };
  }
  const c = S.combat.find((x) => x.uid === id); if (!c) return null;
  const cs = cStats(c); const tr = cs.traits;
  return { kind: "combat", key: S.target, uid: c.uid, name: c.name, eva: cs.eva, dodge: Math.max(1, tr.agility || 0), parry: Math.max(1, tr.strength || 0), traits: tr, hp: c.hp, max: c.max, status: STATUSES.map((s) => s[0]).filter((n) => new RegExp("\\b" + n + "\\b", "i").test(c.note || "")), element: cs.element };
}
function targetBar() {
  const T = getTarget();
  const opt = (v, l) => `<option value="${esc(v)}" ${S.target === v ? "selected" : ""}>${esc(l)}</option>`;
  const pOpts = party.map((p) => opt("p:" + p.id, p.name + (p.card.kind === "aegis" ? " (Aegis)" : "") + ` · Ev ${p.card.eva}`)).join("");
  const cOpts = S.combat.map((c) => opt("c:" + c.uid, `${c.name} · Ev ${cStats(c).eva}${c.hp <= 0 ? " (down)" : ""}`)).join("");
  const sum = T ? `Ev <b>${T.eva}</b> · Dodge ${fmtMod(T.dodge)} · Parry ${fmtMod(T.parry)} · HP ${T.hp ?? "?"}/${T.max ?? "?"}${T.element ? " · " + T.element : ""}${T.status.length ? " · " + T.status.join(", ") : ""}`
    : (S.target ? "That target is gone (token removed or sheet unlinked)." : `Pick a target and every <b>Hit +N</b> below resolves against it.${inOBR && !party.length ? " Party members appear once their sheets are linked to tokens." : ""}`);
  return `<div class="tbar"><label>🎯 Target <select id="tgt">${opt("", "None (plain rolls)")}${pOpts ? `<optgroup label="Party">${pOpts}</optgroup>` : ""}${cOpts ? `<optgroup label="Combat">${cOpts}</optgroup>` : ""}</select></label><div class="tsum">${sum}</div></div><div id="vs">${vsHTML()}</div>`;
}
function refreshTargetBar() { const tb = $("#peek .tbar"); if (tb) { tb.outerHTML = targetBar().replace(/<div id="vs">[\s\S]*$/, ""); } }

function diceOf(expr) {
  const clean = String(expr).replace(/[−–]/g, "-").replace(/\s+/g, "").toLowerCase();
  const terms = []; let bonus = 0;
  for (const t of clean.match(/[+\-]?[^+\-]+/g) || []) {
    const sign = t[0] === "-" ? -1 : 1; const b = t.replace(/^[+\-]/, ""); const m = b.match(/^(\d*)d(\d+)$/);
    if (m) terms.push({ n: +(m[1] || 1), f: +m[2], sign }); else if (/^\d+$/.test(b)) bonus += sign * +b;
  }
  return { terms, bonus };
}
function outcomeOf(total, nat, ev, crit) {
  if (nat === 20) return "divine";
  if (total >= ev) return nat >= crit ? "crit" : "hit";
  return ev - total <= 4 ? "graze" : "miss";
}
const OUT = { divine: "Divine Strike", crit: "Critical Hit", hit: "Hit", graze: "Graze", miss: "Miss" };
const fullHit = (o) => o === "hit" || o === "crit" || o === "divine";

function resolveAttack(btn) {
  const T = getTarget(); const p = btn.closest("p,li,td") || btn.parentElement;
  const N = +(btn.dataset.expr.split("+")[1] || 0); const crit = +btn.dataset.crit || 20;
  let hitBtn = btn, hitP = p;
  if (btn.dataset.rider) { hitBtn = $$("button.die", btn.closest("[data-mon]")).find((b) => /^d20\+/.test(b.dataset.expr) && !b.dataset.rider) || btn; hitP = hitBtn.closest("p") || p; }
  const dies = $$("button.die", hitP); const dmgBtn = dies.slice(dies.indexOf(hitBtn) + 1).find((b) => !/^d20\+/.test(b.dataset.expr));
  const txt = p.textContent.replace("⚔ resolve", "") + (hitP !== p ? " " + hitP.textContent : ""); const act = (btn.dataset.label || "Attack").replace(/ · Hit$/, "");
  const nat = rnd(20), total = nat + N, E = T.eva;
  const out = outcomeOf(total, nat, E, crit);
  // damage: roll 2× the dice once so Hit and Crit share the same faces
  const dd = dmgBtn ? diceOf(dmgBtn.dataset.expr) : null;
  const faces = dd ? dd.terms.map((t) => Array.from({ length: Math.min(t.n * 2, 200) }, () => rnd(t.f))) : [];
  const elem = ELEMENTS.find((x) => new RegExp("\\b" + x + "\\b").test(txt.replace(dmgBtn?.textContent || "", ""))) || null;
  let mult = 1, multNote = "";
  if (T.kind === "combat" && T.element && elem) {
    if (elem === "Shadow") multNote = "Shadow is neutral against creatures";
    else if (STRONG[elem] === T.element) { mult = 1.5; multNote = `${elem} vs ${T.element}: ×1.5`; }
    else if (STRONG[T.element] === elem && T.element !== "Shadow") { mult = 0.5; multNote = `${elem} vs ${T.element}: ×½`; }
  }
  const frail = T.status.includes("Frail");
  const dmgFor = (o) => {
    if (!dd || o === "miss") return { n: 0, how: "" };
    if (o === "graze") return { n: Math.max(1, dd.bonus), how: `graze: bonus only` };
    let sum = 0; const parts = [];
    dd.terms.forEach((t, i) => {
      if (o === "divine") { const v = t.n * t.f * 2; sum += t.sign * v; parts.push(`${t.n}d${t.f} max ×2 = ${v}`); }
      else { const k = o === "crit" ? t.n * 2 : t.n; const f = faces[i].slice(0, k); sum += t.sign * f.reduce((a, b) => a + b, 0); parts.push(`${k}d${t.f}[${f.join(",")}]`); }
    });
    let n = sum + dd.bonus; let how = parts.join(" ") + (dd.bonus ? ` ${fmtMod(dd.bonus)}` : "");
    if (mult !== 1) { n = Math.floor(n * mult); how += ` ×${mult === 1.5 ? "1.5" : "½"}`; }
    if (frail) { n += 2; how += " +2 Frail"; }
    return { n: Math.max(0, n), how };
  };
  const dmg = dmgFor(out);
  // statuses named in this ability
  const sts = STATUSES.filter(([nm]) => new RegExp("\\b" + nm + "\\b").test(txt)).map(([nm, kind, def]) => {
    const m = txt.match(new RegExp(nm + "\\W{0,4}\\((\\w+)\\)")); const tk = traitKey(m ? m[1] : def);
    const res = 10 + (tk ? 2 * (+T.traits[tk] || 0) : 0); // Resistance = 10 + trait modifier (rulebook v1.3.4)
    return { nm, kind, tk, res, ok: kind === "boon" ? fullHit(out) : fullHit(out) && total >= res };
  });
  const reacts = [];
  if (out !== "divine" && out !== "miss") {
    for (const [nm, b, note] of [["Dodge", T.dodge, ""], ["Parry", T.parry, "needs a melee weapon or shield"]]) {
      const o2 = outcomeOf(total, nat, E + b, crit);
      if (o2 !== out) reacts.push({ nm, b, o2, d: dmgFor(o2).n, note });
      else reacts.push({ nm, b, o2, same: true, note });
    }
  }
  lastVs = { act, tname: T.name, tkind: T.kind, uid: T.uid, nat, N, total, E, out, dmg, hasDmg: !!dd, multNote, sts, reacts, crit, at: Date.now() };
  const stTxt = sts.map((x) => `${x.nm} ${x.ok ? "applies" : "no"}`).join(", ");
  rolls.unshift({ label: `${act} → ${T.name}`, expr: btn.dataset.expr, total, detail: `${OUT[out]}${dd ? `, ${dmg.n} dmg` : ""}${stTxt ? `; ${stTxt}` : ""} (d20[${nat}] ${fmtMod(N)} vs Ev ${E}${dd && dmg.how ? `; ${dmg.how}` : ""})`, nat, crit, at: Date.now() });
  rolls = rolls.slice(0, ROLL_CAP); saveRolls(); renderTray(true); showVs(); saveUI();
}
function resolveDamage(btn) {
  const T = getTarget(); const r = rollExpr(btn.dataset.expr, `${btn.dataset.label || btn.dataset.expr} → ${T.name}`); if (!r) return;
  lastVs = { act: btn.dataset.label || btn.dataset.expr, tname: T.name, tkind: T.kind, uid: T.uid, plain: true, total: r.total, detail: r.detail, at: Date.now() }; saveUI();
  showVs();
}
function showVs() {
  let box = $("#vs");
  if (!box) { // the target's panel isn't open: show the result in the tray toast instead
    toast(lastVs.plain ? `${lastVs.act} → ${lastVs.tname}: ${lastVs.total}` : `${lastVs.act} → ${lastVs.tname}: ${OUT[lastVs.out]}${lastVs.hasDmg ? `, ${lastVs.dmg.n} damage` : ""}`); return;
  }
  box.innerHTML = vsHTML(); box.scrollIntoView({ block: "nearest" });
}
function vsHTML() {
  const v = lastVs; if (!v) return "";
  const applyBtn = (amt, label, st) => v.tkind === "combat" && S.combat.find((c) => c.uid === v.uid) ? `<button class="btn xs" data-apply="${v.uid}" data-amt="${amt}"${st ? ` data-st="${esc(st)}"` : ""}>${label}</button>` : "";
  if (v.plain) return `<div class="vs o-hit"><div class="vsh">${esc(v.act)} → <b>${esc(v.tname)}</b></div><div class="vsout"><b>${v.total}</b> <small>${esc(v.detail)}</small> ${applyBtn(v.total, "Apply as damage")} ${applyBtn(-v.total, "Apply as healing")}</div></div>`;
  const tell = v.tkind === "party" ? ` <small>(tell ${esc(v.tname)})</small>` : "";
  return `<div class="vs o-${v.out}">
    <div class="vsh">${esc(v.act)} → <b>${esc(v.tname)}</b></div>
    <div class="vsroll">d20 <b>${v.nat}</b> ${fmtMod(v.N)} = <b>${v.total}</b> vs Evasion ${v.E}${v.crit < 20 ? ` <small>(crit ${v.crit}+)</small>` : ""}</div>
    <div class="vsout"><span class="badge">${OUT[v.out]}</span>${v.hasDmg ? (v.out === "miss" ? " no damage" : ` <b class="dmg">${v.dmg.n}</b> damage${tell} <small>${esc(v.dmg.how)}</small> ${applyBtn(v.dmg.n, "Apply " + v.dmg.n)}`) : ""}</div>
    ${v.multNote ? `<div class="vsx">${esc(v.multNote)}</div>` : ""}
    ${v.out === "divine" ? `<div class="vsx">Can't be dodged or parried.</div>` : ""}
    ${v.sts.length ? `<ul class="vss">${v.sts.map((s) => `<li class="${s.ok ? "yes" : "no"}"><b>${s.nm}</b>${s.kind === "curse" ? ` (${s.tk ? s.tk.slice(0, 3).replace(/^./, (c) => c.toUpperCase()) : "?"})` : ""}: ${s.ok ? "applies" : "doesn't apply"} <small>${s.kind === "boon" ? "boon" : !fullHit(v.out) ? "needs a full Hit" : `${v.total} vs Resistance ${s.res}`}</small> ${s.ok ? applyBtn(0, "Mark", s.nm) : ""}</li>`).join("")}</ul>` : ""}
    ${v.reacts.length ? `<div class="vsr">${v.reacts.map((r) => `<div>If they <b>${r.nm}</b> (${fmtMod(r.b)}): ${r.same ? `still a ${OUT[r.o2]}` : `<b>${OUT[r.o2]}</b>${v.hasDmg ? `, ${r.d} damage` : ""}${!fullHit(r.o2) && v.sts.some((s) => s.kind === "curse") ? ", no curse" : ""}`}${r.note ? ` <small>(${r.note})</small>` : ""}</div>`).join("")}</div>` : ""}
  </div>`;
}
function applyToCombat(uid, amt, st) {
  const c = S.combat.find((x) => x.uid === uid); if (!c) return;
  if (st) { if (!new RegExp("\\b" + st + "\\b", "i").test(c.note || "")) c.note = [c.note, st].filter(Boolean).join(", "); toast(`${c.name}: ${st}`); }
  else { c.hp = Math.max(0, Math.min(c.max + 999, c.hp - amt)); toast(amt >= 0 ? `${c.name} takes ${amt} (HP ${c.hp}/${c.max})` : `${c.name} heals ${-amt} (HP ${c.hp}/${c.max})`); }
  saveState(); renderSide(); refreshTargetBar();
}

/* initiative + tokens (Owlbear only) */
async function writeInit(c) {
  if (!inOBR || !c.token || c.init == null) return;
  try { await OBR.scene.items.updateItems([c.token], (items) => { for (const it of items) { const prev = it.metadata[INIT_KEY]; it.metadata[INIT_KEY] = { count: String(c.init), active: !!(prev && prev.active) }; } }); }
  catch { toast(`Couldn't reach ${c.name}'s token. Re-link it.`); }
}
async function clearInit(list) {
  const ids = list.filter((c) => c && c.token).map((c) => c.token); if (!inOBR || !ids.length) return;
  try { await OBR.scene.items.updateItems(ids, (items) => { for (const it of items) delete it.metadata[INIT_KEY]; }); } catch {}
}
async function rollInit(i, quiet) {
  const c = S.combat[i]; const mod = 2 * (cStats(c).traits.agility || 0);
  const r = rollExpr("d20" + (mod ? fmtMod(mod).replace("−", "-") : ""), `${c.name} · Initiative`); if (!r) return;
  c.init = r.total; saveState();
  if (inOBR && !c.token) { const n = await linkSelection([c], true); if (!n && !quiet) toast(`Initiative ${r.total}. Link a token to put it in the Initiative Tracker.`); }
  await writeInit(c); if (!quiet) renderSide();
}
async function linkSelection(list, single) {
  if (!inOBR || !list.length) return 0;
  try {
    const sel = (await OBR.player.getSelection()) || []; if (!sel.length || (single && sel.length !== 1)) return 0;
    const items = await OBR.scene.items.getItems(sel); const used = new Set(S.combat.map((c) => c.token).filter(Boolean));
    let n = 0;
    for (const it of items) { if (used.has(it.id)) continue; const c = list[n]; if (!c) break; c.token = it.id; c.tokenName = it.name; n++; await writeInit(c); }
    saveState(); return n;
  } catch { return 0; }
}
async function linkToken(i) {
  const c = S.combat[i];
  if (!inOBR) return toast("Token linking works inside Owlbear.");
  if (c.token) { await clearInit([c]); c.token = null; c.tokenName = null; saveState(); renderSide(); return toast(`${c.name} unlinked.`); }
  const n = await linkSelection([c], true);
  if (!n) return toast("Select exactly one (unlinked) token on the map first.");
  renderSide(); toast(`${c.name} linked to “${c.tokenName}”.`);
}
async function watchParty() {
  let unsub = null;
  const upd = (items) => {
    party = items.filter((i) => i.metadata && i.metadata[CARD_KEY]).map((i) => ({ id: i.id, name: i.metadata[CARD_KEY].name || i.name, card: i.metadata[CARD_KEY] }));
    refreshTargetBar();
  };
  const start = async () => { upd(await OBR.scene.items.getItems()); unsub?.(); unsub = OBR.scene.items.onChange(upd); };
  try { if (await OBR.scene.isReady()) await start(); } catch {}
  OBR.scene.onReadyChange((ready) => { if (ready) start(); else { unsub?.(); unsub = null; party = []; refreshTargetBar(); } });
}

/* ---------------- events ---------------- */
function openRef(id) {
  if (M.scenes[id]) { go({ kind: "scene", id }); return; }
  if (M.ent[id]) { setPeek(id); if (["cast", "bestiary", "tables"].includes(prefs.tab)) renderSide(); return; }
  toast("Nothing called “" + id + "” in this module.");
}
function addCombat(name, ref) {
  const st = ref && M.ent[ref] ? monStats(M.ent[ref]) : { hp: 10 };
  const c = { uid: Math.random().toString(36).slice(2, 9), name, hp: st.hp, max: st.hp, ref, note: "" };
  S.combat.push(c); saveState(); return c;
}

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button,a,[data-seg]"); if (!t) return;
  const ds = t.dataset;
  if (t.tagName === "A" && (t.getAttribute("href") === "#")) ev.preventDefault();
  if (ds.ref) return openRef(ds.ref);
  if (ds.go === "overview") return go({ kind: "overview" });
  if (ds.tab) { prefs.tab = ds.tab; savePrefs(); return renderSide(); }
  if (ds.routego) return go({ kind: "scene", id: ds.scene, route: +ds.routego });
  if (ds.expr) {
    if (S && S.target && getTarget()) {
      if (/^d20\+/.test(ds.expr) && t.closest("[data-mon]")) return resolveAttack(t);
      return resolveDamage(t);
    }
    rollExpr(ds.expr, ds.label, { crit: +ds.crit || undefined }); return;
  }
  if (ds.init != null) return rollInit(+ds.init);
  if (ds.link != null) return linkToken(+ds.link);
  if (ds.tgt != null) { S.target = "c:" + S.combat[+ds.tgt].uid; saveState(); renderSide(); renderPeek(); toast("Target: " + S.combat[+ds.tgt].name); return; }
  if (ds.apply) { applyToCombat(ds.apply, +ds.amt, ds.st); return; }
  if (t.classList.contains("rollt")) return rollTable(ds.table);
  if (ds.run) {
    const foes = JSON.parse(ds.run); const made = [];
    for (const f of foes) { const e = M.ent[f.id]; if (e?.data.book) await bookMonster(e.data.book); for (let i = 1; i <= f.n; i++) made.push(addCombat((e?.title || f.id) + (f.n > 1 ? " " + i : ""), e ? f.id : null)); }
    const linked = await linkSelection(made);
    prefs.tab = "tracker"; savePrefs(); renderSide(); toast(`Added ${made.length} to combat${linked ? `, linked ${linked} selected token${linked > 1 ? "s" : ""}` : ""}.`); return;
  }
  if (ds.add) { const e = M.ent[ds.add]; const n = S.combat.filter((c) => c.ref === ds.add).length + 1; const c = addCombat(e.title + " " + n, ds.add); await linkSelection([c]); prefs.tab = "tracker"; savePrefs(); renderSide(); return; }
  if (ds.hp != null) {
    const i = +ds.hp; const amt = +($(`[data-amt="${i}"]`).value || 1); const c = S.combat[i];
    c.hp = Math.max(0, Math.min(c.max + 999, c.hp + amt * +ds.d)); saveState(); renderSide(); return;
  }
  if (ds.crem != null) { const [c] = S.combat.splice(+ds.crem, 1); clearInit([c]); if (S.target === "c:" + c.uid) S.target = ""; saveState(); renderPeek(); return renderSide(); }
  if (ds.lrem != null) { S.log.splice(+ds.lrem, 1); saveState(); return renderSide(); }
  if (ds.seg) {
    const id = t.closest("[data-clock]").dataset.clock; const v = +ds.seg;
    S.clocks[id] = S.clocks[id] === v ? v - 1 : v; saveState();
    $$(`[data-clock="${id}"]`).forEach((el) => el.outerHTML = renderClock(M.ent[id])); return;
  }
  if (ds.open) { openModule(ds.open); return; }
  if (ds.dl) { const it = lib.items[ds.dl]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([it.text], { type: "text/markdown" })); a.download = slug(it.title) + ".md"; a.click(); return; }
  if (ds.del) {
    if (!confirmInline(t, "Delete?")) return;
    delete lib.items[ds.del]; LS.del("agon-module:state:" + ds.del);
    if (modKey === ds.del) { modKey = null; M = null; lib.active = null; }
    saveLib(); view = { kind: "library" }; return render();
  }
  switch (t.id) {
    case "back": if (back.length) { fwd.push(view); view = back.pop(); render(); } return;
    case "fwd": if (fwd.length) { back.push(view); view = fwd.pop(); render(); } return;
    case "libbtn": return go({ kind: "library" });
    case "peekx": setPeek(null); return renderSide();
    case "histbtn": return openHistory();
    case "histx": return closeHistory();
    case "histclear": if (!confirmInline(t, "Click again to clear")) return; rolls = []; saveRolls(); renderTray(); return renderHistory();
    case "demo": {
      try { const r = await fetch("demo.json?v=" + VERSION, { cache: "no-cache" }); const j = await r.json(); return importText(j.text, j.name); }
      catch { return toast("Couldn't load the demo module."); }
    }
    case "addfoe": { const c = addCombat("Foe " + (S.combat.length + 1), null); await linkSelection([c]); return renderSide(); }
    case "initall": for (let i = 0; i < S.combat.length; i++) if (S.combat[i].init == null && S.combat[i].hp > 0) await rollInit(i, true); return renderSide();
    case "clearcbt": if (!confirmInline(t, "Sure?")) return; clearInit(S.combat); if (S.target.startsWith("c:")) S.target = ""; S.combat = []; lastVs = null; saveUI(); renderPeek(); return renderSide();
    case "resetst": if (!confirmInline(t, "Click again to wipe notes, flags, clocks, log")) return; S = blankState(); saveState(); return render();
    case "theme": prefs.theme = { auto: "light", light: "dark", dark: "auto" }[prefs.theme]; savePrefs(); return applyTheme();
    case "size": prefs.size = prefs.size === "full" ? "compact" : "full"; savePrefs(); applySize(); return render();
    case "sidebtn": document.body.classList.toggle("sideopen"); return;
    case "close": saveUI(); if (inOBR) { chan?.postMessage("closed"); OBR.popover.close(POP); } return;
  }
});
function confirmInline(btn, msg) {
  if (btn.dataset.armed) return true;
  const old = btn.textContent; btn.dataset.armed = 1; btn.textContent = msg;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 2500); return false;
}
document.addEventListener("input", (ev) => {
  const t = ev.target, ds = t.dataset;
  if (t.id === "histq") return renderHistory();
  if (ds.note) { S.notes[ds.note] = t.value; saveState(); }
  if (ds.cname != null) { S.combat[+ds.cname].name = t.value; saveState(); }
  if (ds.cnote != null) { S.combat[+ds.cnote].note = t.value; saveState(); }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "tgt") { S.target = t.value; saveState(); renderPeek(); renderSide(); return; }
  if (t.dataset.ceva != null) {
    const c = S.combat[+t.dataset.ceva]; const base = cStats(c).base;
    c.evaOverride = t.value === "" || +t.value === base ? null : +t.value; saveState(); renderSide();
  }
  if (t.dataset.flag) { S.flags[t.dataset.flag] = t.checked; saveState(); $$(`[data-flag="${t.dataset.flag}"]`).forEach((x) => x.checked = t.checked); }
  if (t.id === "file") readFiles(t.files);
});
document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (ev.target.id === "logf") { const v = $("#logi").value.trim(); if (v) { S.log.push({ t: Date.now(), text: v }); saveState(); renderSide(); $("#logi").focus(); } }
  if (ev.target.id === "dicef") { const v = $("#dicei").value.trim(); if (v) rollExpr(v); }
  if (ev.target.id === "searchf") { const q = $("#q").value.trim(); if (q && M) go({ kind: "search", q }); }
});
async function readFiles(files) { for (const f of files) importText(await f.text(), f.name); }
document.addEventListener("dragover", (e) => { if ($("#drop")) { e.preventDefault(); $("#drop").classList.add("over"); } });
document.addEventListener("dragleave", () => $("#drop")?.classList.remove("over"));
document.addEventListener("drop", (e) => { if ($("#drop")) { e.preventDefault(); readFiles(e.dataTransfer.files); } });
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus(); }
  if (e.key === "Escape" && $("#hist.on")) return closeHistory();
  if (e.key === "Escape" && peekId) setPeek(null);
});

document.addEventListener("scroll", (e) => { if (e.target.id === "main" || e.target.id === "peek" || e.target.classList?.contains("sbody")) saveUISoon(); }, true);
window.addEventListener("pagehide", saveUI);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveUI(); });

/* ---------------- theme / size ---------------- */
let obrMode = null;
function applyTheme() {
  const m = prefs.theme === "auto" ? (obrMode || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) : prefs.theme;
  document.documentElement.dataset.theme = m;
  $("#theme").textContent = { auto: "◐ Auto", light: "☀ Light", dark: "☾ Dark" }[prefs.theme];
}
async function applySize() {
  $("#size").textContent = prefs.size === "full" ? "⇲ Compact" : "⇱ Full";
  if (!inOBR) return;
  const vw = await OBR.viewport.getWidth(), vh = await OBR.viewport.getHeight();
  const full = prefs.size === "full";
  await OBR.popover.setWidth(POP, Math.max(420, Math.min(full ? 1320 : 820, vw - 24)));
  await OBR.popover.setHeight(POP, Math.max(400, Math.min(full ? 1000 : 900, vh - 24)));
}

/* ---------------- boot ---------------- */
function lock() {
  document.body.innerHTML = `<div class="lock"><h1>Historian only</h1><p>This module belongs to the Historian.</p></div>`;
}
function start() {
  applyTheme(); $("#size").textContent = prefs.size === "full" ? "⇲ Compact" : "⇱ Full";
  $("#close").hidden = !inOBR;
  if (lib.active && lib.items[lib.active]) openModule(lib.active);
  else { view = { kind: "library" }; render(); }
}
if (inOBR) {
  OBR.onReady(async () => {
    if ((await OBR.player.getRole()) !== "GM") return lock();
    chan?.postMessage("opened");
    try { const th = await OBR.theme.getTheme(); obrMode = th.mode === "DARK" ? "dark" : "light"; OBR.theme.onChange((t) => { obrMode = t.mode === "DARK" ? "dark" : "light"; applyTheme(); }); } catch {}
    OBR.player.onChange((p) => { if (p.role !== "GM") lock(); });
    start();
    watchParty();
  });
} else {
  // standalone test hook (no Owlbear): lets a test page inject party cards
  if (/[?&]test\b/.test(location.search)) window.__agonTest = { setParty: (p) => { party = p; refreshTargetBar(); } };
  start();
}
