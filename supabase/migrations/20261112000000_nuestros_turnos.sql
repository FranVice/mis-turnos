-- =====================================================================
-- Nuestros turnos · esquema inicial
-- Calendario privado compartido por dos personas, con turnos de
-- mañana/tarde y horarios habituales independientes por persona.
--
-- Fechas y horas se guardan como hora local (Europe/Madrid) SIN zona
-- horaria: un turno 06:00–14:00 sigue siéndolo aunque cambie la hora
-- en marzo u octubre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table public.calendars (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Personas del calendario. user_id enlaza con la cuenta de Supabase Auth;
-- una persona puede existir sin cuenta (p. ej. antes de crearla).
-- La pertenencia al calendario = tener user_id en una fila de esta tabla,
-- y solo se gestiona desde administración (no hay políticas de escritura).
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references public.calendars (id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) > 0),
  initial       text not null check (length(initial) between 1 and 2),
  color         text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order    integer not null default 0,
  user_id       uuid unique references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (id, calendar_id)
);

create type public.shift_kind as enum ('manana', 'tarde');

-- Horario habitual por persona y tipo de turno. Solo se usa para
-- rellenar el formulario: cambiarlo no toca los turnos ya guardados.
create table public.usual_schedules (
  person_id   uuid not null references public.people (id) on delete cascade,
  kind        public.shift_kind not null,
  start_time  time(0) not null,
  end_time    time(0) not null,
  updated_at  timestamptz not null default now(),
  primary key (person_id, kind),
  check (start_time <> end_time)
);

create table public.shifts (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null,
  person_id    uuid not null,
  shift_date   date not null,                 -- fecha de inicio del turno
  kind         public.shift_kind not null,
  start_time   time(0) not null,
  end_time     time(0) not null,              -- si es < start_time, acaba al día siguiente
  version      integer not null default 1,    -- control de edición simultánea
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- La persona tiene que pertenecer al mismo calendario que el turno.
  foreign key (person_id, calendar_id) references public.people (id, calendar_id) on delete cascade,
  -- Un turno por persona y fecha (también si los dos guardáis a la vez).
  constraint shifts_one_per_person_day unique (person_id, shift_date),
  constraint shifts_distinct_times check (start_time <> end_time)
);

create index shifts_calendar_date_idx on public.shifts (calendar_id, shift_date);

-- ---------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------

create or replace function public.shifts_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- Estos campos no se cambian al editar.
  new.id          := old.id;
  new.calendar_id := old.calendar_id;
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;
  return new;
end;
$$;

create trigger shifts_touch
before update on public.shifts
for each row execute function public.shifts_touch();

create or replace function public.usual_schedules_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger usual_schedules_touch
before update on public.usual_schedules
for each row execute function public.usual_schedules_touch();

-- ---------------------------------------------------------------------
-- Funciones auxiliares para RLS
-- security definer: consultan people sin pasar por su propia política.
-- Van en el esquema «private», que la Data API no expone.
-- ---------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_calendar_member(cal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people p
    where p.calendar_id = cal and p.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_person_in_my_calendar(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people target
    join public.people me on me.calendar_id = target.calendar_id
    where target.id = person and me.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_calendar_member(uuid) from public, anon;
revoke all on function private.is_person_in_my_calendar(uuid) from public, anon;
grant execute on function private.is_calendar_member(uuid) to authenticated;
grant execute on function private.is_person_in_my_calendar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.calendars       enable row level security;
alter table public.people          enable row level security;
alter table public.usual_schedules enable row level security;
alter table public.shifts          enable row level security;

-- Calendarios y personas: solo lectura para los miembros.
create policy "miembros leen su calendario" on public.calendars
  for select to authenticated using (private.is_calendar_member(id));

create policy "miembros leen las personas" on public.people
  for select to authenticated using (private.is_calendar_member(calendar_id));

-- Horarios habituales: los miembros leen y editan los de su calendario.
create policy "miembros leen horarios" on public.usual_schedules
  for select to authenticated using (private.is_person_in_my_calendar(person_id));
create policy "miembros crean horarios" on public.usual_schedules
  for insert to authenticated with check (private.is_person_in_my_calendar(person_id));
create policy "miembros editan horarios" on public.usual_schedules
  for update to authenticated
  using (private.is_person_in_my_calendar(person_id))
  with check (private.is_person_in_my_calendar(person_id));
create policy "miembros borran horarios" on public.usual_schedules
  for delete to authenticated using (private.is_person_in_my_calendar(person_id));

-- Turnos: los miembros gestionan los de cualquier persona de su calendario.
create policy "miembros leen turnos" on public.shifts
  for select to authenticated using (private.is_calendar_member(calendar_id));
create policy "miembros crean turnos" on public.shifts
  for insert to authenticated with check (private.is_calendar_member(calendar_id));
create policy "miembros editan turnos" on public.shifts
  for update to authenticated
  using (private.is_calendar_member(calendar_id))
  with check (private.is_calendar_member(calendar_id));
create policy "miembros borran turnos" on public.shifts
  for delete to authenticated using (private.is_calendar_member(calendar_id));

-- ---------------------------------------------------------------------
-- Permisos de la Data API: nada para anon; lo justo para authenticated.
-- ---------------------------------------------------------------------

revoke all on public.calendars, public.people, public.usual_schedules, public.shifts from anon;
grant select on public.calendars, public.people to authenticated;
grant select, insert, update, delete on public.usual_schedules, public.shifts to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: avisar al otro iPhone de los cambios.
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.shifts, public.usual_schedules;
