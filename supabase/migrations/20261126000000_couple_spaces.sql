begin;
-- =====================================================================
-- Espacios de pareja: Mis Turnos compartido con otras parejas mediante
-- invitación. Cada pareja tiene su propio calendario de tipo «shifts»
-- (solo turnos); el calendario de Franklin y Almudena pasa a «family»
-- y conserva todos los módulos. Migración aditiva: no borra datos.
--
-- · Pertenencia: sigue siendo people.user_id (una cuenta = un espacio).
-- · Tareas, Agenda y Economía: políticas RESTRICTIVE que exigen un
--   espacio familiar (se suman a las existentes con AND).
-- · Administración: lista en private.admins; todo el alta pasa por
--   funciones security definer que lo comprueban en el servidor.
-- · Invitaciones: sin acceso directo por la API; solo mediante funciones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipo de espacio
-- ---------------------------------------------------------------------
-- Por defecto «shifts» (el menor permiso); los calendarios existentes son
-- el espacio familiar.
alter table public.calendars add column kind text not null default 'shifts'
  check (kind in ('family', 'shifts'));
update public.calendars set kind = 'family';

create function private.is_family_calendar(cal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.calendars c where c.id = cal and c.kind = 'family');
$$;
revoke all on function private.is_family_calendar(uuid) from public, anon;
grant execute on function private.is_family_calendar(uuid) to authenticated;

-- Módulos familiares: solo en espacios familiares (lecturas y escrituras).
create policy "solo espacio familiar" on public.tasks as restrictive for all to authenticated
  using (private.is_family_calendar(calendar_id)) with check (private.is_family_calendar(calendar_id));
create policy "solo espacio familiar" on public.events as restrictive for all to authenticated
  using (private.is_family_calendar(calendar_id)) with check (private.is_family_calendar(calendar_id));
create policy "solo espacio familiar" on public.fin_recurring as restrictive for all to authenticated
  using (private.is_family_calendar(calendar_id)) with check (private.is_family_calendar(calendar_id));
create policy "solo espacio familiar" on public.fin_movements as restrictive for all to authenticated
  using (private.is_family_calendar(calendar_id)) with check (private.is_family_calendar(calendar_id));

-- ---------------------------------------------------------------------
-- Administradores (no expuesto por la API: esquema private)
-- ---------------------------------------------------------------------
create table private.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
revoke all on private.admins from public, anon, authenticated;

-- Franklin, identificado por su persona vinculada del espacio familiar.
insert into private.admins (user_id)
select p.user_id
from public.people p
join public.calendars c on c.id = p.calendar_id and c.kind = 'family'
where p.display_name = 'Franklin' and p.user_id is not null
on conflict do nothing;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Para que la app sepa si mostrar el panel (la protección real está en cada función).
create function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.is_admin(); $$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- ---------------------------------------------------------------------
-- Invitaciones
-- ---------------------------------------------------------------------
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars (id) on delete cascade,
  person_id    uuid not null,
  email        text not null check (email = lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  token        uuid not null unique default gen_random_uuid(),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_by  uuid references auth.users (id) on delete set null,
  accepted_at  timestamptz,
  foreign key (person_id, calendar_id) references public.people (id, calendar_id) on delete cascade
);
-- Un correo solo puede tener una invitación viva (pendiente o aceptada).
create unique index invitations_live_email on public.invitations (email) where status <> 'revoked';
create index invitations_calendar_idx on public.invitations (calendar_id);

-- Sin políticas ni permisos: solo se usa desde las funciones de abajo.
alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;

