import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { copyText, inviteLink, shareOrCopy } from '../../../shared/auth/oauth';
import { supabase } from '../../../shared/lib/supabase';
import { Banner, Button, colors, confirmAction, useToast } from '../../../shared/ui';

interface Pending {
  email: string;
  token: string;
}

// «Invitar a mi pareja»: quien creó el calendario escribe el correo de su
// pareja y obtiene un enlace privado para enviarlo (WhatsApp, etc.).
// Repetir con el mismo correo devuelve el mismo enlace; con otro, lo cambia.
export function PartnerInvite({ myName, footerInset }: { myName: string; footerInset: number }) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.rpc('my_invitation').then(({ data }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? (data[0] as Pending | undefined) : undefined;
      setPending(row ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('invite_partner', { p_email: email });
    setBusy(false);
    if (error) return setError(error.message);
    setPending({ email: email.trim().toLowerCase(), token: data as string });
    setEditing(false);
    setEmail('');
  }

  async function cancel() {
    if (!supabase) return;
    if (!(await confirmAction('Anular invitación', 'El enlace dejará de funcionar.', 'Anular'))) return;
    const { error } = await supabase.rpc('cancel_my_invitation');
    if (error) return setError(error.message);
    setPending(null);
  }

  const message = `${myName} te invita a compartir vuestros turnos en Mis Turnos. Entra con tu correo desde este enlace:`;

  if (pending === undefined) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: 24 + footerInset }]} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Invitar a mi pareja</Text>
      <Text style={s.text}>
        Tu pareja verá y añadirá sus turnos en este calendario. Cada uno edita solo los suyos. El enlace solo funciona con el correo que indiques.
      </Text>

      {pending && !editing ? (
        <View style={s.card}>
          <Text style={s.label}>Invitación pendiente para</Text>
          <Text style={s.email}>{pending.email}</Text>
          <Text selectable style={s.link} numberOfLines={2}>{inviteLink(pending.token)}</Text>
          <Button
            title="Enviar enlace (WhatsApp…)"
            onPress={async () => {
              const r = await shareOrCopy(message, inviteLink(pending.token));
              if (r === 'copied') toast('Enlace copiado');
            }}
          />
          <Button
            title="Copiar enlace"
            variant="secondary"
            onPress={async () => toast((await copyText(inviteLink(pending.token))) === 'copied' ? 'Enlace copiado' : 'No se pudo copiar: mantén pulsado el enlace')}
          />
          <View style={s.row}>
            <Button title="Cambiar correo" variant="ghost" onPress={() => setEditing(true)} style={{ flex: 1 }} />
            <Button title="Anular" variant="ghost" onPress={cancel} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.label}>Correo de tu pareja</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Correo de tu pareja"
            autoCapitalize="none"
            autoComplete="off"
            keyboardType="email-address"
            style={s.input}
            placeholder="pareja@correo.com"
            placeholderTextColor={colors.faint}
            onSubmitEditing={create}
          />
          <Button title="Crear enlace de invitación" onPress={create} loading={busy} />
          {editing ? <Button title="Cancelar" variant="ghost" onPress={() => setEditing(false)} /> : null}
        </View>
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { padding: 40, alignItems: 'center' },
  content: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  text: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  card: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  label: { fontSize: 12, fontWeight: '800', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8 },
  email: { fontSize: 17, fontWeight: '700', color: colors.text },
  link: { fontSize: 12, color: colors.faint },
  row: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 17, color: colors.text },
});
