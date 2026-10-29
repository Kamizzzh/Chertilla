// Пересчёт координат: экран (пиксели) <-> чертёж (миллиметры).
//
// Система координат чертежа:
//   - начало (0,0) в центре экрана (при сброшенном виде);
//   - ось X направлена вправо, ось Y — вверх (как в инженерной графике).
//
// Все функции помечены 'worklet', чтобы их можно было вызывать
// прямо внутри жестов и анимаций (в UI-потоке).

// Сколько экранных пикселей (dp) приходится на 1 мм при зуме 1.
// 160 dp = 1 дюйм = 25.4 мм, поэтому при зуме 1 чертёж примерно в натуральную величину.
export const PX_PER_MM = 160 / 25.4;

export const MIN_SCALE = 0.001;
export const MAX_SCALE = 1000;

// Базовый шаг сетки, мм.
export const GRID_STEP_MM = 10;

/** Текущее состояние вида: размер холста, сдвиг и зум. */
export type Viewport = {
  width: number; // ширина холста, px
  height: number; // высота холста, px
  translateX: number; // сдвиг начала координат от центра холста, px
  translateY: number;
  scale: number; // зум (1 = исходный)
};

export type Point = { x: number; y: number };

export function clampScale(value: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/** Сколько пикселей в 1 мм при текущем зуме. */
export function pxPerMm(vp: Viewport): number {
  'worklet';
  return PX_PER_MM * vp.scale;
}

/**
 * Размер в мм чертежа -> размер в пикселях экрана, зажатый в пределы [minPx, maxPx].
 * Нужен для толщины линий и радиуса точек: они масштабируются вместе с чертежом,
 * но не исчезают при сильном отдалении и не раздуваются при сильном приближении.
 */
export function mmToPxClamped(vp: Viewport, mm: number, minPx: number, maxPx: number): number {
  'worklet';
  return Math.min(maxPx, Math.max(minPx, mm * pxPerMm(vp)));
}

/** Миллиметры -> пиксели экрана. */
export function worldToScreen(vp: Viewport, p: Point): Point {
  'worklet';
  const k = pxPerMm(vp);
  return {
    x: vp.width / 2 + vp.translateX + p.x * k,
    y: vp.height / 2 + vp.translateY - p.y * k,
  };
}

/** Пиксели экрана -> миллиметры. */
export function screenToWorld(vp: Viewport, p: Point): Point {
  'worklet';
  const k = pxPerMm(vp);
  return {
    x: (p.x - vp.width / 2 - vp.translateX) / k,
    y: -(p.y - vp.height / 2 - vp.translateY) / k,
  };
}

/** Округление до 0.001 мм (точность чертежа). */
export function roundMm(value: number): number {
  'worklet';
  // "|| 0" убирает "минус ноль" (-0), чтобы не было координат вида -0.000.
  return Math.round(value * 1000) / 1000 || 0;
}

/** Округляет значение до ближайшего узла сетки (шаг GRID_STEP_MM). */
export function snapToGridMm(value: number): number {
  'worklet';
  return Math.round(value / GRID_STEP_MM) * GRID_STEP_MM || 0;
}

// Пределы, в которых держим расстояние между линиями сетки на экране.
// Если линии слишком густые — шаг увеличивается в 10 раз, слишком редкие — уменьшается.
export const MIN_GRID_PX = 8;
const MAX_GRID_PX = MIN_GRID_PX * 10;

/** Шаг сетки в мм, подобранный под текущий зум (при зуме 1 это 10 мм). */
export function gridStepMm(vp: Viewport): number {
  'worklet';
  const k = pxPerMm(vp);
  // При k = 0 (или NaN / бесконечности) циклы ниже никогда бы не закончились.
  if (!(k > 0 && Number.isFinite(k))) return GRID_STEP_MM;
  let step = GRID_STEP_MM;
  while (step * k < MIN_GRID_PX) step *= 10;
  while (step * k >= MAX_GRID_PX) step /= 10;
  return step;
}
