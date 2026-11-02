import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { XLineMode } from '@/types/shapes';

const MODES: { mode: XLineMode; label: string }[] = [
  { mode: 'axisX', label: 'Ось X' },
  { mode: 'axisY', label: 'Ось Y' },
  { mode: 'angle', label: 'Свой угол' },
  { mode: 'twoPoints', label: '2 точки' },
];

type Props = {
  mode: XLineMode;
  onSelectMode: (mode: XLineMode) => void;
  /** Текст из поля ввода угла (в градусах), как его набрал пользователь. */
  angleText: string;
  onChangeAngleText: (text: string) => void;
  /** true — в поле угла не число, поле подсвечивается красным. */
  angleInvalid: boolean;
};

/** Подменю инструмента «Прямая»: выбор способа построения. */
export function XLineMenu({ mode, onSelectMode, angleText, onChangeAngleText, angleInvalid }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.panel}>
      {MODES.map(({ mode: m, label }) => {
        const active = m === mode;
        return (
          <View key={m} style={styles.item}>
            <Pressable
              onPress={() => onSelectMode(m)}
              style={({ pressed }) => [
                styles.button,
                active && styles.buttonActive,
                pressed && !active && styles.buttonPressed,
              ]}>
              <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{label}</Text>
            </Pressable>

            {m === 'angle' && active && (
              <TextInput
                value={angleText}
                onChangeText={onChangeAngleText}
                placeholder="°"
                // На iOS в обычной цифровой клавиатуре нет минуса.
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
                selectTextOnFocus
                style={[styles.input, angleInvalid && styles.inputInvalid]}
              />
            )}
          </View>
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
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
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
    input: {
      width: 64,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      fontSize: 14,
      color: colors.text,
    },
    inputInvalid: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSurface,
    },
  });
