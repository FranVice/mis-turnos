import React from 'react';
import { Text, View } from 'react-native';
import { colors } from './index';
export function TimeField({label, value, onChange}: {label: string; value: string | null; onChange: (v: string | null) => void; suggested?: string}) {
  return <View style={{flex: 1, minWidth: 0, padding: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, gap: 8}}><Text style={{color: colors.muted, fontWeight: '600'}}>{label}</Text><input type="time" lang="es-ES" aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)} style={{width: '100%', minWidth: 0, minHeight: 44, fontSize: 19, color: colors.text, background: colors.elevated, border: '1px solid '+colors.line, borderRadius: 8, padding: 4, colorScheme: 'dark'}} /></View>;
}
