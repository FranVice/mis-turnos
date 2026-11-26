import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../../modules/shifts/data/AppData';
import { Banner, Button, colors } from '../ui';
import { pendingInvite } from './oauth';

// Cuenta sin calendario (p. ej. confirmó el correo en otro dispositivo) o
// error al cargarlo. Ofrece volver al enlace pendiente o crear su calendario.
export function NoAccessScreen({ error }: { error?: string }) {
  const { signOut, refresh } = useAppData();
  const invite = pendingInvite.get();
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <Text style={s.title}>{error ? 'No se ha podido cargar tu calendario' : 'Aún no tienes calendario'}</Text>
        {error ? (
          <>
            <Banner kind="error">{error}</Banner>
            <Button title="Reintentar" onPress={refresh} />
          </>
        ) : (
          <>
            <Text style={s.text}>
              {invite
                ? 'Tienes una invitación de tu pareja abierta en este móvil.'
                : 'Crea tu calendario de turnos. Si tu pareja te ha invitado, abre su enlace con esta misma cuenta.'}
            </Text>
            {invite ? <Button title="Abrir la invitación de mi pareja" onPress={() => router.replace(`/invitacion?token=${invite}`)} /> : null}
            <Button title="Crear mi calendario" variant={invite ? 'secondary' : 'primary'} onPress={() => router.replace('/unirse')} />
          </>
        )}
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
