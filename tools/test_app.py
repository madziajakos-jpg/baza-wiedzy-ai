# Test w headless Chrome (390 px): jakość wyszukiwania, offline, zrzuty ekranów.
# Użycie: python3 -m http.server 8765 (w app/) ; python3 tools/test_app.py
import json, time, pathlib, datetime
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:8765/'
SCREENS = APP / 'screens'; SCREENS.mkdir(exist_ok=True)
QUERIES = ['jak pisać dobre prompty', 'czym są agenci', 'halucynacje', 'streamlit', 'deep research',
           'jak uniknąć zmyślania przez model', 'notebooklm', 'jak wytresować smoka LLM']
log = []

def shot(page, name, full=False):
    page.wait_for_timeout(450)
    page.screenshot(path=str(SCREENS / name), full_page=full)
    log.append(f'screens/{name}')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-dev-shm-usage'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=False, locale='pl-PL')
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error',) else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    t0 = time.time()
    page.goto(URL)
    page.wait_for_selector('.welcome', timeout=30000)
    # stan ładowania modelu (pierwsze uruchomienie)
    try:
        page.wait_for_selector('#modelStatus:not([hidden])', timeout=8000)
        page.wait_for_timeout(600)
        shot(page, '00-ladowanie-modelu.png')
    except Exception:
        pass
    page.wait_for_function('window.__baza && window.__baza.state.ready', timeout=300000)
    model_secs = time.time() - t0
    page.wait_for_timeout(500)
    shot(page, '01-start.png')

    # --- jakość wyszukiwania (ten sam moduł co UI) ---
    results = {}
    for q in QUERIES:
        r = page.evaluate("""async (q) => { const m = await import('./js/search.js'); const t = performance.now();
            const out = await m.search(q); const ms = performance.now() - t;
            return { ms, semantic: out.semantic, n: out.results.length, top: out.results.slice(0, 3).map(x => ({ title: x.doc.title, src: x.doc.src, type: x.doc.type, score: x.score, cos: x.cos, bm: x.bm })) }; }""", q)
        results[q] = r

    # --- ekrany wyszukiwania ---
    page.fill('#q', 'jak pisać dobre prompty'); page.press('#q', 'Enter')
    page.wait_for_selector('.card'); shot(page, '02-wyniki-prompty.png')
    page.click('.card .btn.primary'); page.wait_for_selector('#reader:not([hidden])'); shot(page, '03-czytaj.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    card = page.locator('.card').first.locator('h2'); bx = card.bounding_box()
    page.mouse.move(bx['x'] + 20, bx['y'] + 5); page.mouse.down(); page.wait_for_timeout(700); page.mouse.up()
    page.wait_for_selector('#sheet:not([hidden])'); shot(page, '04-dlugie-przytrzymanie.png')
    page.click('[data-s=select]'); page.wait_for_timeout(300)
    page.locator('.card').nth(1).locator('h2').click(); page.locator('.card').nth(2).locator('h2').click()
    shot(page, '05-zaznacz-kilka.png')
    page.click('#sbCancel')
    page.fill('#q', 'jak wytresować smoka LLM'); page.press('#q', 'Enter')
    page.wait_for_selector('.empty'); shot(page, '06-brak-wynikow.png')
    page.fill('#q', 'streamlit'); page.press('#q', 'Enter'); page.wait_for_selector('.card'); shot(page, '07-wyniki-streamlit.png')

    # --- pomysły ---
    page.goto(URL + '#pomysly'); page.wait_for_selector('#ideaInput')
    for t in ['Zrobić quiz o halucynacjach', 'Przepisać ściągę o Streamlit do zeszytu', 'Fiszki: agenci i workflow']:
        page.fill('#ideaInput', t); page.press('#ideaInput', 'Enter'); page.wait_for_timeout(150)
    sl = page.locator('.idea .slider')
    sl.nth(0).fill('35'); sl.nth(0).dispatch_event('change')
    sl.nth(1).fill('70'); sl.nth(1).dispatch_event('change')
    page.wait_for_timeout(300); shot(page, '08-pomysly.png')
    sl.nth(2).fill('100'); sl.nth(2).dispatch_event('change'); page.wait_for_timeout(350)
    page.screenshot(path=str(SCREENS / '09-fanfary.png')); log.append('screens/09-fanfary.png')
    page.wait_for_timeout(1500); shot(page, '10-ukonczone.png')
    page.locator('.idea:not(.done) [data-del]').first.click(); page.wait_for_selector('#confirm:not([hidden])')
    shot(page, '11-usun-potwierdz.png'); page.click('#confirmNo')

    # --- odznaki ---
    page.goto(URL + '#odznaki'); page.wait_for_selector('.badge-item img')
    page.wait_for_timeout(800); shot(page, '12-odznaki.png'); shot(page, '12b-odznaki-cala.png', full=True)
    page.locator('.cert-item').nth(1).click(); page.wait_for_selector('#lightbox:not([hidden])'); shot(page, '13-podglad-certyfikatu.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    page.click('#addBadgeBtn'); page.wait_for_selector('#addBadge:not([hidden])')
    page.set_input_files('#badgeFile', str(APP / 'icons/icon-512.png')); page.fill('#badgeTitle', 'Testowa odznaka'); page.fill('#badgeIssuer', 'Grok Bot')
    shot(page, '14-dodaj-odznake.png')
    page.click('#addBadgeForm button[type=submit]'); page.wait_for_timeout(1500)
    added = page.locator('.cert-item[data-id^=u]').count()
    shot(page, '15-nowa-odznaka.png', full=True)

    # --- offline ---
    page.goto(URL); page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=60000)
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('.welcome', timeout=30000)
    page.wait_for_function('window.__baza && window.__baza.state.ready', timeout=120000)
    off = page.evaluate("""async () => { const m = await import('./js/search.js'); const o = await m.search('halucynacje'); return { n: o.results.length, semantic: o.semantic, top: o.results[0]?.doc.title }; }""")
    persisted = page.evaluate("JSON.parse(localStorage.getItem('baza.pomysly.v1')||'[]').length")
    page.fill('#q', 'halucynacje'); page.press('#q', 'Enter'); page.wait_for_selector('.card'); shot(page, '16-offline-wyniki.png')
    ctx.set_offline(False)
    b.close()

# ---- TEST.md ----
now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
L = [f'# TEST – Baza wiedzy AI v1', '', f'Uruchomiono: {now} (Europe/Warsaw), headless Chrome, viewport 390×844, DPR 2.', '',
     f'- Model gotowy po pierwszym ładowaniu (lokalny serwer): **{model_secs:.1f} s**',
     f'- Offline (sieć wyłączona, przeładowanie): wyszukiwanie {"**działa**" if off["n"] else "**NIE działa**"} – semantyczne: {off["semantic"]}, {off["n"]} wyników dla „halucynacje”, top: {off["top"]}',
     f'- Pomysły po przeładowaniu offline (localStorage): {persisted}', f'- Dodana odznaka widoczna w galerii (IndexedDB): {"tak" if added else "nie"}',
     f'- Błędy w konsoli: {len(errors)}', '']
for e in errors[:15]: L.append(f'  - `{e[:200]}`')
L += ['', '## Wyniki wyszukiwania (top 3)', '', 'score = cos + 0.03·BM25(norm) + 0.02·pokrycie słów; wynik zostaje, gdy pokrycie słów ≥ 50% albo cos ≥ 0.866. „n” = liczba wyników po filtrze trafności.', '']
for q, r in results.items():
    L.append(f'### „{q}” — n={r["n"]}, semantyczne={r["semantic"]}, {r["ms"]:.0f} ms')
    if not r['top']: L.append('- (brak wyników → ekran „pusto”)')
    for i, t in enumerate(r['top'], 1):
        L.append(f'{i}. **{t["title"]}** — _{t["type"]}_, {t["src"]} (score {t["score"]:.3f}, cos {t["cos"]:.3f}, bm {t["bm"]:.2f})')
    L.append('')
L += ['## Zrzuty ekranu', ''] + [f'- {s}' for s in log]
(APP / 'TEST.md').write_text('\n'.join(L) + '\n')
print('\n'.join(L))
