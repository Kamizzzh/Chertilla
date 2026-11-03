import { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type PressableInstance,
  type PressableProps,
} from 'react-native';
import { Canvas, Circle, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import {
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export const TOOLTIP_LONG_PRESS_MS = 500;
const TOOLTIP_MAX_WIDTH = 280;
const TOOLTIP_GAP = 8;
const PREVIEW_ANIMATION_MS = 1100;

export type TooltipPreviewKind =
  | 'point'
  | 'line'
  | 'circle'
  | 'rect'
  | 'arc'
  | 'dimension'
  | 'intersect'
  | 'divide'
  | 'select'
  | 'coordinates'
  | 'toggle'
  | 'action';

export type TooltipContent = {
  title: string;
  description: string;
  preview: TooltipPreviewKind;
};

export type TooltipAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TooltipPressableProps = Omit<
  PressableProps,
  'onPress' | 'onPressIn' | 'onPressOut' | 'onLongPress' | 'delayLongPress'
> & {
  tooltip: TooltipContent;
  onPress: () => void;
  onShowTooltip: (content: TooltipContent, anchor: TooltipAnchor) => void;
  onHideTooltip: () => void;
};

/**
 * Кнопка с раздельными жестами: короткий тап выполняет действие, а удержание
 * только показывает подсказку. Флаг подавления нужен потому, что Pressable
 * вызывает onPress после onPressOut даже у длинного нажатия.
 */
export function TooltipPressable({
  tooltip,
  onPress,
  onShowTooltip,
  onHideTooltip,
  ...props
}: TooltipPressableProps) {
  const targetRef = useRef<PressableInstance>(null);
  const pressedRef = useRef(false);
  const suppressPressRef = useRef(false);

  const handleLongPress = () => {
    if (!pressedRef.current) return;
    suppressPressRef.current = true;
    targetRef.current?.measureInWindow((x, y, width, height) => {
      if (!pressedRef.current || !suppressPressRef.current) return;
      onShowTooltip(tooltip, { x, y, width, height });
    });
  };

  return (
    <Pressable
      {...props}
      ref={targetRef}
      delayLongPress={TOOLTIP_LONG_PRESS_MS}
      onPressIn={() => {
        pressedRef.current = true;
        suppressPressRef.current = false;
      }}
      onLongPress={handleLongPress}
      onPressOut={() => {
        pressedRef.current = false;
        if (suppressPressRef.current) onHideTooltip();
      }}
      onPress={() => {
        if (suppressPressRef.current) {
          suppressPressRef.current = false;
          return;
        }
        onPress();
      }}
    />
  );
}

const LINE_PATH = Skia.PathBuilder.Make();
LINE_PATH.moveTo(18, 34);
LINE_PATH.lineTo(102, 34);

const CIRCLE_PATH = Skia.PathBuilder.Make();
CIRCLE_PATH.addCircle(60, 34, 24);

const RECT_PATH = Skia.PathBuilder.Make();
RECT_PATH.addRect(Skia.XYWHRect(32, 10, 56, 48));

const ARC_PATH = Skia.PathBuilder.Make();
ARC_PATH.addArc(Skia.XYWHRect(30, 8, 60, 60), 195, 260);

const SELECT_PATH = Skia.PathBuilder.Make();
SELECT_PATH.addRect(Skia.XYWHRect(26, 12, 68, 44));

const CHECK_PATH = Skia.PathBuilder.Make();
CHECK_PATH.moveTo(34, 34);
CHECK_PATH.lineTo(52, 50);
CHECK_PATH.lineTo(88, 18);

function TooltipPreview({ kind }: { kind: TooltipPreviewKind }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const pulseRadius = useDerivedValue(() => 3 + progress.value * 4);
  const toggleX = useDerivedValue(() => 36 + progress.value * 48);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: PREVIEW_ANIMATION_MS }), -1, true);
    return () => cancelAnimation(progress);
  }, [progress]);

  const stroke = {
    color: colors.accent,
    style: 'stroke' as const,
    strokeWidth: 3,
    strokeCap: 'round' as const,
    strokeJoin: 'round' as const,
  };

  return (
    <Canvas style={styles.previewCanvas}>
      {(kind === 'line' || kind === 'dimension') && (
        <>
          {kind === 'dimension' && (
            <>
              <Line p1={vec(24, 14)} p2={vec(24, 54)} color={colors.textMuted} strokeWidth={1} />
              <Line p1={vec(96, 14)} p2={vec(96, 54)} color={colors.textMuted} strokeWidth={1} />
            </>
          )}
          <Path path={LINE_PATH.build()} {...stroke} start={0} end={progress} />
          <Circle cx={18} cy={34} r={3} color={colors.accent} />
          <Circle cx={102} cy={34} r={3} color={colors.accent} />
        </>
      )}

      {kind === 'circle' && <Path path={CIRCLE_PATH.build()} {...stroke} start={0} end={progress} />}
      {kind === 'rect' && <Path path={RECT_PATH.build()} {...stroke} start={0} end={progress} />}
      {kind === 'arc' && <Path path={ARC_PATH.build()} {...stroke} start={0} end={progress} />}
      {kind === 'select' && (
        <Path path={SELECT_PATH.build()} {...stroke} start={0} end={progress} />
      )}
      {kind === 'action' && <Path path={CHECK_PATH.build()} {...stroke} start={0} end={progress} />}

      {kind === 'point' && (
        <>
          <Line p1={vec(60, 8)} p2={vec(60, 60)} color={colors.textMuted} strokeWidth={1} />
          <Line p1={vec(30, 34)} p2={vec(90, 34)} color={colors.textMuted} strokeWidth={1} />
          <Circle cx={60} cy={34} r={pulseRadius} color={colors.accent} />
        </>
      )}

      {kind === 'intersect' && (
        <>
          <Line p1={vec(25, 54)} p2={vec(95, 14)} color={colors.accent} strokeWidth={3} />
          <Line p1={vec(25, 14)} p2={vec(95, 54)} color={colors.accent} strokeWidth={3} />
          <Circle cx={60} cy={34} r={pulseRadius} color={colors.debug} />
        </>
      )}

      {kind === 'divide' && (
        <>
          <Line p1={vec(20, 34)} p2={vec(100, 34)} color={colors.accent} strokeWidth={3} />
          <Circle cx={40} cy={34} r={pulseRadius} color={colors.debug} />
          <Circle cx={60} cy={34} r={pulseRadius} color={colors.debug} />
          <Circle cx={80} cy={34} r={pulseRadius} color={colors.debug} />
        </>
      )}

      {kind === 'coordinates' && (
        <>
          <Line p1={vec(24, 52)} p2={vec(96, 52)} color={colors.accent} strokeWidth={3} />
          <Line p1={vec(24, 52)} p2={vec(24, 12)} color={colors.accent} strokeWidth={3} />
          <Circle cx={24} cy={52} r={pulseRadius} color={colors.debug} />
        </>
      )}

      {kind === 'toggle' && (
        <>
          <Line p1={vec(30, 34)} p2={vec(90, 34)} color={colors.textMuted} strokeWidth={8} />
          <Circle cx={toggleX} cy={34} r={10} color={colors.accent} />
        </>
      )}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  previewCanvas: {
    width: 120,
    height: 68,
    alignSelf: 'center',
  },
});

type TooltipProps = {
  content: TooltipContent;
  /** Координаты кнопки относительно нижней панели. */
  anchor: TooltipAnchor;
};

/** Немодальная подсказка: не перехватывает касание и исчезает при отпускании. */
export function Tooltip({ content, anchor }: TooltipProps) {
  const { colors } = useTheme();
  const themedStyles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(TOOLTIP_MAX_WIDTH, Math.max(0, windowWidth - 16));
  const center = anchor.x + anchor.width / 2;
  const left = Math.min(Math.max(8, center - width / 2), Math.max(8, windowWidth - width - 8));

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        themedStyles.tooltip,
        {
          width,
          left,
          top: anchor.y - TOOLTIP_GAP,
        },
      ]}>
      <TooltipPreview kind={content.preview} />
      <Text style={themedStyles.title}>{content.title}</Text>
      <Text style={themedStyles.description}>{content.description}</Text>
      <Text style={themedStyles.hint}>Отпустите палец, чтобы закрыть</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    tooltip: {
      position: 'absolute',
      zIndex: 4000,
      elevation: 40,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accent,
      shadowColor: colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -3 },
      transform: [{ translateY: '-100%' }],
    },
    title: {
      marginTop: 4,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    description: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    hint: {
      marginTop: 7,
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
