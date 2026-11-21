import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppData } from '../data/AppData';
import { calendarButtons, calendarPalette, shiftBadgeColors } from '../calendarPalette';
import { endsNextDay, isValidTime, longDate, shortDate } from '../../../shared/lib/dates';
import { isAllDay, KIND_LABEL, kindsFor, SaveError, Shift, ShiftKind, ShiftTemplate, shiftTitle } from '../types';
import { TimeField } from '../../../shared/ui/TimeField';
import { Banner, Button, colors, confirmAction, Segmented } from '../../../shared/ui';
import { pressFeedback, radius, webTransition, type InteractionState } from '../../../shared/theme';

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
  const { me, personById, personByUser, scheduleFor, shiftsByDate, createShift, createShifts, updateShift, deleteShift, templatesFor, createTemplate } =
    useAppData();

  const editing = mode.type === 'edit' ? mode.shift : null;
  const [baseShift, setBaseShift] = useState<Shift | null>(editing);

  // Cada persona solo crea y edita sus propios turnos.
  const personId = mode.type === 'edit' ? mode.shift.personId : (me?.id ?? null);
  const canEdit = !!personId && me?.id === personId;
  const [kind, setKind] = useState<ShiftKind | null>(mode.type === 'edit' ? mode.shift.kind : 'manana');
  const [start, setStart] = useState<string | null>(mode.type === 'edit' ? mode.shift.start : (scheduleFor(personId ?? '', 'manana')?.start ?? null));
  const [end, setEnd] = useState<string | null>(mode.type === 'edit' ? mode.shift.end : (scheduleFor(personId ?? '', 'manana')?.end ?? null));
  // Nombre propio del turno (si se eligió un turno con nombre).
  const [label, setLabel] = useState<string | null>(editing?.label ?? null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<SaveError | { type: 'validation'; message: string } | null>(null);

  const saveLock = useRef(false);
  function chooseSchedule(nextKind: ShiftKind | null) {
    const usual = personId && nextKind ? scheduleFor(personId, nextKind) : undefined;
    setStart(usual?.start ?? null);
    setEnd(usual?.end ?? null);
  }

  const person = personById(personId);
  const usual = personId && kind ? scheduleFor(personId, kind) : undefined;
  // Tipos permitidos para la persona; al editar se conserva el tipo guardado aunque ya no esté permitido.
  const allowedKinds = kindsFor(person);
  const kindOptions = editing && !allowedKinds.includes(editing.kind) ? [...allowedKinds, editing.kind] : allowedKinds;
  const templates = templatesFor(personId).filter((t) => allowedKinds.includes(t.kind));

  function chooseTemplate(t: ShiftTemplate) {
    setKind(t.kind);
    setStart(t.start);
    setEnd(t.end);
    setLabel(t.name);
    setError(null);
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name) return setTemplateError('Ponle un nombre.');
    if (!kind || isAllDay(kind)) return setTemplateError('Elige Mañana, Tarde o Noche como tipo base.');
    if (!isValidTime(start) || !isValidTime(end) || start === end) return setTemplateError('Completa la entrada y la salida.');
    setSavingTemplate(true);
    setTemplateError(null);
    const r = await createTemplate({ personId: personId!, name, kind, start: start!, end: end! });
    setSavingTemplate(false);
    if (!r.ok) return setTemplateError(r.error.type === 'network' ? 'Sin conexión.' : r.error.type === 'other' ? r.error.message : 'No se pudo guardar.');
    setLabel(r.value.name);
    setTemplateName('');
    setCreatingTemplate(false);
  }

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
    if (!personId) return 'Tu cuenta no está vinculada a ninguna persona del calendario.';
    if (!canEdit) return 'Solo ' + (person?.name ?? 'esa persona') + ' puede cambiar sus turnos.';
    if (!kind) return 'Elige el tipo de turno.';
    if (!allowedKinds.includes(kind)) return KIND_LABEL[kind] + ' no está disponible para ' + person?.name + '.';
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
    if (mode.type === 'bulk' && !(await confirmAction('Confirmar turnos', 'Se guardarán ' + datesToSave.length + ' días para ' + person?.name + ': ' + (label && !isAllDay(kind!) ? label : KIND_LABEL[kind!]) + (isAllDay(kind!) ? ' · día completo' : ' ' + start + '–' + end) + '. Los días ocupados se omiten.', 'Confirmar'))) return;
    const allDay = isAllDay(kind!);
    const input = { personId: personId!, kind: kind!, start: allDay ? '00:00' : start!, end: allDay ? '00:00' : end!, label: allDay ? null : label };
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
        return <Banner kind="error" light>{error.message}</Banner>;
      case 'duplicate':
        return (
          <Banner
            kind="warn"
            light
            action={error.existing ? { label: 'Abrir ese turno para editarlo', onPress: () => onOpenShift(error.existing!) } : undefined}
          >
            {person?.name} ya tiene un turno ese día. Solo se admite uno por persona y fecha.
          </Banner>
        );
      case 'stale': {
        if (!error.current) {
          return <Banner kind="error" light>Este turno se ha eliminado desde el otro móvil. Cierra y vuelve a crearlo si hace falta.</Banner>;
        }
        const who = personByUser(error.current.updatedBy)?.name ?? 'Otra persona';
        return (
          <Banner kind="warn" light>
            {who} ha cambiado este turno mientras lo editabas (ahora: {shiftTitle(error.current)} {error.current.start}–
            {error.current.end}). Tus horas siguen aquí: pulsa «Guardar» otra vez para aplicarlas.
          </Banner>
        );
      }
      case 'network':
        return <Banner kind="error" light>No se ha podido guardar: sin conexión con el servidor. Lo que has escrito sigue aquí; vuelve a intentarlo.</Banner>;
      default:
        return <Banner kind="error" light>No se ha podido guardar: {error.message}. Lo que has escrito sigue aquí.</Banner>;
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
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" indicatorStyle="black">
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>

        <View style={s.personRow}>
          <View style={[s.personDot, { backgroundColor: person?.color ?? colors.muted }]} />
          <Text style={s.personName}>{person?.name ?? 'Sin persona vinculada'}</Text>
        </View>
        {!canEdit && person ? <Banner kind="warn" light>Este turno es de {person.name}: solo {person.name} puede cambiarlo.</Banner> : null}

        {canEdit && templates.length > 0 ? (
          <>
            <Text style={s.label}>Mis turnos con nombre</Text>
            <View style={s.chips}>
              {templates.map((t) => {
                const active = label === t.name && kind === t.kind && start === t.start && end === t.end;
                const badge = shiftBadgeColors[t.kind];
                return (
                  <Pressable
                    key={t.id}
                    accessibilityRole="radio"
                    aria-checked={active}
                    onPress={() => chooseTemplate(t)}
                    style={(state: InteractionState) => [
                      s.chip,
                      webTransition,
                      active && { backgroundColor: badge.backgroundColor, borderColor: calendarPalette.ink },
                      pressFeedback(state, active ? badge.backgroundColor : calendarPalette.hover),
                    ]}
                  >
                    <View style={[s.chipDot, { backgroundColor: badge.color }]} />
                    <Text style={s.chipName} numberOfLines={1}>{t.name}</Text>
                    <Text style={s.chipHours}>{t.start}–{t.end}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={s.label}>{templates.length > 0 && canEdit ? 'O elige el tipo' : 'Turno'}</Text>
        <Segmented
          options={kindOptions.map((k) => ({
            value: k,
            label: KIND_LABEL[k],
            color: shiftBadgeColors[k].color,
            selectedBackground: shiftBadgeColors[k].backgroundColor,
          }))}
          palette={formPalette}
          value={kind}
          onChange={(v) => {
            chooseSchedule(v);
            setKind(v);
            setLabel(null);
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
          <TimeField label="Entrada" value={start} onChange={(v) => { setStart(v); setError(null); }} suggested={usual?.start ?? (kind === 'tarde' ? '14:00' : '06:00')} lightPalette={formPalette} />
          <TimeField label="Salida" value={end} onChange={(v) => { setEnd(v); setError(null); }} suggested={usual?.end ?? (kind === 'tarde' ? '22:00' : '14:00')} lightPalette={formPalette} />
        </View> : <Banner kind="ok" light>Día completo, sin horas obligatorias.</Banner>}
        {overnight ? <Banner kind="warn" light>Acaba al día siguiente a las {end}. Se mostrará en la fecha de inicio.</Banner> : null}

        {label && kind && !isAllDay(kind) ? (
          <View style={s.labelRow}>
            <Text style={s.hint}>Se guardará como «<Text style={s.labelName}>{label}</Text>» ({KIND_LABEL[kind]} en el calendario).</Text>
            {canEdit ? <Button title="Quitar nombre" palette={calendarButtons.ghost} onPress={() => setLabel(null)} /> : null}
          </View>
        ) : null}

        {canEdit && kind && !isAllDay(kind) ? (
          creatingTemplate ? (
            <View style={s.newTemplate}>
              <Text style={s.newTemplateTitle}>Nuevo turno con nombre</Text>
              <Text style={s.hint}>
                Se guarda con las horas de arriba ({isValidTime(start) && isValidTime(end) ? start + '–' + end : 'sin completar'}) y cuenta como{' '}
                {KIND_LABEL[kind].toLowerCase()} en el calendario.
              </Text>
              <TextInput
                value={templateName}
                onChangeText={(v) => { setTemplateName(v); setTemplateError(null); }}
                placeholder="Nombre, p. ej. Partido"
                placeholderTextColor={calendarPalette.muted}
                style={s.input}
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={saveTemplate}
                accessibilityLabel="Nombre del turno"
              />
              {templateError ? <Banner kind="error" light>{templateError}</Banner> : null}
              <View style={s.newTemplateActions}>
                <Button title="Cancelar" palette={calendarButtons.secondary} onPress={() => { setCreatingTemplate(false); setTemplateError(null); }} style={{ flex: 1 }} />
                <Button title="Guardar nombre" palette={calendarButtons.primary} onPress={saveTemplate} loading={savingTemplate} style={{ flex: 1.4 }} />
              </View>
            </View>
          ) : (
            <Button title="+ Guardar como turno con nombre" palette={calendarButtons.secondary} onPress={() => setCreatingTemplate(true)} />
          )
        ) : null}

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
          <Banner kind="warn" light action={{ label: 'Abrir ese turno para editarlo', onPress: () => onOpenShift(conflicts[0]) }}>
            {person?.name} ya tiene un turno este día ({shiftTitle(conflicts[0])} {conflicts[0].start}–{conflicts[0].end}).
          </Banner>
        ) : null}

        {errorBanner()}

        {mode.type === 'edit' && canEdit ? (
          <Button title="Eliminar turno" palette={calendarButtons.danger} onPress={remove} loading={deleting} style={{ marginTop: 8 }} />
        ) : null}
      </ScrollView>

      {/* El botón de guardar queda fijo abajo, fuera del contenido desplazable. */}
      <View style={[s.footer, { paddingBottom: 12 + footerInset }]}>
        <Button
          title={saveLabel}
          palette={calendarButtons.primary}
          onPress={save}
          loading={saving}
          disabled={!canEdit || deleting || (mode.type === 'create' && conflicts.length > 0) || (mode.type === 'bulk' && datesToSave.length === 0)}
        />
      </View>
    </View>
  );
}

const formPalette = { ...calendarPalette, border: '#879BB4' };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: calendarPalette.background },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: calendarPalette.ink },
  subtitle: { fontSize: 16, color: calendarPalette.muted, marginTop: -6, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', color: calendarPalette.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  personDot: { width: 12, height: 12, borderRadius: 6 },
  personName: { fontSize: 17, fontWeight: '700', color: calendarPalette.ink },
  hint: { fontSize: 14, color: calendarPalette.muted, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    maxWidth: '100%',
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: formPalette.border,
    backgroundColor: calendarPalette.cell,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipName: { fontSize: 15, fontWeight: '700', color: calendarPalette.ink, flexShrink: 1 },
  chipHours: { fontSize: 13, fontWeight: '600', color: calendarPalette.muted, fontVariant: ['tabular-nums'] },
  labelRow: { gap: 4 },
  labelName: { fontWeight: '800', color: calendarPalette.ink },
  newTemplate: { backgroundColor: calendarPalette.cell, borderRadius: radius.md, padding: 12, gap: 10, borderWidth: 1, borderColor: calendarPalette.border },
  newTemplateTitle: { fontSize: 16, fontWeight: '800', color: calendarPalette.ink },
  newTemplateActions: { flexDirection: 'row', gap: 10 },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: formPalette.border,
    backgroundColor: calendarPalette.cell,
    color: calendarPalette.ink,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  times: { flexDirection: 'row', gap: 10, marginTop: 4 },
  bulkInfo: { backgroundColor: calendarPalette.cell, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: calendarPalette.border },
  bulkCount: { fontSize: 17, fontWeight: '700', color: calendarPalette.ink },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: calendarPalette.border,
    backgroundColor: calendarPalette.background,
  },
});
