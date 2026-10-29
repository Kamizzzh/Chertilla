import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';

// Цвет свечения — тот же синий, что у рамки выделения.
const GLOW_COLOR = '#1E88E5';
// Яркая линия по самому краю, px.
const BORDER_PX = 4;
// Размытие свечения и насколько далеко оно заходит внутрь экрана, px.
const GLOW_RADIUS_PX = 15;
const GLOW_SPREAD_PX = 6;
// Плавное исчезновение после того, как палец отпустили, мс. Появляется свечение сразу.
const FADE_OUT_MS = 150;

type Props = {
  /** true, пока тянут рамку выделения (значение пишет DrawingCanvas в UI-потоке). */
  active: SharedValue<boolean>;
};

/**
 * Синее свечение по краям холста, пока тянут рамку выделения.
 * Прозрачность меняется прямо в UI-потоке по shared value — React не перерисовывается.
 * Касания не перехватывает (pointerEvents="none").
 */
export function SelectionVignette({ active }: Props) {
  const style = useAnimatedStyle(() => ({
    opacity: active.get() ? 1 : withTiming(0, { duration: FADE_OUT_MS }),
  }));

  return <Animated.View pointerEvents="none" style={[styles.vignette, style]} />;
}

const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
    borderWidth: BORDER_PX,
    borderColor: GLOW_COLOR,
    // Свечение внутрь экрана от края: размытая внутренняя тень (работает на Android и iOS).
    boxShadow: `inset 0 0 ${GLOW_RADIUS_PX}px ${GLOW_SPREAD_PX}px rgba(30, 136, 229, 0.55)`,
    // Свечение вокруг линии края в стиле iOS (на Android эти свойства не действуют).
    shadowColor: GLOW_COLOR,
    shadowRadius: GLOW_RADIUS_PX,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },
});
