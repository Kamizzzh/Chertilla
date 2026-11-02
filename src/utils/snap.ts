// Объектная привязка: поиск точки на существующих фигурах рядом с пальцем.
//
// Все расчёты — в мм чертежа. Функции помечены 'worklet', потому что
// вызываются прямо из жеста в UI-потоке при каждом движении пальца.

import type { Shape } from '@/types/shapes';
import {
  arcEndpoints,
  arcMidAngle,
  dimensionBox,
  nearestOnArc,
  pointAtAngle,
  rectCorners,
} from '@/utils/geometry';
import { roundMm, type Point } from '@/utils/viewport';

/**
 * Вид привязки:
 * 'point' — отдельная точка, 'endpoint' — конец отрезка или дуги, угол прямоугольника,
 * 'midpoint' — середина отрезка, стороны прямоугольника или дуги,
 * 'center' — центр окружности или дуги, 'quadrant' — крайняя точка окружности (0°, 90°, 180°, 270°),
 * 'anchor' — опорная точка прямой, 'intersection' — пересечение отрезков / сторон прямоугольников / окружностей,
 * 'nearest' — ближайшая точка на линии или окружности.
 */
export type SnapKind =
  | 'point'
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'quadrant'
  | 'anchor'
  | 'intersection'
  | 'nearest';

export type SnapResult = {
  p: Point; // точка привязки, мм
  kind: SnapKind;
  shapeId: string; // фигура, к которой привязались (её подсвечиваем)
};

/** Габаритный прямоугольник фигуры в мм. У бесконечной прямой все границы бесконечны. */
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

// Компенсирует округление границ до 0.001 мм, чтобы префильтр не отрезал пограничные привязки.
const BBOX_EPSILON_MM = 1e-3;

