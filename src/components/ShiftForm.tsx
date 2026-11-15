import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../data/AppData';
import { endsNextDay, isValidTime, longDate, shortDate } from '../lib/dates';
import { isAllDay, KIND_LABEL, SaveError, Shift, ShiftKind, SHIFT_KINDS } from '../lib/types';
import { TimeField } from './TimeField';
import { Banner, Button, colors, confirmAction, Segmented } from './ui';

export type FormMode =
  | { type: 'create'; date: string; personId?: string }
  | { type: 'edit'; shift: Shift }
  | { type: 'bulk'; dates: string[] };


export function ShiftForm({
  mode,
  onDone,
  onOpenShift,
  footerInset,
}: {
  mode: FormMode;
  onDone: (message: string) => void;
  onOpenShift: (shift: Shift) => void;
  footerInset: number;
}) {
  const { people, me, personById, personByUser, scheduleFor, shiftsByDate, createShift, createShifts, updateShift, deleteShift } =
    useAppData();

  const editing = mode.type === 'edit' ? mode.shift : null;
  const [baseShift, setBaseShift] = useState<Shift | null>(editing);

  const [personId, setPersonId] = useState<string | null>(() => {
    if (mode.type === 'edit') return mode.shift.personId;
    if (mode.type === 'create' && mode.personId) return mode.personId;
    const mine = me?.id ?? people[0]?.id ?? null;
    // Si quien usa la app ya tiene turno ese día y el otro no, se propone al otro.
    if (mode.type === 'create' && mine) {
      const taken = new Set((shiftsByDate.get(mode.date) ?? []).map((sh) => sh.personId));
      if (taken.has(mine)) return people.find((p) => !taken.has(p.id))?.id ?? mine;
    }
    return mine;
  });
  const [kind, setKind] = useState<ShiftKind | null>(mode.type === 'edit' ? mode.shift.kind : 'manana');
  const [start, setStart] = useState<string | null>(mode.type === 'edit' ? mode.shift.start : (scheduleFor(personId ?? '', 'manana')?.start ?? null));
  const [end, setEnd] = useState<string | null>(mode.type === 'edit' ? mode.shift.end : (scheduleFor(personId ?? '', 'manana')?.end ?? null));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<SaveError | { type: 'validation'; message: string } | null>(null);

  const saveLock = useRef(false);
  function chooseSchedule(nextPerson: string | null, nextKind: ShiftKind | null) {
    const usual = nextPerson && nextKind ? scheduleFor(nextPerson, nextKind) : undefined;
    setStart(usual?.start ?? null);
    setEnd(usual?.end ?? null);
  }

  const person = personById(personId);
  const usual = personId && kind ? scheduleFor(personId, kind) : undefined;

  // ---------- Conflictos detectados con los datos ya cargados ----------
  const dates = useMemo(() => mode.type === 'bulk' ? mode.dates : mode.type === 'create' ? [mode.date] : [mode.shift.date], [mode]);
  const conflicts = useMemo(() => {
    if (!personId) return [] as Shift[];
    return dates
      .map((d) => shiftsByDate.get(d)?.find((s) => s.personId === personId && s.id !== editing?.id))
      .filter((s): s is Shift => !!s);
  }, [dates, personId, shiftsByDate, editing?.id]);
  const conflictDates = new Set(conflicts.map((c) => c.date));
  const datesToSave = dates.filter((d) => !conflictDates.has(d));

  // ---------- Validación ----------
  function validate(): string | null {
    if (!personId) return 'Elige la persona.';
    if (!kind) return 'Elige el tipo de turno.';
    if (isAllDay(kind)) return null;
    if (!isValidTime(start) || !isValidTime(end)) return 'Completa la hora de entrada y la de salida.';
    if (start === end) return 'La hora de entrada y la de salida no pueden ser iguales.';
    return null;
  }

  async function save() {
    const v = validate();
    if (v) {
      setError({ type: 'validation', message: v });
      return;
    }
    if (saveLock.current || saving || deleting) return;
    if (mode.type === 'bulk' && !(await confirmAction('Confirmar turnos', 'Se guardarán ' + datesToSave.length + ' días para ' + person?.name + ': ' + KIND_LABEL[kind!] + (isAllDay(kind!) ? ' · día completo' : ' ' + start + '–' + end) + '. Los días ocupados se omiten.', 'Confirmar'))) return;
    const input = { personId: personId!, kind: kind!, start: isAllDay(kind!) ? '00:00' : start!, end: isAllDay(kind!) ? '00:00' : end! };
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      if (mode.type === 'create') {
        const r = await createShift(mode.date, input);
        if (!r.ok) return setError(r.error);
        success(`Turno guardado · ${person?.name}, ${longDate(mode.date)}`);
      } else if (mode.type === 'edit' && baseShift) {
        const r = await updateShift(baseShift, input);
        if (!r.ok) {
          if (r.error.type === 'stale' && r.error.current) setBaseShift(r.error.current);
          return setError(r.error);
        }
        success('Cambios guardados');
      } else if (mode.type === 'bulk') {
        if (datesToSave.length === 0) {
          return setError({ type: 'validation', message: 'Todas las fechas elegidas ya tienen turno para esta persona.' });
        }
        const r = await createShifts(datesToSave, input);
        if (!r.ok) return setError(r.error);
        const omitted = [...conflictDates, ...r.value.skipped].sort();
        success(
          `${r.value.saved.length} ${r.value.saved.length === 1 ? 'turno guardado' : 'turnos guardados'}` +
            (omitted.length ? ` · omitidos (ya tenían turno): ${omitted.map(shortDate).join(', ')}` : ''),
        );
      }
    } catch {
      setError({ type: 'network', message: 'No se pudo conectar con el servidor.' });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function success(message: string) {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone(message);
  }

  async function remove() {
    if (!baseShift || saving || deleting) return;
    const ok = await confirmAction(
      'Eliminar turno',
      `¿Eliminar el turno de ${person?.name} del ${longDate(baseShift.date)}?`,
      'Eliminar',
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await deleteShift(baseShift);
      if (!r.ok) return setError(r.error);
      onDone('Turno eliminado');
    } catch { setError({type: 'network', message: 'Sin conexión.'}); }
    finally { setDeleting(false); }
  }

  // ---------- Texto de errores ----------
  function errorBanner() {
    if (!error) return null;
    switch (error.type) {
      case 'validation':
        return <Banner kind="error">{error.message}</Banner>;
      case 'duplicate':
        return (
          <Banner
            kind="warn"
            action={error.existing ? { label: 'Abrir ese turno para editarlo', onPress: () => onOpenShift(error.existing!) } : undefined}
          >
            {person?.name} ya tiene un turno ese día. Solo se admite uno por persona y fecha.
          </Banner>
        );
      case 'stale': {
        if (!error.current) {
          return <Banner kind="error">Este turno se ha eliminado desde el otro móvil. Cierra y vuelve a crearlo si hace falta.</Banner>;
        }
        const who = personByUser(error.current.updatedBy)?.name ?? 'Otra persona';
        return (
          <Banner kind="warn">
            {who} ha cambiado este turno mientras lo editabas (ahora: {KIND_LABEL[error.current.kind]} {error.current.start}–
            {error.current.end}). Tus horas siguen aquí: pulsa «Guardar» otra vez para aplicarlas.
          </Banner>
        );
      }
      case 'network':
        return <Banner kind="error">No se ha podido guardar: sin conexión con el servidor. Lo que has escrito sigue aquí; vuelve a intentarlo.</Banner>;
      default:
        return <Banner kind="error">No se ha podido guardar: {error.message}. Lo que has escrito sigue aquí.</Banner>;
    }
  }

  const title =
    mode.type === 'edit' ? 'Editar turno' : mode.type === 'bulk' ? `Turno para ${dates.length} días` : 'Añadir turno';
  const subtitle =
    mode.type === 'bulk'
      ? dates.map(shortDate).join(', ')
      : longDate(mode.type === 'create' ? mode.date : mode.shift.date, true);

  const overnight = kind && !isAllDay(kind) && isValidTime(start) && isValidTime(end) && start !== end && endsNextDay(start, end);

  const saveLabel =
    mode.type === 'bulk'
      ? `Guardar ${datesToSave.length} ${datesToSave.length === 1 ? 'día' : 'días'}`
      : mode.type === 'edit'
        ? 'Guardar cambios'
        : 'Guardar turno';

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>

        <Text style={s.label}>Persona</Text>
        <Segmented
          options={people.map((p) => ({ value: p.id, label: p.name, color: p.color }))}
          value={personId}
          onChange={(v) => {
            setPersonId(v);
            chooseSchedule(v, kind);
            setError(null);
          }}
        />

        <Text style={s.label}>Turno</Text>
        <Segmented
          options={SHIFT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          value={kind}
          onChange={(v) => {
            chooseSchedule(personId, v);
            setKind(v);
            setError(null);
          }}
        />
        {kind && !isAllDay(kind) && person && !usual && mode.type !== 'edit' ? (
          <Text style={s.hint}>
            {person.name} no tiene horario habitual de {KIND_LABEL[kind].toLowerCase()}. Elige las horas (puedes guardarlo en «Horarios
            habituales»).
          </Text>
        ) : null}

        {kind && !isAllDay(kind) ? <View style={s.times}>
          <TimeField label="Entrada" value={start} onChange={(v) => { setStart(v); setError(null); }} suggested={kind === 'tarde' ? '14:00' : '06:00'} />
          <TimeField label="Salida" value={end} onChange={(v) => { setEnd(v); setError(null); }} suggested={kind === 'tarde' ? '22:00' : '14:00'} />
        </View> : <Banner kind="ok">Día completo, sin horas obligatorias.</Banner>}
        {overnight ? <Banner kind="warn">Acaba al día siguiente a las {end}. Se mostrará en la fecha de inicio.</Banner> : null}

        {mode.type === 'bulk' ? (
          <View style={s.bulkInfo}>
            <Text style={s.bulkCount}>
              Se van a guardar {datesToSave.length} de {dates.length} días
            </Text>
            {conflicts.length > 0 ? (
              <Text style={s.hint}>
                Se omiten porque {person?.name} ya tiene turno: {conflicts.map((c) => shortDate(c.date)).join(', ')}.
              </Text>
            ) : null}
          </View>
        ) : mode.type === 'create' && conflicts.length > 0 ? (
          <Banner kind="warn" action={{ label: 'Abrir ese turno para editarlo', onPress: () => onOpenShift(conflicts[0]) }}>
            {person?.name} ya tiene un turno este día ({KIND_LABEL[conflicts[0].kind]} {conflicts[0].start}–{conflicts[0].end}).
          </Banner>
        ) : null}

        {errorBanner()}

        {mode.type === 'edit' ? (
          <Button title="Eliminar turno" variant="danger" onPress={remove} loading={deleting} style={{ marginTop: 8 }} />
        ) : null}
      </ScrollView>

      {/* El botón de guardar queda fijo abajo, fuera del contenido desplazable. */}
      <View style={[s.footer, { paddingBottom: 12 + footerInset }]}>
        <Button
          title={saveLabel}
          onPress={save}
          loading={saving}
          disabled={deleting || (mode.type === 'create' && conflicts.length > 0) || (mode.type === 'bulk' && datesToSave.length === 0)}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: -6, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '700', color: colors.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 14, color: colors.muted, lineHeight: 19 },
  times: { flexDirection: 'row', gap: 10, marginTop: 4 },
  bulkInfo: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 6 },
  bulkCount: { fontSize: 17, fontWeight: '700', color: colors.text },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
});
