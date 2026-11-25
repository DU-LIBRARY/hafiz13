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
    syncInk(wrap);
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
      layoutBook();
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
    if (palOpen && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoInk(); return; }
    if (palOpen && e.key === "Escape") { closePalette(); return; }
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
    layoutBook();
  }
  /** Fit the book between whatever bars are showing (top bar, bottom bar, pencil tools). */
  function layoutBook() {
    let t = 0, b = 0;
    if (chromeOn) {
      t = top.getBoundingClientRect().bottom + 4;
      b = innerHeight - bottom.getBoundingClientRect().top + 4;
    }
    // The pencil tools sit just above the bottom bar when both show.
    inkbar.style.bottom = chromeOn && palOpen ? Math.ceil(b + 4) + "px" : "";
    if (palOpen) b = Math.max(b, innerHeight - inkbar.getBoundingClientRect().top + 4);
    book.style.top = t ? Math.ceil(t) + "px" : "";
    book.style.bottom = b ? Math.ceil(b) + "px" : "";
    refitAll();
  }
  // Tap the left edge to turn forward, the right edge to go back; tap the middle to show or hide the bars.
  const EDGE = 0.25;
  book.addEventListener("click", (e) => {
    if (performance.now() < ignoreClickUntil) return;   // the end of a pencil stroke, not a tap
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
    $("#opt-ink").checked = inkState.show;
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
    } else if (tab === "notes") {
      const pages = [...inks.keys()].filter((q) => inks.get(q).length).sort((a, b) => a - b);
      if (!pages.length) {
        list.append(el("li", "empty", "No pencil notes yet. Write on a page with Apple Pencil, or tap the pencil button to use a finger."));
        return;
      }
      for (const q of pages) {
        const n = inks.get(q).length;
        list.append(row("", "Page " + q, `${M.surahs[surahOf(q) - 1][0]} · Juz ${juzOf(q)} · ${n} ${n === 1 ? "mark" : "marks"}`, "", q, q === p, () => open(q)));
      }
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
    if (e.target.id === "opt-ink") { inkState.show = e.target.checked; store.set("inkShow", inkState.show); document.body.classList.toggle("ink-hidden", !inkState.show); }
    if (e.target.id === "opt-edgetap") { state.edgeTap = e.target.checked; store.set("edgeTap", state.edgeTap); }
    if (e.target.id === "opt-spread") { state.spreadPref = e.target.checked; store.set("spread", state.spreadPref); buildSlots(); }
  });
  function applyTheme(t) {
    state.theme = t; store.set("theme", t);
    document.body.dataset.theme = t;
    const c = getComputedStyle(document.body).getPropertyValue("--paper").trim();
    document.querySelector('meta[name="theme-color"]').setAttribute("content", c);
    book.querySelectorAll(".page-wrap").forEach((w) => redrawInk(w));   // "ink"-coloured pen follows the theme
  }

  // ---------- pencil: write in the margins, mark and highlight mistakes ----------
  // Apple Pencil always writes; fingers still swipe and tap as usual. The pencil button opens the
  // tools (pen, highlighter, eraser, colours, undo); on a device with no pencil, a finger writes
  // while the tools are open. Strokes are kept per page in page-relative units, so they stay on the
  // same words whatever the screen size, and are saved on the device (IndexedDB).
  const INK_TOOLS = {
    pen: { colors: ["#D0312D", "ink", "#1F5FBF", "#1E8A4C"], w: 0.0034 },
    hl: { colors: ["#FFD400", "#6FDB6F", "#FF8CC6", "#74C4FF"], w: 0.046 },
  };
  const inkState = {
    tool: store.get("inkTool", "pen"),                         // pen | hl | eraser
    color: store.get("inkColor", { pen: "#D0312D", hl: "#FFD400" }),
    show: store.get("inkShow", true),
  };
  const inks = new Map();       // page -> [{ t: "pen"|"hl", c, w, p: [x, y, pressure, ...] }]
  const undoStack = [];         // [{ p, before }]
  const inkbar = $("#inkbar");
  let palOpen = false;
  let sawPencil = store.get("sawPencil", false);   // once a pencil is seen, fingers never write
  let ignoreClickUntil = 0;
  let stroke = null;            // the stroke being drawn

  // Storage: IndexedDB (plenty of room); localStorage if that's unavailable.
  let idb = null;
  function loadInk() {
    return new Promise((res) => {
      let rq;
      try { rq = indexedDB.open("hafiz13", 1); } catch { return res(null); }
      rq.onupgradeneeded = () => rq.result.createObjectStore("ink");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = rq.onblocked = () => res(null);
    }).then((db) => new Promise((res) => {
      idb = db;
      if (!db) { for (const [k, v] of Object.entries(store.get("ink", {}))) inks.set(+k, v); return res(); }
      const rq = db.transaction("ink").objectStore("ink").openCursor();
      rq.onsuccess = () => {
        const c = rq.result;
        if (!c) return res();
        if (Array.isArray(c.value) && c.value.length) inks.set(+c.key, c.value);
        c.continue();
      };
      rq.onerror = () => res();
    })).catch(() => {});
  }
  function saveInk(p) {
    const s = inks.get(p) || [];
    if (!s.length) inks.delete(p);
    if (!idb) { store.set("ink", Object.fromEntries(inks)); return; }
    try {
      const os = idb.transaction("ink", "readwrite").objectStore("ink");
      if (s.length) os.put(s, p); else os.delete(p);
    } catch { /* storage unavailable */ }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Two canvases per page, made only once a page has ink: highlights under the text, pen on top.
  function inkLayers(wrap, create) {
    let lo = wrap.querySelector(".ink-lo");
    if (!lo) {
      if (!create) return null;
      lo = el("canvas", "ink ink-lo");
      wrap.prepend(lo); wrap.append(el("canvas", "ink ink-hi"));
      sizeInk(wrap);
    }
    return [lo, wrap.querySelector(".ink-hi")];
  }
  function syncInk(wrap) {
    if (inkLayers(wrap, false)) sizeInk(wrap);
    else if ((inks.get(+wrap.dataset.page) || []).length) inkLayers(wrap, true);
  }
  /** Where the page block sits inside its wrap: ink is stored relative to the page block. */
  function inkGeom(wrap) {
    const w = wrap.getBoundingClientRect(), pg = wrap.querySelector(".page").getBoundingClientRect();
    return { left: w.left, top: w.top, ox: pg.left - w.left, oy: pg.top - w.top, pw: pg.width, ph: pg.height };
  }
  function sizeInk(wrap) {
    const ls = inkLayers(wrap, false);
    if (!ls) return;
    const k = Math.min(devicePixelRatio || 1, 2);
    for (const c of ls) { c.width = Math.round(wrap.clientWidth * k); c.height = Math.round(wrap.clientHeight * k); c.k = k; }
    redrawInk(wrap);
  }
  const inkColor = (c) => (c === "ink" ? getComputedStyle(document.body).getPropertyValue("--ink").trim() : c);

  function drawStroke(ctx, g, s) {
    const k = ctx.canvas.k, pts = s.p, n = pts.length / 3;
    const X = (i) => (g.ox + pts[i * 3] * g.pw) * k, Y = (i) => (g.oy + pts[i * 3 + 1] * g.ph) * k;
    ctx.strokeStyle = ctx.fillStyle = inkColor(s.c);
    ctx.lineCap = ctx.lineJoin = "round";
    const base = s.w * g.ph * k;
    if (s.t === "hl") {
      ctx.lineWidth = base;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(i));
      if (n === 1) ctx.lineTo(X(0) + 0.1, Y(0));
      ctx.stroke();
      return;
    }
    if (n === 1) { ctx.beginPath(); ctx.arc(X(0), Y(0), penWidth(base, pts[2]) / 2, 0, 7); ctx.fill(); return; }
    for (let i = 1; i < n; i++) penSeg(ctx, X, Y, pts, base, i);
    penTail(ctx, X, Y, pts, base, n);
  }
  const penWidth = (base, pr) => base * (0.4 + 1.2 * pr);
  // A smooth curve through the midpoints, one piece per new point, so it can be drawn as the pencil moves.
  function penSeg(ctx, X, Y, pts, base, i) {
    ctx.lineWidth = penWidth(base, (pts[i * 3 - 1] + pts[i * 3 + 2]) / 2);
    ctx.beginPath();
    if (i === 1) ctx.moveTo(X(0), Y(0)); else ctx.moveTo((X(i - 2) + X(i - 1)) / 2, (Y(i - 2) + Y(i - 1)) / 2);
    ctx.quadraticCurveTo(X(i - 1), Y(i - 1), (X(i - 1) + X(i)) / 2, (Y(i - 1) + Y(i)) / 2);
    ctx.stroke();
  }
  function penTail(ctx, X, Y, pts, base, n) {
    ctx.lineWidth = penWidth(base, pts[n * 3 - 1]);
    ctx.beginPath(); ctx.moveTo((X(n - 2) + X(n - 1)) / 2, (Y(n - 2) + Y(n - 1)) / 2); ctx.lineTo(X(n - 1), Y(n - 1)); ctx.stroke();
  }

  function redrawInk(wrap, only) {
    const ls = inkLayers(wrap, false);
    if (!ls) return;
    const g = inkGeom(wrap), list = inks.get(+wrap.dataset.page) || [];
    ls.forEach((c, li) => {
      if (only != null && only !== li) return;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of list) if ((s.t === "hl") === (li === 0)) drawStroke(ctx, g, s);
      if (stroke && stroke.s && stroke.wrap === wrap && (stroke.s.t === "hl") === (li === 0)) drawStroke(ctx, g, stroke.s);
    });
  }
  const wrapsOf = (p) => book.querySelectorAll(`.page-wrap[data-page="${p}"]`);
  function redrawPage(p) { wrapsOf(p).forEach((w) => (inkLayers(w, false) ? redrawInk(w) : syncInk(w))); }

  function remember(p) {
    undoStack.push({ p, before: (inks.get(p) || []).slice() });
    if (undoStack.length > 300) undoStack.shift();
  }
  /** Undo the last change on the page(s) on screen. */
  function undoInk() {
    const visible = pagesOfSlot(currentSlot);
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (!visible.includes(undoStack[i].p)) continue;
      const { p, before } = undoStack.splice(i, 1)[0];
      inks.set(p, before); saveInk(p); redrawPage(p);
      return;
    }
  }

  // ---------- drawing ----------
  const canDraw = (e) => e.pointerType === "pen" || (palOpen && !sawPencil && e.isPrimary && e.button === 0);
  function toPage(e) {
    const g = stroke.g;
    return [(e.clientX - g.left - g.ox) / g.pw, (e.clientY - g.top - g.oy) / g.ph];
  }
  const r4 = (v) => Math.round(v * 1e4) / 1e4;

  book.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "pen" && !sawPencil) { sawPencil = true; store.set("sawPencil", true); updatePalette(); }
    if (stroke || !canDraw(e)) return;
    const wrap = e.target.closest && e.target.closest(".page-wrap");
    if (!wrap) return;
    e.preventDefault();
    if (!inkState.show) { inkState.show = true; store.set("inkShow", true); document.body.classList.remove("ink-hidden"); }
    const p = +wrap.dataset.page;
    // A stylus held eraser-end down (or with its eraser button) erases, whatever tool is picked.
    const tool = e.button === 5 || e.buttons & 32 ? "eraser" : inkState.tool;
    stroke = { id: e.pointerId, wrap, p, g: inkGeom(wrap), tool, last: null, pen: e.pointerType === "pen" };
    if (tool === "eraser") { stroke.before = (inks.get(p) || []).slice(); stroke.erased = false; }
    else {
      inkLayers(wrap, true);
      stroke.s = { t: tool, c: inkState.color[tool], w: INK_TOOLS[tool].w, p: [] };
    }
    try { book.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    addPoints(e, [e]);
  });
  book.addEventListener("pointermove", (e) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    addPoints(e, evs.length ? evs : [e]);
  });
  function addPoints(e, evs) {
    const st = stroke;
    if (st.tool === "eraser") { for (const ev of evs) erase(st, ev); return; }
    const pts = st.s.p, startN = pts.length / 3;
    for (const ev of evs) {
      if (st.last && Math.hypot(ev.clientX - st.last[0], ev.clientY - st.last[1]) < 0.7) continue;
      st.last = [ev.clientX, ev.clientY];
      const [x, y] = toPage(ev);
      // A pencil reports how hard it presses; a mouse or finger gets the middle width.
      const pr = ev.pointerType === "pen" && ev.pressure > 0 ? ev.pressure : 0.5;
      pts.push(r4(x), r4(y), Math.round(pr * 100) / 100);
    }
    const n = pts.length / 3;
    if (n === startN) return;
    if (st.s.t === "hl") { redrawInk(st.wrap, 0); return; }
    const c = st.wrap.querySelector(".ink-hi"), ctx = c.getContext("2d"), g = st.g, k = c.k;
    const X = (i) => (g.ox + pts[i * 3] * g.pw) * k, Y = (i) => (g.oy + pts[i * 3 + 1] * g.ph) * k;
    ctx.strokeStyle = inkColor(st.s.c); ctx.lineCap = ctx.lineJoin = "round";
    for (let i = Math.max(1, startN); i < n; i++) penSeg(ctx, X, Y, pts, st.s.w * g.ph * k, i);
  }
  /** Remove every stroke that passes under the eraser. */
  function erase(st, ev) {
    const list = inks.get(st.p);
    if (!list || !list.length) return;
    const g = st.g, x = ev.clientX - g.left - g.ox, y = ev.clientY - g.top - g.oy;
    const keep = list.filter((s) => {
      const reach = 10 + (s.w * g.ph) / 2, pts = s.p;
      for (let i = 0; i < pts.length; i += 3) {
        const ax = pts[i] * g.pw, ay = pts[i + 1] * g.ph;
        const bx = i + 3 < pts.length ? pts[i + 3] * g.pw : ax, by = i + 3 < pts.length ? pts[i + 4] * g.ph : ay;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= reach) return false;
      }
      return true;
    });
    if (keep.length !== list.length) { inks.set(st.p, keep); st.erased = true; redrawPage(st.p); }
  }
  function endStroke(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    const st = stroke;
    stroke = null;
    ignoreClickUntil = performance.now() + 400;
    // The first time the pencil writes, bring up the tools — after the stroke, so the page never moves under it.
    if (st.pen && !palOpen) setTimeout(openPalette, 0);
    if (st.tool === "eraser") {
      if (st.erased) { undoStack.push({ p: st.p, before: st.before }); saveInk(st.p); }
      return;
    }
    if (e.type === "pointercancel" && st.s.p.length < 9) { redrawInk(st.wrap); return; }
    remember(st.p);
    if (!inks.has(st.p)) inks.set(st.p, []);
    inks.get(st.p).push(st.s);
    saveInk(st.p);
    redrawPage(st.p);
  }
  book.addEventListener("pointerup", endStroke);
  book.addEventListener("pointercancel", endStroke);
  // Writing must never scroll the page: stop the touch that carries the pencil (and, while
  // writing, a resting palm) before the browser turns it into a swipe.
  book.addEventListener("touchstart", (e) => {
    if (stroke || [...e.touches].some((t) => t.touchType === "stylus") || (palOpen && !sawPencil)) e.preventDefault();
  }, { passive: false });
  book.addEventListener("touchmove", (e) => { if (stroke) e.preventDefault(); }, { passive: false });

  // ---------- tools ----------
  function openPalette() {
    if (palOpen) return;
    palOpen = true;
    inkbar.hidden = false;
    updatePalette();
    layoutBook();
  }
  function closePalette() {
    if (!palOpen) return;
    palOpen = false;
    inkbar.hidden = true;
    updatePalette();
    layoutBook();
  }
  function updatePalette() {
    // Without a pencil, a finger writes while the tools are open, so the book stops swiping.
    document.body.classList.toggle("ink-finger", palOpen && !sawPencil);
    $("#btn-ink").classList.toggle("on", palOpen);
    inkbar.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("sel", b.dataset.tool === inkState.tool));
    const box = $("#ink-colors");
    box.replaceChildren();
    const t = INK_TOOLS[inkState.tool];
    box.hidden = !t;
    if (!t) return;
    for (const c of t.colors) {
      const b = el("button", "swatch" + (inkState.tool === "hl" ? " hl" : "") + (inkState.color[inkState.tool] === c ? " sel" : ""));
      b.style.setProperty("--c", c === "ink" ? "var(--ink)" : c);
      b.setAttribute("aria-label", "Colour");
      b.addEventListener("click", () => { inkState.color[inkState.tool] = c; store.set("inkColor", inkState.color); updatePalette(); });
      box.append(b);
    }
  }
  inkbar.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => {
    inkState.tool = b.dataset.tool; store.set("inkTool", inkState.tool); updatePalette();
  }));
  $("#btn-ink").addEventListener("click", () => {
    if (palOpen) { closePalette(); return; }
    chromeOn = false; top.hidden = bottom.hidden = true; document.body.classList.remove("chrome-on");
    openPalette();
  });
  $("#ink-done").addEventListener("click", closePalette);
  $("#ink-undo").addEventListener("click", undoInk);
  $("#ink-clear").addEventListener("click", () => {
    const pages = pagesOfSlot(currentSlot).filter((p) => (inks.get(p) || []).length);
    if (!pages.length) return;
    if (!confirm(pages.length > 1 ? "Clear all pencil marks on these two pages?" : "Clear all pencil marks on this page?")) return;
    for (const p of pages) { remember(p); inks.set(p, []); saveInk(p); redrawPage(p); }
  });
  updatePalette();

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
  document.body.classList.toggle("ink-hidden", !inkState.show);
  Promise.all([
    fetch("mushaf.json").then((r) => r.json()),
    loadInk(),
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
