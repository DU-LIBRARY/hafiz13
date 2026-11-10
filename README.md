# Hafiz 13

A clean 13-line IndoPak Quran reader (Taj Company layout, 847 pages) for iPhone and iPad, as an installable web app.

- Every page is 13 lines, laid out line-for-line like the printed hafizi mushaf, with ruled lines and close word spacing.
- Margin notes as printed: ruku' (ع with its number in the surah, ayat in the ruku' and number in the para), ربع / نصف / ثلثة, para, manzil and sajdah.
- Swipe left-to-right to turn forward, like a real mushaf; two facing pages on iPad in landscape.
- Surah / juz / page navigation, bookmarks, Paper / White / Night themes.
- Works offline once opened. No accounts, no tracking.

## Margin marks

`tools/build_marks.py` reads the marks from the text (they are encoded on the end-of-ayah glyphs) and writes them into `mushaf.json`. It checks every surah's ayah count and finds 558 ruku', 30 paras (each starting at the top of a page), 7 manzils and 14 sajdahs. The source text has no ثلثة mark for para 27.

## Install on iPhone / iPad

Open the site in Safari → Share → **Add to Home Screen**.

## Credits

- Text and 13-line Taj Company layout: [Quranic Universal Library](https://qul.tarteel.ai) (Tarteel).
- IndoPak Nastaleeq font: QuranWBW. Surah-name font: QUL.
