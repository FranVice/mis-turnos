import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../../../shared/lib/supabase';
import { useAppData } from '../../shifts/data/AppData';
import type { SaveResult, Task, TaskInput } from '../types';
import { createDemoTasksRepo } from './demoTasksRepo';
import type { TasksRepo } from './repo';
import { createSupabaseTasksRepo } from './supabaseTasksRepo';

interface TasksValue {
  tasks: Task[];
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  createTask: (input: TaskInput) => Promise<SaveResult<Task>>;
  updateTask: (task: Task, input: TaskInput) => Promise<SaveResult<Task>>;
  setDone: (task: Task, done: boolean) => Promise<SaveResult<Task>>;
  deleteTask: (task: Task) => Promise<SaveResult<null>>;
}

const Ctx = createContext<TasksValue | null>(null);

export function useTasks() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTasks fuera de TasksProvider');
  return v;
}

const repo: TasksRepo = supabase ? createSupabaseTasksRepo(supabase) : createDemoTasksRepo();

const messageOf = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /network|fetch|timeout/i.test(msg) ? 'Sin conexión. Comprueba internet y vuelve a intentarlo.' : msg;
};

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { signedIn, userId, calendarId } = useAppData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!signedIn || !userId) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const list = await repo.loadTasks();
      if (id !== requestId.current) return;
      setTasks(list);
      setLoadError(null);
    } catch (e) {
      if (id === requestId.current) setLoadError(messageOf(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [signedIn, userId]);

  // Carga inicial y al cambiar de cuenta.
  useEffect(() => {
    ++requestId.current;
    if (!signedIn || !userId) return;
    void Promise.resolve().then(refresh);
  }, [signedIn, userId, refresh]);

  // Cambios desde el otro móvil.
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

  // Al volver a la app o a la pestaña del navegador.
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

  // Tras guardar, se aplica la respuesta del servidor. Si hubo conflicto, se recarga.
  const run = useCallback(async <T,>(op: () => Promise<SaveResult<T>>, apply: (v: T) => void): Promise<SaveResult<T>> => {
    try {
      const result = await op();
      if (result.ok) {
        ++requestId.current; // descarta lecturas en curso anteriores al guardado
        setLoading(false);
        apply(result.value);
      } else void refresh();
      return result;
    } catch (e) {
      return { ok: false, error: { type: 'network', message: messageOf(e) } };
    }
  }, [refresh]);

  const replace = (value: Task) => setTasks((prev) => prev.map((t) => (t.id === value.id ? value : t)));

  const createTask = useCallback((input: TaskInput) => {
    if (!calendarId) {
      return Promise.resolve<SaveResult<Task>>({ ok: false, error: { type: 'other', message: 'Tu cuenta no está vinculada a ninguna familia.' } });
    }
    return run(() => repo.createTask(calendarId, input), (value) => setTasks((prev) => [...prev.filter((t) => t.id !== value.id), value]));
  }, [calendarId, run]);

  const updateTask = useCallback((task: Task, input: TaskInput) => run(() => repo.updateTask(task, input), replace), [run]);
  const setDone = useCallback((task: Task, done: boolean) => run(() => repo.setDone(task, done), replace), [run]);
  const deleteTask = useCallback(
    (task: Task) => run(() => repo.deleteTask(task), () => setTasks((prev) => prev.filter((t) => t.id !== task.id))),
    [run],
  );

  const value = useMemo<TasksValue>(
    () => ({ tasks, loading, loadError, refresh, createTask, updateTask, setDone, deleteTask }),
    [tasks, loading, loadError, refresh, createTask, updateTask, setDone, deleteTask],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
