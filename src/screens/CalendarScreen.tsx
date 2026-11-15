import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useState } from 'react';
import {
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
import { DayDetail } from '../components/DaySheet';
import { MonthGrid } from '../components/MonthGrid';
import { SchedulesEditor } from '../components/SchedulesEditor';
import { FormMode, ShiftForm } from '../components/ShiftForm';
import { Banner, Button, colors, ToastView, useToast } from '../components/ui';
import { useAppData } from '../data/AppData';
import { monthOf, monthTitle, sameMonth, shiftMonth } from '../lib/dates';
import type { Shift } from '../lib/types';

type Sheet =
  | { type: 'day'; date: string }
  | { type: 'form'; mode: FormMode; backToDay?: string }
  | { type: 'schedules' };

export function CalendarScreen() {
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

      <View style={{ paddingHorizontal: 14, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ fontSize: 25, fontWeight: '800', color: colors.text }}>Mis Turnos</Text><Button title="Actualizar" variant="ghost" onPress={refresh} loading={loading} /></View>
      {/* Cabecera: mes y navegación */}
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => goMonth(-1)} hitSlop={10} style={s.navBtn} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={s.monthTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {monthTitle(month)}
        </Text>
        <Pressable onPress={() => goMonth(1)} hitSlop={10} style={s.navBtn} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={26} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => setMonth(monthOf(today))}
          disabled={isCurrentMonth}
          style={[s.todayBtn, isCurrentMonth && { opacity: 0.35 }]}
          accessibilityLabel="Volver a hoy"
        >
          <Text style={s.todayBtnText}>Hoy</Text>
        </Pressable>
        <Pressable onPress={() => setSheet({ type: 'schedules' })} hitSlop={8} style={s.navBtn} accessibilityLabel="Horarios habituales y cuenta">
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} />}
      >
        {/* Leyenda */}
        <View style={s.legend}>
          {people.map((p) => (
            <View key={p.id} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: p.color }]}>
                <Text style={s.legendInitial}>{p.initial}</Text>
              </View>
              <Text style={s.legendName}>
                {p.name}
                {p.id === me?.id ? ' (tú)' : ''}
              </Text>
            </View>
          ))}
          {loading ? <Text style={s.syncing}>Actualizando…</Text> : null}
        </View>

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
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
              icon={<Ionicons name="today-outline" size={20} color="#FFFFFF" />}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </View>

      <ToastView bottom={110 + insets.bottom} />

      {/* Hoja con el detalle del día, el formulario o los horarios */}
      <Modal
        visible={!!sheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSheet}
        transparent={false}
      >
        <View style={s.sheet}>
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { backgroundColor: '#FFE066', paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: '#5C4400', textAlign: 'center', letterSpacing: 0.3 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 6, paddingBottom: 4, gap: 2 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  todayBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.today,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  todayBtnText: { color: colors.today, fontWeight: '800', fontSize: 15 },
  scroll: { paddingHorizontal: 3, paddingBottom: 16, gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingVertical: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  legendInitial: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  legendName: { fontSize: 15, fontWeight: '600', color: colors.text },
  syncing: { marginLeft: 'auto', fontSize: 13, color: colors.faint },
  tip: { textAlign: 'center', fontSize: 13, color: colors.faint, marginTop: 4 },
  bottomBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  bottomActions: { flexDirection: 'row', gap: 10 },
  selCount: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sheet: {
    flex: 1,
    backgroundColor: colors.card,
    // En web (solo revisión) se limita al ancho de un iPhone.
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null),
  },
  sheetBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    minHeight: 48,
  },
  sheetBack: { flexDirection: 'row', alignItems: 'center' },
  sheetBarText: { fontSize: 17, color: colors.text },
});
