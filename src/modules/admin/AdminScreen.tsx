import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginScreen } from '../../shared/auth/LoginScreen';
import { copyText, generalLink, shareOrCopy } from '../../shared/auth/oauth';
import { supabase } from '../../shared/lib/supabase';
import { radius } from '../../shared/theme';
import { Banner, Button, colors, confirmAction, ToastView, useToast } from '../../shared/ui';
import { useAppData } from '../shifts/data/AppData';

interface SpaceRow {
  calendar_id: string;
  space_name: string;
  created_at: string;
  members: string[];
  invitation_status: 'pending' | 'accepted' | null;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

// Panel del administrador. La app solo lo muestra a la cuenta admin, pero
// la protección real está en las funciones de Supabase (admin_*), que
// comprueban el rol en cada llamada. No muestra correos ni turnos.
export function AdminScreen() {
  const { authReady, signedIn, userId } = useAppData();
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [flag, overview] = await Promise.all([supabase.rpc('admin_general_signup'), supabase.rpc('admin_overview')]);
    const failure = flag.error ?? overview.error;
    if (failure) {
      if (/administrador|permission/i.test(failure.message)) setAllowed(false);
      else setError(failure.message);
      return;
    }
    setAllowed(true);
    setEnabled(flag.data === true);
    setSpaces((overview.data ?? []) as SpaceRow[]);
  }, []);

  useEffect(() => {
    if (!signedIn || !supabase) return;
    void Promise.resolve().then(load);
  }, [signedIn, userId, load]);

  async function toggle() {
    if (!supabase || busy) return;
    if (
      enabled &&
      !(await confirmAction(
        'Pausar el enlace general',
        'Nadie podrá crear cuentas ni calendarios nuevos desde el enlace. Las parejas existentes y las invitaciones pendientes siguen funcionando.',
        'Pausar',
      ))
    )
      return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_general_signup', { p_enabled: !enabled });
    setBusy(false);
    if (error) return setError(error.message);
    setEnabled(!enabled);
    toast(enabled ? 'Enlace general pausado' : 'Enlace general activo');
  }

  if (!authReady) return <Centered />;
  if (!signedIn) return <LoginScreen />;
  if (!supabase) {
    return (
      <Shell>
        <Banner kind="warn">El panel necesita conexión con Supabase (no funciona en modo demostración).</Banner>
      </Shell>
    );
  }
  if (allowed === null) return <Centered />;
  if (!allowed) {
    return (
      <Shell>
        <Banner kind="error">Esta página es solo para la cuenta administradora.</Banner>
      </Shell>
    );
  }

  const couples = spaces.filter((sp) => sp.members.length === 2).length;

  return (
    <Shell>
      <Text style={s.h2}>Enlace general de Mis Turnos</Text>
      <View style={s.card}>
        <Text selectable style={s.link}>{generalLink()}</Text>
        <Text style={s.muted}>
          Compártelo por WhatsApp. Quien lo abra crea su cuenta y su propio calendario, y desde ahí invita a su pareja.
        </Text>
        <Button
          title="Copiar enlace general"
          disabled={!enabled}
          onPress={async () =>
            toast((await copyText(generalLink())) === 'copied' ? 'Enlace general copiado' : 'No se pudo copiar: mantén pulsado el enlace')
          }
        />
        <Button
          title="Compartir…"
          variant="secondary"
          disabled={!enabled}
          onPress={async () => {
            const r = await shareOrCopy('Organiza tus turnos y los de tu pareja con Mis Turnos:', generalLink());
            if (r === 'copied') toast('Enlace general copiado');
          }}
        />
        <View style={s.statusRow}>
          <View style={[s.statusDot, { backgroundColor: enabled ? '#4CC38A' : colors.faint }]} />
          <Text style={s.statusText}>{enabled ? 'Activo: se aceptan altas nuevas' : 'Pausado: no se aceptan altas nuevas'}</Text>
          <Button title={enabled ? 'Pausar' : 'Reactivar'} variant="ghost" onPress={toggle} loading={busy} />
        </View>
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Text style={s.h2}>
        Calendarios ({spaces.length}) · parejas completas: {couples}
      </Text>
      {spaces.length === 0 ? <Text style={s.muted}>Todavía nadie se ha unido desde el enlace.</Text> : null}
      {spaces.map((sp) => (
        <View key={sp.calendar_id} style={s.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.spaceName} numberOfLines={1}>
              {sp.members.join(' y ') || sp.space_name}
            </Text>
            <Text style={s.small}>Desde el {fmtDate(sp.created_at)}</Text>
          </View>
          <Text style={[s.chip, chipStyle(sp)]}>{chipLabel(sp)}</Text>
        </View>
      ))}
    </Shell>
  );
}

const chipLabel = (sp: SpaceRow) =>
  sp.members.length === 2 ? 'Pareja completa' : sp.invitation_status === 'pending' ? 'Invitación pendiente' : 'Sin pareja aún';
const chipStyle = (sp: SpaceRow) =>
  sp.members.length === 2
    ? { backgroundColor: '#DAEEDD', color: '#285A3B' }
    : sp.invitation_status === 'pending'
      ? { backgroundColor: colors.warnBg, color: colors.warnText }
      : { backgroundColor: colors.card, color: colors.faint };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.replace('/turnos')} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Panel de Mis Turnos</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>{children}</ScrollView>
      <ToastView />
    </SafeAreaView>
  );
}

function Centered() {
  return (
    <View style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  h2: { fontSize: 13, fontWeight: '800', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  link: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, color: colors.muted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  spaceName: { fontSize: 16, fontWeight: '700', color: colors.text },
  small: { fontSize: 12, color: colors.faint, marginTop: 2 },
  chip: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
});
