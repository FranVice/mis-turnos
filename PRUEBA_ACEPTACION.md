# Prueba de aceptación en dos iPhone

Requisito: publicar en vuestro dominio HTTPS, aplicar las tres migraciones en orden y vincular dos cuentas verificadas. No utilizar modo demostración. Esta lista está pendiente de ejecutar con los dispositivos reales.

1. Franklin entra desde Safari y ve el mes completo, con lunes primero. Almudena entra desde el otro iPhone y ve el mismo calendario.
2. Franklin añade Mañana 06:00–14:00. Comprueba que aparece en ambos teléfonos sin recargar manualmente.
3. Almudena añade un horario propio, por ejemplo el que realmente tenga ese día. No debe rellenarse con la plantilla de Franklin.
4. Añade una Noche 22:00–06:00. Comprueba `+1`, la continuidad en el detalle del día siguiente y los instantes en Supabase.
5. Selecciona cinco días, revisa persona, categoría, horas y fechas, confirma y comprueba los cinco en ambos móviles. Repite con un día ocupado: debe omitirse sin sobrescribir.
6. Abre el mismo turno desde ambos teléfonos. Edita desde uno y después guarda desde el otro: debe avisar de conflicto. Repite con una eliminación: no debe borrar una versión nueva sin avisar.
7. Añade Libre, Vacaciones y Otro sin horas. Comprueba los nombres en el detalle. Cambia los colores y las plantillas: los turnos anteriores no deben cambiar.
8. Crea temporalmente una tercera cuenta sin vínculo al calendario. Desde su sesión, consulta directamente las tablas con la API: no debe ver ni modificar turnos de Franklin/Almudena. Tampoco debe poder cambiar `people.user_id` o `calendar_id`. Las pruebas SQL automatizadas cubren estos permisos localmente.
9. Revisa anchos pequeños, rotación, teclado de horas y controles con VoiceOver. No debe existir scroll horizontal ni textos superpuestos.
10. Instala desde Safari > Compartir > Añadir a pantalla de inicio. Abre el icono, inicia sesión si es necesario, cierra y vuelve a abrir: los datos deben seguir en Supabase y la sesión persistir mientras Safari no elimine su almacenamiento.
11. Desconecta internet. Los últimos datos confirmados deben conservarse mientras la página siga abierta; guardar debe mostrar un error y permitir reintentar, sin anunciar éxito. Recupera la conexión y pulsa Actualizar.
12. Prueba la recuperación de contraseña desde el dominio publicado y la entrega del correo real. El enlace debe abrir el formulario de nueva contraseña.
13. Comprueba en las fechas de cambio de hora una noche 22:00–06:00: duración real de 7 horas en marzo, 9 en octubre. Rechaza una entrada 02:30 inexistente al adelantar el reloj. La hora repetida de octubre usa horario estándar.

No hay notificaciones push ni edición sin conexión. Las pruebas automatizadas y sus límites están en `docs/VERIFICACION.md`.
