/* Agon books: theme toggle, contents drawer, scrollspy, in-book search. */
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "agon-books-theme";

  // ---------- theme ----------
  var themeBtn = document.getElementById("themeBtn");
  function label() {
    var t = root.dataset.theme || "auto";
    if (themeBtn) themeBtn.textContent = "Theme: " + t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var order = ["auto", "light", "dark"];
      var next = order[(order.indexOf(root.dataset.theme || "auto") + 1) % 3];
      if (next === "auto") delete root.dataset.theme; else root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label();
    });
  }
  label();

  var content = document.getElementById("content");
  if (!content) return;

  // ---------- contents drawer (narrow screens) ----------
  var tocBtn = document.getElementById("tocToggle");
  var side = document.getElementById("side");
  function setDrawer(open) {
    document.body.classList.toggle("tocOpen", open);
    if (tocBtn) tocBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (tocBtn) tocBtn.addEventListener("click", function () { setDrawer(!document.body.classList.contains("tocOpen")); });
  side.addEventListener("click", function (e) { if (e.target.closest("a") && window.innerWidth <= 960) setDrawer(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setDrawer(false); });

  // ---------- scrollspy ----------
  var links = {};
  side.querySelectorAll(".toc a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var heads = Array.prototype.filter.call(content.querySelectorAll("h1[id],h2[id],h3[id]"), function (h) { return links[h.id]; });
  var active = null;
  function spy() {
    var y = 150, cur = heads[0];
    for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top - y <= 0) cur = heads[i]; else break; }
    if (!cur || cur === active) return;
    if (active && links[active.id]) links[active.id].classList.remove("active");
    active = cur;
    var a = links[cur.id];
    a.classList.add("active");
    var r = a.getBoundingClientRect(), sr = side.getBoundingClientRect();
    if (r.top < sr.top + 60 || r.bottom > sr.bottom - 20) side.scrollTop += r.top - sr.top - sr.height / 3;
  }
  var ticking = false;
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; spy(); }); } }, { passive: true });
  spy();

  // ---------- search ----------
  var q = document.getElementById("q"), hits = document.getElementById("hits");
  // section text for each contents entry (heading through the next heading of any listed level)
  var sections = heads.map(function (h, i) {
    var text = "", n = h, stop = heads[i + 1];
    while (n && n !== stop) {
      if (n.nodeType === 1 && stop && n.contains(stop)) break;
      text += " " + (n.textContent || "");
      n = n.nextElementSibling;
      if (!n) { var p = h.parentElement; n = null; }
    }
    return { id: h.id, text: text.toLowerCase(), li: links[h.id].parentElement };
  });
  var marks = [], idx = -1, timer;

  function clearMarks() {
    content.querySelectorAll("mark").forEach(function (m) {
      var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
    marks = []; idx = -1;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function run() {
    var term = q.value.trim();
    clearMarks();
    side.querySelectorAll(".toc li").forEach(function (li) { li.classList.remove("hide"); });
    if (term.length < 2) { hits.textContent = ""; return; }
    var lower = term.toLowerCase();
    // filter contents: keep entries whose section (or a child section) matches
    var keep = new Set();
    sections.forEach(function (s) {
      if (s.text.indexOf(lower) !== -1) {
        var li = s.li;
        while (li && li.tagName === "LI") { keep.add(li); li = li.parentElement.closest("li"); }
      }
    });
    side.querySelectorAll(".toc li").forEach(function (li) { if (!keep.has(li)) li.classList.add("hide"); });
    // highlight in content
    var re = new RegExp(esc(term), "gi");
    var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeValue.toLowerCase().indexOf(lower) !== -1 && !n.parentElement.closest(".anchor") ? 1 : 2; }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (marks.length > 400) return;
      var frag = document.createDocumentFragment(), last = 0, s = node.nodeValue, m;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var mk = document.createElement("mark"); mk.textContent = m[0]; frag.appendChild(mk); marks.push(mk);
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(s.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
    render();
    if (marks.length) go(0);
  }
  function render() {
    hits.innerHTML = "";
    if (!marks.length) { hits.textContent = "No matches"; return; }
    var span = document.createElement("span");
    span.textContent = (idx + 1) + " of " + marks.length + (marks.length > 400 ? "+" : "");
    var prev = document.createElement("button"); prev.textContent = "↑"; prev.setAttribute("aria-label", "Previous match");
    var next = document.createElement("button"); next.textContent = "↓"; next.setAttribute("aria-label", "Next match");
    prev.onclick = function () { go(idx - 1); }; next.onclick = function () { go(idx + 1); };
    hits.append(span, prev, next);
  }
  function go(i) {
    if (!marks.length) return;
    if (idx >= 0 && marks[idx]) marks[idx].classList.remove("current");
    idx = (i + marks.length) % marks.length;
    marks[idx].classList.add("current");
    marks[idx].scrollIntoView({ block: "center" });
    render();
  }
  q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 180); });
  q.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); go(idx + (e.shiftKey ? -1 : 1)); }
    if (e.key === "Escape") { q.value = ""; run(); }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "/" || (e.key === "f" && (e.ctrlKey || e.metaKey) && e.shiftKey)) && document.activeElement !== q) {
      e.preventDefault(); if (window.innerWidth <= 960) setDrawer(true); q.focus(); q.select();
    }
  });
})();
