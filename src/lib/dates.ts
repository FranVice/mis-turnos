// Fechas como cadenas YYYY-MM-DD en hora local de Madrid. Se evita Date
// con zona horaria para que el cambio de hora no mueva ningún turno.

export const TIME_ZONE = 'Europe/Madrid';

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(y: number, m: number, d: number): string {
  // m: 1-12
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function todayISO(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  } catch {
    // Si el motor no soporta zonas horarias, se usa la del dispositivo.
  }
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// Día de la semana con lunes = 0 … domingo = 6.
export function weekdayIndex(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export interface MonthRef {
  year: number;
  month: number; // 1-12
}

export function monthOf(iso: string): MonthRef {
  const { y, m } = parseISO(iso);
  return { year: y, month: m };
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const idx = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function sameMonth(a: MonthRef, b: MonthRef) {
  return a.year === b.year && a.month === b.month;
}

export function monthTitle(ref: MonthRef): string {
  const name = MONTHS[ref.month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${ref.year}`;
}

// Semanas (de lunes a domingo) que cubren el mes. Los días de otros meses
// se devuelven como null para dejar la celda vacía.
export function monthWeeks(ref: MonthRef): (string | null)[][] {
  const first = toISO(ref.year, ref.month, 1);
  const daysInMonth = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
  const offset = weekdayIndex(first);
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(ref.year, ref.month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthRange(ref: MonthRef): { from: string; to: string } {
  const daysInMonth = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
  return { from: toISO(ref.year, ref.month, 1), to: toISO(ref.year, ref.month, daysInMonth) };
}

// «martes, 12 de noviembre»
export function longDate(iso: string, withYear = false): string {
  const { y, m, d } = parseISO(iso);
  const base = `${WEEKDAYS_LONG[weekdayIndex(iso)]}, ${d} de ${MONTHS[m - 1]}`;
  return withYear ? `${base} de ${y}` : base;
}

// «12 nov»
export function shortDate(iso: string): string {
  const { m, d } = parseISO(iso);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// ---------- Horas ----------

export function normalizeTime(t: string): string {
  // «06:00:00» → «06:00»
  return t.slice(0, 5);
}

export function isValidTime(t: string | null | undefined): t is string {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function endsNextDay(start: string, end: string): boolean {
  return end < start;
}

// Formato compacto para la celda: «6–14», «14:30–22».
export function compactTime(t: string): string {
  const [h, m] = t.split(':');
  const hour = String(Number(h));
  return m === '00' ? hour : `${hour}:${m}`;
}

export function compactRange(start: string, end: string): string {
  return `${compactTime(start)}–${compactTime(end)}`;
}

export function timeToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function dateToTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
