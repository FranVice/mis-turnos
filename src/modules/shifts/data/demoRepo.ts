// Modo demostración: datos ficticios en memoria. No se guarda nada en
// Supabase y todo se pierde al cerrar la app.
import { addDays, monthOf, monthRange, todayISO, weekdayIndex } from '../../../shared/lib/dates';
import type { Person, Shift, ShiftInput, UsualSchedule } from '../types';
import type { Repo } from './repo';

const CAL = 'demo-calendar';

export const DEMO_PEOPLE: Person[] = [
  { id: 'demo-franklin', calendarId: CAL, name: 'Franklin', initial: 'F', color: '#2563EB', userId: 'demo-user' },
  { id: 'demo-almudena', calendarId: CAL, name: 'Almudena', initial: 'A', color: '#E8590C', userId: null },
];

export const DEMO_USER_ID = 'demo-user';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const newId = () => `demo-${Date.now()}-${counter++}`;

function seedShifts(): Shift[] {
  const { from, to } = monthRange(monthOf(todayISO()));
  const shifts: Shift[] = [];
  let day = from;
  let i = 0;
  while (day <= to) {
    const wd = weekdayIndex(day);
    // Franklin: mañanas una semana, tardes la siguiente, libra el domingo.
    if (wd !== 6) {
      const week = Math.floor(i / 7) % 2;
      shifts.push({
        id: newId(), calendarId: CAL, personId: 'demo-franklin', date: day,
        kind: week === 0 ? 'manana' : 'tarde',
        start: week === 0 ? '06:00' : '14:00', end: week === 0 ? '14:00' : '22:00',
        version: 1, updatedBy: null,
      });
    } else {
      shifts.push({
        id: newId(), calendarId: CAL, personId: 'demo-franklin', date: day,
        kind: 'libre', start: '00:00', end: '00:00', version: 1, updatedBy: null,
      });
    }
    if (wd === 3 && Math.floor(i / 7) === 2) {
      shifts.push({
        id: newId(), calendarId: CAL, personId: 'demo-almudena', date: day,
        kind: 'vacaciones', start: '00:00', end: '00:00', version: 1, updatedBy: null,
      });
    }
    // Almudena: horarios variados, incluido alguno que acaba al día siguiente.
    if (wd === 0 || wd === 2 || wd === 4) {
      shifts.push({
        id: newId(), calendarId: CAL, personId: 'demo-almudena', date: day,
        kind: 'manana', start: '08:30', end: '15:00', version: 1, updatedBy: null,
      });
    } else if (wd === 5) {
      shifts.push({
        id: newId(), calendarId: CAL, personId: 'demo-almudena', date: day,
        kind: 'tarde', start: '18:00', end: '02:00', version: 1, updatedBy: null,
      });
    }
    day = addDays(day, 1);
    i++;
  }
  return shifts;
}

export function createDemoRepo(): Repo {
  let shifts = seedShifts();
  let schedules: UsualSchedule[] = [
    { personId: 'demo-franklin', kind: 'manana', start: '06:00', end: '14:00' },
    { personId: 'demo-franklin', kind: 'tarde', start: '14:00', end: '22:00' },
    { personId: 'demo-franklin', kind: 'noche', start: '22:00', end: '06:00' },
  ];
  const find = (personId: string, date: string) =>
    shifts.find((s) => s.personId === personId && s.date === date) ?? null;
  const build = (date: string, input: ShiftInput): Shift => ({
    id: newId(), calendarId: CAL, personId: input.personId, date, kind: input.kind,
    start: input.start, end: input.end, version: 1, updatedBy: DEMO_USER_ID,
  });

  return {
    async saveColor(personId, color) {
      const person = DEMO_PEOPLE.find(p => p.id === personId);
      if (person) person.color = color;
      return {ok: true, value: null};
    },
    async loadPeople() {
      await wait(100);
      return DEMO_PEOPLE;
    },
    async loadSchedules() {
      return schedules.map((s) => ({ ...s }));
    },
    async loadShifts(from, to) {
      await wait();
      return shifts.filter((s) => s.date >= from && s.date <= to).map((s) => ({ ...s }));
    },
    async createShift(_cal, date, input) {
      await wait();
      const existing = find(input.personId, date);
      if (existing) return { ok: false, error: { type: 'duplicate', existing: { ...existing } } };
      const s = build(date, input);
      shifts.push(s);
      return { ok: true, value: { ...s } };
    },
    async createShifts(_cal, dates, input) {
      await wait();
      const saved: string[] = [];
      const skipped: string[] = [];
      for (const d of dates) {
        if (find(input.personId, d)) skipped.push(d);
        else {
          shifts.push(build(d, input));
          saved.push(d);
        }
      }
      return { ok: true, value: { saved, skipped } };
    },
    async updateShift(shift, input) {
      await wait();
      const current = shifts.find((s) => s.id === shift.id);
      if (!current || current.version !== shift.version) {
        return { ok: false, error: { type: 'stale', current: current ? { ...current } : null } };
      }
      const clash = find(input.personId, shift.date);
      if (clash && clash.id !== shift.id) return { ok: false, error: { type: 'duplicate', existing: { ...clash } } };
      Object.assign(current, input, { version: current.version + 1, updatedBy: DEMO_USER_ID });
      return { ok: true, value: { ...current } };
    },
    async deleteShift(shift) {
      await wait();
      const current = shifts.find(s => s.id === shift.id);
      if (!current || current.version !== shift.version) return {ok: false, error: {type: 'stale', current: current ?? null}};
      shifts = shifts.filter((s) => s.id !== shift.id);
      return { ok: true, value: null };
    },
    async saveSchedule(s) {
      schedules = schedules.filter((x) => !(x.personId === s.personId && x.kind === s.kind)).concat(s);
      return { ok: true, value: s };
    },
    async deleteSchedule(personId, kind) {
      schedules = schedules.filter((x) => !(x.personId === personId && x.kind === kind));
      return { ok: true, value: null };
    },
    subscribe() {
      return () => {};
    },
  };
}
