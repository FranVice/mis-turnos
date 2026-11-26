"""Prueba E2E de Mis Turnos para parejas contra un Supabase LOCAL (supabase start).

Nunca toca el proyecto remoto. Requiere:
  · Supabase local con las migraciones del repo + una migración de semilla con el
    espacio familiar, confirmación de correo activa y el hook before_user_created
    apuntando a private.hook_before_user_created.
  · La app web en BASE con EXPO_PUBLIC_SUPABASE_URL=SB_URL.
  · Variables: SB_URL, SB_ANON, SB_SERVICE, SB_DB_CONTAINER, MAILPIT (opcional), SHOTS.
"""
from playwright.sync_api import sync_playwright, expect
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.environ.get('BASE', 'http://localhost:8081')
SB = os.environ['SB_URL']; ANON = os.environ['SB_ANON']; SERVICE = os.environ['SB_SERVICE']
DB = os.environ['SB_DB_CONTAINER']; MAILPIT = os.environ.get('MAILPIT', 'http://127.0.0.1:54324')
SHOTS = os.environ.get('SHOTS', '.')
PW = 'contraseña-de-prueba-123'
FAM = '10000000-0000-0000-0000-000000000001'
PF, PA = '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'
MARK = {'signup_source': 'mis-turnos'}
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('✔ ' if cond else '✖ ') + name + (f' — {detail}' if detail and not cond else ''))

def http(method, path, body=None, token=None, key=ANON, headers=None):
    req = urllib.request.Request(SB + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('apikey', key); req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

def rpc(name, body, token): return http('POST', f'/rest/v1/rpc/{name}', body, token=token)

def sql(q):
    out = subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], capture_output=True, text=True, encoding='utf-8')
    if out.returncode: raise RuntimeError(out.stderr)
    return out.stdout.strip()

def admin_user(email):
    s, b = http('POST', '/auth/v1/admin/users', {'email': email, 'password': PW, 'email_confirm': True}, token=SERVICE, key=SERVICE)
    assert s in (200, 201), (s, b); return b['id']

def login_api(email):
    s, b = http('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': PW})
    assert s == 200, (email, s, b); return b['access_token']

def confirm_link(email):
    for _ in range(60):
        with urllib.request.urlopen(f'{MAILPIT}/api/v1/search?query=to:{email}') as r:
            msgs = json.loads(r.read().decode()).get('messages', [])
        if msgs:
            with urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{msgs[0]['ID']}") as r:
                body = json.loads(r.read().decode())
            m = re.search(r'href="([^"]+/auth/v1/verify[^"]+)"', body.get('HTML', ''))
            if m: return m.group(1).replace('&amp;', '&')
        time.sleep(0.5)
    raise RuntimeError('sin correo de confirmación para ' + email)

def signup_api(email, name):
    s, b = http('POST', '/auth/v1/signup', {'email': email, 'password': PW, 'data': {**MARK, 'display_name': name}})
    assert s == 200, (s, b); urllib.request.urlopen(confirm_link(email)).read()

def day(page, n): return page.get_by_role('button', name=re.compile(rf'^Día {n},'))
def label(page, n): return day(page, n).get_attribute('aria-label') or ''
def is_green(page, n): return 'día libre en común' in label(page, n)
def shift(token, cal, person, date, kind='libre'):
    allday = kind in ('libre', 'vacaciones')
    return http('POST', '/rest/v1/shifts', {'calendar_id': cal, 'person_id': person, 'shift_date': date, 'kind': kind,
                'start_time': '00:00' if allday else '06:00', 'end_time': '00:00' if allday else '14:00'},
                token=token, headers={'Prefer': 'return=representation'})

# ---------------------------------------------------------------- preparación: familia
F_ID = admin_user('franklin@nexo.test'); A_ID = admin_user('almudena@nexo.test')
sql(f"update people set user_id='{F_ID}' where id='{PF}'; update people set user_id='{A_ID}' where id='{PA}';"
    f"insert into private.admins(user_id) values ('{F_ID}') on conflict do nothing;")