-- Alta de una pareja: espacio «shifts», dos personas sin cuenta, horarios
-- habituales de partida y dos invitaciones. Devuelve el id del espacio.
create function public.admin_create_couple(
  p_space_name text,
  p_name1 text, p_email1 text,
  p_name2 text, p_email2 text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cal uuid;
  e1 text := lower(trim(p_email1));
  e2 text := lower(trim(p_email2));
  n1 text := trim(p_name1);
  n2 text := trim(p_name2);
  pid uuid;
  i int;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede dar de alta parejas' using errcode = '42501';
  end if;
  if coalesce(n1, '') = '' or coalesce(n2, '') = '' then
    raise exception 'Escribe el nombre de los dos miembros' using errcode = '22023';
  end if;
  if e1 = e2 then
    raise exception 'Los dos correos deben ser distintos' using errcode = '22023';
  end if;
  if exists (select 1 from public.invitations v where v.email in (e1, e2) and v.status <> 'revoked') then
    raise exception 'Alguno de los correos ya tiene una invitación' using errcode = '23505';
  end if;
  if exists (select 1 from auth.users u join public.people p on p.user_id = u.id where lower(u.email) in (e1, e2)) then
    raise exception 'Alguno de los correos ya pertenece a un espacio' using errcode = '23505';
  end if;

  insert into public.calendars (name, kind)
  values (coalesce(nullif(trim(p_space_name), ''), n1 || ' y ' || n2), 'shifts')
  returning id into cal;

  for i in 1..2 loop
    insert into public.people (calendar_id, display_name, initial, color, sort_order)
    values (cal,
            case i when 1 then n1 else n2 end,
            upper(left(case i when 1 then n1 else n2 end, 1)),
            case i when 1 then '#2563EB' else '#E8590C' end,
            i - 1)
    returning id into pid;

    insert into public.usual_schedules (person_id, kind, start_time, end_time) values
      (pid, 'manana', '06:00', '14:00'),
      (pid, 'tarde',  '14:00', '22:00'),
      (pid, 'noche',  '22:00', '06:00');

    insert into public.invitations (calendar_id, person_id, email)
    values (cal, pid, case i when 1 then e1 else e2 end);
  end loop;

  return cal;
end;
$$;

create function public.admin_list_invitations()
returns table (
  id uuid, calendar_id uuid, space_name text, person_id uuid, person_name text, email text,
  token uuid, status text, created_at timestamptz, accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede ver las invitaciones' using errcode = '42501';
  end if;
  return query
    select v.id, v.calendar_id, c.name, v.person_id, p.display_name, v.email, v.token, v.status, v.created_at, v.accepted_at
    from public.invitations v
    join public.calendars c on c.id = v.calendar_id
    join public.people p on p.id = v.person_id
    order by v.created_at desc, p.sort_order;
end;
$$;

-- Anula una invitación pendiente (p. ej. correo mal escrito). La persona
-- sigue en el espacio sin cuenta; se puede volver a invitar.
create function public.admin_revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede anular invitaciones' using errcode = '42501';
  end if;
  update public.invitations set status = 'revoked' where id = p_id and status = 'pending';
  if not found then
    raise exception 'La invitación no existe o ya no está pendiente' using errcode = 'P0002';
  end if;
end;
$$;

-- Nueva invitación para la persona de una invitación anulada (p. ej.
-- correo mal escrito), siempre que siga sin cuenta.
create function public.admin_reinvite(p_invitation_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(p_email));
  p_person_id uuid;
  cal uuid;
  tok uuid;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede invitar' using errcode = '42501';
  end if;
  select p.id, p.calendar_id into p_person_id, cal
  from public.invitations v
  join public.people p on p.id = v.person_id
  join public.calendars c on c.id = p.calendar_id
  where v.id = p_invitation_id and v.status = 'revoked' and p.user_id is null and c.kind = 'shifts';
  if cal is null then
    raise exception 'Persona no encontrada o ya vinculada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.invitations v where v.person_id = p_person_id and v.status = 'pending') then
    raise exception 'Esa persona ya tiene una invitación pendiente' using errcode = '23505';
  end if;
  if exists (select 1 from public.invitations v where v.email = e and v.status <> 'revoked')
     or exists (select 1 from auth.users u join public.people p on p.user_id = u.id where lower(u.email) = e) then
    raise exception 'Ese correo ya tiene una invitación o pertenece a un espacio' using errcode = '23505';
  end if;
  insert into public.invitations (calendar_id, person_id, email) values (cal, p_person_id, e)
  returning token into tok;
  return tok;
end;
$$;

-- Datos para la pantalla de invitación (quien tiene el enlace ve a qué
-- correo va dirigida, para entrar con la cuenta correcta).
create function public.invitation_info(p_token uuid)
returns table (email text, space_name text, person_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.email, c.name, p.display_name, v.status
  from public.invitations v
  join public.calendars c on c.id = v.calendar_id
  join public.people p on p.id = v.person_id
  where v.token = p_token;
$$;

-- Aceptar: el correo verificado de la cuenta debe coincidir con el
-- invitado. Repetir la aceptación con la misma cuenta no cambia nada.
create function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invitations%rowtype;
  my_email text;
  confirmed timestamptz;
  my_person uuid;
begin
  if uid is null then
    raise exception 'Inicia sesión para aceptar la invitación' using errcode = '42501';
  end if;
  select * into inv from public.invitations where token = p_token for update;
  if not found or inv.status = 'revoked' then
    raise exception 'La invitación no existe o ha sido anulada' using errcode = 'P0002';
  end if;

  select lower(u.email), u.email_confirmed_at into my_email, confirmed from auth.users u where u.id = uid;
  if my_email is distinct from inv.email then
    raise exception 'Esta invitación es para otro correo' using errcode = '42501';
  end if;
  if confirmed is null then
    raise exception 'Confirma tu correo antes de aceptar la invitación' using errcode = '42501';
  end if;

  select p.id into my_person from public.people p where p.user_id = uid;
  if inv.status = 'accepted' then
    if inv.accepted_by = uid and my_person = inv.person_id then return inv.calendar_id; end if;
    raise exception 'La invitación ya fue aceptada' using errcode = '23505';
  end if;
  if my_person is not null and my_person <> inv.person_id then
    raise exception 'Tu cuenta ya pertenece a otro espacio' using errcode = '23505';
  end if;

  update public.people set user_id = uid where id = inv.person_id and (user_id is null or user_id = uid);
  if not found then
    raise exception 'Esta plaza ya está ocupada por otra cuenta' using errcode = '23505';
  end if;
  update public.invitations set status = 'accepted', accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.calendar_id;
end;
$$;

revoke all on function public.admin_create_couple(text, text, text, text, text) from public, anon;
revoke all on function public.admin_list_invitations() from public, anon;
revoke all on function public.admin_revoke_invitation(uuid) from public, anon;
revoke all on function public.admin_reinvite(uuid, text) from public, anon;
revoke all on function public.accept_invitation(uuid) from public, anon;
revoke all on function public.invitation_info(uuid) from public;
grant execute on function public.admin_create_couple(text, text, text, text, text) to authenticated;
grant execute on function public.admin_list_invitations() to authenticated;
grant execute on function public.admin_revoke_invitation(uuid) to authenticated;
grant execute on function public.admin_reinvite(uuid, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.invitation_info(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Hook «Before User Created» (se activa en el panel de Supabase:
-- Authentication → Hooks → pg-functions://postgres/private/hook_before_user_created).
-- Solo deja crear cuentas a correos con invitación pendiente.
-- Mientras no se active, no tiene efecto.
-- ---------------------------------------------------------------------
create function private.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(event -> 'user' ->> 'email'));
begin
  if e is not null and exists (select 1 from public.invitations v where v.email = e and v.status = 'pending') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'El registro solo está disponible con una invitación.'));
end;
$$;
revoke all on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;
  end if;
end $$;

commit;
