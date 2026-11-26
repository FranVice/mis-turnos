import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Banner, Button, colors, Segmented } from '../ui';
import { googleEnabled, returnUrl, signInWithGoogle, SIGNUP_SOURCE } from './oauth';

type Mode = 'signup' | 'signin';

/**
 * Crear cuenta o entrar, para el enlace general (/unirse) y el privado
 * (/invitacion). `returnPath` es a dónde vuelve tras confirmar el correo o
 * tras Google, para no perder el enlace. `fixedEmail` bloquea el correo
 * (invitación). `onIntent` se llama justo antes de cada intento.
 */
export function AuthForm({ returnPath, fixedEmail, onIntent }: { returnPath: string; fixedEmail?: string; onIntent?: () => void }) {
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [emailInput, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const email = (fixedEmail ?? emailInput).trim().toLowerCase();

  async function submit() {
    if (!supabase || busy) return;
    setError(null);
    setNotice(null);
    if (!email) return setError('Escribe tu correo.');
    if (mode === 'signup') {
      if (!name.trim()) return setError('Escribe tu nombre: es el que verá tu pareja en el calendario.');
      if (password.length < 12) return setError('Usa una contraseña de al menos 12 caracteres.');
    } else if (!password) return setError('Escribe tu contraseña.');
    setBusy(true);
    onIntent?.();
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: returnUrl(returnPath), data: { display_name: name.trim(), signup_source: SIGNUP_SOURCE } },
        });
        if (error) setError(/already registered|already exists/i.test(error.message) ? 'Ese correo ya tiene cuenta: usa «Ya tengo cuenta».' : error.message);
        else if (!data.session)
          setNotice(`Te hemos enviado un correo a ${email}. Ábrelo en este móvil para confirmar la cuenta y volverás aquí. Si ya tenías cuenta, usa «Ya tengo cuenta».`);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (/invalid login/i.test(error.message)) setError('Correo o contraseña incorrectos.');
          else if (/not confirmed/i.test(error.message)) setError('Confirma tu correo con el enlace que te enviamos y vuelve a intentarlo.');
          else setError(error.message);
        }
      }
    } catch {
      setError('No se pudo conectar. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    onIntent?.();
    const msg = await signInWithGoogle(returnPath);
    if (msg) {
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <View style={s.form}>
      {googleEnabled ? (
        <>
          <Button title="Continuar con Google" variant="secondary" onPress={google} disabled={busy} />
          <Text style={s.or}>o con tu correo</Text>
        </>
      ) : null}
      <Segmented<Mode>
        options={[
          { value: 'signup', label: 'Crear cuenta' },
          { value: 'signin', label: 'Ya tengo cuenta' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setNotice(null);
        }}
      />
      {mode === 'signup' ? (
        <>
          <Text style={s.label}>Tu nombre</Text>
          <TextInput value={name} onChangeText={setName} accessibilityLabel="Tu nombre" autoComplete="given-name" textContentType="givenName" style={s.input} placeholder="Ana" placeholderTextColor={colors.faint} />
        </>
      ) : null}
      {fixedEmail ? null : (
        <>
          <Text style={s.label}>Correo</Text>
          <TextInput
            value={emailInput}
            onChangeText={setEmail}
            accessibilityLabel="Correo"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            style={s.input}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.faint}
          />
        </>
      )}
      <Text style={s.label}>Contraseña</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Contraseña"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signup' ? 'newPassword' : 'password'}
        onSubmitEditing={submit}
        style={s.input}
        placeholder={mode === 'signup' ? 'Mínimo 12 caracteres' : '••••••••'}
        placeholderTextColor={colors.faint}
      />
      {error ? <Banner kind="error">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}
      <Button title={mode === 'signup' ? 'Crear cuenta' : 'Entrar'} onPress={submit} loading={busy} style={{ marginTop: 4 }} />
      {mode === 'signin' ? (
        <Button title="He olvidado mi contraseña" variant="ghost" onPress={() => router.replace('/')} disabled={busy} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  form: { gap: 8 },
  or: { fontSize: 13, color: colors.faint, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
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
