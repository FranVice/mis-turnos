import type { Shift } from './types';

/**
 * Día libre en común: todos los miembros del espacio (al menos dos) tienen
 * ese día un turno «Libre». Si alguno trabaja, está de vacaciones o no
 * tiene turno registrado, no cuenta.
 */
export function isSharedFreeDay(shifts: readonly Pick<Shift, 'personId' | 'kind'>[] | undefined, personIds: readonly string[]): boolean {
  if (!shifts?.length || personIds.length < 2) return false;
  return personIds.every((id) => shifts.some((s) => s.personId === id && s.kind === 'libre'));
}
