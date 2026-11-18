import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '../../modules/shifts/data/AppData';
import { LoginScreen } from '../../shared/auth/LoginScreen';
import { MODULES } from '../../shared/navigation/modules';
import { colors } from '../../shared/theme';

export default function TabsLayout() {
  const { authReady, signedIn, recovering } = useAppData();
  const insets = useSafeAreaInsets();

  // Misma lógica que la antigua App.tsx: sin sesión (o recuperando contraseña) se muestra el acceso.
  if (!authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Cargando sesión" />
      </View>
    );
  }
  if (!signedIn || recovering) return <LoginScreen />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.faint,
        // Altura propia: la predeterminada (49) recorta las etiquetas en web.
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 58 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 4),
        },
        // Cada pestaña mide 49 px por defecto (5 + icono 28 + texto 11 + 5) y corta las letras.
        tabBarItemStyle: { height: 54 },
        tabBarLabelStyle: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'today' : 'today-outline'} size={23} color={color as string} />,
        }}
      />
      {MODULES.map((m) => (
        <Tabs.Screen
          key={m.key}
          name={m.key}
          options={{
            title: m.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? m.iconActive : m.icon} size={23} color={focused ? m.accent : (color as string)} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
