import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Как часто обновлять цифры на экране, мс. Чаще не нужно — сам счётчик начнёт нагружать JS-поток. */
const REPORT_INTERVAL_MS = 1000;
const LIVE_FPS_REPORT_INTERVAL_MS = 500;

/** Память JS-движка, МБ. total — сколько движок занял у системы (если известно). */
type HeapInfo = { usedMb: number; totalMb: number | null };

// Источники данных о памяти, которых нет в стандартных типах.
// performance.memory есть в браузерах на Chrome, в Hermes (движок JS на телефоне) его обычно нет,
// зато у Hermes есть своя статистика HermesInternal.getInstrumentedStats().
type WebMemory = { usedJSHeapSize?: number; totalJSHeapSize?: number };
type HermesStats = { js_allocatedBytes?: number; js_heapSize?: number };
type PerfGlobals = {
  performance?: { memory?: WebMemory };
  HermesInternal?: { getInstrumentedStats?: () => HermesStats };
};

const BYTES_IN_MB = 1024 * 1024;

/** Читает занятую JS-память. null — движок такую информацию не даёт. */
function readHeap(): HeapInfo | null {
  const g = globalThis as unknown as PerfGlobals;

  const web = g.performance?.memory;
  if (web?.usedJSHeapSize !== undefined) {
    return {
      usedMb: web.usedJSHeapSize / BYTES_IN_MB,
      totalMb: web.totalJSHeapSize !== undefined ? web.totalJSHeapSize / BYTES_IN_MB : null,
    };
  }

  const hermes = g.HermesInternal?.getInstrumentedStats?.();
  if (hermes?.js_allocatedBytes !== undefined) {
    return {
      usedMb: hermes.js_allocatedBytes / BYTES_IN_MB,
      totalMb: hermes.js_heapSize !== undefined ? hermes.js_heapSize / BYTES_IN_MB : null,
    };
  }

  return null;
}

/** Цвет цифры FPS: зелёный — плавно, жёлтый — заметные рывки, красный — сильно лагает. */
function fpsColor(fps: number | null): string {
  if (fps === null) return '#B0BEC5';
  if (fps >= 55) return '#69F0AE';
  if (fps >= 30) return '#FFD740';
  return '#FF5252';
}

function formatFps(fps: number | null): string {
  return fps === null ? '…' : String(fps);
}

function formatHeap(heap: HeapInfo | null): string {
  if (!heap) return 'н/д';
  const used = heap.usedMb.toFixed(1);
  return heap.totalMb !== null ? `${used} / ${heap.totalMb.toFixed(1)} МБ` : `${used} МБ`;
}

