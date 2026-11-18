import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTime } from '../../../shared/lib/dates';
import { toSaveError } from '../../../shared/lib/result';
import type { CalEvent, EventInput } from '../types';
import type { EventsRepo } from './repo';

const COLUMNS = 'id, calendar_id, title, person_id, event_date, start_time, end_time, location, notes, version, created_by';

interface EventRow {
  id: string;
  calendar_id: string;
  title: string;
  person_id: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  version: number;
  created_by: string | null;
}

const toEvent = (r: EventRow): CalEvent => ({
  id: r.id,
  calendarId: r.calendar_id,
  title: r.title,
  personId: r.person_id,
  date: r.event_date,
  start: r.start_time ? normalizeTime(r.start_time) : null,
  end: r.end_time ? normalizeTime(r.end_time) : null,
  location: r.location,
  notes: r.notes,
  version: r.version,
  createdBy: r.created_by,
});

const toRow = (i: EventInput) => ({
  title: i.title.trim(),
  person_id: i.personId,
  event_date: i.date,
  start_time: i.start,
  end_time: i.start ? i.end : null,
  location: i.location?.trim() || null,
  notes: i.notes?.trim() || null,
});

export function createSupabaseEventsRepo(sb: SupabaseClient): EventsRepo {
  return {
    async loadRange(from, to) {
      const { data, error } = await sb
        .from('events')
        .select(COLUMNS)
        .gte('event_date', from)
        .lte('event_date', to)
        .order('event_date')
        .order('start_time', { nullsFirst: true })
        .returns<EventRow[]>();
      if (error) throw error;
      return (data ?? []).map(toEvent);
    },

    async createEvent(calendarId, input) {
      const { data: userData } = await sb.auth.getUser();
      const uid = userData.user?.id;
      const { data, error } = await sb
        .from('events')
        .insert({ calendar_id: calendarId, ...toRow(input), created_by: uid, updated_by: uid })
        .select(COLUMNS)
        .single<EventRow>();
      if (error) return { ok: false, error: toSaveError(error) };
      return { ok: true, value: toEvent(data) };
    },

    async updateEvent(event, input) {
      const { data, error } = await sb
        .from('events')
        .update(toRow(input))
        .eq('id', event.id)
        .eq('version', event.version)
        .select(COLUMNS)
        .maybeSingle<EventRow>();
      if (error) return { ok: false, error: toSaveError(error) };
      if (!data) return { ok: false, error: { type: 'other', message: 'La cita ha cambiado o se ha borrado desde el otro móvil. Se ha actualizado la agenda.' } };
      return { ok: true, value: toEvent(data) };
    },

    async deleteEvent(event) {
      const { error } = await sb.from('events').delete().eq('id', event.id);
      if (error) return { ok: false, error: toSaveError(error) };
      return { ok: true, value: null };
    },

    subscribe(onChange) {
      const channel = sb
        .channel('nexo-agenda')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },
  };
}
