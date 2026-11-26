import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../../modules/shifts/data/AppData';
import { supabase } from '../lib/supabase';
import { Banner, Button, colors } from '../ui';
import { AuthForm } from './AuthForm';

// /unirse · Enlace general y permanente de Mis Turnos. Quien lo abre crea su
// cuenta (o entra), confirma el correo y vuelve aquí: el servidor le crea su
// propio calendario o, si ya tiene uno, lo lleva a él.
export function JoinScreen() {
  const { authReady, signedIn, userId, refresh, signOut } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase || !signedIn || !userId || started.current === userId) return;
    started.current = userId;
    void supabase.rpc('start_mis_turnos').then(async ({ error }) => {
      if (error) {
        setError(error.message);
        started.current = null;
        return;
      }
      await refresh();
      router.replace('/turnos');
    });
  }, [signedIn, userId, refresh]);

  if (!authReady) return <Centered />;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.logo}>
            <View style={[s.dot, { backgroundColor: '#2563EB' }]} />
            <View style={[s.dot, { backgroundColor: '#E8590C', marginLeft: -10 }]} />
          </View>
          <Text style={s.title}>Mis Turnos</Text>
          <Text style={s.subtitle}>Organizad los turnos de los dos en un calendario compartido y ved de un vistazo qué días libráis juntos.</Text>
          {signedIn ? (
            error ? (
              <>
                <Banner kind="error">{error}</Banner>
                <Button title="Cerrar sesión" variant="ghost" onPress={() => void signOut().catch(() => undefined)} />
              </>
            ) : (
              <View style={s.row}>
                <ActivityIndicator />
                <Text style={s.muted}>Preparando tu calendario…</Text>
              </View>
            )
          ) : (
            <AuthForm returnPath="/unirse" />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  logo: { flexDirection: 'row', alignSelf: 'center', marginBottom: 4 },
  dot: { width: 40, height: 40, borderRadius: 20, opacity: 0.9 },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 16, color: colors.muted },
});
