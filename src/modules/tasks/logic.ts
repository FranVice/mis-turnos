// Lógica pura de Tareas (sin dependencias, se prueba en tests/tasks-logic.test.cjs).
// Las fechas son cadenas YYYY-MM-DD: se comparan como texto.

export interface TaskLike {
  id: string;
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  doneAt: string | null;
}

export type Bucket = 'overdue' | 'today' | 'upcoming' | 'nodate';

export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Vencidas',
  today: 'Hoy',
  upcoming: 'Próximas',
  nodate: 'Sin fecha',
};

export const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'upcoming', 'nodate'];

export function bucketOf(task: TaskLike, today: string): Bucket {
  if (!task.dueDate) return 'nodate';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

/** Orden de pendientes: vencidas, hoy, próximas por fecha y sin fecha al final. */
export function comparePending(a: TaskLike, b: TaskLike, today: string): number {
  const ba = BUCKET_ORDER.indexOf(bucketOf(a, today));
  const bb = BUCKET_ORDER.indexOf(bucketOf(b, today));
  if (ba !== bb) return ba - bb;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return 0; // se conserva el orden de creación
}

export type Filter = 'all' | 'mine' | 'done';

/** «Mías» incluye las de los dos (sin responsable). */
export function matchesFilter(task: TaskLike, filter: Filter, myPersonId: string | null): boolean {
  if (filter === 'done') return !!task.doneAt;
  if (task.doneAt) return false;
  if (filter === 'mine') return task.assigneeId === null || task.assigneeId === myPersonId;
  return true;
}

/** Agrupa las pendientes por sección, ya ordenadas, omitiendo secciones vacías. */
export function groupPending<T extends TaskLike>(tasks: T[], today: string): { bucket: Bucket; tasks: T[] }[] {
  const sorted = tasks.filter((t) => !t.doneAt).sort((a, b) => comparePending(a, b, today));
  return BUCKET_ORDER.map((bucket) => ({ bucket, tasks: sorted.filter((t) => bucketOf(t, today) === bucket) })).filter(
    (g) => g.tasks.length > 0,
  );
}

/** Para Inicio: las pendientes más relevantes (como mucho `limit`). */
export function topPending<T extends TaskLike>(tasks: T[], today: string, limit = 3): T[] {
  return tasks
    .filter((t) => !t.doneAt)
    .sort((a, b) => comparePending(a, b, today))
    .slice(0, limit);
}
