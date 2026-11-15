import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { MonthRef, monthOf, monthRange, todayISO } from '../lib/dates';
import { isDemo, supabase } from '../lib/supabase';
import type {
  BulkResult,
  Person,
  SaveResult,
  Shift,
  ShiftInput,
  ShiftKind,
  UsualSchedule,
} from '../lib/types';
import { createDemoRepo, DEMO_USER_ID } from './demoRepo';
import type { Repo } from './repo';
import { createSupabaseRepo } from './supabaseRepo';

interface AppDataValue {
  saveColor: (personId: string, color: string) => Promise<SaveResult<null>>;
  recovering: boolean;
  online: boolean;
  finishRecovery: () => void;
  isDemo: boolean;
  // Sesión
  authReady: boolean;
  signedIn: boolean;
  userId: string | null;
  signOut: () => Promise<void>;
  // Datos
  people: Person[];
  me: Person | null;
  personById: (id: string | null | undefined) => Person | undefined;
  personByUser: (userId: string | null | undefined) => Person | undefined;
  calendarId: string | null;
  schedules: UsualSchedule[];
  scheduleFor: (personId: string, kind: ShiftKind) => UsualSchedule | undefined;
  today: string;
  month: MonthRef;
  setMonth: (m: MonthRef) => void;
  shiftsByDate: Map<string, Shift[]>;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  // Acciones (confirman cuando el servidor lo ha registrado)
  createShift: (date: string, input: ShiftInput) => Promise<SaveResult<Shift>>;
  createShifts: (dates: string[], input: ShiftInput) => Promise<SaveResult<BulkResult>>;
  updateShift: (shift: Shift, input: ShiftInput) => Promise<SaveResult<Shift>>;
  deleteShift: (shift: Shift) => Promise<SaveResult<null>>;
  saveSchedule: (s: UsualSchedule) => Promise<SaveResult<UsualSchedule>>;
  deleteSchedule: (personId: string, kind: ShiftKind) => Promise<SaveResult<null>>;
}

const Ctx = createContext<AppDataValue | null>(null);

export function useAppData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData fuera de AppDataProvider');
  return v;
}

const repo: Repo = supabase ? createSupabaseRepo(supabase) : createDemoRepo();

