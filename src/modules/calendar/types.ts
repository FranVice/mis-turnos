export type { SaveError, SaveResult } from '../../shared/lib/result';

/** Cita personal (personId) o familiar (personId null). */
export interface CalEvent {
  id: string;
  calendarId: string;
  title: string;
  personId: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM; null = todo el día. */
  start: string | null;
  end: string | null;
  location: string | null;
  notes: string | null;
  version: number;
  createdBy: string | null;
}

export interface EventInput {
  title: string;
  personId: string | null;
  date: string;
  start: string | null;
  end: string | null;
  location: string | null;
  notes: string | null;
}
