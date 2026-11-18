import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayDetail } from './components/DaySheet';
import { MonthGrid } from './components/MonthGrid';
import { SchedulesEditor } from './components/SchedulesEditor';
import { FormMode, ShiftForm } from './components/ShiftForm';
import { Banner, Button, colors, ToastView, useToast } from '../../shared/ui';
import { pressFeedback, radius, shadow, webTransition, type InteractionState } from '../../shared/theme';
import { useAppData } from './data/AppData';
import { MonthRef, monthOf, monthTitle, sameMonth, shiftMonth } from '../../shared/lib/dates';
import type { Shift } from './types';

type Sheet =
  | { type: 'day'; date: string }
  | { type: 'form'; mode: FormMode; backToDay?: string }
  | { type: 'schedules' };

export function ShiftsScreen() {
  const data = useAppData();
  const { month, setMonth, today, people, me, isDemo, loading, loadError, refresh, signOut } = data;
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const isCurrentMonth = sameMonth(month, monthOf(today));

  const goMonth = useCallback(
    (delta: number) => {
      setMonth(shiftMonth(month, delta));
      setSelected(new Set());
    },
    [month, setMonth],
  );

  // Deslizar a izquierda/derecha para cambiar de mes.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -60) goMonth(1);
          else if (g.dx > 60) goMonth(-1);
        },
      }),
    [goMonth],
  );

  // ---------- Días ----------
  const toggleDay = (date: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const onPressDay = (date: string) => {
    if (selecting) toggleDay(date);
    else setSheet({ type: 'day', date });
  };

  // Mantener pulsado un día empieza la selección de varios días.
  const onLongPressDay = (date: string) => {
    if (!selecting) {
      setSelecting(true);
      setSelected(new Set([date]));
    } else toggleDay(date);
  };

  const exitSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // ---------- Hoja inferior ----------
  const closeSheet = () => setSheet(null);

  const openEdit = (shift: Shift, backToDay?: string) => setSheet({ type: 'form', mode: { type: 'edit', shift }, backToDay });

  const onFormDone = (message: string) => {
    toast(message);
    if (sheet?.type === 'form' && sheet.mode.type === 'bulk') {
      exitSelecting();
      setSheet(null);
    } else if (sheet?.type === 'form' && sheet.backToDay) {
      setSheet({ type: 'day', date: sheet.backToDay });
    } else setSheet(null);
  };

  const onPullRefresh = async () => {
    setPullRefreshing(true);
    await refresh();
    setPullRefreshing(false);
  };

  const sortedSelected = [...selected].sort();

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {isDemo ? (
        <View style={s.demo}>
          <Text style={s.demoText}>MODO DEMOSTRACIÓN · turnos ficticios, no se guardan</Text>
        </View>
      ) : null}

      {/* Cabecera compacta: mes, navegación y acciones en dos filas bajas. */}
      <View style={s.topRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.appName}>Nexo · Turnos</Text>
          <Text style={s.monthTitle} accessibilityRole="header" numberOfLines={1}>
            {monthName(month)} <Text style={s.monthYear}>{month.year}</Text>
          </Text>
        </View>
        <IconButton label="Actualizar" onPress={refresh} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="refresh" size={21} color={colors.text} />}
        </IconButton>
        <IconButton label="Horarios habituales y cuenta" onPress={() => setSheet({ type: 'schedules' })}>
          <Ionicons name="settings-outline" size={21} color={colors.text} />
        </IconButton>
      </View>

      <View style={s.navRow}>
        <View style={s.navGroup}>
          <IconButton label="Mes anterior" onPress={() => goMonth(-1)} compact>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </IconButton>
          <Pressable
            onPress={() => setMonth(monthOf(today))}
            disabled={isCurrentMonth}
            accessibilityRole="button"
            accessibilityLabel="Volver a hoy"
            style={(state: InteractionState) => [s.todayBtn, webTransition, pressFeedback(state, colors.elevated), isCurrentMonth && { opacity: 0.4 }]}
          >
            <Text style={s.todayBtnText}>Hoy</Text>
          </Pressable>
          <IconButton label="Mes siguiente" onPress={() => goMonth(1)} compact>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </IconButton>
        </View>
        <View style={s.legend}>
          {people.map((p) => (
            <View key={p.id} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: p.color }]}>
                <Text style={s.legendInitial}>{p.initial}</Text>
              </View>
              <Text style={[s.legendName, p.id === me?.id && { color: colors.text }]} numberOfLines={1}>
                {p.name}
                {p.id === me?.id ? ' (tú)' : ''}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={colors.muted} />}
      >
        {!data.online ? <Banner kind="warn">Sin conexión. Conservamos los últimos datos confirmados; necesitas internet para guardar.</Banner> : null}
        {loadError ? (
          <Banner kind="error" action={{ label: 'Reintentar', onPress: refresh }}>
            No se han podido cargar los turnos. {loadError}
          </Banner>
        ) : null}
        {!isDemo && !loading && !loadError && people.length > 0 && !me ? (
          <Banner kind="warn">Tu cuenta no está vinculada a ninguna persona del calendario. Revisa el paso «Vincular cuentas» del README.</Banner>
        ) : null}
        {!isDemo && !loading && !loadError && people.length === 0 ? (
          <Banner kind="warn">No tienes acceso a ningún calendario. Pide que vinculen tu cuenta desde la administración de Supabase.</Banner>
        ) : null}

        <View {...pan.panHandlers}>
          <MonthGrid
            month={month}
            today={today}
            shiftsByDate={data.shiftsByDate}
            personById={data.personById}
            selecting={selecting}
            selected={selected}
            onPressDay={onPressDay}
            onLongPressDay={onLongPressDay}
          />
        </View>

        {!selecting ? (
          <Text style={s.tip}>Toca un día para ver o añadir turnos · mantén pulsado para elegir varios</Text>
        ) : null}
      </ScrollView>

      {/* Barra inferior */}
      <View style={[s.bottomBar, { paddingBottom: 12 }]}>
        {selecting ? (
          <>
            <Text style={s.selCount}>
              {selected.size === 0 ? 'Toca los días' : `${selected.size} ${selected.size === 1 ? 'día' : 'días'}`}
            </Text>
            <View style={s.bottomActions}>
              <Button title="Cancelar" variant="secondary" onPress={exitSelecting} style={{ flex: 1 }} />
              <Button
                title="Asignar turno"
                onPress={() => setSheet({ type: 'form', mode: { type: 'bulk', dates: sortedSelected } })}
                disabled={selected.size === 0}
                style={{ flex: 1.4 }}
              />
            </View>
          </>
        ) : (
          <View style={s.bottomActions}>
            <Button
              title="Varios días"
              variant="secondary"
              onPress={() => setSelecting(true)}
              icon={<Ionicons name="checkmark-done" size={20} color={colors.text} />}
              style={{ flex: 1 }}
            />
            <Button
              title="Turno hoy"
              onPress={() => {
                setMonth(monthOf(today));
                setSheet({ type: 'day', date: today });
              }}
              icon={<Ionicons name="today-outline" size={20} color={colors.onPrimary} />}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </View>

      <ToastView bottom={110} />

      {/* Hoja con el detalle del día, el formulario o los horarios */}
      <Modal
        visible={!!sheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSheet}
        transparent={false}
      >
        <View style={[s.sheet, Platform.OS === 'web' && { paddingTop: insets.top }]}>
          <View style={s.sheetBar}>
            {sheet?.type === 'form' && sheet.backToDay ? (
              <Pressable onPress={() => setSheet({ type: 'day', date: sheet.backToDay! })} hitSlop={10} style={s.sheetBack}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={s.sheetBarText}>Día</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable onPress={closeSheet} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityLabel="Cerrar">
              <Text style={[s.sheetBarText, { fontWeight: '700' }]}>Cerrar</Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {sheet?.type === 'day' ? (
              <DayDetail
                date={sheet.date}
                footerInset={insets.bottom}
                onAdd={() => setSheet({ type: 'form', mode: { type: 'create', date: sheet.date }, backToDay: sheet.date })}
                onEdit={(shift) => openEdit(shift, sheet.date)}
              />
            ) : null}
            {sheet?.type === 'form' ? (
              <ShiftForm
                // Clave distinta para reiniciar el formulario al abrir otro turno.
                key={sheet.mode.type === 'edit' ? `e-${sheet.mode.shift.id}` : `${sheet.mode.type}`}
                mode={sheet.mode}
                footerInset={insets.bottom}
                onDone={onFormDone}
                onOpenShift={(shift) => openEdit(shift, sheet.backToDay ?? (sheet.mode.type === 'create' ? sheet.mode.date : undefined))}
              />
            ) : null}
            {sheet?.type === 'schedules' ? (
              <SchedulesEditor
                footerInset={insets.bottom}
                onSignOut={async () => {
                  setSheet(null);
                  try { await signOut(); } catch { toast('No se pudo cerrar sesión. Vuelve a intentarlo.'); }
                }}
              />
            ) : null}
          </KeyboardAvoidingView>
          <ToastView bottom={100 + insets.bottom} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// «Noviembre 2026» -> «Noviembre»; el año se muestra aparte, más tenue.
const monthName = (m: MonthRef) => monthTitle(m).replace(/\s*\d{4}$/, '');

function IconButton({
  label,
  onPress,
  disabled,
  compact,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={(state: InteractionState) => [
        compact ? s.iconBtnCompact : s.iconBtn,
        webTransition,
        pressFeedback(state, colors.elevated),
      ]}
    >
      {children}
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { backgroundColor: colors.warnBg, paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: colors.warnText, textAlign: 'center', letterSpacing: 0.3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 4 },
  appName: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
  monthTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  monthYear: { fontWeight: '500', color: colors.faint },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnCompact: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    padding: 2,
  },
  todayBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayBtnText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  legendSwatch: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  legendInitial: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  legendName: { fontSize: 14, fontWeight: '600', color: colors.muted, flexShrink: 1 },
  scroll: { paddingHorizontal: 3, paddingBottom: 16, gap: 8 },
  tip: { textAlign: 'center', fontSize: 13, color: colors.faint, marginTop: 4 },
  bottomBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    ...shadow.raised,
  },
  bottomActions: { flexDirection: 'row', gap: 10 },
  selCount: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    // En web (PWA) se limita al ancho de un iPhone.
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null),
  },
  sheetBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    minHeight: 48,
  },
  sheetBack: { flexDirection: 'row', alignItems: 'center' },
  sheetBarText: { fontSize: 17, color: colors.primary },
});
