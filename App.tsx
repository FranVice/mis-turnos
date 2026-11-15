import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from './src/components/ui';
import { useAppData } from './src/data/AppData';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { LoginScreen } from './src/screens/LoginScreen';
export function Root() {
  const { authReady, signedIn, recovering } = useAppData();
  if (!authReady) return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg}}><ActivityIndicator accessibilityLabel="Cargando sesión" /></View>;
  return signedIn && !recovering ? <CalendarScreen /> : <LoginScreen />;
}
export default Root;
