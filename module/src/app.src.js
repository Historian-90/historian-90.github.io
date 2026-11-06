// Agon Module — the Historian's module reader.
// Module text lives ONLY in this browser's storage. Nothing is written to the room.
import OBR from "@owlbear-rodeo/sdk";
import { marked } from "marked";
import * as yaml from "js-yaml";

const VERSION = "1.0.1";
const POP = "com.agon.module/popover";
const BOOKS = {
  player: "/books/player-handbook/index.html",
  historian: "/books/historian-handbook/index.html",
  lore: "/books/world-lore/index.html",
};
const chan = (() => { try { return new BroadcastChannel("agon-module"); } catch { return null; } })();
const inOBR = OBR.isAvailable;

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
let rolls = [];
let curScene, routeIdx = 0;

const blankState = () => ({ flags: {}, clocks: {}, notes: {}, combat: [], log: [], visited: {}, view: null, open: {} });
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
  rolls.unshift(r); rolls = rolls.slice(0, 12);
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
    const h = depth === 0 && ln.match(/^(#{1,2})\s+(.+?)\s*(?:\{#([\w-]+)\})?\s*$/);
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
  if (hit >= 0) { r.detail += ` → ${rows[hit].text.replace(/[*_`]|\[\[|\]\]/g, "")}`; renderTray(); }
  $$(`.rtable[data-table="${id}"] tr`).forEach((tr) => tr.classList.toggle("hit", +tr.dataset.i === hit));
}

/* ---------------- dice auto-linking ---------------- */
function dice(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest("button,a,textarea,input,.nodice,h1,h2,h3,h4") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
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
}
function trackerHTML() {
  const clocks = Object.values(M.ent).filter((e) => e.type === "clock");
  const combat = S.combat.map((c, i) => `<div class="cbt ${c.hp <= 0 ? "down" : ""}"><div class="cn"><input value="${esc(c.name)}" data-cname="${i}"><button class="x" data-crem="${i}" title="Remove">×</button></div>
    <div class="ch"><button data-hp="${i}" data-d="-1">−</button><input class="amt" type="number" min="0" placeholder="amt" data-amt="${i}"><button data-hp="${i}" data-d="1">+</button><span class="hpv"><b>${c.hp}</b>/${c.max}</span>${c.ref ? `<a href="#" class="xref" data-ref="${c.ref}">stats</a>` : ""}</div>
    <input class="cnote" placeholder="conditions, notes" value="${esc(c.note || "")}" data-cnote="${i}"></div>`).join("");
  return `<div class="grp"><div class="gh">Combat <button class="btn xs" id="addfoe">+ custom</button>${S.combat.length ? '<button class="btn xs" id="clearcbt">clear</button>' : ""}</div>${combat || '<div class="empty">Use ⚔ Run on an encounter, or “Add to combat” on a stat block.</div>'}</div>
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
  p.innerHTML = `<div class="peekbar"><span>${esc({ npc: "Cast", monster: "Bestiary", table: "Table", clock: "Clock" }[e.type])}</span>${e.scene ? `<a href="#" class="xref" data-ref="${e.scene}">in ${esc(M.scenes[e.scene]?.title || "")}</a>` : ""}<button class="x" id="peekx" title="Close">×</button></div><div class="peekbody">${e.type === "clock" ? renderClock(e) : renderEntity(e, false)}</div>`;
  $$("[data-mon]", p).forEach(fillMonster);
  dice(p);
}
function renderTray(flash) {
  const t = $("#rolls");
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
  back.length = 0; fwd.length = 0; peekId = null;
  view = S.view && (S.view.kind !== "scene" || M.scenes[S.view.id]) ? S.view : { kind: "overview" };
  if (view.kind === "library") view = { kind: "overview" };
  render();
  prefetchBook();
}
async function prefetchBook() {
  const need = Object.values(M.ent).filter((e) => e.type === "monster" && e.data.book && !e.data.name);
  if (!need.length) return;
  for (const e of need) { const bm = await bookMonster(e.data.book); if (bm?.name) e.title = bm.name; }
  const sc = $("#main").scrollTop; render(); $("#main").scrollTop = sc;
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

/* ---------------- events ---------------- */
function openRef(id) {
  if (M.scenes[id]) { go({ kind: "scene", id }); return; }
  if (M.ent[id]) { peekId = id; renderPeek(); if (["cast", "bestiary", "tables"].includes(prefs.tab)) renderSide(); return; }
  toast("Nothing called “" + id + "” in this module.");
}
function addCombat(name, hp, ref) { S.combat.push({ name, hp, max: hp, ref, note: "" }); saveState(); }

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button,a,[data-seg]"); if (!t) return;
  const ds = t.dataset;
  if (t.tagName === "A" && (t.getAttribute("href") === "#")) ev.preventDefault();
  if (ds.ref) return openRef(ds.ref);
  if (ds.go === "overview") return go({ kind: "overview" });
  if (ds.tab) { prefs.tab = ds.tab; savePrefs(); return renderSide(); }
  if (ds.routego) return go({ kind: "scene", id: ds.scene, route: +ds.routego });
  if (ds.expr) { const r = rollExpr(ds.expr, ds.label, { crit: +ds.crit || undefined }); return; }
  if (t.classList.contains("rollt")) return rollTable(ds.table);
  if (ds.run) {
    const foes = JSON.parse(ds.run); let added = 0;
    for (const f of foes) { const e = M.ent[f.id]; if (e?.data.book) await bookMonster(e.data.book); const hp = e ? monsterHP(e) : 0; for (let i = 1; i <= f.n; i++) { addCombat((e?.title || f.id) + (f.n > 1 ? " " + i : ""), hp, e ? f.id : null); added++; } }
    prefs.tab = "tracker"; savePrefs(); renderSide(); toast(`Added ${added} to the combat tracker.`); return;
  }
  if (ds.add) { const e = M.ent[ds.add]; const n = S.combat.filter((c) => c.ref === ds.add).length + 1; addCombat(e.title + " " + n, monsterHP(e), ds.add); prefs.tab = "tracker"; savePrefs(); renderSide(); return; }
  if (ds.hp != null) {
    const i = +ds.hp; const amt = +($(`[data-amt="${i}"]`).value || 1); const c = S.combat[i];
    c.hp = Math.max(0, Math.min(c.max + 999, c.hp + amt * +ds.d)); saveState(); renderSide(); return;
  }
  if (ds.crem != null) { S.combat.splice(+ds.crem, 1); saveState(); return renderSide(); }
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
    case "peekx": peekId = null; renderPeek(); return renderSide();
    case "demo": {
      try { const r = await fetch("demo.json?v=" + VERSION, { cache: "no-cache" }); const j = await r.json(); return importText(j.text, j.name); }
      catch { return toast("Couldn't load the demo module."); }
    }
    case "addfoe": addCombat("Foe " + (S.combat.length + 1), 10, null); return renderSide();
    case "clearcbt": if (!confirmInline(t, "Sure?")) return; S.combat = []; saveState(); return renderSide();
    case "resetst": if (!confirmInline(t, "Click again to wipe notes, flags, clocks, log")) return; S = blankState(); saveState(); return render();
    case "theme": prefs.theme = { auto: "light", light: "dark", dark: "auto" }[prefs.theme]; savePrefs(); return applyTheme();
    case "size": prefs.size = prefs.size === "full" ? "compact" : "full"; savePrefs(); applySize(); return render();
    case "sidebtn": document.body.classList.toggle("sideopen"); return;
    case "close": if (inOBR) { chan?.postMessage("closed"); OBR.popover.close(POP); } return;
  }
});
function confirmInline(btn, msg) {
  if (btn.dataset.armed) return true;
  const old = btn.textContent; btn.dataset.armed = 1; btn.textContent = msg;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 2500); return false;
}
document.addEventListener("input", (ev) => {
  const t = ev.target, ds = t.dataset;
  if (ds.note) { S.notes[ds.note] = t.value; saveState(); }
  if (ds.cname != null) { S.combat[+ds.cname].name = t.value; saveState(); }
  if (ds.cnote != null) { S.combat[+ds.cnote].note = t.value; saveState(); }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
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
  if (e.key === "Escape" && peekId) { peekId = null; renderPeek(); }
});

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
  });
} else start();
