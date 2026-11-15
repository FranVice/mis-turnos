# Mis Turnos

Calendario privado compartido de Franklin y Almudena, preparado como web instalable desde Safari. Conserva Expo SDK 58, React Native Web, TypeScript y Supabase. Para el uso diario publicado no requiere Expo Go, App Store, cuenta Apple Developer ni un ordenador encendido.

## Desarrollo

Requisitos: Node.js 24 y pnpm 10. El repositorio usa `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env  # Solo si todavía no existe .env
pnpm dev                   # Navegador, normalmente http://localhost:8081
pnpm lint
pnpm typecheck
pnpm test
pnpm build                 # Exportación web en dist/
```

`npm run dev` y `npm run build` ejecutan los mismos scripts. Para añadir paquetes usa `npx expo install <paquete>` y conservar versiones compatibles. Las rutas están en `src/app/`; la lógica y componentes se mantienen fuera.

Variables públicas de compilación:

| Variable | Valor |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL de vuestro proyecto Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable o anon; nunca service_role ni clave secreta |
| `EXPO_PUBLIC_DEMO` | `0` en producción; `1` solo para demostración |

Sin URL/clave se abre una demostración identificada con una franja amarilla. Sus turnos son ficticios, se pierden al recargar y no se sincronizan. No introduzcáis turnos reales en este modo. Para probarla explícitamente: `pnpm demo --web`. Al cambiar variables reinicia Metro o recompila el sitio.

## Supabase: tablas, cuentas y seguridad

Las tablas existentes `calendars` y `people` representan el grupo compartido y sus miembros/perfiles. Se conservan sus UUID, datos y políticas. No hace falta migrar a otro framework ni reemplazar el esquema.

En **SQL Editor**, ejecuta en orden, una sola vez:

1. `supabase/migrations/20261112000000_nuestros_turnos.sql`, **solo si no está aplicada**.
2. `supabase/migrations/20261115000000_shift_kinds.sql`. Ejecuta esta migración por separado y confirma la transacción antes de continuar: PostgreSQL necesita confirmar los nuevos valores del enum.
3. `supabase/migrations/20261115000100_pwa.sql`.

Las dos migraciones nuevas no eliminan turnos. Añaden categorías e instantes `start_at`/`end_at` en UTC, conservando la fecha y horas locales anteriores, versiones y autoría. Un registro antiguo con una hora inexistente durante el cambio de marzo hace fallar la migración completa sin cambios parciales; revisa ese registro antes de volver a aplicarla. Los solapamientos antiguos se conservan; las nuevas escrituras que produzcan solapamientos de turnos con horas se rechazan.

En **Authentication > Sign In / Providers**, activa Email y desactiva el registro público. Crea las dos cuentas privadas desde **Authentication > Users**, comprueba sus direcciones y confirma sus cuentas. No se asigna acceso a quien simplemente escriba un correo en la aplicación.

Para una instalación nueva, edita los dos correos de `supabase/setup.sql` y ejecútalo como administrador después de crear las cuentas. Si falta una cuenta o ambas direcciones corresponden a la misma cuenta, el script aborta. La administración vincula los UUID de Supabase Auth a las personas. Si ya están vinculadas, no es necesario repetir este paso.

RLS limita turnos y plantillas a los miembros del mismo calendario. Ambos pueden editar a los dos. El cliente solo puede actualizar la columna `color` de las personas, nunca `user_id`, `calendar_id` o sus identidades. La inserción valida la autoría; edición y eliminación usan la versión del turno para detectar cambios simultáneos. Un turno por persona y fecha impide duplicados incluso con peticiones simultáneas.

Las tablas `shifts`, `usual_schedules` y `people` se incorporan a Realtime por las migraciones. También hay recarga al recuperar foco, volver a estar online, pulsar Actualizar y cada minuto con la página visible. Los errores conservan los últimos datos confirmados. No hay cola de cambios offline.

## Autenticación y recuperación

En **Authentication > URL Configuration**:

- **Site URL:** `https://TU-SITIO.vercel.app` (dominio final HTTPS).
- **Redirect URLs:** `http://localhost:8081/`, el puerto local que realmente uses y `https://TU-SITIO.vercel.app/`.
- Si usas un dominio de vista previa, añádelo explícitamente mientras lo necesites.

