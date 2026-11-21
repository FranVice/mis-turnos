// Tema visual compartido. Todos los módulos deben tomar de aquí colores,
// radios y efectos de interacción para mantener una identidad coherente.
import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  // Superficies, de más profunda a más elevada.
  bg: '#0D131D',
  surface: '#131D2B', // hojas y barras
  card: '#192537',
  elevated: '#243650',
  line: '#34465E',
  // Texto.
  text: '#F4F7FF',
  muted: '#B8C5D8',
  faint: '#93A5BE',
  // Acento y estados.
  primary: '#91B4FF',
  primaryHover: '#B1CAFF',
  onPrimary: '#101E36',
  today: '#91B4FF',
  selected: '#D8E6FF',
  danger: '#FF7A7A',
  dangerBg: '#3A1F24',
  warnBg: '#352C18',
  warnText: '#F2C94C',
  okBg: '#173326',
  okText: '#6FD39A',
};

// Colores de los tipos de turno. Se evitan el azul y el naranja porque son
// los colores de las personas y no deben confundirse.
export const kindColors = {
  manana: '#F2C94C',
  tarde: '#E879A8',
  noche: '#9B8CFF',
  libre: '#4CC38A',
  vacaciones: '#2EC4C4',
  otro: '#8A94A6',
} as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 };

// Color con transparencia, para fondos teñidos.
export function tint(hex: string, alpha = 0.14) {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

// Aclara un color mezclándolo con blanco: los colores de persona guardados
// (p. ej. #2563EB) son oscuros y necesitan más contraste sobre fondo oscuro.
export function lighten(hex: string, amount = 0.35) {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const shadow = {
  card: { boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)' } as ViewStyle,
  raised: { boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)' } as ViewStyle,
};

// Transición breve en web (en iOS nativo no aplica).
export const webTransition = (Platform.OS === 'web'
  ? { transitionProperty: 'background-color, border-color, opacity, transform', transitionDuration: '120ms' }
  : {}) as ViewStyle;

// Respuesta a pulsación (táctil) y a hover (ratón en ordenador).
export type InteractionState = { pressed: boolean; hovered?: boolean };

export function pressFeedback({ pressed, hovered }: InteractionState, hoverBg?: string): ViewStyle {
  if (pressed) return { opacity: 0.8, transform: [{ scale: 0.97 }] };
  if (hovered && hoverBg) return { backgroundColor: hoverBg };
  return {};
}
