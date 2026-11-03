// Геометрия дуг и прямоугольников: углы, габариты, дуга по трём точкам.
//
// Все расчёты — в мм чертежа (ось Y вверх), углы — в градусах от оси X против часовой.
// Функции помечены 'worklet': их вызывают и холст в UI-потоке (отрисовка, рукоятки, привязка),
// и экран в JS-потоке. Вызываемая функция объявлена ВЫШЕ вызывающей — иначе в UI-потоке
// она окажется undefined (см. CLAUDE.md).

import type {
  ArcShape,
  CircleShape,
  DimensionShape,
  RectShape,
  SegmentShape,
  Shape,
} from '@/types/shapes';
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

/** Вектор (x, y), повёрнутый на deg против часовой. */
function rotateVector(x: number, y: number, deg: number): Point {
  'worklet';
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: c * x - s * y, y: s * x + c * y };
}

/**
 * Углы прямоугольника по порядку обхода. p1 и p2 — фактические противоположные углы,
 * angle — направление первой стороны. Без angle получается прежний прямоугольник вдоль осей.
 */
export function rectCorners(p1: Point, p2: Point, angle?: number): Point[] {
  'worklet';
  const rotation = angle ?? 0;
  const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const localDiagonal = rotateVector(p2.x - p1.x, p2.y - p1.y, -rotation);
  const hx = localDiagonal.x / 2;
  const hy = localDiagonal.y / 2;
  const local = [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ];
  return local.map((p) => {
    const rotated = rotateVector(p.x, p.y, rotation);
    return { x: center.x + rotated.x, y: center.y + rotated.y };
  });
}

/** Габарит прямоугольника, включая повёрнутый вариант. */
export function rectBox(p1: Point, p2: Point, angle?: number): Box {
  'worklet';
  const corners = rectCorners(p1, p2, angle);
  return {
    x0: Math.min(...corners.map((p) => p.x)),
    y0: Math.min(...corners.map((p) => p.y)),
    x1: Math.max(...corners.map((p) => p.x)),
    y1: Math.max(...corners.map((p) => p.y)),
  };
}

/** Прямоугольник по стороне p1–p2 и третьей точке на противоположной стороне. */
export function getRectFrom3Points(
  p1: Point,
  p2: Point,
  p3: Point,
): Pick<RectShape, 'p1' | 'p2' | 'angle'> | null {
  'worklet';
  const width = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(width > 0)) return null;
  const ux = (p2.x - p1.x) / width;
  const uy = (p2.y - p1.y) / width;
  const height = -(p3.x - p1.x) * uy + (p3.y - p1.y) * ux;
  if (Math.abs(height) < 0.001) return null;
  const opposite = {
    x: roundMm(p2.x - uy * height),
    y: roundMm(p2.y + ux * height),
  };
  return {
    p1: { x: roundMm(p1.x), y: roundMm(p1.y) },
    p2: opposite,
    angle: roundAngle(angleTo(p1, p2)),
  };
}

/** Параметры размера без id и типа: измеряемые точки, смещение размерной линии и вид размера. */
export type DimensionParams = Pick<
  DimensionShape,
  'p1' | 'p2' | 'p3' | 'offset' | 'axis' | 'kind'
>;

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

/** Начальный и конечный углы меньшей дуги между двумя лучами. */
function angularDimensionAngles(d: DimensionParams): { start: number; end: number; sweep: number } | null {
  'worklet';
  if (!d.p3 || (d.p1.x === d.p2.x && d.p1.y === d.p2.y) || (d.p1.x === d.p3.x && d.p1.y === d.p3.y)) {
    return null;
  }
  const a = angleTo(d.p1, d.p2);
  const b = angleTo(d.p1, d.p3);
  const ccw = normalizeAngle(b - a);
  return ccw <= 180
    ? { start: a, end: b, sweep: ccw }
    : { start: b, end: a, sweep: 360 - ccw };
}