function messageOf(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/network|fetch|timeout/i.test(msg)) return 'Sin conexión. Comprueba internet y vuelve a intentarlo.';
  return msg;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // ---------- Sesión ----------
  const [recovering, setRecovering] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(isDemo);

  // ---------- Datos ----------
  const [people, setPeople] = useState<Person[]>([]);
  const [schedules, setSchedules] = useState<UsualSchedule[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [today, setToday] = useState(todayISO());
  const [month, setMonth] = useState<MonthRef>(() => monthOf(todayISO()));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const monthRef = useRef(month);
  useEffect(() => { monthRef.current = month; }, [month]);
  const requestId = useRef(0);
  const sessionEpoch = useRef(0);
  const sessionUser = useRef<string | null>(null);
  const [online, setOnline] = useState(() => Platform.OS !== 'web' || typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    const acceptSession = (next: Session | null) => {
      if (disposed) return;
      const nextUser = next?.user.id ?? null;
      if (sessionUser.current !== nextUser) {
        sessionUser.current = nextUser;
        ++sessionEpoch.current;
        ++requestId.current;
        setPeople([]);
        setSchedules([]);
        setShifts([]);
        setLoadError(null);
        setLoading(false);
      }
      if (!next) setRecovering(false);
      setSession(next);
      setAuthReady(true);
    };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      acceptSession(next);
      if (!disposed && event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    void supabase.auth.getSession().then(({ data }) => acceptSession(data.session))
      .catch(() => { if (!disposed) setAuthReady(true); });
    return () => { disposed = true; data.subscription.unsubscribe(); };
  }, []);

  // Supabase recomienda refrescar el token solo con la app en primer plano.
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    if (AppState.currentState === 'active') sb.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sb.auth.startAutoRefresh();
      else sb.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, []);

  const userId = isDemo ? DEMO_USER_ID : (session?.user.id ?? null);
  const signedIn = isDemo || !!session;

  const signOut = useCallback(async () => {
    if (supabase) { const {error} = await supabase.auth.signOut(); if (error) throw error; }
    ++requestId.current;
    setPeople([]); setSchedules([]); setShifts([]); setRecovering(false);
  }, []);



  const refresh = useCallback(async () => {
    if (!signedIn || (!isDemo && !userId)) return;
    const id = ++requestId.current;
    const { from, to } = monthRange(monthRef.current);
    setLoading(true);
    try {
      const [p, s, sh] = await Promise.all([repo.loadPeople(), repo.loadSchedules(), repo.loadShifts(from, to)]);
      if (id !== requestId.current) return; // llegó una consulta más reciente
      setPeople(p);
      setSchedules(s);
      setShifts(sh);
      setLoadError(null);
    } catch (e) {
      if (id === requestId.current) setLoadError(messageOf(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [signedIn, userId]);

  // Al entrar y al cambiar de mes.
  useEffect(() => {
    if (!signedIn) {
      ++requestId.current;
      return;
    }
    // Carga inicial del mes desde el repositorio externo.
    void Promise.resolve().then(refresh);
  }, [signedIn, month, refresh]);

  // Cambios desde el otro iPhone (con un pequeño margen para agrupar varios).
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

  // Al volver a la app: actualizar «hoy» y volver a consultar.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setToday(todayISO());
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (!signedIn || Platform.OS !== 'web') return;
    const reload = () => { setToday(todayISO()); void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('focus', reload);
    window.addEventListener('online', reload);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    return () => { clearInterval(timer); window.removeEventListener('focus', reload); window.removeEventListener('online', reload); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); document.removeEventListener('visibilitychange', visible); };
  }, [signedIn, refresh]);

  // ---------- Derivados ----------
  const personById = useCallback((id: string | null | undefined) => people.find((p) => p.id === id), [people]);
  const personByUser = useCallback(
    (uid: string | null | undefined) => (uid ? people.find((p) => p.userId === uid) : undefined),
    [people],
  );
  const me = useMemo(() => personByUser(userId) ?? null, [personByUser, userId]);
  const calendarId = me?.calendarId ?? people[0]?.calendarId ?? null;
  const scheduleFor = useCallback(
    (personId: string, kind: ShiftKind) => schedules.find((s) => s.personId === personId && s.kind === kind),
    [schedules],
  );

  const shiftsByDate = useMemo(() => {
    const order = new Map(people.map((p, i) => [p.id, i]));
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => (order.get(a.personId) ?? 0) - (order.get(b.personId) ?? 0));
    return map;
  }, [shifts, people]);

  // ---------- Acciones ----------
  const noCalendar = <T,>(): SaveResult<T> => ({
    ok: false,
    error: { type: 'other', message: 'Tu cuenta no está vinculada a ningún calendario.' },
  });

  // Una respuesta de otra sesión o una lectura anterior al guardado no reemplaza datos nuevos.
  const mutate = useCallback(async <T,>(
    operation: () => Promise<SaveResult<T>>,
    apply: (value: T) => void | Promise<void>,
  ): Promise<SaveResult<T>> => {
    const epoch = sessionEpoch.current;
    try {
      const result = await operation();
      if (epoch !== sessionEpoch.current) {
        return { ok: false, error: { type: 'other', message: 'La sesión ha cambiado. Vuelve a abrir el calendario.' } };
      }
      if (result.ok) {
        ++requestId.current;
        setLoading(false);
        await apply(result.value);
      }
      return result;
    } catch (error) {
      return { ok: false, error: { type: 'network', message: messageOf(error) } };
    }
  }, []);

  const createShift = useCallback(async (date: string, input: ShiftInput) => {
    if (!calendarId) return noCalendar<Shift>();
    return mutate(() => repo.createShift(calendarId, date, input), value => {
      setShifts(prev => [...prev.filter(s => s.id !== value.id), value]);
    });
  }, [calendarId, mutate]);

  const createShifts = useCallback(async (dates: string[], input: ShiftInput) => {
    if (!calendarId) return noCalendar<BulkResult>();
    return mutate(() => repo.createShifts(calendarId, dates, input), () => refresh());
  }, [calendarId, mutate, refresh]);

  const updateShift = useCallback((shift: Shift, input: ShiftInput) =>
    mutate(() => repo.updateShift(shift, input), value => {
      setShifts(prev => prev.map(s => s.id === shift.id ? value : s));
    }), [mutate]);

  const deleteShift = useCallback((shift: Shift) =>
    mutate(() => repo.deleteShift(shift), () => {
      setShifts(prev => prev.filter(s => s.id !== shift.id));
    }), [mutate]);

  const saveSchedule = useCallback((schedule: UsualSchedule) =>
    mutate(() => repo.saveSchedule(schedule), () => {
      setSchedules(prev => prev.filter(s => !(s.personId === schedule.personId && s.kind === schedule.kind)).concat(schedule));
    }), [mutate]);

  const deleteSchedule = useCallback((personId: string, kind: ShiftKind) =>
    mutate(() => repo.deleteSchedule(personId, kind), () => {
      setSchedules(prev => prev.filter(s => !(s.personId === personId && s.kind === kind)));
    }), [mutate]);

  const saveColor = useCallback((personId: string, color: string) =>
    mutate(() => repo.saveColor(personId, color), () => {
      setPeople(prev => prev.map(p => p.id === personId ? {...p, color} : p));
    }), [mutate]);
  const value: AppDataValue = {
    saveColor, online, recovering, finishRecovery: () => setRecovering(false),
    isDemo,
    authReady,
    signedIn,
    userId,
    signOut,
    people,
    me,
    personById,
    personByUser,
    calendarId,
    schedules,
    scheduleFor,
    today,
    month,
    setMonth,
    shiftsByDate,
    loading,
    loadError,
    refresh,
    createShift,
    createShifts,
    updateShift,
    deleteShift,
    saveSchedule,
    deleteSchedule,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
