import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, compactRange, longDate, shortDate, weekdayIndex } from '../../shared/lib/dates';
import { MODULES } from '../../shared/navigation/modules';
import { colors, lighten, pressFeedback, radius, tint, webTransition, type InteractionState } from '../../shared/theme';
import { Banner } from '../../shared/ui';
import { useAppData } from '../shifts/data/AppData';
import { isAllDay, KIND_COLOR, KIND_LABEL, type Person, type Shift } from '../shifts/types';
import { TaskRow } from '../tasks/components/TaskRow';
import { useTasks } from '../tasks/data/TasksData';
import { topPending } from '../tasks/logic';

// Días que mira Inicio hacia delante para buscar libres en común.
const LOOKAHEAD_DAYS = 14;
const FREE_KINDS = new Set<Shift['kind']>(['libre', 'vacaciones']);
const WEEKDAYS_SHORT_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function HomeScreen() {
  const { people, me, today, isDemo, online, loadShiftsRange, shiftsByDate } = useAppData();
  const [range, setRange] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const { tasks, refresh: refreshTasks } = useTasks();
  const pendingTasks = useMemo(() => tasks.filter((t) => !t.doneAt), [tasks]);
  const topTasks = useMemo(() => topPending(tasks, today, 3), [tasks, today]);

  const load = useCallback(async () => {
    try {
      const list = await loadShiftsRange(today, addDays(today, LOOKAHEAD_DAYS - 1));
      setRange(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido cargar los turnos.');
    }
  }, [loadShiftsRange, today]);

  // Al entrar en la pestaña y cuando cambian los turnos (también desde el otro móvil).
  useFocusEffect(useCallback(() => { void Promise.resolve().then(load); }, [load]));
  useEffect(() => { void Promise.resolve().then(load); }, [load, shiftsByDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of range ?? []) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return map;
  }, [range]);

  const todayShifts = byDate.get(today) ?? [];

  // Días en los que todas las personas están libres o de vacaciones.
  const freeTogether = useMemo(() => {
    if (people.length < 2 || !range) return [];
    const days: string[] = [];
    for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
      const date = addDays(today, i);
      const list = byDate.get(date) ?? [];
      if (people.every((p) => list.some((s) => s.personId === p.id && FREE_KINDS.has(s.kind)))) days.push(date);
    }
    return days;
  }, [people, range, byDate, today]);

  const onPull = async () => {
    setPulling(true);
    await Promise.all([load(), refreshTasks()]);
    setPulling(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {isDemo ? (
        <View style={s.demo}>
          <Text style={s.demoText}>MODO DEMOSTRACIÓN · datos ficticios</Text>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.muted} />}
      >
        <Text style={s.brand}>Nexo</Text>
        <Text style={s.hello} accessibilityRole="header">
          {greeting()}{me ? `, ${me.name}` : ''}
        </Text>
        <Text style={s.date}>{capitalize(longDate(today))}</Text>

        {!online ? <Banner kind="warn">Sin conexión. Se muestran los últimos datos cargados.</Banner> : null}
        {error ? <Banner kind="error" action={{ label: 'Reintentar', onPress: load }}>{error}</Banner> : null}

        {/* Hoy */}
        <Pressable
          onPress={() => router.navigate('/turnos')}
          accessibilityRole="button"
          accessibilityLabel="Turnos de hoy. Abrir Turnos"
          style={(st: InteractionState) => [s.card, webTransition, pressFeedback(st, colors.elevated)]}
        >
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>Turnos de hoy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </View>
          {range === null && !error ? (
            <ActivityIndicator color={colors.muted} style={{ marginVertical: 8 }} />
          ) : (
            people.map((p) => <PersonToday key={p.id} person={p} shift={todayShifts.find((x) => x.personId === p.id)} isMe={p.id === me?.id} />)
          )}
        </Pressable>

        {/* Libres en común: solo aparece si hay alguno */}
        {freeTogether.length > 0 ? (
          <View style={[s.card, { borderColor: tint(KIND_COLOR.libre, 0.5), backgroundColor: tint(KIND_COLOR.libre, 0.1) }]}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>
                <Ionicons name="sparkles" size={16} color={KIND_COLOR.libre} />{' '}
                {freeTogether[0] === today ? '¡Hoy estáis libres los dos!' : 'Libres los dos'}
              </Text>
            </View>
            <View style={s.chips}>
              {freeTogether.map((d) => (
                <View key={d} style={s.chip}>
                  <Text style={s.chipText}>
                    {d === today ? 'Hoy' : d === addDays(today, 1) ? 'Mañana' : `${WEEKDAYS_SHORT_NAMES[weekdayIndex(d)]} ${shortDate(d)}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Tareas: solo si hay pendientes */}
        {pendingTasks.length > 0 ? (
          <View style={s.card}>
            <Pressable
              onPress={() => router.navigate('/tareas')}
              accessibilityRole="button"
              accessibilityLabel={`Tareas pendientes: ${pendingTasks.length}. Abrir Tareas`}
              style={s.cardHead}
            >
              <Text style={s.cardTitle}>
                Tareas <Text style={s.cardCount}>· {pendingTasks.length} {pendingTasks.length === 1 ? 'pendiente' : 'pendientes'}</Text>
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
            <View style={s.taskList}>
              {topTasks.map((t, i) => (
                <TaskRow key={t.id} task={t} today={today} first={i === 0} compact onOpen={() => router.navigate('/tareas')} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Módulos */}
        <Text style={s.section}>Módulos</Text>
        <View style={s.grid}>
          {MODULES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => router.navigate(m.href)}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}. ${m.ready ? m.summary : 'Próximamente'}`}
              style={(st: InteractionState) => [s.tile, webTransition, pressFeedback(st, colors.elevated)]}
            >
              <View style={[s.tileIcon, { backgroundColor: tint(m.accent, 0.16) }]}>
                <Ionicons name={m.icon} size={22} color={m.accent} />
              </View>
              <Text style={s.tileTitle}>{m.title}</Text>
              <Text style={s.tileSub} numberOfLines={2}>{m.ready ? m.summary : 'Próximamente'}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PersonToday({ person, shift, isMe }: { person: Person; shift?: Shift; isMe: boolean }) {
  return (
    <View style={s.personRow}>
      <View style={[s.avatar, { backgroundColor: person.color }]}>
        <Text style={s.avatarText}>{person.initial}</Text>
      </View>
      <Text style={s.personName} numberOfLines={1}>
        {person.name}
        {isMe ? <Text style={{ color: colors.faint }}> (tú)</Text> : null}
      </Text>
      {shift ? (
        <View style={[s.kindPill, { backgroundColor: tint(KIND_COLOR[shift.kind], 0.18) }]}>
          <View style={[s.kindDot, { backgroundColor: KIND_COLOR[shift.kind] }]} />
          <Text style={[s.kindText, { color: lighten(KIND_COLOR[shift.kind], 0.2) }]}>
            {KIND_LABEL[shift.kind]}
            {!isAllDay(shift.kind) ? ` · ${compactRange(shift.start, shift.end)}` : ''}
          </Text>
        </View>
      ) : (
        <Text style={s.noShift}>Sin turno</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { backgroundColor: colors.warnBg, paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: colors.warnText, textAlign: 'center', letterSpacing: 0.3 },
  scroll: { padding: 16, paddingTop: 8, gap: 12 },
  brand: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
  hello: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.6, marginTop: -8 },
  date: { fontSize: 15, color: colors.muted, marginTop: -10, marginBottom: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  cardCount: { fontSize: 14, fontWeight: '600', color: colors.muted },
  taskList: { marginHorizontal: -14, marginBottom: -14 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  personName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  kindPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  kindText: { fontSize: 14, fontWeight: '700' },
  noShift: { fontSize: 14, color: colors.faint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: tint(KIND_COLOR.libre, 0.18), paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  chipText: { color: lighten(KIND_COLOR.libre, 0.2), fontWeight: '700', fontSize: 14 },
  section: { fontSize: 13, fontWeight: '800', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    // Tres columnas del mismo tamaño: ningún módulo destaca sobre otro.
    flexBasis: '30%',
    flexGrow: 1,
    maxWidth: '32%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  tileSub: { fontSize: 13, color: colors.muted },
});
