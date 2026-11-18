-- =====================================================================
-- Nexo · Módulo Tareas (Fase 1)
-- Solo AÑADE objetos nuevos: no modifica ni borra tablas existentes.
--
-- «calendars» actúa como la familia (hogar) y «people» como sus miembros.
-- Una tarea sin responsable (assignee_person_id null) es «de los dos».
-- =====================================================================

begin;

create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  calendar_id         uuid not null references public.calendars (id) on delete cascade,
  title               text not null check (length(trim(title)) between 1 and 200),
  notes               text check (notes is null or length(notes) <= 2000),
  -- null = los dos. Si hay responsable, debe ser de la misma familia.
  assignee_person_id  uuid,
  due_date            date,                         -- opcional
  done_at             timestamptz,                  -- null = pendiente
  done_by             uuid references auth.users (id) on delete set null,
  version             integer not null default 1,   -- control de edición simultánea
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (assignee_person_id, calendar_id) references public.people (id, calendar_id) on delete cascade
);

create index tasks_calendar_pending_idx on public.tasks (calendar_id, done_at, due_date);

-- Versión, autoría y campos inmutables al editar; done_by sigue a done_at.
create function public.tasks_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version     := old.version + 1;
  new.updated_at  := now();
  new.updated_by  := auth.uid();
  new.id          := old.id;
  new.calendar_id := old.calendar_id;
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;
  if new.done_at is null then
    new.done_by := null;
  elsif old.done_at is null then
    new.done_by := auth.uid();
  else
    new.done_by := old.done_by;
  end if;
  return new;
end; $$;

create trigger tasks_touch before update on public.tasks
for each row execute function public.tasks_touch();

-- Al crear una tarea ya completada, se registra quién la completó.
create function public.tasks_insert_done() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.done_by := case when new.done_at is null then null else auth.uid() end;
  return new;
end; $$;

create trigger tasks_insert_done before insert on public.tasks
for each row execute function public.tasks_insert_done();

-- ---------------------------------------------------------------------
-- RLS: los miembros de la familia gestionan todas sus tareas.
-- ---------------------------------------------------------------------
alter table public.tasks enable row level security;

create policy "miembros leen tareas" on public.tasks
  for select to authenticated using (private.is_calendar_member(calendar_id));
create policy "miembros crean tareas" on public.tasks
  for insert to authenticated
  with check (private.is_calendar_member(calendar_id)
              and created_by = (select auth.uid())
              and updated_by = (select auth.uid()));
create policy "miembros editan tareas" on public.tasks
  for update to authenticated
  using (private.is_calendar_member(calendar_id))
  with check (private.is_calendar_member(calendar_id));
create policy "miembros borran tareas" on public.tasks
  for delete to authenticated using (private.is_calendar_member(calendar_id));

revoke all on public.tasks from anon;
revoke all on public.tasks from authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

-- Realtime: avisar al otro móvil.
alter publication supabase_realtime add table public.tasks;

commit;
