import { CAD_COLORS, LINE_STYLE_OPTIONS } from '@/constants/lineStyles';
import type { Shape, ShapeAppearance } from '@/types/shapes';
import { roundMm, type Point } from '@/utils/viewport';

export const DEV_PERF_STAGES = [
  { id: 'soft', label: 'Софт', count: 100 },
  { id: 'medium', label: 'Медиум', count: 500 },
  { id: 'hard', label: 'Хард', count: 1500 },
  { id: 'brutal', label: 'Убой', count: 5000 },
] as const;

const AREA_HALF_SIZE_MM = 1000;
const DEV_APPEARANCE: ShapeAppearance = {
  lineStyle: 'solid_thin',
  color: '#000000',
  autoColor: true,
};

// Общий счётчик не даёт id пересечься даже между последовательными этапами теста.
let nextDevShapeId = 1;

function makeDevId(): string {
  const id = `dev-perf-${nextDevShapeId}`;
  nextDevShapeId += 1;
  return id;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomPoint(halfSize: number): Point {
  return {
    x: roundMm(randomBetween(-halfSize, halfSize)),
    y: roundMm(randomBetween(-halfSize, halfSize)),
  };
}

/** Конечные фигуры в мм, ось Y направлена вверх; бесконечные прямые в тест не входят. */
export function generateDevShapes(count: number): Shape[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const shapes: Shape[] = [];

  for (let i = 0; i < total; i += 1) {
    const id = makeDevId();
    // Круговой выбор типа гарантирует присутствие всех пяти видов в каждом этапе.
    switch (i % 5) {
      case 0:
        shapes.push({
          ...DEV_APPEARANCE,
          id,
          type: 'point',
          p: randomPoint(AREA_HALF_SIZE_MM),
        });
        break;
      case 1: {
        const start = randomPoint(AREA_HALF_SIZE_MM);
        const angle = randomBetween(0, Math.PI * 2);
        const length = randomBetween(40, 500);
        shapes.push({
          ...DEV_APPEARANCE,
          id,
          type: 'segment',
          start,
          end: {
            x: roundMm(start.x + Math.cos(angle) * length),
            y: roundMm(start.y + Math.sin(angle) * length),
          },
        });
        break;
      }
      case 2:
        shapes.push({
          ...DEV_APPEARANCE,
          id,
          type: 'circle',
          center: randomPoint(AREA_HALF_SIZE_MM),
          radius: roundMm(randomBetween(5, 180)),
        });
        break;
      case 3: {
        const startAngle = roundMm(randomBetween(0, 360)) % 360;
        // Размах меньше полного круга, поэтому начало и конец валидной дуги не совпадают.
        const sweep = randomBetween(20, 320);
        const endAngle = roundMm((startAngle + sweep) % 360) % 360;
        shapes.push({
          ...DEV_APPEARANCE,
          id,
          type: 'arc',
          center: randomPoint(AREA_HALF_SIZE_MM),
          radius: roundMm(randomBetween(8, 200)),
          startAngle,
          endAngle,
        });
        break;
      }
      case 4: {
        const p1 = randomPoint(AREA_HALF_SIZE_MM);
        const width = randomBetween(20, 350) * (Math.random() < 0.5 ? -1 : 1);
        const height = randomBetween(20, 350) * (Math.random() < 0.5 ? -1 : 1);
        shapes.push({
          ...DEV_APPEARANCE,
          id,
          type: 'rect',
          p1,
          p2: {
            x: roundMm(p1.x + width),
            y: roundMm(p1.y + height),
          },
          angle: 0,
        });
        break;
      }
    }
  }

  return shapes;
}

/** Возвращает новые объекты: ни массив, ни исходные фигуры не изменяются. */
export function randomizeDevShapeStyles(shapes: Shape[]): Shape[] {
  return shapes.map((shape): Shape => {
    const style = LINE_STYLE_OPTIONS[Math.floor(Math.random() * LINE_STYLE_OPTIONS.length)];
    const color = CAD_COLORS[Math.floor(Math.random() * CAD_COLORS.length)];
    return {
      ...shape,
      lineStyle: style?.id ?? 'solid_thin',
      color: color?.value ?? '#FF0000',
      autoColor: false,
    };
  });
}
