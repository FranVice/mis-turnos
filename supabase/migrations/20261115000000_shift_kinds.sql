-- Ejecutar y confirmar ANTES de la siguiente migración.
alter type public.shift_kind add value if not exists 'noche';
alter type public.shift_kind add value if not exists 'libre';
alter type public.shift_kind add value if not exists 'vacaciones';
alter type public.shift_kind add value if not exists 'otro';
