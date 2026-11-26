import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../../modules/shifts/data/AppData';
import { Banner, Button, colors } from '../ui';

// Cuenta sin espacio (aún no ha aceptado una invitación) o error al cargarlo.
export function NoAccessScreen({ error }: { error?: string }) {
  const { signOut, refresh } = useAppData();
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <Text style={s.title}>{error ? 'No se ha podido cargar tu espacio' : 'Todavía no tienes acceso'}</Text>
        {error ? (
          <Banner kind="error">{error}</Banner>
        ) : (
          <Text style={s.text}>
            Tu cuenta no pertenece a ningún espacio. Abre el enlace de invitación que te han enviado con esta misma cuenta.
          </Text>
        )}
        <Button title="Reintentar" onPress={refresh} style={{ marginTop: 8 }} />
        <Button title="Cerrar sesión" variant="ghost" onPress={() => void signOut().catch(() => undefined)} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  text: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 22 },
});
