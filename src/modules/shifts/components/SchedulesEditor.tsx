import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../data/AppData';
import { isValidTime } from '../../../shared/lib/dates';
import { KIND_LABEL, Person, ShiftKind, TIMED_KINDS } from '../types';
import { TimeField } from './TimeField';
import { Banner, Button, colors, confirmAction, useToast } from '../../../shared/ui';

// «Horarios habituales»: horas por persona para rellenar el formulario.
// Cambiarlas no modifica los turnos ya guardados.
export function SchedulesEditor({ onSignOut, footerInset }: { onSignOut?: () => void; footerInset: number }) {
  const { people, isDemo, me, scheduleFor } = useAppData();
  return (
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: 24 + footerInset }]} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Horarios habituales</Text>
      <Text style={s.intro}>
        Se usan para rellenar las horas al elegir un turno de mañana, tarde o noche. Cambiarlos solo afecta a los turnos que se añadan a partir de ahora.
      </Text>
      {people.map((p) => (
        <View key={p.id} style={s.personBlock}>
          <View style={s.personHeader}>
            <View style={[s.dot, { backgroundColor: p.color }]} />
            <Text style={s.personName}>{p.name}</Text>
          </View>
          <ColorPicker person={p} />
          {TIMED_KINDS.map((k) => (
            <ScheduleRow key={k + (scheduleFor(p.id, k)?.start ?? '') + (scheduleFor(p.id, k)?.end ?? '')} person={p} kind={k} />
          ))}
        </View>
      ))}

      {onSignOut ? (
        <View style={s.account}>
          <Text style={s.accountText}>
            {isDemo ? 'Modo demostración (sin cuenta).' : `Sesión iniciada como ${me?.name ?? 'usuario sin vincular'}.`}
          </Text>
          {!isDemo ? <Button title="Cerrar sesión" variant="secondary" onPress={onSignOut} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ScheduleRow({ person, kind }: { person: Person; kind: ShiftKind }) {
  const { scheduleFor, saveSchedule, deleteSchedule } = useAppData();
  const toast = useToast();
  const current = scheduleFor(person.id, kind);
  const [start, setStart] = useState<string | null>(current?.start ?? null);
  const [end, setEnd] = useState<string | null>(current?.end ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const dirty = start !== (current?.start ?? null) || end !== (current?.end ?? null);

  async function save() {
    if (!isValidTime(start) || !isValidTime(end)) return setError('Completa las dos horas.');
    if (start === end) return setError('Las dos horas no pueden ser iguales.');
    setSaving(true);
    setError(null);
    try {
      const r = await saveSchedule({ personId: person.id, kind, start, end });
      if (!r.ok) return setError(r.error.type === 'network' ? 'Sin conexión. Vuelve a intentarlo.' : 'No se ha podido guardar.');
      toast(`Horario de ${KIND_LABEL[kind].toLowerCase()} de ${person.name} guardado`);
    } catch { setError('No se pudo conectar. Vuelve a intentarlo.'); }
    finally { setSaving(false); }
  }

  async function clear() {
    const ok = await confirmAction(
      'Quitar horario',
      `¿Quitar el horario habitual de ${KIND_LABEL[kind].toLowerCase()} de ${person.name}? Los turnos guardados no cambian.`,
      'Quitar',
    );
    if (!ok) return;
    setSaving(true);
    try {
      const r = await deleteSchedule(person.id, kind);
      if (!r.ok) return setError('No se ha podido quitar.');
      setStart(null); setEnd(null);
    } catch { setError('No se pudo conectar. Vuelve a intentarlo.'); }
    finally { setSaving(false); }
  }

  return (
    <View style={s.row}>
      <View style={s.rowHeader}>
        <Text style={s.kind}>{KIND_LABEL[kind]}</Text>
        {!current ? <Text style={s.unset}>Sin configurar</Text> : null}
      </View>
      <View style={s.times}>
        <TimeField label="Entrada" value={start} onChange={setStart} suggested={kind === 'tarde' ? '14:00' : '06:00'} />
        <TimeField label="Salida" value={end} onChange={setEnd} suggested={kind === 'tarde' ? '22:00' : '14:00'} />
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={s.actions}>
        {current ? <Button title="Quitar" variant="ghost" onPress={clear} disabled={saving} style={s.smallBtn} /> : null}
        <Button title="Guardar" onPress={save} disabled={!dirty} loading={saving} style={[s.smallBtn, { flex: 1 }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  intro: { fontSize: 15, color: colors.muted, lineHeight: 21, marginTop: -6 },
  personBlock: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 14, borderWidth: 1, borderColor: colors.line },
  personHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  personName: { fontSize: 20, fontWeight: '800', color: colors.text },
  row: { gap: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { fontSize: 17, fontWeight: '700', color: colors.text },
  unset: { fontSize: 14, color: colors.faint, fontStyle: 'italic' },
  times: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  smallBtn: { minHeight: 44 },
  account: { gap: 10, marginTop: 8 },
  accountText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
});

function ColorPicker({person}: {person: Person}) {
  const {saveColor} = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <View style={{gap: 8}}><Text style={s.kind}>Color de {person.name}</Text><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{['#2563EB','#C2410C','#15803D','#7E22CE','#BE123C','#0E7490'].map(color => <Pressable key={color} accessibilityRole="radio" accessibilityLabel={'Color ' + color + ' para ' + person.name} aria-checked={person.color === color} aria-disabled={busy} disabled={busy} onPress={async () => {
    setBusy(true); setError(null);
    try { const result = await saveColor(person.id, color); if (!result.ok) setError('No se pudo guardar el color.'); }
    catch { setError('Sin conexión. Vuelve a intentarlo.'); } finally {setBusy(false);}
  }} style={{width: 44, height: 44, borderRadius: 22, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: person.color === color ? colors.text : 'transparent'}}><Text style={{color: '#fff', fontSize: 20}}>{person.color === color ? '✓' : ''}</Text></Pressable>)}</View>{error ? <Banner kind="error">{error}</Banner> : null}</View>;
}
