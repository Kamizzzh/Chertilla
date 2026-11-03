import type { Shape } from '@/types/shapes';
import { roundMm, type Point } from '@/utils/viewport';

/** Точка, сдвинутая по осям чертежа, с точностью проекта 0.001 мм. */
function translatePoint(p: Point, dx: number, dy: number): Point {
  'worklet';
  return { x: roundMm(p.x + dx), y: roundMm(p.y + dy) };
}

/**
 * Фигура, сдвинутая целиком без изменения размеров и углов.
 * Используется и на UI-потоке при перетаскивании, и в JS при копировании.
 */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  'worklet';
  switch (shape.type) {
    case 'point':
      return { ...shape, p: translatePoint(shape.p, dx, dy) };
    case 'segment':
      return {
        ...shape,
        start: translatePoint(shape.start, dx, dy),
        end: translatePoint(shape.end, dx, dy),
      };
    case 'circle':
      return { ...shape, center: translatePoint(shape.center, dx, dy) };
    case 'xline':
      return { ...shape, point: translatePoint(shape.point, dx, dy) };
    case 'rect':
      return {
        ...shape,
        p1: translatePoint(shape.p1, dx, dy),
        p2: translatePoint(shape.p2, dx, dy),
      };
    case 'arc':
      return { ...shape, center: translatePoint(shape.center, dx, dy) };
    case 'dimension':
      return {
        ...shape,
        p1: translatePoint(shape.p1, dx, dy),
        p2: translatePoint(shape.p2, dx, dy),
        p3: shape.p3 ? translatePoint(shape.p3, dx, dy) : undefined,
      };
  }
}
