import type { UCS } from '@/types/ucs';
import { screenToWorld, worldToScreen, type Point, type Viewport } from '@/utils/viewport';

export const WCS: UCS = { id: 'wcs', name: 'Мировая СК (WCS)', dx: 0, dy: 0, angle: 0 };

function finiteOr(value: number, fallback: number): number {
  'worklet';
  return Number.isFinite(value) ? value : fallback;
}

/** Старая или повреждённая СК не должна отдавать NaN в матрицу и обработчики тапов. */
function normalizeUcs(ucs: UCS): UCS {
  'worklet';
  return {
    id: typeof ucs.id === 'string' ? ucs.id : WCS.id,
    name: typeof ucs.name === 'string' ? ucs.name : WCS.name,
    dx: finiteOr(ucs.dx, WCS.dx),
    dy: finiteOr(ucs.dy, WCS.dy),
    angle: finiteOr(ucs.angle, WCS.angle),
  };
}

/** Локальные координаты СК -> координаты мировой системы. */
export function ucsToWorld(p: Point, ucs: UCS): Point {
  'worklet';
  const safeUcs = normalizeUcs(ucs);
  const rad = (safeUcs.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: safeUcs.dx + c * p.x - s * p.y,
    y: safeUcs.dy + s * p.x + c * p.y,
  };
}

/** Мировые координаты -> локальные координаты СК (обратный поворот). */
export function worldToUcs(p: Point, ucs: UCS): Point {
  'worklet';
  const safeUcs = normalizeUcs(ucs);
  const rad = (safeUcs.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const x = p.x - safeUcs.dx;
  const y = p.y - safeUcs.dy;
  return { x: c * x + s * y, y: -s * x + c * y };
}

/** Мировые координаты фигуры -> экран через обратную матрицу активной СК. */
export function drawingToScreen(vp: Viewport, p: Point, ucs: UCS): Point {
  'worklet';
  return worldToScreen(vp, worldToUcs(p, ucs));
}

/** Экран -> мировые координаты: инверсия Y выполняется один раз в screenToWorld. */
export function screenToDrawing(vp: Viewport, p: Point, ucs: UCS): Point {
  'worklet';
  const world = ucsToWorld(screenToWorld(vp, p), ucs);
  // Последний предохранитель: в геометрию и привязку уходят только конечные координаты.
  return Number.isFinite(world.x) && Number.isFinite(world.y) ? world : { x: 0, y: 0 };
}
