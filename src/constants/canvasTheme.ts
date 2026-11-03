import type { ThemeName } from '@/constants/theme';

export type CanvasColors = {
  background: string;
  gridMinor: string;
  gridMajor: string;
  axisX: string;
  axisY: string;
  shape: string;
  touchDot: string;
  loupeRim: string;
  loupeOuterRim: string;
};

/** Палитра именно чертежа; интерфейс использует Colors из theme.ts. */
export const CANVAS_COLORS: Record<ThemeName, CanvasColors> = {
  light: {
    background: '#FFFFFF',
    gridMinor: '#E0E0E0',
    gridMajor: '#C4C4C4',
    axisX: '#E53935',
    axisY: '#43A047',
    shape: '#000000',
    touchDot: '#455A64',
    loupeRim: '#FFFFFF',
    loupeOuterRim: '#90A4AE',
  },
  dark: {
    background: '#1E1E1E',
    gridMinor: '#333333',
    gridMajor: '#484848',
    axisX: '#A85F65',
    axisY: '#668F6C',
    shape: '#FFFFFF',
    touchDot: '#B0BEC5',
    loupeRim: '#666666',
    loupeOuterRim: '#999999',
  },
};
