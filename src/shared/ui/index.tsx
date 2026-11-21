import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {
  colors,
  pressFeedback,
  radius,
  shadow,
  tint,
  webTransition,
  type InteractionState,
} from '../theme';

// Se reexportan para que los componentes existentes sigan importando desde aquí.
export { colors, lighten, tint } from '../theme';

// ---------- Botón ----------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonPalette = { bg: string; fg: string; border: string; hover: string };

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
  palette,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  palette?: ButtonPalette;
}) {
  const v = palette ?? buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={(state: InteractionState) => [
        styles.button,
        webTransition,
        { backgroundColor: v.bg, borderColor: v.border },
        pressFeedback(state, v.hover),
        (disabled || loading) && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, ButtonPalette> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary, hover: colors.primaryHover },
  secondary: { bg: colors.card, fg: colors.text, border: colors.line, hover: colors.elevated },
  danger: { bg: colors.dangerBg, fg: colors.danger, border: '#5A2C33', hover: '#4A262C' },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent', hover: colors.card },
};

// ---------- Selector segmentado ----------

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  color?: string;
  selectedBackground?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  minItemWidth,
  palette,
}: {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** Ancho mínimo de cada opción (por defecto 85; menos para que quepan 4 en un iPhone). */
  minItemWidth?: number;
  palette?: { cell: string; border: string; ink: string; hover: string };
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        const accent = o.color ?? colors.primary;
        const selectedBackground = o.selectedBackground ?? tint(accent, 0.2);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={active}
            onPress={() => onChange(o.value)}
            style={(state: InteractionState) => [
              styles.segment,
              palette && { backgroundColor: palette.cell, borderColor: palette.border },
              minItemWidth !== undefined && { minWidth: minItemWidth },
              webTransition,
              active && { backgroundColor: selectedBackground, borderColor: palette?.ink ?? accent },
              pressFeedback(state, active ? (o.selectedBackground ?? tint(accent, 0.3)) : (palette?.hover ?? colors.elevated)),
            ]}
          >
            {o.color ? <View style={[styles.dot, { backgroundColor: o.color }]} /> : null}
            <Text style={[styles.segmentText, palette && { color: palette.ink }, active && { color: palette?.ink ?? colors.text, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Avisos ----------

export function Banner({
  kind,
  children,
  action,
  light,
}: {
  kind: 'error' | 'warn' | 'ok';
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
  light?: boolean;
}) {
  const palette = (light ? lightBanners : darkBanners)[kind];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} accessibilityLiveRegion="polite">
      <Text style={[styles.bannerText, { color: palette.fg }]}>{children}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} style={styles.bannerAction}>
          <Text style={[styles.bannerActionText, { color: palette.fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const lightBanners = {
  error: { bg: '#F8E1E2', fg: '#862D3A' },
  warn: { bg: '#FBEBC0', fg: '#69450B' },
  ok: { bg: '#DAEEDD', fg: '#285A3B' },
};

const darkBanners = {
  error: { bg: colors.dangerBg, fg: colors.danger },
  warn: { bg: colors.warnBg, fg: colors.warnText },
  ok: { bg: colors.okBg, fg: colors.okText },
};

// ---------- Confirmación ----------

export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

// ---------- Toast de confirmación ----------

const ToastCtx = createContext<{ message: string | null; show: (m: string) => void }>({
  message: null,
  show: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((m: string) => {
    clearTimeout(timer.current);
    setMessage(m);
    timer.current = setTimeout(() => setMessage(null), Math.min(6000, 2200 + m.length * 40));
  }, []);
  return <ToastCtx.Provider value={{ message, show }}>{children}</ToastCtx.Provider>;
}

export const useToast = () => useContext(ToastCtx).show;

export function ToastView({ bottom = 24 }: { bottom?: number }) {
  const { message } = useContext(ToastCtx);
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: message ? 1 : 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [message, opacity]);
  if (!message) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { bottom, opacity }]} accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>
        <Text style={{ color: colors.okText }}>✓ </Text>
        {message}
      </Text>
    </Animated.View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 17, fontWeight: '600' },
  segmented: { flexWrap: 'wrap', flexDirection: 'row', gap: 8 },
  segment: { minWidth: 85,
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md + 2,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
  },
  segmentText: { fontSize: 16, color: colors.muted, fontWeight: '500' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  banner: { borderRadius: radius.md + 2, padding: 12, gap: 6 },
  bannerText: { fontSize: 15, lineHeight: 20 },
  bannerAction: { alignSelf: 'flex-start', paddingVertical: 4 },
  bannerActionText: { fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
    ...shadow.raised,
  },
  toastText: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
