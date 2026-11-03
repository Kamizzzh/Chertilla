/* eslint-disable react-hooks/immutability -- SharedValue Reanimated штатно изменяются через .value. */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getBatteryLevelAsync } from 'expo-battery';
import * as Device from 'expo-device';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import type { Shape } from '@/types/shapes';
import { DEV_PERF_STAGES, generateDevShapes, randomizeDevShapeStyles } from '@/utils/devPerfTest';
import { MAX_SCALE, MIN_SCALE } from '@/utils/viewport';

export type DevPerfModalProps = {
  visible: boolean;
  shapes: Shape[];
  onApplyShapes: (shapes: Shape[]) => void;
  onResetView: () => void;
  onZoom: (scale: number, durationMs: number) => void;
  onPanMm: (dx: number, dy: number, durationMs: number) => void;
  onClose: () => void;
};

type DevPerfStage = (typeof DEV_PERF_STAGES)[number];

type StageResult = {
  stageId: string;
  label: string;
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  samples: number;
};

type TestSession = {
  id: number;
  originalShapes: Shape[];
  cancelled: boolean;
  restored: boolean;
  waiters: Set<() => void>;
};

type ActiveMeasurement = {
  id: number;
  sessionId: number;
};

const FPS_WINDOW_MS = 500;
const ZOOM_DURATION_MS = 550;
const PAN_DURATION_MS = 400;
const ANIMATION_BUFFER_MS = 100;
const STYLE_APPLY_DELAY_MS = 120;
const BETWEEN_STAGES_DELAY_MS = 300;
const MEASUREMENT_DRAIN_MS = 50;
const PAN_DISTANCE_MM = 200;

function timeStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function formatFps(value: number | null): string {
  return value === null ? 'н/д' : value.toFixed(1);
}

