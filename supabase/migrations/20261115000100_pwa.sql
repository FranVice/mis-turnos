begin;
-- Conserva las columnas locales y los datos anteriores; añade instantes reales.
alter table public.shifts add column start_at timestamptz;
alter table public.shifts add column end_at timestamptz;
alter table public.shifts drop constraint shifts_distinct_times;
alter table public.shifts add constraint shifts_valid_hours check (
  kind in ('libre', 'vacaciones', 'otro') or start_time <> end_time
);

create function public.shifts_set_instants() returns trigger
language plpgsql set search_path = '' as $$
declare local_start timestamp; local_end timestamp;
begin
  if new.kind in ('libre', 'vacaciones', 'otro') then
    new.start_time := '00:00'; new.end_time := '00:00';
    local_start := new.shift_date::timestamp;
    local_end := (new.shift_date + 1)::timestamp;
  else
    local_start := new.shift_date + new.start_time;
    local_end := (new.shift_date + case when new.end_time < new.start_time then 1 else 0 end) + new.end_time;
  end if;
  new.start_at := local_start at time zone 'Europe/Madrid';
  new.end_at := local_end at time zone 'Europe/Madrid';
  -- Rechaza horas inexistentes al adelantar el reloj en marzo.
  if new.start_at at time zone 'Europe/Madrid' <> local_start
     or new.end_at at time zone 'Europe/Madrid' <> local_end then
    raise exception 'Hora inexistente por el cambio de horario de Europe/Madrid' using errcode = '22007';
  end if;
  if new.end_at <= new.start_at then
    raise exception 'La salida debe ser posterior a la entrada' using errcode = '22007';
  end if;
  return new;
end; $$;
create trigger shifts_instants before insert or update on public.shifts
for each row execute function public.shifts_set_instants();
-- Backfill sin ejecutar shifts_touch: conserva versiones y autoría anteriores.
alter table public.shifts disable trigger shifts_touch;
update public.shifts set start_at = shift_date::timestamp at time zone 'Europe/Madrid';
alter table public.shifts enable trigger shifts_touch;
alter table public.shifts alter column start_at set not null;
alter table public.shifts alter column end_at set not null;
alter table public.shifts add constraint shifts_ordered_instants check (end_at > start_at);

-- Serializa escrituras por persona y rechaza solapamientos entre días.
create function public.shifts_check_overlap() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.people where id = new.person_id for update;
  if new.kind not in ('libre', 'vacaciones', 'otro') and exists (
    select 1 from public.shifts s where s.person_id = new.person_id and s.id <> new.id and s.shift_date <> new.shift_date
    and s.kind not in ('libre', 'vacaciones', 'otro')
    and s.start_at < new.end_at and s.end_at > new.start_at
  ) then
    raise exception 'El horario se solapa con otro turno de esta persona' using errcode = '23P01';
  end if;
  return new;
end; $$;
-- Se ejecuta después de shifts_instants (orden alfabético de triggers).
create trigger shifts_overlap before insert or update on public.shifts
for each row execute function public.shifts_check_overlap();

-- La pertenencia continúa siendo administrativa. Solo se concede UPDATE(color).
revoke all on public.calendars, public.people from authenticated;
grant select on public.calendars, public.people to authenticated;
grant update (color) on public.people to authenticated;
create policy "miembros cambian colores" on public.people for update to authenticated
using (private.is_calendar_member(calendar_id)) with check (private.is_calendar_member(calendar_id));
-- No se puede falsificar autoría al crear turnos.
drop policy "miembros crean turnos" on public.shifts;
create policy "miembros crean turnos" on public.shifts for insert to authenticated
with check (private.is_calendar_member(calendar_id) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
-- Plantilla ausente: no sobrescribe horarios configurados.
insert into public.usual_schedules(person_id, kind, start_time, end_time)
select id, 'noche', '22:00', '06:00' from public.people where display_name = 'Franklin'
on conflict do nothing;
-- Activar también cambios de colores (solo lectura permitida por RLS).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='people') then
    alter publication supabase_realtime add table public.people;
  end if;
end $$;
commit;
