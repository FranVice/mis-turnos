import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../../modules/shifts/data/AppData';
import { supabase } from '../lib/supabase';
import { Banner, Button, colors } from '../ui';
import { AuthForm } from './AuthForm';
import { inviteConsent, pendingInvite } from './oauth';

interface Info {
  email: string;
  inviter_name: string;
  status: 'pending' | 'accepted' | 'revoked';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /invitacion?token=… · Enlace privado para unirse al calendario de la
// pareja. El token se conserva en la URL de vuelta y en el almacenamiento
// local durante el registro, la confirmación del correo y el inicio de
// sesión. El servidor exige que el correo verificado coincida.
// Si la persona creó la cuenta o entró desde este mismo enlace, se une
// sola al volver; si llega ya con sesión, confirma con un toque.
export function InviteScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const fromUrl = typeof params.token === 'string' && UUID.test(params.token) ? params.token : null;
  const token = fromUrl ?? pendingInvite.get();
  const { authReady, signedIn, userId, refresh, signOut } = useAppData();

  const [loaded, setLoaded] = useState<Info | null | 'missing'>(null);
  const info: Info | null | 'missing' = token ? loaded : 'missing';
  const [account, setAccount] = useState<{ uid: string; email: string | null } | null>(null);
  const sessionEmail = signedIn && account && account.uid === userId ? account.email : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  useEffect(() => {
    if (fromUrl) pendingInvite.set(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (!supabase || !token) return;
    let cancelled = false;
    void supabase.rpc('invitation_info', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? (data[0] as Info | undefined) : undefined;
      setLoaded(error || !row ? 'missing' : row);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!supabase || !signedIn) return;
    void supabase.auth.getUser().then(({ data }) =>
      setAccount(data.user ? { uid: data.user.id, email: data.user.email?.toLowerCase() ?? null } : null),
    );
  }, [signedIn, userId]);

  const usable = info !== null && info !== 'missing' && info.status !== 'revoked';
  const matches = usable && !!sessionEmail && sessionEmail === info.email;

  const accept = useCallback(async () => {
    if (!supabase || !token) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('accept_invitation', { p_token: token });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    pendingInvite.clear();
    inviteConsent.clear();
    await refresh();
    router.replace('/turnos');
  }, [token, refresh]);

  // Vuelta tras registrarse o entrar desde este enlace: unirse sin otro toque.
  useEffect(() => {
    if (!matches || autoTried.current || !token || inviteConsent.get() !== token) return;
    autoTried.current = true;
    void Promise.resolve().then(accept);
  }, [matches, token, accept]);

  if (!authReady || info === null) {
    return (
      <View style={s.center}>
        <ActivityIndicator accessibilityLabel="Cargando invitación" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Mis Turnos</Text>
          {info === 'missing' ? (
            <Banner kind="error">Este enlace de invitación no es válido. Pide a tu pareja que te envíe uno nuevo.</Banner>
          ) : info.status === 'revoked' ? (
            <Banner kind="error">Esta invitación se ha anulado. Pide a tu pareja que te envíe un enlace nuevo.</Banner>
          ) : (
            <>
              <Text style={s.subtitle}>{info.inviter_name} te invita a compartir su calendario de turnos.</Text>
              <View style={s.emailBox}>
                <Text style={s.label}>Invitación para</Text>
                <Text style={s.email}>{info.email}</Text>
              </View>

              {signedIn && sessionEmail && !matches ? (
                <>
                  <Banner kind="warn">
                    Has entrado como {sessionEmail}. Esta invitación es para {info.email}: cierra sesión y entra con ese correo.
                  </Banner>
                  <Button title="Cerrar sesión" onPress={() => void signOut().catch(() => undefined)} />
                </>
              ) : matches ? (
                busy ? (
                  <View style={s.row}>
                    <ActivityIndicator />
                    <Text style={s.muted}>Uniéndote al calendario…</Text>
                  </View>
                ) : (
                  <Button title={`Unirme al calendario de ${info.inviter_name}`} onPress={accept} />
                )
              ) : signedIn ? (
                <ActivityIndicator />
              ) : (
                <AuthForm returnPath={`/invitacion?token=${token}`} fixedEmail={info.email} onIntent={() => token && inviteConsent.set(token)} />
              )}
            </>
          )}
          {error ? <Banner kind="error">{error}</Banner> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  emailBox: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 14, gap: 4 },
  email: { fontSize: 17, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 16, color: colors.muted },
  label: { fontSize: 13, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8 },
});
