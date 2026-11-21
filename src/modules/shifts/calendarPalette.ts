import type { ShiftKind } from './types';

export const calendarPalette = {
  background: '#F6F3EC',
  panel: '#233A58',
  panelControl: '#2C4666',
  panelBorder: '#5B708B',
  panelHover: '#395779',
  panelMuted: '#C1CEE0',
  cell: '#FFFFFF',
  weekend: '#EDF3FA',
  border: '#D8DFE8',
  ink: '#233A58',
  muted: '#506782',
  hover: '#E0EBF8',
  pressed: '#CFDFF1',
  today: '#BCEBD8',
  onToday: '#17483C',
  todayCell: '#ECF9F3',
  todayBorder: '#43846F',
  selectedCell: '#DCE9F8',
} as const;

export const shiftBadgeColors: Record<ShiftKind, { backgroundColor: string; color: string }> = {
  manana: { backgroundColor: '#FBEBC0', color: '#69450B' },
  tarde: { backgroundColor: '#F7DDE7', color: '#7F3155' },
  noche: { backgroundColor: '#E9E1FA', color: '#553D83' },
  libre: { backgroundColor: '#DAEEDD', color: '#285A3B' },
  vacaciones: { backgroundColor: '#D6EFED', color: '#175B5D' },
  otro: { backgroundColor: '#E7ECF3', color: '#435571' },
};

export const calendarButtons = {
  primary: { bg: calendarPalette.today, fg: calendarPalette.onToday, border: '#A2CFBD', hover: '#ADE2CE' },
  secondary: { bg: calendarPalette.cell, fg: calendarPalette.ink, border: '#BBCADC', hover: calendarPalette.hover },
  ghost: { bg: 'transparent', fg: calendarPalette.ink, border: 'transparent', hover: calendarPalette.hover },
  danger: { bg: '#F8E1E2', fg: '#862D3A', border: '#D9A0A7', hover: '#F1CED2' },
} as const;
