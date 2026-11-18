import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { monthOf, shiftMonth, todayISO } from '../../../shared/lib/dates';
import { supabase } from '../../../shared/lib/supabase';
import { useAppData } from '../../shifts/data/AppData';
import { monthKey } from '../logic';
import type { Movement, MovementInput, Recurring, SaveResult, Status } from '../types';
import { createDemoFinancesRepo } from './demoFinancesRepo';
import { MAX_FUTURE_MONTHS, type FinancesRepo } from './repo';
import { createSupabaseFinancesRepo } from './supabaseFinancesRepo';

interface FinancesValue {
  /** Mes seleccionado: YYYY-MM-01. */
  month: string;
  setMonth: (month: string) => void;
  movements: Movement[];
  recurringById: Map<string, Recurring>;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  createMovement: (input: MovementInput, repeat: boolean) => Promise<SaveResult<Movement>>;
  updateMovement: (m: Movement, input: MovementInput, applyToTemplate: boolean) => Promise<SaveResult<Movement>>;
  setStatus: (m: Movement, status: Status) => Promise<SaveResult<Movement>>;
  removeMovement: (m: Movement) => Promise<SaveResult<null>>;
  stopRecurring: (m: Movement) => Promise<SaveResult<null>>;
}

const Ctx = createContext<FinancesValue | null>(null);

export function useFinances() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFinances fuera de FinancesProvider');
  return v;
}

/** Último mes para el que se generan previstos automáticamente. */
const maxMonth = () => {
  const m = shiftMonth(monthOf(todayISO()), MAX_FUTURE_MONTHS);
  return monthKey(m.year, m.month);
};

const repo: FinancesRepo = supabase ? createSupabaseFinancesRepo(supabase, maxMonth) : createDemoFinancesRepo(maxMonth);

const messageOf = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /network|fetch|timeout/i.test(msg) ? 'Sin conexión. Comprueba internet y vuelve a intentarlo.' : msg;
};

export function FinancesProvider({ children }: { children: React.ReactNode }) {
  const { signedIn, userId, calendarId, today } = useAppData();
  const [month, setMonth] = useState(() => {
    const m = monthOf(today);
    return monthKey(m.year, m.month);
  });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);
  const ready = signedIn && !!userId && !!calendarId;

  const refresh = useCallback(async () => {
    if (!ready || !calendarId) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await repo.loadMonth(calendarId, month);
      if (id !== requestId.current) return;
      setMovements(data.movements);
      setRecurring(data.recurring);
      setLoadError(null);
    } catch (e) {
      if (id === requestId.current) setLoadError(messageOf(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [ready, calendarId, month]);

  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(refresh);
  }, [ready, refresh]);

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = repo.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [signedIn, refresh]);

  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { sub.remove(); document.removeEventListener('visibilitychange', visible); };
  }, [signedIn, refresh]);

  const recurringById = useMemo(() => new Map(recurring.map((r) => [r.id, r])), [recurring]);

  // Tras cada operación se recarga el mes: una plantilla puede afectar a varios movimientos.
  const run = useCallback(async <T,>(op: () => Promise<SaveResult<T>>): Promise<SaveResult<T>> => {
    try {
      const result = await op();
      await refresh();
      return result;
    } catch (e) {
      return { ok: false, error: { type: 'network', message: messageOf(e) } };
    }
  }, [refresh]);

  const noFamily = <T,>(): Promise<SaveResult<T>> =>
    Promise.resolve({ ok: false, error: { type: 'other', message: 'Tu cuenta no está vinculada a ninguna familia.' } });

  const createMovement = useCallback(
    (input: MovementInput, repeat: boolean) => (calendarId ? run(() => repo.createMovement(calendarId, month, input, repeat)) : noFamily<Movement>()),
    [calendarId, month, run],
  );
  const updateMovement = useCallback(
    (m: Movement, input: MovementInput, applyToTemplate: boolean) =>
      run(() => repo.updateMovement(m, input, applyToTemplate && m.recurringId ? recurringById.get(m.recurringId) ?? null : null)),
    [run, recurringById],
  );
  const setStatus = useCallback((m: Movement, status: Status) => run(() => repo.setStatus(m, status)), [run]);
  const removeMovement = useCallback((m: Movement) => run(() => repo.removeMovement(m)), [run]);
  const stopRecurring = useCallback((m: Movement) => {
    const template = m.recurringId ? recurringById.get(m.recurringId) : undefined;
    if (!template) return Promise.resolve<SaveResult<null>>({ ok: false, error: { type: 'other', message: 'Este movimiento no se repite.' } });
    return run(() => repo.stopRecurring(template, m.month));
  }, [run, recurringById]);

  const value = useMemo<FinancesValue>(
    () => ({ month, setMonth, movements, recurringById, loading, loadError, refresh, createMovement, updateMovement, setStatus, removeMovement, stopRecurring }),
    [month, movements, recurringById, loading, loadError, refresh, createMovement, updateMovement, setStatus, removeMovement, stopRecurring],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
