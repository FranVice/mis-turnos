import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthOf, monthTitle, shiftMonth, shortDate } from '../../shared/lib/dates';
import { colors, pressFeedback, radius, tint, webTransition, type InteractionState } from '../../shared/theme';
import { Banner, ToastView, useToast } from '../../shared/ui';
import { useAppData } from '../shifts/data/AppData';
import { MovementForm, type MovementFormMode } from './components/MovementForm';
import { useFinances } from './data/FinancesData';
import { formatEuros, isIncome, monthKey, SECTION_LABEL, SECTIONS, summarize, type Section } from './logic';
import type { Movement } from './types';

const INCOME = colors.okText;
const EXPENSE = colors.danger;

const parseMonth = (key: string) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });

export function EconomyScreen() {
  const { today, isDemo, online, personById } = useAppData();
  const { month, setMonth, movements, loading, loadError, refresh, setStatus } = useFinances();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Set<Section>>(new Set());
  const [sheet, setSheet] = useState<MovementFormMode | null>(null);
  const [pulling, setPulling] = useState(false);

  const summary = useMemo(() => summarize(movements), [movements]);
  const bySection = useMemo(() => {
    const map = new Map<Section, Movement[]>(SECTIONS.map((s) => [s, []]));
    const order = { done: 0, planned: 1, skipped: 2 };
    for (const m of movements) map.get(m.section)!.push(m);
    for (const list of map.values())
      list.sort((a, b) => order[a.status] - order[b.status] || (a.date ?? '9').localeCompare(b.date ?? '9') || a.concept.localeCompare(b.concept));
    return map;
  }, [movements]);

  const ref = parseMonth(month);
  const currentKey = (() => { const m = monthOf(today); return monthKey(m.year, m.month); })();
  const goMonth = (delta: number) => {
    const m = shiftMonth(ref, delta);
    setMonth(monthKey(m.year, m.month));
  };
  const toggleOpen = (s: Section) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const toggleStatus = async (m: Movement) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    const next = m.status === 'done' ? 'planned' : 'done';
    const result = await setStatus(m, next);
    if (result.ok) toast(next === 'done' ? (isIncome(m.section) ? 'Cobrado' : 'Pagado') : 'Marcado como previsto');
    else toast(result.error.message);
  };

  const onPull = async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {isDemo ? (
        <View style={s.demo}>
          <Text style={s.demoText}>MODO DEMOSTRACIÓN · importes ficticios, no se guardan</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.muted} />}>
        <View style={s.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.brand}>Nexo · Economía</Text>
            <Text style={s.title} accessibilityRole="header" numberOfLines={1}>
              {monthTitle(ref).replace(/\s*\d{4}$/, '')} <Text style={s.titleYear}>{monthTitle(ref).slice(-4)}</Text>
            </Text>
          </View>
          <View style={s.nav}>
            <NavBtn label="Mes anterior" icon="chevron-back" onPress={() => goMonth(-1)} />
            <Pressable
              onPress={() => setMonth(currentKey)}
              disabled={month === currentKey}
              accessibilityRole="button"
              accessibilityLabel="Mes actual"
              style={(st: InteractionState) => [s.todayBtn, webTransition, pressFeedback(st, colors.elevated), month === currentKey && { opacity: 0.4 }]}
            >
              <Text style={s.todayText}>Hoy</Text>
            </Pressable>
            <NavBtn label="Mes siguiente" icon="chevron-forward" onPress={() => goMonth(1)} />
          </View>
        </View>

        {!online ? <Banner kind="warn">Sin conexión. Necesitas internet para guardar cambios.</Banner> : null}
        {loadError ? <Banner kind="error" action={{ label: 'Reintentar', onPress: refresh }}>No se ha podido cargar el mes. {loadError}</Banner> : null}

        {/* Resumen */}
        <View style={s.summary} accessibilityLabel={`Resumen. Ingresos ${formatEuros(summary.incomeDone)}. Gastos ${formatEuros(summary.expenseDone)}. Saldo ${formatEuros(summary.balanceDone)}. Previsión de cierre ${formatEuros(summary.forecast)}.`}>
          <View style={s.kpis}>
            <Kpi label="Ingresos" value={summary.incomeDone} color={INCOME} of={summary.incomeTotal} />
            <Kpi label="Gastos" value={summary.expenseDone} color={EXPENSE} of={summary.expenseTotal} />
            <Kpi label="Saldo" value={summary.balanceDone} color={summary.balanceDone >= 0 ? colors.text : EXPENSE} />
          </View>
          <View style={s.forecast}>
            <View style={{ flex: 1 }}>
              <Text style={s.forecastLabel}>Previsión de cierre</Text>
              <Text style={s.forecastHint}>
                {summary.pendingIncome || summary.pendingExpense
                  ? `Falta ${formatEuros(summary.pendingIncome, { decimals: false })} por cobrar y ${formatEuros(summary.pendingExpense, { decimals: false })} por pagar`
                  : 'Todo lo previsto está confirmado'}
              </Text>
            </View>
            <Text style={[s.forecastValue, { color: summary.forecast >= 0 ? INCOME : EXPENSE }]}>{formatEuros(summary.forecast, { sign: true })}</Text>
          </View>
        </View>

        {/* Secciones desplegables */}
        {SECTIONS.map((sec) => {
          const list = bySection.get(sec) ?? [];
          const t = summary.sections[sec];
          const isOpen = open.has(sec);
          const color = isIncome(sec) ? INCOME : EXPENSE;
          return (
            <View key={sec} style={s.section}>
              <Pressable
                onPress={() => toggleOpen(sec)}
                accessibilityRole="button"
                aria-expanded={isOpen}
                accessibilityLabel={`${SECTION_LABEL[sec]}. Total ${formatEuros(t.total)}. ${t.count} movimientos`}
                style={(st: InteractionState) => [s.sectionHead, webTransition, pressFeedback(st, colors.elevated)]}
              >
                <View style={[s.sectionBar, { backgroundColor: color }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.sectionTitle}>{SECTION_LABEL[sec]}</Text>
                  <Text style={s.sectionMeta}>
                    {t.count === 0 ? 'Sin movimientos' : t.planned ? `${formatEuros(t.done, { decimals: false })} hecho · ${formatEuros(t.planned, { decimals: false })} previsto` : `${t.count} ${t.count === 1 ? 'movimiento' : 'movimientos'}`}
                  </Text>
                </View>
                <Text style={[s.sectionTotal, { color: t.total ? color : colors.faint }]}>{formatEuros(t.total)}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
              </Pressable>

              {isOpen ? (
                <View style={s.rows}>
                  {list.map((m) => (
                    <MovementRow
                      key={m.id}
                      m={m}
                      who={m.personId ? personById(m.personId)?.name : undefined}
                      onToggle={() => toggleStatus(m)}
                      onOpen={() => setSheet({ type: 'edit', movement: m })}
                    />
                  ))}
                  <Pressable
                    onPress={() => setSheet({ type: 'create', section: sec })}
                    accessibilityRole="button"
                    accessibilityLabel={`Añadir a ${SECTION_LABEL[sec]}`}
                    style={(st: InteractionState) => [s.addRow, webTransition, pressFeedback(st, colors.elevated)]}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    <Text style={s.addRowText}>Añadir</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}

        {!loading && !loadError && movements.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Empezad por lo fijo</Text>
            <Text style={s.emptyText}>Añadid vuestras nóminas y gastos fijos una sola vez: se repetirán cada mes como previstos y solo tendréis que confirmarlos.</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Añadir rápido: el caso más habitual es un gasto variable */}
      <Pressable
        onPress={() => setSheet({ type: 'create', section: 'variable_expense' })}
        accessibilityRole="button"
        accessibilityLabel="Añadir movimiento"
        style={(st: InteractionState) => [s.fab, webTransition, pressFeedback(st)]}
      >
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={s.fabText}>Movimiento</Text>
      </Pressable>

      <ToastView bottom={84} />

      <Modal visible={!!sheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <View style={[s.sheet, Platform.OS === 'web' && { paddingTop: insets.top }]}>
          <View style={s.sheetBar}>
            <View />
            <Pressable onPress={() => setSheet(null)} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityLabel="Cerrar">
              <Text style={s.sheetClose}>Cerrar</Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {sheet ? (
              <MovementForm
                key={sheet.type === 'edit' ? sheet.movement.id : 'new-' + sheet.section}
                mode={sheet}
                footerInset={insets.bottom}
                onDone={(message, section) => {
                  setSheet(null);
                  setOpen((prev) => new Set(prev).add(section));
                  toast(message);
                }}
              />
            ) : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Kpi({ label, value, color, of }: { label: string; value: number; color: string; of?: number }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {formatEuros(value, { decimals: false })}
      </Text>
      {of !== undefined && of !== value ? <Text style={s.kpiOf} numberOfLines={1}>de {formatEuros(of, { decimals: false })}</Text> : null}
    </View>
  );
}

function MovementRow({ m, who, onToggle, onOpen }: { m: Movement; who?: string; onToggle: () => void; onOpen: () => void }) {
  const skipped = m.status === 'skipped';
  const done = m.status === 'done';
  const color = isIncome(m.section) ? INCOME : EXPENSE;
  const meta = [m.date ? shortDate(m.date) : null, who, m.recurringId ? 'cada mes' : null, skipped ? 'omitido este mes' : null].filter(Boolean).join(' · ');
  return (
    <View style={s.row}>
      {!skipped ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          aria-checked={done}
          accessibilityLabel={`${done ? 'Marcar como previsto' : isIncome(m.section) ? 'Marcar como cobrado' : 'Marcar como pagado'}: ${m.concept}`}
          hitSlop={8}
          style={s.checkHit}
        >
          <View style={[s.check, done && { backgroundColor: color, borderColor: color }]}>
            {done ? <Ionicons name="checkmark" size={13} color={colors.bg} /> : null}
          </View>
        </Pressable>
      ) : (
        <View style={s.checkHit}>
          <Ionicons name="remove-circle-outline" size={20} color={colors.faint} />
        </View>
      )}
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${m.concept}, ${formatEuros(m.amountCents)}, ${skipped ? 'omitido' : done ? 'hecho' : 'previsto'}`}
        style={(st: InteractionState) => [s.rowBody, webTransition, pressFeedback(st)]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.concept, skipped && s.struck, !done && !skipped && { color: colors.muted }]} numberOfLines={1}>{m.concept}</Text>
          {meta ? <Text style={s.meta} numberOfLines={1}>{meta}</Text> : null}
        </View>
        <Text style={[s.amount, { color: skipped ? colors.faint : done ? color : tint(color, 0.75) }, skipped && s.struck]}>
          {formatEuros(m.amountCents)}
        </Text>
      </Pressable>
    </View>
  );
}

function NavBtn({ label, icon, onPress }: { label: string; icon: 'chevron-back' | 'chevron-forward'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={(st: InteractionState) => [s.navBtn, webTransition, pressFeedback(st, colors.elevated)]}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { backgroundColor: colors.warnBg, paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: colors.warnText, textAlign: 'center', letterSpacing: 0.3 },
  scroll: { padding: 12, paddingBottom: 96, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 4 },
  brand: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  titleYear: { fontWeight: '500', color: colors.faint },
  nav: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, padding: 2 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  summary: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 12 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, minWidth: 0, gap: 2 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  kpiOf: { fontSize: 12, color: colors.faint },
  forecast: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 12 },
  forecastLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  forecastHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  forecastValue: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  section: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingRight: 12, paddingLeft: 10, minHeight: 60 },
  sectionBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sectionTotal: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  checkHit: { paddingVertical: 10, paddingRight: 10, width: 34, alignItems: 'center' },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingRight: 12 },
  concept: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.faint, marginTop: 1 },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right' },
  struck: { textDecorationLine: 'line-through' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14 },
  addRowText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  empty: { padding: 16, gap: 6, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 52,
    boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
  },
  fabText: { color: colors.onPrimary, fontWeight: '800', fontSize: 16 },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null),
  },
  sheetBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, minHeight: 48 },
  sheetClose: { fontSize: 17, color: colors.primary, fontWeight: '700' },
});
