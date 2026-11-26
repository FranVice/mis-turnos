begin;
-- =====================================================================
-- Espacios de Mis Turnos para otras parejas. Migración aditiva: no
-- borra ni modifica datos existentes salvo marcar el calendario actual
-- (Franklin y Almudena) como «family».
--
-- · Alta: enlace general /unirse. Quien se registra (correo confirmado)
--   crea su propio espacio «shifts» (solo Mis Turnos) con start_mis_turnos().
-- · Pareja: quien creó el espacio invita a su pareja por correo con
--   invite_partner(); la pareja acepta el enlace privado con
--   accept_invitation(). Máximo dos miembros por espacio.
-- · Pertenencia: people.user_id (una cuenta = un espacio).
-- · Tareas, Agenda y Economía: políticas RESTRICTIVE «solo espacio familiar».
-- · Administración: private.admins; el panel solo copia el enlace general,
--   lo pausa y ve un resumen de espacios (sin correos ni turnos).
-- · Invitaciones y ajustes: sin acceso directo por la API; solo funciones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipo de espacio y creador
-- ---------------------------------------------------------------------
-- Por defecto «shifts» (el menor permiso); el calendario existente es el familiar.
alter table public.calendars add column kind text not null default 'shifts'
  check (kind in ('family', 'shifts'));
update public.calendars set kind = 'family';
-- Quién creó el espacio (puede invitar a su pareja). Null en el familiar.
alter table public.calendars add column created_by uuid references auth.users (id) on delete set null;

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

-- Máximo dos personas por espacio de turnos.
create function public.people_max_two() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.calendars c where c.id = new.calendar_id and c.kind = 'shifts')
     and (select count(*) from public.people p where p.calendar_id = new.calendar_id and p.id <> new.id) >= 2 then
    raise exception 'El calendario ya tiene dos miembros' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger people_max_two before insert or update of calendar_id on public.people
for each row execute function public.people_max_two();

-- ---------------------------------------------------------------------
-- Administradores y ajustes (esquema private: no expuesto por la API)
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

-- Una sola fila: ¿está activo el enlace general?
create table private.settings (
  id               boolean primary key default true check (id),
  general_signup   boolean not null default true,
  updated_at       timestamptz not null default now()
);
insert into private.settings default values;
revoke all on private.settings from public, anon, authenticated;

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

create function private.general_signup_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select s.general_signup from private.settings s), false); $$;
revoke all on function private.general_signup_enabled() from public, anon, authenticated;

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

-- Nombre para mostrar a partir del registro (nombre elegido, Google o correo).
create function private.display_name_of(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(
           nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
           nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
           initcap(split_part(u.email, '@', 1))), 40)
  from auth.users u where u.id = uid;
$$;
revoke all on function private.display_name_of(uuid) from public, anon, authenticated;

-- Correo de la cuenta si está confirmado (null si no).
create function private.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;
revoke all on function private.my_confirmed_email() from public, anon, authenticated;

