// Registro único de los módulos de Nexo. La barra de pestañas y la
// cuadrícula de Inicio salen de aquí, así todos tienen el mismo peso.
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { colors } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export type ModuleKey = 'turnos' | 'agenda' | 'tareas' | 'economia' | 'casa';

export interface NexoModule {
  key: ModuleKey;
  /** Ruta de Expo Router (coincide con el archivo en src/app/(tabs)). */
  href: `/${ModuleKey}`;
  title: string;
  icon: IconName;
  iconActive: IconName;
  /** Color de acento del módulo (provisional hasta cerrar la identidad visual). */
  accent: string;
  /** Resumen corto para Inicio y para la pantalla «Próximamente». */
  summary: string;
  ready: boolean;
  /** Lo que incluirá la primera fase (solo módulos aún no disponibles). */
  phase1?: string[];
}

export const MODULES: NexoModule[] = [
  {
    key: 'turnos',
    href: '/turnos',
    title: 'Turnos',
    icon: 'briefcase-outline',
    iconActive: 'briefcase',
    accent: colors.primary,
    summary: 'Horarios de los dos',
    ready: true,
  },
  {
    key: 'agenda',
    href: '/agenda',
    title: 'Agenda',
    icon: 'calendar-outline',
    iconActive: 'calendar',
    // Violeta: el rosa coincidía con el turno de tarde en el calendario unificado.
    accent: '#C084FC',
    summary: 'Citas y calendario común',
    ready: true,
    phase1: ['Citas personales y familiares', 'Calendario mensual compartido', 'Agenda desplegable por día', 'Citas próximas en Inicio'],
  },
  {
    key: 'tareas',
    href: '/tareas',
    title: 'Tareas',
    icon: 'checkbox-outline',
    iconActive: 'checkbox',
    accent: '#4CC38A',
    summary: 'Pendientes y recordatorios',
    ready: true,
    phase1: ['Crear tareas en segundos', 'Asignar a Franklin, Almudena o ambos', 'Fecha de vencimiento opcional', 'Pendientes importantes en Inicio'],
  },
  {
    key: 'economia',
    href: '/economia',
    title: 'Economía',
    icon: 'wallet-outline',
    iconActive: 'wallet',
    accent: '#F2C94C',
    summary: 'Caja familiar, ingresos y gastos',
    ready: true,
    phase1: ['Caja familiar única', 'Ingresos fijos y extras', 'Gastos fijos y variables', 'Previsto frente a realizado', 'Saldo y previsión del mes'],
  },
  {
    key: 'casa',
    href: '/casa',
    title: 'Casa',
    icon: 'home-outline',
    iconActive: 'home',
    accent: '#2EC4C4',
    summary: 'Organización del hogar',
    ready: false,
    phase1: ['Fases pendientes de definir', 'Candidatas: rutinas, limpieza, compra y comidas'],
  },
];

export const moduleByKey = (key: ModuleKey) => MODULES.find((m) => m.key === key)!;
