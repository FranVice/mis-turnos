import { kindColors } from '../../shared/theme';

export type ShiftKind ='manana' | 'tarde' | 'noche' | 'libre' | 'vacaciones' | 'otro';

export const SHIFT_KINDS: ShiftKind[] = ['manana', 'tarde', 'noche', 'libre', 'vacaciones', 'otro'];
export const TIMED_KINDS: ShiftKind[] = ['manana', 'tarde', 'noche'];
export const isAllDay = (kind: ShiftKind) => ['libre', 'vacaciones', 'otro'].includes(kind);

export const KIND_LABEL: Record<ShiftKind, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
  libre: 'Libre',
  vacaciones: 'Vacaciones',
  otro: 'Otro',
};

// Cada tipo de turno tiene su color (definido en el tema compartido).
export const KIND_COLOR: Record<ShiftKind, string> = kindColors;

export interface Person {
  id: string;
  calendarId: string;
  name: string;
  initial: string;
  color: string;
  userId: string | null;
}

export interface Shift {
  id: string;
  calendarId: string;
  personId: string;
  date: string; // YYYY-MM-DD, fecha de inicio
  kind: ShiftKind;
  start: string; // HH:MM
  end: string; // HH:MM
  version: number;
  updatedBy: string | null;
}

export interface UsualSchedule {
  personId: string;
  kind: ShiftKind;
  start: string;
  end: string;
}

export interface ShiftInput {
  personId: string;
  kind: ShiftKind;
  start: string;
  end: string;
}

export type SaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SaveError };

export type SaveError =
  | { type: 'duplicate'; existing: Shift | null }
  | { type: 'stale'; current: Shift | null }
  | { type: 'network'; message: string }
  | { type: 'other'; message: string };

export interface BulkResult {
  saved: string[];
  skipped: string[];
}
