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
    bookmarks: store.get("bookmarks", []),   // [{p, t}]
  };

  let M = null;                 // { pages, surahs: [en, ar, tr, verses, startPage], juz: [startPage] }
  let spread = false;           // currently showing facing pages
  let slotCount = 0;
  let currentSlot = -1;
  const rendered = new Map();   // slot index -> true

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
        row.append(band);
        row.classList.add("header");
      } else {
        const words = Array.isArray(line) ? line : line.w;
        const centered = !Array.isArray(line) || p <= 2;
        row.classList.add(centered ? "center" : "justify");
        const inner = el("div", "in");
        for (const w of words) inner.append(wordEl(w));
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
          cell.append(el("div", "lbl sajdah", "سجدة"));
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
    // The page block always keeps the printed proportion, so line spacing never stretches on a tall
    // phone: spare height becomes space above and below the page.
    const mw = state.margins ? Math.round(Math.min(Math.max(Math.min(W, avH * PAGE_ASPECT) * 0.075, 34), 52)) : 0;
    const pageW = Math.min(W - mw, avH * PAGE_ASPECT);
    const pw = pageW + mw;
    wrap.style.setProperty("--pw", pw + "px");
    wrap.style.setProperty("--pw-num", pw);
    wrap.style.setProperty("--mw", mw + "px");
    wrap.style.setProperty("--ph", Math.min(avH, pageW / PAGE_ASPECT) + "px");

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
    book.scrollTo({ left: -i * book.clientWidth, behavior: smooth && Math.abs(i - currentSlot) <= 2 ? "smooth" : "instant" });
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

  let scrollRaf = 0;
  book.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const i = Math.round(Math.abs(book.scrollLeft) / book.clientWidth);
      if (i !== currentSlot && i >= 0 && i < slotCount) setSlot(i);
    });
  }, { passive: true });

  let resizeT = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (wantSpread() !== spread) buildSlots();
      if (chromeOn) showChrome(true); else refitAll();
      book.scrollTo({ left: -currentSlot * book.clientWidth, behavior: "instant" });
    }, 120);
  });

  // Keyboard (iPad keyboards, desktop): left arrow = next page, as in a mushaf.
  addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowLeft") goTo(pagesOfSlot(Math.min(slotCount - 1, currentSlot + 1))[0]);
    if (e.key === "ArrowRight") goTo(pagesOfSlot(Math.max(0, currentSlot - 1))[0]);
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
  book.addEventListener("click", () => showChrome(!chromeOn));

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
  const contents = $("#contents"), settings = $("#settings");
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  [contents, settings].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  let tab = "surah";
  $("#btn-contents").addEventListener("click", () => { $("#search").value = ""; renderList(); contents.showModal(); scrollToCurrent(); });
  $("#btn-settings").addEventListener("click", () => {
    settings.querySelector(`input[value="${state.theme}"]`).checked = true;
    $("#opt-spread").checked = state.spreadPref;
    $("#opt-ruled").checked = state.ruled;
    $("#opt-margins").checked = state.margins;
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
      // Ignore case, spaces, hyphens and apostrophes: "yasin", "ya sin" and "Ya-Sin" all match.
      // A leading "al-", "an-", "ali" etc. is optional too, so "al imran" finds "Ali 'Imran".
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
      const ARTICLES = ["aale", "aal", "ali", "ash", "adh", "al", "an", "ar", "as", "at", "ad", "az"];
      const bare = (s) => [s, ...ARTICLES.filter((a) => s.startsWith(a) && s.length - a.length >= 2).map((a) => s.slice(a.length))];
      const startsLike = (name, q) => { const qs = bare(q); return bare(name).some((v) => qs.some((x) => v.startsWith(x))); };
      const q = norm($("#search").value);
      const cur = surahOf(p);
      M.surahs.forEach(([en, ar, tr, v, start], i) => {
        const n = i + 1;
        if (q && !(String(n) === q || norm(en).includes(q) || startsLike(norm(en), q) || norm(tr).includes(q) || norm(ar).includes(q))) return;
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
