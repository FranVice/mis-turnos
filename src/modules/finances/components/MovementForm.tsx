import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../../../shared/theme';
import { Banner, Button, confirmAction, Segmented } from '../../../shared/ui';
import { DateField } from '../../../shared/ui/DateField';
import { useAppData } from '../../shifts/data/AppData';
import { useFinances } from '../data/FinancesData';
import { centsToInput, formatEuros, isFixed, isIncome, parseEuros, SECTION_LABEL, type Section, type Status } from '../logic';
import type { Movement } from '../types';

export type MovementFormMode = { type: 'create'; section: Section } | { type: 'edit'; movement: Movement };

const FAMILY = 'family';
const SECTION_SHORT: Record<Section, string> = {
  fixed_income: 'Ingreso fijo',
  extra_income: 'Ingreso extra',
  fixed_expense: 'Gasto fijo',
  variable_expense: 'Gasto variable',
};

export function MovementForm({ mode, footerInset, onDone }: { mode: MovementFormMode; footerInset: number; onDone: (message: string, section: Section) => void }) {
  const { people, today } = useAppData();
  const { month, recurringById, createMovement, updateMovement, removeMovement, stopRecurring } = useFinances();
  const editing = mode.type === 'edit' ? mode.movement : null;
  const template = editing?.recurringId ? recurringById.get(editing.recurringId) : undefined;
  const isCurrentMonth = today.slice(0, 7) === month.slice(0, 7);

  const [section, setSection] = useState<Section>(editing?.section ?? (mode.type === 'create' ? mode.section : 'variable_expense'));
  const [concept, setConcept] = useState(editing?.concept ?? '');
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amountCents) : '');
  const [status, setStatus] = useState<Status>(editing?.status === 'done' ? 'done' : editing ? 'planned' : isFixed(section) ? 'planned' : 'done');
  const [date, setDate] = useState<string | null>(editing ? editing.date : isCurrentMonth && !isFixed(section) ? today : null);
  const [who, setWho] = useState<string>(editing?.personId ?? FAMILY);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [repeat, setRepeat] = useState<'yes' | 'no'>('yes');
  const [scope, setScope] = useState<'this' | 'following'>('this');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseEuros(amount);
  const dateInMonth = !date || date.slice(0, 7) === month.slice(0, 7);
  const valid = concept.trim().length > 0 && cents !== null && dateInMonth;
  const fixed = isFixed(section);

  const chooseSection = (s: Section) => {
    setSection(s);
    if (!editing) {
      setStatus(isFixed(s) ? 'planned' : 'done');
      if (!isFixed(s) && !date && isCurrentMonth) setDate(today);
    }
  };

  const save = async () => {
    if (!valid || busy || cents === null) return;
    setBusy(true);
    setError(null);
    const input = { section, concept, amountCents: cents, status, date, personId: who === FAMILY ? null : who, notes: notes || null };
    const result = editing
      ? await updateMovement(editing, input, scope === 'following')
      : await createMovement(input, fixed && repeat === 'yes');
    setBusy(false);
    if (result.ok) onDone(editing ? 'Movimiento guardado' : `${SECTION_SHORT[section]} añadido`, section);
    else setError(result.error.type === 'network' ? 'Sin conexión: no se ha guardado.' : result.error.message);
  };

  const remove = async () => {
    if (!editing) return;
    const skip = !!editing.recurringId;
    const ok = await confirmAction(
      skip ? 'Quitar de este mes' : 'Eliminar movimiento',
      skip ? `«${editing.concept}» no contará este mes. Los demás meses no cambian.` : `«${editing.concept}» se borrará para los dos.`,
      skip ? 'Quitar' : 'Eliminar',
    );
    if (!ok) return;
    setBusy(true);
    const result = await removeMovement(editing);
    setBusy(false);
    if (result.ok) onDone(skip ? 'Quitado de este mes' : 'Movimiento eliminado', section);
    else setError(result.error.message);
  };

  const stop = async () => {
    if (!editing) return;
    if (!(await confirmAction('Dejar de repetir', `«${editing.concept}» ya no se añadirá a partir del mes que viene.`, 'Dejar de repetir'))) return;
    setBusy(true);
    const result = await stopRecurring(editing);
    setBusy(false);
    if (result.ok) onDone('Ya no se repetirá', section);
    else setError(result.error.message);
  };

  return (
    <ScrollView contentContainerStyle={[s.wrap, { paddingBottom: 24 + footerInset }]} keyboardShouldPersistTaps="handled">
      <Text style={s.heading} accessibilityRole="header">{editing ? 'Editar movimiento' : 'Nuevo movimiento'}</Text>
      {error ? <Banner kind="error">{error}</Banner> : null}

      {!editing ? (
        <>
          <Text style={s.label}>Tipo</Text>
          <Segmented<Section>
            minItemWidth={140}
            value={section}
            onChange={chooseSection}
            options={(['fixed_income', 'extra_income', 'fixed_expense', 'variable_expense'] as Section[]).map((v) => ({
              value: v,
              label: SECTION_SHORT[v],
              color: isIncome(v) ? colors.okText : colors.danger,
            }))}
          />
        </>
      ) : (
        <Text style={s.sub}>{SECTION_LABEL[section]}{template ? ' · se repite cada mes' : ''}</Text>
      )}

      <Text style={s.label}>Concepto</Text>
      <TextInput
        value={concept}
        onChangeText={setConcept}
        placeholder={isIncome(section) ? 'Nómina, venta, regalo…' : 'Supermercado, luz, gasolina…'}
        placeholderTextColor={colors.faint}
        style={s.input}
        autoFocus={!editing}
        maxLength={120}
        accessibilityLabel="Concepto"
      />

      <Text style={s.label}>Importe</Text>
      <View style={s.amountBox}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0,00"
          placeholderTextColor={colors.faint}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={[s.amountInput, { color: isIncome(section) ? colors.okText : colors.text }]}
          accessibilityLabel="Importe en euros"
          onSubmitEditing={save}
        />
        <Text style={s.euro}>€</Text>
      </View>
      {amount && cents === null ? <Text style={s.problem}>Escribe un importe válido, por ejemplo 12,50.</Text> : null}
      {cents !== null ? <Text style={s.hint}>{formatEuros(cents)}</Text> : null}

      <Text style={s.label}>Estado</Text>
      <Segmented<Status>
        value={status}
        onChange={setStatus}
        options={[
          { value: 'planned', label: 'Previsto' },
          { value: 'done', label: isIncome(section) ? 'Cobrado' : 'Pagado' },
        ]}
      />

      {fixed && !editing ? (
        <>
          <Text style={s.label}>¿Se repite cada mes?</Text>
          <Segmented
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: 'yes', label: 'Sí, cada mes' },
              { value: 'no', label: 'Solo este mes' },
            ]}
          />
        </>
      ) : null}

      <Text style={s.label}>Fecha (opcional)</Text>
      <DateField label="Fecha del movimiento" value={date} onChange={setDate} />
      {!dateInMonth ? <Text style={s.problem}>La fecha debe estar dentro del mes seleccionado.</Text> : null}

      <Text style={s.label}>De quién (opcional)</Text>
      <Segmented
        value={who}
        onChange={setWho}
        options={[{ value: FAMILY, label: 'Familia' }, ...people.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
      />

      {editing && template ? (
        <>
          <Text style={s.label}>Aplicar cambios a</Text>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'this', label: 'Solo este mes' },
              { value: 'following', label: 'Este y siguientes' },
            ]}
          />
        </>
      ) : null}

      <Text style={s.label}>Notas (opcional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Detalles"
        placeholderTextColor={colors.faint}
        style={[s.input, s.notes]}
        multiline
        maxLength={1000}
        accessibilityLabel="Notas del movimiento"
      />

      <View style={s.actions}>
        <Button title={editing ? 'Guardar cambios' : 'Añadir'} onPress={save} disabled={!valid} loading={busy} />
        {editing && template && !template.endsOn ? <Button title="Dejar de repetir" variant="secondary" onPress={stop} disabled={busy} /> : null}
        {editing ? <Button title={editing.recurringId ? 'Quitar de este mes' : 'Eliminar movimiento'} variant="danger" onPress={remove} disabled={busy} /> : null}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 6 },
  heading: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.muted },
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
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
  },
  amountInput: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: '800', paddingVertical: 8, fontVariant: ['tabular-nums'] },
  euro: { fontSize: 24, fontWeight: '700', color: colors.muted },
  hint: { fontSize: 13, color: colors.faint },
  problem: { color: colors.danger, fontSize: 14 },
  notes: { minHeight: 70, textAlignVertical: 'top' },
  actions: { gap: 10, marginTop: 22 },
});
