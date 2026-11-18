import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays } from '../../../shared/lib/dates';
import { colors, radius } from '../../../shared/theme';
import { Banner, Button, confirmAction, Segmented } from '../../../shared/ui';
import { DateField } from '../../../shared/ui/DateField';
import { useAppData } from '../../shifts/data/AppData';
import { useTasks } from '../data/TasksData';
import type { Task } from '../types';

export type TaskFormMode = { type: 'create'; title?: string } | { type: 'edit'; task: Task };

type DueChoice = 'none' | 'today' | 'tomorrow' | 'other';
const BOTH = 'both';

export function TaskForm({ mode, footerInset, onDone }: { mode: TaskFormMode; footerInset: number; onDone: (message: string) => void }) {
  const { people, today } = useAppData();
  const { createTask, updateTask, setDone, deleteTask } = useTasks();
  const editing = mode.type === 'edit' ? mode.task : null;
  const tomorrow = addDays(today, 1);

  const [title, setTitle] = useState(editing?.title ?? (mode.type === 'create' ? mode.title ?? '' : ''));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [assignee, setAssignee] = useState<string>(editing?.assigneeId ?? BOTH);
  const [dueDate, setDueDate] = useState<string | null>(editing?.dueDate ?? null);
  const [dueChoice, setDueChoice] = useState<DueChoice>(() => {
    const d = editing?.dueDate ?? null;
    if (!d) return 'none';
    if (d === today) return 'today';
    if (d === tomorrow) return 'tomorrow';
    return 'other';
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseDue = (c: DueChoice) => {
    setDueChoice(c);
    if (c === 'none') setDueDate(null);
    if (c === 'today') setDueDate(today);
    if (c === 'tomorrow') setDueDate(tomorrow);
    if (c === 'other') setDueDate((d) => d ?? addDays(today, 7));
  };

  const valid = title.trim().length > 0 && title.trim().length <= 200 && (dueChoice !== 'other' || !!dueDate);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const input = { title, notes: notes || null, assigneeId: assignee === BOTH ? null : assignee, dueDate };
    const result = editing ? await updateTask(editing, input) : await createTask(input);
    setBusy(false);
    if (result.ok) onDone(editing ? 'Tarea guardada' : 'Tarea añadida');
    else setError(result.error.type === 'network' ? 'Sin conexión: no se ha guardado.' : result.error.message);
  };

  const toggleDone = async () => {
    if (!editing) return;
    setBusy(true);
    const result = await setDone(editing, !editing.doneAt);
    setBusy(false);
    if (result.ok) onDone(editing.doneAt ? 'Tarea reabierta' : 'Tarea completada');
    else setError(result.error.message);
  };

  const remove = async () => {
    if (!editing) return;
    if (!(await confirmAction('Eliminar tarea', `«${editing.title}» se borrará para los dos.`, 'Eliminar'))) return;
    setBusy(true);
    const result = await deleteTask(editing);
    setBusy(false);
    if (result.ok) onDone('Tarea eliminada');
    else setError(result.error.message);
  };

  return (
    <ScrollView contentContainerStyle={[s.wrap, { paddingBottom: 24 + footerInset }]} keyboardShouldPersistTaps="handled">
      <Text style={s.heading} accessibilityRole="header">{editing ? 'Editar tarea' : 'Nueva tarea'}</Text>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Text style={s.label}>Tarea</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="¿Qué hay que hacer?"
        placeholderTextColor={colors.faint}
        style={s.input}
        autoFocus={!editing}
        maxLength={200}
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="Título de la tarea"
      />

      <Text style={s.label}>Responsable</Text>
      <Segmented
        value={assignee}
        onChange={setAssignee}
        options={[{ value: BOTH, label: 'Los dos' }, ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
      />

      <Text style={s.label}>Fecha</Text>
      <Segmented<DueChoice>
        minItemWidth={60}
        value={dueChoice}
        onChange={chooseDue}
        options={[
          { value: 'none', label: 'Sin fecha' },
          { value: 'today', label: 'Hoy' },
          { value: 'tomorrow', label: 'Mañana' },
          { value: 'other', label: 'Otra' },
        ]}
      />
      {dueChoice === 'other' ? (
        <View style={{ marginTop: 8 }}>
          <DateField label="Fecha de la tarea" value={dueDate} onChange={setDueDate} />
        </View>
      ) : null}

      <Text style={s.label}>Notas (opcional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Detalles, teléfonos, enlaces…"
        placeholderTextColor={colors.faint}
        style={[s.input, s.notes]}
        multiline
        maxLength={2000}
        accessibilityLabel="Notas"
      />

      <View style={s.actions}>
        <Button title={editing ? 'Guardar cambios' : 'Añadir tarea'} onPress={save} disabled={!valid} loading={busy} />
        {editing ? (
          <>
            <Button title={editing.doneAt ? 'Marcar como pendiente' : 'Marcar como hecha'} variant="secondary" onPress={toggleDone} disabled={busy} />
            <Button title="Eliminar tarea" variant="danger" onPress={remove} disabled={busy} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 6 },
  heading: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 2 },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  notes: { minHeight: 90, textAlignVertical: 'top' },
  actions: { gap: 10, marginTop: 22 },
});
