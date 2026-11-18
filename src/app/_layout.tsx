import React from 'react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, ToastProvider } from '../shared/ui';
import { AppDataProvider } from '../modules/shifts/data/AppData';
export default function Layout() {
  return <SafeAreaProvider><ToastProvider><AppDataProvider><StatusBar style="light" /><View style={{flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: colors.bg}}><Slot /></View></AppDataProvider></ToastProvider></SafeAreaProvider>;
}
