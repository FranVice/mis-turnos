import type { CalEvent, EventInput, SaveResult } from '../types';

// Interfaz común para Supabase y para el modo demostración.
export interface EventsRepo {
  /** Citas entre dos fechas, ambas incluidas (YYYY-MM-DD). */
  loadRange(from: string, to: string): Promise<CalEvent[]>;
  createEvent(calendarId: string, input: EventInput): Promise<SaveResult<CalEvent>>;
  updateEvent(event: CalEvent, input: EventInput): Promise<SaveResult<CalEvent>>;
  deleteEvent(event: CalEvent): Promise<SaveResult<null>>;
  /** Avisa de cambios hechos desde el otro móvil. Devuelve la función para cancelar. */
  subscribe(onChange: () => void): () => void;
}
