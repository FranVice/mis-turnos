import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { moduleByKey } from '../../shared/navigation/modules';
import { colors, pressFeedback, radius, tint, webTransition, type InteractionState } from '../../shared/theme';
import { Banner, Segmented, ToastView, useToast } from '../../shared/ui';
import { useAppData } from '../shifts/data/AppData';
import { TaskForm, type TaskFormMode } from './components/TaskForm';
import { TaskRow } from './components/TaskRow';
import { useTasks } from './data/TasksData';
import { BUCKET_LABEL, groupPending, matchesFilter, type Filter } from './logic';
import type { Task } from './types';

const ACCENT = moduleByKey('tareas').accent;

export function TasksScreen() {
  const { me, today, isDemo, online } = useAppData();
  const { tasks, loading, loadError, refresh, createTask, setDone } = useTasks();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<Filter>('all');
  const [quick, setQuick] = useState('');
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState<TaskFormMode | null>(null);
  const [pulling, setPulling] = useState(false);

  const visible = useMemo(() => tasks.filter((t) => matchesFilter(t, filter, me?.id ?? null)), [tasks, filter, me]);
  const groups = useMemo(() => (filter === 'done' ? [] : groupPending(visible, today)), [visible, filter, today]);
  const done = useMemo(
    () => (filter === 'done' ? [...visible].sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')) : []),
    [visible, filter],
  );
  const pendingCount = tasks.filter((t) => !t.doneAt).length;

  // Añadir rápido: escribir y pulsar intro. Se crea «de los dos» y sin fecha.
  const quickAdd = async () => {
    const title = quick.trim();
    if (!title || adding) return;
    setAdding(true);
    const result = await createTask({ title, notes: null, assigneeId: null, dueDate: null });
    setAdding(false);
    if (result.ok) {
      setQuick('');
      toast('Tarea añadida');
    } else toast(result.error.type === 'network' ? 'Sin conexión: no se ha guardado' : result.error.message);
  };

  const toggle = async (task: Task) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    const result = await setDone(task, !task.doneAt);
    if (result.ok) toast(task.doneAt ? 'Tarea reabierta' : 'Hecha');
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
          <Text style={s.demoText}>MODO DEMOSTRACIÓN · tareas ficticias, no se guardan</Text>
        </View>
      ) : null}

      <View style={s.header}>
        <Text style={s.brand}>Nexo · Tareas</Text>
        <Text style={s.title} accessibilityRole="header">Tareas</Text>
        <Text style={s.subtitle}>
          {pendingCount === 0 ? 'Todo al día' : `${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}`}
        </Text>
      </View>

      {/* Añadir rápido */}
      <View style={s.quickRow}>
        <View style={s.quickBox}>
          <Ionicons name="add-circle" size={22} color={ACCENT} />
          <TextInput
            value={quick}
            onChangeText={setQuick}
            onSubmitEditing={quickAdd}
            placeholder="Añadir tarea…"
            placeholderTextColor={colors.faint}
            returnKeyType="done"
            blurOnSubmit={false}
            maxLength={200}
            style={s.quickInput}
            accessibilityLabel="Añadir tarea rápida"
          />
          {quick.trim() ? (
            <Pressable onPress={quickAdd} disabled={adding} accessibilityRole="button" accessibilityLabel="Guardar tarea" hitSlop={8} style={s.quickSend}>
              <Ionicons name="arrow-up-circle" size={30} color={ACCENT} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSheet({ type: 'create', title: quick })}
          accessibilityRole="button"
          accessibilityLabel="Nueva tarea con detalles"
          style={(st: InteractionState) => [s.detailBtn, webTransition, pressFeedback(st, colors.elevated)]}
        >
          <Ionicons name="options-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={s.filters}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'mine', label: 'Mías' },
            { value: 'done', label: 'Hechas' },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.muted} />}
      >
        {!online ? <Banner kind="warn">Sin conexión. Necesitas internet para guardar cambios.</Banner> : null}
        {loadError ? <Banner kind="error" action={{ label: 'Reintentar', onPress: refresh }}>No se han podido cargar las tareas. {loadError}</Banner> : null}

        {groups.map((g) => (
          <View key={g.bucket} style={s.section}>
            <Text style={[s.sectionTitle, g.bucket === 'overdue' && { color: colors.danger }]}>
              {BUCKET_LABEL[g.bucket]} · {g.tasks.length}
            </Text>
            <View style={s.card}>
              {g.tasks.map((t, i) => (
                <TaskRow key={t.id} task={t} today={today} first={i === 0} onToggle={toggle} onOpen={() => setSheet({ type: 'edit', task: t })} />
              ))}
            </View>
          </View>
        ))}

        {done.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Completadas (últimos 30 días) · {done.length}</Text>
            <View style={s.card}>
              {done.map((t, i) => (
                <TaskRow key={t.id} task={t} today={today} first={i === 0} onToggle={toggle} onOpen={() => setSheet({ type: 'edit', task: t })} />
              ))}
            </View>
          </View>
        ) : null}

        {!loading && !loadError && groups.length === 0 && done.length === 0 ? (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: tint(ACCENT, 0.16) }]}>
              <Ionicons name={filter === 'done' ? 'time-outline' : 'checkmark-done'} size={30} color={ACCENT} />
            </View>
            <Text style={s.emptyTitle}>{filter === 'done' ? 'Aún no hay tareas hechas' : 'Todo al día'}</Text>
            <Text style={s.emptyText}>
              {filter === 'done' ? 'Las tareas completadas aparecerán aquí durante 30 días.' : 'Escribe arriba para añadir una tarea en segundos.'}
            </Text>
          </View>
        ) : null}
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
              <TaskForm
                key={sheet.type === 'edit' ? sheet.task.id : 'new'}
                mode={sheet}
                footerInset={insets.bottom}
                onDone={(message) => {
                  if (sheet.type === 'create') setQuick('');
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { backgroundColor: colors.warnBg, paddingVertical: 6, paddingHorizontal: 12 },
  demoText: { fontSize: 12, fontWeight: '800', color: colors.warnText, textAlign: 'center', letterSpacing: 0.3 },
  header: { paddingHorizontal: 16, paddingTop: 4 },
  brand: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  subtitle: { fontSize: 15, color: colors.muted },
  quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  quickBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  quickInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, paddingVertical: 10 },
  quickSend: { padding: 2 },
  detailBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  scroll: { padding: 16, paddingTop: 8, gap: 14 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    ...(Platform.OS === 'web' ? { width: '100%' as const, maxWidth: 760, alignSelf: 'center' as const } : null),
  },
  sheetBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, minHeight: 48 },
  sheetClose: { fontSize: 17, color: colors.primary, fontWeight: '700' },
});