type MonitorProps = {
  /** Положение панели (top/right). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Отладочная панель производительности.
 * - UI FPS — кадры UI-потока (там рисуется холст Skia и идут жесты). Считается в
 *   useFrameCallback прямо на UI-потоке, в JS отправляется только итог раз в секунду.
 * - JS FPS — кадры JS-потока (React, логика). Если он низкий, а UI высокий —
 *   тормозит не отрисовка, а код на JS.
 * - Память — занятая JS-куча (если движок её сообщает).
 * Панель не перехватывает касания: под ней можно чертить.
 * Пока панель не показана, она не смонтирована и ничего не считает.
 */
export function PerfMonitor({ style }: MonitorProps) {
  const [uiFps, setUiFps] = useState<number | null>(null);
  const [jsFps, setJsFps] = useState<number | null>(null);
  const [heap, setHeap] = useState<HeapInfo | null>(() => readHeap());

  // Счётчик кадров UI-потока за текущую секунду и время её начала (мс). -1 — ещё не начали.
  const uiFrames = useSharedValue(0);
  const uiWindowStart = useSharedValue(-1);

  useFrameCallback((frame) => {
    'worklet';
    const now = frame.timestamp;
    if (uiWindowStart.value < 0) {
      uiWindowStart.value = now;
      uiFrames.value = 0;
      return;
    }
    uiFrames.value += 1;
    const elapsed = now - uiWindowStart.value;
    if (elapsed >= REPORT_INTERVAL_MS) {
      scheduleOnRN(setUiFps, Math.round((uiFrames.value * 1000) / elapsed));
      uiFrames.value = 0;
      uiWindowStart.value = now;
    }
  });

  // Кадры JS-потока: requestAnimationFrame вызывается раз за кадр, если JS-поток успевает.
  // Раз в секунду заодно обновляем память.
  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let rafId = 0;

    const tick = () => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - windowStart;
      if (elapsed >= REPORT_INTERVAL_MS) {
        setJsFps(Math.round((frames * 1000) / elapsed));
        setHeap(readHeap());
        frames = 0;
        windowStart = now;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <View pointerEvents="none" style={[styles.panel, style]}>
      <Text style={styles.line}>
        <Text style={[styles.value, { color: fpsColor(uiFps) }]}>{formatFps(uiFps)}</Text> FPS UI
      </Text>
      <Text style={styles.line}>
        <Text style={[styles.value, { color: fpsColor(jsFps) }]}>{formatFps(jsFps)}</Text> FPS JS
      </Text>
      <Text style={styles.line}>Память: {formatHeap(heap)}</Text>
    </View>
  );
}

/** Небольшой оверлей реального UI FPS: кадры копятся на UI-потоке, React обновляется лишь 2 раза/с. */
export function RealTimeFpsOverlay({ style }: MonitorProps) {
  const [fps, setFps] = useState<number | null>(null);
  const frames = useSharedValue(0);
  const windowStart = useSharedValue(-1);

  useFrameCallback((frame) => {
    'worklet';
    const now = frame.timestamp;
    if (windowStart.value < 0) {
      windowStart.value = now;
      frames.value = 0;
      return;
    }
    frames.value += 1;
    const elapsed = now - windowStart.value;
    if (elapsed >= LIVE_FPS_REPORT_INTERVAL_MS) {
      scheduleOnRN(setFps, Math.round((frames.value * 1000) / elapsed));
      frames.value = 0;
      windowStart.value = now;
    }
  });

  return (
    <View pointerEvents="none" style={[styles.livePanel, style]}>
      <Animated.Text style={styles.liveText}>
        {fps === null ? '…' : fps} FPS
      </Animated.Text>
    </View>
  );
}

type ToggleProps = {
  /** Показана ли панель сейчас. */
  active: boolean;
  onPress: () => void;
  /** Долгое нажатие переключает оверлей реального FPS. */
  onLongPress?: () => void;
  /** Положение кнопки (top/right). */
  style?: StyleProp<ViewStyle>;
};

/** Размер круглой кнопки «DEV», пт. Меньше обычных плавающих кнопок, чтобы не мешать чертить. */
export const DEV_TOGGLE_SIZE = 34;

/** Короткий тап открывает DEV-тест, долгий — только переключает FPS без открытия окна. */
export function PerfToggle({ active, onPress, onLongPress, style }: ToggleProps) {
  const longPressRef = useRef(false);

  return (
    <Pressable
      onPressIn={() => {
        longPressRef.current = false;
      }}
      onPress={() => {
        if (longPressRef.current) {
          longPressRef.current = false;
          return;
        }
        onPress();
      }}
      onLongPress={() => {
        if (!onLongPress) return;
        longPressRef.current = true;
        onLongPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="DEV: тест производительности и оверлей FPS"
      accessibilityHint="Короткое нажатие открывает тест, долгое переключает реальный FPS"
      hitSlop={6}
      style={({ pressed }) => [
        styles.toggle,
        active && styles.toggleActive,
        pressed && styles.togglePressed,
        style,
      ]}>
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>DEV</Text>
    </Pressable>
  );
}

const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(38, 50, 56, 0.8)',
    gap: 2,
  },
  line: {
    fontSize: 12,
    fontFamily: MONO_FONT,
    color: '#ECEFF1',
  },
  value: {
    fontWeight: '700',
  },
  livePanel: {
    position: 'absolute',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(38, 50, 56, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(120, 144, 156, 0.7)',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    color: '#69F0AE',
    fontVariant: ['tabular-nums'],
  },
  toggle: {
    width: DEV_TOGGLE_SIZE,
    height: DEV_TOGGLE_SIZE,
    borderRadius: DEV_TOGGLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(236, 239, 241, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(120, 144, 156, 0.6)',
  },
  toggleActive: {
    backgroundColor: 'rgba(38, 50, 56, 0.8)',
    borderColor: 'rgba(38, 50, 56, 0.9)',
  },
  togglePressed: {
    opacity: 0.6,
  },
  toggleText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#546E7A',
  },
  toggleTextActive: {
    color: '#69F0AE',
  },
});
