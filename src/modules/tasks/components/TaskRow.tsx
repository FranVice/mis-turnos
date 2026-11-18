import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, shortDate, weekdayIndex } from '../../../shared/lib/dates';
import { moduleByKey } from '../../../shared/navigation/modules';
import { colors, pressFeedback, webTransition, type InteractionState } from '../../../shared/theme';
import { useAppData } from '../../shifts/data/AppData';
import type { Task } from '../types';

const ACCENT = moduleByKey('tareas').accent;
const WEEKDAY = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** «Hoy», «Mañana», «Ayer», «vie 21 nov»… */
export function dueLabel(due: string, today: string): string {
  if (due === today) return 'Hoy';
  if (due === addDays(today, 1)) return 'Mañana';
  if (due === addDays(today, -1)) return 'Ayer';
  return `${WEEKDAY[weekdayIndex(due)]} ${shortDate(due)}`;
}

export const TaskRow = memo(function TaskRow({
  task,
  today,
  first,
  onToggle,
  onOpen,
  compact,
}: {
  task: Task;
  today: string;
  first?: boolean;
  onToggle?: (task: Task) => void;
  onOpen?: () => void;
  /** Versión para Inicio: sin botón de completar. */
  compact?: boolean;
}) {
  const { personById, people, me } = useAppData();
  const done = !!task.doneAt;
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  const assignee = task.assigneeId ? personById(task.assigneeId) : undefined;
  const owners = assignee ? [assignee] : people;
  const whoLabel = assignee ? (assignee.id === me?.id ? 'Tú' : assignee.name) : 'Los dos';

  return (
    <View style={[s.row, !first && s.divider]}>
      {!compact ? (
        <Pressable
          onPress={() => onToggle?.(task)}
          accessibilityRole="checkbox"
          aria-checked={done}
          accessibilityLabel={`${done ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${task.title}`}
          hitSlop={8}
          style={s.checkHit}
        >
          <View style={[s.check, done && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
            {done ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
          </View>
        </Pressable>
      ) : (
        <View style={[s.dot, { backgroundColor: overdue ? colors.danger : ACCENT }]} />
      )}
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. ${whoLabel}${task.dueDate ? '. ' + dueLabel(task.dueDate, today) : ''}`}
        style={(st: InteractionState) => [s.body, webTransition, pressFeedback(st)]}
      >
        <Text style={[s.title, done && s.titleDone]} numberOfLines={2}>{task.title}</Text>
        <View style={s.meta}>
          <View style={s.avatars}>
            {owners.map((p, i) => (
              <View key={p.id} style={[s.avatar, { backgroundColor: p.color, marginLeft: i ? -5 : 0 }]}>
                <Text style={s.avatarText}>{p.initial}</Text>
              </View>
            ))}
          </View>
          <Text style={s.metaText}>{whoLabel}</Text>
          {task.dueDate ? (
            <Text style={[s.metaText, overdue && { color: colors.danger, fontWeight: '700' }]}>
              · {overdue ? `Venció ${dueLabel(task.dueDate, today).replace(/^Ayer$/, 'ayer')}` : dueLabel(task.dueDate, today)}
            </Text>
          ) : null}
          {task.notes ? <Ionicons name="document-text-outline" size={13} color={colors.faint} /> : null}
        </View>
      </Pressable>
    </View>
  );
});

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  checkHit: { paddingVertical: 12, paddingRight: 10 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  body: { flex: 1, minWidth: 0, paddingVertical: 11, paddingRight: 12, gap: 4 },
  title: { fontSize: 16, color: colors.text, fontWeight: '600' },
  titleDone: { color: colors.faint, textDecorationLine: 'line-through', fontWeight: '500' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  avatars: { flexDirection: 'row' },
  avatar: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.card },
  avatarText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  metaText: { fontSize: 13, color: colors.muted },
});
