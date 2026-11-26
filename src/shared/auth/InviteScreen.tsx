import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../../modules/shifts/data/AppData';
import { supabase } from '../lib/supabase';
import { Banner, Button, colors } from '../ui';
import { googleEnabled, pendingInvite, returnUrl, signInWithGoogle } from './oauth';

interface Info {
  email: string;
  space_name: string;
  person_name: string;
  status: 'pending' | 'accepted' | 'revoked';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /invitacion?token=… · Muestra a qué espacio y correo va la invitación,
// permite entrar o crear la cuenta (correo o Google) y la acepta. El
// servidor comprueba que el correo verificado de la cuenta coincide.
export function InviteScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const fromUrl = typeof params.token === 'string' && UUID.test(params.token) ? params.token : null;
  const token = fromUrl ?? pendingInvite.get();
  const { authReady, signedIn, userId, refresh, signOut } = useAppData();

  const [loaded, setLoaded] = useState<Info | null | 'missing'>(null);
  const info: Info | null | 'missing' = token ? loaded : 'missing';
  const [account, setAccount] = useState<{ uid: string; email: string | null } | null>(null);
  const sessionEmail = signedIn && account && account.uid === userId ? account.email : null;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const accepting = useRef(false);

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

  const valid = info !== null && info !== 'missing' && info.status !== 'revoked';
  const matches = valid && !!sessionEmail && sessionEmail === info.email;

  // Con la cuenta correcta, aceptar automáticamente (repetirlo no duplica nada).
  useEffect(() => {
    if (!supabase || !token || !matches || accepting.current) return;
    accepting.current = true;
    setBusy(true);
    setError(null);
    void supabase.rpc('accept_invitation', { p_token: token }).then(async ({ error }) => {
      if (error) {
        setError(error.message);
        setBusy(false);
        accepting.current = false;
        return;
      }
      pendingInvite.clear();
      await refresh();
      router.replace('/turnos');
    });
  }, [matches, token, refresh]);

  async function signIn() {
    if (!supabase || busy || !valid) return;
    if (!password) return setError('Escribe tu contraseña.');
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: info.email, password });
    if (error) setError(/invalid login/i.test(error.message) ? 'Contraseña incorrecta o cuenta aún no creada.' : error.message);
    setBusy(false);
  }

  async function signUp() {
    if (!supabase || busy || !valid || !token) return;
    if (password.length < 12) return setError('Usa una contraseña de al menos 12 caracteres.');
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase.auth.signUp({
      email: info.email,
      password,
      options: { emailRedirectTo: returnUrl(`/invitacion?token=${token}`) },
    });
    if (error) setError(error.message);
    else if (!data.session)
      setNotice(`Te hemos enviado un correo a ${info.email}. Ábrelo para confirmar la cuenta y volverás aquí para terminar. Si ya tenías cuenta, usa «Entrar».`);
    setBusy(false);
  }

  async function google() {
    if (!token) return;
    setBusy(true);
    setError(null);
    const msg = await signInWithGoogle(`/invitacion?token=${token}`);
    if (msg) {
      setError(msg);
      setBusy(false);
    }
  }

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
          <Text style={s.title}>Invitación a Mis Turnos</Text>
          {info === 'missing' ? (
            <Banner kind="error">Este enlace de invitación no es válido. Pide a quien te invitó que te envíe uno nuevo.</Banner>
          ) : info.status === 'revoked' ? (
            <Banner kind="error">Esta invitación se ha anulado. Pide un enlace nuevo.</Banner>
          ) : (
            <>
              <Text style={s.subtitle}>
                {info.person_name}, te han invitado al espacio «{info.space_name}» para compartir vuestros turnos.
              </Text>
              <View style={s.emailBox}>
                <Text style={s.label}>Correo invitado</Text>
                <Text style={s.email}>{info.email}</Text>
              </View>

              {signedIn && sessionEmail && !matches ? (
                <>
                  <Banner kind="warn">
                    Has entrado como {sessionEmail}. Esta invitación es para {info.email}: cierra sesión y entra con ese correo.
                  </Banner>
                  <Button title="Cerrar sesión" onPress={() => void signOut().catch(() => undefined)} />
                </>
              ) : signedIn ? (
                busy ? (
                  <View style={s.row}>
                    <ActivityIndicator />
                    <Text style={s.text}>Uniéndote a tu espacio…</Text>
                  </View>
                ) : null
              ) : (
                <View style={s.form}>
                  {googleEnabled ? (
                    <>
                      <Button title="Continuar con Google" variant="secondary" onPress={google} disabled={busy} />
                      <Text style={s.or}>o con tu correo</Text>
                    </>
                  ) : null}
                  <Text style={s.label}>Contraseña</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    accessibilityLabel="Contraseña"
                    style={s.input}
                    placeholder="Mínimo 12 caracteres si es nueva"
                    placeholderTextColor={colors.faint}
                  />
                  <Button title="Crear cuenta" onPress={signUp} loading={busy} />
                  <Button title="Ya tengo cuenta: entrar" variant="ghost" onPress={signIn} disabled={busy} />
                </View>
              )}
            </>
          )}
          {error ? <Banner kind="error">{error}</Banner> : null}
          {notice ? <Banner kind="ok">{notice}</Banner> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  emailBox: { borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 14, gap: 4 },
  email: { fontSize: 17, fontWeight: '700', color: colors.text },
  form: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  text: { fontSize: 16, color: colors.muted },
  or: { fontSize: 13, color: colors.faint, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.text,
  },
});
