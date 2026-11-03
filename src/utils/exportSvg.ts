// Экспорт чертежа в SVG (для просмотра в браузере).
// Координаты в файле — те же миллиметры, что и в чертеже, начало координат совпадает.
// В SVG ось Y направлена вниз, поэтому все фигуры лежат в группе с transform="scale(1, -1)":
// внутри неё ось Y снова смотрит вверх, как на чертеже.

import type { Shape } from '@/types/shapes';
import {
  arcBox,
  arcEndpoints,
  arcSweep,
  dimensionBox,
  dimensionLayout,
  rectBox,
  rectCorners,
} from '@/utils/geometry';
import { formatExportNumber as n } from '@/utils/number';

/** Прямоугольник в мм чертежа (ось Y вверх). */
type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Размер области для пустого чертежа, мм. */
const EMPTY_HALF_SIZE = 50;
/** Поля вокруг чертежа: доля от большей стороны, но не меньше MIN_MARGIN мм. */
const MARGIN_RATIO = 0.05;
const MIN_MARGIN = 10;
/** Радиус кружка точки: доля от большей стороны области. */
const POINT_RADIUS_RATIO = 0.003;

/**
 * Область, в которую попадает весь чертёж (с полями).
 * У бесконечных прямых учитывается только их опорная точка.
 */
function getBounds(shapes: Shape[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const shape of shapes) {
    switch (shape.type) {
      case 'point':
        add(shape.p.x, shape.p.y);
        break;
      case 'segment':
        add(shape.start.x, shape.start.y);
        add(shape.end.x, shape.end.y);
        break;
      case 'circle':
        add(shape.center.x - shape.radius, shape.center.y - shape.radius);
        add(shape.center.x + shape.radius, shape.center.y + shape.radius);
        break;
      case 'xline':
        add(shape.point.x, shape.point.y);
        break;
      case 'rect': {
        const b = rectBox(shape.p1, shape.p2, shape.angle);
        add(b.x0, b.y0);
        add(b.x1, b.y1);
        break;
      }
      case 'arc': {
        const b = arcBox(shape);
        add(b.x0, b.y0);
        add(b.x1, b.y1);
        break;
      }
      case 'dimension': {
        const b = dimensionBox(shape);
        add(b.x0, b.y0);
        add(b.x1, b.y1);
        break;
      }
    }
  }

  if (minX === Infinity) {
    return { minX: -EMPTY_HALF_SIZE, minY: -EMPTY_HALF_SIZE, maxX: EMPTY_HALF_SIZE, maxY: EMPTY_HALF_SIZE };
  }
  const margin = Math.max(Math.max(maxX - minX, maxY - minY) * MARGIN_RATIO, MIN_MARGIN);
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

/** Одна фигура -> SVG-элемент (в координатах чертежа). */
function shapeToSvg(shape: Shape, box: Box, pointRadius: number): string {
  switch (shape.type) {
    case 'point':
      return `<circle cx="${n(shape.p.x)}" cy="${n(shape.p.y)}" r="${n(pointRadius)}" fill="#000000" stroke="none"/>`;
    case 'segment':
      return `<line x1="${n(shape.start.x)}" y1="${n(shape.start.y)}" x2="${n(shape.end.x)}" y2="${n(shape.end.y)}"/>`;
    case 'circle':
      return `<circle cx="${n(shape.center.x)}" cy="${n(shape.center.y)}" r="${n(shape.radius)}"/>`;
    case 'xline': {
      // Прямую рисуем отрезком, который заведомо длиннее области в обе стороны от опорной точки.
      // Лишнее за краями просто не попадает в кадр.
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const half =
        Math.hypot(shape.point.x - cx, shape.point.y - cy) +
        Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
      const rad = (shape.angle * Math.PI) / 180;
      const dx = Math.cos(rad) * half;
      const dy = Math.sin(rad) * half;
      return `<line x1="${n(shape.point.x - dx)}" y1="${n(shape.point.y - dy)}" x2="${n(shape.point.x + dx)}" y2="${n(shape.point.y + dy)}"/>`;
    }
    case 'rect': {
      const points = rectCorners(shape.p1, shape.p2, shape.angle)
        .map((p) => `${n(p.x)},${n(p.y)}`)
        .join(' ');
      return `<polygon points="${points}"/>`;
    }
    case 'arc': {
      // Дуга SVG: от начала до конца радиусом r. Флаг «большая дуга» — если дуга больше 180°.
      // Флаг направления 1 — в сторону положительных углов. Внутри группы scale(1, -1)
      // ось Y смотрит вверх, поэтому это «против часовой», как на чертеже.
      const [a, b] = arcEndpoints(shape);
      const large = arcSweep(shape.startAngle, shape.endAngle) > 180 ? 1 : 0;
      const r = n(shape.radius);
      return `<path d="M ${n(a.x)} ${n(a.y)} A ${r} ${r} 0 ${large} 1 ${n(b.x)} ${n(b.y)}"/>`;
    }
    case 'dimension': {
      // Выносные, размерная линия и стрелки — <line>, число — <text>. Текст стоит в «перевёрнутой»
      // системе: внутри группы scale(1, -1) ось Y смотрит вверх, а буквы SVG растут вниз.
      const layout = dimensionLayout(shape);
      if (!layout) return '';
      const t = layout.text;
      const lines = layout.lines.map(
        ([a, b]) => `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`,
      );
      const text = `<text transform="translate(${n(t.x)} ${n(t.y)}) rotate(${n(t.angle)}) scale(1 -1)" text-anchor="middle" font-family="sans-serif" font-size="${n(t.height)}" fill="#000000" stroke="none">${t.value}</text>`;
      return [...lines, text].join('\n');
    }
  }
}

/**
 * Чертёж -> текст SVG-файла.
 * Рисунок растягивается по окну браузера (задан только viewBox), а толщина линий
 * всегда 1 px на экране (vector-effect="non-scaling-stroke") — как в приложении.
 */
export function exportToSvg(shapes: Shape[]): string {
  const box = getBounds(shapes);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const pointRadius = Math.max(width, height) * POINT_RADIUS_RATIO;

  // После scale(1, -1) точка чертежа (x, y) оказывается в (x, -y),
  // поэтому верх области в координатах SVG — это -maxY.
  const viewBox = `${n(box.minX)} ${n(-box.maxY)} ${n(width)} ${n(height)}`;

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`,
    // vector-effect не наследуется от группы, поэтому задаём его стилем сразу всем фигурам.
    '<style>line, circle, rect, path, polygon { vector-effect: non-scaling-stroke; }</style>',
    `<rect x="${n(box.minX)}" y="${n(-box.maxY)}" width="${n(width)}" height="${n(height)}" fill="#FFFFFF"/>`,
    '<g transform="scale(1, -1)" fill="none" stroke="#000000" stroke-width="1">',
    ...shapes.map((shape) => shapeToSvg(shape, box, pointRadius)),
    '</g>',
    '</svg>',
    '',
  ];
  return lines.join('\n');
}
