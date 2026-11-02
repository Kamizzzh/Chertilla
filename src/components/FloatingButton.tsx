import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  /** Значок на кнопке (один символ). */
  icon: string;
  onPress: () => void;
  /** Положение кнопки на экране (top/left/right/bottom). */
  style?: StyleProp<ViewStyle>;
  /** Подпись для экранного диктора. */
  accessibilityLabel: string;
};

/** Размер круглой плавающей кнопки, пт. */
export const FLOATING_BUTTON_SIZE = 40;

/** Круглая кнопка, «парящая» над холстом (возврат в меню, разворот панели). */
export function FloatingButton({ icon, onPress, style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Кнопка небольшая, поэтому зона нажатия чуть шире её самой.
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, style]}>
      <Text style={styles.icon}>{icon}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      position: 'absolute',
      width: FLOATING_BUTTON_SIZE,
      height: FLOATING_BUTTON_SIZE,
      borderRadius: FLOATING_BUTTON_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      // Тень, чтобы кнопка была заметна поверх чертежа.
      elevation: 4,
      shadowColor: colors.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    buttonPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
    icon: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
