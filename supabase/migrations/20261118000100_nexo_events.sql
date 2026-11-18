-- =====================================================================
-- Nexo · Agenda: citas personales y familiares (Fase 1)
-- Solo AÑADE objetos nuevos: no modifica ni borra tablas existentes.
--
-- person_id null = cita familiar (de los dos); con valor = cita personal.
-- Ambos miembros ven todas las citas de la familia.
-- Fecha y horas en hora local (Europe/Madrid) sin zona, como los turnos.
-- start_time null = todo el día.
-- =====================================================================

begin;

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars (id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 200),
  person_id    uuid,
  event_date   date not null,
  start_time   time(0),
  end_time     time(0),
  location     text check (location is null or length(location) <= 200),
  notes        text check (notes is null or length(notes) <= 2000),
  version      integer not null default 1,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (person_id, calendar_id) references public.people (id, calendar_id) on delete cascade,
  -- La hora de fin exige hora de inicio y debe ser posterior (mismo día).
  constraint events_end_needs_start check (end_time is null or start_time is not null),
  constraint events_end_after_start check (end_time is null or end_time > start_time)
);

create index events_calendar_date_idx on public.events (calendar_id, event_date);

create function public.events_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version     := old.version + 1;
  new.updated_at  := now();
  new.updated_by  := auth.uid();
  new.id          := old.id;
  new.calendar_id := old.calendar_id;
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;
  return new;
end; $$;

create trigger events_touch before update on public.events
for each row execute function public.events_touch();

alter table public.events enable row level security;

create policy "miembros leen citas" on public.events
  for select to authenticated using (private.is_calendar_member(calendar_id));
create policy "miembros crean citas" on public.events
  for insert to authenticated
  with check (private.is_calendar_member(calendar_id)
              and created_by = (select auth.uid())
              and updated_by = (select auth.uid()));
create policy "miembros editan citas" on public.events
  for update to authenticated
  using (private.is_calendar_member(calendar_id))
  with check (private.is_calendar_member(calendar_id));
create policy "miembros borran citas" on public.events
  for delete to authenticated using (private.is_calendar_member(calendar_id));

revoke all on public.events from anon;
revoke all on public.events from authenticated;
grant select, insert, update, delete on public.events to authenticated;

alter publication supabase_realtime add table public.events;

commit;
