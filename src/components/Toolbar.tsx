import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { Tool } from '@/types/shapes';

type ToolButton = {
  tool: Exclude<Tool, 'none'>;
  label: string;
};

const BUTTONS: ToolButton[] = [
  { tool: 'select', label: '↖ Выделить' },
  { tool: 'point', label: 'Точка' },
  { tool: 'segment', label: 'Отрезок' },
  { tool: 'circle', label: 'Окружность' },
  { tool: 'arc', label: 'Дуга' },
  { tool: 'rect', label: 'Прямоугольник' },
  { tool: 'xline', label: 'Прямая' },
  { tool: 'dimension', label: 'Размер' },
  { tool: 'intersect', label: 'Пересечение' },
  { tool: 'divide', label: 'Разделить' },
];

type Props = {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
};

/**
 * Нижняя панель инструментов. Повторное нажатие на активный инструмент снимает выбор.
 * Кнопок больше, чем помещается на узком экране, поэтому панель прокручивается по горизонтали.
 */
export function Toolbar({ activeTool, onSelectTool, snapToGrid, onToggleSnapToGrid }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 },
        ]}>
        {/* Переключатель привязки к сетке — не инструмент, остаётся включённым при смене инструмента. */}
        <Pressable
          onPress={onToggleSnapToGrid}
          style={({ pressed }) => [
            styles.button,
            snapToGrid && styles.buttonActive,
            pressed && !snapToGrid && styles.buttonPressed,
          ]}>
          <Text style={[styles.buttonText, snapToGrid && styles.buttonTextActive]} numberOfLines={1}>
            ▦ Сетка
          </Text>
        </Pressable>
        {BUTTONS.map(({ tool, label }) => {
          const active = tool === activeTool;
          return (
            <Pressable
              key={tool}
              onPress={() => onSelectTool(active ? 'none' : tool)}
              style={({ pressed }) => [
                styles.button,
                active && styles.buttonActive,
                pressed && !active && styles.buttonPressed,
              ]}>
              <Text style={[styles.buttonText, active && styles.buttonTextActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      paddingTop: 8,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    content: {
      flexDirection: 'row',
      gap: 8,
    },
    button: {
      // Ширина — по надписи, но не уже minWidth: короткие кнопки («Дуга») удобно нажимать пальцем.
      minWidth: 72,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
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
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    buttonTextActive: {
      color: colors.onPrimary,
    },
  });
