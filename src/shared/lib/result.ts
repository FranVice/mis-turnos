// Resultado de guardar: el servidor confirma o devuelve un error legible.
export type SaveError = { type: 'network' | 'other'; message: string };
export type SaveResult<T> = { ok: true; value: T } | { ok: false; error: SaveError };

export function toSaveError(error: { message?: string } | null | undefined): SaveError {
  const message = error?.message ?? 'Error desconocido';
  if (/network|fetch|timeout|offline/i.test(message)) return { type: 'network', message };
  return { type: 'other', message };
}