/** Измеряемая величина: мм для длин, градусы для угла. */
export function dimensionLength(d: DimensionParams): number {
  'worklet';
  if (d.kind === 'angular') return angularDimensionAngles(d)?.sweep ?? 0;
  const radius = Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y);
  if (d.kind === 'radius') return radius;
  if (d.kind === 'diameter') return radius * 2;
  if (d.axis === 'x') return Math.abs(d.p2.x - d.p1.x);
  if (d.axis === 'y') return Math.abs(d.p2.y - d.p1.y);
  return radius;
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
  if (d.kind === 'radius') return { a: d.p1, b: d.p2 };
  if (d.kind === 'diameter') {
    return {
      a: { x: d.p1.x * 2 - d.p2.x, y: d.p1.y * 2 - d.p2.y },
      b: d.p2,
    };
  }
  const a = { x: d.p1.x + n.x * d.offset, y: d.p1.y + n.y * d.offset };
  return { a, b: { x: a.x + u.x * len, y: a.y + u.y * len } };
}

/** Где рукоятка смещения размера: середина размерной линии. */
export function dimensionOffsetHandle(d: DimensionParams): Point {
  'worklet';
  if (d.kind === 'angular') {
    const angles = angularDimensionAngles(d);
    if (angles) {
      return pointAtAngle(d.p1, Math.abs(d.offset), angles.start + angles.sweep / 2);
    }
  }
  const ends = dimensionLineEnds(d);
  if (!ends) return { x: (d.p1.x + d.p2.x) / 2, y: (d.p1.y + d.p2.y) / 2 };
  return { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 };
}

/** Габарит размера: измеряемые точки и концы размерной линии (текст не учитывается). */
export function dimensionBox(d: DimensionParams): Box {
  'worklet';
  if (d.kind === 'angular') {
    const angles = angularDimensionAngles(d);
    if (angles) {
      const arc = arcBox({
        center: d.p1,
        radius: Math.abs(d.offset),
        startAngle: angles.start,
        endAngle: angles.end,
      });
      return {
        x0: Math.min(d.p1.x, d.p2.x, d.p3?.x ?? d.p2.x, arc.x0),
        y0: Math.min(d.p1.y, d.p2.y, d.p3?.y ?? d.p2.y, arc.y0),
        x1: Math.max(d.p1.x, d.p2.x, d.p3?.x ?? d.p2.x, arc.x1),
        y1: Math.max(d.p1.y, d.p2.y, d.p3?.y ?? d.p2.y, arc.y1),
      };
    }
  }
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
  if (d.kind === 'angular') {
    const angles = angularDimensionAngles(d);
    const radius = Math.abs(d.offset);
    if (!angles || !(angles.sweep > 0) || !(radius > 0)) return null;
    const a = pointAtAngle(d.p1, radius, angles.start);
    const b = pointAtAngle(d.p1, radius, angles.end);
    const lines: [Point, Point][] = [
      [d.p1, a],
      [d.p1, b],
    ];
    const steps = Math.max(2, Math.ceil(angles.sweep / 10));
    for (let i = 0; i < steps; i++) {
      lines.push([
        pointAtAngle(d.p1, radius, angles.start + (angles.sweep * i) / steps),
        pointAtAngle(d.p1, radius, angles.start + (angles.sweep * (i + 1)) / steps),
      ]);
    }
    const arrowLength = Math.min(DIM_ARROW_MM, (radius * angles.sweep * Math.PI) / 720);
    const arrowWidth = arrowLength * DIM_ARROW_WIDTH_RATIO;
    for (const [tip, deg, direction] of [
      [a, angles.start, 1],
      [b, angles.end, -1],
    ] as const) {
      const rad = (deg * Math.PI) / 180;
      const tangent = { x: -Math.sin(rad) * direction, y: Math.cos(rad) * direction };
      const normal = { x: Math.cos(rad), y: Math.sin(rad) };
      const base = {
        x: tip.x + tangent.x * arrowLength,
        y: tip.y + tangent.y * arrowLength,
      };
      lines.push([tip, { x: base.x + normal.x * arrowWidth, y: base.y + normal.y * arrowWidth }]);
      lines.push([tip, { x: base.x - normal.x * arrowWidth, y: base.y - normal.y * arrowWidth }]);
    }
    const mid = angles.start + angles.sweep / 2;
    const textPoint = pointAtAngle(d.p1, radius + DIM_TEXT_GAP_MM, mid);
    let textAngle = normalizeAngle(mid + 90);
    if (textAngle > 180) textAngle -= 360;
    if (textAngle > 90) textAngle -= 180;
    else if (textAngle <= -90) textAngle += 180;
    return {
      lines,
      text: {
        value: `${roundMm(angles.sweep)}°`,
        x: textPoint.x,
        y: textPoint.y,
        angle: textAngle,
        height: DIM_TEXT_HEIGHT_MM,
      },
      a,
      b,
    };
  }
  const u = dimensionAlong(d);
  const n = dimensionNormal(d);
  const ends = dimensionLineEnds(d);
  if (!u || !n || !ends || !(len > 0)) return null;
  const { a, b } = ends;
  const lines: [Point, Point][] = [];

  // Выносные линии нужны только линейному размеру; радиус и диаметр идут от центра/окружности.
  if (d.kind !== 'radius' && d.kind !== 'diameter') {
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
  }

  // Размерная линия и стрелки на её концах (острие — в a и b).
  lines.push([a, b]);
  const al = Math.min(DIM_ARROW_MM, len / 4);
  const aw = al * DIM_ARROW_WIDTH_RATIO;
  const arrowTips: [Point, number][] = d.kind === 'radius' ? [[b, -1]] : [[a, 1], [b, -1]];
  for (const [tip, dir] of arrowTips) {
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
      value: `${d.kind === 'radius' ? 'R' : d.kind === 'diameter' ? '⌀' : ''}${roundMm(len)}`,
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

/** Окружность по двум противоположным концам диаметра. */
export function getCircleFromDiameter(
  p1: Point,
  p2: Point,
): Pick<CircleShape, 'center' | 'radius'> | null {
  'worklet';
  const radius = roundMm(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2);
  if (!(radius > 0)) return null;
  return {
    center: { x: roundMm((p1.x + p2.x) / 2), y: roundMm((p1.y + p2.y) / 2) },
    radius,
  };
}

/** Описанная окружность через три точки; null — точки совпадают или коллинеарны. */
export function getCircleFrom3Points(
  p1: Point,
  p2: Point,
  p3: Point,
): Pick<CircleShape, 'center' | 'radius'> | null {
  'worklet';
  const arc = getArcFrom3Points(p1, p2, p3);
  return arc ? { center: arc.center, radius: arc.radius } : null;
}

/** Дуга от начального направления к конечному против часовой; конец задаёт только угол. */
export function getArcFromCenterStartEnd(center: Point, start: Point, end: Point): ArcParams | null {
  'worklet';
  const radius = roundMm(Math.hypot(start.x - center.x, start.y - center.y));
  if (!(radius > 0) || (center.x === end.x && center.y === end.y)) return null;
  const startAngle = roundAngle(angleTo(center, start));
  const endAngle = roundAngle(angleTo(center, end));
  if (startAngle === endAngle) return null;
  return {
    center: { x: roundMm(center.x), y: roundMm(center.y) },
    radius,
    startAngle,
    endAngle,
  };
}

/** Ближайшая точка отрезка; вырожденный отрезок даёт его начало. */
export function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!(length2 > 0)) return { x: roundMm(a.x), y: roundMm(a.y) };
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return { x: roundMm(a.x + dx * t), y: roundMm(a.y + dy * t) };
}

