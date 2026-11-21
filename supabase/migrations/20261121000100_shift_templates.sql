begin;
-- =====================================================================
-- Turnos con nombre («Partido 09:00–13:00»): plantillas propias de cada
-- persona con un tipo base (mañana/tarde/noche) que da letra y color en
-- el calendario. El turno guarda una copia del nombre (label), así que
-- cambiar o borrar la plantilla no altera los turnos ya creados.
-- Migración aditiva: no borra datos.
-- =====================================================================

alter table public.shifts add column label text
  check (label is null or length(trim(label)) between 1 and 40);

create table public.shift_templates (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40),
  kind        public.shift_kind not null check (kind in ('manana', 'tarde', 'noche')),
  start_time  time(0) not null,
  end_time    time(0) not null,
  created_at  timestamptz not null default now(),
  check (start_time <> end_time)
);

-- Sin nombres repetidos por persona (sin distinguir mayúsculas).
create unique index shift_templates_person_name on public.shift_templates (person_id, lower(trim(name)));

-- El tipo base debe estar permitido para la persona (misma regla que los turnos).
create trigger shift_templates_kind before insert or update of kind, person_id on public.shift_templates
for each row execute function public.shifts_check_kind();

-- Cada persona ve y gestiona solo sus plantillas.
alter table public.shift_templates enable row level security;
create policy "cada uno lee sus plantillas" on public.shift_templates for select to authenticated
using (private.is_my_person(person_id));
create policy "cada uno crea sus plantillas" on public.shift_templates for insert to authenticated
with check (private.is_my_person(person_id));
create policy "cada uno edita sus plantillas" on public.shift_templates for update to authenticated
using (private.is_my_person(person_id)) with check (private.is_my_person(person_id));
create policy "cada uno borra sus plantillas" on public.shift_templates for delete to authenticated
using (private.is_my_person(person_id));

revoke all on public.shift_templates from anon;
grant select, insert, update, delete on public.shift_templates to authenticated;

alter publication supabase_realtime add table public.shift_templates;

commit;
