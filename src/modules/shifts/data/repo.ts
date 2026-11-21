import type {
  BulkResult,
  Person,
  SaveResult,
  Shift,
  ShiftInput,
  ShiftTemplate,
  ShiftTemplateInput,
  UsualSchedule,
} from '../types';

// Interfaz común para Supabase y para el modo demostración.
export interface Repo {
  saveColor(personId: string, color: string): Promise<SaveResult<null>>;
  loadPeople(): Promise<Person[]>;
  loadSchedules(): Promise<UsualSchedule[]>;
  loadShifts(from: string, to: string): Promise<Shift[]>;
  createShift(calendarId: string, date: string, input: ShiftInput): Promise<SaveResult<Shift>>;
  createShifts(calendarId: string, dates: string[], input: ShiftInput): Promise<SaveResult<BulkResult>>;
  updateShift(shift: Shift, input: ShiftInput): Promise<SaveResult<Shift>>;
  deleteShift(shift: Shift): Promise<SaveResult<null>>;
  saveSchedule(schedule: UsualSchedule): Promise<SaveResult<UsualSchedule>>;
  deleteSchedule(personId: string, kind: UsualSchedule['kind']): Promise<SaveResult<null>>;
  loadTemplates(): Promise<ShiftTemplate[]>;
  createTemplate(input: ShiftTemplateInput): Promise<SaveResult<ShiftTemplate>>;
  deleteTemplate(id: string): Promise<SaveResult<null>>;
  /** Avisa de cambios hechos desde el otro móvil. Devuelve la función para cancelar. */
  subscribe(onChange: () => void): () => void;
}
