# Baza wiedzy AI (v1)

Prywatna/publiczna PWA z notatkami Magdy z kursów AI. Statyczna strona – działa na GitHub Pages, instaluje się na telefonie i **działa offline**.

- **Szukaj** – wyszukiwanie po znaczeniu (semantyczne) w 100% w przeglądarce, bez płatnego API: model `Xenova/multilingual-e5-small` (int8, transformers.js + onnxruntime-wasm) liczy wektor pytania w telefonie; wektory notatek są policzone wcześniej. Wynik = cosinus + lekki BM25 (hybryda). Linki z `links.json` też są przeszukiwane.
  - „Otwórz” – pełny tekst fragmentu (z podświetleniem słów z pytania), „Oryginał” – plik na Dysku / link.
  - Przytrzymaj kartę → Czytaj + (wkrótce) Instrukcja, Lekcja, Prezentacja, Fiszki/test; „Zaznacz kilka” → (wkrótce) „Połącz w instrukcję”.
- **Pomysły** – szybkie dodawanie, suwak postępu %, pasek, usuwanie z potwierdzeniem, ukończone → sekcja „Ukończone” z pucharem, konfetti i fanfarą. Zapis: `localStorage`.
- **Odznaki** – 8 certyfikatów w ramkach, podgląd po dotknięciu, dodawanie własnych (zdjęcie + tytuł) – zapis w IndexedDB na telefonie.

## Struktura

```
index.html, manifest.webmanifest, sw.js      – aplikacja + PWA
css/base.css (style z makiety), css/app.css   – wygląd
js/app.js (UI wyszukiwarki, czytnik, routing), js/search.js, js/search-core.js (BM25 + cosinus),
js/embed-worker.js (model w Web Workerze), js/ideas.js, js/badges.js, js/ui.js
data/docs.json, data/emb.bin, data/meta.json  – baza (generowana)
models/Xenova/multilingual-e5-small/          – model (onnx pocięty na 3 części <50 MB – limit GitHuba to 100 MB/plik)
vendor/                                       – transformers.js + onnxruntime wasm (hostowane lokalnie, bez CDN)
fonts/ (woff2, przycięte do łac.+PL), img/certs/ (webp), icons/
tools/                                        – skrypty budowania i testów (nie są potrzebne na telefonie)
```

## Przebudowa bazy (po dodaniu nowych materiałów)

1. Zaktualizuj `../kb/chunks.json` i `../kb/links.json` (skrypty w `/workspace/ai-baza/scripts`).
2. Zbuduj dane:
   ```bash
   cd tools && npm install          # raz
   node build-data.mjs              # bez fragmentów sensitive=true (domyślnie)
   node build-data.mjs --include-sensitive   # gdy zapadnie decyzja, żeby je dołączyć
   node build-data.mjs --kb /inna/sciezka/kb # inny katalog z chunks.json/links.json
   ```
   Skrypt: pobiera model raz (do `tools/.cache-models/`), liczy wektory `passage: …` tym samym modelem co przeglądarka (`query: …`), zapisuje `data/emb.bin` (int8 + skala na wektor), `data/docs.json`, `data/meta.json`, kopiuje model (pocięty) i runtime do `vendor/` oraz podbija wersję w `sw.js`, żeby telefony pobrały nową bazę.
3. (Opcjonalnie) sprawdź jakość: `node tools/eval.mjs "jak pisać dobre prompty" "halucynacje"`.
4. Test w przeglądarce: `python3 -m http.server 8765` w katalogu `app/`, potem `python3 tools/test_app.py` → `TEST.md` + `screens/`.

Ikony: edytuj `icons/icon.svg`, potem `python3 tools/make-icons.py`.

## Publikacja na GitHub Pages

- Repozytorium: <https://github.com/madziajakos-jpg/baza-wiedzy-ai> (publiczne, gałąź `main`, korzeń strony).
- Aplikacja: <https://madziajakos-jpg.github.io/baza-wiedzy-ai/>
- Wszystkie ścieżki są względne, więc podkatalog na GitHub Pages działa.
- Na telefonie: otwórz adres → „Dodaj do ekranu głównego” / „Zainstaluj”. Pierwsze uruchomienie pobiera ok. 135 MB (model + silnik), potem wszystko jest w pamięci telefonu i działa bez internetu.

Uwaga: repozytorium publiczne = notatki publiczne (Magda się zgodziła). Fragmenty oznaczone `sensitive=true` są domyślnie pomijane.

## Ograniczenia v1

- Pierwsze pobranie ~113 MB modelu + 21 MB silnika wasm (jednorazowo; wyszukiwanie po słowach działa od razu, zanim model się wczyta).
- Bez `crossOriginIsolated` (GitHub Pages nie ustawia COOP/COEP) model działa na 1 wątku – zapytanie trwa zwykle 20–150 ms, start modelu z pamięci 1–4 s.
- Pomysły i własne odznaki są tylko na tym urządzeniu (localStorage/IndexedDB) – brak synchronizacji.
- Generowanie (lekcje, instrukcje, fiszki) – etap 2 (proxy z kluczem OpenAI, np. Cloudflare Worker).