TF, TA = login_api('franklin@nexo.test'), login_api('almudena@nexo.test')
for d in ('2026-11-27', '2026-11-28', '2026-11-29'): shift(TF, FAM, PF, d)
A27 = shift(TA, FAM, PA, '2026-11-27')[1][0]['id']
shift(TA, FAM, PA, '2026-11-28', 'manana')

with sync_playwright() as p:
    browser = p.webkit.launch()
    iphone = p.devices['iPhone 13']
    def new_page():
        ctx = browser.new_context(**iphone, locale='es-ES', timezone_id='Europe/Madrid'); return ctx, ctx.new_page()
    def sign_in(page, email):
        page.goto(BASE + '/turnos')
        page.get_by_placeholder('tu@correo.com').fill(email); page.get_by_placeholder('••••••••').fill(PW)
        page.get_by_role('button', name='Entrar', exact=True).click()
    def refresh(page):
        page.get_by_role('button', name='Actualizar').click(); page.wait_for_timeout(1200)

    # ================================================ familia
    fctx, fp = new_page(); sign_in(fp, 'franklin@nexo.test')
    expect(day(fp, 27)).to_be_visible(timeout=25000); fp.wait_for_timeout(800)
    check('familia: conserva todas las pestañas', fp.get_by_role('tab').count() >= 6)
    check('familia: los dos libres → verde', is_green(fp, 27))
    check('familia: solo uno libre → normal', not is_green(fp, 28))
    check('familia: falta un turno → normal', not is_green(fp, 29))
    check('familia: sin tarjeta «Invitar a mi pareja»', fp.get_by_role('button', name='Invitar a mi pareja').count() == 0)
    http('PATCH', f'/rest/v1/shifts?id=eq.{A27}', {'kind': 'tarde', 'start_time': '14:00', 'end_time': '22:00'}, token=TA); refresh(fp)
    check('familia: al editar a «Tarde» deja de ser verde', not is_green(fp, 27))
    http('PATCH', f'/rest/v1/shifts?id=eq.{A27}', {'kind': 'vacaciones', 'start_time': '00:00', 'end_time': '00:00'}, token=TA); refresh(fp)
    check('familia: «Vacaciones» no cuenta como libre', not is_green(fp, 27))
    http('DELETE', f'/rest/v1/shifts?id=eq.{A27}', token=TA); refresh(fp)
    check('familia: al borrar sigue normal', not is_green(fp, 27))
    shift(TA, FAM, PA, '2026-11-30'); refresh(fp)
    day(fp, 30).click(); fp.get_by_text('Añadir turno', exact=True).click()
    fp.get_by_text('Libre', exact=True).last.click(); fp.get_by_text('Guardar turno', exact=True).click()
    fp.wait_for_timeout(1500); fp.get_by_label('Cerrar').click(); fp.wait_for_timeout(500)
    check('familia: crear «Libre» desde la app → verde al momento', is_green(fp, 30))

    # ================================================ panel
    fp.get_by_role('button', name='Panel de Mis Turnos').click()
    expect(fp.get_by_role('button', name='Copiar enlace general')).to_be_visible(timeout=15000)
    check('panel: muestra el enlace general /unirse', fp.get_by_text(BASE + '/unirse').count() == 1)
    fp.once('dialog', lambda d: d.accept())   # confirmación nativa «Pausar»
    fp.get_by_role('button', name='Pausar').click()
    fp.wait_for_timeout(1500)
    paused = sql('select general_signup from private.settings') == 'f'
    s, b = http('POST', '/auth/v1/signup', {'email': 'pausa@nexo.test', 'password': PW, 'data': MARK})
    check('panel: pausar bloquea altas nuevas', paused and s >= 400, f'pausado={paused} {s}')
    fp.get_by_role('button', name='Reactivar').click(); fp.wait_for_timeout(1500)
    check('panel: reactivar', sql('select general_signup from private.settings') == 't')
    actx, ap = new_page(); sign_in(ap, 'almudena@nexo.test'); expect(day(ap, 27)).to_be_visible(timeout=25000)
    check('Almudena no ve el acceso al panel', ap.get_by_role('button', name='Panel de Mis Turnos').count() == 0)
    ap.goto(BASE + '/admin'); expect(ap.get_by_text('Esta página es solo para la cuenta administradora.')).to_be_visible(timeout=15000)
    check('Almudena: /admin por URL → denegado', True)
    check('Almudena: admin_overview por API → denegado', rpc('admin_overview', {}, TA)[0] >= 400)
    check('Almudena: pausar por API → denegado', rpc('admin_set_general_signup', {'p_enabled': False}, TA)[0] >= 400)
    s, _ = http('POST', '/auth/v1/signup', {'email': 'fuera@nexo.test', 'password': PW})
    check('hook: alta sin pasar por la app → rechazada', s >= 400, f'{s}')

    # ================================================ pareja 1: Ana por el enlace general (UI), Bruno con cuenta nueva por el privado (UI)
    nctx, np_ = new_page()
    np_.goto(BASE + '/unirse')
    np_.get_by_label('Tu nombre').fill('Ana'); np_.get_by_label('Correo').fill('ana@nexo.test'); np_.get_by_role('textbox', name='Contraseña', exact=True).fill(PW)
    np_.get_by_role('button', name='Crear cuenta').last.click()
    expect(np_.get_by_text(re.compile('Te hemos enviado un correo'))).to_be_visible(timeout=15000)
    np_.goto(confirm_link('ana@nexo.test')); np_.wait_for_url(re.compile(r'/turnos'), timeout=30000)
    expect(day(np_, 27)).to_be_visible(timeout=20000)
    check('Ana: enlace general → confirma → su propio calendario', sql("select count(*) from calendars c join people p on p.calendar_id=c.id join auth.users u on u.id=p.user_id where u.email='ana@nexo.test' and c.kind='shifts'") == '1')
    check('Ana: solo Mis Turnos (sin pestañas)', np_.get_by_role('tab').count() == 0)
    np_.goto(BASE + '/unirse'); np_.wait_for_url(re.compile(r'/turnos'), timeout=20000)
    check('Ana: volver a abrir el enlace general la lleva a su calendario (sin duplicar)', sql("select count(*) from calendars where created_by=(select id from auth.users where email='ana@nexo.test')") == '1')
    expect(np_.get_by_role('button', name='Invitar a mi pareja')).to_be_visible(timeout=15000)
    np_.get_by_role('button', name='Invitar a mi pareja').click()
    np_.get_by_label('Correo de tu pareja').fill('bruno@nexo.test')
    np_.get_by_role('button', name='Crear enlace de invitación').click()
    expect(np_.get_by_text('bruno@nexo.test')).to_be_visible(timeout=15000)
    m = re.search(r'/invitacion\?token=([0-9a-f-]{36})', np_.content())
    check('Ana: «Invitar a mi pareja» genera el enlace privado', bool(m))
    tok_bruno = m.group(1)
    np_.screenshot(path=os.path.join(SHOTS, 'iphone-invitar-pareja.png'))
    np_.get_by_label('Cerrar').click()

    bctx, bp = new_page()
    bp.goto(f'{BASE}/invitacion?token={tok_bruno}')
    expect(bp.get_by_text('Ana te invita a compartir su calendario de turnos.')).to_be_visible(timeout=15000)
    bp.get_by_label('Tu nombre').fill('Bruno'); bp.get_by_role('textbox', name='Contraseña', exact=True).fill(PW)
    bp.get_by_role('button', name='Crear cuenta').last.click()
    expect(bp.get_by_text(re.compile('Te hemos enviado un correo'))).to_be_visible(timeout=15000)
    bp.goto(confirm_link('bruno@nexo.test'))   # vuelve a /invitacion?token=… con sesión
    bp.wait_for_url(re.compile(r'/turnos'), timeout=30000); expect(day(bp, 27)).to_be_visible(timeout=20000)
    legend = bp.content()
    check('Bruno (cuenta nueva): el enlace se conserva y se une al calendario de Ana', 'Ana' in legend and 'Bruno (tú)' in legend)
    # Reintento con sesión: vuelve a abrir el enlace → botón «Unirme» → mismo resultado.
    bp.goto(f'{BASE}/invitacion?token={tok_bruno}')
    bp.get_by_role('button', name='Unirme al calendario de Ana').click(); bp.wait_for_url(re.compile(r'/turnos'), timeout=20000)
    check('Bruno: reintentar la aceptación no duplica', sql("select count(*) from people p join auth.users u on u.id=p.user_id where u.email='bruno@nexo.test'") == '1')
    np_.reload(); expect(day(np_, 27)).to_be_visible(timeout=20000); np_.wait_for_timeout(800)
    check('Ana: la tarjeta de invitar desaparece al completar la pareja', np_.get_by_role('button', name='Invitar a mi pareja').count() == 0)

    # ================================================ pareja 2: Carla por el MISMO enlace general; Dani con cuenta existente
    cctx, cp = new_page()
    cp.goto(BASE + '/unirse')
    cp.get_by_label('Tu nombre').fill('Carla'); cp.get_by_label('Correo').fill('carla@nexo.test'); cp.get_by_role('textbox', name='Contraseña', exact=True).fill(PW)
    cp.get_by_role('button', name='Crear cuenta').last.click()
    expect(cp.get_by_text(re.compile('Te hemos enviado un correo'))).to_be_visible(timeout=15000)
    cp.goto(confirm_link('carla@nexo.test')); cp.wait_for_url(re.compile(r'/turnos'), timeout=30000)
    expect(day(cp, 27)).to_be_visible(timeout=20000)
    cal_ana = sql("select calendar_id from people p join auth.users u on u.id=p.user_id where u.email='ana@nexo.test'")
    cal_car = sql("select calendar_id from people p join auth.users u on u.id=p.user_id where u.email='carla@nexo.test'")
    check('Carla: segundo calendario independiente desde el mismo enlace', cal_car and cal_car != cal_ana)
    check('Carla: no ve nada de Ana ni de la familia', not re.search(r'(Ana|Bruno|Franklin|Almudena)', cp.inner_text('body')), cp.inner_text('body')[:300])

    signup_api('dani@nexo.test', 'Dani')     # Dani ya tenía cuenta (y se creó su calendario vacío)
    TD = login_api('dani@nexo.test'); dani_own = rpc('start_mis_turnos', {}, TD)[1]
    TC = login_api('carla@nexo.test'); tok_dani = rpc('invite_partner', {'p_email': 'dani@nexo.test'}, TC)[1]
    dctx, dp = new_page()
    dp.goto(f'{BASE}/invitacion?token={tok_dani}')
    dp.get_by_text('Ya tengo cuenta', exact=True).first.click()
    dp.get_by_role('textbox', name='Contraseña', exact=True).fill(PW); dp.get_by_role('button', name='Entrar', exact=True).click()
    dp.wait_for_url(re.compile(r'/turnos'), timeout=30000); expect(day(dp, 27)).to_be_visible(timeout=20000)
    check('Dani (cuenta existente): se une al calendario de Carla', 'Carla' in dp.content() and 'Dani (tú)' in dp.content())
    check('Dani: su calendario vacío anterior se elimina', sql(f"select count(*) from calendars where id='{dani_own}'") == '0')

    # ================================================ máximo dos, turnos, verde y privacidad
    TAna, TB = login_api('ana@nexo.test'), login_api('bruno@nexo.test')
    s, b = rpc('invite_partner', {'p_email': 'tercero@nexo.test'}, TAna)
    check('máximo dos miembros por calendario', s >= 400 and 'dos miembros' in json.dumps(b, ensure_ascii=False), f'{s} {b}')
    p_ana = sql("select p.id from people p join auth.users u on u.id=p.user_id where u.email='ana@nexo.test'")
    p_bru = sql("select p.id from people p join auth.users u on u.id=p.user_id where u.email='bruno@nexo.test'")
    s1, b1 = shift(TAna, cal_ana, p_ana, '2026-11-27', 'manana'); s2, _ = shift(TB, cal_ana, p_bru, '2026-11-27')
    check('pareja 1: cada uno añade su turno', s1 == 201 and s2 == 201)
    s, b = http('PATCH', f"/rest/v1/shifts?id=eq.{b1[0]['id']}", {'kind': 'tarde'}, token=TB, headers={'Prefer': 'return=representation'})
    check('pareja 1: Bruno no puede editar el turno de Ana', s == 200 and b == [], f'{s} {b}')
    np_.reload(); expect(day(np_, 27)).to_be_visible(timeout=20000); np_.wait_for_timeout(800)
    check('pareja 1: Ana ve el turno de Bruno; uno trabaja → normal', 'Bruno: Libre' in label(np_, 27) and not is_green(np_, 27))
    s, _ = http('PATCH', f"/rest/v1/shifts?id=eq.{b1[0]['id']}", {'kind': 'libre', 'start_time': '00:00', 'end_time': '00:00'}, token=TAna)
    refresh(np_)
    check('pareja 1: Ana edita su turno a «Libre» → verde', s in (200, 204) and is_green(np_, 27))
    np_.screenshot(path=os.path.join(SHOTS, 'iphone-pareja-verde.png'))
    http('DELETE', f"/rest/v1/shifts?id=eq.{b1[0]['id']}", token=TAna); refresh(np_)
    check('pareja 1: Ana borra su turno → normal', not is_green(np_, 27))

    for path in ('/', '/tareas', '/agenda', '/economia', '/casa'):
        cp.goto(BASE + path); cp.wait_for_timeout(1500)
        check(f'Carla: {path} por URL → /turnos', cp.url.rstrip('/').endswith('/turnos'), cp.url)
    cp.goto(BASE + '/admin'); expect(cp.get_by_text('Esta página es solo para la cuenta administradora.')).to_be_visible(timeout=15000)
    check('Carla: /admin por URL → denegado', True)
    s, b = http('GET', f'/rest/v1/shifts?calendar_id=eq.{cal_ana}', token=TC); check('API: Carla no lee turnos de la pareja 1', s == 200 and b == [])
    s, b = http('GET', f'/rest/v1/shifts?calendar_id=eq.{FAM}', token=TC); check('API: Carla no lee turnos de la familia', s == 200 and b == [])
    s, b = http('GET', '/rest/v1/people', token=TC); check('API: Carla solo ve a su pareja', s == 200 and len(b) == 2 and all(r['calendar_id'] == cal_car for r in b), f'{b}')
    check('API: Carla no escribe en la pareja 1', shift(TC, cal_ana, p_ana, '2026-12-02')[0] >= 400)
    s, b = http('DELETE', f'/rest/v1/shifts?calendar_id=eq.{FAM}', token=TC, headers={'Prefer': 'return=representation'})
    check('API: Carla no borra turnos de la familia', s == 200 and b == [])
    check('API: Carla sin Tareas', http('POST', '/rest/v1/tasks', {'calendar_id': cal_car, 'title': 'x'}, token=TC)[0] >= 400)
    check('API: Carla sin Agenda', http('POST', '/rest/v1/events', {'calendar_id': cal_car, 'title': 'x', 'event_date': '2026-12-01'}, token=TC)[0] >= 400)
    check('API: invitaciones no accesibles', http('GET', '/rest/v1/invitations', token=TC)[0] >= 400)
    s, b = http('GET', f'/rest/v1/shifts?calendar_id=neq.{FAM}', token=TF); check('API: Franklin (admin) no ve turnos de parejas', s == 200 and b == [])
    check('API: Almudena conserva Tareas', http('GET', '/rest/v1/tasks', token=TA)[0] == 200)
    check('Bruno: no puede aceptar la invitación de otro correo', rpc('accept_invitation', {'p_token': tok_dani}, TB)[0] >= 400)

    # ================================================ panel: resumen
    fp.reload(); expect(fp.get_by_role('button', name='Copiar enlace general')).to_be_visible(timeout=15000); fp.wait_for_timeout(800)
    txt = fp.inner_text('body')
    check('panel: 2 parejas completas', fp.get_by_text('Pareja completa', exact=True).count() == 2, txt[-300:])
    check('panel: sin correos visibles', '@' not in txt)
    fp.screenshot(path=os.path.join(SHOTS, 'iphone-panel.png'), full_page=True)
    browser.close()

ok = sum(1 for _, r in results if r)
print(f'\n{ok}/{len(results)} comprobaciones correctas')
sys.exit(0 if ok == len(results) else 1)
