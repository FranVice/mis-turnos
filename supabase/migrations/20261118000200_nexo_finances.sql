-- =====================================================================
-- Nexo · Economía familiar (Fase 1): caja familiar única
-- Solo AÑADE objetos nuevos: no modifica ni borra tablas existentes.
--
-- · fin_recurring: plantillas de ingresos/gastos fijos que se repiten cada mes.
-- · fin_movements: movimientos de cada mes (previsto / hecho / omitido).
--   Los generados desde una plantilla llevan recurring_id y son únicos por
--   mes: el mismo gasto fijo nunca se cuenta dos veces.
-- · Importes en céntimos (enteros, sin errores de redondeo), siempre > 0;
--   la sección indica si suma (ingreso) o resta (gasto).
-- · account_id queda preparado para varias cuentas en el futuro (sin uso aún).
-- Los dos miembros de la familia ven y editan todo.
-- =====================================================================

begin;

create table public.fin_recurring (
  id            uuid primary key default gen_random_uuid(),
  calendar_id   uuid not null references public.calendars (id) on delete cascade,
  section       text not null check (section in ('fixed_income', 'fixed_expense')),
  concept       text not null check (length(trim(concept)) between 1 and 120),
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  day_of_month  smallint check (day_of_month between 1 and 31),
  person_id     uuid,
  category      text check (category is null or length(category) <= 60),
  account_id    uuid,
  starts_on     date not null check (extract(day from starts_on) = 1),
  ends_on       date check (ends_on is null or (extract(day from ends_on) = 1 and ends_on >= starts_on)),
  version       integer not null default 1,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, calendar_id),
  foreign key (person_id, calendar_id) references public.people (id, calendar_id) on delete set null (person_id)
);

create table public.fin_movements (
  id             uuid primary key default gen_random_uuid(),
  calendar_id    uuid not null references public.calendars (id) on delete cascade,
  month          date not null check (extract(day from month) = 1),
  section        text not null check (section in ('fixed_income', 'extra_income', 'fixed_expense', 'variable_expense')),
  concept        text not null check (length(trim(concept)) between 1 and 120),
  amount_cents   bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  status         text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  movement_date  date,
  recurring_id   uuid,
  person_id      uuid,
  category       text check (category is null or length(category) <= 60),
  notes          text check (notes is null or length(notes) <= 1000),
  account_id     uuid,
  version        integer not null default 1,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (recurring_id, calendar_id) references public.fin_recurring (id, calendar_id) on delete set null (recurring_id),
  foreign key (person_id, calendar_id) references public.people (id, calendar_id) on delete set null (person_id),
  -- Un único movimiento por plantilla y mes (evita duplicados aunque los dos móviles abran el mes a la vez).
  constraint fin_movements_one_per_recurring_month unique (recurring_id, month)
);

create index fin_movements_calendar_month_idx on public.fin_movements (calendar_id, month);
create index fin_recurring_calendar_idx on public.fin_recurring (calendar_id);

-- Versión, autoría y campos inmutables al editar (común a ambas tablas).
create function public.nexo_touch() returns trigger
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

create trigger fin_recurring_touch before update on public.fin_recurring
for each row execute function public.nexo_touch();
create trigger fin_movements_touch before update on public.fin_movements
for each row execute function public.nexo_touch();

-- ---------------------------------------------------------------------
-- RLS: los miembros de la familia gestionan todo su dinero.
-- ---------------------------------------------------------------------
alter table public.fin_recurring enable row level security;
alter table public.fin_movements enable row level security;

create policy "miembros leen plantillas" on public.fin_recurring
  for select to authenticated using (private.is_calendar_member(calendar_id));
create policy "miembros crean plantillas" on public.fin_recurring
  for insert to authenticated
  with check (private.is_calendar_member(calendar_id) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "miembros editan plantillas" on public.fin_recurring
  for update to authenticated
  using (private.is_calendar_member(calendar_id)) with check (private.is_calendar_member(calendar_id));
create policy "miembros borran plantillas" on public.fin_recurring
  for delete to authenticated using (private.is_calendar_member(calendar_id));

create policy "miembros leen movimientos" on public.fin_movements
  for select to authenticated using (private.is_calendar_member(calendar_id));
create policy "miembros crean movimientos" on public.fin_movements
  for insert to authenticated
  with check (private.is_calendar_member(calendar_id) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "miembros editan movimientos" on public.fin_movements
  for update to authenticated
  using (private.is_calendar_member(calendar_id)) with check (private.is_calendar_member(calendar_id));
create policy "miembros borran movimientos" on public.fin_movements
  for delete to authenticated using (private.is_calendar_member(calendar_id));

revoke all on public.fin_recurring, public.fin_movements from anon;
revoke all on public.fin_recurring, public.fin_movements from authenticated;
grant select, insert, update, delete on public.fin_recurring, public.fin_movements to authenticated;

-- ---------------------------------------------------------------------
-- Genera los movimientos previstos de un mes a partir de las plantillas
-- activas. Idempotente: si ya existen (o se omitieron), no hace nada.
-- security invoker: se aplican las mismas reglas RLS que al usuario.
-- ---------------------------------------------------------------------
create function public.fin_generate_month(p_calendar uuid, p_month date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
  last_day integer;
begin
  if not private.is_calendar_member(p_calendar) then
    raise exception 'Sin acceso a esta familia' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'El mes debe indicarse con su día 1' using errcode = '22007';
  end if;
  last_day := extract(day from (p_month + interval '1 month' - interval '1 day'))::integer;
  insert into public.fin_movements (calendar_id, month, section, concept, amount_cents, status, recurring_id, person_id, category, account_id, movement_date)
  select r.calendar_id, p_month, r.section, r.concept, r.amount_cents, 'planned', r.id, r.person_id, r.category, r.account_id,
         case when r.day_of_month is null then null else p_month + (least(r.day_of_month, last_day) - 1) end
  from public.fin_recurring r
  where r.calendar_id = p_calendar
    and r.starts_on <= p_month
    and (r.ends_on is null or r.ends_on >= p_month)
  on conflict (recurring_id, month) do nothing;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.fin_generate_month(uuid, date) from public, anon;
grant execute on function public.fin_generate_month(uuid, date) to authenticated;

alter publication supabase_realtime add table public.fin_recurring, public.fin_movements;

commit;
