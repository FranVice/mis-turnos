import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from './src/shared/ui';
import { useAppData } from './src/modules/shifts/data/AppData';
import { ShiftsScreen } from './src/modules/shifts/ShiftsScreen';
import { LoginScreen } from './src/shared/auth/LoginScreen';
export function Root() {
  const { authReady, signedIn, recovering } = useAppData();
  if (!authReady) return <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg}}><ActivityIndicator accessibilityLabel="Cargando sesión" /></View>;
  return signedIn && !recovering ? <ShiftsScreen /> : <LoginScreen />;
}
export default Root;
