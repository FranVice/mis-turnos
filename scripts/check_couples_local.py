"""Prueba E2E de espacios de pareja contra un Supabase LOCAL (supabase start).

Nunca toca el proyecto remoto. Requiere:
  · Supabase local con las migraciones del repo, confirmación de correo activa
    y el hook before_user_created apuntando a private.hook_before_user_created.
  · La app web en BASE con EXPO_PUBLIC_SUPABASE_URL=LOCAL_URL.
  · Variables: SB_URL, SB_ANON, SB_SERVICE, SB_DB_CONTAINER, MAILPIT (opcional).
"""
from playwright.sync_api import sync_playwright, expect
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')

BASE = os.environ.get('BASE', 'http://localhost:8081')
SB = os.environ['SB_URL']
ANON = os.environ['SB_ANON']
SERVICE = os.environ['SB_SERVICE']
DB = os.environ['SB_DB_CONTAINER']
MAILPIT = os.environ.get('MAILPIT', 'http://127.0.0.1:54324')
SHOTS = os.environ.get('SHOTS', '.')
PW = 'contraseña-de-prueba-123'
FAM = '10000000-0000-0000-0000-000000000001'
PF, PA = '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('✔ ' if cond else '✖ ') + name + (f' — {detail}' if detail and not cond else ''))

