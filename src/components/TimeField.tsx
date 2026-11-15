import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateToTime, timeToDate } from '../lib/dates';
import { colors } from './ui';

// Campo de hora en formato 24 h. En iPhone usa el selector nativo compacto;
// en web (solo para revisar la interfaz) un campo de texto HH:MM.
export function TimeField({
  label,
  value,
  onChange,
  suggested = '08:00',
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  /** Hora con la que se abre el selector si el campo está vacío. */
  suggested?: string;
}) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        value ? (
          <DateTimePicker
            value={timeToDate(value)}
            mode="time"
            display="compact"
            // En iOS el formato 24 h lo da la configuración regional.
            locale="es-ES"
            onValueChange={(_e, d) => onChange(dateToTime(d))}
            style={s.iosPicker}
          />
        ) : (
          <Pressable style={s.empty} onPress={() => onChange(suggested)}>
            <Text style={s.emptyText}>Elegir</Text>
          </Pressable>
        )
      ) : (
        <AndroidTime value={value} onChange={onChange} suggested={suggested} />
      )}
    </View>
  );
}

function AndroidTime({
  value,
  onChange,
  suggested,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  suggested: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={s.empty} onPress={() => setOpen(true)}>
        <Text style={value ? s.valueText : s.emptyText}>{value ?? 'Elegir'}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={timeToDate(value ?? suggested)}
          mode="time"
          is24Hour
          onValueChange={(_e, d) => {
            setOpen(false);
            onChange(dateToTime(d));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'flex-start',
  },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  iosPicker: { marginLeft: -8 },
  empty: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  emptyText: { fontSize: 17, color: colors.faint },
  valueText: { fontSize: 20, color: colors.text, fontWeight: '600' },
  webInput: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 100,
  },
});
