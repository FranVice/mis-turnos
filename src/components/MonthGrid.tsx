import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { compactTime, endsNextDay, MonthRef, monthWeeks, parseISO, WEEKDAYS_SHORT } from '../lib/dates';
import { isAllDay, KIND_LABEL, type Person, type Shift } from '../lib/types';
import { colors, tint } from './ui';

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
      style={({ pressed }) => [
        s.cell,
        isToday && s.cellToday,
        isSelected && s.cellSelected,
        pressed && { opacity: 0.6 },
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
        const color = p?.color ?? colors.muted;
        return (
          <View key={sh.id} style={[s.pill, { backgroundColor: tint(color, 0.16), borderLeftColor: color }]}>
            <Text style={[s.pillInitial, { color }]}>{p?.initial ?? '?'}</Text>
            {/* Entrada arriba y salida abajo: así caben las horas en el ancho del iPhone. */}
            <View style={s.pillTimes}>
              {isAllDay(sh.kind) ? <Text style={{fontSize: 9, lineHeight: 15, color: colors.text}} numberOfLines={1}>{KIND_LABEL[sh.kind]}</Text> : <>
              <Text style={s.pillStart} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {compactTime(sh.start)}
              </Text>
              <Text style={s.pillEnd} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {compactTime(sh.end)}
                {endsNextDay(sh.start, sh.end) ? <Text style={s.nextDay}>+1</Text> : null}
              </Text>
              </>}
            </View>
          </View>
        );
      })}
    </Pressable>
  );
});

const s = StyleSheet.create({
  weekHeader: { flexDirection: 'row', paddingBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.muted },
  weekend: { color: colors.faint },
  week: { flexDirection: 'row' },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    margin: 1,
    padding: 2,
    borderRadius: 8,
    backgroundColor: colors.card,
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellEmpty: { backgroundColor: 'transparent' },
  cellToday: { borderColor: colors.today },
  cellSelected: { borderColor: colors.selected, backgroundColor: '#EDEBE6' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayNumWrap: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dayNumToday: { backgroundColor: colors.today },
  dayNum: { fontSize: 13, fontWeight: '600', color: colors.text },
  dayNumTodayText: { color: '#FFFFFF', fontWeight: '800' },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  checkMark: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', lineHeight: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingLeft: 2,
    paddingRight: 1,
    paddingVertical: 1,
    gap: 2,
  },
  pillInitial: { fontSize: 10, fontWeight: '900', lineHeight: 15 },
  pillTimes: { flex: 1 },
  pillStart: { fontSize: 13, lineHeight: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  pillEnd: { fontSize: 13, lineHeight: 15, fontWeight: '600', color: colors.muted, letterSpacing: -0.4 },
  nextDay: { fontSize: 9, fontWeight: '800', color: colors.warnText },
});
