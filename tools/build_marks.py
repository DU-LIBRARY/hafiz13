"""Work out the margin marks of the printed mushaf for every page and store them in mushaf.json.

Run from the repo root:  python3 tools/build_marks.py

The text already carries the marks the Taj print puts in its margins, as glyphs on the
end-of-ayah token: the ruku' sign, the quarter / half / three-quarter juz signs, the end of a
juz and the sajdah ayahs. This script reads them off, counts ayahs (checked against every
surah's ayah count) and writes M["marks"][page - 1] = [[line, kind, ...], ...], line 0-based:

  [line, "r", ruku_in_surah, ayat_in_ruku, ruku_in_juz]   ruku' ends on this line
  [line, "q", 1|2|3]                                      ربع / نصف / ثلثة of the juz
  [line, "j", juz]                                         juz (para) starts on this line
  [line, "m", manzil]                                      manzil starts on this line
  [line, "s"]                                              sajdah ayah ends on this line
"""
import json
import re

MARK_ONLY = re.compile("^[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\uE000-\uF8FF\\s]+$")
RUKU = "\u06E0"
QUARTER = {"\uF64C": 1, "\uF64D": 2, "\uF64E": 3, "\uF64F": 3}   # ربع، نصف، ثلثة (F64F: a ثلثة that falls mid-ayah)
JUZ_END = "\uF650"
SAJDAH = {chr(c) for c in range(0xF680, 0xF68F)} | {"\uF692"}      # the 14 sajdahs marked in the text
# Ruku' ends whose sign is not drawn in the source text (two of them are sajdah ayahs).
# With these the total is 558, the IndoPak count.
UNMARKED_RUKU = {(3, 171), (16, 50), (25, 60)}
MANZIL_START = [(1, 1), (5, 1), (10, 1), (17, 1), (26, 1), (37, 1), (50, 1)]


def words(line):
    if isinstance(line, list) and not (line and isinstance(line[0], int)):
        return line
    if isinstance(line, dict):
        return line["w"]
    return []


def is_ayah_end(w):
    return MARK_ONLY.match(w) is not None and ("\u06DF" in w or any(0xF500 <= ord(c) <= 0xF61D for c in w))


def main():
    M = json.load(open("mushaf.json", encoding="utf-8"))
    pages = M["pages"]
    marks = [[] for _ in pages]
    starts = {}                       # (surah, ayah) -> (page, line) of its first word
    surah, ayah = 0, 0
    juz, juz_ruku = 1, 0
    surah_ruku, ruku_from = 0, 1
    juz_start = {(1, 1): 1}

    last_end = None                   # (page, line) of the latest ayah end

    def close_surah():
        nonlocal surah_ruku, juz_ruku
        assert surah == 0 or ayah == M["surahs"][surah - 1][3], (surah, ayah)
        if surah and ruku_from <= ayah:
            # A surah always ends a ruku', even where the sign is not drawn (sajdah endings).
            surah_ruku += 1
            juz_ruku += 1
            p, li = last_end
            marks[p - 1].append([li, "r", surah_ruku, ayah - ruku_from + 1, juz_ruku])

    for p, pg in enumerate(pages, 1):
        for li, line in enumerate(pg):
            if isinstance(line, list) and line and isinstance(line[0], int):
                close_surah()
                surah, ayah, surah_ruku, ruku_from = line[0], 0, 0, 1
                continue
            for w in words(line):
                for ch, n in QUARTER.items():
                    if ch in w:
                        marks[p - 1].append([li, "q", n])
                if not is_ayah_end(w):
                    starts.setdefault((surah, ayah + 1), (p, li))
                    continue
                ayah += 1
                last_end = (p, li)
                if RUKU in w or (surah, ayah) in UNMARKED_RUKU:
                    surah_ruku += 1
                    juz_ruku += 1
                    marks[p - 1].append([li, "r", surah_ruku, ayah - ruku_from + 1, juz_ruku])
                    ruku_from = ayah + 1
                if SAJDAH & set(w):
                    marks[p - 1].append([li, "s"])
                if JUZ_END in w and (surah, ayah) != (114, 6):
                    juz += 1
                    juz_ruku = 0
                    nxt = (surah, ayah + 1) if ayah < M["surahs"][surah - 1][3] else (surah + 1, 1)
                    juz_start[nxt] = juz
    close_surah()

    # Each para starts at the top of a page; the page list the app shows comes from here.
    juz_pages = []
    for key, j in sorted(juz_start.items(), key=lambda kv: kv[1]):
        p, li = starts[key]
        juz_pages.append(p)
        marks[p - 1].append([li, "j", j])
    print("juz start pages", juz_pages)
    M["juz"] = juz_pages
    for m, key in enumerate(MANZIL_START, 1):
        p, li = starts[key]
        marks[p - 1].append([li, "m", m])

    order = "jmqrs"
    for m in marks:
        m.sort(key=lambda x: (x[0], order.index(x[1])))
    count = lambda k: sum(1 for m in marks for x in m if x[1] == k)
    print("ruku'", count("r"), "| quarters", count("q"), "| juz", count("j"), "| manzil", count("m"), "| sajdah", count("s"))
    M["marks"] = marks
    json.dump(M, open("mushaf.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
