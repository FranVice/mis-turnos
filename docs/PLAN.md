# Adaptación a Mis Turnos

## Diagnóstico · 15 noviembre 2026

Se conserva Expo SDK 58, React Native Web, TypeScript y Supabase. Ya hay calendario mensual, CRUD con versiones, selección múltiple, plantillas y RLS mediante `calendars` y `people` (equivalentes a grupo y miembros). Hay cambios locales anteriores: se conservan. No hay carpetas nativas.

Faltan PWA, rutas, recuperación de contraseña, categorías adicionales, instantes UTC, colores configurables y documentación web. La vinculación de cuentas es administrativa por UUID de Auth; no hay autoasignación por correo desde el cliente.

## Plan

1. Configurar Expo Router, desarrollo web y exportación para Vercel.
2. Añadir migraciones incrementales para categorías, UTC y permisos limitados para colores, sin borrar turnos.
3. Reutilizar calendario y formularios: días completos, noches, confirmación masiva y ajustes.
4. Completar recuperación de contraseña, refresco web y manejo de sesión.
5. Manifest e iconos propios, sin caché de datos privados ni edición offline.
6. Typecheck, lint, pruebas de dominio, build web y documentación de verificaciones pendientes.

## Límites de verificación

No se publicará sin instrucción explícita. Aplicar SQL en un proyecto remoto requiere acceso administrativo. Las pruebas de RLS se entregan para ejecutar contra Supabase; el acceso real desde dos iPhone requiere los dispositivos y el dominio final.

## Resultado local

Etapas 0–7 implementadas y verificadas en el alcance local: se conserva el stack y se añaden Router, PWA, categorías, SQL incremental, UTC, recuperación, colores y comprobaciones. Lint, TypeScript, pruebas SQL/fechas y build pasan. Playwright valida los flujos principales en demostración. Configuración y verificación remotas, publicación y pruebas en iPhone continúan pendientes según `VERIFICACION.md`.
