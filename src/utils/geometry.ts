// Геометрия дуг и прямоугольников: углы, габариты, дуга по трём точкам.
//
// Все расчёты — в мм чертежа (ось Y вверх), углы — в градусах от оси X против часовой.
// Функции помечены 'worklet': их вызывают и холст в UI-потоке (отрисовка, рукоятки, привязка),
// и экран в JS-потоке. Вызываемая функция объявлена ВЫШЕ вызывающей — иначе в UI-потоке
// она окажется undefined (см. CLAUDE.md).

import type { ArcShape, DimensionShape, Shape } from '@/types/shapes';
import { roundMm, type Point } from '@/utils/viewport';

/** Параметры дуги без id и типа: центр, радиус, начальный и конечный углы. */
export type ArcParams = Pick<ArcShape, 'center' | 'radius' | 'startAngle' | 'endAngle'>;

/** Прямоугольник чертежа, мм: x0 ≤ x1, y0 ≤ y1. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

// Три точки считаются лежащими на одной прямой, если синус угла между направлениями
// из первой точки на вторую и третью меньше этого числа.
const COLLINEAR_SIN = 1e-6;
// Дугу радиусом больше этого (1 км) не строим: три точки почти на одной прямой,
// а такие огромные координаты Skia рисует неточно.
const MAX_ARC_RADIUS_MM = 1e6;

/** Угол в диапазоне [0°, 360°). */
export function normalizeAngle(deg: number): number {
  'worklet';
  return ((deg % 360) + 360) % 360;
}

/** Угол, приведённый к [0°, 360°) и округлённый до 0.001° (360 превращается в 0). */
export function roundAngle(deg: number): number {
  'worklet';
  return roundMm(normalizeAngle(deg)) % 360;
}