-- Crea la persona de la cuenta en un espacio, con horarios de partida.
create function private.add_member(cal uuid, uid uuid, ord int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := private.display_name_of(uid);
  pid uuid;
begin
  insert into public.people (calendar_id, display_name, initial, color, sort_order, user_id)
  values (cal, name, upper(left(name, 1)), case ord when 0 then '#2563EB' else '#E8590C' end, ord, uid)
  returning id into pid;
  insert into public.usual_schedules (person_id, kind, start_time, end_time) values
    (pid, 'manana', '06:00', '14:00'),
    (pid, 'tarde',  '14:00', '22:00'),
    (pid, 'noche',  '22:00', '06:00');
  return pid;
end;
$$;
revoke all on function private.add_member(uuid, uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Enlace general: crear (o recuperar) mi espacio
-- ---------------------------------------------------------------------
-- Devuelve el id del espacio. Si la cuenta ya pertenece a uno (también el
-- familiar), lo devuelve sin cambiar nada; repetirla nunca crea otro.
create function public.start_mis_turnos()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cal uuid;
begin
  if uid is null then
    raise exception 'Inicia sesión para continuar' using errcode = '42501';
  end if;
  -- Serializa reintentos simultáneos de la misma cuenta.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select p.calendar_id into cal from public.people p where p.user_id = uid;
  if cal is not null then return cal; end if;

  if private.my_confirmed_email() is null then
    raise exception 'Confirma tu correo antes de continuar' using errcode = '42501';
  end if;
  if not private.general_signup_enabled() then
    raise exception 'El alta de nuevos calendarios está pausada' using errcode = '42501';
  end if;

  insert into public.calendars (name, kind, created_by)
  values ('Turnos de ' || private.display_name_of(uid), 'shifts', uid)
  returning id into cal;
  perform private.add_member(cal, uid, 0);
  return cal;
end;
$$;
revoke all on function public.start_mis_turnos() from public, anon;
grant execute on function public.start_mis_turnos() to authenticated;

-- ---------------------------------------------------------------------
-- Invitaciones de pareja
-- ---------------------------------------------------------------------
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars (id) on delete cascade,
  email        text not null check (email = lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  token        uuid not null unique default gen_random_uuid(),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  person_id    uuid references public.people (id) on delete set null,  -- al aceptar
  accepted_by  uuid references auth.users (id) on delete set null,
  accepted_at  timestamptz
);
-- Como mucho una invitación pendiente por espacio.
create unique index invitations_one_pending on public.invitations (calendar_id) where status = 'pending';
create index invitations_email_idx on public.invitations (email) where status = 'pending';

-- Sin políticas ni permisos: solo se usa desde las funciones.
alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;

-- Quien creó el espacio invita a su pareja. Devuelve el token del enlace
-- privado. Con el mismo correo devuelve la misma invitación (reintentos);
-- con otro correo anula la anterior y crea una nueva.
create function public.invite_partner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  e text := lower(trim(p_email));
  cal uuid;
  existing public.invitations%rowtype;
  tok uuid;
begin
  select c.id into cal
  from public.people p join public.calendars c on c.id = p.calendar_id
  where p.user_id = uid and c.kind = 'shifts' and c.created_by = uid
  for update of c;
  if cal is null then
    raise exception 'Solo quien creó el calendario puede invitar a su pareja' using errcode = '42501';
  end if;
  if e is null or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido' using errcode = '22023';
  end if;
  if e = (select lower(u.email) from auth.users u where u.id = uid) then
    raise exception 'Escribe el correo de tu pareja, no el tuyo' using errcode = '22023';
  end if;
  if (select count(*) from public.people p where p.calendar_id = cal) >= 2 then
    raise exception 'El calendario ya tiene dos miembros' using errcode = 'check_violation';
  end if;

  select * into existing from public.invitations v where v.calendar_id = cal and v.status = 'pending';
  if found and existing.email = e then return existing.token; end if;
  if found then update public.invitations set status = 'revoked' where id = existing.id; end if;

  insert into public.invitations (calendar_id, email) values (cal, e) returning token into tok;
  return tok;
end;
$$;

-- Invitación pendiente de mi espacio (para volver a copiar el enlace).
create function public.my_invitation()
returns table (email text, token uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.email, v.token, v.created_at
  from public.invitations v
  join public.calendars c on c.id = v.calendar_id
  join public.people p on p.calendar_id = c.id and p.user_id = (select auth.uid())
  where v.status = 'pending' and c.created_by = (select auth.uid());
$$;

create function public.cancel_my_invitation()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invitations v set status = 'revoked'
  from public.calendars c
  where c.id = v.calendar_id and c.created_by = (select auth.uid()) and v.status = 'pending';
$$;

-- Datos para la pantalla del enlace privado: quién invita y a qué correo.
create function public.invitation_info(p_token uuid)
returns table (email text, inviter_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.email, coalesce(private.display_name_of(v.created_by), 'Tu pareja'), v.status
  from public.invitations v
  where v.token = p_token;
$$;

-- Aceptar el enlace privado: el correo verificado de la cuenta debe ser el
-- invitado. Repetirla con la misma cuenta devuelve el mismo espacio.
-- Si la cuenta tiene un espacio propio VACÍO (solo ella, sin turnos ni turnos con nombre), se
-- elimina para unirse; con turnos, se rechaza sin tocar nada.
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
  mine record;
  pid uuid;
begin
  if uid is null then
    raise exception 'Inicia sesión para aceptar la invitación' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into inv from public.invitations where token = p_token for update;
  if not found or inv.status = 'revoked' then
    raise exception 'La invitación no existe o ha sido anulada' using errcode = 'P0002';
  end if;

  select lower(u.email) into my_email from auth.users u where u.id = uid;
  if my_email is distinct from inv.email then
    raise exception 'Esta invitación es para otro correo' using errcode = '42501';
  end if;
  if private.my_confirmed_email() is null then
    raise exception 'Confirma tu correo antes de aceptar la invitación' using errcode = '42501';
  end if;

  select p.id, p.calendar_id, c.kind, c.created_by,
         (select count(*) from public.people o where o.calendar_id = p.calendar_id) as members,
         (select count(*) from public.shifts s where s.calendar_id = p.calendar_id)
           + (select count(*) from public.shift_templates t where t.person_id = p.id) as shift_count
    into mine
  from public.people p join public.calendars c on c.id = p.calendar_id
  where p.user_id = uid;

  if inv.status = 'accepted' then
    if inv.accepted_by = uid and mine.calendar_id = inv.calendar_id then return inv.calendar_id; end if;
    raise exception 'La invitación ya fue aceptada' using errcode = '23505';
  end if;

  if mine.calendar_id is not null then
    if mine.calendar_id = inv.calendar_id then
      raise exception 'Ya perteneces a este calendario' using errcode = '23505';
    end if;
    if mine.kind = 'shifts' and mine.created_by = uid and mine.members = 1 and mine.shift_count = 0 then
      delete from public.calendars where id = mine.calendar_id;   -- espacio propio vacío
    else
      raise exception 'Ya tienes un calendario con turnos. Pide ayuda para unir los dos calendarios.' using errcode = '23505';
    end if;
  end if;

  perform 1 from public.calendars where id = inv.calendar_id for update;
  if (select count(*) from public.people p where p.calendar_id = inv.calendar_id) >= 2 then
    raise exception 'El calendario ya tiene dos miembros' using errcode = 'check_violation';
  end if;
  pid := private.add_member(inv.calendar_id, uid, 1);
  update public.invitations set status = 'accepted', accepted_by = uid, accepted_at = now(), person_id = pid
  where id = inv.id;
  return inv.calendar_id;
end;
$$;

revoke all on function public.invite_partner(text) from public, anon;
revoke all on function public.my_invitation() from public, anon;
revoke all on function public.cancel_my_invitation() from public, anon;
revoke all on function public.accept_invitation(uuid) from public, anon;
revoke all on function public.invitation_info(uuid) from public;
grant execute on function public.invite_partner(text) to authenticated;
grant execute on function public.my_invitation() to authenticated;
grant execute on function public.cancel_my_invitation() to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.invitation_info(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Panel del administrador
-- ---------------------------------------------------------------------
-- Resumen de espacios de pareja: nombres y estado, sin correos ni turnos.
create function public.admin_overview()
returns table (
  calendar_id uuid, space_name text, created_at timestamptz,
  members text[], invitation_status text, general_signup boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede ver el panel' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.created_at,
           array(select p.display_name from public.people p where p.calendar_id = c.id order by p.sort_order),
           (select v.status from public.invitations v where v.calendar_id = c.id and v.status <> 'revoked'
             order by v.created_at desc limit 1),
           private.general_signup_enabled()
    from public.calendars c
    where c.kind = 'shifts'
    order by c.created_at desc;
end;
$$;

create function public.admin_general_signup()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede ver el panel' using errcode = '42501';
  end if;
  return private.general_signup_enabled();
end;
$$;

create function public.admin_set_general_signup(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede cambiar el enlace general' using errcode = '42501';
  end if;
  update private.settings set general_signup = p_enabled, updated_at = now() where id;
  return p_enabled;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_general_signup() from public, anon;
revoke all on function public.admin_set_general_signup(boolean) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_general_signup() to authenticated;
grant execute on function public.admin_set_general_signup(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Hook «Before User Created» (Authentication → Hooks →
-- pg-functions://postgres/private/hook_before_user_created).
-- Deja crear la cuenta si:
--   · el correo tiene una invitación pendiente, o
--   · el enlace general está activo y el alta viene de la app
--     (user_metadata.signup_source = 'mis-turnos') o de Google.
-- Es un filtro de entrada, no la protección de los datos (eso es RLS).
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
  source text := event -> 'user' -> 'user_metadata' ->> 'signup_source';
  provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', 'email');
begin
  if e is not null and exists (select 1 from public.invitations v where v.email = e and v.status = 'pending') then
    return '{}'::jsonb;
  end if;
  if private.general_signup_enabled() and (source = 'mis-turnos' or provider <> 'email') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', case when private.general_signup_enabled()
                    then 'Regístrate desde el enlace de Mis Turnos.'
                    else 'El alta de nuevas cuentas está pausada.' end));
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
