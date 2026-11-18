import React from 'react';
import { colors } from '../theme';

// Campo de fecha para la PWA: selector nativo del navegador (en iPhone, la rueda de iOS).
export function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input
      type="date"
      lang="es-ES"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        width: '100%',
        minWidth: 0,
        minHeight: 44,
        fontSize: 17,
        color: colors.text,
        background: colors.elevated,
        border: '1px solid ' + colors.line,
        borderRadius: 10,
        padding: '6px 10px',
        colorScheme: 'dark',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    />
  );
}