En el acceso, «He olvidado mi contraseña» envía el enlace al correo escrito. El enlace vuelve a la raíz del mismo dominio y muestra «Guardar contraseña»; exige al menos 12 caracteres. Configura el envío de correos de Supabase/SMTP y comprueba su entrega real. La sesión web se conserva en el almacenamiento de Safari; no se guardan los turnos allí. Al cerrar sesión se limpia el estado de datos y se invalidan lecturas pendientes.

## Uso

- El mes completo empieza en lunes. Flechas, gesto lateral y Hoy permiten navegar.
- Las iniciales F/A y la leyenda distinguen a las personas además del color. Toca un día para añadir o editar; desde la edición puedes eliminar con confirmación.
- Mañana, Tarde y Noche tienen horas editables. Franklin dispone de 06:00–14:00, 14:00–22:00 y 22:00–06:00 como plantillas iniciales. Los horarios de Almudena quedan sin configurar: se introducen manualmente o en ajustes.
- Libre, Vacaciones y Otro se han elegido como categorías de día completo, sin horas obligatorias.
- Una salida anterior a la entrada termina al día siguiente, indicado con `+1`. El detalle del día siguiente muestra la continuidad de la noche anterior.
- «Varios días» permite seleccionar fechas del mes, previsualizar persona, categoría, horas y fechas, y confirmar. Los días ocupados se omiten; no se sobrescriben. La operación SQL es atómica: si otro conflicto hace fallar la inserción, no se guarda parte del lote.
- Ajustes permite elegir colores y cambiar plantillas sin alterar turnos existentes.

La fecha laboral y las horas se interpretan siempre en `Europe/Madrid`. Los instantes UTC se calculan en PostgreSQL. Una noche de 22:00–06:00 dura 7 horas al adelantar el reloj y 9 al atrasarlo. Las horas inexistentes se rechazan. En la hora repetida de octubre se usa la ocurrencia de horario estándar elegida por PostgreSQL; no se ofrece selector de primera/segunda ocurrencia.

## Vercel e instalación en iPhone

El repositorio incluye `vercel.json`: framework Other, `pnpm build`, salida `dist`. Importa el repositorio en tu propia cuenta Vercel, configura las tres variables públicas con `EXPO_PUBLIC_DEMO=0` y despliega cuando decidas hacerlo. No se ha publicado desde esta tarea ni se han activado servicios de pago.

Después de publicar, actualiza Site URL/Redirect URLs en Supabase. Prueba inicio de sesión, recuperación y persistencia desde ese dominio. Desde Safari en cada iPhone: abre el dominio HTTPS, inicia sesión y pulsa **Compartir > Añadir a pantalla de inicio**. Comprueba la sesión abriendo también el icono instalado; Safari y la web instalada pueden mantener contextos de almacenamiento distintos.

Manifest, favicon e iconos de 180/192/512 px están incluidos. No se registra service worker: se evita una caché obsoleta del código o de respuestas privadas. Es una web instalable que requiere conexión; no ofrece push ni edición offline. Vercel y Supabase alojan la aplicación y los datos sin depender de vuestro PC.

## Verificación y límites

`pnpm test` ejecuta PostgreSQL embebido (PGlite) con las migraciones reales, roles y RLS, más pruebas del calendario. Simula los permisos por defecto amplios de Supabase para comprobar que el cliente no puede cambiar membresías. Es una prueba de SQL local; no sustituye probar Auth, Data API y Realtime en vuestro proyecto remoto.

Las comprobaciones realizadas y los pasos pendientes están en `docs/VERIFICACION.md`; las pruebas manuales en dos iPhone, en `PRUEBA_ACEPTACION.md`. Las capturas y resultados temporales quedan en `.expo/` y no se publican en Git.

Referencias consultadas: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [PWA con Expo](https://docs.expo.dev/guides/progressive-web-apps/), [Expo Router](https://docs.expo.dev/router/installation/), [Auth con contraseña](https://supabase.com/docs/guides/auth/passwords), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
