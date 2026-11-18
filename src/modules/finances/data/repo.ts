import type { Movement, MovementInput, Recurring, SaveResult, Status } from '../types';

// Interfaz común para Supabase y para el modo demostración.
export interface FinancesRepo {
  /** Genera los previstos del mes desde las plantillas (si procede) y devuelve el mes. */
  loadMonth(calendarId: string, month: string): Promise<{ movements: Movement[]; recurring: Recurring[] }>;
  /** Crea un movimiento. Con repeat (solo fijos), crea también la plantilla mensual desde este mes. */
  createMovement(calendarId: string, month: string, input: MovementInput, repeat: boolean): Promise<SaveResult<Movement>>;
  /** Edita el movimiento. Con template, actualiza también la plantilla y los previstos de meses siguientes. */
  updateMovement(movement: Movement, input: MovementInput, template: Recurring | null): Promise<SaveResult<Movement>>;
  setStatus(movement: Movement, status: Status): Promise<SaveResult<Movement>>;
  /** Borra un movimiento suelto. Si procede de una plantilla, lo marca como omitido este mes. */
  removeMovement(movement: Movement): Promise<SaveResult<null>>;
  /** Deja de repetir una plantilla después de este mes y quita sus previstos futuros. */
  stopRecurring(template: Recurring, month: string): Promise<SaveResult<null>>;
  subscribe(onChange: () => void): () => void;
}

/** No se generan previstos más allá de este número de meses en el futuro. */
export const MAX_FUTURE_MONTHS = 12;