/** Угол направления из точки from в точку to, градусы [0°, 360°). */
export function angleTo(from: Point, to: Point): number {
  'worklet';
  return normalizeAngle((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}

/**
 * Сколько градусов проходит дуга против часовой от start до end: (0°, 360°].
 * Совпадающие углы — полный круг (360°), такие дуги экран не создаёт.
 */
export function arcSweep(startAngle: number, endAngle: number): number {
  'worklet';
  const sweep = normalizeAngle(endAngle - startAngle);
  return sweep === 0 ? 360 : sweep;
}

/** Лежит ли направление angle на дуге от startAngle до endAngle (против часовой). */
export function angleInArc(angle: number, startAngle: number, endAngle: number): boolean {
  'worklet';
  return normalizeAngle(angle - startAngle) <= arcSweep(startAngle, endAngle);
}

/** Точка окружности (center, radius) под углом deg. */
export function pointAtAngle(center: Point, radius: number, deg: number): Point {
  'worklet';
  const rad = (deg * Math.PI) / 180;
  return { x: center.x + Math.cos(rad) * radius, y: center.y + Math.sin(rad) * radius };
}

/**
 * Равномерно делит отрезок, окружность или дугу на segments частей.
 * Отрезок и дуга получают N−1 внутренних точек, окружность — N точек без повтора начала.
 * Все координаты результата округлены до 0.001 мм. Неподдерживаемая фигура или N < 2 — [].
 */
export function divideShape(shape: Shape, segments: number): Point[] {
  'worklet';
  if (!Number.isInteger(segments) || segments < 2) return [];
  const points: Point[] = [];

  if (shape.type === 'segment') {
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      points.push({
        x: roundMm(shape.start.x + (shape.end.x - shape.start.x) * t),
        y: roundMm(shape.start.y + (shape.end.y - shape.start.y) * t),
      });
    }
    return points;
  }

  if (shape.type === 'circle') {
    const angleStep = 360 / segments;
    for (let i = 0; i < segments; i++) {
      const p = pointAtAngle(shape.center, shape.radius, angleStep * i);
      points.push({ x: roundMm(p.x), y: roundMm(p.y) });
    }
    return points;
  }

  if (shape.type === 'arc') {
    // arcSweep учитывает переход через 0° и направление дуги против часовой стрелки.
    const angleStep = arcSweep(shape.startAngle, shape.endAngle) / segments;
    for (let i = 1; i < segments; i++) {
      const p = pointAtAngle(shape.center, shape.radius, shape.startAngle + angleStep * i);
      points.push({ x: roundMm(p.x), y: roundMm(p.y) });
    }
  }
  return points;
}

/** Угол середины дуги. */
export function arcMidAngle(arc: ArcParams): number {
  'worklet';
  return normalizeAngle(arc.startAngle + arcSweep(arc.startAngle, arc.endAngle) / 2);
}

/** Начало и конец дуги, мм. */
export function arcEndpoints(arc: ArcParams): [Point, Point] {
  'worklet';
  return [
    pointAtAngle(arc.center, arc.radius, arc.startAngle),
    pointAtAngle(arc.center, arc.radius, arc.endAngle),
  ];
}

/**
 * Габаритный прямоугольник дуги: её концы плюс крайние точки окружности
 * (0°, 90°, 180°, 270°), если дуга через них проходит.
 */
export function arcBox(arc: ArcParams): Box {
  'worklet';
  const [a, b] = arcEndpoints(arc);
  let x0 = Math.min(a.x, b.x);
  let y0 = Math.min(a.y, b.y);
  let x1 = Math.max(a.x, b.x);
  let y1 = Math.max(a.y, b.y);
  const { center, radius } = arc;
  if (angleInArc(0, arc.startAngle, arc.endAngle)) x1 = center.x + radius;
  if (angleInArc(90, arc.startAngle, arc.endAngle)) y1 = center.y + radius;
  if (angleInArc(180, arc.startAngle, arc.endAngle)) x0 = center.x - radius;
  if (angleInArc(270, arc.startAngle, arc.endAngle)) y0 = center.y - radius;
  return { x0, y0, x1, y1 };
}

/**
 * Ближайшая к p точка дуги: проекция на окружность, если она попала на дугу,
 * иначе ближайший из концов. p ровно в центре — начало дуги.
 */
export function nearestOnArc(p: Point, arc: ArcParams): Point {
  'worklet';
  const d = Math.hypot(p.x - arc.center.x, p.y - arc.center.y);
  if (d > 0 && angleInArc(angleTo(arc.center, p), arc.startAngle, arc.endAngle)) {
    return {
      x: arc.center.x + ((p.x - arc.center.x) / d) * arc.radius,
      y: arc.center.y + ((p.y - arc.center.y) / d) * arc.radius,
    };
  }
  const [a, b] = arcEndpoints(arc);
  return Math.hypot(p.x - a.x, p.y - a.y) <= Math.hypot(p.x - b.x, p.y - b.y) ? a : b;
}

/**
 * Углы прямоугольника по порядку обхода: [p1, (p2.x; p1.y), p2, (p1.x; p2.y)].
 * Соседние в массиве углы соединены стороной, углы 0 и 2 (1 и 3) — противоположные.
 */
export function rectCorners(p1: Point, p2: Point): Point[] {
  'worklet';
  return [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }];
}

/** Габарит прямоугольника с противоположными углами p1 и p2. */
export function rectBox(p1: Point, p2: Point): Box {
  'worklet';
  return {
    x0: Math.min(p1.x, p2.x),
    y0: Math.min(p1.y, p2.y),
    x1: Math.max(p1.x, p2.x),
    y1: Math.max(p1.y, p2.y),
  };
}

/** Параметры размера без id и типа: измеряемые точки, смещение размерной линии и вид размера. */
export type DimensionParams = Pick<DimensionShape, 'p1' | 'p2' | 'offset' | 'axis'>;

// Оформление размера — в мм чертежа (масштабируется вместе с зумом, как в CAD).
export const DIM_TEXT_HEIGHT_MM = 3.5; // высота шрифта
export const DIM_ARROW_MM = 2.5; // длина стрелки
const DIM_ARROW_WIDTH_RATIO = 0.3; // полуширина стрелки / длина
const DIM_EXT_GAP_MM = 1; // зазор между точкой и началом выносной линии
const DIM_EXT_OVERSHOOT_MM = 2; // насколько выносная линия выходит за размерную
const DIM_TEXT_GAP_MM = 1; // зазор между размерной линией и текстом

