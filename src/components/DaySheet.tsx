import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../data/AppData';
import { addDays, endsNextDay, longDate } from '../lib/dates';
import { isAllDay, KIND_COLOR, KIND_LABEL, Shift } from '../lib/types';
import { Button, colors, tint } from './ui';
import { pressFeedback, radius, shadow, webTransition, type InteractionState } from '../shared/theme';

// Detalle de un día: nombres completos, tipo y horas. Tocar un turno lo edita.
export function DayDetail({
  date,
  onAdd,
  onEdit,
  footerInset,
}: {
  date: string;
  onAdd: () => void;
  onEdit: (shift: Shift) => void;
  footerInset: number;
}) {
  const { shiftsByDate, personById, people, today } = useAppData();
  const shifts = shiftsByDate.get(date) ?? [];
  const continuing = (shiftsByDate.get(addDays(date, -1)) ?? []).filter(s => !isAllDay(s.kind) && endsNextDay(s.start, s.end));
  const full = people.length > 0 && people.every((p) => shifts.some((s) => s.personId === p.id));

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{capitalize(longDate(date))}</Text>
        {date === today ? <Text style={s.todayTag}>Hoy</Text> : null}

        {continuing.map(sh => <Text key={sh.id} style={s.kind}>{personById(sh.personId)?.name}: continúa la noche anterior hasta las {sh.end}.</Text>)}
        {shifts.length === 0 ? <Text style={s.empty}>Sin turnos este día.</Text> : null}

        {shifts.map((sh) => {
          const p = personById(sh.personId);
          const color = p?.color ?? colors.muted;
          return (
            <Pressable
              key={sh.id}
              accessibilityRole="button"
              accessibilityHint="Abre el turno para editarlo"
              onPress={() => onEdit(sh)}
              style={(state: InteractionState) => [s.card, webTransition, { borderLeftColor: color }, pressFeedback(state, colors.elevated)]}
            >
              <View style={[s.avatar, { backgroundColor: color }]}>
                <Text style={s.avatarText}>{p?.initial ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{p?.name ?? 'Persona desconocida'}</Text>
                <View style={[s.kindBadge, { backgroundColor: tint(KIND_COLOR[sh.kind], 0.18) }]}>
                  <Text style={[s.kindBadgeText, { color: KIND_COLOR[sh.kind] }]}>{KIND_LABEL[sh.kind]}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.hours}>
                  {isAllDay(sh.kind) ? 'Día completo' : sh.start + '–' + sh.end}
                </Text>
                {!isAllDay(sh.kind) && endsNextDay(sh.start, sh.end) ? <Text style={s.nextDay}>acaba al día siguiente</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faint} />
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: 12 + footerInset }]}>
        <Button
          title="Añadir turno"
          onPress={onAdd}
          disabled={full}
          icon={<Ionicons name="add" size={22} color={colors.onPrimary} />}
        />
        {full ? <Text style={s.fullHint}>Los dos ya tenéis turno este día. Toca uno para editarlo.</Text> : null}
      </View>
    </View>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  todayTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.today,
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: -4,
  },
  empty: { fontSize: 17, color: colors.muted, paddingVertical: 24, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    minHeight: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  kind: { fontSize: 15, color: colors.muted, marginTop: 2 },
  kindBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, marginTop: 3 },
  kindBadgeText: { fontSize: 14, fontWeight: '700' },
  hours: { fontSize: 17, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  nextDay: { fontSize: 12, color: colors.warnText, fontWeight: '600' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  fullHint: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
