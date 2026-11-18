import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { todayISO, toISO } from '../lib/dates';
import { colors } from '../theme';

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

// Campo de fecha en app nativa. En iPhone usa el selector compacto; la PWA usa DateField.web.tsx.
export function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  if (Platform.OS === 'ios' && value) {
    return (
      <DateTimePicker
        value={toDate(value)}
        mode="date"
        display="compact"
        locale="es-ES"
        themeVariant="dark"
        accessibilityLabel={label}
        onValueChange={(_e, d) => onChange(toISO(d.getFullYear(), d.getMonth() + 1, d.getDate()))}
      />
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onChange(value ?? todayISO())} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>{value ?? 'Elegir fecha'}</Text>
    </Pressable>
  );
}
