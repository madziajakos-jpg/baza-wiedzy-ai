# Renderuje icons/icon.svg do PNG (192, 512, maskable 512, apple 180) – wymaga playwright
import asyncio, pathlib
from playwright.async_api import async_playwright
D = pathlib.Path(__file__).resolve().parent.parent / 'icons'
svg = (D / 'icon.svg').read_text()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); pg = await b.new_page()
        for name, size, pad in [('icon-192.png', 192, 0), ('icon-512.png', 512, 0), ('apple-touch-icon.png', 180, 0), ('maskable-512.png', 512, 0.12)]:
            inner = int(size * (1 - 2 * pad))
            await pg.set_viewport_size({'width': size, 'height': size})
            await pg.set_content(f'<html><body style="margin:0;background:#160e0c;display:flex;align-items:center;justify-content:center;width:{size}px;height:{size}px">'
                                 f'<div style="width:{inner}px;height:{inner}px">{svg.replace("<svg ", f"<svg width=\"{inner}\" height=\"{inner}\" ",1)}</div></body></html>')
            await pg.screenshot(path=str(D / name), omit_background=False)
        await b.close()
asyncio.run(main())
