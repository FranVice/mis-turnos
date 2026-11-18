import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { moduleByKey, type ModuleKey } from '../navigation/modules';
import { colors, radius, tint } from '../theme';

// Pantalla provisional para los módulos que aún no están construidos.
export function ComingSoon({ moduleKey }: { moduleKey: ModuleKey }) {
  const mod = moduleByKey(moduleKey);
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.brand}>Nexo</Text>
        <Text style={s.title} accessibilityRole="header">{mod.title}</Text>
        <Text style={s.summary}>{mod.summary}</Text>

        <View style={s.card}>
          <View style={[s.badge, { backgroundColor: tint(mod.accent, 0.16) }]}>
            <Ionicons name={mod.icon} size={30} color={mod.accent} />
          </View>
          <Text style={s.cardTitle}>Próximamente</Text>
          <Text style={s.cardText}>Este módulo está en preparación. La primera fase incluirá:</Text>
          <View style={s.list}>
            {mod.phase1?.map((item) => (
              <View key={item} style={s.row}>
                <Ionicons name="ellipse" size={7} color={mod.accent} />
                <Text style={s.rowText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 4 },
  brand: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  summary: { fontSize: 15, color: colors.muted, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  badge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  cardText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  list: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { fontSize: 15, color: colors.text, flexShrink: 1 },
});
