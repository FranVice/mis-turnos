# Espacios de pareja (Mis Turnos compartido)

## Qué es

- **Espacio familiar** (Franklin y Almudena): `calendars.kind = 'family'`, todos los módulos.
- **Espacio de pareja**: `calendars.kind = 'shifts'`, dos personas, solo Mis Turnos.
- Pertenencia = `people.user_id` (una cuenta pertenece a un solo espacio).
- Tareas, Agenda y Economía llevan una política RLS *restrictive* «solo espacio familiar»:
  un invitado no puede leerlas ni escribirlas por la API, ni en su propio espacio.
- Turnos: misma regla que la familia (los dos ven todo; cada uno crea/edita/borra los suyos).
- Día libre en común: casilla en verde claro cuando todos los miembros tienen «Libre» ese día
  (`src/modules/shifts/logic.ts`).

## Flujo

1. Franklin abre **Turnos → icono de personas → Panel de parejas** (`/admin`).
2. Escribe los nombres y los dos correos → «Crear pareja e invitaciones».
3. Comparte cada enlace (`/invitacion?token=…`) con su persona.
4. La persona abre el enlace y:
   - crea cuenta con contraseña (recibe un correo de confirmación y vuelve al enlace), o
   - entra con una cuenta que ya tenía, o
   - continúa con Google (si está activado).
5. Al entrar con el correo invitado (verificado), la invitación se acepta sola y abre Mis Turnos.
   Repetirla no duplica nada; con otro correo se rechaza.

El panel muestra cada invitación como **Pendiente**, **Aceptada** o **Anulada**, y permite anular
una pendiente e invitar de nuevo a esa persona con otro correo.

## Funciones de la base de datos

| Función | Quién | Para qué |
|---|---|---|
| `am_i_admin()` | autenticados | Mostrar u ocultar el acceso al panel |
| `admin_create_couple(espacio, nombre1, correo1, nombre2, correo2)` | admin | Alta de pareja + 2 invitaciones |
| `admin_list_invitations()` | admin | Listado con estado y enlace |
| `admin_revoke_invitation(id)` / `admin_reinvite(id, correo)` | admin | Corregir invitaciones |
| `invitation_info(token)` | cualquiera con el enlace | Mostrar espacio y correo invitado |
| `accept_invitation(token)` | autenticados | Vincular la cuenta (correo verificado y coincidente) |
| `private.hook_before_user_created` | Supabase Auth | Solo deja registrarse a correos con invitación pendiente |

Administradores: tabla `private.admins` (no expuesta por la API). La migración añade a Franklin.

## Pasos para desplegar (en este orden)

1. **Aplicar la migración** `20261126000000_couple_spaces.sql` en Supabase.
   Comprobar después: `select kind from calendars` → `family`; `select * from private.admins` → 1 fila.
2. **Activar el hook** en Supabase → Authentication → Hooks → *Before User Created* →
   Postgres → esquema `private`, función `hook_before_user_created`.
3. **Activar el registro** (Authentication → Sign In / Providers → *Allow new users to sign up*).
   Con el hook activo, solo pueden registrarse los correos invitados. **Hazlo después del paso 2.**
4. Comprobar que **Confirm email** está activado (necesario para que el correo esté verificado).
5. **Redirect URLs**: añadir `https://nuestros-turnos.vercel.app/**`.
6. (Opcional) **Google**: crear un cliente OAuth en Google Cloud (URI de redirección
   `https://<ref>.supabase.co/auth/v1/callback`), pegarlo en Authentication → Providers → Google
   y añadir `EXPO_PUBLIC_GOOGLE_AUTH=1` a las variables de Vercel.
7. Fusionar `nexo/parejas` en `main` → Vercel despliega.

## Prueba local

`scripts/check_couples_local.py` recorre todo el flujo contra un Supabase local
(`supabase start`) con la familia y dos parejas de prueba. No toca el proyecto remoto.