def http(method, path, body=None, token=None, key=ANON, headers=None):
    req = urllib.request.Request(SB + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('apikey', key)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

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
    for _ in range(40):
        with urllib.request.urlopen(f'{MAILPIT}/api/v1/search?query=to:{email}') as r:
            msgs = json.loads(r.read().decode()).get('messages', [])
        if msgs:
            with urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{msgs[0]['ID']}") as r:
                body = json.loads(r.read().decode())
            m = re.search(r'href="([^"]+/auth/v1/verify[^"]+)"', body.get('HTML', ''))
            if m: return m.group(1).replace('&amp;', '&')
        time.sleep(0.5)
    raise RuntimeError('sin correo de confirmación para ' + email)

def day(page, n):
    return page.get_by_role('button', name=re.compile(rf'^Día {n},'))

def is_green(page, n):
    return 'día libre en común' in (day(page, n).get_attribute('aria-label') or '')

# ---------------------------------------------------------------- preparación
F_ID = admin_user('franklin@nexo.test'); A_ID = admin_user('almudena@nexo.test')
sql(f"update people set user_id='{F_ID}' where id='{PF}'; update people set user_id='{A_ID}' where id='{PA}';"
    f"insert into private.admins(user_id) values ('{F_ID}') on conflict do nothing;")
TF, TA = login_api('franklin@nexo.test'), login_api('almudena@nexo.test')
def shift(token, person, date, kind='libre', cal=FAM):
    return http('POST', '/rest/v1/shifts', {'calendar_id': cal, 'person_id': person, 'shift_date': date, 'kind': kind,
                'start_time': '00:00' if kind == 'libre' else '06:00', 'end_time': '00:00' if kind == 'libre' else '14:00'},
                token=token, headers={'Prefer': 'return=representation'})
# 27: los dos libres · 28: solo Franklin libre (Almudena mañana) · 29: Franklin libre, Almudena sin turno
for d in ('2026-11-27', '2026-11-28', '2026-11-29'): shift(TF, PF, d)
s, b = shift(TA, PA, '2026-11-27'); A27 = b[0]['id']
shift(TA, PA, '2026-11-28', 'manana')

with sync_playwright() as p:
    browser = p.webkit.launch()
    iphone = p.devices['iPhone 13']

    def new_page():
        ctx = browser.new_context(**iphone, locale='es-ES', timezone_id='Europe/Madrid')
        return ctx, ctx.new_page()

    def sign_in(page, email):
        page.goto(BASE + '/turnos')
        page.get_by_placeholder('tu@correo.com').fill(email)
        page.get_by_placeholder('••••••••').fill(PW)
        page.get_by_role('button', name='Entrar', exact=True).click()

    # ------------------------------------------------ familia: fondo verde
    fctx, fp = new_page()
    sign_in(fp, 'franklin@nexo.test')
    expect(day(fp, 27)).to_be_visible(timeout=20000)
    fp.wait_for_timeout(800)
    check('familia: los dos libres → verde (27)', is_green(fp, 27))
    check('familia: solo uno libre → fondo normal (28)', not is_green(fp, 28))
    check('familia: falta un turno → fondo normal (29)', not is_green(fp, 29))
    fp.screenshot(path=os.path.join(SHOTS, 'iphone-familia-verde.png'))
    tabs = fp.get_by_role('tab')
    check('familia: conserva todas las pestañas', tabs.count() >= 6, f'{tabs.count()} pestañas')

    # Editar y borrar (desde el otro móvil) → la celda se actualiza.
    http('PATCH', f'/rest/v1/shifts?id=eq.{A27}', {'kind': 'tarde', 'start_time': '14:00', 'end_time': '22:00'}, token=TA)
    fp.get_by_role('button', name='Actualizar').click(); fp.wait_for_timeout(1200)
    check('al editar un turno a «Tarde» deja de estar verde', not is_green(fp, 27))
    http('PATCH', f'/rest/v1/shifts?id=eq.{A27}', {'kind': 'libre', 'start_time': '00:00', 'end_time': '00:00'}, token=TA)
    fp.get_by_role('button', name='Actualizar').click(); fp.wait_for_timeout(1200)
    check('al volver a «Libre» se pinta verde otra vez', is_green(fp, 27))
    http('DELETE', f'/rest/v1/shifts?id=eq.{A27}', token=TA)
    fp.get_by_role('button', name='Actualizar').click(); fp.wait_for_timeout(1200)
    check('al borrar un turno deja de estar verde', not is_green(fp, 27))

    # Crear desde la interfaz (Franklin en el 30, Almudena ya libre el 30 por API).
    shift(TA, PA, '2026-11-30')
    fp.get_by_role('button', name='Actualizar').click(); fp.wait_for_timeout(800)
    check('el 30 aún no es verde (solo Almudena)', not is_green(fp, 30))
    day(fp, 30).click()
    fp.get_by_text('Añadir turno', exact=True).click()
    fp.get_by_text('Libre', exact=True).last.click()
    fp.get_by_text('Guardar turno', exact=True).click()
    fp.wait_for_timeout(1500)
    fp.get_by_label('Cerrar').click(); fp.wait_for_timeout(500)
    check('al crear el turno desde la app se pinta verde al momento (30)', is_green(fp, 30))

    # ------------------------------------------------ panel de administración
    fp.get_by_role('button', name='Panel de parejas').click()
    expect(fp.get_by_text('Nueva pareja')).to_be_visible(timeout=10000)
    def create_couple(space, n1, e1, n2, e2):
        fp.get_by_label('Nombre del espacio (opcional)').fill(space)
        fp.get_by_label('Nombre 1').fill(n1); fp.get_by_label('Correo 1').fill(e1)
        fp.get_by_label('Nombre 2').fill(n2); fp.get_by_label('Correo 2').fill(e2)
        fp.get_by_role('button', name='Crear pareja e invitaciones').click()
        expect(fp.get_by_text(space, exact=True)).to_be_visible(timeout=10000)
    create_couple('Ana y Bruno', 'Ana', 'ana@nexo.test', 'Bruno', 'bruno@nexo.test')
    create_couple('Carla y Dani', 'Carla', 'carla@nexo.test', 'Dani', 'dani@nexo.test')
    check('panel: 4 invitaciones pendientes', fp.get_by_text('Pendiente', exact=True).count() == 4)
    fp.screenshot(path=os.path.join(SHOTS, 'iphone-panel.png'), full_page=True)
    links = {m.group(2): m.group(1) for m in re.finditer(r'(/invitacion\?token=([0-9a-f-]{36}))', fp.content())}
    tokens = sql("select email||'='||token from invitations order by email").split('\n')
    link = {t.split('=')[0]: BASE + '/invitacion?token=' + t.split('=')[1] for t in tokens}
    check('panel: muestra los enlaces de invitación', len(links) == 4)

    # Almudena no puede abrir el panel (ni por URL ni por API).
    actx, ap = new_page(); sign_in(ap, 'almudena@nexo.test'); expect(day(ap, 27)).to_be_visible(timeout=20000)
    check('Almudena no ve el botón del panel', ap.get_by_role('button', name='Panel de parejas').count() == 0)
    ap.goto(BASE + '/admin')
    expect(ap.get_by_text('Esta página es solo para la cuenta administradora.')).to_be_visible(timeout=10000)
    check('Almudena: /admin por URL → denegado', True)
    s, b = http('POST', '/rest/v1/rpc/admin_list_invitations', {}, token=TA)
    check('Almudena: admin_list_invitations por API → denegado', s >= 400, f'{s} {b}')
    s, b = http('POST', '/rest/v1/rpc/admin_create_couple', {'p_space_name': 'x', 'p_name1': 'x', 'p_email1': 'x@nexo.test', 'p_name2': 'y', 'p_email2': 'y@nexo.test'}, token=TA)
    check('Almudena: admin_create_couple por API → denegado', s >= 400, f'{s} {b}')

    # ------------------------------------------------ registro bloqueado sin invitación
    s, b = http('POST', '/auth/v1/signup', {'email': 'intruso@nexo.test', 'password': PW})
    check('registro sin invitación rechazado por el hook', s >= 400, f'{s} {b}')

    # ------------------------------------------------ Ana: cuenta nueva por correo desde la invitación
    nctx, np_ = new_page()
    np_.goto(link['ana@nexo.test'])
    expect(np_.get_by_text('ana@nexo.test')).to_be_visible(timeout=15000)
    np_.get_by_label('Contraseña').fill(PW)
    np_.get_by_role('button', name='Crear cuenta').click()
    expect(np_.get_by_text(re.compile('Te hemos enviado un correo'))).to_be_visible(timeout=15000)
    np_.goto(confirm_link('ana@nexo.test'))
    np_.wait_for_url(re.compile(r'/turnos'), timeout=25000)
    expect(day(np_, 27)).to_be_visible(timeout=15000)
    check('Ana: confirmar correo → vuelve, acepta y entra en Mis Turnos', True)
    check('Ana: sin barra de pestañas (solo Mis Turnos)', np_.get_by_role('tab').count() == 0)
    check('Ana: no ve turnos de la familia', not any(day(np_, n).get_attribute('aria-label').find('Franklin') >= 0 for n in (27, 28, 29, 30)))
    for path in ('/', '/tareas', '/agenda', '/economia', '/casa'):
        np_.goto(BASE + path); np_.wait_for_timeout(1500)
        check(f'Ana: {path} por URL → redirige a /turnos', np_.url.rstrip('/').endswith('/turnos'), np_.url)
    np_.goto(BASE + '/admin')
    expect(np_.get_by_text('Esta página es solo para la cuenta administradora.')).to_be_visible(timeout=10000)
    check('Ana: /admin por URL → denegado', True)
    np_.screenshot(path=os.path.join(SHOTS, 'iphone-invitada-admin-denegado.png'))

    # ------------------------------------------------ Bruno: cuenta que YA existe, entra desde el enlace
    s, b = http('POST', '/auth/v1/signup', {'email': 'bruno@nexo.test', 'password': PW})   # invitado → el hook lo permite
    urllib.request.urlopen(confirm_link('bruno@nexo.test')).read()
    bctx, bp = new_page()
    bp.goto(link['bruno@nexo.test'])
    bp.get_by_label('Contraseña').fill(PW)
    bp.get_by_role('button', name='Ya tengo cuenta: entrar').click()
    bp.wait_for_url(re.compile(r'/turnos'), timeout=25000)
    check('Bruno: cuenta existente reutilizada y vinculada', True)
    TB, TAna = login_api('bruno@nexo.test'), login_api('ana@nexo.test')
    tok = link['bruno@nexo.test'].split('token=')[1]
    s, b = http('POST', '/rest/v1/rpc/accept_invitation', {'p_token': tok}, token=TB)
    check('Bruno: repetir la aceptación no duplica', s == 200 and sql(f"select count(*) from people p join auth.users u on u.id=p.user_id where u.email='bruno@nexo.test'") == '1', f'{s} {b}')
    s, b = http('POST', '/rest/v1/rpc/accept_invitation', {'p_token': link['carla@nexo.test'].split('token=')[1]}, token=TB)
    check('Bruno: no puede aceptar la invitación de otro correo', s >= 400, f'{s}')

    # Gestión de turnos en la pareja 1 + verde para cualquier pareja.
    cal1 = sql("select id from calendars where name='Ana y Bruno'")
    pana = sql(f"select id from people where calendar_id='{cal1}' and display_name='Ana'")
    pbru = sql(f"select id from people where calendar_id='{cal1}' and display_name='Bruno'")
    s1, b1 = shift(TAna, pana, '2026-11-27', cal=cal1); s2, _ = shift(TB, pbru, '2026-11-27', cal=cal1)
    check('pareja 1: cada uno añade su turno', s1 == 201 and s2 == 201)
    s, _ = http('PATCH', f"/rest/v1/shifts?id=eq.{b1[0]['id']}", {'kind': 'manana', 'start_time': '06:00', 'end_time': '14:00'}, token=TAna, headers={'Prefer': 'return=representation'})
    check('pareja 1: edita su turno', s == 200)
    http('PATCH', f"/rest/v1/shifts?id=eq.{b1[0]['id']}", {'kind': 'libre', 'start_time': '00:00', 'end_time': '00:00'}, token=TAna)
    np_.goto(BASE + '/turnos'); expect(day(np_, 27)).to_be_visible(timeout=15000); np_.wait_for_timeout(800)
    check('pareja 1: los dos libres → verde', is_green(np_, 27))
    np_.screenshot(path=os.path.join(SHOTS, 'iphone-pareja-verde.png'))

    # ------------------------------------------------ Carla (pareja 2) y aislamiento por API
    s, b = http('POST', '/auth/v1/signup', {'email': 'carla@nexo.test', 'password': PW}); urllib.request.urlopen(confirm_link('carla@nexo.test')).read()
    TC = login_api('carla@nexo.test')
    s, b = http('POST', '/rest/v1/rpc/accept_invitation', {'p_token': link['carla@nexo.test'].split('token=')[1]}, token=TC)
    check('Carla: acepta por API', s == 200, f'{s} {b}')
    cal2 = b
    s, b = http('GET', f'/rest/v1/shifts?calendar_id=eq.{cal1}', token=TC); check('Carla: no lee turnos de la pareja 1', s == 200 and b == [], f'{b}')
    s, b = http('GET', f'/rest/v1/shifts?calendar_id=eq.{FAM}', token=TC); check('Carla: no lee turnos de la familia', s == 200 and b == [], f'{b}')
    s, b = http('GET', '/rest/v1/people', token=TC); check('Carla: solo ve a su pareja', s == 200 and len(b) == 2 and all(r['calendar_id'] == cal2 for r in b), f'{b}')
    s, b = shift(TC, pana, '2026-12-01', cal=cal1); check('Carla: no puede escribir en la pareja 1', s >= 400, f'{s}')
    s, b = http('PATCH', f'/rest/v1/shifts?calendar_id=eq.{cal1}', {'kind': 'tarde'}, token=TC, headers={'Prefer': 'return=representation'})
    check('Carla: no puede editar turnos de la pareja 1', s == 200 and b == [], f'{s} {b}')
    s, b = http('DELETE', f'/rest/v1/shifts?calendar_id=eq.{FAM}', token=TC, headers={'Prefer': 'return=representation'})
    check('Carla: no puede borrar turnos de la familia', s == 200 and b == [], f'{s} {b}')
    for table, body in (('tasks', {'calendar_id': cal2, 'title': 'x'}), ('events', {'calendar_id': cal2, 'title': 'x', 'event_date': '2026-12-01'})):
        s, b = http('POST', f'/rest/v1/{table}', body, token=TC); check(f'Carla: sin acceso a {table} ni en su espacio', s >= 400, f'{s}')
    s, b = http('GET', '/rest/v1/tasks', token=TAna); check('Ana: no lee tareas familiares', s == 200 and b == [], f'{b}')
    s, b = http('GET', '/rest/v1/invitations', token=TC); check('invitaciones no accesibles por la API', s >= 400, f'{s}')
    s, b = http('GET', f'/rest/v1/shifts?calendar_id=eq.{cal1}', token=TF); check('Franklin (admin) tampoco lee turnos de parejas', s == 200 and b == [], f'{b}')
    s, b = http('GET', '/rest/v1/tasks', token=TA); check('Almudena conserva el acceso a Tareas', s == 200)

    # ------------------------------------------------ panel: estados
    fp.reload(); expect(fp.get_by_text('Nueva pareja')).to_be_visible(timeout=15000)
    fp.wait_for_timeout(800)
    check('panel: 3 aceptadas y 1 pendiente', fp.get_by_text('Aceptada', exact=True).count() == 3 and fp.get_by_text('Pendiente', exact=True).count() == 1)
    fp.screenshot(path=os.path.join(SHOTS, 'iphone-panel-estados.png'), full_page=True)
    browser.close()

ok = sum(1 for _, r in results if r)
print(f'\n{ok}/{len(results)} comprobaciones correctas')
sys.exit(0 if ok == len(results) else 1)
