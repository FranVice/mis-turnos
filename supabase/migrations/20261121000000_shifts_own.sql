begin;
-- =====================================================================
-- Turnos propios: cada persona crea, edita y borra solo sus turnos
-- (los dos siguen viendo todos). Tipos de turno permitidos por persona
-- y horario habitual de Almudena. Migración aditiva: no borra datos.
-- =====================================================================

-- Tipos de turno que puede usar cada persona (null = todos).
alter table public.people add column shift_kinds public.shift_kind[];

update public.people
set shift_kinds = array['manana', 'tarde', 'libre', 'vacaciones']::public.shift_kind[]
where display_name = 'Almudena' and shift_kinds is null;

-- Horario habitual de Almudena (no sobrescribe uno ya configurado).
insert into public.usual_schedules (person_id, kind, start_time, end_time)
select id, k.kind, k.start_time, k.end_time
from public.people
cross join (values ('manana'::public.shift_kind, '08:00'::time, '15:00'::time),
                   ('tarde'::public.shift_kind,  '15:00'::time, '22:00'::time)) as k(kind, start_time, end_time)
where display_name = 'Almudena'
on conflict do nothing;

-- ¿La persona es la de la cuenta que hace la petición?
create function private.is_my_person(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people p
    where p.id = person and p.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_my_person(uuid) from public, anon;
grant execute on function private.is_my_person(uuid) to authenticated;

-- Escritura de turnos: solo los propios.
drop policy "miembros crean turnos" on public.shifts;
drop policy "miembros editan turnos" on public.shifts;
drop policy "miembros borran turnos" on public.shifts;

create policy "cada uno crea sus turnos" on public.shifts for insert to authenticated
with check (
  private.is_calendar_member(calendar_id)
  and private.is_my_person(person_id)
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
create policy "cada uno edita sus turnos" on public.shifts for update to authenticated
using (private.is_calendar_member(calendar_id) and private.is_my_person(person_id))
with check (private.is_calendar_member(calendar_id) and private.is_my_person(person_id));
create policy "cada uno borra sus turnos" on public.shifts for delete to authenticated
using (private.is_calendar_member(calendar_id) and private.is_my_person(person_id));

-- El tipo de turno debe estar entre los permitidos para la persona.
create function public.shifts_check_kind() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed public.shift_kind[];
begin
  select p.shift_kinds into allowed from public.people p where p.id = new.person_id;
  if allowed is not null and not (new.kind = any (allowed)) then
    raise exception 'Tipo de turno no permitido para esta persona'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger shifts_kind before insert or update of kind, person_id on public.shifts
for each row execute function public.shifts_check_kind();

commit;
