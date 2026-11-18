// Modo demostración: citas ficticias en memoria. No se guarda nada.
import { addDays, todayISO } from '../../../shared/lib/dates';
import { DEMO_PEOPLE, DEMO_USER_ID } from '../../shifts/data/demoRepo';
import type { CalEvent, EventInput } from '../types';
import type { EventsRepo } from './repo';

const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const newId = () => `demo-event-${Date.now()}-${counter++}`;
const CAL = DEMO_PEOPLE[0].calendarId;
const [F, A] = DEMO_PEOPLE.map((p) => p.id);

function seed(): CalEvent[] {
  const t = todayISO();
  const base = { calendarId: CAL, location: null, notes: null, version: 1, createdBy: DEMO_USER_ID };
  return [
    { ...base, id: newId(), title: 'Revisión médica', personId: A, date: addDays(t, 1), start: '09:30', end: '10:15', location: 'Centro de salud' },
    { ...base, id: newId(), title: 'Cena con amigos', personId: null, date: addDays(t, 3), start: '21:00', end: null },
    { ...base, id: newId(), title: 'ITV del coche', personId: F, date: addDays(t, 6), start: '17:00', end: '17:30' },
    { ...base, id: newId(), title: 'Cumpleaños de la abuela', personId: null, date: addDays(t, 10), start: null, end: null },
    { ...base, id: newId(), title: 'Reunión del colegio', personId: null, date: addDays(t, -4), start: '18:00', end: '19:00' },
  ];
}

const clean = (i: EventInput): EventInput => ({
  ...i,
  title: i.title.trim(),
  end: i.start ? i.end : null,
  location: i.location?.trim() || null,
  notes: i.notes?.trim() || null,
});

export function createDemoEventsRepo(): EventsRepo {
  let events = seed();
  return {
    async loadRange(from, to) {
      await wait();
      return events.filter((e) => e.date >= from && e.date <= to).map((e) => ({ ...e }));
    },
    async createEvent(calendarId, input) {
      await wait();
      const ev: CalEvent = { id: newId(), calendarId, ...clean(input), version: 1, createdBy: DEMO_USER_ID };
      events = [...events, ev];
      return { ok: true, value: ev };
    },
    async updateEvent(event, input) {
      await wait();
      const current = events.find((e) => e.id === event.id);
      if (!current || current.version !== event.version) {
        return { ok: false, error: { type: 'other', message: 'La cita ha cambiado desde el otro móvil.' } };
      }
      const next = { ...current, ...clean(input), version: current.version + 1 };
      events = events.map((e) => (e.id === event.id ? next : e));
      return { ok: true, value: next };
    },
    async deleteEvent(event) {
      await wait();
      events = events.filter((e) => e.id !== event.id);
      return { ok: true, value: null };
    },
    subscribe() {
      return () => {};
    },
  };
}
