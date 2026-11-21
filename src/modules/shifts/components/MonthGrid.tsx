import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MonthRef, monthWeeks, parseISO, WEEKDAYS_SHORT } from '../../../shared/lib/dates';
import { isAllDay, KIND_LABEL, KIND_LETTER, shiftTitle, type Person, type Shift } from '../types';
import { radius, tint, webTransition, type InteractionState } from '../../../shared/theme';
import { calendarPalette, shiftBadgeColors } from '../calendarPalette';

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
                isWeekend={di >= 5}
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
  isWeekend,
  isToday,
  shifts,
  personById,
  selecting,
  isSelected,
  onPress,
  onLongPress,
}: {
  date: string;
  isWeekend: boolean;
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
          .map((sh) => `${personById(sh.personId)?.name ?? ''}: ${shiftTitle(sh)}${isAllDay(sh.kind) ? ', día completo' : ' de ' + sh.start + ' a ' + sh.end}`)
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
      style={({ pressed, hovered }: InteractionState) => [
        s.cell,
        webTransition,
        isWeekend && s.cellWeekend,
        hovered && s.cellHover,
        isToday && s.cellToday,
        isSelected && s.cellSelected,
        hovered && (isToday || isSelected) && s.cellActiveHover,
        pressed && s.cellPressed,
      ]}
    >
      <View style={s.dayRow}>
        <View style={[s.dayNumWrap, isToday && s.dayNumToday]}>
          <Text style={[s.dayNum, isWeekend && s.dayNumWeekend, isToday && s.dayNumTodayText]}>{day}</Text>
        </View>
        {selecting ? <View style={[s.check, isSelected && s.checkOn]}>{isSelected ? <Text style={s.checkMark}>✓</Text> : null}</View> : null}
      </View>
      {shifts?.map((sh) => {
        const p = personById(sh.personId);
        const personColor = p?.color ?? calendarPalette.muted;
        const { backgroundColor, color } = shiftBadgeColors[sh.kind];
        return (
          <View key={sh.id} style={s.pill}>
            <Text style={[s.pillInitial, { backgroundColor: tint(personColor, 0.28) }]}>
              {p?.initial ?? '?'}
            </Text>
            {/* Turnos con horario: solo la letra (M, T, N); las horas se ven al tocar el día. */}
            <View style={[s.pillKind, { backgroundColor }]}>
              {isAllDay(sh.kind) ? (
                <Text style={[s.pillAllDay, { color }]} numberOfLines={1}>{sh.kind === 'vacaciones' ? 'Vac.' : KIND_LABEL[sh.kind]}</Text>
              ) : (
                <Text style={[s.pillLetter, { color }]} numberOfLines={1}>{KIND_LETTER[sh.kind]}</Text>
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
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '800', color: calendarPalette.muted, letterSpacing: 0.6 },
  weekend: { color: calendarPalette.ink },
  week: { flexDirection: 'row' },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    margin: 1.5,
    padding: 2,
    borderRadius: radius.sm,
    backgroundColor: calendarPalette.cell,
    gap: 2,
    borderWidth: 1.5,
    borderColor: calendarPalette.border,
  },
  cellEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  cellWeekend: { backgroundColor: calendarPalette.weekend },
  cellHover: { backgroundColor: calendarPalette.hover, borderColor: calendarPalette.muted },
  cellToday: { borderColor: calendarPalette.todayBorder, backgroundColor: calendarPalette.todayCell },
  cellSelected: { borderColor: calendarPalette.ink, backgroundColor: calendarPalette.selectedCell },
  cellActiveHover: { backgroundColor: calendarPalette.hover },
  cellPressed: { backgroundColor: calendarPalette.pressed },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayNumWrap: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dayNumToday: { backgroundColor: calendarPalette.today, borderWidth: 1, borderColor: calendarPalette.todayBorder },
  dayNum: { fontSize: 14, fontWeight: '800', color: calendarPalette.ink, fontVariant: ['tabular-nums'] },
  dayNumWeekend: { color: calendarPalette.muted },
  dayNumTodayText: { color: calendarPalette.onToday, fontWeight: '900' },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: calendarPalette.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: calendarPalette.ink, borderColor: calendarPalette.ink },
  checkMark: { color: calendarPalette.cell, fontSize: 10, fontWeight: '900', lineHeight: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  pillInitial: { minWidth: 11, borderRadius: 4, overflow: 'hidden', color: calendarPalette.ink, fontSize: 9, fontWeight: '900', lineHeight: 17, textAlign: 'center' },
  pillKind: { flex: 1, minWidth: 0, borderRadius: 4, paddingVertical: 1 },
  pillAllDay: { fontSize: 9, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  pillLetter: { fontSize: 13, lineHeight: 15, fontWeight: '900', textAlign: 'center' },
});
