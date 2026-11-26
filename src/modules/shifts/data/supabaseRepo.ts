import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { addDays, normalizeTime } from '../../../shared/lib/dates';
import type { Person, SaveError, SaveResult, Shift, ShiftTemplate, UsualSchedule } from '../types';
import type { Repo } from './repo';

const SHIFT_COLUMNS = 'id, calendar_id, person_id, shift_date, kind, start_time, end_time, version, updated_by, label';
const TEMPLATE_COLUMNS = 'id, person_id, name, kind, start_time, end_time';

interface TemplateRow {
  id: string;
  person_id: string;
  name: string;
  kind: ShiftTemplate['kind'];
  start_time: string;
  end_time: string;
}

const toTemplate = (r: TemplateRow): ShiftTemplate => ({
  id: r.id,
  personId: r.person_id,
  name: r.name,
  kind: r.kind,
  start: normalizeTime(r.start_time),
  end: normalizeTime(r.end_time),
});

interface ShiftRow {
  id: string;
  calendar_id: string;
  person_id: string;
  shift_date: string;
  kind: Shift['kind'];
  start_time: string;
  end_time: string;
  version: number;
  updated_by: string | null;
  label: string | null;
}

function toShift(r: ShiftRow): Shift {
  return {
    id: r.id,
    calendarId: r.calendar_id,
    personId: r.person_id,
    date: r.shift_date,
    kind: r.kind,
    start: normalizeTime(r.start_time),
    end: normalizeTime(r.end_time),
    version: r.version,
    updatedBy: r.updated_by,
    label: r.label ?? null,
  };
}

function isNetworkError(message: string) {
  return /network|fetch|timeout|offline|Failed to fetch/i.test(message);
}

function toError(error: PostgrestError | Error | null | undefined): SaveError {
  const message = error?.message ?? 'Error desconocido';
  if (isNetworkError(message)) return { type: 'network', message };
  return { type: 'other', message };
}

async function fail<T>(error: SaveError): Promise<SaveResult<T>> {
  return { ok: false, error };
}

