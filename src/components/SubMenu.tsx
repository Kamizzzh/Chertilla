import { useEffect, useMemo, type ComponentProps } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  TooltipPressable,
  type TooltipAnchor,
  type TooltipContent,
  type TooltipPreviewKind,
} from '@/components/Tooltip';
import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { DimensionAxis, Tool } from '@/types/shapes';
import type { SharedNativeGesture } from '@/types/gestures';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type ConstructionTool = Extract<
  Tool,
  'point' | 'segment' | 'circle' | 'arc' | 'rect' | 'dimension'
>;

export type SubMenuOption = {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  preview: TooltipPreviewKind;
  implemented: boolean;
  axis?: DimensionAxis;
};

export const CONSTRUCTION_TOOL_TITLES: Record<ConstructionTool, string> = {
  point: 'Точка',
  segment: 'Отрезок',
  circle: 'Окружность',
  arc: 'Дуга',
  rect: 'Прямоугольник',
  dimension: 'Размеры',
};

export const DEFAULT_METHOD_IDS: Record<ConstructionTool, string> = {
  point: 'free',
  segment: 'twoPoints',
  circle: 'centerRadius',
  arc: 'threePoints',
  rect: 'twoPoints',
  dimension: 'aligned',
};

export const CONSTRUCTION_METHODS: Record<ConstructionTool, SubMenuOption[]> = {
  point: [
    {
      id: 'free',
      label: 'Свободная',
      description: 'Ставит точку в выбранном месте чертежа.',
      icon: 'circle-outline',
      preview: 'point',
      implemented: true,
    },
    {
      id: 'intersection',
      label: 'Пересечение',
      description: 'Способ для точки в пересечении объектов.',
      icon: 'vector-intersection',
      preview: 'intersect',
      implemented: false,
    },
    {
      id: 'center',
      label: 'Центр',
      description: 'Способ для точки в центре выбранного объекта.',
      icon: 'circle-outline',
      preview: 'point',
      implemented: false,
    },
    {
      id: 'onObject',
      label: 'На объекте',
      description: 'Способ для точки на линии или контуре объекта.',
      icon: 'vector-point',
      preview: 'point',
      implemented: false,
    },
  ],
  segment: [
    {
      id: 'twoPoints',
      label: 'По 2 точкам',
      description: 'Строит отрезок между начальной и конечной точками.',
      icon: 'minus',
      preview: 'line',
      implemented: true,
    },
    {
      id: 'horizontal',
      label: 'Горизонтальный',
      description: 'Способ для строго горизонтального отрезка.',
      icon: 'arrow-left-right',
      preview: 'line',
      implemented: false,
    },
    {
      id: 'vertical',
      label: 'Вертикальный',
      description: 'Способ для строго вертикального отрезка.',
      icon: 'arrow-up-down',
      preview: 'line',
      implemented: false,
    },
    {
      id: 'angle',
      label: 'Под углом',
      description: 'Способ для отрезка с заданным углом наклона.',
      icon: 'angle-acute',
      preview: 'line',
      implemented: false,
    },
    {
      id: 'tangent',
      label: 'Касательный',
      description: 'Способ для отрезка, касательного к объекту.',
      icon: 'vector-line',
      preview: 'line',
      implemented: false,
    },
    {
      id: 'parallel',
      label: 'Параллельный',
      description: 'Способ для отрезка, параллельного выбранной линии.',
      icon: 'content-copy',
      preview: 'line',
      implemented: false,
    },
  ],
  circle: [
    {
      id: 'centerRadius',
      label: 'Центр+Радиус',
      description: 'Строит окружность по центру и точке радиуса.',
      icon: 'circle-outline',
      preview: 'circle',
      implemented: true,
    },
    {
      id: 'twoPointsDiameter',
      label: '2 Точки (диаметр)',
      description: 'Способ для окружности по двум концам диаметра.',
      icon: 'circle-outline',
      preview: 'circle',
      implemented: false,
    },
    {
      id: 'threePoints',
      label: '3 Точки',
      description: 'Способ для окружности, проходящей через три точки.',
      icon: 'circle-outline',
      preview: 'circle',
      implemented: false,
    },
    {
      id: 'tangentThreeLines',
      label: 'Касательная к 3 линиям',
      description: 'Способ для окружности, касательной к трём линиям.',
      icon: 'vector-circle-variant',
      preview: 'circle',
      implemented: false,
    },
    {
      id: 'centerDiameter',
      label: 'Центр+Диаметр',
      description: 'Способ для окружности по центру и диаметру.',
      icon: 'circle-outline',
      preview: 'circle',
      implemented: false,
    },
  ],
  arc: [
    {
      id: 'threePoints',
      label: '3 Точки',
      description: 'Строит дугу через начало, точку на дуге и конец.',
      icon: 'vector-circle-variant',
      preview: 'arc',
      implemented: true,
    },
    {
      id: 'centerStartEnd',
      label: 'Центр+Начало+Конец',
      description: 'Способ для дуги по центру, началу и концу.',
      icon: 'vector-circle-variant',
      preview: 'arc',
      implemented: false,
    },
  ],
  rect: [
    {
      id: 'twoPoints',
      label: 'По 2 точкам',
      description: 'Строит прямоугольник по двум противоположным углам.',
      icon: 'rectangle-outline',
      preview: 'rect',
      implemented: true,
    },
    {
      id: 'threePointsRotated',
      label: 'По 3 точкам (с поворотом)',
      description: 'Способ для повёрнутого прямоугольника по трём точкам.',
      icon: 'rectangle-outline',
      preview: 'rect',
      implemented: false,
    },
  ],
  dimension: [
    {
      id: 'aligned',
      label: 'Линейный',
      description: 'Измеряет длину между двумя точками вдоль их направления.',
      icon: 'ruler',
      preview: 'dimension',
      implemented: true,
      axis: 'aligned',
    },
    {
      id: 'horizontal',
      label: 'Горизонтальный',
      description: 'Измеряет расстояние между точками по оси X.',
      icon: 'arrow-left-right',
      preview: 'dimension',
      implemented: true,
      axis: 'x',
    },
    {
      id: 'vertical',
      label: 'Вертикальный',
      description: 'Измеряет расстояние между точками по оси Y.',
      icon: 'arrow-up-down',
      preview: 'dimension',
      implemented: true,
      axis: 'y',
    },
    {
      id: 'angular',
      label: 'Угловой',
      description: 'Способ для размера угла между объектами.',
      icon: 'angle-acute',
      preview: 'dimension',
      implemented: false,
    },
    {
      id: 'radius',
      label: 'Радиус',
      description: 'Способ для размера радиуса окружности или дуги.',
      icon: 'circle-outline',
      preview: 'dimension',
      implemented: false,
    },
    {
      id: 'diameter',
      label: 'Диаметр',
      description: 'Способ для размера диаметра окружности.',
      icon: 'circle-outline',
      preview: 'dimension',
      implemented: false,
    },
  ],
};

