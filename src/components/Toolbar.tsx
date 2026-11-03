import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_METHOD_IDS,
  isConstructionTool,
  SubMenu,
  type ConstructionTool,
  type SubMenuOption,
} from '@/components/SubMenu';
import {
  Tooltip,
  TooltipPressable,
  type TooltipAnchor,
  type TooltipContent,
  type TooltipPreviewKind,
} from '@/components/Tooltip';
import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { DimensionAxis, Tool } from '@/types/shapes';
import type { UcsAction } from '@/types/ucs';
import type { SharedNativeGesture } from '@/types/gestures';
import { WCS } from '@/utils/ucs';

type ActiveTool = Exclude<Tool, 'none'>;
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type CategoryId = 'construction' | 'analysis' | 'editing' | 'coordinates';

type ToolMenuItem = {
  kind: 'tool';
  id: string;
  tool: ActiveTool;
  label: string;
  icon: IconName;
};

type ActionMenuItem = {
  kind: 'action';
  id: 'copy' | 'delete';
  label: string;
  icon: IconName;
};

type UcsMenuItem = {
  kind: 'ucs';
  id: UcsAction;
  label: string;
  icon: IconName;
};

type MenuItem = ToolMenuItem | ActionMenuItem | UcsMenuItem;

type Category = {
  id: CategoryId;
  label: string;
  icon: IconName;
  items: MenuItem[];
};

// Только плоские контурные MaterialCommunityIcons: без изометрии, 3D-кубов и растровых картинок.
const CATEGORIES: Record<CategoryId, Category> = {
  construction: {
    id: 'construction',
    label: 'Построение',
    icon: 'pencil-ruler',
    items: [
      { kind: 'tool', id: 'point', tool: 'point', label: 'Точка', icon: 'vector-point' },
      { kind: 'tool', id: 'segment', tool: 'segment', label: 'Отрезок', icon: 'minus' },
      { kind: 'tool', id: 'circle', tool: 'circle', label: 'Окружность', icon: 'circle-outline' },
      { kind: 'tool', id: 'xline', tool: 'xline', label: 'Прямая', icon: 'vector-line' },
      { kind: 'tool', id: 'rect', tool: 'rect', label: 'Прямоугольник', icon: 'rectangle-outline' },
      { kind: 'tool', id: 'arc', tool: 'arc', label: 'Дуга', icon: 'vector-circle-variant' },
    ],
  },
  analysis: {
    id: 'analysis',
    label: 'Анализ',
    icon: 'ruler',
    items: [
      { kind: 'tool', id: 'dimension', tool: 'dimension', label: 'Размеры', icon: 'ruler' },
      {
        kind: 'tool',
        id: 'intersect',
        tool: 'intersect',
        label: 'Пересечение',
        icon: 'vector-intersection',
      },
      { kind: 'tool', id: 'divide', tool: 'divide', label: 'Разделить', icon: 'call-split' },
    ],
  },
  editing: {
    id: 'editing',
    label: 'Редактирование',
    icon: 'cursor-default-outline',
    items: [
      { kind: 'tool', id: 'select', tool: 'select', label: 'Выделить', icon: 'select' },
      { kind: 'action', id: 'copy', label: 'Копировать', icon: 'content-copy' },
      { kind: 'action', id: 'delete', label: 'Удалить', icon: 'delete-outline' },
    ],
  },
  coordinates: {
    id: 'coordinates',
    label: 'Системы координат',
    icon: 'axis-arrow',
    items: [
      { kind: 'ucs', id: 'wcs', label: 'Мировая СК (WCS)', icon: 'earth' },
      { kind: 'ucs', id: 'create', label: 'Создать СК', icon: 'plus' },
      { kind: 'ucs', id: 'delete', label: 'Удалить СК', icon: 'delete-outline' },
      { kind: 'ucs', id: 'list', label: 'Список СК', icon: 'format-list-bulleted' },
    ],
  },
};

