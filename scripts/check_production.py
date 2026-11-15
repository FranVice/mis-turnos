from playwright.sync_api import sync_playwright, expect
import sys
sys.stdout.reconfigure(encoding='utf-8')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':393,'height':852},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:8090')
    expect(page.get_by_role('button',name='Entrar',exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_label('Correo',exact=True)).to_be_visible()
    manifest=page.request.get('http://127.0.0.1:8090/manifest.webmanifest')
    assert manifest.ok
    assert manifest.json()['display']=='standalone'
    for asset in ('icon-192.png','icon-512.png','apple-touch-icon.png','favicon.ico'):
        assert page.request.get('http://127.0.0.1:8090/'+asset).ok
    page.get_by_role('button',name='Entrar',exact=True).click()
    expect(page.get_by_text('Escribe tu correo y tu contraseña.',exact=True)).to_be_visible()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert not errors, errors
    print('OK: exportación de producción, formulario, validación, manifest e iconos.')
    browser.close()
