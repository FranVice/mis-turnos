import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../data/AppData';
import { addDays, endsNextDay, longDate, shortDate } from '../../../shared/lib/dates';
import { isAllDay, Shift, shiftTitle } from '../types';
import { calendarButtons, calendarPalette as palette, shiftBadgeColors } from '../calendarPalette';
import { Button, tint } from '../../../shared/ui';
import { pressFeedback, radius, webTransition, type InteractionState } from '../../../shared/theme';

// Detalle de un día: nombres completos, tipo y horas. Tocar un turno lo edita.
export function DayDetail({
  date,
  onAdd,
  onEdit,
  footerInset,
}: {
  date: string;
  onAdd: (date: string) => void;
  onEdit: (shift: Shift) => void;
  footerInset: number;
}) {
  const { shiftsByDate, personById, me, today } = useAppData();
  const shifts = shiftsByDate.get(date) ?? [];
  const continuing = (shiftsByDate.get(addDays(date, -1)) ?? []).filter(s => !isAllDay(s.kind) && endsNextDay(s.start, s.end));
  // Cada uno añade solo sus turnos: uno por persona y día.
  const mineTaken = !!me && shifts.some((s) => s.personId === me.id);
  // Si ya tienes turno este día, se ofrece el siguiente día libre para seguir añadiendo sin salir.
  const addDate = (() => {
    if (!me || !mineTaken) return date;
    for (let i = 1; i <= 62; i++) {
      const d = addDays(date, i);
      if (!(shiftsByDate.get(d) ?? []).some((s) => s.personId === me.id)) return d;
    }
    return null;
  })();

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} indicatorStyle="black">
        <Text style={s.title}>{capitalize(longDate(date))}</Text>
        {date === today ? <Text style={s.todayTag}>Hoy</Text> : null}

        {continuing.map(sh => <Text key={sh.id} style={s.kind}>{personById(sh.personId)?.name}: continúa la noche anterior hasta las {sh.end}.</Text>)}
        {shifts.length === 0 ? <Text style={s.empty}>Sin turnos este día.</Text> : null}

        {shifts.map((sh) => {
          const p = personById(sh.personId);
          const color = p?.color ?? palette.muted;
          const badge = shiftBadgeColors[sh.kind];
          const mine = !!me && sh.personId === me.id;
          return (
            <Pressable
              key={sh.id}
              accessibilityRole={mine ? 'button' : undefined}
              accessibilityHint={mine ? 'Abre el turno para editarlo' : undefined}
              disabled={!mine}
              onPress={() => onEdit(sh)}
              style={(state: InteractionState) => [s.card, webTransition, { borderLeftColor: color }, pressFeedback(state, palette.hover)]}
            >
              <View style={[s.avatar, { backgroundColor: tint(color, 0.28) }]}>
                <Text style={s.avatarText}>{p?.initial ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{p?.name ?? 'Persona desconocida'}</Text>
                <View style={[s.kindBadge, { backgroundColor: badge.backgroundColor }]}>
                  <Text style={[s.kindBadgeText, { color: badge.color }]}>{shiftTitle(sh)}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.hours}>
                  {isAllDay(sh.kind) ? 'Día completo' : sh.start + '–' + sh.end}
                </Text>
                {!isAllDay(sh.kind) && endsNextDay(sh.start, sh.end) ? <Text style={s.nextDay}>acaba al día siguiente</Text> : null}
              </View>
              {mine ? <Ionicons name="chevron-forward" size={20} color={palette.muted} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: 12 + footerInset }]}>
        <Button
          title={addDate && addDate !== date ? `Añadir turno el ${shortDate(addDate)}` : 'Añadir turno'}
          onPress={() => addDate && onAdd(addDate)}
          disabled={!me || !addDate}
          palette={calendarButtons.primary}
          icon={<Ionicons name="add" size={22} color={calendarButtons.primary.fg} />}
        />
        {mineTaken ? <Text style={s.fullHint}>Ya tienes turno este día (toca el tuyo para editarlo).</Text> : null}
      </View>
    </View>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: palette.ink },
  todayTag: {
    alignSelf: 'flex-start',
    backgroundColor: palette.today,
    color: palette.onToday,
    fontWeight: '800',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: -4,
  },
  empty: { fontSize: 17, color: palette.muted, paddingVertical: 24, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    minHeight: 72,
    backgroundColor: palette.cell,
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '700', color: palette.ink },
  kind: { fontSize: 15, color: palette.muted, marginTop: 2 },
  kindBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, marginTop: 3 },
  kindBadgeText: { fontSize: 14, fontWeight: '700' },
  hours: { fontSize: 17, fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  nextDay: { fontSize: 12, color: shiftBadgeColors.manana.color, fontWeight: '600' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: palette.background,
  },
  fullHint: { fontSize: 14, color: palette.muted, textAlign: 'center' },
});
