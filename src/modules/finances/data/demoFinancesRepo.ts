// Modo demostración: economía ficticia en memoria. No se guarda nada.
// Reproduce la generación mensual de la base de datos (idempotente, sin duplicados).
import { todayISO } from '../../../shared/lib/dates';
import { DEMO_PEOPLE } from '../../shifts/data/demoRepo';
import type { Movement, MovementInput, Recurring } from '../types';
import type { FinancesRepo } from './repo';

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const newId = (p: string) => `demo-${p}-${Date.now()}-${counter++}`;
const CAL = DEMO_PEOPLE[0].calendarId;
const [F, A] = DEMO_PEOPLE.map((p) => p.id);

const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const dayIn = (month: string, day: number | null) =>
  day ? `${month.slice(0, 8)}${String(Math.min(day, lastDay(month))).padStart(2, '0')}` : null;

export function createDemoFinancesRepo(maxMonth: () => string): FinancesRepo {
  const current = `${todayISO().slice(0, 8)}01`;
  const t = (section: Recurring['section'], concept: string, amountCents: number, dayOfMonth: number | null, personId: string | null = null): Recurring => ({
    id: newId('rec'), section, concept, amountCents, dayOfMonth, personId, startsOn: current, endsOn: null, version: 1,
  });
  let recurring: Recurring[] = [
    t('fixed_income', 'Nómina Franklin', 165000, 28, F),
    t('fixed_income', 'Nómina Almudena', 148000, 30, A),
    t('fixed_expense', 'Hipoteca', 62000, 1),
    t('fixed_expense', 'Luz', 7500, 5),
    t('fixed_expense', 'Internet y móviles', 5490, 10),
    t('fixed_expense', 'Comunidad', 5500, 3),
  ];
  let movements: Movement[] = [];

  const generate = (month: string) => {
    for (const r of recurring) {
      if (r.startsOn > month || (r.endsOn && r.endsOn < month)) continue;
      if (movements.some((m) => m.recurringId === r.id && m.month === month)) continue;
      movements.push({
        id: newId('mov'), calendarId: CAL, month, section: r.section, concept: r.concept, amountCents: r.amountCents,
        status: 'planned', date: dayIn(month, r.dayOfMonth), recurringId: r.id, personId: r.personId, notes: null, version: 1,
      });
    }
  };

  // Mes actual con algunos movimientos ya hechos.
  generate(current);
  const done = (concept: string) => {
    const m = movements.find((x) => x.month === current && x.concept === concept);
    if (m) m.status = 'done';
  };
  ['Hipoteca', 'Comunidad', 'Luz'].forEach(done);
  const loose = (section: Movement['section'], concept: string, amountCents: number, day: number, status: Movement['status'] = 'done', personId: string | null = null) =>
    movements.push({ id: newId('mov'), calendarId: CAL, month: current, section, concept, amountCents, status, date: dayIn(current, day), recurringId: null, personId, notes: null, version: 1 });
  loose('variable_expense', 'Supermercado', 8530, 4);
  loose('variable_expense', 'Gasolina', 6000, 9, 'done', F);
  loose('variable_expense', 'Farmacia', 1890, 12);
  loose('extra_income', 'Venta de la bici', 12000, 7, 'done', A);

  const clean = (i: MovementInput) => ({ ...i, concept: i.concept.trim(), notes: i.notes?.trim() || null });
  const bump = (id: string, patch: Partial<Movement>, version?: number) => {
    const cur = movements.find((m) => m.id === id);
    if (!cur || (version !== undefined && cur.version !== version)) return null;
    Object.assign(cur, patch, { version: cur.version + 1 });
    return { ...cur };
  };
  const stale = { ok: false as const, error: { type: 'other' as const, message: 'El movimiento ha cambiado desde el otro móvil.' } };

  return {
    async loadMonth(_calendarId, month) {
      await wait();
      if (month <= maxMonth()) generate(month);
      return { movements: movements.filter((m) => m.month === month).map((m) => ({ ...m })), recurring: recurring.map((r) => ({ ...r })) };
    },
    async createMovement(calendarId, month, input, repeat) {
      await wait();
      let recurringId: string | null = null;
      if (repeat && (input.section === 'fixed_income' || input.section === 'fixed_expense')) {
        const r = { ...t(input.section, input.concept.trim(), input.amountCents, input.date ? Number(input.date.slice(8, 10)) : null, input.personId), startsOn: month };
        recurring = [...recurring, r];
        recurringId = r.id;
      }
      const m: Movement = { id: newId('mov'), calendarId, month, ...clean(input), recurringId, version: 1 };
      movements.push(m);
      return { ok: true, value: { ...m } };
    },
    async updateMovement(movement, input, template) {
      await wait();
      const next = bump(movement.id, clean(input), movement.version);
      if (!next) return stale;
      if (template) {
        recurring = recurring.map((r) =>
          r.id === template.id
            ? { ...r, concept: input.concept.trim(), amountCents: input.amountCents, personId: input.personId, dayOfMonth: input.date ? Number(input.date.slice(8, 10)) : null, version: r.version + 1 }
            : r,
        );
        movements
          .filter((m) => m.recurringId === template.id && m.month > movement.month && m.status === 'planned')
          .forEach((m) => Object.assign(m, { concept: input.concept.trim(), amountCents: input.amountCents, personId: input.personId }));
      }
      return { ok: true, value: next };
    },
    async setStatus(movement, status) {
      await wait(80);
      const next = bump(movement.id, { status }, movement.version);
      return next ? { ok: true, value: next } : stale;
    },
    async removeMovement(movement) {
      await wait();
      if (movement.recurringId) bump(movement.id, { status: 'skipped' });
      else movements = movements.filter((m) => m.id !== movement.id);
      return { ok: true, value: null };
    },
    async stopRecurring(template, month) {
      await wait();
      recurring = recurring.map((r) => (r.id === template.id ? { ...r, endsOn: month } : r));
      movements = movements.filter((m) => !(m.recurringId === template.id && m.month > month && m.status === 'planned'));
      return { ok: true, value: null };
    },
    subscribe() {
      return () => {};
    },
  };
}