/** Размерная линия, выносные линии и текст размера. */
export type DimensionLayout = {
  /** Отрезки [a, b]: выносные, размерная линия и стрелки (по две линии на стрелку). */
  lines: [Point, Point][];
  /** Текст: число в мм, середина основания (x, y), угол вдоль линии (-90°, 90°], высота. */
  text: { value: string; x: number; y: number; angle: number; height: number };
  /** Начало и конец размерной линии. */
  a: Point;
  b: Point;
};

/** Измеряемая длина, мм: 'aligned' — расстояние p1–p2, 'x' — |Δx|, 'y' — |Δy|. */
export function dimensionLength(d: DimensionParams): number {
  'worklet';
  if (d.axis === 'x') return Math.abs(d.p2.x - d.p1.x);
  if (d.axis === 'y') return Math.abs(d.p2.y - d.p1.y);
  return Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y);
}

/** Единичный вектор вдоль размерной линии (от a к b) или null, если измерять нечего. */
function dimensionAlong(d: DimensionParams): Point | null {
  'worklet';
  const len = dimensionLength(d);
  if (!(len > 0)) return null;
  if (d.axis === 'x') return { x: d.p2.x > d.p1.x ? 1 : -1, y: 0 };
  if (d.axis === 'y') return { x: 0, y: d.p2.y > d.p1.y ? 1 : -1 };
  return { x: (d.p2.x - d.p1.x) / len, y: (d.p2.y - d.p1.y) / len };
}

/**
 * Единичная нормаль, вдоль которой считается offset, или null, если измерять нечего.
 * 'aligned' — влево от направления p1 → p2; 'x' — вверх (размерная линия горизонтальна);
 * 'y' — влево (размерная линия вертикальна).
 */
export function dimensionNormal(d: DimensionParams): Point | null {
  'worklet';
  const u = dimensionAlong(d);
  if (!u) return null;
  if (d.axis === 'x') return { x: 0, y: 1 };
  if (d.axis === 'y') return { x: -1, y: 0 };
  return { x: -u.y, y: u.x };
}

/**
 * Концы размерной линии. Начало — p1, сдвинутая на offset вдоль нормали
 * (для 'x' и 'y' — проекция на линию, остальное достраивается измеряемой длиной).
 */
function dimensionLineEnds(d: DimensionParams): { a: Point; b: Point } | null {
  'worklet';
  const u = dimensionAlong(d);
  const n = dimensionNormal(d);
  if (!u || !n) return null;
  const len = dimensionLength(d);
  const a = { x: d.p1.x + n.x * d.offset, y: d.p1.y + n.y * d.offset };
  return { a, b: { x: a.x + u.x * len, y: a.y + u.y * len } };
}

/** Где рукоятка смещения размера: середина размерной линии. */
export function dimensionOffsetHandle(d: DimensionParams): Point {
  'worklet';
  const ends = dimensionLineEnds(d);
  if (!ends) return { x: (d.p1.x + d.p2.x) / 2, y: (d.p1.y + d.p2.y) / 2 };
  return { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 };
}

/** Габарит размера: измеряемые точки и концы размерной линии (текст не учитывается). */
export function dimensionBox(d: DimensionParams): Box {
  'worklet';
  const ends = dimensionLineEnds(d);
  const a = ends ? ends.a : d.p1;
  const b = ends ? ends.b : d.p2;
  return {
    x0: Math.min(d.p1.x, d.p2.x, a.x, b.x),
    y0: Math.min(d.p1.y, d.p2.y, a.y, b.y),
    x1: Math.max(d.p1.x, d.p2.x, a.x, b.x),
    y1: Math.max(d.p1.y, d.p2.y, a.y, b.y),
  };
}

/**
 * Из чего состоит размер: общий расчёт для холста и экспорта (SVG, DXF).
 * null — измерять нечего (p1 и p2 совпадают, а для 'x' / 'y' — на одной вертикали / горизонтали).
 */
