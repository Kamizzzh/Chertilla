// Типы фигур чертежа и инструментов.
// Все координаты — в миллиметрах чертежа (ось Y вверх), углы — в градусах.

import type { Point } from '@/utils/viewport';

/**
 * Активный инструмент. 'none' — ничего не выбрано (можно двигать вид одним пальцем).
 * 'select' — выделение: тап выбирает фигуру под пальцем, новые фигуры не создаются.
 * 'intersect' — пересечение: тап по двум фигурам, затем выбор точки (создаётся обычная точка).
 * 'divide' — равномерное деление отрезка, окружности или дуги обычными точками.
 */
export type Tool =
  | 'none'
  | 'select'
  | 'point'
  | 'segment'
  | 'circle'
  | 'xline'
  | 'rect'
  | 'arc'
  | 'dimension'
  | 'intersect'
  | 'divide';

/**
 * Способ построения бесконечной прямой:
 * 'axisX' — горизонтальная (0°), 'axisY' — вертикальная (90°),
 * 'angle' — под углом из поля ввода, 'twoPoints' — через две точки.
 */
/** Вид линейного размера: вдоль p1–p2, по разности X или по разности Y. */
export type DimensionAxis = 'aligned' | 'x' | 'y';

export type XLineMode = 'axisX' | 'axisY' | 'angle' | 'twoPoints';

export type LineStyle =
  | 'solid_thick'
  | 'solid_thin'
  | 'wavy'
  | 'dashed'
  | 'dash_dot_thin'
  | 'dash_dot_thick'
  | 'open_dotted'
  | 'dash_dot_dot';

/** Внешний вид фигуры. autoColor !== false — цвет следует за темой холста. */
export type ShapeAppearance = {
  lineStyle: LineStyle;
  color: string;
  autoColor?: boolean;
};

export type PointShape = ShapeAppearance & {
  id: string;
  type: 'point';
  p: Point;
};

export type SegmentShape = ShapeAppearance & {
  id: string;
  type: 'segment';
  start: Point;
  end: Point;
};

export type CircleShape = ShapeAppearance & {
  id: string;
  type: 'circle';
  center: Point;
  radius: number; // мм
};

/** Бесконечная прямая: проходит через точку point под углом angle (градусы, от оси X против часовой). */
export type XLineShape = ShapeAppearance & {
  id: string;
  type: 'xline';
  point: Point;
  angle: number;
};

/** Прямоугольник со сторонами вдоль осей: p1 и p2 — противоположные углы (в любом порядке). */
export type RectShape = ShapeAppearance & {
  id: string;
  type: 'rect';
  p1: Point;
  p2: Point;
};

/**
 * Дуга окружности: от угла startAngle до угла endAngle ПРОТИВ часовой стрелки.
 * Углы — в градусах от оси X, в диапазоне [0°, 360°). startAngle ≠ endAngle.
 */
export type ArcShape = ShapeAppearance & {
  id: string;
  type: 'arc';
  center: Point;
  radius: number; // мм
  startAngle: number;
  endAngle: number;
};

/**
 * Линейный размер (сноска) между точками p1 и p2 вдоль прямой p1–p2.
 * offset — расстояние от прямой p1–p2 до размерной линии, мм; знак — сторона:
 * положительное — слева от направления p1 → p2 (ось Y вверх), отрицательное — справа.
 */
export type DimensionShape = ShapeAppearance & {
  id: string;
  type: 'dimension';
  p1: Point;
  p2: Point;
  offset: number;
  /** 'aligned' (по умолчанию) — длина p1–p2; 'x' — |Δx|, линия горизонтальна; 'y' — |Δy|, линия вертикальна. */
  axis: DimensionAxis;
};

export type Shape =
  | PointShape
  | SegmentShape
  | CircleShape
  | XLineShape
  | RectShape
  | ArcShape
  | DimensionShape;
