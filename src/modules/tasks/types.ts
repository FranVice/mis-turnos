export type { SaveError, SaveResult } from '../../shared/lib/result';

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
