// Calendario unificado: convierte turnos, citas y tareas en elementos comunes
// para pintarlos juntos. NO copia registros: cada módulo conserva sus datos.
import type { DayMark } from '../../shared/calendar/CalendarMonth';
import { compactRange } from '../../shared/lib/dates';
import { moduleByKey } from '../../shared/navigation/modules';
import type { Person, Shift } from '../shifts/types';
import { isAllDay, KIND_COLOR, KIND_LABEL } from '../shifts/types';
import type { Task } from '../tasks/types';
import type { CalEvent } from './types';

export type ItemType = 'shift' | 'event' | 'task';

export const TYPE_COLOR: Record<ItemType, string> = {
  shift: moduleByKey('turnos').accent,
  event: moduleByKey('agenda').accent,
  task: moduleByKey('tareas').accent,
};

export const TYPE_LABEL: Record<ItemType, string> = { shift: 'Turnos', event: 'Citas', task: 'Tareas' };

export type CalendarItem =
  | { type: 'shift'; key: string; date: string; sort: string; source: Shift }
  | { type: 'event'; key: string; date: string; sort: string; source: CalEvent }
  | { type: 'task'; key: string; date: string; sort: string; source: Task };

/** Letra de cada tipo de turno en el calendario unificado. */
const SHIFT_LETTER: Record<Shift['kind'], string> = { manana: 'M', tarde: 'T', noche: 'N', libre: 'L', vacaciones: 'V', otro: 'O' };

export function buildItems(shifts: Shift[], events: CalEvent[], tasks: Task[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  const push = (item: CalendarItem) => map.set(item.date, [...(map.get(item.date) ?? []), item]);
  for (const s of shifts) push({ type: 'shift', key: 's' + s.id, date: s.date, sort: '0' + (isAllDay(s.kind) ? '' : s.start), source: s });
  for (const e of events) push({ type: 'event', key: 'e' + e.id, date: e.date, sort: '1' + (e.start ?? ''), source: e });
  for (const t of tasks) if (t.dueDate && !t.doneAt) push({ type: 'task', key: 't' + t.id, date: t.dueDate, sort: '2', source: t });
  for (const list of map.values()) list.sort((a, b) => a.sort.localeCompare(b.sort));
  return map;
}

/** Marcas del calendario mensual según los tipos visibles. */
export function buildMarks(items: Map<string, CalendarItem[]>, people: Person[], visible: Set<ItemType>): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  for (const [date, list] of items) {
    const mark: DayMark = {};
    const a11y: string[] = [];
    if (visible.has('shift')) {
      const shifts = list.filter((i): i is Extract<CalendarItem, { type: 'shift' }> => i.type === 'shift').map((i) => i.source);
      if (shifts.length) {
        // Un hueco por persona, en el mismo orden siempre: «M·T», «–·L»…
        mark.letters = people.map((p) => {
          const sh = shifts.find((s) => s.personId === p.id);
          return sh ? { text: SHIFT_LETTER[sh.kind], color: KIND_COLOR[sh.kind] } : { text: '·', color: '#5B6472' };
        });
        a11y.push(shifts.map((s) => `${people.find((p) => p.id === s.personId)?.name ?? ''} ${KIND_LABEL[s.kind]}`).join(', '));
      }
    }
    if (visible.has('event')) {
      const events = list.filter((i) => i.type === 'event');
      if (events.length) {
        mark.bars = events.map((i) => ({ label: (i.source as CalEvent).title, color: TYPE_COLOR.event }));
        a11y.push(`${events.length} ${events.length === 1 ? 'cita' : 'citas'}`);
      }
    }
    if (visible.has('task')) {
      const tasks = list.filter((i) => i.type === 'task');
      if (tasks.length) {
        mark.dots = [{ color: TYPE_COLOR.task, count: tasks.length }];
        a11y.push(`${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}`);
      }
    }
    if (mark.letters || mark.bars || mark.dots) {
      mark.a11y = a11y.join(', ');
      marks.set(date, mark);
    }
  }
  return marks;
}

/** «10:30–11:15», «21:00» o «Todo el día». */
export function eventTime(e: CalEvent): string {
  if (!e.start) return 'Todo el día';
  // Sin hora de fin se muestra completa («21:00»), no «21».
  return e.end ? compactRange(e.start, e.end) : e.start.replace(/^0(?=\d)/, '');
}
