import type { SupabaseClient } from '@supabase/supabase-js';
import { toSaveError } from '../../../shared/lib/result';
import type { Movement, MovementInput, Recurring } from '../types';
import type { FinancesRepo } from './repo';

const M_COLUMNS = 'id, calendar_id, month, section, concept, amount_cents, status, movement_date, recurring_id, person_id, notes, version';
const R_COLUMNS = 'id, section, concept, amount_cents, day_of_month, person_id, starts_on, ends_on, version';

interface MRow {
  id: string;
  calendar_id: string;
  month: string;
  section: Movement['section'];
  concept: string;
  amount_cents: number | string;
  status: Movement['status'];
  movement_date: string | null;
  recurring_id: string | null;
  person_id: string | null;
  notes: string | null;
  version: number;
}
interface RRow {
  id: string;
  section: Recurring['section'];
  concept: string;
  amount_cents: number | string;
  day_of_month: number | null;
  person_id: string | null;
  starts_on: string;
  ends_on: string | null;
  version: number;
}

// bigint llega como texto o número según el cliente: siempre se convierte.
const toMovement = (r: MRow): Movement => ({
  id: r.id,
  calendarId: r.calendar_id,
  month: r.month,
  section: r.section,
  concept: r.concept,
  amountCents: Number(r.amount_cents),
  status: r.status,
  date: r.movement_date,
  recurringId: r.recurring_id,
  personId: r.person_id,
  notes: r.notes,
  version: r.version,
});
const toRecurring = (r: RRow): Recurring => ({
  id: r.id,
  section: r.section,
  concept: r.concept,
  amountCents: Number(r.amount_cents),
  dayOfMonth: r.day_of_month,
  personId: r.person_id,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  version: r.version,
});
const toRow = (i: MovementInput) => ({
  section: i.section,
  concept: i.concept.trim(),
  amount_cents: i.amountCents,
  status: i.status,
  movement_date: i.date,
  person_id: i.personId,
  notes: i.notes?.trim() || null,
});
const dayOf = (date: string | null) => (date ? Number(date.slice(8, 10)) : null);
const stale = { ok: false as const, error: { type: 'other' as const, message: 'El movimiento ha cambiado desde el otro móvil. Se ha actualizado la lista.' } };

export function createSupabaseFinancesRepo(sb: SupabaseClient, maxMonth: () => string): FinancesRepo {
  const uid = async () => (await sb.auth.getUser()).data.user?.id;

  return {
    async loadMonth(calendarId, month) {
      if (month <= maxMonth()) {
        const { error } = await sb.rpc('fin_generate_month', { p_calendar: calendarId, p_month: month });
        if (error) throw error;
      }
      const [mov, rec] = await Promise.all([
        sb.from('fin_movements').select(M_COLUMNS).eq('month', month).order('created_at').returns<MRow[]>(),
        sb.from('fin_recurring').select(R_COLUMNS).returns<RRow[]>(),
      ]);
      if (mov.error) throw mov.error;
      if (rec.error) throw rec.error;
      return { movements: (mov.data ?? []).map(toMovement), recurring: (rec.data ?? []).map(toRecurring) };
    },

    async createMovement(calendarId, month, input, repeat) {
      const me = await uid();
      let recurringId: string | null = null;
      if (repeat && (input.section === 'fixed_income' || input.section === 'fixed_expense')) {
        const { data, error } = await sb
          .from('fin_recurring')
          .insert({
            calendar_id: calendarId,
            section: input.section,
            concept: input.concept.trim(),
            amount_cents: input.amountCents,
            day_of_month: dayOf(input.date),
            person_id: input.personId,
            starts_on: month,
            created_by: me,
            updated_by: me,
          })
          .select('id')
          .single<{ id: string }>();
        if (error) return { ok: false, error: toSaveError(error) };
        recurringId = data.id;
      }
      const { data, error } = await sb
        .from('fin_movements')
        .insert({ calendar_id: calendarId, month, ...toRow(input), recurring_id: recurringId, created_by: me, updated_by: me })
        .select(M_COLUMNS)
        .single<MRow>();
      if (error) return { ok: false, error: toSaveError(error) };
      return { ok: true, value: toMovement(data) };
    },

    async updateMovement(movement, input, template) {
      const { data, error } = await sb
        .from('fin_movements')
        .update(toRow(input))
        .eq('id', movement.id)
        .eq('version', movement.version)
        .select(M_COLUMNS)
        .maybeSingle<MRow>();
      if (error) return { ok: false, error: toSaveError(error) };
      if (!data) return stale;
      if (template) {
        // La plantilla y los previstos futuros (no los ya hechos u omitidos).
        const patch = { concept: input.concept.trim(), amount_cents: input.amountCents, person_id: input.personId, day_of_month: dayOf(input.date) };
        const t = await sb.from('fin_recurring').update(patch).eq('id', template.id);
        if (t.error) return { ok: false, error: toSaveError(t.error) };
        const f = await sb
          .from('fin_movements')
          .update({ concept: patch.concept, amount_cents: patch.amount_cents, person_id: patch.person_id })
          .eq('recurring_id', template.id)
          .gt('month', movement.month)
          .eq('status', 'planned');
        if (f.error) return { ok: false, error: toSaveError(f.error) };
      }
      return { ok: true, value: toMovement(data) };
    },

    async setStatus(movement, status) {
      const { data, error } = await sb
        .from('fin_movements')
        .update({ status })
        .eq('id', movement.id)
        .eq('version', movement.version)
        .select(M_COLUMNS)
        .maybeSingle<MRow>();
      if (error) return { ok: false, error: toSaveError(error) };
      if (!data) return stale;
      return { ok: true, value: toMovement(data) };
    },

    async removeMovement(movement) {
      const q = movement.recurringId
        ? sb.from('fin_movements').update({ status: 'skipped' }).eq('id', movement.id)
        : sb.from('fin_movements').delete().eq('id', movement.id);
      const { error } = await q;
      if (error) return { ok: false, error: toSaveError(error) };
      return { ok: true, value: null };
    },

    async stopRecurring(template, month) {
      const t = await sb.from('fin_recurring').update({ ends_on: month }).eq('id', template.id);
      if (t.error) return { ok: false, error: toSaveError(t.error) };
      const d = await sb.from('fin_movements').delete().eq('recurring_id', template.id).gt('month', month).eq('status', 'planned');
      if (d.error) return { ok: false, error: toSaveError(d.error) };
      return { ok: true, value: null };
    },

    subscribe(onChange) {
      const channel = sb
        .channel('nexo-economia')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_movements' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_recurring' }, onChange)
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },
  };
}