const ITEM_TOOLTIPS: Record<string, { description: string; preview: TooltipPreviewKind }> = {
  'tool:point': {
    description: 'Открывает способы размещения точек на чертеже.',
    preview: 'point',
  },
  'tool:segment': {
    description: 'Открывает способы построения отрезков.',
    preview: 'line',
  },
  'tool:circle': {
    description: 'Открывает способы построения окружностей.',
    preview: 'circle',
  },
  'tool:xline': {
    description: 'Строит бесконечную разметочную прямую выбранным способом.',
    preview: 'line',
  },
  'tool:rect': {
    description: 'Открывает способы построения прямоугольников.',
    preview: 'rect',
  },
  'tool:arc': {
    description: 'Открывает способы построения дуг.',
    preview: 'arc',
  },
  'tool:dimension': {
    description: 'Открывает выбор вида размера и способа измерения.',
    preview: 'dimension',
  },
  'tool:intersect': {
    description: 'Создаёт точку в пересечении двух выбранных фигур.',
    preview: 'intersect',
  },
  'tool:divide': {
    description: 'Делит отрезок, окружность или дугу на равные части.',
    preview: 'divide',
  },
  'tool:select': {
    description: 'Выделяет фигуры тапом или рамкой для редактирования.',
    preview: 'select',
  },
  'action:copy': {
    description: 'Копирует единственную выделенную фигуру со сдвигом 10 мм.',
    preview: 'action',
  },
  'action:delete': {
    description: 'Удаляет выделенные фигуры одним действием истории.',
    preview: 'action',
  },
  'ucs:wcs': {
    description: 'Возвращает мировую систему координат чертежа.',
    preview: 'coordinates',
  },
  'ucs:create': {
    description: 'Начинает создание пользовательской системы координат.',
    preview: 'coordinates',
  },
  'ucs:delete': {
    description: 'Удаляет активную пользовательскую систему координат.',
    preview: 'action',
  },
  'ucs:list': {
    description: 'Открывает список сохранённых систем координат проекта.',
    preview: 'coordinates',
  },
};

const CATEGORY_TOOLTIPS: Record<CategoryId, TooltipContent> = {
  construction: {
    title: 'Построение',
    description: 'Открывает инструменты создания геометрических фигур.',
    preview: 'line',
  },
  analysis: {
    title: 'Анализ',
    description: 'Открывает размеры, пересечения и деление фигур.',
    preview: 'dimension',
  },
  editing: {
    title: 'Редактирование',
    description: 'Открывает выделение, копирование и удаление фигур.',
    preview: 'select',
  },
  coordinates: {
    title: 'Системы координат',
    description: 'Открывает действия с мировой и пользовательскими СК.',
    preview: 'coordinates',
  },
};

function getMenuItemTooltip(item: MenuItem): TooltipContent {
  const content = ITEM_TOOLTIPS[`${item.kind}:${item.id}`];
  return { title: item.label, description: content.description, preview: content.preview };
}

const CATEGORY_ORDER: CategoryId[] = ['construction', 'analysis', 'editing', 'coordinates'];
const MENU_ANIMATION_MS = 180;
const CATEGORY_BUTTON_HEIGHT = 56;
const TOOLBAR_VERTICAL_PADDING = 8;
const TOOLBAR_HEIGHT = CATEGORY_BUTTON_HEIGHT + TOOLBAR_VERTICAL_PADDING * 2;
const SUBMENU_GAP = 8;

type Props = {
  nativeGesture: SharedNativeGesture;
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
  dimensionAxis: DimensionAxis;
  onSelectDimensionAxis: (axis: DimensionAxis) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  isOrthoEnabled: boolean;
  onToggleOrtho: () => void;
  /** Копировать можно ровно одну выделенную фигуру при активном инструменте «Выделить». */
  canCopy: boolean;
  onCopy: () => void;
  canDelete: boolean;
  onDelete: () => void;
  activeUcsId: string;
  ucsCreationActive: boolean;
  onUcsAction: (action: UcsAction) => void;
};

type TooltipCallbacks = {
  onShowTooltip: (content: TooltipContent, anchor: TooltipAnchor) => void;
  onHideTooltip: () => void;
};

type ToolSubmenuProps = Pick<
  Props,
  | 'activeTool'
  | 'onSelectTool'
  | 'canCopy'
  | 'onCopy'
  | 'canDelete'
  | 'onDelete'
  | 'activeUcsId'
  | 'ucsCreationActive'
  | 'onUcsAction'
