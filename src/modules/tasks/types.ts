// Resultado de guardar: el servidor confirma o devuelve un error legible.
export type SaveError = { type: 'network' | 'other'; message: string };
export type SaveResult<T> = { ok: true; value: T } | { ok: false; error: SaveError };

export interface Task {
  id: string;
  calendarId: string;
  title: string;
  notes: string | null;
  /** null = de los dos. */
  assigneeId: string | null;
  /** YYYY-MM-DD o null si no tiene fecha. */
  dueDate: string | null;
  /** ISO del momento en que se completó, o null si está pendiente. */
  doneAt: string | null;
  doneBy: string | null;
  version: number;
  createdBy: string | null;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  notes: string | null;
  assigneeId: string | null;
  dueDate: string | null;
}
