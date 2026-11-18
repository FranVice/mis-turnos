import type { SaveResult, Task, TaskInput } from '../types';

// Interfaz común para Supabase y para el modo demostración.
export interface TasksRepo {
  /** Pendientes (todas) y completadas recientemente. */
  loadTasks(): Promise<Task[]>;
  createTask(calendarId: string, input: TaskInput): Promise<SaveResult<Task>>;
  updateTask(task: Task, input: TaskInput): Promise<SaveResult<Task>>;
  setDone(task: Task, done: boolean): Promise<SaveResult<Task>>;
  deleteTask(task: Task): Promise<SaveResult<null>>;
  /** Avisa de cambios hechos desde el otro móvil. Devuelve la función para cancelar. */
  subscribe(onChange: () => void): () => void;
}

/** Días que se siguen mostrando las tareas completadas. */
export const DONE_VISIBLE_DAYS = 30;
