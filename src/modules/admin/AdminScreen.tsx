import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginScreen } from '../../shared/auth/LoginScreen';
import { supabase } from '../../shared/lib/supabase';
import { Banner, Button, colors, confirmAction, useToast, ToastView } from '../../shared/ui';
import { radius } from '../../shared/theme';
import { useAppData } from '../shifts/data/AppData';

type Status = 'pending' | 'accepted' | 'revoked';
interface Invitation {
  id: string;
  calendar_id: string;
  space_name: string;
  person_id: string;
  person_name: string;
  email: string;
  token: string;
  status: Status;
  created_at: string;
  accepted_at: string | null;
}

const STATUS_LABEL: Record<Status, string> = { pending: 'Pendiente', accepted: 'Aceptada', revoked: 'Anulada' };
const STATUS_COLOR: Record<Status, { bg: string; fg: string }> = {
  pending: { bg: colors.warnBg, fg: colors.warnText },
  accepted: { bg: '#DAEEDD', fg: '#285A3B' },
  revoked: { bg: colors.card, fg: colors.faint },
};

const inviteLink = (token: string) =>
  (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://nuestros-turnos.vercel.app') +
  `/invitacion?token=${token}`;

// Panel de parejas: solo para la cuenta administradora. La app lo oculta al
// resto, pero la protección real está en las funciones de Supabase, que
// comprueban el rol en cada llamada.
export function AdminScreen() {
  const { authReady, signedIn, userId } = useAppData();
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [list, setList] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ space: '', name1: '', email1: '', name2: '', email2: '' });

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_list_invitations');
    if (error) {
      if (/administrador|permission/i.test(error.message)) setAllowed(false);
      else setError(error.message);
      return;
    }
    setAllowed(true);
    setList((data ?? []) as Invitation[]);
  }, []);

  useEffect(() => {
    if (!signedIn || !supabase) return;
    // Misma pauta que AppData: la consulta arranca fuera del cuerpo del efecto.
    void Promise.resolve().then(load);
  }, [signedIn, userId, load]);

  const spaces = useMemo(() => {
    const map = new Map<string, { name: string; items: Invitation[] }>();
    for (const inv of list) {
      const entry = map.get(inv.calendar_id) ?? { name: inv.space_name, items: [] };
      entry.items.push(inv);
      map.set(inv.calendar_id, entry);
    }
    return [...map.entries()];
  }, [list]);

  async function create() {
    if (!supabase || busy) return;
    const { space, name1, email1, name2, email2 } = form;
    if (!name1.trim() || !name2.trim() || !email1.trim() || !email2.trim()) return setError('Rellena el nombre y el correo de los dos.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('admin_create_couple', {
      p_space_name: space,
      p_name1: name1,
      p_email1: email1,
      p_name2: name2,
      p_email2: email2,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setForm({ space: '', name1: '', email1: '', name2: '', email2: '' });
    toast('Pareja creada. Comparte los dos enlaces.');
    await load();
  }

  async function share(inv: Invitation) {
    const url = inviteLink(inv.token);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado');
        return;
      }
      await Share.share({ message: `${inv.person_name}, te invito a compartir vuestros turnos en Nexo: ${url}`, url });
    } catch {
      /* cancelado */
    }
  }

  async function copy(inv: Invitation) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.token));
      toast('Enlace copiado');
    } catch {
      toast('No se pudo copiar. Mantén pulsado el enlace para copiarlo.');
    }
  }

  async function revoke(inv: Invitation) {
    if (!supabase) return;
    const ok = await confirmAction('Anular invitación', `El enlace de ${inv.email} dejará de funcionar.`, 'Anular');
    if (!ok) return;
    const { error } = await supabase.rpc('admin_revoke_invitation', { p_id: inv.id });
    if (error) return setError(error.message);
    await load();
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

  return (
    <Shell>
      <Text style={s.h2}>Nueva pareja</Text>
      <View style={s.card}>
        <Field label="Nombre del espacio (opcional)" value={form.space} onChange={(v) => setForm({ ...form, space: v })} placeholder="Ana y Bruno" />
        <View style={s.pair}>
          <Field label="Nombre 1" value={form.name1} onChange={(v) => setForm({ ...form, name1: v })} />
          <Field label="Correo 1" value={form.email1} onChange={(v) => setForm({ ...form, email1: v })} email />
        </View>
        <View style={s.pair}>
          <Field label="Nombre 2" value={form.name2} onChange={(v) => setForm({ ...form, name2: v })} />
          <Field label="Correo 2" value={form.email2} onChange={(v) => setForm({ ...form, email2: v })} email />
        </View>
        <Button title="Crear pareja e invitaciones" onPress={create} loading={busy} />
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Text style={s.h2}>Parejas ({spaces.length})</Text>
      {spaces.length === 0 ? <Text style={s.muted}>Aún no has invitado a ninguna pareja.</Text> : null}
      {spaces.map(([id, sp]) => (
        <View key={id} style={s.card}>
          <Text style={s.spaceName}>{sp.name}</Text>
          {sp.items.map((inv) => (
            <View key={inv.id} style={s.inv}>
              <View style={s.invHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.person}>{inv.person_name}</Text>
                  <Text style={s.email} numberOfLines={1}>{inv.email}</Text>
                </View>
                <Text style={[s.chip, { backgroundColor: STATUS_COLOR[inv.status].bg, color: STATUS_COLOR[inv.status].fg }]}>
                  {STATUS_LABEL[inv.status]}
                </Text>
              </View>
              {inv.status === 'pending' ? (
                <>
                  <Text selectable style={s.link} numberOfLines={1}>{inviteLink(inv.token)}</Text>
                  <View style={s.actions}>
                    <SmallAction icon="share-outline" label="Compartir" onPress={() => share(inv)} />
                    {Platform.OS === 'web' ? <SmallAction icon="copy-outline" label="Copiar" onPress={() => copy(inv)} /> : null}
                    <SmallAction icon="close-circle-outline" label="Anular" onPress={() => revoke(inv)} danger />
                  </View>
                </>
              ) : null}
              {inv.status === 'revoked' && !sp.items.some((o) => o.person_id === inv.person_id && o.status !== 'revoked') ? (
                <Reinvite inv={inv} onDone={load} onError={setError} />
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </Shell>
  );
}

// Nueva invitación (p. ej. tras corregir un correo mal escrito).
function Reinvite({ inv, onDone, onError }: { inv: Invitation; onDone: () => Promise<void>; onError: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_reinvite', { p_invitation_id: inv.id, p_email: email });
    setBusy(false);
    if (error) return onError(error.message);
    setEmail('');
    await onDone();
  }
  return (
    <View style={s.pair}>
      <Field label="Nuevo correo" value={email} onChange={setEmail} email />
      <View style={{ justifyContent: 'flex-end' }}>
        <Button title="Invitar" variant="secondary" onPress={send} loading={busy} />
      </View>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.replace('/turnos')} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Panel de parejas</Text>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
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

function Field({ label, value, onChange, placeholder, email }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; email?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 140, gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCapitalize={email ? 'none' : 'words'}
        keyboardType={email ? 'email-address' : 'default'}
        autoComplete="off"
        style={s.input}
      />
    </View>
  );
}

function SmallAction({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.action} hitSlop={4}>
      <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.primary} />
      <Text style={[s.actionText, { color: danger ? colors.danger : colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  h2: { fontSize: 13, fontWeight: '800', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 12 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: colors.faint },
  input: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.text },
  muted: { color: colors.muted, fontSize: 15 },
  spaceName: { fontSize: 18, fontWeight: '800', color: colors.text },
  inv: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  invHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  person: { fontSize: 16, fontWeight: '700', color: colors.text },
  email: { fontSize: 14, color: colors.muted },
  chip: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  link: { fontSize: 12, color: colors.faint },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: '700' },
});
