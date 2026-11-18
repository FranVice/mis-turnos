// Modo demostración: tareas ficticias en memoria. No se guarda nada.
import { addDays, todayISO } from '../../../shared/lib/dates';
import { DEMO_PEOPLE, DEMO_USER_ID } from '../../shifts/data/demoRepo';
import type { Task, TaskInput } from '../types';
import type { TasksRepo } from './repo';

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const newId = () => `demo-task-${Date.now()}-${counter++}`;
const CAL = DEMO_PEOPLE[0].calendarId;
const [F, A] = DEMO_PEOPLE.map((p) => p.id);

function seed(): Task[] {
  const today = todayISO();
  const base = { calendarId: CAL, notes: null, doneAt: null, doneBy: null, version: 1, createdBy: DEMO_USER_ID, updatedAt: new Date().toISOString() };
  return [
    { ...base, id: newId(), title: 'Pagar el recibo de la luz', assigneeId: F, dueDate: addDays(today, -1) },
    { ...base, id: newId(), title: 'Pedir cita en el dentista', assigneeId: A, dueDate: today },
    { ...base, id: newId(), title: 'Comprar regalo de cumpleaños', assigneeId: null, dueDate: addDays(today, 3) },
    { ...base, id: newId(), title: 'Revisar el seguro del coche', assigneeId: null, dueDate: null },
    { ...base, id: newId(), title: 'Llevar abrigos a la tintorería', assigneeId: F, dueDate: null, doneAt: new Date().toISOString(), doneBy: DEMO_USER_ID },
  ];
}

export function createDemoTasksRepo(): TasksRepo {
  let tasks = seed();
  const listeners = new Set<() => void>();

  const save = (task: Task, patch: Partial<Task>) => {
    const current = tasks.find((t) => t.id === task.id);
    if (!current || current.version !== task.version) return null;
    const next: Task = { ...current, ...patch, version: current.version + 1, updatedAt: new Date().toISOString() };
    tasks = tasks.map((t) => (t.id === task.id ? next : t));
    return next;
  };
  const stale = { ok: false as const, error: { type: 'other' as const, message: 'La tarea ha cambiado desde el otro móvil.' } };
  const clean = (input: TaskInput) => ({ ...input, title: input.title.trim(), notes: input.notes?.trim() || null });

  return {
    async loadTasks() {
      await wait();
      return tasks.map((t) => ({ ...t }));
    },
    async createTask(calendarId, input) {
      await wait();
      const task: Task = {
        id: newId(), calendarId, ...clean(input), doneAt: null, doneBy: null,
        version: 1, createdBy: DEMO_USER_ID, updatedAt: new Date().toISOString(),
      };
      tasks = [...tasks, task];
      return { ok: true, value: task };
    },
    async updateTask(task, input) {
      await wait();
      const next = save(task, clean(input));
      return next ? { ok: true, value: next } : stale;
    },
    async setDone(task, done) {
      await wait(120);
      const next = save(task, done ? { doneAt: new Date().toISOString(), doneBy: DEMO_USER_ID } : { doneAt: null, doneBy: null });
      return next ? { ok: true, value: next } : stale;
    },
    async deleteTask(task) {
      await wait();
      tasks = tasks.filter((t) => t.id !== task.id);
      return { ok: true, value: null };
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
