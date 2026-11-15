import React from 'react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/ui';
import { AppDataProvider } from '../data/AppData';
export default function Layout() {
  return <SafeAreaProvider><ToastProvider><AppDataProvider><StatusBar style="dark" /><View style={{flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center'}}><Slot /></View></AppDataProvider></ToastProvider></SafeAreaProvider>;
}
