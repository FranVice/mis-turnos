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

// Letra que se muestra en la celda del calendario mensual para los turnos con horario.
export const KIND_LETTER: Partial<Record<ShiftKind, string>> = {
  manana: 'M',
  tarde: 'T',
  noche: 'N',
};

// Cada tipo de turno tiene su color (definido en el tema compartido).
export const KIND_COLOR: Record<ShiftKind, string> = kindColors;

/** Espacio: el familiar (todos los módulos) o el de una pareja invitada (solo Mis Turnos). */
export type SpaceKind = 'family' | 'shifts';
export interface Space {
  id: string;
  name: string;
  kind: SpaceKind;
}

export interface Person {
  id: string;
  calendarId: string;
  name: string;
  initial: string;
  color: string;
  userId: string | null;
  /** Tipos de turno que puede usar (null = todos). */
  shiftKinds: ShiftKind[] | null;
}

/** Tipos de turno disponibles para una persona, en el orden habitual. */
export const kindsFor = (person: Person | null | undefined): ShiftKind[] =>
  person?.shiftKinds ? SHIFT_KINDS.filter((k) => person.shiftKinds!.includes(k)) : SHIFT_KINDS;

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
  /** Nombre del turno si se creó desde un turno con nombre (p. ej. «Partido»). */
  label: string | null;
}

/** Turno con nombre guardado por una persona: nombre, tipo base y horas. */
export interface ShiftTemplate {
  id: string;
  personId: string;
  name: string;
  kind: ShiftKind;
  start: string;
  end: string;
}

export type ShiftTemplateInput = Omit<ShiftTemplate, 'id'>;

/** Texto del tipo de un turno: su nombre propio o el del tipo. */
export const shiftTitle = (s: Pick<Shift, 'kind' | 'label'>) => s.label ?? KIND_LABEL[s.kind];

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
  label?: string | null;
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
