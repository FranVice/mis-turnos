// Lógica pura de Economía (sin dependencias; se prueba en tests/finances-logic.test.cjs).
// Todos los importes son céntimos enteros y positivos; la sección decide el signo.

export type Section = 'fixed_income' | 'extra_income' | 'fixed_expense' | 'variable_expense';
export type Status = 'planned' | 'done' | 'skipped';

export const SECTIONS: Section[] = ['fixed_income', 'extra_income', 'fixed_expense', 'variable_expense'];

export const SECTION_LABEL: Record<Section, string> = {
  fixed_income: 'Ingresos fijos',
  extra_income: 'Ingresos extra',
  fixed_expense: 'Gastos fijos',
  variable_expense: 'Gastos variables',
};

export const isIncome = (s: Section) => s === 'fixed_income' || s === 'extra_income';
export const isFixed = (s: Section) => s === 'fixed_income' || s === 'fixed_expense';

export interface MovementLike {
  section: Section;
  amountCents: number;
  status: Status;
}

/**
 * Convierte lo que escribe el usuario en céntimos.
 * Acepta «12», «12,5», «12,50», «1.234,56», «1234.56» y «€ 12». Devuelve null si no es válido o ≤ 0.
 */
export function parseEuros(text: string): number | null {
  let t = text.replace(/[€\s]/g, '');
  if (!t) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal; el otro, de miles.
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma >= 0) {
    t = t.replace(',', '.');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // «1.234» = mil doscientos treinta y cuatro
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [int, dec = ''] = t.split('.');
  const cents = Number(int) * 100 + Number((dec + '00').slice(0, 2));
  return cents > 0 && cents < 100000000000 ? cents : null;
}

/** «1.234,56 €». Con sign, añade «+» o «−» delante. */
export function formatEuros(cents: number, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, '0');
  const intText = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const showDecimals = opts.decimals ?? true;
  const body = showDecimals ? `${intText},${dec}` : intText;
  const prefix = negative ? '−' : opts.sign && cents > 0 ? '+' : '';
  return `${prefix}${body} €`;
}

/** Texto para editar un importe: 123456 → «1234,56». */
export const centsToInput = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

export interface SectionTotals {
  done: number;
  planned: number;
  /** done + planned (sin omitidos). */
  total: number;
  count: number;
}

export interface MonthSummary {
  sections: Record<Section, SectionTotals>;
  incomeDone: number;
  expenseDone: number;
  incomeTotal: number;
  expenseTotal: number;
  /** Lo que ya ha entrado menos lo que ya ha salido. */
  balanceDone: number;
  /** Cierre previsto si se cumple todo lo previsto. */
  forecast: number;
  /** Ingresos y gastos que faltan por confirmar. */
  pendingIncome: number;
  pendingExpense: number;
}

export function summarize(movements: MovementLike[]): MonthSummary {
  const empty = (): SectionTotals => ({ done: 0, planned: 0, total: 0, count: 0 });
  const sections = { fixed_income: empty(), extra_income: empty(), fixed_expense: empty(), variable_expense: empty() } as Record<Section, SectionTotals>;
  for (const m of movements) {
    if (m.status === 'skipped') continue;
    const s = sections[m.section];
    if (m.status === 'done') s.done += m.amountCents;
    else s.planned += m.amountCents;
    s.total += m.amountCents;
    s.count += 1;
  }
  const sum = (keys: Section[], k: keyof SectionTotals) => keys.reduce((acc, key) => acc + sections[key][k], 0);
  const inc: Section[] = ['fixed_income', 'extra_income'];
  const exp: Section[] = ['fixed_expense', 'variable_expense'];
  const incomeDone = sum(inc, 'done');
  const expenseDone = sum(exp, 'done');
  const incomeTotal = sum(inc, 'total');
  const expenseTotal = sum(exp, 'total');
  return {
    sections,
    incomeDone,
    expenseDone,
    incomeTotal,
    expenseTotal,
    balanceDone: incomeDone - expenseDone,
    forecast: incomeTotal - expenseTotal,
    pendingIncome: sum(inc, 'planned'),
    pendingExpense: sum(exp, 'planned'),
  };
}

/** Primer día del mes en formato YYYY-MM-DD. */
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`;
