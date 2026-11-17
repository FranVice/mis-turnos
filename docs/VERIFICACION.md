# Verificación · 15 de noviembre de 2026

## Realizada localmente

- `pnpm lint`: sin errores ni avisos.
- `pnpm typecheck`: sin errores.
- `pnpm build`: exportación web de producción mediante Expo SDK 58, salida `dist/`.
- `pnpm dev`: servidor web arrancado; acceso al formulario real desde navegador.
- `pnpm test`: 9 pruebas de fechas y migraciones reales sobre PostgreSQL embebido PGlite. Incluye RLS con usuarios del mismo grupo y otro grupo, anónimo, permisos amplios por defecto de Supabase, preservación de datos, versión y autoría anteriores al migrar, edición compartida, versiones, duplicados, inserción de cinco días, noches, solapamientos, días completos y cambios de hora.
- Playwright con Microsoft Edge sin interfaz: calendario demo en anchos 320, 375, 393, 430 y 768 sin desbordamiento horizontal; alta de noche con plantilla, cinco días con horario propio de Almudena, edición a Vacaciones, eliminación confirmada y cambio de color. Sin excepciones JavaScript.
- Playwright sobre `dist/` servido por HTTP: formulario, validación, manifest e iconos de producción correctos.
- El formulario de acceso real se ha renderizado sin iniciar sesión ni enviar correos. Las pruebas de gestión usan exclusivamente datos de demostración.

Para repetir la interfaz: instala Python y Playwright, ten Microsoft Edge disponible, inicia `pnpm demo --web --port 8083` y ejecuta `python scripts/check_web.py`. Las capturas están en `.expo/`, directorio ignorado por Git.

## Pendiente fuera del entorno local

- Aplicar migraciones al Supabase remoto: hacen falta acceso administrativo al proyecto o una sesión/credencial de base de datos autorizada. La URL y la clave pública del frontend no permiten migrar.
- Verificar las dos cuentas y su vínculo administrativo al mismo calendario.
- Publicar en Vercel: hace falta instrucción explícita de despliegue y acceso a la cuenta/proyecto de destino.
- Establecer Site URL y Redirect URLs finales; comprobar SMTP, recuperación y persistencia de Auth en Safari/PWA.
- Probar Realtime y edición simultánea entre dos sesiones reales; el PostgreSQL embebido no prueba el transporte Realtime ni la Data API remota.
- Ejecutar `PRUEBA_ACEPTACION.md` en los dos iPhone. La emulación de tamaño no equivale a Safari/iOS real ni a una auditoría VoiceOver.

## Decisiones y límites

Se conserva `calendars`/`people` como grupo y membresías. La pertenencia se asigna exclusivamente en administración; no hay invitaciones públicas. Otro se trata como día completo. No hay service worker, caché de turnos, escritura offline, push, nóminas ni fichaje. Las horas repetidas de octubre se interpretan con horario estándar; las inexistentes se rechazan. Las migraciones nuevas preservan datos; no se ha ejecutado ninguna contra el proyecto remoto.

# Rediseño oscuro · 17 de noviembre de 2026

- Tema centralizado en `src/shared/theme/` (colores, colores por tipo de turno, radios, sombras, hover/pulsación). `components/ui.tsx` lo reexporta para no romper importaciones.
- Hueco superior en la PWA de iPhone: `apple-mobile-web-app-status-bar-style` estaba en `default`, así que iOS reservaba la franja de la barra de estado y, con `viewport-fit=cover`, el área segura se sumaba encima. Además había dos filas de cabecera altas (título con botón de 50 px y fila de mes). Ahora: `black-translucent` (la app dibuja bajo la barra de estado y `SafeAreaView` aplica el inset una sola vez) y cabecera compacta. La hoja modal en web añade `insets.top` para no quedar bajo la Dynamic Island.
- Validado: typecheck, lint, 9 tests, `scripts/check_web.py` (320–768 px y flujos de alta, edición, eliminación, varios días y colores; sin errores JS) y `pnpm build`.
- No verificable aquí: el inset real en un iPhone con PWA instalada (Chromium devuelve 0 en `env(safe-area-inset-top)`), Realtime entre dos sesiones reales y el selector de hora nativo de iOS en tema oscuro.
- Reversión: etiqueta `estable-pre-oscuro` (commit 2c2a439).
