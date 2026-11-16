# Test etapu 2 (generowanie) w headless Chrome.
# Użycie: python3 tools/test_gen.py [URL] [API_URL|-] [rodzaje po przecinku]
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright
APP = pathlib.Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
API = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
KINDS = (sys.argv[3] if len(sys.argv) > 3 else 'fiszki,test,lekcja,prezentacja,merge').split(',')
PREFIX = sys.argv[4] if len(sys.argv) > 4 else 'g'
SC = APP / 'screens'; SC.mkdir(exist_ok=True)
out = []
def shot(page, name, full=False):
    page.wait_for_timeout(500); page.screenshot(path=str(SC / f'{PREFIX}-{name}.png'), full_page=full); out.append(f'screens/{PREFIX}-{name}.png')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-dev-shm-usage'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='pl-PL', accept_downloads=True)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(URL); page.wait_for_selector('.welcome', timeout=60000)
    if API: page.evaluate(f"localStorage.setItem('baza-api', {json.dumps(API)})")
    page.goto(URL + '?q=checklista dobrego promptu'); page.wait_for_selector('#results .card', timeout=60000)
    page.wait_for_timeout(800)

    def longpress(i=0):
        c = page.locator('#results .card h2').nth(i); bb = c.bounding_box()
        page.mouse.move(bb['x'] + 20, bb['y'] + 8); page.mouse.down(); page.wait_for_timeout(700); page.mouse.up()
        page.wait_for_selector('#sheet:not([hidden])')

    def gen(kind):
        longpress(0); page.click(f'#sheet [data-g="{kind}"]')
        page.wait_for_selector('#genLoading:not([hidden])', timeout=5000)
        t = time.time(); page.wait_for_timeout(1200)
        if kind == 'fiszki': shot(page, 'ladowanie')
        page.wait_for_selector('#genView:not([hidden]), #genError:not([hidden])', timeout=120000)
        if not page.locator('#genError').is_hidden():
            raise SystemExit('ERROR dialog: ' + page.inner_text('#genError'))
        out.append(f'{kind}: {time.time()-t:.1f}s')

    def save_close():
        page.click('#genSave'); page.wait_for_timeout(300); page.click('#genView [data-close]'); page.wait_for_timeout(500)

    for k in KINDS:
        if k == 'fiszki':
            gen('fiszki'); shot(page, 'fiszki')
            cards = page.locator('.m-card'); cards.nth(0).click(); page.wait_for_timeout(700); shot(page, 'fiszki-odwrocona'); save_close()
        elif k == 'test':
            gen('test'); shot(page, 'test')
            n = page.locator('.m-tq').count()
            for i in range(n):
                q = page.locator('.m-tq').nth(i); corr = int(q.get_attribute('data-correct'))
                q.locator('.m-opt').nth(corr if i else (corr + 1) % q.locator('.m-opt').count()).click(); page.wait_for_timeout(150)
            page.wait_for_timeout(700); shot(page, 'test-wynik')
            out.append('score: ' + page.inner_text('[data-score]').replace('\n', ' ')); save_close()
        elif k == 'lekcja':
            gen('lekcja'); page.locator('[data-reveal]').first.click(); shot(page, 'lekcja'); save_close()
        elif k == 'prezentacja':
            gen('prezentacja'); shot(page, 'prezentacja'); page.click('[data-next]'); page.wait_for_timeout(700); shot(page, 'prezentacja-slajd2'); save_close()
        elif k == 'instrukcja':
            gen('instrukcja'); shot(page, 'instrukcja'); save_close()
        elif k == 'merge':
            longpress(0); page.click('#sheet [data-s="select"]'); page.wait_for_timeout(400)
            page.locator('#results .card').nth(1).click(); page.wait_for_timeout(200)
            shot(page, 'zaznaczone'); page.click('#sbMerge')
            t = time.time(); page.wait_for_selector('#genView:not([hidden]), #genError:not([hidden])', timeout=120000)
            if not page.locator('#genError').is_hidden(): raise SystemExit('ERROR: ' + page.inner_text('#genError'))
            out.append(f'merge: {time.time()-t:.1f}s; kicker=' + page.inner_text('#genKicker')); shot(page, 'polaczona-instrukcja'); save_close()

    page.goto(URL + '#materialy'); page.wait_for_selector('#materials .page-title'); page.wait_for_timeout(1500); shot(page, 'moje-materialy')
    out.append('materials: %d' % page.locator('#materials .mat-card').count())
    if page.locator('#materials .mat-card').count():
        with page.expect_download() as dl:
            page.locator('#materials [data-m="dl"]').first.click()
        d = dl.value; path = SC / f'{PREFIX}-pobrany.html'; d.save_as(str(path)); out.append(f'download: {d.suggested_filename} {path.stat().st_size} B')
        page.wait_for_selector('#confirm:not([hidden])'); shot(page, 'po-pobraniu'); page.click('#confirmNo')
        # otwórz pobrany plik offline
        p2 = ctx.new_page(); ctx.set_offline(True); p2.goto(path.as_uri()); p2.wait_for_timeout(800); p2.screenshot(path=str(SC / f'{PREFIX}-pobrany-plik.png'), full_page=False); out.append(f'screens/{PREFIX}-pobrany-plik.png'); p2.close()
        # offline: przyjazny komunikat
        page.goto(URL + '?q=checklista dobrego promptu') if False else None
        page.evaluate("location.hash='#szukaj'"); page.wait_for_timeout(500)
        page.fill('#q', 'checklista dobrego promptu'); page.wait_for_selector('#results .card'); page.wait_for_timeout(500)
        longpress(0); page.click('#sheet [data-g="fiszki"]'); page.wait_for_selector('#genError:not([hidden])', timeout=5000); shot(page, 'offline-komunikat')
        ctx.set_offline(False)
    out.append('errors: ' + json.dumps(errs[:8], ensure_ascii=False))
    b.close()
print('\n'.join(out))
