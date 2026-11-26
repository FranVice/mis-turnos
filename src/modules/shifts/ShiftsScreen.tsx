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
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayDetail } from './components/DaySheet';
import { calendarButtons, calendarPalette } from './calendarPalette';
import { MonthGrid } from './components/MonthGrid';
import { SchedulesEditor } from './components/SchedulesEditor';
import { FormMode, ShiftForm } from './components/ShiftForm';
import { Banner, Button, colors, ToastView, useToast } from '../../shared/ui';
import { lighten, pressFeedback, radius, tint, webTransition, type InteractionState } from '../../shared/theme';
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
  const personIds = useMemo(() => people.map((p) => p.id), [people]);

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
  const lightSheet = sheet?.type === 'day' || sheet?.type === 'form';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {isDemo ? (
        <View style={s.demo}>
          <Text style={s.demoText}>MODO DEMOSTRACIÓN · turnos ficticios, no se guardan</Text>
        </View>
      ) : null}

      {/* Cabecera compacta: mes, navegación y acciones en dos filas bajas. */}
      <View style={s.topRow}>
        <View style={s.clockBackdrop} accessible={false}>
          <View style={s.clockFace}>
            <View style={s.clockTrack} />
            <View style={s.clockMinute} />
            <View style={s.clockHour} />
            <View style={s.clockPivot} />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.appName}>Mis turnos</Text>
          <Text style={s.monthTitle} accessibilityRole="header" numberOfLines={1}>
            {monthName(month)} <Text style={s.monthYear}>{month.year}</Text>
          </Text>
        </View>
        <IconButton label="Actualizar" onPress={refresh} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="refresh" size={21} color={colors.text} />}
        </IconButton>
        {data.isAdmin ? (
          <IconButton label="Panel de parejas" onPress={() => router.push('/admin')}>
            <Ionicons name="people-outline" size={21} color={colors.text} />
          </IconButton>
        ) : null}
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
            style={(state: InteractionState) => [
              s.todayBtn,
              webTransition,
              isCurrentMonth ? s.todayCurrent : pressFeedback(state, calendarPalette.panelHover),
            ]}
          >
            <Text style={[s.todayBtnText, isCurrentMonth && s.todayCurrentText]}>Hoy</Text>
          </Pressable>
          <IconButton label="Mes siguiente" onPress={() => goMonth(1)} compact>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </IconButton>
        </View>
        <View style={s.legend}>
          {people.map((p) => (
            <View key={p.id} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: tint(p.color, 0.28) }]}>
                <Text style={[s.legendInitial, { color: lighten(p.color, 0.45) }]}>{p.initial}</Text>
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
        style={s.scrollFrame}
        contentContainerStyle={s.scroll}
        indicatorStyle="black"
        persistentScrollbar
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={calendarPalette.onToday} />}
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
            personIds={personIds}
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
              <Button title="Cancelar" palette={calendarButtons.secondary} onPress={exitSelecting} style={{ flex: 1 }} />
              <Button
                title="Asignar turno"
                palette={calendarButtons.primary}
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
              palette={calendarButtons.secondary}
              onPress={() => setSelecting(true)}
              icon={<Ionicons name="checkmark-done" size={20} color={calendarButtons.secondary.fg} />}
              style={{ flex: 1 }}
            />
            <Button
              title="Turno hoy"
              palette={calendarButtons.primary}
              onPress={() => {
                setMonth(monthOf(today));
                setSheet({ type: 'day', date: today });
              }}
              icon={<Ionicons name="today-outline" size={20} color={calendarButtons.primary.fg} />}
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
        <View style={[s.sheet, lightSheet && s.lightSheet, Platform.OS === 'web' && { paddingTop: insets.top }]}>
          <View style={s.sheetBar}>
            {sheet?.type === 'form' && sheet.backToDay ? (
              <Pressable onPress={() => setSheet({ type: 'day', date: sheet.backToDay! })} hitSlop={10} style={s.sheetBack}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={[s.sheetBarText, lightSheet && s.lightSheetBarText]}>Día</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable onPress={closeSheet} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityLabel="Cerrar">
              <Text style={[s.sheetBarText, lightSheet && s.lightSheetBarText, { fontWeight: '700' }]}>Cerrar</Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {sheet?.type === 'day' ? (
              <DayDetail
                date={sheet.date}
                footerInset={insets.bottom}
                onAdd={(date) => setSheet({ type: 'form', mode: { type: 'create', date }, backToDay: date })}
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
        pressFeedback(state, calendarPalette.panelHover),
      ]}
    >
      {children}
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: calendarPalette.panel },
  demo: { backgroundColor: colors.warnBg, paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: colors.warnText, textAlign: 'center', letterSpacing: 0.3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 4, backgroundColor: calendarPalette.panel },
  clockBackdrop: { ...StyleSheet.absoluteFill, overflow: 'hidden', pointerEvents: 'none' },
  clockFace: {
    position: 'absolute',
    width: 124,
    height: 124,
    right: 76,
    top: -32,
    borderRadius: 62,
    borderWidth: 1,
    borderColor: tint(calendarPalette.today, 0.23),
    backgroundColor: tint(calendarPalette.today, 0.05),
  },
  clockTrack: { position: 'absolute', top: 10, right: 10, bottom: 10, left: 10, borderRadius: 52, borderWidth: 1, borderColor: tint(calendarPalette.today, 0.15) },
  clockMinute: { position: 'absolute', height: 32, width: 1.5, bottom: 61, left: 60, backgroundColor: tint(calendarPalette.today, 0.40) },
  clockHour: { position: 'absolute', height: 1.5, width: 23, left: 61, top: 60, backgroundColor: tint(calendarPalette.today, 0.40) },
  clockPivot: { position: 'absolute', height: 5, width: 5, top: 58, left: 58, borderRadius: 3, backgroundColor: tint(calendarPalette.today, 0.65) },
  appName: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: calendarPalette.today, letterSpacing: 1.4, textTransform: 'uppercase' },
  monthTitle: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  monthYear: { fontSize: 17, fontWeight: '600', color: calendarPalette.panelMuted, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: calendarPalette.panelControl,
    borderWidth: 1,
    borderColor: calendarPalette.panelBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnCompact: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: calendarPalette.panel,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: calendarPalette.panelControl,
    borderWidth: 1,
    borderColor: calendarPalette.panelBorder,
    borderRadius: radius.md,
  },
  todayBtn: { height: 36, paddingHorizontal: 11, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(calendarPalette.today, 0.12) },
  todayCurrent: { backgroundColor: 'transparent' },
  todayBtnText: { color: calendarPalette.today, fontWeight: '800', fontSize: 14 },
  todayCurrentText: { color: calendarPalette.panelMuted },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  legendSwatch: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  legendInitial: { fontWeight: '900', fontSize: 12 },
  legendName: { fontSize: 13, fontWeight: '600', color: calendarPalette.panelMuted, flexShrink: 1 },
  scrollFrame: { backgroundColor: calendarPalette.background },
  scroll: { paddingHorizontal: 3, paddingBottom: 16, gap: 8 },
  tip: { textAlign: 'center', fontSize: 13, color: calendarPalette.muted, marginTop: 4 },
  bottomBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    backgroundColor: calendarPalette.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: calendarPalette.border,
  },
  bottomActions: { flexDirection: 'row', gap: 10 },
  selCount: { fontSize: 15, fontWeight: '700', color: calendarPalette.ink, textAlign: 'center' },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    // En web (PWA) se limita al ancho de un iPhone.
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null),
  },
  lightSheet: { backgroundColor: calendarPalette.panel },
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
  lightSheetBarText: { color: calendarPalette.today },
});