/** Ближайшая точка бесконечной прямой. */
export function nearestPointOnLine(p: Point, point: Point, angle: number): Point {
  'worklet';
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const t = (p.x - point.x) * ux + (p.y - point.y) * uy;
  return { x: roundMm(point.x + ux * t), y: roundMm(point.y + uy * t) };
}

export type InfiniteLineParams = { point: Point; angle: number };

/** Отрезок или разметочная прямая как бесконечная линия. Другие фигуры — null. */
export function getInfiniteLine(shape: Shape): InfiniteLineParams | null {
  'worklet';
  if (shape.type === 'segment') {
    if (shape.start.x === shape.end.x && shape.start.y === shape.end.y) return null;
    return { point: shape.start, angle: angleTo(shape.start, shape.end) };
  }
  if (shape.type === 'xline') return { point: shape.point, angle: shape.angle };
  return null;
}

/** Пересечение двух бесконечных линий; параллельные и совпадающие — null. */
export function getLineIntersection(a: InfiniteLineParams, b: InfiniteLineParams): Point | null {
  'worklet';
  const ar = (a.angle * Math.PI) / 180;
  const br = (b.angle * Math.PI) / 180;
  const rx = Math.cos(ar);
  const ry = Math.sin(ar);
  const sx = Math.cos(br);
  const sy = Math.sin(br);
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qx = b.point.x - a.point.x;
  const qy = b.point.y - a.point.y;
  const t = (qx * sy - qy * sx) / denominator;
  return { x: roundMm(a.point.x + t * rx), y: roundMm(a.point.y + t * ry) };
}