export function dimensionLayout(d: DimensionParams): DimensionLayout | null {
  'worklet';
  const len = dimensionLength(d);
  const u = dimensionAlong(d);
  const n = dimensionNormal(d);
  const ends = dimensionLineEnds(d);
  if (!u || !n || !ends || !(len > 0)) return null;
  const { a, b } = ends;
  const lines: [Point, Point][] = [];

  // Выносные линии: от точки (с зазором) до размерной линии и чуть дальше.
  for (const [p, q] of [
    [d.p1, a],
    [d.p2, b],
  ]) {
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(dist > 0)) continue;
    const ex = (q.x - p.x) / dist;
    const ey = (q.y - p.y) / dist;
    const gap = Math.min(DIM_EXT_GAP_MM, dist / 2);
    lines.push([
      { x: p.x + ex * gap, y: p.y + ey * gap },
      { x: q.x + ex * DIM_EXT_OVERSHOOT_MM, y: q.y + ey * DIM_EXT_OVERSHOOT_MM },
    ]);
  }

  // Размерная линия и стрелки на её концах (острие — в a и b).
  lines.push([a, b]);
  const al = Math.min(DIM_ARROW_MM, len / 4);
  const aw = al * DIM_ARROW_WIDTH_RATIO;
  for (const [tip, dir] of [
    [a, 1],
    [b, -1],
  ] as const) {
    const bx0 = tip.x + u.x * al * dir;
    const by0 = tip.y + u.y * al * dir;
    lines.push([tip, { x: bx0 + n.x * aw, y: by0 + n.y * aw }]);
    lines.push([tip, { x: bx0 - n.x * aw, y: by0 - n.y * aw }]);
  }

  // Текст читается слева направо или снизу вверх и стоит над размерной линией
  // (для 'x' — строго горизонтально, для 'y' — строго вертикально).
  let angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  else if (angle <= -90) angle += 180;
  const rad = (angle * Math.PI) / 180;
  const lift = DIM_TEXT_GAP_MM;
  return {
    lines,
    text: {
      value: String(roundMm(len)),
      x: (a.x + b.x) / 2 - Math.sin(rad) * lift,
      y: (a.y + b.y) / 2 + Math.cos(rad) * lift,
      angle,
      height: DIM_TEXT_HEIGHT_MM,
    },
    a,
    b,
  };
}
/**
 * Дуга через три точки: p1 — начало, p2 — любая точка на дуге, p3 — конец.
 *
 * Центр — центр окружности, описанной вокруг треугольника p1-p2-p3 (точка, равноудалённая
 * от всех трёх), радиус — расстояние от центра до p1. Дуга хранится «против часовой»:
 * если от p1 к p3 против часовой она проходит через p2 — углы [p1, p3], иначе дуга идёт
 * от p3 к p1 (та же линия, просто описанная в обратную сторону).
 *
 * Центр и радиус округлены до 0.001 мм, углы — до 0.001°.
 * null — дугу не построить: точки совпадают или лежат на одной прямой.
 */
export function getArcFrom3Points(p1: Point, p2: Point, p3: Point): ArcParams | null {
  'worklet';
  // Векторы из p1 во вторую и третью точки.
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const cx = p3.x - p1.x;
  const cy = p3.y - p1.y;
  const lb = Math.hypot(bx, by);
  const lc = Math.hypot(cx, cy);
  if (lb === 0 || lc === 0 || (p2.x === p3.x && p2.y === p3.y)) return null;

  // d / 2 — векторное произведение b × c = |b|·|c|·sin(угла между ними).
  // Почти ноль — точки на одной прямой.
  const d = 2 * (bx * cy - by * cx);
  if (Math.abs(d) <= 2 * COLLINEAR_SIN * lb * lc) return null;

  // Центр описанной окружности относительно p1.
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (cy * b2 - by * c2) / d;
  const uy = (bx * c2 - cx * b2) / d;
  const center = { x: p1.x + ux, y: p1.y + uy };
  const radius = Math.hypot(ux, uy);
  if (!Number.isFinite(radius) || radius > MAX_ARC_RADIUS_MM) return null;

  const a1 = angleTo(center, p1);
  const a2 = angleTo(center, p2);
  const a3 = angleTo(center, p3);
  const throughMiddle = angleInArc(a2, a1, a3);
  const startAngle = roundAngle(throughMiddle ? a1 : a3);
  const endAngle = roundAngle(throughMiddle ? a3 : a1);
  const r = roundMm(radius);
  if (startAngle === endAngle || r <= 0) return null;

  return { center: { x: roundMm(center.x), y: roundMm(center.y) }, radius: r, startAngle, endAngle };
}