function summarizeSamples(stage: DevPerfStage, samples: number[]): StageResult {
  if (samples.length === 0) {
    return {
      stageId: stage.id,
      label: stage.label,
      count: stage.count,
      average: null,
      min: null,
      max: null,
      samples: 0,
    };
  }

  let sum = 0;
  let min = samples[0] ?? 0;
  let max = samples[0] ?? 0;
  for (const sample of samples) {
    sum += sample;
    min = Math.min(min, sample);
    max = Math.max(max, sample);
  }
  return {
    stageId: stage.id,
    label: stage.label,
    count: stage.count,
    average: sum / samples.length,
    min,
    max,
    samples: samples.length,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Не destructive DEV-стресс-тест: исходный массив фигур и вид восстанавливаются при любом выходе. */
export function DevPerfModal({
  visible,
  shapes,
  onApplyShapes,
  onResetView,
  onZoom,
  onPanMm,
  onClose,
}: DevPerfModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<StageResult[]>([]);
  const logScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const batteryRequestRef = useRef(0);

  const mountedRef = useRef(true);
  const visibleRef = useRef(visible);
  const runningRef = useRef(false);
  const sessionCounterRef = useRef(0);
  const sessionRef = useRef<TestSession | null>(null);
  const shapesRef = useRef(shapes);
  const callbacksRef = useRef({ onApplyShapes, onResetView, onZoom, onPanMm, onClose });

  useEffect(() => {
    shapesRef.current = shapes;
    callbacksRef.current = { onApplyShapes, onResetView, onZoom, onPanMm, onClose };
  });

  const measurementCounterRef = useRef(0);
  const activeMeasurementRef = useRef<ActiveMeasurement | null>(null);
  const measurementSamplesRef = useRef<Map<number, number[]>>(new Map());
  const fpsActive = useSharedValue(false);
  const fpsMeasurementId = useSharedValue(0);
  const fpsWindowStart = useSharedValue(-1);
  const fpsFrames = useSharedValue(0);

  const appendLog = useCallback((message: string) => {
    if (!mountedRef.current || !visibleRef.current) return;
    setLogs((current) => [...current, `${timeStamp()}  ${message}`]);
  }, []);

  const isSessionActive = useCallback((session: TestSession): boolean => {
    return visibleRef.current && sessionRef.current === session && !session.cancelled;
  }, []);

  // Ожидание отменяется сразу, а не после таймаута анимации: закрытое окно не продолжит сценарий.
  const waitForSession = useCallback(
    (session: TestSession, durationMs: number): Promise<boolean> => {
      if (!isSessionActive(session)) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (completed: boolean) => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimeout(timer);
          session.waiters.delete(cancel);
          resolve(completed && isSessionActive(session));
        };
        const cancel = () => finish(false);
        session.waiters.add(cancel);
        timer = setTimeout(() => finish(true), durationMs);
      });
    },
    [isSessionActive],
  );

  const stopFps = useCallback(() => {
    fpsActive.value = false;
    fpsWindowStart.value = -1;
    fpsFrames.value = 0;
    activeMeasurementRef.current = null;
  }, [fpsActive, fpsFrames, fpsWindowStart]);

  const restoreSession = useCallback(
    (session: TestSession, logMessage: string | null) => {
      if (session.restored) return;
      session.restored = true;
      session.cancelled = true;
      stopFps();
      for (const cancel of session.waiters) cancel();
      session.waiters.clear();

      callbacksRef.current.onApplyShapes(session.originalShapes);
      callbacksRef.current.onResetView();
      if (logMessage !== null) appendLog(logMessage);

      if (sessionRef.current === session) {
        sessionRef.current = null;
        runningRef.current = false;
        if (mountedRef.current) setRunning(false);
      }
    },
    [appendLog, stopFps],
  );

  const cancelCurrentSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    appendLog('Отмена теста пользователем.');
    restoreSession(session, 'Восстановление: исходные фигуры и вид восстановлены.');
  }, [appendLog, restoreSession]);

  const receiveFpsWindow = useCallback((measurementId: number, fps: number) => {
    const active = activeMeasurementRef.current;
    const session = sessionRef.current;
    if (
      !active ||
      active.id !== measurementId ||
      !session ||
      session.id !== active.sessionId ||
      session.cancelled ||
      !Number.isFinite(fps) ||
      fps < 0
    ) {
      return;
    }
    measurementSamplesRef.current.get(measurementId)?.push(fps);
  }, []);

  // Кадры не покидают UI-поток: в JS уходит только одно число примерно раз в 500 мс.
  useFrameCallback((frame) => {
    'worklet';
    if (!fpsActive.value) {
      fpsWindowStart.value = -1;
      fpsFrames.value = 0;
      return;
    }

    const now = frame.timestamp;
    if (fpsWindowStart.value < 0) {
      fpsWindowStart.value = now;
      fpsFrames.value = 0;
      return;
    }

    fpsFrames.value += 1;
    const elapsed = now - fpsWindowStart.value;
    if (elapsed >= FPS_WINDOW_MS) {
      const fps = (fpsFrames.value * 1000) / elapsed;
      scheduleOnRN(receiveFpsWindow, fpsMeasurementId.value, fps);
      fpsWindowStart.value = now;
      fpsFrames.value = 0;
    }
  }, visible);

  const runTest = useCallback(
    async (session: TestSession) => {
      try {
        appendLog(`Старт: сохранено исходных фигур — ${session.originalShapes.length}.`);
        if (!(await waitForSession(session, 50))) return;

        for (let stageIndex = 0; stageIndex < DEV_PERF_STAGES.length; stageIndex += 1) {
          if (!isSessionActive(session)) return;
          const stage = DEV_PERF_STAGES[stageIndex];
          appendLog(
            `Этап ${stageIndex + 1}/${DEV_PERF_STAGES.length} — ${stage.label}: генерация ${stage.count} фигур.`,
          );
          if (!(await waitForSession(session, 30))) return;

          const generated = generateDevShapes(stage.count);
          if (!isSessionActive(session)) return;
          callbacksRef.current.onApplyShapes(generated);
          appendLog(`${stage.label}: фигуры применены, начат замер UI FPS.`);

          const measurementId = measurementCounterRef.current + 1;
          measurementCounterRef.current = measurementId;
          measurementSamplesRef.current.set(measurementId, []);
          activeMeasurementRef.current = { id: measurementId, sessionId: session.id };
          fpsMeasurementId.value = measurementId;
          fpsWindowStart.value = -1;
          fpsFrames.value = 0;
          fpsActive.value = true;

          const runManipulations = async (series: number): Promise<boolean> => {
            const zooms = [
              { label: `MAX_SCALE (${MAX_SCALE})`, scale: MAX_SCALE },
              { label: `MIN_SCALE (${MIN_SCALE})`, scale: MIN_SCALE },
              { label: 'средний (1)', scale: 1 },
            ];
            for (const zoom of zooms) {
              if (!isSessionActive(session)) return false;
              appendLog(`${stage.label} · серия ${series}: зум → ${zoom.label}.`);
              callbacksRef.current.onZoom(zoom.scale, ZOOM_DURATION_MS);
              if (!(await waitForSession(session, ZOOM_DURATION_MS + ANIMATION_BUFFER_MS))) {
                return false;
              }
            }

            const pans = [
              { label: 'влево на 200 мм', dx: -PAN_DISTANCE_MM, dy: 0 },
              { label: 'вверх на 200 мм', dx: 0, dy: PAN_DISTANCE_MM },
              { label: 'вправо на 200 мм', dx: PAN_DISTANCE_MM, dy: 0 },
              { label: 'вниз на 200 мм', dx: 0, dy: -PAN_DISTANCE_MM },
            ];
            for (const pan of pans) {
              if (!isSessionActive(session)) return false;
              appendLog(`${stage.label} · серия ${series}: пан ${pan.label}.`);
              callbacksRef.current.onPanMm(pan.dx, pan.dy, PAN_DURATION_MS);
              if (!(await waitForSession(session, PAN_DURATION_MS + ANIMATION_BUFFER_MS))) {
                return false;
              }
            }
            return true;
          };

          if (!(await runManipulations(1))) return;
          const styled = randomizeDevShapeStyles(generated);
          if (!isSessionActive(session)) return;
          callbacksRef.current.onApplyShapes(styled);
          appendLog(`${stage.label}: всем фигурам назначены случайные lineStyle и CAD colors.`);
          if (!(await waitForSession(session, STYLE_APPLY_DELAY_MS))) return;
          if (!(await runManipulations(2))) return;

          // Сначала прекращаем новые окна, затем даже уже отправленному в RN окну даём дойти до JS.
          fpsActive.value = false;
          if (!(await waitForSession(session, MEASUREMENT_DRAIN_MS))) return;
          if (activeMeasurementRef.current?.id === measurementId) {
            activeMeasurementRef.current = null;
          }
          const samples = measurementSamplesRef.current.get(measurementId) ?? [];
          measurementSamplesRef.current.delete(measurementId);
          const result = summarizeSamples(stage, samples);
          setResults((current) => [...current, result]);
          if (result.samples === 0) {
            appendLog(`${stage.label}: итог FPS — н/д, samples: 0.`);
          } else {
            appendLog(
              `${stage.label}: итог FPS — среднее ${formatFps(result.average)}, мин ${formatFps(result.min)}, макс ${formatFps(result.max)}, samples: ${result.samples}.`,
            );
          }

          if (stageIndex < DEV_PERF_STAGES.length - 1) {
            appendLog(`${stage.label}: этап завершён, сброс вида перед следующим этапом.`);
            callbacksRef.current.onResetView();
            if (!(await waitForSession(session, BETWEEN_STAGES_DELAY_MS))) return;
          }
        }

        if (!isSessionActive(session)) return;
        appendLog('Все этапы стресс-теста завершены.');
        restoreSession(session, 'Восстановление: исходные фигуры и вид восстановлены.');
      } catch (error) {
        if (isSessionActive(session)) {
          appendLog(`Ошибка теста: ${errorText(error)}.`);
          restoreSession(session, 'Восстановление после ошибки: исходные фигуры и вид восстановлены.');
        }
      } finally {
        if (!session.restored) {
          restoreSession(session, 'Восстановление: исходные фигуры и вид восстановлены.');
        }
      }
    },
    [
      appendLog,
      fpsActive,
      fpsFrames,
      fpsMeasurementId,
      fpsWindowStart,
      isSessionActive,
      restoreSession,
      waitForSession,
    ],
  );

  const startTest = useCallback(() => {
    if (!visibleRef.current || runningRef.current || sessionRef.current !== null) return;
    const session: TestSession = {
      id: sessionCounterRef.current + 1,
      originalShapes: shapesRef.current.slice(),
      cancelled: false,
      restored: false,
      waiters: new Set(),
    };
    sessionCounterRef.current = session.id;
    sessionRef.current = session;
    runningRef.current = true;
    setRunning(true);
    setResults([]);
    setLogs([]);
    void runTest(session);
  }, [runTest]);

  const handleShow = useCallback(() => {
    setRunning(false);
    setLogs([]);
    setResults([]);
    setBatteryPercent(null);

    const requestId = batteryRequestRef.current + 1;
    batteryRequestRef.current = requestId;
    void getBatteryLevelAsync()
      .then((level) => {
        if (
          batteryRequestRef.current !== requestId ||
          !mountedRef.current ||
          !visibleRef.current
        ) {
          return;
        }
        setBatteryPercent(level >= 0 && level <= 1 ? Math.round(level * 100) : null);
      })
      .catch(() => {
        if (batteryRequestRef.current === requestId && mountedRef.current) {
          setBatteryPercent(null);
        }
      });
  }, []);

  const handleClose = useCallback(() => {
    batteryRequestRef.current += 1;
    const session = sessionRef.current;
    if (session) {
      appendLog('Закрытие окна: тест отменён.');
      restoreSession(session, 'Восстановление: исходные фигуры и вид восстановлены.');
    }
    visibleRef.current = false;
    callbacksRef.current.onClose();
  }, [appendLog, restoreSession]);

  useEffect(() => {
    visibleRef.current = visible;
    if (!visible) {
      batteryRequestRef.current += 1;
      const session = sessionRef.current;
      if (session) restoreSession(session, null);
    }
  }, [restoreSession, visible]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      visibleRef.current = false;
      const session = sessionRef.current;
      if (session) restoreSession(session, null);
    };
  }, [restoreSession]);

  const model = Device.modelName ?? 'н/д';
  const manufacturer = Device.manufacturer ?? 'н/д';
  const osName = Device.osName ?? Platform.OS;
  const osVersion = Device.osVersion ?? String(Platform.Version);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={handleShow}
      onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>DEV-стресс-тест</Text>
              <Text style={styles.subtitle}>UI FPS · окна примерно 500 мс</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть стресс-тест"
              hitSlop={8}
              onPress={handleClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
              <MaterialCommunityIcons name="close" size={25} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.deviceBlock}>
            <Text style={styles.deviceText}>Модель: {model}</Text>
            <Text style={styles.deviceText}>Производитель: {manufacturer}</Text>
            <Text style={styles.deviceText}>ОС: {osName} {osVersion}</Text>
            <Text style={styles.deviceText}>
              Заряд: {batteryPercent === null ? 'н/д' : `${batteryPercent}%`}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? 'Отменить стресс-тест' : 'Запустить стресс-тест'}
            onPress={running ? cancelCurrentSession : startTest}
            style={({ pressed }) => [
              styles.runButton,
              running ? styles.cancelButton : styles.startButton,
              pressed && (running ? styles.cancelButtonPressed : styles.startButtonPressed),
            ]}>
            <MaterialCommunityIcons
              name={running ? 'stop' : 'play'}
              size={20}
              color={running ? colors.dangerText : '#121212'}
            />
            <Text style={[styles.runButtonText, running && styles.cancelButtonText]}>
              {running ? 'Отменить тест' : 'Запустить тест'}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            Во время теста фигуры заменяются временными. После завершения, отмены или закрытия чертёж и вид вернутся.
          </Text>

          {results.length > 0 && (
            <View style={styles.resultsBlock}>
              <Text style={styles.sectionTitle}>Результаты этапов</Text>
              <ScrollView style={styles.resultsScroll} nestedScrollEnabled>
                {results.map((result) => (
                  <View key={result.stageId} style={styles.resultRow}>
                    <View style={styles.resultHeading}>
                      <Text style={styles.resultName}>{result.label}</Text>
                      <Text style={styles.resultCount}>{result.count} фигур</Text>
                    </View>
                    <Text style={styles.resultFps}>
                      FPS ср {formatFps(result.average)} · мин {formatFps(result.min)} · макс {formatFps(result.max)}
                    </Text>
                    <Text style={styles.resultSamples}>samples: {result.samples}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <Text style={styles.sectionTitle}>Подробный журнал</Text>
          <ScrollView
            ref={logScrollRef}
            style={styles.logScroll}
            contentContainerStyle={styles.logContent}
            nestedScrollEnabled
            onContentSizeChange={() => logScrollRef.current?.scrollToEnd({ animated: false })}>
            {logs.length === 0 ? (
              <Text style={styles.emptyLog}>Журнал появится после запуска теста.</Text>
            ) : (
              logs.map((line, index) => (
                <Text key={`${index}-${line}`} selectable style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      backgroundColor: colors.overlay,
    },
    card: {
      width: '100%',
      maxWidth: 600,
      height: '92%',
      maxHeight: 900,
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      marginTop: 3,
      fontSize: 12,
      color: colors.textSubtle,
    },
    closeButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSecondary,
    },
    closeButtonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    deviceBlock: {
      padding: 10,
      gap: 3,
      borderRadius: 8,
      backgroundColor: colors.surfaceSecondary,
      marginBottom: 10,
    },
    deviceText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    runButton: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 9,
      borderWidth: 1,
    },
    startButton: {
      backgroundColor: colors.debug,
      borderColor: colors.debug,
    },
    startButtonPressed: {
      backgroundColor: colors.debugPressed,
      borderColor: colors.debugPressed,
    },
    cancelButton: {
      backgroundColor: colors.dangerSurface,
      borderColor: colors.dangerBorder,
    },
    cancelButtonPressed: {
      backgroundColor: colors.dangerPressed,
    },
    runButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#121212',
    },
    cancelButtonText: {
      color: colors.dangerText,
    },
    hint: {
      marginTop: 8,
      marginBottom: 10,
      fontSize: 11,
      lineHeight: 16,
      color: colors.textMuted,
    },
    resultsBlock: {
      marginBottom: 10,
    },
    resultsScroll: {
      flexGrow: 0,
      maxHeight: 178,
    },
    resultRow: {
      padding: 9,
      marginBottom: 6,
      borderRadius: 8,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    resultHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    resultName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    resultCount: {
      fontSize: 11,
      color: colors.textMuted,
    },
    resultFps: {
      marginTop: 4,
      fontSize: 12,
      color: colors.accentText,
    },
    resultSamples: {
      marginTop: 2,
      fontSize: 11,
      color: colors.textSubtle,
    },
    sectionTitle: {
      marginBottom: 6,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    logScroll: {
      flex: 1,
      minHeight: 100,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.background,
    },
    logContent: {
      padding: 10,
      gap: 5,
    },
    emptyLog: {
      fontSize: 12,
      color: colors.textSubtle,
    },
    logLine: {
      fontSize: 11,
      lineHeight: 16,
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
      color: colors.textSecondary,
    },
  });
