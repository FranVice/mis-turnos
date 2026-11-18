import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MonthRef, monthWeeks, parseISO, WEEKDAYS_SHORT } from '../../../shared/lib/dates';
import { isAllDay, KIND_COLOR, KIND_LABEL, KIND_LETTER, type Person, type Shift } from '../types';
import { colors, lighten, pressFeedback, radius, shadow, tint, webTransition, type InteractionState } from '../../../shared/theme';

interface Props {
  month: MonthRef;
  today: string;
  shiftsByDate: Map<string, Shift[]>;
  personById: (id: string) => Person | undefined;
  selecting: boolean;
  selected: Set<string>;
  onPressDay: (date: string) => void;
  onLongPressDay: (date: string) => void;
}

export function MonthGrid({
  month,
  today,
  shiftsByDate,
  personById,
  selecting,
  selected,
  onPressDay,
  onLongPressDay,
}: Props) {
  const weeks = monthWeeks(month);
  return (
    <View>
      <View style={s.weekHeader}>
        {WEEKDAYS_SHORT.map((d, i) => (
          <Text key={d + i} style={[s.weekday, i >= 5 && s.weekend]}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.week}>
          {week.map((date, di) =>
            date ? (
              <DayCell
                key={date}
                date={date}
                isToday={date === today}
                shifts={shiftsByDate.get(date)}
                personById={personById}
                selecting={selecting}
                isSelected={selected.has(date)}
                onPress={onPressDay}
                onLongPress={onLongPressDay}
              />
            ) : (
              <View key={`e${wi}-${di}`} style={[s.cell, s.cellEmpty]} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const DayCell = memo(function DayCell({
  date,
  isToday,
  shifts,
  personById,
  selecting,
  isSelected,
  onPress,
  onLongPress,
}: {
  date: string;
  isToday: boolean;
  shifts: Shift[] | undefined;
  personById: (id: string) => Person | undefined;
  selecting: boolean;
  isSelected: boolean;
  onPress: (date: string) => void;
  onLongPress: (date: string) => void;
}) {
  const day = parseISO(date).d;
  const label =
    `Día ${day}` +
    (shifts?.length
      ? ', ' +
        shifts
          .map((sh) => `${personById(sh.personId)?.name ?? ''}: ${KIND_LABEL[sh.kind]}${isAllDay(sh.kind) ? ', día completo' : ' de ' + sh.start + ' a ' + sh.end}`)
          .join(', ')
      : ', sin turnos');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-pressed={isSelected}
      onPress={() => onPress(date)}
      onLongPress={() => onLongPress(date)}
      delayLongPress={350}
      style={(state: InteractionState) => [
        s.cell,
        webTransition,
        pressFeedback(state, colors.elevated),
        isToday && s.cellToday,
        isSelected && s.cellSelected,
      ]}
    >
      <View style={s.dayRow}>
        <View style={[s.dayNumWrap, isToday && s.dayNumToday]}>
          <Text style={[s.dayNum, isToday && s.dayNumTodayText]}>{day}</Text>
        </View>
        {selecting ? <View style={[s.check, isSelected && s.checkOn]}>{isSelected ? <Text style={s.checkMark}>✓</Text> : null}</View> : null}
      </View>
      {shifts?.map((sh) => {
        const p = personById(sh.personId);
        // Borde e inicial: color de la persona. Fondo: color del tipo de turno.
        const personColor = lighten(p?.color ?? colors.muted, 0.3);
        const kindColor = KIND_COLOR[sh.kind];
        return (
          <View key={sh.id} style={[s.pill, { backgroundColor: tint(kindColor, 0.15), borderLeftColor: personColor }]}>
            <Text style={[s.pillInitial, { color: personColor }]}>{p?.initial ?? '?'}</Text>
            {/* Turnos con horario: solo la letra (M, T, N); las horas se ven al tocar el día. */}
            <View style={s.pillTimes}>
              {isAllDay(sh.kind) ? (
                <Text style={[s.pillAllDay, { color: kindColor }]} numberOfLines={1}>{sh.kind === 'vacaciones' ? 'Vacac.' : KIND_LABEL[sh.kind]}</Text>
              ) : (
                <Text style={[s.pillLetter, { color: kindColor }]} numberOfLines={1}>{KIND_LETTER[sh.kind]}</Text>
              )}
            </View>
          </View>
        );
      })}
    </Pressable>
  );
});

const s = StyleSheet.create({
  weekHeader: { flexDirection: 'row', paddingBottom: 6, paddingTop: 2 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.6 },
  weekend: { color: colors.faint },
  week: { flexDirection: 'row' },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    margin: 1.5,
    padding: 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadow.card,
  },
  cellEmpty: { backgroundColor: 'transparent', boxShadow: 'none' },
  cellToday: { borderColor: colors.today, backgroundColor: tint(colors.today, 0.1) },
  cellSelected: { borderColor: colors.selected, backgroundColor: colors.elevated },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayNumWrap: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dayNumToday: { backgroundColor: colors.today },
  dayNum: { fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  dayNumTodayText: { color: colors.onPrimary, fontWeight: '800' },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.onPrimary, fontSize: 10, fontWeight: '900', lineHeight: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    borderLeftWidth: 3,
    paddingLeft: 2,
    paddingRight: 1,
    paddingVertical: 1,
    gap: 2,
  },
  pillInitial: { fontSize: 10, fontWeight: '900', lineHeight: 15 },
  pillTimes: { flex: 1 },
  pillAllDay: { fontSize: 9, lineHeight: 15, fontWeight: '800' },
  pillLetter: { fontSize: 14, lineHeight: 15, fontWeight: '900' },
});
