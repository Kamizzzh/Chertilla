// Инструмент «Пересечение»: точки пересечения двух фигур и, если фигуры не пересекаются,
// «максимально близкие» точки.
//
// Все расчёты — в мм чертежа. Функции помечены 'worklet', порядок объявления:
// вызываемая функция выше вызывающей (см. CLAUDE.md).
//
// Любая фигура раскладывается на «примитивы»: отрезок / бесконечная прямая ('line')
// и окружность или её дуга ('circle'). Прямоугольник — 4 отрезка. Точки и размеры
// в пересечениях не участвуют.

import type { Shape } from '@/types/shapes';
import {
  angleInArc,
  angleTo,
  arcEndpoints,
  nearestOnArc,
  rectCorners,
} from '@/utils/geometry';
import type { Point } from '@/utils/viewport';

type ArcRange = { center: Point; radius: number; startAngle: number; endAngle: number };

type LinePrim = { type: 'line'; a: Point; b: Point; infinite: boolean };
type CirclePrim = { type: 'circle'; c: Point; r: number; arc: ArcRange | null };
type Prim = LinePrim | CirclePrim;

/** Один вариант точки для пользователя (кнопка в панели). marker — рисовать ли её на холсте. */
export type IntersectOption = { label: string; p: Point; marker: boolean };

/**
 * Результат: exact — фигуры действительно пересекаются (options — сами точки пересечения);
 * иначе options — ближайшие точки на 1-й и 2-й фигуре и середина между ними.
 */
export type IntersectionResult = { exact: boolean; options: IntersectOption[] };

// Точки ближе этого (мм) считаются одной (общий конец двух отрезков находят оба).
const SAME_POINT_MM = 1e-6;

function dist(a: Point, b: Point): number {
  'worklet';
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Примитивы фигуры. Пустой массив — фигура в пересечениях не участвует. */
function shapePrims(s: Shape): Prim[] {
  'worklet';
  if (s.type === 'segment') return [{ type: 'line', a: s.start, b: s.end, infinite: false }];
  if (s.type === 'rect') {
    const c = rectCorners(s.p1, s.p2, s.angle);
    const sides: Prim[] = [];
    for (let i = 0; i < 4; i++) {
      sides.push({ type: 'line', a: c[i], b: c[(i + 1) % 4], infinite: false });
    }
    return sides;
  }
  if (s.type === 'xline') {
    const rad = (s.angle * Math.PI) / 180;
    const b = { x: s.point.x + Math.cos(rad), y: s.point.y + Math.sin(rad) };
    return [{ type: 'line', a: s.point, b, infinite: true }];
  }
  if (s.type === 'circle') return [{ type: 'circle', c: s.center, r: s.radius, arc: null }];
  if (s.type === 'arc') {
    const arc = {
      center: s.center,
      radius: s.radius,
      startAngle: s.startAngle,
      endAngle: s.endAngle,
    };
    return [{ type: 'circle', c: s.center, r: s.radius, arc }];
  }
  return [];
}

/** Можно ли искать пересечения с этой фигурой (отрезок, окружность, дуга, прямоугольник, прямая). */
export function canIntersect(s: Shape): boolean {
  'worklet';
  return shapePrims(s).length > 0;
}

/** Лежит ли точка q окружности на дуге примитива (у полной окружности — всегда). */
function onArc(prim: CirclePrim, q: Point): boolean {
  'worklet';
  if (!prim.arc) return true;
  return angleInArc(angleTo(prim.c, q), prim.arc.startAngle, prim.arc.endAngle);
}

/** Ближайшая к p точка окружности или дуги. p в центре — точка справа (направление не определено). */
function nearestOnCirclePrim(prim: CirclePrim, p: Point): Point {
  'worklet';
  if (prim.arc) return nearestOnArc(p, prim.arc);
  const d = dist(p, prim.c);
  if (d === 0) return { x: prim.c.x + prim.r, y: prim.c.y };
  return { x: prim.c.x + ((p.x - prim.c.x) / d) * prim.r, y: prim.c.y + ((p.y - prim.c.y) / d) * prim.r };
}

/** Ближайшая к p точка линии (отрезок — не выходя за концы). Линия нулевой длины — её начало. */
function nearestOnLinePrim(prim: LinePrim, p: Point): Point {
  'worklet';
  const dx = prim.b.x - prim.a.x;
  const dy = prim.b.y - prim.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return prim.a;
  let t = ((p.x - prim.a.x) * dx + (p.y - prim.a.y) * dy) / len2;
  if (!prim.infinite) t = Math.min(1, Math.max(0, t));
  return { x: prim.a.x + dx * t, y: prim.a.y + dy * t };
}

/** Пересечение двух линий (отрезков или бесконечных прямых). Параллельные — пусто. */
function intersectLines(p: LinePrim, q: LinePrim): Point[] {
  'worklet';
  const rx = p.b.x - p.a.x;
  const ry = p.b.y - p.a.y;
  const sx = q.b.x - q.a.x;
  const sy = q.b.y - q.a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return [];
  const qx = q.a.x - p.a.x;
  const qy = q.a.y - p.a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (!p.infinite && (t < 0 || t > 1)) return [];
  if (!q.infinite && (u < 0 || u > 1)) return [];
  return [{ x: p.a.x + t * rx, y: p.a.y + t * ry }];
}

/** Пересечения линии с окружностью или дугой: 0–2 точки. */
function intersectLineCircle(l: LinePrim, c: CirclePrim): Point[] {
  'worklet';
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const fx = l.a.x - c.c.x;
  const fy = l.a.y - c.c.y;
  // Подстановка линии в уравнение окружности: A·t² + B·t + C = 0.
  const qa = dx * dx + dy * dy;
  if (qa === 0) return [];
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - c.r * c.r;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const ts = disc === 0 ? [-qb / (2 * qa)] : [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)];
  const result: Point[] = [];
  for (const t of ts) {
    if (!l.infinite && (t < 0 || t > 1)) continue;
    const q = { x: l.a.x + t * dx, y: l.a.y + t * dy };
    if (onArc(c, q)) result.push(q);
  }
  return result;
}

