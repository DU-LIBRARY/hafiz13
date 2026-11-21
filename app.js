/* Quran — 13-line IndoPak (Taj Company) mushaf reader. No build step, no dependencies. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const book = $("#book");
  const PAGE_ASPECT = 0.66;          // printed page block, width / height
  const LINES = 13;
  // A token made only of Quranic marks (waqf signs, ayah-end symbols) and no letters.
  const MARK_ONLY = /^[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\uE000-\uF8FF\s]+$/;
  const MAX_STRETCH = 1.1;            // most a short line's letters are widened before gaps grow

  // ---------- persisted state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("h13." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("h13." + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const state = {
    page: store.get("page", 1),
    theme: store.get("theme", "white"),
    spreadPref: store.get("spread", true),
    ruled: store.get("ruled", true),
    margins: store.get("margins", true),
    edgeTap: store.get("edgeTap", true),
    fill: store.get("fill", false),
    bookmarks: store.get("bookmarks", []),   // [{p, t}]
  };

  let M = null;                 // { pages, surahs: [en, ar, tr, verses, startPage], juz: [startPage] }
  let spread = false;           // currently showing facing pages
  let slotCount = 0;
  let currentSlot = -1;
  const rendered = new Map();   // slot index -> true
  let highlight = null;         // { s, a } ayah shown highlighted after a verse search
  let highlightT = 0;

  // ---------- lookups ----------
  const pageCount = () => M.pages.length;
  function juzOf(p) { let j = 0; M.juz.forEach((s, i) => { if (s <= p) j = i; }); return j + 1; }
  function surahOf(p) {
    let n = 0;
    M.surahs.forEach((s, i) => { if (s[4] <= p) n = i; });
    // If the surah starts on this page but not at the top, the top still belongs to the previous one.
    const first = M.pages[p - 1].find((l) => l !== 0);
    if (M.surahs[n][4] === p && n > 0 && !(Array.isArray(first) && typeof first[0] === "number" && first[0] === n + 1)) n -= 1;
    return n + 1;
  }
  // ---------- ayahs ----------
  // An ayah ends on a token made only of marks that carries the end-of-ayah sign (as in tools/build_marks.py).
  const isAyahEnd = (w) => MARK_ONLY.test(w) && (w.includes("\u06DF") || [...w].some((c) => c.charCodeAt(0) >= 0xF500 && c.charCodeAt(0) <= 0xF61D));
  const lineWords = (line) => (Array.isArray(line) && typeof line[0] !== "number" ? line : line && line.w ? line.w : null);
  let verses = [];              // [{ s, a, p, l, words }] in mushaf order
  let pageStart = [];           // [surah, ayahs finished] at the top of each page
  const verseIndex = new Map(); // "s:a" -> verse

  function indexAyahs() {
    let s = 0, a = 0, cur = null;
    M.pages.forEach((pg, pi) => {
      pageStart[pi] = [s, a];
      pg.forEach((line, li) => {
        if (Array.isArray(line) && typeof line[0] === "number") { s = line[0]; a = 0; cur = null; return; }
        const ws = lineWords(line);
        if (!ws) return;
        for (const w of ws) {
          if (!cur) { cur = { s, a: a + 1, p: pi + 1, l: li, words: [] }; verses.push(cur); verseIndex.set(s + ":" + cur.a, cur); }
          cur.words.push(w);
          if (isAyahEnd(w)) { a++; cur = null; }
        }
      });
    });
  }

  const slotOfPage = (p) => (spread ? Math.floor((p - 1) / 2) : p - 1);
  const pagesOfSlot = (i) => (spread ? [i * 2 + 1, i * 2 + 2].filter((p) => p <= pageCount()) : [i + 1]);

  // ---------- page building ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** One word. A waqf sign written after it gets its own small box so it never sits on the next word. */
  function wordEl(w) {
    if (MARK_ONLY.test(w)) return el("span", "w mark", w);
    const sp = w.indexOf(" ");
    if (sp < 0 || !MARK_ONLY.test(w.slice(sp + 1))) return el("span", "w", w);
    const s = el("span", "w", w.slice(0, sp));
    s.append(el("span", "mark", w.slice(sp + 1)));
    return s;
  }

  function buildPage(p) {
    const wrap = el("div", "page-wrap");
    wrap.dataset.page = p;
    const head = el("div", "head");
    head.append(el("span", "", "Juz " + juzOf(p)), el("span", "", M.surahs[surahOf(p) - 1][0]));
    const page = el("div", "page" + (p <= 2 ? " opening" : ""));
    const lines = el("div", "lines");
    lines.lang = "ar";
    const data = M.pages[p - 1];
    let [as, aa] = pageStart[p - 1];
    let used = LINES;
    while (used > 0 && data[used - 1] === 0) used--;
    if (p <= 2) page.style.setProperty("--used", used);

    data.forEach((line, i) => {
      if (p <= 2 && i >= used) return;
      const row = el("div", "line");
      if (line === 0) { if (i >= used) row.classList.add("blank"); lines.append(row); return; }
      if (line === "b") {
        row.classList.add("center");
        const inner = el("div", "in bismillah", "﷽");
        row.append(inner);
      } else if (Array.isArray(line) && typeof line[0] === "number") {
        const band = el("div", "surah-band");
        band.append(el("span", "", "surah" + String(line[0]).padStart(3, "0") + " surah-icon"));
        as = line[0]; aa = 0;
        row.append(band);
        row.classList.add("header");
      } else {
        const words = Array.isArray(line) ? line : line.w;
        const centered = !Array.isArray(line) || p <= 2;
        row.classList.add(centered ? "center" : "justify");
        const inner = el("div", "in");
        for (const w of words) {
          const e = wordEl(w), end = isAyahEnd(w);
          if (highlight && highlight.s === as && highlight.a === aa + 1) e.classList.add("hl");
          if (end) aa++;
          inner.append(e);
        }
        row.append(inner);
      }
      lines.append(row);
    });
    page.append(lines);
    if (state.margins && M.marks) {
      page.classList.add(p % 2 ? "m-right" : "m-left");
      page.append(buildMargin(p, used));
    }
    if (state.bookmarks.some((b) => b.p === p)) page.append(el("div", "ribbon"));
    const foot = el("div", "foot", String(p));
    wrap.append(head, page, foot);
    return wrap;
  }

  const urdu = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  const QUARTERS = ["", "ربع", "نصف", "ثلثة"];

  /** The outer margin of the printed page: ruku', quarter, para, manzil and sajdah marks, level with their lines. */
  function buildMargin(p, used) {
    const margin = el("div", "margin " + (p % 2 ? "outer-right" : "outer-left"));
    margin.setAttribute("aria-hidden", "true");
    margin.lang = "ar";
    const byLine = new Map();
    for (const m of M.marks[p - 1]) {
      if (p <= 2 && m[0] >= used) continue;
      if (!byLine.has(m[0])) byLine.set(m[0], []);
      byLine.get(m[0]).push(m);
    }
    for (const [line, ms] of byLine) {
      const cell = el("div", "mk");
      cell.style.gridRow = line + 1;
      for (const m of ms) {
        if (m[1] === "r") {
          // Number in the surah above the ع, ayat in the ruku' below, number in the para at the side.
          const r = el("div", "ruku");
          r.append(el("span", "n", urdu(m[2])), el("span", "ain", "ع"), el("span", "n below", urdu(m[3])), el("span", "jn", urdu(m[4])));
          cell.append(r);
        } else if (m[1] === "q") {
          cell.append(el("div", "lbl", QUARTERS[m[2]]));
        } else if (m[1] === "j" || m[1] === "m") {
          const b = el("div", "lbl" + (m[1] === "j" ? " para" : ""));
          b.append(el("span", "", m[1] === "j" ? "پارہ" : "منزل"), el("span", "big", urdu(m[2])));
          cell.append(b);
        } else if (m[1] === "s") {
          cell.append(el("div", "lbl sajdah", "سجدہ"));
        }
      }
      margin.append(cell);
    }
    return margin;
  }

  /** Size the page block and its type so 13 lines fill it the way the printed page does. */
  function fitPage(wrap) {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    const headH = 30;
    const avH = H - headH * 2;
    // By default the page block keeps the printed proportion, so line spacing never stretches on a
    // tall phone: spare height becomes space above and below the page. With "Fill the screen" on, the
    // page takes the full height instead; the letters keep their size and shape and only the space
    // between the lines grows, so nothing looks stretched.
    const mw = state.margins ? Math.round(Math.min(Math.max(Math.min(W, avH * PAGE_ASPECT) * 0.075, 34), 52)) : 0;
    const pageW = Math.min(W - mw, avH * PAGE_ASPECT);
    const pw = pageW + mw;
    wrap.style.setProperty("--pw", pw + "px");
    wrap.style.setProperty("--pw-num", pw);
    wrap.style.setProperty("--mw", mw + "px");
    wrap.style.setProperty("--ph", (state.fill ? avH : Math.min(avH, pageW / PAGE_ASPECT)) + "px");

    const lines = wrap.querySelector(".lines");
    const slotH = lines.clientHeight / LINES;
    let fs = slotH * 0.62;
    lines.style.setProperty("--fs", fs + "px");

    // Measure every line at its natural (tight) width.
    const rows = [...lines.querySelectorAll(".line")].filter((r) => r.firstChild && r.firstChild.classList.contains("in"));
    rows.forEach((r) => { const i = r.firstChild; i.style.width = "max-content"; i.style.justifyContent = "flex-start"; i.style.transform = ""; i.style.removeProperty("--gap"); });
    const avail = lines.clientWidth;
    let widths = rows.map((r) => r.firstChild.scrollWidth);
    // Size the type so a typical line just fills the width, as the calligrapher does: longer lines are
    // gently condensed and shorter ones gently widened, so words sit close together instead of
    // being pushed apart by big gaps.
    const full = rows.map((r, k) => (r.classList.contains("justify") ? widths[k] : 0)).filter(Boolean).sort((a, b) => a - b);
    if (full.length) {
      const mid = full[Math.floor(full.length * 0.55)];
      const k = Math.min(1, avail / mid);
      if (k < 1) {
        fs *= k;
        lines.style.setProperty("--fs", fs + "px");
        widths = rows.map((r) => r.firstChild.scrollWidth);
      }
    }
    rows.forEach((r, k) => {
      const inner = r.firstChild, w = widths[k];
      if (w > avail) {
        // Condense a long line rather than ever re-wrapping it: first close up the gaps, then narrow the letters.
        inner.style.setProperty("--gap", "0.06em");
        inner.style.transform = `scaleX(${Math.min(1, avail / inner.scrollWidth)})`;
      } else if (r.classList.contains("justify") && w > avail * 0.6) {
        // Widen the letters a little (like kashida), then share out what is left between the words.
        const s = Math.min(avail / w, MAX_STRETCH);
        inner.style.width = avail / s + "px";
        inner.style.justifyContent = "space-between";
        if (s > 1.001) inner.style.transform = `scaleX(${s})`;
      }
    });
  }

  function renderSlot(i) {
    if (i < 0 || i >= slotCount || rendered.has(i)) return;
    const slot = book.children[i];
    slot.replaceChildren(...pagesOfSlot(i).map(buildPage));
    rendered.set(i, true);
    slot.querySelectorAll(".page-wrap").forEach(fitPage);
  }
  function unrenderFar(center) {
    for (const i of [...rendered.keys()]) {
      if (Math.abs(i - center) > 3) { book.children[i].replaceChildren(); rendered.delete(i); }
    }
  }
  function refitAll() { for (const i of rendered.keys()) book.children[i].querySelectorAll(".page-wrap").forEach(fitPage); }
  function rerenderAll() { for (const i of [...rendered.keys()]) { rendered.delete(i); renderSlot(i); } }

  // ---------- layout & navigation ----------
  function wantSpread() { return state.spreadPref && innerWidth > innerHeight && innerWidth >= 900; }

  function buildSlots() {
    spread = wantSpread();
    slotCount = spread ? Math.ceil(pageCount() / 2) : pageCount();
    rendered.clear();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < slotCount; i++) frag.append(el("section", "slot" + (spread ? " spread" : "")));
    book.replaceChildren(frag);
    currentSlot = -1;
    goTo(state.page, false);
  }

  function goTo(p, smooth = true) {
    p = Math.min(Math.max(1, p | 0), pageCount());
    const i = slotOfPage(p);
    for (let k = i - 2; k <= i + 2; k++) renderSlot(k);
    // In a right-to-left scroller, scrollLeft runs from 0 down to negative values.
    const anim = smooth && Math.abs(i - currentSlot) <= 2;
    book.scrollTo({ left: -i * book.clientWidth, behavior: anim ? "smooth" : "instant" });
    // An instant jump made while a swipe is still sliding: set it again next frame so the old slide can't carry on.
    if (!anim) requestAnimationFrame(() => book.scrollTo({ left: -i * book.clientWidth, behavior: "instant" }));
    setSlot(i, p);
  }

  function setSlot(i, explicitPage) {
    const changed = i !== currentSlot;
    currentSlot = i;
    const pages = pagesOfSlot(i);
    state.page = explicitPage && pages.includes(explicitPage) ? explicitPage : pages[0];
    store.set("page", state.page);
    if (changed) { for (let k = i - 2; k <= i + 2; k++) renderSlot(k); unrenderFar(i); }
    updateChrome();
  }

  let scrollRaf = 0, settleT = 0, touching = false;
  /** Once scrolling stops, make sure the book rests exactly on a page, never between two. */
  function settle() {
    if (touching) return;
    const i = Math.round(Math.abs(book.scrollLeft) / book.clientWidth);
    const target = -i * book.clientWidth;
    if (Math.abs(book.scrollLeft - target) > 1) book.scrollTo({ left: target, behavior: "instant" });
  }
  book.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const i = Math.round(Math.abs(book.scrollLeft) / book.clientWidth);
      if (i !== currentSlot && i >= 0 && i < slotCount) setSlot(i);
    });
    clearTimeout(settleT);
    settleT = setTimeout(settle, 180);
  }, { passive: true });
  book.addEventListener("touchstart", () => { touching = true; }, { passive: true });
  book.addEventListener("touchend", () => { touching = false; clearTimeout(settleT); settleT = setTimeout(settle, 180); }, { passive: true });
  book.addEventListener("touchcancel", () => { touching = false; }, { passive: true });

  let resizeT = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (wantSpread() !== spread) buildSlots();
      if (chromeOn) showChrome(true); else refitAll();
      book.scrollTo({ left: -currentSlot * book.clientWidth, behavior: "instant" });
    }, 120);
  });

  // Forward is to the left, as in a mushaf.
  // Taps and keys turn the page instantly: a sliding animation could be cut short by a quick second
  // tap and leave the book stuck between two pages. Swiping keeps its natural slide.
  function nextPage() { goTo(pagesOfSlot(Math.min(slotCount - 1, currentSlot + 1))[0], false); }
  function prevPage() { goTo(pagesOfSlot(Math.max(0, currentSlot - 1))[0], false); }

  // Keyboard (iPad keyboards, desktop): left arrow = next page, as in a mushaf.
  addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowLeft") nextPage();
    if (e.key === "ArrowRight") prevPage();
  });

  // ---------- chrome ----------
  const top = $("#topbar"), bottom = $("#bottombar"), scrub = $("#scrub");
  let chromeOn = false;
  /** Show or hide the bars. While they show, the page shrinks to fit between them so no line is ever covered. */
  function showChrome(on) {
    chromeOn = on;
    top.hidden = !on; bottom.hidden = !on;
    document.body.classList.toggle("chrome-on", on);
    if (on) {
      const t = top.getBoundingClientRect(), b = bottom.getBoundingClientRect();
      book.style.top = Math.ceil(t.bottom + 4) + "px";
      book.style.bottom = Math.ceil(innerHeight - b.top + 4) + "px";
    } else {
      book.style.top = ""; book.style.bottom = "";
    }
    refitAll();
  }
  // Tap the left edge to turn forward, the right edge to go back; tap the middle to show or hide the bars.
  const EDGE = 0.25;
  book.addEventListener("click", (e) => {
    if (state.edgeTap) {
      const x = e.clientX / innerWidth;
      if (x < EDGE) { nextPage(); return; }
      if (x > 1 - EDGE) { prevPage(); return; }
    }
    showChrome(!chromeOn);
  });

  function updateChrome() {
    if (!M) return;
    const p = state.page, s = surahOf(p);
    $("#t-surah").textContent = `${s}. ${M.surahs[s - 1][0]}`;
    $("#t-sub").textContent = `Juz ${juzOf(p)} · Page ${p} of ${pageCount()}`;
    $("#btn-bookmark").classList.toggle("on", state.bookmarks.some((b) => b.p === p));
    if (document.activeElement !== scrub) scrub.value = p;
    $("#scrub-label").textContent = "Page " + p;
  }
  scrub.addEventListener("input", () => { $("#scrub-label").textContent = "Go to page " + scrub.value; });
  scrub.addEventListener("change", () => { goTo(+scrub.value, false); scrub.blur(); });

  $("#btn-bookmark").addEventListener("click", () => {
    const p = state.page;
    const i = state.bookmarks.findIndex((b) => b.p === p);
    if (i >= 0) state.bookmarks.splice(i, 1);
    else { state.bookmarks.push({ p, t: Date.now() }); state.bookmarks.sort((a, b) => a.p - b.p); }
    store.set("bookmarks", state.bookmarks);
    rendered.delete(slotOfPage(p)); renderSlot(slotOfPage(p));
    updateChrome();
  });

  // ---------- dialogs ----------
  const contents = $("#contents"), settings = $("#settings"), find = $("#find");
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  [contents, settings, find].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  let tab = "surah";
  $("#btn-contents").addEventListener("click", () => { $("#search").value = ""; renderList(); contents.showModal(); scrollToCurrent(); });
  $("#btn-settings").addEventListener("click", () => {
    settings.querySelector(`input[value="${state.theme}"]`).checked = true;
    $("#opt-spread").checked = state.spreadPref;
    $("#opt-ruled").checked = state.ruled;
    $("#opt-margins").checked = state.margins;
    $("#opt-edgetap").checked = state.edgeTap;
    $("#opt-fill").checked = state.fill;
    settings.showModal();
  });
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab;
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
    $("#search").hidden = tab !== "surah";
    renderList();
  }));
  $("#search").addEventListener("input", renderList);
  $("#goto").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = parseInt($("#goto-page").value, 10);
    if (p >= 1 && p <= pageCount()) open(p);
  });

  function open(p) { contents.close(); showChrome(false); goTo(p, false); }

  // Ignore case, spaces, hyphens and apostrophes: "yasin", "ya sin" and "Ya-Sin" all match.
  // A leading "al-", "an-", "ali" etc. is optional too, so "al imran" finds "Ali 'Imran".
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
  const ARTICLES = ["aale", "aal", "ali", "ash", "adh", "al", "an", "ar", "as", "at", "ad", "az"];
  const bare = (s) => [s, ...ARTICLES.filter((a) => s.startsWith(a) && s.length - a.length >= 2).map((a) => s.slice(a.length))];
  const startsLike = (name, q) => { const qs = bare(q); return bare(name).some((v) => qs.some((x) => v.startsWith(x))); };
  /** Does surah index i match a normalized query q (number, English, translation or Arabic name)? */
  function surahMatches(i, q) {
    const [en, ar, tr] = M.surahs[i];
    return String(i + 1) === q || norm(en).includes(q) || startsLike(norm(en), q) || norm(tr).includes(q) || norm(ar).includes(q);
  }

  // ---------- verse search ----------
  // Arabic is matched on its bare letters: vowels, waqf signs and other marks are ignored, letter
  // variants are folded together (ی/ي/ى, ك/ک, ة/ه, أ/إ/آ/ا…), alifs and spaces are dropped. So a
  // plainly typed "الرحمن" finds the IndoPak "الرَّحْمٰنِ", and "الصلاة" finds "الصَّلٰوةَ".
  const ARABIC_FOLD = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ی": "ي", "ئ": "ي", "ے": "ي", "ؤ": "و", "ة": "ه", "ۃ": "ه", "ہ": "ه", "ۂ": "ه", "ھ": "ه", "ک": "ك", "ء": "" };
  function arabicKey(t) {
    return t
      .replace(/\u0670و/g, "")                       // IndoPak small alif + و reads as a long a (صلٰوة = صلاة)
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\uE000-\uF8FF]/g, "")
      .replace(/[أإآٱىیئےؤةۃہۂھکء]/g, (c) => ARABIC_FOLD[c])
      .replace(/[^\u0621-\u064A]/g, "")
      .replace(/ا/g, "");
  }
  let keysReady = false;
  function verseKeys() {
    if (keysReady) return;
    for (const v of verses) v.key = arabicKey(v.words.join(""));
    keysReady = true;
  }
  const verseText = (v) => v.words.filter((w) => !MARK_ONLY.test(w)).join(" ");
  const MAX_RESULTS = 60;

  /** Verses for a query: "2:255", "2 255", "Baqarah 255", "Yasin" (the whole surah) or Arabic words. */
  function findVerses(raw) {
    const q = raw.trim();
    if (!q) return { list: [], total: 0 };
    let m = q.match(/^(\d{1,3})\s*[:.\s-]\s*(\d{1,3})$/);
    if (m) { const v = verseIndex.get(+m[1] + ":" + +m[2]); return { list: v ? [v] : [], total: v ? 1 : 0 }; }
    if (/^[\sa-z0-9'’`\-:.]+$/i.test(q)) {
      // A surah by number or name, optionally followed by an ayah number.
      m = q.match(/^(.*?)[\s:.]*(\d{1,3})?$/);
      const name = norm(m[1]), ayah = m[2] && m[1].trim() ? +m[2] : 0;
      let si = -1;
      if (!m[1].trim() && m[2]) si = +m[2] - 1;
      else if (name) { si = M.surahs.findIndex((x, i) => norm(x[0]) === name); if (si < 0) si = M.surahs.findIndex((x, i) => surahMatches(i, name)); }
      if (si < 0 || si >= M.surahs.length) return { list: [], total: 0 };
      if (ayah) { const v = verseIndex.get(si + 1 + ":" + ayah); return { list: v ? [v] : [], total: v ? 1 : 0 }; }
      const all = verses.filter((v) => v.s === si + 1);
      return { list: all, total: all.length };
    }
    const key = arabicKey(q);
    if (key.length < 2) return { list: [], total: 0 };
    verseKeys();
    const list = [];
    let total = 0;
    for (const v of verses) if (v.key.includes(key)) { total++; if (list.length < MAX_RESULTS) list.push(v); }
    return { list, total };
  }

  function renderFind() {
    const list = $("#find-list"), q = $("#find-q").value;
    const { list: found, total } = findVerses(q);
    list.replaceChildren();
    if (!q.trim()) {
      list.append(el("li", "empty", "Type Arabic words, e.g. الرحمن الرحيم — or a reference: 2:255, Yasin 12, Kahf."));
      return;
    }
    if (!found.length) { list.append(el("li", "empty", "No verses found.")); return; }
    if (total > found.length) list.append(el("li", "count", `Showing the first ${found.length} of ${total} verses — type more to narrow it down.`));
    else list.append(el("li", "count", total === 1 ? "1 verse" : `${total} verses`));
    for (const v of found) {
      const li = el("li"), b = el("button", "verse");
      const ref = el("span", "ref");
      ref.append(el("span", "name", `${M.surahs[v.s - 1][0]} ${v.s}:${v.a}`), el("span", "pg", "p. " + v.p));
      const ar = el("span", "ar", verseText(v));
      ar.lang = "ar"; ar.dir = "rtl";
      b.append(ref, ar);
      b.addEventListener("click", () => openVerse(v));
      li.append(b);
      list.append(li);
    }
  }

  /** Go to a verse's page and highlight it for a few seconds. */
  function openVerse(v) {
    find.close();
    contents.close();
    showChrome(false);
    clearTimeout(highlightT);
    highlight = { s: v.s, a: v.a };
    // Re-draw the verse's page (and the next, where a verse can run on) with the highlight.
    const i = slotOfPage(v.p);
    rendered.delete(i); rendered.delete(i + 1);
    goTo(v.p, false);
    highlightT = setTimeout(() => {
      book.querySelectorAll(".w.hl").forEach((e) => e.classList.remove("hl"));
      highlight = null;
    }, 4000);
  }

  let findT = 0;
  $("#find-q").addEventListener("input", () => { clearTimeout(findT); findT = setTimeout(renderFind, 120); });
  $("#find-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(findT); renderFind();
    const first = $("#find-list button.verse");
    if (first) first.click();
  });
  $("#btn-find").addEventListener("click", () => {
    renderFind();
    find.showModal();
    $("#find-q").focus();
    $("#find-q").select();
  });

  function row(n, name, sub, ar, pg, current, onClick) {
    const li = el("li"), b = el("button", current ? "current" : "");
    const left = el("span", "n", n);
    const mid = el("span"); mid.append(el("span", "name", name)); if (sub) mid.append(el("span", "sub", sub));
    const right = el("span", "right"); if (ar) right.append(el("span", "ar", ar)); right.append(el("span", "pg", "p. " + pg));
    b.append(left, mid, right);
    b.addEventListener("click", onClick);
    li.append(b);
    return li;
  }

  function renderList() {
    const list = $("#list");
    list.replaceChildren();
    const p = state.page;
    if (tab === "surah") {
      const q = norm($("#search").value);
      const cur = surahOf(p);
      M.surahs.forEach(([en, ar, tr, v, start], i) => {
        const n = i + 1;
        if (q && !surahMatches(i, q)) return;
        list.append(row(n, en, `${tr} · ${v} ayat`, ar, start, n === cur, () => open(start)));
      });
    } else if (tab === "juz") {
      const cur = juzOf(p);
      M.juz.forEach((start, i) => list.append(row(i + 1, "Juz " + (i + 1), M.surahs[surahOf(start) - 1][0], "", start, i + 1 === cur, () => open(start))));
    } else {
      if (!state.bookmarks.length) {
        list.append(el("li", "empty", "No bookmarks yet. Tap a page, then the bookmark button."));
        return;
      }
      state.bookmarks.forEach((bm) => {
        const li = row("", "Page " + bm.p, `${M.surahs[surahOf(bm.p) - 1][0]} · Juz ${juzOf(bm.p)} · ${new Date(bm.t).toLocaleDateString()}`, "", bm.p, bm.p === p, () => open(bm.p));
        li.classList.add("bm");
        const del = el("button", "del", "Remove");
        del.addEventListener("click", () => {
          state.bookmarks = state.bookmarks.filter((x) => x !== bm);
          store.set("bookmarks", state.bookmarks);
          rerenderAll(); updateChrome(); renderList();
        });
        li.append(del);
        list.append(li);
      });
    }
  }
  function scrollToCurrent() { const c = $("#list .current"); if (c) c.scrollIntoView({ block: "center" }); }

  settings.addEventListener("change", (e) => {
    if (e.target.name === "theme") applyTheme(e.target.value);
    if (e.target.id === "opt-ruled") { state.ruled = e.target.checked; store.set("ruled", state.ruled); document.body.classList.toggle("ruled", state.ruled); }
    if (e.target.id === "opt-margins") { state.margins = e.target.checked; store.set("margins", state.margins); rerenderAll(); }
    if (e.target.id === "opt-fill") { state.fill = e.target.checked; store.set("fill", state.fill); refitAll(); }
    if (e.target.id === "opt-edgetap") { state.edgeTap = e.target.checked; store.set("edgeTap", state.edgeTap); }
    if (e.target.id === "opt-spread") { state.spreadPref = e.target.checked; store.set("spread", state.spreadPref); buildSlots(); }
  });
  function applyTheme(t) {
    state.theme = t; store.set("theme", t);
    document.body.dataset.theme = t;
    const c = getComputedStyle(document.body).getPropertyValue("--paper").trim();
    document.querySelector('meta[name="theme-color"]').setAttribute("content", c);
  }

  // ---------- install (Android: one-tap install; in-app browsers can't install, so send people to Chrome) ----------
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Telegram|WhatsApp|GSA\/|; wv\)/i.test(ua);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let installPrompt = null;
  const banner = $("#install-banner");

  function installHow() {
    if (installed) return "";
    if (inAppBrowser) return isIOS ? "Open this page in Safari first (share menu → Open in Safari), then Share → Add to Home Screen."
                                   : "Open this page in Chrome first (⋮ menu → Open in Chrome), then tap Install.";
    if (installPrompt) return "Adds the Quran app to your home screen and works offline.";
    if (isIOS) return "In Safari: Share → Add to Home Screen.";
    if (isAndroid) return "In Chrome: ⋮ menu → Install app (or Add to Home screen).";
    return "Use your browser's Install or Add to Home Screen option.";
  }
  function updateInstallUI() {
    const row = $("#install-row");
    row.hidden = installed;
    $("#install-how").textContent = installHow();
    $("#install-btn").hidden = !installPrompt;
  }
  function showBanner() {
    if (installed || store.get("installDismissed", false)) return;
    if (inAppBrowser) {
      $("#install-text").textContent = "To install the Quran app, open it in " + (isIOS ? "Safari." : "Chrome.");
      if (isAndroid) {
        const a = $("#install-open");
        a.href = "intent://" + location.host + location.pathname + "#Intent;scheme=https;package=com.android.chrome;end";
        a.hidden = false;
      }
      banner.hidden = false;
    } else if (installPrompt) {
      $("#install-text").textContent = "Install the Quran app on your phone — it works offline.";
      $("#install-go").hidden = false;
      banner.hidden = false;
    }
  }
  async function runInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    banner.hidden = true;
    updateInstallUI();
  }
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();          // show our own button instead of Chrome's mini bar
    installPrompt = e;
    updateInstallUI();
    showBanner();
  });
  addEventListener("appinstalled", () => { installPrompt = null; banner.hidden = true; store.set("installDismissed", true); });
  $("#install-go").addEventListener("click", runInstall);
  $("#install-btn").addEventListener("click", runInstall);
  $("#install-x").addEventListener("click", () => { banner.hidden = true; store.set("installDismissed", true); });
  updateInstallUI();
  showBanner();

  // ---------- start ----------
  applyTheme(state.theme);
  document.body.classList.toggle("ruled", state.ruled);
  Promise.all([
    fetch("mushaf.json").then((r) => r.json()),
    document.fonts.load('24px "IndoPak"', "ب"),
    document.fonts.load('24px "SurahNames"', "surah001"),
  ]).then(([data]) => {
    M = data;
    indexAyahs();
    scrub.max = pageCount();
    $("#loading").remove();
    buildSlots();
  }).catch((err) => {
    $("#loading").textContent = "Could not load the mushaf. Check your connection and reopen.";
    console.error(err);
  });

  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").then((r) => r.update()).catch(() => {}));
  }
})();
