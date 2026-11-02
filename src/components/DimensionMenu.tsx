import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { DimensionAxis } from '@/types/shapes';

const MODES: { axis: DimensionAxis; label: string }[] = [
  { axis: 'aligned', label: 'Параллельный' },
  { axis: 'x', label: 'По X' },
  { axis: 'y', label: 'По Y' },
];

type Props = {
  axis: DimensionAxis;
  onSelectAxis: (axis: DimensionAxis) => void;
};

/** Подменю инструмента «Размер»: какой размер строить. */
export function DimensionMenu({ axis, onSelectAxis }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.panel}>
      {MODES.map(({ axis: a, label }) => {
        const active = a === axis;
        return (
          <Pressable
            key={a}
            onPress={() => onSelectAxis(a)}
            style={({ pressed }) => [
              styles.button,
              active && styles.buttonActive,
              pressed && !active && styles.buttonPressed,
            ]}>
            <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    panel: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      padding: 6,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    button: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    buttonPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
    buttonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    buttonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    buttonTextActive: {
      color: colors.onPrimary,
    },
  });