/** Пересечения двух окружностей / дуг: 0–2 точки. */
function intersectCircles(c1: CirclePrim, c2: CirclePrim): Point[] {
  'worklet';
  const d = dist(c1.c, c2.c);
  if (d === 0 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];
  // a — расстояние от c1 до линии, на которой лежат обе точки; h — половина хорды (Пифагор).
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const ux = (c2.c.x - c1.c.x) / d;
  const uy = (c2.c.y - c1.c.y) / d;
  const mx = c1.c.x + a * ux;
  const my = c1.c.y + a * uy;
  const result: Point[] = [];
  const candidates = h === 0
    ? [{ x: mx, y: my }]
    : [
        { x: mx - h * uy, y: my + h * ux },
        { x: mx + h * uy, y: my - h * ux },
      ];
  for (const q of candidates) {
    if (onArc(c1, q) && onArc(c2, q)) result.push(q);
  }
  return result;
}

function intersectPrims(p: Prim, q: Prim): Point[] {
  'worklet';
  if (p.type === 'line' && q.type === 'line') return intersectLines(p, q);
  if (p.type === 'line' && q.type === 'circle') return intersectLineCircle(p, q);
  if (p.type === 'circle' && q.type === 'line') return intersectLineCircle(q, p);
  if (p.type === 'circle' && q.type === 'circle') return intersectCircles(p, q);
  return [];
}

type Pair = { a: Point; b: Point };

/** Пара ближайших точек двух линий: концы конечных линий, спроецированные на другую линию. */
function closestLineLine(p: LinePrim, q: LinePrim): Pair[] {
  'worklet';
  const pairs: Pair[] = [];
  if (!p.infinite) {
    pairs.push({ a: p.a, b: nearestOnLinePrim(q, p.a) });
    pairs.push({ a: p.b, b: nearestOnLinePrim(q, p.b) });
  }
  if (!q.infinite) {
    pairs.push({ a: nearestOnLinePrim(p, q.a), b: q.a });
    pairs.push({ a: nearestOnLinePrim(p, q.b), b: q.b });
  }
  // Две бесконечные параллельные прямые: любая точка первой и её проекция на вторую.
  if (pairs.length === 0) pairs.push({ a: p.a, b: nearestOnLinePrim(q, p.a) });
  return pairs;
}

/**
 * Пары ближайших точек линии и окружности (дуги): проекция центра на линию и ближайшая к ней
 * точка окружности; а также концы отрезка (если он целиком внутри окружности, дальний конец
 * ближе к ней) и концы дуги.
 */
function closestLineCircle(l: LinePrim, c: CirclePrim): Pair[] {
  'worklet';
  const pairs: Pair[] = [];
  const onLine = nearestOnLinePrim(l, c.c);
  pairs.push({ a: onLine, b: nearestOnCirclePrim(c, onLine) });
  if (!l.infinite) {
    pairs.push({ a: l.a, b: nearestOnCirclePrim(c, l.a) });
    pairs.push({ a: l.b, b: nearestOnCirclePrim(c, l.b) });
  }
  if (c.arc) {
    const [e1, e2] = arcEndpoints(c.arc);
    pairs.push({ a: nearestOnLinePrim(l, e1), b: e1 });
    pairs.push({ a: nearestOnLinePrim(l, e2), b: e2 });
  }
  return pairs;
}

