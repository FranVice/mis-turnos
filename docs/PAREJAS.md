# Mis Turnos para otras parejas

## Reglas

- **Espacio familiar** (Franklin y Almudena): `calendars.kind = 'family'`, todos los módulos.
  Sus datos no cambian; la migración solo lo marca como familiar.
- **Espacio de pareja**: `calendars.kind = 'shifts'`, solo Mis Turnos, **máximo dos miembros**.
- Pertenencia = `people.user_id` (una cuenta pertenece a un solo espacio).
- Tareas, Agenda y Economía tienen una política RLS *restrictive* «solo espacio familiar»:
  una pareja no puede leerlas ni escribirlas por la API, ni siquiera en su espacio.
- Turnos (igual en todos los espacios): los dos ven todo; cada uno crea, edita y borra los suyos.
- Día libre en común: casilla verde claro solo si los dos están en «Libre» ese día.
  «Vacaciones» es un estado distinto y no cuenta (`src/modules/shifts/logic.ts`).
- El panel de administración no muestra correos ni turnos de las parejas; Franklin tampoco
  puede leerlos por la API.

## Flujo

1. **Enlace general** `https://nuestros-turnos.vercel.app/unirse`: permanente, se puede reenviar.
   Franklin lo copia desde **Turnos → icono de personas → Panel de Mis Turnos → «Copiar enlace general»**.
2. Quien lo abre: **Crear cuenta** (nombre, correo, contraseña) → correo de confirmación →
   al abrirlo vuelve a `/unirse` → `start_mis_turnos()` le crea su calendario → `/turnos`.
   Si ya tenía calendario (también Franklin y Almudena), lo lleva al suyo. Repetirlo no duplica.
3. En el calendario, quien lo creó ve **«Invitar a mi pareja»**: escribe el correo y obtiene el
   enlace privado `/invitacion?token=…` para enviarlo (WhatsApp) o copiarlo. Con el mismo correo
   devuelve el mismo enlace; con otro, anula el anterior. Se puede anular.
4. La pareja abre el enlace privado y crea su cuenta o entra con la que ya tenía.
   El enlace se conserva en la URL de vuelta del correo de confirmación y en el móvil
   (`localStorage`), así que tras registrarse, confirmar o entrar se une sola.
   Si llega ya con sesión, confirma con un toque («Unirme al calendario de …»).
   El servidor exige que el correo **verificado** coincida con el invitado.
5. Si la pareja ya se había creado un calendario propio **vacío** desde el enlace general,
   se elimina al unirse. Si tiene turnos, se rechaza sin tocar nada (pendiente de decidir).
6. Si alguien entra con cuenta y sin calendario (p. ej. confirmó en otro dispositivo), la app le
   ofrece abrir la invitación pendiente o crear su calendario.

**Pausar**: en el panel, «Pausar» bloquea altas nuevas (registro y creación de calendarios).
Las parejas existentes y las invitaciones pendientes siguen funcionando.

## Funciones de la base de datos

| Función | Quién | Para qué |
|---|---|---|
| `start_mis_turnos()` | autenticados con correo confirmado | Crear (o recuperar) mi calendario |
| `invite_partner(correo)` / `my_invitation()` / `cancel_my_invitation()` | quien creó el calendario | Enlace privado para la pareja |
| `invitation_info(token)` | cualquiera con el enlace | Quién invita y a qué correo |
| `accept_invitation(token)` | autenticados | Unirse (correo verificado y coincidente, idempotente) |
| `am_i_admin()` | autenticados | Mostrar u ocultar el acceso al panel |
| `admin_overview()` / `admin_general_signup()` / `admin_set_general_signup(bool)` | admin | Resumen y pausa del enlace general |
| `private.hook_before_user_created` | Supabase Auth | Filtro de registro (ver abajo) |

**Filtro de registro** (hook *Before User Created*): deja crear la cuenta si el correo tiene una
invitación pendiente, o si el enlace general está activo y el alta viene de la app
(`user_metadata.signup_source = 'mis-turnos'`) o de Google. Es un filtro de entrada; la marca la
envía el navegador. La protección de los datos es RLS: una cuenta nueva solo ve su calendario.

## Despliegue (en este orden)

Comprobado antes: en producción **no hay invitaciones** (la migración aún no está aplicada).

1. **SMTP propio (obligatorio antes de abrir el registro).** El correo integrado de Supabase solo
   envía a miembros del equipo del proyecto y con un límite muy bajo por hora: los usuarios del
   enlace general no recibirían la confirmación. Crear cuenta en un proveedor (p. ej. Resend o
   Brevo), verificar el dominio remitente y configurarlo en Authentication → Emails → SMTP.
   Después, ajustar el límite en Authentication → Rate Limits.
2. **Aplicar la migración** `20261126000000_couple_spaces.sql`.
   Comprobar: `select kind from calendars` → `family`; `select * from private.admins` → 1 fila
   (Franklin); `select * from private.settings` → `general_signup = true`; los 89 turnos siguen.
3. **Activar el hook**: Authentication → Hooks → *Before User Created* → Postgres →
   esquema `private`, función `hook_before_user_created`.
   Verificar con un alta de prueba sin pasar por la app (debe responder 403).
4. **Confirm email**: debe seguir activado (Authentication → Sign In / Providers → Email).
5. **URL Configuration**: Site URL `https://nuestros-turnos.vercel.app` y en Redirect URLs
   `https://nuestros-turnos.vercel.app/**` (vuelta a `/unirse` y `/invitacion?token=…`).
6. **Fusionar `nexo/parejas` en `main`** (con tu confirmación) → Vercel despliega `/unirse`.
7. **Abrir el registro** (Authentication → Sign In / Providers → *Allow new users to sign up*),
   siempre después de los pasos 1, 3 y 6.
8. Prueba real con dos correos tuyos: alta por `/unirse`, «Invitar a mi pareja», aceptación.
9. (Opcional) **Google**: cliente OAuth en Google Cloud (redirección
   `https://zyrnvvbpajqtlnpzyaki.supabase.co/auth/v1/callback`), pegarlo en Providers → Google y
   añadir `EXPO_PUBLIC_GOOGLE_AUTH=1` en Vercel.
10. (Recomendado) **CAPTCHA** de Supabase si aparecen altas automáticas.

## Prueba local

`scripts/check_couples_local.py` recorre todo el flujo contra un Supabase local
(`supabase start` con confirmación de correo y el hook activos, más una migración de semilla
con el espacio familiar): familia, dos parejas desde el mismo enlace general, enlace privado con
cuenta nueva y con cuenta existente, privacidad por URL y API, edición de turnos y fondo verde.
No toca el proyecto remoto.
