import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, type ThemeColors, type ThemeName } from '@/constants/theme';

export type ThemeMode = ThemeName | 'system';

type ThemeContextValue = {
  mode: ThemeMode;
  colorScheme: ThemeName;
  colors: ThemeColors;
  setTheme: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Для Альфа-версии темная тема выбрана по умолчанию; системный режим можно включить через setTheme. */
export function ThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('dark');
  const colorScheme: ThemeName =
    mode === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colorScheme, colors: Colors[colorScheme], setTheme: setMode }),
    [mode, colorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme должен использоваться внутри ThemeProvider');
  return context;
}
