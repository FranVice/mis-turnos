import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { addDays } from '../../../shared/lib/dates';
import { supabase } from '../../../shared/lib/supabase';
import { useAppData } from '../../shifts/data/AppData';
import type { CalEvent, EventInput, SaveResult } from '../types';
import { createDemoEventsRepo } from './demoEventsRepo';
import type { EventsRepo } from './repo';
import { createSupabaseEventsRepo } from './supabaseEventsRepo';

/** Días hacia delante que se mantienen cargados para Inicio. */
export const UPCOMING_DAYS = 30;

interface EventsValue {
  /** Citas de hoy a UPCOMING_DAYS, ordenadas. */
  upcoming: CalEvent[];
  upcomingError: string | null;
  /** Cambia cada vez que se guarda algo o llega un cambio del otro móvil. */
  revision: number;
  loadRange: (from: string, to: string) => Promise<CalEvent[]>;
  refresh: () => Promise<void>;
  createEvent: (input: EventInput) => Promise<SaveResult<CalEvent>>;
  updateEvent: (event: CalEvent, input: EventInput) => Promise<SaveResult<CalEvent>>;
  deleteEvent: (event: CalEvent) => Promise<SaveResult<null>>;
}

const Ctx = createContext<EventsValue | null>(null);

export function useEvents() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEvents fuera de EventsProvider');
  return v;
}

const repo: EventsRepo = supabase ? createSupabaseEventsRepo(supabase) : createDemoEventsRepo();

export const compareEvents = (a: CalEvent, b: CalEvent) =>
  a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.start ?? '').localeCompare(b.start ?? '');

const messageOf = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /network|fetch|timeout/i.test(msg) ? 'Sin conexión. Comprueba internet y vuelve a intentarlo.' : msg;
};

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const { signedIn, userId, calendarId, today } = useAppData();
  const [upcoming, setUpcoming] = useState<CalEvent[]>([]);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const ready = signedIn && !!userId;

  const loadRange = useCallback(async (from: string, to: string) => (ready ? repo.loadRange(from, to) : []), [ready]);

  const refresh = useCallback(async () => {
    if (!ready) return;
    const id = ++requestId.current;
    try {
      const list = await repo.loadRange(today, addDays(today, UPCOMING_DAYS));
      if (id !== requestId.current) return;
      setUpcoming(list.sort(compareEvents));
      setUpcomingError(null);
    } catch (e) {
      if (id === requestId.current) setUpcomingError(messageOf(e));
    }
  }, [ready, today]);

  const changed = useCallback(() => {
    setRevision((r) => r + 1);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    ++requestId.current;
    if (!ready) return;
    void Promise.resolve().then(refresh);
  }, [ready, refresh]);

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = repo.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(changed, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [signedIn, changed]);

  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') changed();
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const visible = () => { if (document.visibilityState === 'visible') changed(); };
    document.addEventListener('visibilitychange', visible);
    return () => { sub.remove(); document.removeEventListener('visibilitychange', visible); };
  }, [signedIn, changed]);

  const run = useCallback(async <T,>(op: () => Promise<SaveResult<T>>): Promise<SaveResult<T>> => {
    try {
      const result = await op();
      changed(); // tanto si guarda como si hubo conflicto, se recarga
      return result;
    } catch (e) {
      return { ok: false, error: { type: 'network', message: messageOf(e) } };
    }
  }, [changed]);

  const createEvent = useCallback((input: EventInput) => {
    if (!calendarId) {
      return Promise.resolve<SaveResult<CalEvent>>({ ok: false, error: { type: 'other', message: 'Tu cuenta no está vinculada a ninguna familia.' } });
    }
    return run(() => repo.createEvent(calendarId, input));
  }, [calendarId, run]);
  const updateEvent = useCallback((event: CalEvent, input: EventInput) => run(() => repo.updateEvent(event, input)), [run]);
  const deleteEvent = useCallback((event: CalEvent) => run(() => repo.deleteEvent(event)), [run]);

  const value = useMemo<EventsValue>(
    () => ({ upcoming, upcomingError, revision, loadRange, refresh, createEvent, updateEvent, deleteEvent }),
    [upcoming, upcomingError, revision, loadRange, refresh, createEvent, updateEvent, deleteEvent],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
