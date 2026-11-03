import type { UCS } from '@/types/ucs';
import { screenToWorld, worldToScreen, type Point, type Viewport } from '@/utils/viewport';

export const WCS: UCS = { id: 'wcs', name: 'Мировая СК (WCS)', dx: 0, dy: 0, angle: 0 };

/** Локальные координаты СК -> координаты мировой системы. */
export function ucsToWorld(p: Point, ucs: UCS): Point {
  'worklet';
  const rad = (ucs.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: ucs.dx + c * p.x - s * p.y, y: ucs.dy + s * p.x + c * p.y };
}

/** Мировые координаты -> локальные координаты СК (обратный поворот). */
export function worldToUcs(p: Point, ucs: UCS): Point {
  'worklet';
  const rad = (ucs.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const x = p.x - ucs.dx;
  const y = p.y - ucs.dy;
  return { x: c * x + s * y, y: -s * x + c * y };
}

export function drawingToScreen(vp: Viewport, p: Point, ucs: UCS): Point {
  'worklet';
  return worldToScreen(vp, ucsToWorld(p, ucs));
}

export function screenToDrawing(vp: Viewport, p: Point, ucs: UCS): Point {
  'worklet';
  return worldToUcs(screenToWorld(vp, p), ucs);
}