/** Пары ближайших точек двух окружностей (дуг): на линии центров. */
function closestCircleCircle(c1: CirclePrim, c2: CirclePrim): Pair[] {
  'worklet';
  const d = dist(c1.c, c2.c);
  // u — направление от центра 1 к центру 2 (центры совпали — любое).
  const ux = d === 0 ? 1 : (c2.c.x - c1.c.x) / d;
  const uy = d === 0 ? 0 : (c2.c.y - c1.c.y) / d;
  let a: Point;
  let b: Point;
  if (d >= Math.abs(c1.r - c2.r)) {
    // Снаружи друг друга: ближайшие стороны смотрят друг на друга.
    a = { x: c1.c.x + ux * c1.r, y: c1.c.y + uy * c1.r };
    b = { x: c2.c.x - ux * c2.r, y: c2.c.y - uy * c2.r };
  } else if (c1.r > c2.r) {
    // Вторая внутри первой: ближайшие точки — в сторону от центра 1 через центр 2.
    a = { x: c1.c.x + ux * c1.r, y: c1.c.y + uy * c1.r };
    b = { x: c2.c.x + ux * c2.r, y: c2.c.y + uy * c2.r };
  } else {
    // Первая внутри второй.
    a = { x: c1.c.x - ux * c1.r, y: c1.c.y - uy * c1.r };
    b = { x: c2.c.x - ux * c2.r, y: c2.c.y - uy * c2.r };
  }
  // Для дуг берём ближайшие точки самих дуг.
  return [{ a: nearestOnCirclePrim(c1, a), b: nearestOnCirclePrim(c2, b) }];
}

function closestPairs(p: Prim, q: Prim): Pair[] {
  'worklet';
  if (p.type === 'line' && q.type === 'line') return closestLineLine(p, q);
  if (p.type === 'line' && q.type === 'circle') return closestLineCircle(p, q);
  if (p.type === 'circle' && q.type === 'line') {
    return closestLineCircle(q, p).map((pair) => ({ a: pair.b, b: pair.a }));
  }
  if (p.type === 'circle' && q.type === 'circle') return closestCircleCircle(p, q);
  return [];
}

/** К какому «виду» относится фигура — для подписей кнопок. */
function isLineShape(s: Shape): boolean {
  'worklet';
  return s.type === 'segment' || s.type === 'rect' || s.type === 'xline';
}

/**
 * Пересечение двух фигур. null — одна из фигур не поддерживается.
 * Точки пересечения есть → exact (1 точка: «Точка»; 2: «Точка 1», «Точка 2», «Середина»;
 * больше (прямоугольник с окружностью) — «Точка 1…N»).
 * Нет → ближайшие точки: на 1-й фигуре, на 2-й и «Посередине».
 */
export function computeIntersection(s1: Shape, s2: Shape): IntersectionResult | null {
  'worklet';
  const prims1 = shapePrims(s1);
  const prims2 = shapePrims(s2);
  if (prims1.length === 0 || prims2.length === 0) return null;

  const points: Point[] = [];
  for (const p of prims1) {
    for (const q of prims2) {
      for (const r of intersectPrims(p, q)) {
        if (!points.some((e) => dist(e, r) <= SAME_POINT_MM)) points.push(r);
      }
    }
  }

  if (points.length === 1) {
    return { exact: true, options: [{ label: 'Точка', p: points[0], marker: true }] };
  }
  if (points.length > 1) {
    const options: IntersectOption[] = points.map((p, i) => ({
      label: `Точка ${i + 1}`,
      p,
      marker: true,
    }));
    if (points.length === 2) {
      options.push({
        label: 'Середина',
        p: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
        marker: false,
      });
    }
    return { exact: true, options };
  }

  // Пересечений нет: из всех пар примитивов берём ту, где точки ближе всего друг к другу.
  let best: Pair | null = null;
  let bestGap = Infinity;
  for (const p of prims1) {
    for (const q of prims2) {
      for (const pair of closestPairs(p, q)) {
        const gap = dist(pair.a, pair.b);
        if (gap < bestGap) {
          bestGap = gap;
          best = pair;
        }
      }
    }
  }
  if (!best) return null;

  const line1 = isLineShape(s1);
  const line2 = isLineShape(s2);
  let label1 = 'На 1-й';
  let label2 = 'На 2-й';
  if (line1 !== line2) {
    label1 = line1 ? 'На прямой' : 'На окружности';
    label2 = line2 ? 'На прямой' : 'На окружности';
  }
  return {
    exact: false,
    options: [
      { label: label1, p: best.a, marker: true },
      { label: label2, p: best.b, marker: true },
      {
        label: 'Посередине',
        p: { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 },
        marker: true,
      },
    ],
  };
}
