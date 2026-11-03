import { Skia, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia';

import { WAVY_SAMPLES_PER_PERIOD } from '@/constants/lineStyles';
import type { Point } from '@/utils/viewport';

/** Добавляет настоящую синусоиду вдоль отрезка; амплитуда и период заданы в мм. */
export function addWavySegment(
  path: SkPathBuilder,
  a: Point,
  b: Point,
  amplitude: number,
  period: number,
) {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !(period > 0)) return;

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const steps = Math.max(1, Math.ceil((length / period) * WAVY_SAMPLES_PER_PERIOD));
  path.moveTo(a.x, a.y);
  for (let i = 1; i <= steps; i++) {
    const distance = (length * i) / steps;
    const wave = amplitude * Math.sin((2 * Math.PI * distance) / period);
    path.lineTo(a.x + ux * distance + nx * wave, a.y + uy * distance + ny * wave);
  }
}

/** Синусоида вдоль дуги: отклонение идёт по радиусу, фаза зависит от длины дуги. */
export function addWavyArc(
  path: SkPathBuilder,
  center: Point,
  radius: number,
  startAngle: number,
  sweepAngle: number,
  amplitude: number,
  period: number,
  closed: boolean,
) {
  'worklet';
  const sweepRad = (sweepAngle * Math.PI) / 180;
  const length = Math.abs(radius * sweepRad);
  if (!(length > 0) || !(period > 0)) return;

  // У полной окружности период чуть подгоняется под целое число волн, чтобы не было шва.
  const waveCount = closed ? Math.max(1, Math.round(length / period)) : 0;
  const actualPeriod = closed ? length / waveCount : period;
  const steps = closed
    ? waveCount * WAVY_SAMPLES_PER_PERIOD
    : Math.max(1, Math.ceil((length / period) * WAVY_SAMPLES_PER_PERIOD));

  for (let i = 0; i <= steps; i++) {
    const distance = (length * i) / steps;
    const angle = ((startAngle + (sweepAngle * i) / steps) * Math.PI) / 180;
    const wave = amplitude * Math.sin((2 * Math.PI * distance) / actualPeriod);
    const r = radius + wave;
    const x = center.x + Math.cos(angle) * r;
    const y = center.y + Math.sin(angle) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  if (closed) path.close();
}

/** Отдельный путь для предпросмотра стиля и для прямых линий на холсте. */
export function makeWavyLinePath(
  a: Point,
  b: Point,
  amplitude: number,
  period: number,
): SkPath {
  'worklet';
  const path = Skia.PathBuilder.Make();
  addWavySegment(path, a, b, amplitude, period);
  return path.build();
}