/** Консервативный габарит фигуры: включает и геометрию, и все её характерные точки. */
export function getShapeBBox(shape: Shape): BBox {
  'worklet';
  if (shape.type === 'xline') {
    return { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
  }

  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;
  if (shape.type === 'point') {
    minX = shape.p.x;
    maxX = shape.p.x;
    minY = shape.p.y;
    maxY = shape.p.y;
  } else if (shape.type === 'segment') {
    minX = Math.min(shape.start.x, shape.end.x);
    maxX = Math.max(shape.start.x, shape.end.x);
    minY = Math.min(shape.start.y, shape.end.y);
    maxY = Math.max(shape.start.y, shape.end.y);
  } else if (shape.type === 'circle' || shape.type === 'arc') {
    // Для дуги берём габарит всей окружности: центр тоже является точкой привязки.
    minX = shape.center.x - shape.radius;
    maxX = shape.center.x + shape.radius;
    minY = shape.center.y - shape.radius;
    maxY = shape.center.y + shape.radius;
  } else if (shape.type === 'rect') {
    minX = Math.min(shape.p1.x, shape.p2.x);
    maxX = Math.max(shape.p1.x, shape.p2.x);
    minY = Math.min(shape.p1.y, shape.p2.y);
    maxY = Math.max(shape.p1.y, shape.p2.y);
  } else {
    const box = dimensionBox(shape);
    minX = box.x0;
    maxX = box.x1;
    minY = box.y0;
    maxY = box.y1;
  }
  return {
    minX: roundMm(minX),
    minY: roundMm(minY),
    maxX: roundMm(maxX),
    maxY: roundMm(maxY),
  };
}

/** Пересекается ли габарит, расширенный на 0.001 мм, с кругом радиуса radius. */
export function bboxOverlapsCircle(bbox: BBox, point: Point, radius: number): boolean {
  'worklet';
  const closestX = Math.max(
    bbox.minX - BBOX_EPSILON_MM,
    Math.min(bbox.maxX + BBOX_EPSILON_MM, point.x),
  );
  const closestY = Math.max(
    bbox.minY - BBOX_EPSILON_MM,
    Math.min(bbox.maxY + BBOX_EPSILON_MM, point.y),
  );
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function dist(a: Point, b: Point): number {
  'worklet';
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ближайшая к p точка отрезка ab. */
function projectOnSegment(p: Point, a: Point, b: Point): Point {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  // t — положение проекции вдоль отрезка: 0 — начало, 1 — конец. За края не выходим.
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Ближайшая к p точка бесконечной прямой через a под углом angleDeg. */
function projectOnLine(p: Point, a: Point, angleDeg: number): Point {
  'worklet';
  const rad = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const t = (p.x - a.x) * ux + (p.y - a.y) * uy;
  return { x: a.x + ux * t, y: a.y + uy * t };
}

/** Ближайшая к p точка окружности. null, если p ровно в центре (направление не определено). */
function projectOnCircle(p: Point, c: Point, r: number): Point | null {
  'worklet';
  const d = dist(p, c);
  if (d === 0) return null;
  return { x: c.x + ((p.x - c.x) / d) * r, y: c.y + ((p.y - c.y) / d) * r };
}

/** Пересечение отрезков ab и cd (параметры t и u — от 0 до 1). null — параллельны или не пересекаются. */
function intersectSegments(a: Point, b: Point, c: Point, d: Point): Point | null {
  'worklet';
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

/** Пересечения отрезка ab с окружностью (центр c, радиус r): 0–2 точки. */
function intersectSegmentCircle(a: Point, b: Point, c: Point, r: number): Point[] {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  // Подстановка отрезка в уравнение окружности: A·t² + B·t + C = 0.
  const qa = dx * dx + dy * dy;
  if (qa === 0) return [];
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - r * r;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const result: Point[] = [];
  const ts = disc === 0 ? [-qb / (2 * qa)] : [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)];
  for (const t of ts) {
    if (t >= 0 && t <= 1) result.push({ x: a.x + t * dx, y: a.y + t * dy });
  }
  return result;
}

/** Пересечения двух окружностей: 0–2 точки. */
function intersectCircles(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  'worklet';
  const d = dist(c1, c2);
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
  // a — расстояние от c1 до линии, на которой лежат обе точки; h — половина хорды (Пифагор).
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / d;
  const uy = (c2.y - c1.y) / d;
  const mx = c1.x + a * ux;
  const my = c1.y + a * uy;
  return [
    { x: mx - h * uy, y: my + h * ux },
    { x: mx + h * uy, y: my - h * ux },
  ];
}

type NearSeg = { a: Point; b: Point; id: string };
type NearCircle = { c: Point; r: number; id: string };

/**
 * Ищет точку привязки рядом с p (не дальше tolerance мм).
 * Сначала — характерные точки (точки, концы, середины, центры, опорные точки прямых):
 * они важнее, даже если линия чуть ближе. Если таких нет — ближайшая точка на самой линии.
 * Ничего не нашлось — null.
 */
export function findSnapPoint(shapes: Shape[], p: Point, tolerance: number): SnapResult | null {
  'worklet';
  let best: SnapResult | null = null;
  let bestDist = tolerance;

  const consider = (q: Point, kind: SnapKind, shapeId: string) => {
    const d = dist(p, q);
    if (d <= bestDist) {
      bestDist = d;
      best = { p: q, kind, shapeId };
    }
  };

  // Дешёвый префильтр: дорогую геометрию считаем только для фигур рядом с пальцем.
  // Размеры в привязке не участвуют, а бесконечные прямые нельзя отсекать габаритом.
  const candidates: Shape[] = [];
  for (const s of shapes) {
    if (s.type === 'dimension') continue;
    if (s.type === 'xline' || bboxOverlapsCircle(getShapeBBox(s), p, tolerance)) {
      candidates.push(s);
    }
  }

  // 1. Характерные точки.
  for (const s of candidates) {
    if (s.type === 'point') {
      consider(s.p, 'point', s.id);
    } else if (s.type === 'segment') {
      consider(s.start, 'endpoint', s.id);
      consider(s.end, 'endpoint', s.id);
      consider(
        { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2 },
        'midpoint',
        s.id,
      );
    } else if (s.type === 'circle') {
      const { x, y } = s.center;
      consider(s.center, 'center', s.id);
      consider({ x: x + s.radius, y }, 'quadrant', s.id);
      consider({ x: x - s.radius, y }, 'quadrant', s.id);
      consider({ x, y: y + s.radius }, 'quadrant', s.id);
      consider({ x, y: y - s.radius }, 'quadrant', s.id);
    } else if (s.type === 'xline') {
      consider(s.point, 'anchor', s.id);
    } else if (s.type === 'rect') {
      const c = rectCorners(s.p1, s.p2);
      for (let i = 0; i < 4; i++) {
        const a = c[i];
        const b = c[(i + 1) % 4];
        consider(a, 'endpoint', s.id);
        consider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint', s.id);
      }
    } else if (s.type === 'arc') {
      const [a, b] = arcEndpoints(s);
      consider(a, 'endpoint', s.id);
      consider(b, 'endpoint', s.id);
      consider(pointAtAngle(s.center, s.radius, arcMidAngle(s)), 'midpoint', s.id);
      consider(s.center, 'center', s.id);
    }
  }

  // 1б. Пересечения. Чтобы не перебирать все пары, берём только отрезки (в том числе стороны
  // прямоугольников) и окружности, проходящие рядом с p, и ищем пересечения между ними.
  const nearSegs: NearSeg[] = [];
  const nearCircles: NearCircle[] = [];
  const addSeg = (a: Point, b: Point, id: string) => {
    if (dist(p, projectOnSegment(p, a, b)) <= tolerance) nearSegs.push({ a, b, id });
  };
  for (const s of candidates) {
    if (s.type === 'segment') {
      addSeg(s.start, s.end, s.id);
    } else if (s.type === 'rect') {
      const c = rectCorners(s.p1, s.p2);
      for (let i = 0; i < 4; i++) addSeg(c[i], c[(i + 1) % 4], s.id);
    } else if (s.type === 'circle') {
      if (Math.abs(dist(p, s.center) - s.radius) <= tolerance) {
        nearCircles.push({ c: s.center, r: s.radius, id: s.id });
      }
    }
  }
  for (let i = 0; i < nearSegs.length; i++) {
    const s1 = nearSegs[i];
    for (let j = i + 1; j < nearSegs.length; j++) {
      const s2 = nearSegs[j];
      if (s1.id === s2.id) continue;
      const q = intersectSegments(s1.a, s1.b, s2.a, s2.b);
      if (q) consider(q, 'intersection', s1.id);
    }
    for (const c of nearCircles) {
      for (const q of intersectSegmentCircle(s1.a, s1.b, c.c, c.r)) consider(q, 'intersection', s1.id);
    }
  }
  for (let i = 0; i < nearCircles.length; i++) {
    for (let j = i + 1; j < nearCircles.length; j++) {
      const c1 = nearCircles[i];
      const c2 = nearCircles[j];
      for (const q of intersectCircles(c1.c, c1.r, c2.c, c2.r)) consider(q, 'intersection', c1.id);
    }
  }
  if (best) return best;

  // 2. Ближайшая точка на линии или окружности.
  for (const s of candidates) {
    if (s.type === 'segment') {
      consider(projectOnSegment(p, s.start, s.end), 'nearest', s.id);
    } else if (s.type === 'circle') {
      const q = projectOnCircle(p, s.center, s.radius);
      if (q) consider(q, 'nearest', s.id);
    } else if (s.type === 'xline') {
      consider(projectOnLine(p, s.point, s.angle), 'nearest', s.id);
    } else if (s.type === 'rect') {
      const c = rectCorners(s.p1, s.p2);
      for (let i = 0; i < 4; i++) {
        consider(projectOnSegment(p, c[i], c[(i + 1) % 4]), 'nearest', s.id);
      }
    } else if (s.type === 'arc') {
      consider(nearestOnArc(p, s), 'nearest', s.id);
    }
  }
  return best;
}
