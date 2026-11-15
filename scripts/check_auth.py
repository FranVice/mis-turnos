"""Auth y errores contra una API simulada; nunca envía credenciales o correos reales."""
from playwright.sync_api import sync_playwright, expect
import base64, json, re, sys, time
from urllib.parse import urlparse
sys.stdout.reconfigure(encoding='utf-8')
BASE='http://localhost:8082'
USER_ID='00000000-0000-0000-0000-000000000001'
CAL='10000000-0000-0000-0000-000000000001'
PERSON='20000000-0000-0000-0000-000000000001'
USER={'id':USER_ID,'aud':'authenticated','role':'authenticated','email':'franklin@example.test','app_metadata':{'provider':'email'},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
def encoded(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
TOKEN=encoded({'alg':'HS256','typ':'JWT'})+'.'+encoded({'sub':USER_ID,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600,'iat':int(time.time())})+'.test-signature'
SESSION={'access_token':TOKEN,'refresh_token':'fake-refresh-token','expires_in':3600,'expires_at':int(time.time())+3600,'token_type':'bearer','user':USER}

class Backend:
    def __init__(self):
        self.tokens=0; self.recoveries=0; self.password_updates=0
        self.fail_reads=False; self.fail_writes=False; self.shifts=[]
    def route(self, route):
        url=urlparse(route.request.url)
        if '/auth/v1/' in url.path:
            path=url.path.split('/auth/v1/')[1]
            data=route.request.post_data_json if route.request.post_data else {}
            if path=='token':
                self.tokens+=1
                if data.get('password')=='incorrecta':
                    return route.fulfill(status=400,json={'code':'invalid_credentials','msg':'Invalid login credentials'})
                return route.fulfill(json=SESSION)
            if path=='logout': return route.fulfill(status=204)
            if path=='recover':
                self.recoveries+=1
                return route.fulfill(json={})
            if path=='user':
                if route.request.method=='PUT': self.password_updates+=1
                return route.fulfill(json=USER)
            return route.fulfill(status=400,json={'msg':'Unexpected mocked Auth request'})
        if '/rest/v1/' in url.path:
            if self.fail_reads and route.request.method=='GET':
                return route.fulfill(status=503,json={'message':'Failed to fetch: prueba sin conexión','code':'MOCK_OFFLINE'})
            table=url.path.split('/rest/v1/')[1]
            if table=='people': return route.fulfill(json=[{'id':PERSON,'calendar_id':CAL,'display_name':'Franklin','initial':'F','color':'#2563EB','user_id':USER_ID}])
            if table=='usual_schedules': return route.fulfill(json=[{'person_id':PERSON,'kind':'manana','start_time':'06:00','end_time':'14:00'}])
            if table=='shifts':
                if route.request.method=='GET': return route.fulfill(json=self.shifts)
                if self.fail_writes: return route.fulfill(status=503,json={'message':'Failed to fetch','code':'MOCK_OFFLINE'})
                row={**route.request.post_data_json,'id':'30000000-0000-0000-0000-000000000001','version':1,'updated_by':USER_ID}
                self.shifts.append(row)
                return route.fulfill(json=row)
            return route.fulfill(status=400,json={'message':'Unexpected mock table'})
        if url.hostname not in ('localhost','127.0.0.1'):
            return route.abort()
        return route.continue_()

def attach(context, backend):
    context.route('**/*',backend.route)
    context.route_web_socket(re.compile(r'.*/realtime/.*'),lambda socket:socket.close())

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    context=browser.new_context(viewport={'width':393,'height':852},timezone_id='Europe/Madrid')
    backend=Backend();attach(context,backend)
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(BASE);page.wait_for_load_state('networkidle')
    page.get_by_label('Correo',exact=True).fill('franklin@example.test')
    page.get_by_label('Contraseña',exact=True).fill('incorrecta')
    page.get_by_role('button',name='Entrar',exact=True).click()
    expect(page.get_by_text('Correo o contraseña incorrectos.',exact=True)).to_be_visible()
    page.get_by_label('Contraseña',exact=True).fill('correcta-solo-prueba')
    page.get_by_role('button',name='Entrar',exact=True).click()
    expect(page.get_by_text('Franklin (tú)',exact=True)).to_be_visible()
    page.reload();expect(page.get_by_text('Franklin (tú)',exact=True)).to_be_visible()
    assert backend.tokens==2, 'La sesión debe restaurarse sin otro login'
    backend.fail_reads=True
    page.get_by_role('button',name='Actualizar',exact=True).click()
    expect(page.get_by_text(re.compile('No se han podido cargar los turnos'))).to_be_visible(timeout=30000)
    expect(page.get_by_text('Franklin (tú)',exact=True)).to_be_visible()
    backend.fail_reads=False
    page.get_by_role('button',name='Actualizar',exact=True).click()
    expect(page.get_by_text(re.compile('No se han podido cargar los turnos'))).not_to_be_visible()
    context.set_offline(True)
    expect(page.get_by_text(re.compile('Sin conexión. Conservamos los últimos datos confirmados'))).to_be_visible()
    context.set_offline(False)
    expect(page.get_by_text(re.compile('Sin conexión. Conservamos los últimos datos confirmados'))).not_to_be_visible()
    page.get_by_role('button',name='Turno hoy',exact=True).click()
    page.get_by_role('button',name='Añadir turno',exact=True).click()
    backend.fail_writes=True
    page.get_by_role('button',name='Guardar turno',exact=True).click()
    expect(page.get_by_text(re.compile('No se ha podido guardar: sin conexión'))).to_be_visible()
    expect(page.get_by_label('Entrada',exact=True)).to_have_value('06:00')
    backend.fail_writes=False
    page.get_by_role('button',name='Guardar turno',exact=True).click()
    expect(page.get_by_text('06:00–14:00',exact=True)).to_be_visible()
    page.get_by_role('button',name='Cerrar',exact=True).click()
    page.get_by_label('Horarios habituales y cuenta',exact=True).click()
    page.get_by_role('button',name='Cerrar sesión',exact=True).click()
    expect(page.get_by_role('button',name='Entrar',exact=True)).to_be_visible()
    page.reload();expect(page.get_by_role('button',name='Entrar',exact=True)).to_be_visible()
    page.get_by_label('Correo',exact=True).fill('franklin@example.test')
    page.get_by_role('button',name='He olvidado mi contraseña',exact=True).click()
    expect(page.get_by_text(re.compile('Si el correo está registrado'))).to_be_visible()
    assert backend.recoveries==1
    context.close()
    recovery=browser.new_context(viewport={'width':393,'height':852})
    attach(recovery,backend)
    page=recovery.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(BASE+'/#access_token='+TOKEN+'&refresh_token=fake-recovery-token&expires_in=3600&token_type=bearer&type=recovery')
    expect(page.get_by_role('button',name='Guardar contraseña',exact=True)).to_be_visible(timeout=30000)
    page.get_by_label('Nueva contraseña',exact=True).fill('Nueva-solo-prueba-123')
    page.get_by_role('button',name='Guardar contraseña',exact=True).click()
    expect(page.get_by_text('Franklin (tú)',exact=True)).to_be_visible()
    assert backend.password_updates==1
    assert not errors,errors
    print('OK: login, errores, sesión tras recargar, logout, aviso offline, reintento de guardado y recuperación. Todo con API simulada.')
    browser.close()
