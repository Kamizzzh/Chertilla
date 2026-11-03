import type { LineStyle } from '@/types/shapes';

export const LINE_STYLE_OPTIONS: { id: LineStyle; label: string }[] = [
  { id: 'solid_thick', label: 'Сплошная толстая' },
  { id: 'solid_thin', label: 'Сплошная тонкая' },
  { id: 'wavy', label: 'Сплошная волнистая' },
  { id: 'dashed', label: 'Штриховая' },
  { id: 'dash_dot_thin', label: 'Штрихпунктирная тонкая' },
  { id: 'dash_dot_thick', label: 'Штрихпунктирная утолщённая' },
  { id: 'open_dotted', label: 'Разомкнутая, точечная' },
  { id: 'solid_kinks', label: 'Сплошная с изломами' },
  { id: 'dash_dot_dot', label: 'Штрихпунктирная с двумя точками' },
];

/** Длины штрихов и промежутков в экранных px; на холсте делятся на масштаб. */
export const DASH_INTERVALS_PX: Partial<Record<LineStyle, number[]>> = {
  dashed: [12, 6],
  dash_dot_thin: [16, 5, 1, 5],
  dash_dot_thick: [16, 5, 2, 5],
  open_dotted: [1, 5],
  dash_dot_dot: [16, 5, 1, 4, 1, 5],
};

export const WAVY_EFFECT = { length: 4, deviation: 1.2, seed: 0 };
export const KINKS_EFFECT = { length: 14, deviation: 3, seed: 0 };

export const CAD_COLORS = [
  { value: '#FF0000', label: 'Красный' },
  { value: '#FFFF00', label: 'Жёлтый' },
  { value: '#00FF00', label: 'Зелёный' },
  { value: '#00FFFF', label: 'Голубой' },
  { value: '#0000FF', label: 'Синий' },
  { value: '#FF00FF', label: 'Пурпурный' },
] as const;
