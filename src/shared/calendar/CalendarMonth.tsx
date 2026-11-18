import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MonthRef, monthWeeks, parseISO, WEEKDAYS_SHORT } from '../lib/dates';
import { colors, pressFeedback, radius, tint, webTransition, type InteractionState } from '../theme';

// Calendario mensual genérico de Nexo. No conoce los módulos: cada día recibe
// sus marcas (letras, barras y puntos) ya calculadas por quien lo usa.

export interface DayMark {
  /** Letras pequeñas en una fila (p. ej. turnos: M, T, L…). */
  letters?: { text: string; color: string }[];
  /** Barras con texto corto (p. ej. citas). Se muestran como mucho 2. */
  bars?: { label: string; color: string }[];
  /** Puntos con contador (p. ej. tareas que vencen ese día). */
  dots?: { color: string; count: number }[];
  /** Texto accesible del contenido del día. */
  a11y?: string;
}

interface Props {
  month: MonthRef;
  today: string;
  selected: string | null;
  marks: Map<string, DayMark>;
  onSelect: (date: string) => void;
}

const MAX_BARS = 2;

export function CalendarMonth({ month, today, selected, marks, onSelect }: Props) {
  const weeks = monthWeeks(month);
  return (
    <View>
      <View style={s.weekHeader}>
        {WEEKDAYS_SHORT.map((d, i) => (
          <Text key={d + i} style={[s.weekday, i >= 5 && s.weekend]}>{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.week}>
          {week.map((date, di) =>
            date ? (
              <Day key={date} date={date} isToday={date === today} isSelected={date === selected} mark={marks.get(date)} onSelect={onSelect} />
            ) : (
              <View key={`e${wi}-${di}`} style={[s.cell, s.cellEmpty]} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const Day = memo(function Day({
  date,
  isToday,
  isSelected,
  mark,
  onSelect,
}: {
  date: string;
  isToday: boolean;
  isSelected: boolean;
  mark?: DayMark;
  onSelect: (date: string) => void;
}) {
  const day = parseISO(date).d;
  const bars = mark?.bars ?? [];
  const extra = bars.length - MAX_BARS;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Día ${day}${mark?.a11y ? ', ' + mark.a11y : ', sin nada'}`}
      aria-selected={isSelected}
      onPress={() => onSelect(date)}
      style={(st: InteractionState) => [
        s.cell,
        webTransition,
        pressFeedback(st, colors.elevated),
        isToday && s.cellToday,
        isSelected && s.cellSelected,
      ]}
    >
      <View style={s.top}>
        <View style={[s.num, isToday && s.numToday]}>
          <Text style={[s.numText, isToday && s.numTodayText]}>{day}</Text>
        </View>
        {mark?.letters?.length ? (
          <View style={s.letters}>
            {mark.letters.map((l, i) => (
              <Text key={i} style={[s.letter, { color: l.color }]}>{l.text}</Text>
            ))}
          </View>
        ) : null}
      </View>
      {bars.slice(0, MAX_BARS).map((b, i) => (
        <View key={i} style={[s.bar, { backgroundColor: tint(b.color, 0.22), borderLeftColor: b.color }]}>
          <Text style={s.barText} numberOfLines={1}>{b.label}</Text>
        </View>
      ))}
      {extra > 0 ? <Text style={s.more}>+{extra}</Text> : null}
      {mark?.dots?.length ? (
        <View style={s.dots}>
          {mark.dots.map((d, i) => (
            <View key={i} style={s.dotWrap}>
              <View style={[s.dot, { backgroundColor: d.color }]} />
              {d.count > 1 ? <Text style={[s.dotCount, { color: d.color }]}>{d.count}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
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
    minHeight: 74,
    margin: 1.5,
    padding: 3,
    gap: 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellEmpty: { backgroundColor: 'transparent' },
  cellToday: { borderColor: colors.today, backgroundColor: tint(colors.today, 0.1) },
  cellSelected: { borderColor: colors.selected, backgroundColor: colors.elevated },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  num: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  numToday: { backgroundColor: colors.today },
  numText: { fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  numTodayText: { color: colors.onPrimary, fontWeight: '800' },
  letters: { flexDirection: 'row', gap: 1, flexShrink: 1 },
  letter: { fontSize: 10, fontWeight: '900', lineHeight: 12 },
  bar: { borderRadius: 3, borderLeftWidth: 2, paddingHorizontal: 2, paddingVertical: 1 },
  barText: { fontSize: 9, lineHeight: 11, fontWeight: '700', color: colors.text },
  more: { fontSize: 9, fontWeight: '800', color: colors.muted, paddingLeft: 2 },
  dots: { flexDirection: 'row', gap: 4, marginTop: 'auto', paddingLeft: 1 },
  dotWrap: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotCount: { fontSize: 9, fontWeight: '800', lineHeight: 10 },
});
