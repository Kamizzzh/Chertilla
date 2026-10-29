// Поиск фигур для инструмента «Выделение»: под пальцем (тап) и в рамке (выделение области).
//
// Все расчёты — в мм чертежа.
// Функции помечены 'worklet': hitTest вызывается и из жеста рамки в UI-потоке
// (проверить, что палец лёг на пустое место). Из JS-потока они работают как обычные.

import type { Shape } from '@/types/shapes';
import {
  arcBox,
  dimensionBox,
  dimensionLayout,
  nearestOnArc,
  rectBox,
  rectCorners,
  type Box,
} from '@/utils/geometry';
import type { Point } from '@/utils/viewport';

/** Расстояние от точки p до отрезка ab, мм. */
function distToSegment(p: Point, a: Point, b: Point): number {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // t — положение проекции вдоль отрезка: 0 — начало, 1 — конец. За края не выходим.
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * Расстояние со знаком от точки p до бесконечной прямой через a под углом angleDeg, мм.
 * Знак показывает, с какой стороны прямой лежит точка.
 */
function signedDistToLine(p: Point, a: Point, angleDeg: number): number {
  'worklet';
  const rad = (angleDeg * Math.PI) / 180;
  // Векторное произведение (p − a) на единичное направление прямой.
  return (p.x - a.x) * Math.sin(rad) - (p.y - a.y) * Math.cos(rad);
}

/** Расстояние от точки p до линии фигуры, мм. */
function distanceToShape(s: Shape, p: Point): number {
  'worklet';
  if (s.type === 'point') return Math.hypot(p.x - s.p.x, p.y - s.p.y);
  if (s.type === 'segment') return distToSegment(p, s.start, s.end);
  if (s.type === 'circle') {
    // Окружность — это линия, а не круг: тап внутри далеко от линии её не выбирает.
    return Math.abs(Math.hypot(p.x - s.center.x, p.y - s.center.y) - s.radius);
  }
  if (s.type === 'rect') {
    // Прямоугольник — это 4 стороны: тап внутри далеко от сторон его не выбирает.
    const c = rectCorners(s.p1, s.p2);
    let best = Infinity;
    for (let i = 0; i < 4; i++) best = Math.min(best, distToSegment(p, c[i], c[(i + 1) % 4]));
    return best;
  }
  if (s.type === 'arc') {
    const q = nearestOnArc(p, s);
    return Math.hypot(p.x - q.x, p.y - q.y);
  }
  if (s.type === 'dimension') {
    // Выносные и размерная линия (стрелки и текст — рядом с ними).
    const layout = dimensionLayout(s);
    if (!layout) return Infinity;
    let best = Infinity;
    for (const [a, b] of layout.lines.slice(0, 3)) best = Math.min(best, distToSegment(p, a, b));
    return best;
  }
  return Math.abs(signedDistToLine(p, s.point, s.angle));
}

/**
 * Фигура, ближайшая к точке p (не дальше tolerance мм). Ничего рядом нет — null.
 * Если несколько фигур на одинаковом расстоянии (например, точка на конце отрезка),
 * выбирается нарисованная позже: она лежит сверху.
 */
export function hitTest(shapes: Shape[], p: Point, tolerance: number): Shape | null {
  'worklet';
  let best: Shape | null = null;
  let bestDist = tolerance;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const d = distanceToShape(shapes[i], p);
    if (d < bestDist || (best === null && d <= bestDist)) {
      bestDist = d;
      best = shapes[i];
    }
  }
  return best;
}

/** Пересекаются ли два прямоугольника (касание краями тоже считается). */
function rectsOverlap(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/**
 * Задевает ли фигура рамку r: пересекается ли её габаритный прямоугольник (Bounding Box) с рамкой.
 * У бесконечной прямой габарита нет (наклонная прямая «занимает» всю плоскость),
 * поэтому для неё проверяется, проходит ли сама прямая через рамку:
 * углы рамки лежат не все с одной стороны от прямой.
 */
function shapeTouchesRect(s: Shape, r: Box): boolean {
  if (s.type === 'point') {
    return s.p.x >= r.x0 && s.p.x <= r.x1 && s.p.y >= r.y0 && s.p.y <= r.y1;
  }
  if (s.type === 'segment') {
    const box = {
      x0: Math.min(s.start.x, s.end.x),
      y0: Math.min(s.start.y, s.end.y),
      x1: Math.max(s.start.x, s.end.x),
      y1: Math.max(s.start.y, s.end.y),
    };
    return rectsOverlap(box, r);
  }
  if (s.type === 'circle') {
    const { center, radius } = s;
    const box = {
      x0: center.x - radius,
      y0: center.y - radius,
      x1: center.x + radius,
      y1: center.y + radius,
    };
    return rectsOverlap(box, r);
  }
  if (s.type === 'rect') return rectsOverlap(rectBox(s.p1, s.p2), r);
  if (s.type === 'arc') return rectsOverlap(arcBox(s), r);
  if (s.type === 'dimension') return rectsOverlap(dimensionBox(s), r);
  const corners: Point[] = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  const d = corners.map((c) => signedDistToLine(c, s.point, s.angle));
  return Math.min(...d) <= 0 && Math.max(...d) >= 0;
}

/**
 * Фигуры, которые хотя бы частично попали в рамку с углами a и b (мм, в любом порядке).
 */
export function shapesInRect(shapes: Shape[], a: Point, b: Point): Shape[] {
  const r: Box = {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
  return shapes.filter((s) => shapeTouchesRect(s, r));
}
