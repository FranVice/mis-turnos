import React from 'react';
import { Text, View } from 'react-native';
import { colors } from './index';
import type { TimeFieldProps } from './TimeField.types';

export function TimeField({ label, value, onChange, lightPalette }: TimeFieldProps) {
  const borderColor = lightPalette?.border ?? colors.line;

  return (
    <View style={{ flex: 1, minWidth: 0, padding: 10, backgroundColor: lightPalette?.cell ?? colors.card, borderWidth: 1, borderColor, borderRadius: 12, gap: 8 }}>
      <Text style={{ color: lightPalette?.muted ?? colors.muted, fontWeight: '600' }}>{label}</Text>
      <input
        type="time"
        lang="es-ES"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: '100%',
          minWidth: 0,
          minHeight: 44,
          fontSize: 19,
          color: lightPalette?.ink ?? colors.text,
          background: lightPalette?.cell ?? colors.elevated,
          border: '1px solid ' + borderColor,
          borderRadius: 8,
          padding: 4,
          colorScheme: lightPalette ? 'light' : 'dark',
        }}
      />
    </View>
  );
}