export function createSupabaseRepo(sb: SupabaseClient): Repo {
  async function findShift(personId: string, date: string): Promise<Shift | null> {
    const { data } = await sb
      .from('shifts')
      .select(SHIFT_COLUMNS)
      .eq('person_id', personId)
      .eq('shift_date', date)
      .maybeSingle<ShiftRow>();
    return data ? toShift(data) : null;
  }

  async function getShift(id: string): Promise<Shift | null> {
    const { data } = await sb.from('shifts').select(SHIFT_COLUMNS).eq('id', id).maybeSingle<ShiftRow>();
    return data ? toShift(data) : null;
  }

  return {
    async saveColor(personId, color) {
      const { data, error } = await sb.from('people').update({color}).eq('id', personId).select('id');
      if (error) return fail(toError(error));
      if (!data?.length) return fail({type: 'other', message: 'Sin permiso para cambiar el color.'});
      return {ok: true, value: null};
    },
    async loadPeople() {
      const { data, error } = await sb
        .from('people')
        .select('id, calendar_id, display_name, initial, color, user_id, shift_kinds')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []).map(
        (r): Person => ({
          id: r.id,
          calendarId: r.calendar_id,
          name: r.display_name,
          initial: r.initial,
          color: r.color,
          userId: r.user_id,
          shiftKinds: r.shift_kinds ?? null,
        }),
      );
    },

    async loadSpace() {
      const { data, error } = await sb.from('calendars').select('id, name, kind').limit(1).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, name: data.name, kind: data.kind === 'family' ? 'family' : 'shifts' } : null;
    },

    async amIAdmin() {
      const { data, error } = await sb.rpc('am_i_admin');
      if (error) return false;
      return data === true;
    },

    async loadSchedules() {
      const { data, error } = await sb.from('usual_schedules').select('person_id, kind, start_time, end_time');
      if (error) throw error;
      return (data ?? []).map(
        (r): UsualSchedule => ({
          personId: r.person_id,
          kind: r.kind,
          start: normalizeTime(r.start_time),
          end: normalizeTime(r.end_time),
        }),
      );
    },

    async loadShifts(from, to) {
      const { data, error } = await sb
        .from('shifts')
        .select(SHIFT_COLUMNS)
        .gte('shift_date', addDays(from, -1))
        .lte('shift_date', to)
        .returns<ShiftRow[]>();
      if (error) throw error;
      return (data ?? []).map(toShift);
    },

    async createShift(calendarId, date, input) {
      const { data, error } = await sb
        .from('shifts')
        .insert({
          calendar_id: calendarId,
          person_id: input.personId,
          shift_date: date,
          kind: input.kind,
          start_time: input.start,
          end_time: input.end,
          label: input.label ?? null,
        })
        .select(SHIFT_COLUMNS)
        .single<ShiftRow>();
      if (error) {
        if (error.code === '23505') {
          return fail({ type: 'duplicate', existing: await findShift(input.personId, date) });
        }
        return fail(toError(error));
      }
      return { ok: true, value: toShift(data) };
    },

    async createShifts(calendarId, dates, input) {
      // Una sola sentencia: inserta los días libres y omite los que ya
      // tienen turno, aunque el otro móvil esté guardando a la vez.
      const rows = dates.map((d) => ({
        calendar_id: calendarId,
        person_id: input.personId,
        shift_date: d,
        kind: input.kind,
        start_time: input.start,
        end_time: input.end,
        label: input.label ?? null,
      }));
      const { data, error } = await sb
        .from('shifts')
        .upsert(rows, { onConflict: 'person_id,shift_date', ignoreDuplicates: true })
        .select('shift_date');
      if (error) return fail(toError(error));
      const saved = (data ?? []).map((r: { shift_date: string }) => r.shift_date);
      const skipped = dates.filter((d) => !saved.includes(d));
      return { ok: true, value: { saved, skipped } };
    },

    async updateShift(shift, input) {
      // Solo se actualiza si nadie lo ha cambiado desde que se abrió.
      const { data, error } = await sb
        .from('shifts')
        .update({
          person_id: input.personId,
          kind: input.kind,
          start_time: input.start,
          end_time: input.end,
          label: input.label ?? null,
        })
        .eq('id', shift.id)
        .eq('version', shift.version)
        .select(SHIFT_COLUMNS)
        .returns<ShiftRow[]>();
      if (error) {
        if (error.code === '23505') {
          return fail({ type: 'duplicate', existing: await findShift(input.personId, shift.date) });
        }
        return fail(toError(error));
      }
      if (!data || data.length === 0) {
        return fail({ type: 'stale', current: await getShift(shift.id) });
      }
      return { ok: true, value: toShift(data[0]) };
    },

    async deleteShift(shift) {
      const { data, error } = await sb.from('shifts').delete().eq('id', shift.id).eq('version', shift.version).select('id');
      if (error) return fail(toError(error));
      if (!data?.length) return fail({type: 'stale', current: await getShift(shift.id)});
      return { ok: true, value: null };
    },

    async saveSchedule(s) {
      const { error } = await sb
        .from('usual_schedules')
        .upsert({ person_id: s.personId, kind: s.kind, start_time: s.start, end_time: s.end });
      if (error) return fail(toError(error));
      return { ok: true, value: s };
    },

    async deleteSchedule(personId, kind) {
      const { error } = await sb.from('usual_schedules').delete().eq('person_id', personId).eq('kind', kind);
      if (error) return fail(toError(error));
      return { ok: true, value: null };
    },

    async loadTemplates() {
      const { data, error } = await sb.from('shift_templates').select(TEMPLATE_COLUMNS).order('name').returns<TemplateRow[]>();
      if (error) throw error;
      return (data ?? []).map(toTemplate);
    },

    async createTemplate(t) {
      const { data, error } = await sb
        .from('shift_templates')
        .insert({ person_id: t.personId, name: t.name.trim(), kind: t.kind, start_time: t.start, end_time: t.end })
        .select(TEMPLATE_COLUMNS)
        .single<TemplateRow>();
      if (error) {
        if (error.code === '23505') return fail({ type: 'other', message: 'Ya tienes un turno con ese nombre' });
        return fail(toError(error));
      }
      return { ok: true, value: toTemplate(data) };
    },

    async deleteTemplate(id) {
      const { data, error } = await sb.from('shift_templates').delete().eq('id', id).select('id');
      if (error) return fail(toError(error));
      if (!data?.length) return fail({ type: 'other', message: 'Ese turno con nombre ya no existe' });
      return { ok: true, value: null };
    },

    subscribe(onChange) {
      const channel = sb
        .channel('nuestros-turnos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'usual_schedules' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_templates' }, onChange)
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },
  };
}