export function isConstructionTool(tool: Tool): tool is ConstructionTool {
  return (
    tool === 'point' ||
    tool === 'segment' ||
    tool === 'circle' ||
    tool === 'arc' ||
    tool === 'rect' ||
    tool === 'dimension'
  );
}

type Props = {
  nativeGesture: SharedNativeGesture;
  tool: ConstructionTool;
  visible: boolean;
  selectedMethodId: string;
  left: number;
  right: number;
  bottom: number;
  onSelect: (option: SubMenuOption) => void;
  onClose: () => void;
  onShowTooltip: (content: TooltipContent, anchor: TooltipAnchor) => void;
  onHideTooltip: () => void;
};

/** Второй уровень нижней панели: способы построения выбранного инструмента. */
export function SubMenu({
  nativeGesture,
  tool,
  visible,
  selectedMethodId,
  left,
  right,
  bottom,
  onSelect,
  onClose,
  onShowTooltip,
  onHideTooltip,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = useSharedValue(0);
  const options = CONSTRUCTION_METHODS[tool];
  const selected = options.find((option) => option.id === selectedMethodId);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [progress, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 20 * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.container,
        { bottom, paddingLeft: left, paddingRight: right },
        animatedStyle,
      ]}>
      <View pointerEvents={visible ? 'auto' : 'none'} style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {CONSTRUCTION_TOOL_TITLES[tool]}: выберите способ
          </Text>
          <TooltipPressable
            onPress={onClose}
            tooltip={{
              title: 'Закрыть подменю',
              description: 'Закрывает список способов без выбора инструмента.',
              preview: 'action',
            }}
            onShowTooltip={onShowTooltip}
            onHideTooltip={onHideTooltip}
            accessibilityRole="button"
            accessibilityLabel="Закрыть подменю"
            style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}>
            <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
          </TooltipPressable>
        </View>

        <GestureDetector gesture={nativeGesture}>
          <FlatList
            data={options}
          horizontal
          scrollEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.optionsScroll}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          keyExtractor={(option) => option.id}
          extraData={selectedMethodId}
          onScrollBeginDrag={() => console.log('[SubMenu] scroll onStart')}
          onScroll={(event) => console.log('[SubMenu] scroll onUpdate', event.nativeEvent.contentOffset.x)}
          onScrollEndDrag={() => console.log('[SubMenu] scroll onEnd')}
          renderItem={({ item: option }) => {
            const active = option.id === selectedMethodId;
            return (
              <TooltipPressable
                onPress={() => onSelect(option)}
                tooltip={{
                  title: option.label,
                  description: option.description,
                  preview: option.preview,
                }}
                onShowTooltip={onShowTooltip}
                onHideTooltip={onHideTooltip}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.optionButton,
                  active && styles.optionButtonActive,
                  pressed && !active && styles.buttonPressed,
                ]}>
                <MaterialCommunityIcons
                  name={option.icon}
                  size={22}
                  color={active ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[styles.optionText, active && styles.optionTextActive]}
                  numberOfLines={2}>
                  {option.label}
                </Text>
                {!option.implemented && <Text style={styles.futureBadge}>Скоро</Text>}
              </TooltipPressable>
            );
          }}
          />
        </GestureDetector>

        {selected && !selected.implemented && (
          <Text style={styles.futureHint}>Этот способ пока только в интерфейсе.</Text>
        )}
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: 0,
      width: '100%',
      zIndex: 2000,
      elevation: 25,
      overflow: 'visible',
      backgroundColor: 'transparent',
    },
    panel: {
      width: '100%',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      elevation: 10,
    },
    header: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      flex: 1,
      paddingLeft: 4,
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionsScroll: {
      width: '100%',
      height: 76,
      flexGrow: 0,
      flexShrink: 1,
    },
    optionButton: {
      width: 116,
      height: 76,
      flexShrink: 0,
      marginRight: 8,
      paddingHorizontal: 6,
      paddingVertical: 5,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    optionButtonActive: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accent,
    },
    optionText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    optionTextActive: {
      color: colors.accentText,
    },
    futureBadge: {
      position: 'absolute',
      top: 3,
      right: 4,
      fontSize: 8,
      fontWeight: '700',
      color: colors.textMuted,
    },
    futureHint: {
      paddingTop: 7,
      paddingHorizontal: 4,
      fontSize: 11,
      color: colors.textMuted,
    },
    buttonPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
  });
