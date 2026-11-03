import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Canvas, DashPathEffect, Path } from '@shopify/react-native-skia';

import {
  CAD_COLORS,
  DASH_INTERVALS_PX,
  LINE_STYLE_OPTIONS,
  WAVY_AMPLITUDE_MM,
  WAVY_PERIOD_MM,
} from '@/constants/lineStyles';
import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { LineStyle } from '@/types/shapes';
import { PX_PER_MM } from '@/utils/viewport';
import { makeWavyLinePath } from '@/utils/wavyPath';

const PANEL_WIDTH = 292;
const MAIN_BUTTON_WIDTH = 154;
const MAIN_BUTTON_HEIGHT = 46;
const PREVIEW_WIDTH = 202;
const PREVIEW_HEIGHT = 30;
const MAIN_PREVIEW_WIDTH = 108;

type LineStylePickerProps = {
  visible: boolean;
  lineStyle: LineStyle;
  styleColors: Record<LineStyle, string | null>;
  onSelectStyle: (style: LineStyle) => void;
  onSelectColor: (style: LineStyle, color: string | null) => void;
};

type LinePreviewProps = {
  lineStyle: LineStyle;
  color: string;
  width: number;
};

function LinePreview({ lineStyle, color, width }: LinePreviewProps) {
  const intervals = DASH_INTERVALS_PX[lineStyle];
  const isThick = lineStyle === 'solid_thick' || lineStyle === 'dash_dot_thick';
  const path = useMemo(
    () =>
      lineStyle === 'wavy'
        ? makeWavyLinePath(
            { x: 2, y: PREVIEW_HEIGHT / 2 },
            { x: width - 2, y: PREVIEW_HEIGHT / 2 },
            WAVY_AMPLITUDE_MM * PX_PER_MM,
            WAVY_PERIOD_MM * PX_PER_MM,
          )
        : `M 2 ${PREVIEW_HEIGHT / 2} L ${width - 2} ${PREVIEW_HEIGHT / 2}`,
    [lineStyle, width],
  );

  return (
    <Canvas style={{ width, height: PREVIEW_HEIGHT }} pointerEvents="none">
      <Path
        path={path}
        color={color}
        style="stroke"
        strokeWidth={isThick ? 3.4 : 1.8}
        strokeCap="round"
        strokeJoin="round"
      >
        {intervals ? <DashPathEffect intervals={intervals} /> : null}
      </Path>
    </Canvas>
  );
}