/** Общие касательные к двум окружностям: до четырёх отрезков между точками касания. */
export function getCircleTangentSegments(
  c1: Point,
  r1: number,
  c2: Point,
  r2: number,
): Pick<SegmentShape, 'start' | 'end'>[] {
  'worklet';
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0) || !(r1 > 0) || !(r2 > 0)) return [];
  const ux = dx / distance;
  const uy = dy / distance;
  const result: Pick<SegmentShape, 'start' | 'end'>[] = [];
  for (const [s1, s2] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const signedRadius = s1 * r1 - s2 * r2;
    const ratio = signedRadius / distance;
    if (Math.abs(ratio) > 1 + 1e-9) continue;
    const along = Math.max(-1, Math.min(1, ratio));
    const across = Math.sqrt(Math.max(0, 1 - along * along));
    for (const side of [-1, 1]) {
      const nx = along * ux - side * across * uy;
      const ny = along * uy + side * across * ux;
      const start = {
        x: roundMm(c1.x + s1 * r1 * nx),
        y: roundMm(c1.y + s1 * r1 * ny),
      };
      const end = {
        x: roundMm(c2.x + s2 * r2 * nx),
        y: roundMm(c2.y + s2 * r2 * ny),
      };
      if (start.x === end.x && start.y === end.y) continue;
      const duplicate = result.some(
        (item) =>
          Math.hypot(item.start.x - start.x, item.start.y - start.y) < 0.001 &&
          Math.hypot(item.end.x - end.x, item.end.y - end.y) < 0.001,
      );
      if (!duplicate) result.push({ start, end });
    }
  }
  return result;
}

/** Решение линейной системы 3×3. Используется для центра и радиуса касательной окружности. */
function solve3(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  r1: number,
  r2: number,
  r3: number,
): [number, number, number] | null {
  'worklet';
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-10) return null;
  const x =
    (r1 * (e * i - f * h) - b * (r2 * i - f * r3) + c * (r2 * h - e * r3)) /
    determinant;
  const y =
    (a * (r2 * i - f * r3) - r1 * (d * i - f * g) + c * (d * r3 - r2 * g)) /
    determinant;
  const z =
    (a * (e * r3 - r2 * h) - b * (d * r3 - r2 * g) + r1 * (d * h - e * g)) /
    determinant;
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

/**
 * Окружность, касательная трёх бесконечных линий. Из вписанной и трёх вневписанных
 * выбирается та, центр которой ближе к preferred (обычно — к местам тапов).
 */
export function getCircleTangentTo3Lines(
  l1: InfiniteLineParams,
  l2: InfiniteLineParams,
  l3: InfiniteLineParams,
  preferred: Point,
): Pick<CircleShape, 'center' | 'radius'> | null {
  'worklet';
  const lines = [l1, l2, l3].map((line) => {
    const rad = (line.angle * Math.PI) / 180;
    const nx = -Math.sin(rad);
    const ny = Math.cos(rad);
    return { nx, ny, c: nx * line.point.x + ny * line.point.y };
  });
  const [a, b, c] = lines;
  const candidates: Pick<CircleShape, 'center' | 'radius'>[] = [];
  for (const [s1, s2, s3] of [
    [1, 1, 1],
    [1, 1, -1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, 1, 1],
    [-1, 1, -1],
    [-1, -1, 1],
    [-1, -1, -1],
  ] as const) {
    const solved = solve3(
      a.nx,
      a.ny,
      -s1,
      b.nx,
      b.ny,
      -s2,
      c.nx,
      c.ny,
      -s3,
      a.c,
      b.c,
      c.c,
    );
    if (!solved || !(solved[2] > 0.0005)) continue;
    const candidate = {
      center: { x: roundMm(solved[0]), y: roundMm(solved[1]) },
      radius: roundMm(solved[2]),
    };
    const duplicate = candidates.some(
      (item) =>
        Math.hypot(item.center.x - candidate.center.x, item.center.y - candidate.center.y) < 0.001 &&
        Math.abs(item.radius - candidate.radius) < 0.001,
    );
    if (!duplicate) candidates.push(candidate);
  }
  let best: Pick<CircleShape, 'center' | 'radius'> | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.center.x - preferred.x, candidate.center.y - preferred.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
