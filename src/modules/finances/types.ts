import type { Section, Status } from './logic';

export type { SaveError, SaveResult } from '../../shared/lib/result';
export type { Section, Status };

export interface Movement {
  id: string;
  calendarId: string;
  /** Primer día del mes: YYYY-MM-01. */
  month: string;
  section: Section;
  concept: string;
  amountCents: number;
  status: Status;
  date: string | null;
  /** Plantilla de la que procede (gastos/ingresos fijos que se repiten). */
  recurringId: string | null;
  personId: string | null;
  notes: string | null;
  version: number;
}

export interface Recurring {
  id: string;
  section: Extract<Section, 'fixed_income' | 'fixed_expense'>;
  concept: string;
  amountCents: number;
  dayOfMonth: number | null;
  personId: string | null;
  startsOn: string;
  endsOn: string | null;
  version: number;
}

export interface MovementInput {
  section: Section;
  concept: string;
  amountCents: number;
  status: Status;
  date: string | null;
  personId: string | null;
  notes: string | null;
}
