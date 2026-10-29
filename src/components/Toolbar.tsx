import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const styles = StyleSheet.create({
  bar: {
    paddingTop: 8,
    backgroundColor: '#F5F5F5',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  buttonPressed: {
    backgroundColor: '#ECEFF1',
  },
  buttonActive: {
    backgroundColor: '#37474F',
    borderColor: '#37474F',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37474F',
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
});
