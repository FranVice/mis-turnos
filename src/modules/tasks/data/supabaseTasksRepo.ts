import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { SaveError, SaveResult, Task, TaskInput } from '../types';
import { DONE_VISIBLE_DAYS, type TasksRepo } from './repo';

const COLUMNS = 'id, calendar_id, title, notes, assignee_person_id, due_date, done_at, done_by, version, created_by, updated_at';

interface TaskRow {
  id: string;
  calendar_id: string;
  title: string;
  notes: string | null;
  assignee_person_id: string | null;
  due_date: string | null;
  done_at: string | null;
  done_by: string | null;
  version: number;
  created_by: string | null;
  updated_at: string;
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  calendarId: r.calendar_id,
  title: r.title,
  notes: r.notes,
  assigneeId: r.assignee_person_id,
  dueDate: r.due_date,
  doneAt: r.done_at,
  doneBy: r.done_by,
  version: r.version,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
});

const toRow = (input: TaskInput) => ({
  title: input.title.trim(),
  notes: input.notes?.trim() || null,
  assignee_person_id: input.assigneeId,
  due_date: input.dueDate,
});

function toError(error: PostgrestError | Error | null | undefined): SaveError {
  const message = error?.message ?? 'Error desconocido';
  if (/network|fetch|timeout|offline/i.test(message)) return { type: 'network', message };
  return { type: 'other', message };
}

export function createSupabaseTasksRepo(sb: SupabaseClient): TasksRepo {
  // Edición con control de versión: si el otro móvil la cambió antes, se avisa.
  async function guardedUpdate(task: Task, patch: Record<string, unknown>): Promise<SaveResult<Task>> {
    const { data, error } = await sb
      .from('tasks')
      .update(patch)
      .eq('id', task.id)
      .eq('version', task.version)
      .select(COLUMNS)
      .maybeSingle<TaskRow>();
    if (error) return { ok: false, error: toError(error) };
    if (!data) return { ok: false, error: { type: 'other', message: 'La tarea ha cambiado o se ha borrado desde el otro móvil. Se ha actualizado la lista.' } };
    return { ok: true, value: toTask(data) };
  }

  return {
    async loadTasks() {
      const since = new Date(Date.now() - DONE_VISIBLE_DAYS * 86400000).toISOString();
      const { data, error } = await sb
        .from('tasks')
        .select(COLUMNS)
        .or(`done_at.is.null,done_at.gte.${since}`)
        .order('created_at', { ascending: true })
        .returns<TaskRow[]>();
      if (error) throw error;
      return (data ?? []).map(toTask);
    },

    async createTask(calendarId, input) {
      const { data: userData } = await sb.auth.getUser();
      const uid = userData.user?.id;
      const { data, error } = await sb
        .from('tasks')
        .insert({ calendar_id: calendarId, ...toRow(input), created_by: uid, updated_by: uid })
        .select(COLUMNS)
        .single<TaskRow>();
      if (error) return { ok: false, error: toError(error) };
      return { ok: true, value: toTask(data) };
    },

    updateTask: (task, input) => guardedUpdate(task, toRow(input)),

    setDone: (task, done) => guardedUpdate(task, { done_at: done ? new Date().toISOString() : null }),

    async deleteTask(task) {
      const { error } = await sb.from('tasks').delete().eq('id', task.id);
      if (error) return { ok: false, error: toError(error) };
      return { ok: true, value: null };
    },

    subscribe(onChange) {
      const channel = sb
        .channel('nexo-tareas')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },
  };
}