export default function LineStylePicker({
  visible,
  lineStyle,
  styleColors,
  onSelectStyle,
  onSelectColor,
}: LineStylePickerProps) {
  const { colors, colorScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [listOpen, setListOpen] = useState(false);
  const [paletteStyle, setPaletteStyle] = useState<LineStyle | null>(null);

  const automaticColor = colorScheme === 'dark' ? '#FFFFFF' : '#000000';
  const color = styleColors[lineStyle];
  const previewColor = color ?? automaticColor;
  const currentStyleLabel =
    LINE_STYLE_OPTIONS.find((option) => option.id === lineStyle)?.label ?? 'Текущий';
  const currentColorLabel =
    color === null
      ? `автоматический, ${colorScheme === 'dark' ? 'белый' : 'чёрный'}`
      : (CAD_COLORS.find((item) => item.value === color)?.label ?? color);

  if (!visible) return null;

  const closePanels = () => {
    setListOpen(false);
    setPaletteStyle(null);
  };

  const handleSelectStyle = (style: LineStyle) => {
    onSelectStyle(style);
    closePanels();
  };

  const handleSelectColor = (style: LineStyle, selectedColor: string | null) => {
    onSelectColor(style, selectedColor);
    closePanels();
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Стиль линии: ${currentStyleLabel}. Цвет: ${currentColorLabel}`}
        accessibilityHint="Открывает список стилей линии"
        accessibilityState={{ expanded: listOpen }}
        onPress={() => {
          setListOpen((open) => !open);
          setPaletteStyle(null);
        }}
        style={({ pressed }) => [
          styles.mainButton,
          listOpen && styles.mainButtonOpen,
          pressed && styles.pressed,
        ]}
      >
        <LinePreview lineStyle={lineStyle} color={previewColor} width={MAIN_PREVIEW_WIDTH} />
        <MaterialCommunityIcons
          name={listOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      {listOpen ? (
        <View style={styles.dropdown}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {LINE_STYLE_OPTIONS.map((option) => {
              const selected = option.id === lineStyle;
              const paletteOpen = paletteStyle === option.id;
              const optionColor = styleColors[option.id];

              return (
                <View
                  key={option.id}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={styles.optionRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Выбрать стиль линии: ${option.label}`}
                      accessibilityState={{ selected }}
                      onPress={() => handleSelectStyle(option.id)}
                      style={({ pressed }) => [
                        styles.styleButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <LinePreview
                        lineStyle={option.id}
                        color={optionColor ?? automaticColor}
                        width={PREVIEW_WIDTH}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Выбрать цвет для стиля: ${option.label}`}
                      accessibilityHint="Открывает палитру из семи цветов"
                      accessibilityState={{ expanded: paletteOpen }}
                      onPress={() => setPaletteStyle(paletteOpen ? null : option.id)}
                      style={({ pressed }) => [
                        styles.pencilButton,
                        paletteOpen && styles.pencilButtonActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="pencil-outline"
                        size={22}
                        color={paletteOpen ? colors.accentText : colors.textSecondary}
                      />
                    </Pressable>
                  </View>

                  {paletteOpen ? (
                    <View style={styles.palette}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Автоматический цвет: ${colorScheme === 'dark' ? 'белый' : 'чёрный'}`}
                        accessibilityState={{ selected: optionColor === null }}
                        onPress={() => handleSelectColor(option.id, null)}
                        style={({ pressed }) => [
                          styles.colorButton,
                          optionColor === null && styles.colorButtonSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.colorSwatch,
                            styles.automaticSwatch,
                            { backgroundColor: automaticColor },
                          ]}
                        />
                      </Pressable>
                      {CAD_COLORS.map((cadColor) => (
                        <Pressable
                          key={cadColor.value}
                          accessibilityRole="button"
                          accessibilityLabel={`Цвет линии: ${cadColor.label}`}
                          accessibilityState={{ selected: optionColor === cadColor.value }}
                          onPress={() => handleSelectColor(option.id, cadColor.value)}
                          style={({ pressed }) => [
                            styles.colorButton,
                            optionColor === cadColor.value && styles.colorButtonSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View
                            style={[styles.colorSwatch, { backgroundColor: cadColor.value }]}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      position: 'absolute',
      top: 8,
      left: 12,
      width: PANEL_WIDTH,
      zIndex: 1000,
      elevation: 24,
    },
    mainButton: {
      width: MAIN_BUTTON_WIDTH,
      height: MAIN_BUTTON_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 4,
      elevation: 8,
    },
    mainButtonOpen: {
      borderColor: colors.accent,
    },
    dropdown: {
      position: 'absolute',
      top: MAIN_BUTTON_HEIGHT + 6,
      left: 0,
      width: PANEL_WIDTH,
      maxHeight: 420,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 12,
    },
    option: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    optionSelected: {
      backgroundColor: colors.accentSurface,
    },
    optionRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 8,
      paddingRight: 4,
    },
    styleButton: {
      flex: 1,
      minHeight: 42,
      alignItems: 'flex-start',
      justifyContent: 'center',
      borderRadius: 6,
    },
    pencilButton: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    pencilButtonActive: {
      backgroundColor: colors.accentSurfacePressed,
    },
    palette: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingTop: 2,
      paddingBottom: 10,
    },
    colorButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: 16,
    },
    colorButtonSelected: {
      borderColor: colors.accent,
    },
    colorSwatch: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    automaticSwatch: {
      borderColor: colors.inputBorder,
    },
    pressed: {
      backgroundColor: colors.surfacePressed,
      opacity: 0.85,
    },
  });
}
