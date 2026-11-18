import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { isValidTime, longDate } from '../../../shared/lib/dates';
import { colors, radius } from '../../../shared/theme';
import { Banner, Button, confirmAction, Segmented } from '../../../shared/ui';
import { DateField } from '../../../shared/ui/DateField';
import { TimeField } from '../../../shared/ui/TimeField';
import { useAppData } from '../../shifts/data/AppData';
import { useEvents } from '../data/EventsData';
import type { CalEvent } from '../types';

export type EventFormMode = { type: 'create'; date: string } | { type: 'edit'; event: CalEvent };

const FAMILY = 'family';
type Timing = 'allday' | 'timed';

export function EventForm({ mode, footerInset, onDone }: { mode: EventFormMode; footerInset: number; onDone: (message: string) => void }) {
  const { people } = useAppData();
  const { createEvent, updateEvent, deleteEvent } = useEvents();
  const editing = mode.type === 'edit' ? mode.event : null;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [who, setWho] = useState<string>(editing?.personId ?? FAMILY);
  const [date, setDate] = useState<string | null>(editing?.date ?? (mode.type === 'create' ? mode.date : null));
  const [timing, setTiming] = useState<Timing>(editing && !editing.start ? 'allday' : editing ? 'timed' : 'allday');
  const [start, setStart] = useState<string | null>(editing?.start ?? null);
  const [end, setEnd] = useState<string | null>(editing?.end ?? null);
  const [location, setLocation] = useState(editing?.location ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timed = timing === 'timed';
  const timeProblem = timed
    ? !isValidTime(start)
      ? 'Indica la hora de inicio.'
      : end && (!isValidTime(end) || end <= start!)
        ? 'La hora de fin debe ser posterior a la de inicio.'
        : null
    : null;
  const valid = title.trim().length > 0 && !!date && !timeProblem;

  const save = async () => {
    if (!valid || busy || !date) return;
    setBusy(true);
    setError(null);
    const input = {
      title,
      personId: who === FAMILY ? null : who,
      date,
      start: timed ? start : null,
      end: timed && end ? end : null,
      location: location || null,
      notes: notes || null,
    };
    const result = editing ? await updateEvent(editing, input) : await createEvent(input);
    setBusy(false);
    if (result.ok) onDone(editing ? 'Cita guardada' : 'Cita añadida');
    else setError(result.error.type === 'network' ? 'Sin conexión: no se ha guardado.' : result.error.message);
  };

  const remove = async () => {
    if (!editing) return;
    if (!(await confirmAction('Eliminar cita', `«${editing.title}» se borrará para los dos.`, 'Eliminar'))) return;
    setBusy(true);
    const result = await deleteEvent(editing);
    setBusy(false);
    if (result.ok) onDone('Cita eliminada');
    else setError(result.error.message);
  };

  return (
    <ScrollView contentContainerStyle={[s.wrap, { paddingBottom: 24 + footerInset }]} keyboardShouldPersistTaps="handled">
      <Text style={s.heading} accessibilityRole="header">{editing ? 'Editar cita' : 'Nueva cita'}</Text>
      {date ? <Text style={s.sub}>{longDate(date, true)}</Text> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Text style={s.label}>Cita</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Médico, cumpleaños, reunión…"
        placeholderTextColor={colors.faint}
        style={s.input}
        autoFocus={!editing}
        maxLength={200}
        accessibilityLabel="Título de la cita"
      />

      <Text style={s.label}>Para</Text>
      <Segmented
        value={who}
        onChange={setWho}
        options={[{ value: FAMILY, label: 'Familia' }, ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
      />

      <Text style={s.label}>Fecha</Text>
      <DateField label="Fecha de la cita" value={date} onChange={setDate} />

      <Text style={s.label}>Horario</Text>
      <Segmented<Timing>
        value={timing}
        onChange={(t) => {
          setTiming(t);
          if (t === 'timed' && !start) setStart('10:00');
        }}
        options={[
          { value: 'allday', label: 'Todo el día' },
          { value: 'timed', label: 'Con hora' },
        ]}
      />
      {timed ? (
        <View style={s.times}>
          <TimeField label="Inicio" value={start} onChange={setStart} suggested="10:00" />
          <TimeField label="Fin (opcional)" value={end} onChange={setEnd} suggested={start ?? '11:00'} />
        </View>
      ) : null}
      {timeProblem ? <Text style={s.problem}>{timeProblem}</Text> : null}

      <Text style={s.label}>Lugar (opcional)</Text>
      <TextInput
        value={location}
        onChangeText={setLocation}
        placeholder="Dirección o sitio"
        placeholderTextColor={colors.faint}
        style={s.input}
        maxLength={200}
        accessibilityLabel="Lugar"
      />

      <Text style={s.label}>Notas (opcional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Qué llevar, teléfonos…"
        placeholderTextColor={colors.faint}
        style={[s.input, s.notes]}
        multiline
        maxLength={2000}
        accessibilityLabel="Notas de la cita"
      />

      <View style={s.actions}>
        <Button title={editing ? 'Guardar cambios' : 'Añadir cita'} onPress={save} disabled={!valid} loading={busy} />
        {editing ? <Button title="Eliminar cita" variant="danger" onPress={remove} disabled={busy} /> : null}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 6 },
  heading: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.muted, marginBottom: 4 },
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
  notes: { minHeight: 80, textAlignVertical: 'top' },
  times: { flexDirection: 'row', gap: 10, marginTop: 8 },
  problem: { color: colors.danger, fontSize: 14, marginTop: 4 },
  actions: { gap: 10, marginTop: 22 },
});