> &
  TooltipCallbacks & {
    category: Category;
    visible: boolean;
    left: number;
    right: number;
    bottom: number;
    onClose: () => void;
    onOpenMethods: (tool: ConstructionTool) => void;
  };

/** Выпадающая панель остаётся смонтированной на время анимации закрытия. */
function ToolSubmenu({
  category,
  visible,
  left,
  right,
  bottom,
  activeTool,
  onSelectTool,
  canCopy,
  onCopy,
  canDelete,
  onDelete,
  activeUcsId,
  ucsCreationActive,
  onUcsAction,
  onClose,
  onOpenMethods,
  onShowTooltip,
  onHideTooltip,
}: ToolSubmenuProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: MENU_ANIMATION_MS });
  }, [progress, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 20 * (1 - progress.value) }],
  }));

  const pressItem = (item: MenuItem) => {
    if (item.kind === 'tool' && isConstructionTool(item.tool)) {
      onOpenMethods(item.tool);
      return;
    }
    if (item.kind === 'ucs') {
      onClose();
      onUcsAction(item.id);
      return;
    }
    if (item.kind === 'action') {
      onClose();
      if (item.id === 'copy') onCopy();
      else onDelete();
      return;
    }

    const active = item.tool === activeTool;
    onClose();
    onSelectTool(active ? 'none' : item.tool);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.submenu, { left, right, bottom }, animatedStyle]}>
      <View pointerEvents={visible ? 'auto' : 'none'} style={styles.submenuPanel}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.submenuContent}>
          {category.items.map((item) => {
            const active =
              (item.kind === 'tool' && item.tool === activeTool) ||
              (item.kind === 'ucs' &&
                ((item.id === 'wcs' && activeUcsId === WCS.id) ||
                  (item.id === 'create' && ucsCreationActive)));
            const disabled =
              (item.kind === 'action' && item.id === 'copy' && !canCopy) ||
              (item.kind === 'action' && item.id === 'delete' && !canDelete) ||
              (item.kind === 'ucs' && item.id === 'delete' && activeUcsId === WCS.id);
            const danger =
              (item.kind === 'action' && item.id === 'delete') ||
              (item.kind === 'ucs' && item.id === 'delete');
            const iconColor = active
              ? colors.accent
              : disabled
                ? colors.disabledText
                : danger
                  ? colors.danger
                  : colors.textSecondary;

            return (
              <TooltipPressable
                key={item.id}
                onPress={() => pressItem(item)}
                tooltip={getMenuItemTooltip(item)}
                onShowTooltip={onShowTooltip}
                onHideTooltip={onHideTooltip}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ disabled, selected: active }}
                style={({ pressed }) => [
                  styles.toolButton,
                  item.kind === 'ucs' && styles.ucsButton,
                  active && styles.toolButtonActive,
                  danger && !disabled && styles.deleteButton,
                  pressed && !active && !disabled && styles.buttonPressed,
                  disabled && styles.buttonDisabled,
                ]}>
                <MaterialCommunityIcons name={item.icon} size={24} color={iconColor} />
                <Text
                  style={[styles.toolButtonText, { color: iconColor }]}
                  numberOfLines={item.kind === 'ucs' ? 2 : 1}>
                  {item.label}
                </Text>
                {active && <View style={styles.toolActiveIndicator} />}
              </TooltipPressable>
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

/**
 * Нижняя CAD-панель: категории, способы построения и подсказки по удержанию.
 * Длинное нажатие никогда не активирует инструмент или действие.
 */
export function Toolbar({
  nativeGesture,
  activeTool,
  onSelectTool,
  dimensionAxis,
  onSelectDimensionAxis,
  snapToGrid,
  onToggleSnapToGrid,
  isOrthoEnabled,
  onToggleOrtho,
  canCopy,
  onCopy,
  canDelete,
  onDelete,
  activeUcsId,
  ucsCreationActive,
  onUcsAction,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const barRef = useRef<ViewInstance>(null);
  // Единственный идентификатор открытого меню: две категории одновременно показаться не могут.
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  // Последние панели нужны на 180 мс обратной анимации закрытия.
  const [displayedCategory, setDisplayedCategory] = useState<CategoryId>('construction');
  const [activeMethodTool, setActiveMethodTool] = useState<ConstructionTool | null>(null);
  const [displayedMethodTool, setDisplayedMethodTool] = useState<ConstructionTool>('point');
  const [selectedMethodIds, setSelectedMethodIds] =
    useState<Record<ConstructionTool, string>>(DEFAULT_METHOD_IDS);
  const [tooltip, setTooltip] = useState<{
    content: TooltipContent;
    anchor: TooltipAnchor;
  } | null>(null);

  const showTooltip = (content: TooltipContent, anchor: TooltipAnchor) => {
    barRef.current?.measureInWindow((barX, barY) => {
      setTooltip({
        content,
        anchor: { ...anchor, x: anchor.x - barX, y: anchor.y - barY },
      });
    });
  };
  const hideTooltip = () => setTooltip(null);

  const toggleCategory = (id: CategoryId) => {
    hideTooltip();
    setActiveMethodTool(null);
    setDisplayedCategory(id);
    setActiveCategory((current) => (current === id ? null : id));
  };

  const openMethods = (tool: ConstructionTool) => {
    hideTooltip();
    if (tool === 'dimension') {
      setSelectedMethodIds((current) => ({ ...current, dimension: dimensionAxis }));
    }
    setDisplayedMethodTool(tool);
    setActiveMethodTool(tool);
    setActiveCategory(null);
  };

  const selectMethod = (option: SubMenuOption) => {
    const tool = displayedMethodTool;
    setSelectedMethodIds((current) => ({ ...current, [tool]: option.id }));
    if (!option.implemented) return;

    if (tool === 'dimension' && option.axis) onSelectDimensionAxis(option.axis);
    onSelectTool(tool);
    setActiveMethodTool(null);
  };

  return (
    <View
      ref={barRef}
      style={[styles.bar, { paddingBottom: insets.bottom + TOOLBAR_VERTICAL_PADDING }]}>
      <ToolSubmenu
        category={CATEGORIES[displayedCategory]}
        visible={activeCategory !== null}
        left={insets.left + 12}
        right={insets.right + 12}
        bottom={TOOLBAR_HEIGHT + SUBMENU_GAP + insets.bottom}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
        canCopy={canCopy}
        onCopy={onCopy}
        canDelete={canDelete}
        onDelete={onDelete}
        activeUcsId={activeUcsId}
        ucsCreationActive={ucsCreationActive}
        onUcsAction={onUcsAction}
        onClose={() => setActiveCategory(null)}
        onOpenMethods={openMethods}
        onShowTooltip={showTooltip}
        onHideTooltip={hideTooltip}
      />

      <SubMenu
        nativeGesture={nativeGesture}
        tool={displayedMethodTool}
        visible={activeMethodTool !== null}
        selectedMethodId={selectedMethodIds[displayedMethodTool]}
        left={insets.left + 12}
        right={insets.right + 12}
        bottom={TOOLBAR_HEIGHT + SUBMENU_GAP + insets.bottom}
        onSelect={selectMethod}
        onClose={() => setActiveMethodTool(null)}
        onShowTooltip={showTooltip}
        onHideTooltip={hideTooltip}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingLeft: insets.left + 12, paddingRight: insets.right + 12 },
        ]}>
        {CATEGORY_ORDER.map((id) => {
          const category = CATEGORIES[id];
          const expanded = activeCategory === id;
          const containsActiveTool =
            category.items.some((item) => item.kind === 'tool' && item.tool === activeTool) ||
            (id === 'coordinates' && (activeUcsId !== WCS.id || ucsCreationActive));
          const color = expanded
            ? colors.accent
            : containsActiveTool
              ? colors.accentText
              : colors.textSecondary;

          return (
            <TooltipPressable
              key={id}
              onPress={() => toggleCategory(id)}
              tooltip={CATEGORY_TOOLTIPS[id]}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
              accessibilityRole="button"
              accessibilityLabel={`${category.label}, категория инструментов`}
              accessibilityState={{ expanded, selected: containsActiveTool }}
              style={({ pressed }) => [
                styles.categoryButton,
                containsActiveTool && styles.categoryContainsTool,
                expanded && styles.categoryExpanded,
                pressed && !expanded && styles.buttonPressed,
              ]}>
              <MaterialCommunityIcons name={category.icon} size={22} color={color} />
              <Text style={[styles.categoryButtonText, { color }]} numberOfLines={1}>
                {category.label}
              </Text>
              <MaterialCommunityIcons
                name={expanded ? 'chevron-down' : 'chevron-up'}
                size={16}
                color={color}
              />
              {expanded && <View style={styles.categoryIndicator} />}
            </TooltipPressable>
          );
        })}

        <View style={styles.separator} />

        {/* Орто-режим — глобальный переключатель, не прячется в подменю. */}
        <TooltipPressable
          onPress={onToggleOrtho}
          tooltip={{
            title: 'Орто-режим',
            description: 'Ограничивает вторую точку строгой горизонталью или вертикалью.',
            preview: 'toggle',
          }}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
          accessibilityRole="button"
          accessibilityLabel="Орто-режим"
          accessibilityState={{ selected: isOrthoEnabled }}
          style={({ pressed }) => [
            styles.globalButton,
            isOrthoEnabled && styles.buttonActive,
            pressed && !isOrthoEnabled && styles.buttonPressed,
          ]}>
          <MaterialCommunityIcons
            name="angle-acute"
            size={23}
            color={isOrthoEnabled ? colors.onPrimary : colors.textSecondary}
          />
          <Text
            style={[styles.globalButtonText, isOrthoEnabled && styles.buttonTextActive]}
            numberOfLines={1}>
            Орто
          </Text>
        </TooltipPressable>

        {/* Привязка к сетке тоже остаётся включённой при смене инструмента. */}
        <TooltipPressable
          onPress={onToggleSnapToGrid}
          tooltip={{
            title: 'Привязка к сетке',
            description: 'Привязывает ввод пальцем к узлам сетки с шагом 10 мм.',
            preview: 'toggle',
          }}
          onShowTooltip={showTooltip}
          onHideTooltip={hideTooltip}
          accessibilityRole="button"
          accessibilityLabel="Привязка к сетке"
          accessibilityState={{ selected: snapToGrid }}
          style={({ pressed }) => [
            styles.globalButton,
            snapToGrid && styles.buttonActive,
            pressed && !snapToGrid && styles.buttonPressed,
          ]}>
          <MaterialCommunityIcons
            name="grid"
            size={22}
            color={snapToGrid ? colors.onPrimary : colors.textSecondary}
          />
          <Text
            style={[styles.globalButtonText, snapToGrid && styles.buttonTextActive]}
            numberOfLines={1}>
            Сетка
          </Text>
        </TooltipPressable>
      </ScrollView>

      {tooltip && <Tooltip content={tooltip.content} anchor={tooltip.anchor} />}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      zIndex: 100,
      elevation: 10,
      paddingTop: TOOLBAR_VERTICAL_PADDING,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      overflow: 'visible',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    categoryButton: {
      height: CATEGORY_BUTTON_HEIGHT,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryContainsTool: {
      borderColor: colors.accent,
    },
    categoryExpanded: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accent,
    },
    categoryIndicator: {
      position: 'absolute',
      bottom: 3,
      left: 16,
      right: 16,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.accent,
    },
    categoryButtonText: {
      fontSize: 12,
      fontWeight: '700',
    },
    globalButton: {
      minWidth: 62,
      height: CATEGORY_BUTTON_HEIGHT,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    globalButtonText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    separator: {
      width: 1,
      height: 36,
      marginHorizontal: 2,
      backgroundColor: colors.border,
    },
    submenu: {
      position: 'absolute',
      zIndex: 1000,
      elevation: 20,
      overflow: 'visible',
      backgroundColor: 'transparent',
    },
    submenuPanel: {
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
      elevation: 8,
    },
    submenuContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toolButton: {
      width: 64,
      height: 64,
      flexShrink: 0,
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    ucsButton: {
      width: 88,
    },
    toolButtonActive: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accent,
    },
    toolActiveIndicator: {
      position: 'absolute',
      bottom: 3,
      left: 12,
      right: 12,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.accent,
    },
    toolButtonText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    buttonPressed: {
      backgroundColor: colors.surfaceSecondary,
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    buttonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    buttonTextActive: {
      color: colors.onPrimary,
    },
    deleteButton: {
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerSurface,
    },
  });
