import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarMonth } from '../../shared/calendar/CalendarMonth';
import { compactRange, longDate, MonthRef, monthOf, monthRange, monthTitle, sameMonth, shiftMonth } from '../../shared/lib/dates';
import { colors, pressFeedback, radius, tint, webTransition, type InteractionState } from '../../shared/theme';
import { Banner, ToastView, useToast } from '../../shared/ui';
import { useAppData } from '../shifts/data/AppData';
import { isAllDay, KIND_COLOR, KIND_LABEL, type Shift } from '../shifts/types';
import { useTasks } from '../tasks/data/TasksData';
import { EventForm, type EventFormMode } from './components/EventForm';
import { useEvents } from './data/EventsData';
import { buildItems, buildMarks, eventTime, TYPE_COLOR, TYPE_LABEL, type CalendarItem, type ItemType } from './items';
import type { CalEvent } from './types';

const ALL_TYPES: ItemType[] = ['shift', 'event', 'task'];
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function AgendaScreen() {
  const { people, today, isDemo, online, personById, loadShiftsRange, shiftsByDate } = useAppData();
  const { loadRange, revision, refresh: refreshEvents } = useEvents();
  const { tasks } = useTasks();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [month, setMonth] = useState<MonthRef>(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [visible, setVisible] = useState<Set<ItemType>>(() => new Set(ALL_TYPES));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<EventFormMode | null>(null);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    try {
      const [sh, ev] = await Promise.all([loadShiftsRange(from, to), loadRange(from, to)]);
      setShifts(sh);
      setEvents(ev);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido cargar la agenda.');
    }
  }, [month, loadShiftsRange, loadRange]);

  // Al cambiar de mes y cuando cambian citas (revision) o turnos (shiftsByDate).
  useEffect(() => { void Promise.resolve().then(load); }, [load, revision, shiftsByDate]);

  const items = useMemo(() => buildItems(shifts, events, tasks), [shifts, events, tasks]);
  const marks = useMemo(() => buildMarks(items, people, visible), [items, people, visible]);
  const dayItems = (items.get(selected) ?? []).filter((i) => visible.has(i.type));

  const goMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(sameMonth(next, monthOf(today)) ? today : `${next.year}-${String(next.month).padStart(2, '0')}-01`);
  };
  const goToday = () => {
    setMonth(monthOf(today));
    setSelected(today);
  };
  const toggleType = (t: ItemType) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(t) && next.size > 1) next.delete(t);
      else next.add(t);
      return next;
    });

  const onPull = async () => {
    setPulling(true);
    await Promise.all([load(), refreshEvents()]);
    setPulling(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {isDemo ? (
        <View style={s.demo}>
          <Text style={s.demoText}>MODO DEMOSTRACIÓN · datos ficticios, no se guardan</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.muted} />}
      >
        <View style={s.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.brand}>Nexo · Agenda</Text>
            <Text style={s.title} accessibilityRole="header" numberOfLines={1}>{monthTitle(month)}</Text>
          </View>
          <View style={s.nav}>
            <NavBtn label="Mes anterior" icon="chevron-back" onPress={() => goMonth(-1)} />
            <Pressable
              onPress={goToday}
              disabled={sameMonth(month, monthOf(today)) && selected === today}
              accessibilityRole="button"
              accessibilityLabel="Ir a hoy"
              style={(st: InteractionState) => [s.todayBtn, webTransition, pressFeedback(st, colors.elevated)]}
            >
              <Text style={s.todayText}>Hoy</Text>
            </Pressable>
            <NavBtn label="Mes siguiente" icon="chevron-forward" onPress={() => goMonth(1)} />
          </View>
        </View>

        {/* Filtros por tipo */}
        <View style={s.filters}>
          {ALL_TYPES.map((t) => {
            const on = visible.has(t);
            return (
              <Pressable
                key={t}
                onPress={() => toggleType(t)}
                accessibilityRole="checkbox"
                aria-checked={on}
                accessibilityLabel={`Mostrar ${TYPE_LABEL[t]}`}
                style={(st: InteractionState) => [
                  s.chip,
                  webTransition,
                  pressFeedback(st, colors.elevated),
                  on && { backgroundColor: tint(TYPE_COLOR[t], 0.18), borderColor: TYPE_COLOR[t] },
                ]}
              >
                <View style={[s.chipDot, { backgroundColor: on ? TYPE_COLOR[t] : colors.faint }]} />
                <Text style={[s.chipText, on && { color: colors.text }]}>{TYPE_LABEL[t]}</Text>
              </Pressable>
            );
          })}
        </View>

        {!online ? <Banner kind="warn">Sin conexión. Necesitas internet para guardar cambios.</Banner> : null}
        {error ? <Banner kind="error" action={{ label: 'Reintentar', onPress: load }}>{error}</Banner> : null}

        <CalendarMonth month={month} today={today} selected={selected} marks={marks} onSelect={setSelected} />
        {visible.has('shift') && people.length > 1 ? (
          <Text style={s.legend}>
            Turnos: {people.map((p) => p.name).join(' y ')}, en ese orden · M mañana · T tarde · N noche · L libre · V vacaciones
          </Text>
        ) : null}

        {/* Agenda del día */}
        <View style={s.dayHead}>
          <Text style={s.dayTitle} accessibilityRole="header">
            {selected === today ? 'Hoy · ' : ''}{capitalize(longDate(selected))}
          </Text>
          <Pressable
            onPress={() => setSheet({ type: 'create', date: selected })}
            accessibilityRole="button"
            accessibilityLabel="Nueva cita"
            style={(st: InteractionState) => [s.addBtn, webTransition, pressFeedback(st)]}
          >
            <Ionicons name="add" size={18} color={colors.onPrimary} />
            <Text style={s.addText}>Cita</Text>
          </Pressable>
        </View>

        <View style={s.card}>
          {dayItems.length === 0 ? (
            <Text style={s.emptyDay}>Nada previsto este día.</Text>
          ) : (
            dayItems.map((item, i) => (
              <AgendaRow
                key={item.key}
                item={item}
                first={i === 0}
                personName={(id) => personById(id)?.name ?? ''}
                onPress={() => {
                  if (item.type === 'event') setSheet({ type: 'edit', event: item.source });
                  else router.navigate(item.type === 'shift' ? '/turnos' : '/tareas');
                }}
              />
            ))
          )}
        </View>
      </ScrollView>

      <ToastView bottom={24} />

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
              <EventForm
                key={sheet.type === 'edit' ? sheet.event.id : 'new-' + sheet.date}
                mode={sheet}
                footerInset={insets.bottom}
                onDone={(message) => {
                  setSheet(null);
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

function NavBtn({ label, icon, onPress }: { label: string; icon: 'chevron-back' | 'chevron-forward'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={(st: InteractionState) => [s.navBtn, webTransition, pressFeedback(st, colors.elevated)]}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

function AgendaRow({ item, first, personName, onPress }: { item: CalendarItem; first: boolean; personName: (id: string) => string; onPress: () => void }) {
  let color: string;
  let time: string;
  let title: string;
  let detail: string;
  let a11yHint: string;
  if (item.type === 'shift') {
    const sh = item.source;
    color = KIND_COLOR[sh.kind];
    time = isAllDay(sh.kind) ? 'Día' : compactRange(sh.start, sh.end);
    title = `${personName(sh.personId)} · ${KIND_LABEL[sh.kind]}`;
    detail = 'Turno';
    a11yHint = 'Abrir Turnos';
  } else if (item.type === 'event') {
    const ev = item.source;
    color = TYPE_COLOR.event;
    time = eventTime(ev);
    title = ev.title;
    detail = [ev.personId ? personName(ev.personId) : 'Familia', ev.location].filter(Boolean).join(' · ');
    a11yHint = 'Editar cita';
  } else {
    const t = item.source;
    color = TYPE_COLOR.task;
    time = 'Tarea';
    title = t.title;
    detail = t.assigneeId ? personName(t.assigneeId) : 'Los dos';
    a11yHint = 'Abrir Tareas';
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${time}. ${title}. ${detail}. ${a11yHint}`}
      style={(st: InteractionState) => [s.row, !first && s.divider, webTransition, pressFeedback(st, colors.elevated)]}
    >
      <View style={[s.rowBar, { backgroundColor: color }]} />
      <Text style={s.rowTime} numberOfLines={2}>{time}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {detail ? <Text style={s.rowDetail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { backgroundColor: colors.warnBg, paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: colors.warnText, textAlign: 'center', letterSpacing: 0.3 },
  scroll: { paddingHorizontal: 4, paddingBottom: 24, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 4 },
  brand: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  nav: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, padding: 2 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 6 },
  dayTitle: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
  legend: { fontSize: 12, color: colors.faint, paddingHorizontal: 12, lineHeight: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 36 },
  addText: { color: colors.onPrimary, fontWeight: '800', fontSize: 15 },
  card: { marginHorizontal: 8, backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  emptyDay: { padding: 16, color: colors.muted, fontSize: 15, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingRight: 12, paddingLeft: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  rowTime: { width: 58, fontSize: 13, fontWeight: '700', color: colors.muted },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null),
  },
  sheetBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, minHeight: 48 },
  sheetClose: { fontSize: 17, color: colors.primary, fontWeight: '700' },
});
