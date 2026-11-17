import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, colors } from '../components/ui';
import { useAppData } from '../data/AppData';
import { supabase } from '../lib/supabase';

// Solo inicio de sesión: el registro público está desactivado y las
// cuentas se crean desde el panel de Supabase.
export function LoginScreen() {
  const { recovering, finishRecovery } = useAppData();
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!supabase || busy) return;
    if (recovering) {
      if (password.length < 12) return setError('Usa una contraseña de al menos 12 caracteres.');
      setBusy(true); setError(null);
      try {
        const {error} = await supabase.auth.updateUser({password});
        if (error) setError(error.message); else finishRecovery();
      } catch { setError('No se pudo conectar. Vuelve a intentarlo.'); }
      finally { setBusy(false); }
      return;
    }
    if (!email.trim() || !password) return setError('Escribe tu correo y tu contraseña.');
    setBusy(true);
    setError(null);
    try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) setError('Correo o contraseña incorrectos.');
      else if (/network|fetch/i.test(error.message)) setError('Sin conexión. Comprueba internet y vuelve a intentarlo.');
      else setError(error.message);
    }
    } catch { setError('No se pudo conectar. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!supabase || busy) return;
    if (!email.trim()) return setError('Escribe tu correo para recibir el enlace.');
    setBusy(true); setError(null); setNotice(null);
    try {
      const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: Platform.OS === 'web' ? window.location.origin + '/' : undefined});
      if (error) setError(error.message);
      else setNotice('Si el correo está registrado, recibirás un enlace. Ábrelo en Safari para elegir tu nueva contraseña.');
    } catch { setError('No se pudo conectar. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.logo}>
            <View style={[s.logoDot, { backgroundColor: '#2563EB' }]} />
            <View style={[s.logoDot, { backgroundColor: '#E8590C', marginLeft: -10 }]} />
          </View>
          <Text style={s.title}>Mis Turnos</Text>
          <Text style={s.subtitle}>{recovering ? 'Elige tu nueva contraseña.' : 'Vuestros horarios, en un mismo calendario privado.'}</Text>

          <View style={s.form}>
            {!recovering ? <><Text style={s.label}>Correo</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              accessibilityLabel="Correo"
              returnKeyType="next"
              style={s.input}
              placeholder="tu@correo.com"
              placeholderTextColor={colors.faint}
            />
            </> : null}
            <Text style={s.label}>{recovering ? 'Nueva contraseña' : 'Contraseña'}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={recovering ? "new-password" : "current-password"}
              textContentType={recovering ? "newPassword" : "password"}
              accessibilityLabel={recovering ? "Nueva contraseña" : "Contraseña"}
              returnKeyType="go"
              onSubmitEditing={signIn}
              style={s.input}
              placeholder="••••••••"
              placeholderTextColor={colors.faint}
            />
            {error ? <Banner kind="error">{error}</Banner> : null}
            {notice ? <Banner kind="ok">{notice}</Banner> : null}
            <Button title={recovering ? "Guardar contraseña" : "Entrar"} onPress={signIn} loading={busy} style={{ marginTop: 8 }} />
            {!recovering ? <Button title="He olvidado mi contraseña" variant="ghost" onPress={resetPassword} disabled={busy} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 8 },
  logo: { flexDirection: 'row', alignSelf: 'center', marginBottom: 12 },
  logoDot: { width: 44, height: 44, borderRadius: 22, opacity: 0.9 },
  title: { fontSize: 32, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.8 },
  subtitle: { fontSize: 16, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  form: { gap: 8 },
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
