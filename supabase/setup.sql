-- =====================================================================
-- Nuestros turnos · datos iniciales y vinculación de cuentas
-- Ejecutar en Supabase > SQL Editor DESPUÉS de la migración y DESPUÉS
-- de crear las dos cuentas en Authentication > Users.
-- Sustituye los dos correos antes de ejecutar. Se puede repetir sin
-- duplicar nada.
-- =====================================================================

do $$
declare
  correo_franklin text := 'franklin@ejemplo.com';   -- <- cámbialo
  correo_almudena text := 'almudena@ejemplo.com';   -- <- cámbialo
  cal uuid;
  franklin uuid;
  almudena uuid;
  cuenta_franklin uuid;
  cuenta_almudena uuid;
begin
  select id into cuenta_franklin from auth.users where lower(email) = lower(correo_franklin);
  select id into cuenta_almudena from auth.users where lower(email) = lower(correo_almudena);
  if cuenta_franklin is null or cuenta_almudena is null or cuenta_franklin = cuenta_almudena then
    raise exception 'Crea y verifica las dos cuentas distintas en Auth antes de vincularlas. No se ha cambiado nada.';
  end if;
  select id into cal from public.calendars where name = 'Nuestros turnos' limit 1;
  if cal is null then
    insert into public.calendars (name) values ('Nuestros turnos') returning id into cal;
  end if;

  select id into franklin from public.people where calendar_id = cal and display_name = 'Franklin';
  if franklin is null then
    insert into public.people (calendar_id, display_name, initial, color, sort_order)
    values (cal, 'Franklin', 'F', '#2563EB', 1) returning id into franklin;
  end if;

  select id into almudena from public.people where calendar_id = cal and display_name = 'Almudena';
  if almudena is null then
    insert into public.people (calendar_id, display_name, initial, color, sort_order)
    values (cal, 'Almudena', 'A', '#E8590C', 2) returning id into almudena;
  end if;

  -- Vincular cuentas (pertenencia al calendario).
  update public.people set user_id = cuenta_franklin
  where id = franklin;
  update public.people set user_id = cuenta_almudena
  where id = almudena;

  -- Horarios habituales de Franklin. Los de Almudena se configuran desde la app.
  insert into public.usual_schedules (person_id, kind, start_time, end_time) values
    (franklin, 'manana', '06:00', '14:00'),
    (franklin, 'tarde',  '14:00', '22:00'),
    (franklin, 'noche',  '22:00', '06:00')
  on conflict (person_id, kind) do nothing;
end $$;

-- Comprobación: las dos filas deben tener cuenta_vinculada = true.
select p.display_name, p.initial, p.color, u.email, p.user_id is not null as cuenta_vinculada
from public.people p
left join auth.users u on u.id = p.user_id
order by p.sort_order;
