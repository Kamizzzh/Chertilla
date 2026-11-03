// Экспорт чертежа в DXF (текстовый формат AutoCAD, версия R12) — для CAD-программ.
// Файл минимальный: секция HEADER (версия и единицы) и секция ENTITIES (фигуры).
// Координаты — миллиметры чертежа, ось Y вверх (как в DXF), начало координат совпадает.
// Все фигуры лежат на слое «0». Используются только сущности R12: POINT, LINE, CIRCLE, ARC, TEXT.
// Прямоугольник записывается четырьмя LINE, размер — LINE и TEXT.
//
// DXF — это пары строк «код группы / значение». Например, «10» + «12.5» — координата X.

import type { Shape } from '@/types/shapes';
import { dimensionLayout, rectCorners } from '@/utils/geometry';
import { formatExportNumber as n } from '@/utils/number';
import type { Point } from '@/utils/viewport';

/** Пары «код / значение» одной записи DXF. */
type Pairs = [number, string | number][];

/** Перевод строки: CAD-программы на Windows ожидают \r\n. */
const EOL = '\r\n';

/** На сколько мм бесконечная прямая уходит в каждую сторону от опорной точки. */
const XLINE_HALF_LENGTH = 100000;

function pairsToText(pairs: Pairs): string {
  return pairs
    .map(([code, value]) => `${code}${EOL}${typeof value === 'number' ? n(value) : value}`)
    .join(EOL);
}

/** Отрезок a–b -> пары DXF (сущность LINE). */
function linePairs(a: Point, b: Point): Pairs {
  return [
    [0, 'LINE'],
    [8, '0'],
    [10, a.x],
    [20, a.y],
    [30, 0],
    [11, b.x],
    [21, b.y],
    [31, 0],
  ];
}

/** Одна фигура -> пары DXF. */
function shapeToPairs(shape: Shape): Pairs {
  switch (shape.type) {
    case 'rect': {
      // Четыре стороны — четыре LINE (замкнутой полилинии LWPOLYLINE в R12 ещё нет).
      const c = rectCorners(shape.p1, shape.p2, shape.angle);
      return c.flatMap((a, i) => linePairs(a, c[(i + 1) % 4]));
    }
    case 'dimension': {
      // Размер — не сущность DIMENSION (она в R12 сложная), а простые LINE и TEXT:
      // выносные, размерная линия, стрелки и число. Текст по центру (72 = 1) вокруг точки
      // выравнивания (11, 21, 31), поворот (50) — вдоль размерной линии, градусы.
      const layout = dimensionLayout(shape);
      if (!layout) return [];
      const t = layout.text;
      return [
        ...layout.lines.flatMap(([a, b]) => linePairs(a, b)),
        [0, 'TEXT'],
        [8, '0'],
        [10, t.x],
        [20, t.y],
        [30, 0],
        [40, t.height],
        [1, t.value.replace('⌀', '%%c').replace('°', '%%d')],
        [50, t.angle],
        [72, '1'],
        [11, t.x],
        [21, t.y],
        [31, 0],
      ];
    }
    case 'arc':
      // ARC в DXF тоже идёт против часовой от угла 50 к углу 51, углы в градусах.
      return [
        [0, 'ARC'],
        [8, '0'],
        [10, shape.center.x],
        [20, shape.center.y],
        [30, 0],
        [40, shape.radius],
        [50, shape.startAngle],
        [51, shape.endAngle],
      ];
    case 'point':
      return [
        [0, 'POINT'],
        [8, '0'],
        [10, shape.p.x],
        [20, shape.p.y],
        [30, 0],
      ];
    case 'segment':
      return linePairs(shape.start, shape.end);
    case 'circle':
      return [
        [0, 'CIRCLE'],
        [8, '0'],
        [10, shape.center.x],
        [20, shape.center.y],
        [30, 0],
        [40, shape.radius],
      ];
    case 'xline': {
      // В R12 нет сущности XLINE (она появилась в R13), поэтому бесконечную прямую
      // записываем обычным отрезком LINE, уходящим на XLINE_HALF_LENGTH мм в обе стороны
      // от опорной точки. Градусы чертежа переводим в радианы для Math.cos / Math.sin.
      const rad = (shape.angle * Math.PI) / 180;
      const dx = Math.cos(rad) * XLINE_HALF_LENGTH;
      const dy = Math.sin(rad) * XLINE_HALF_LENGTH;
      return [
        [0, 'LINE'],
        [8, '0'],
        [10, shape.point.x - dx],
        [20, shape.point.y - dy],
        [30, 0],
        [11, shape.point.x + dx],
        [21, shape.point.y + dy],
        [31, 0],
      ];
    }
  }
}

/** Чертёж -> текст DXF-файла. */
export function exportToDxf(shapes: Shape[]): string {
  const pairs: Pairs = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'], // AC1009 = AutoCAD R12
    [9, '$INSUNITS'],
    [70, '4'], // 4 = миллиметры
    [9, '$MEASUREMENT'],
    [70, '1'], // 1 = метрическая система
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'ENTITIES'],
    ...shapes.flatMap(shapeToPairs),
    [0, 'ENDSEC'],
    [0, 'EOF'],
  ];
  return pairsToText(pairs) + EOL;
}
