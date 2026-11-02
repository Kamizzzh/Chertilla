export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  surfacePressed: string;
  border: string;
  borderSubtle: string;
  inputBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  placeholder: string;
  disabledText: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  accentSurface: string;
  accentSurfacePressed: string;
  accentText: string;
  debug: string;
  debugPressed: string;
  danger: string;
  dangerSurface: string;
  dangerBorder: string;
  dangerPressed: string;
  dangerText: string;
  overlay: string;
  shadow: string;
};

/** Цвета только интерфейса. Палитра чертежа Skia остаётся независимой. */
export const Colors: Record<ThemeName, ThemeColors> = {
  light: {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceSecondary: '#ECEFF1',
    surfacePressed: '#CFD8DC',
    border: '#CFD8DC',
    borderSubtle: '#E0E0E0',
    inputBorder: '#90A4AE',
    text: '#263238',
    textSecondary: '#37474F',
    textMuted: '#78909C',
    textSubtle: '#90A4AE',
    placeholder: '#B0BEC5',
    disabledText: '#BDBDBD',
    primary: '#546E7A',
    primaryPressed: '#455A64',
    onPrimary: '#FFFFFF',
    accent: '#1E88E5',
    accentPressed: '#1565C0',
    onAccent: '#FFFFFF',
    accentSurface: '#E3F2FD',
    accentSurfacePressed: '#BBDEFB',
    accentText: '#1565C0',
    debug: '#FB8C00',
    debugPressed: '#EF6C00',
    danger: '#E53935',
    dangerSurface: '#FFEBEE',
    dangerBorder: '#E57373',
    dangerPressed: '#FFCDD2',
    dangerText: '#C62828',
    overlay: 'rgba(0, 0, 0, 0.35)',
    shadow: '#000000',
  },
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    surfaceSecondary: '#292929',
    surfacePressed: '#3A3A3A',
    border: '#404040',
    borderSubtle: '#303030',
    inputBorder: '#555555',
    text: '#FFFFFF',
    textSecondary: '#E5E5E5',
    textMuted: '#B0B0B0',
    textSubtle: '#8C8C8C',
    placeholder: '#737373',
    disabledText: '#666666',
    primary: '#64B5F6',
    primaryPressed: '#42A5F5',
    onPrimary: '#121212',
    accent: '#64B5F6',
    accentPressed: '#42A5F5',
    onAccent: '#121212',
    accentSurface: '#17324A',
    accentSurfacePressed: '#234D70',
    accentText: '#90CAF9',
    debug: '#FFB74D',
    debugPressed: '#FFA726',
    danger: '#FF8A80',
    dangerSurface: '#3A2020',
    dangerBorder: '#995555',
    dangerPressed: '#572B2B',
    dangerText: '#FFAB91',
    overlay: 'rgba(0, 0, 0, 0.65)',
    shadow: '#000000',
  },
};
