// Отладочные проекты «Тест (Отладка - …)»: заранее заданные наборы фигур для ручной проверки
// отрисовки, зума и привязок без рисования каждый раз вручную.
// Три уровня нагрузки: Софт (30 фигур), Медиум (300), Хард (1500). Фигуры густо
// пересекаются — так проверяется скорость отрисовки Skia, а в Харде ещё и отсечение невидимого.

import type { Shape, ShapeAppearance } from '@/types/shapes';
import { createProject, getProjects, saveProject } from '@/utils/storage';
import { roundMm, type Point } from '@/utils/viewport';

export type DebugLevel = 'soft' | 'medium' | 'hard';

/** Имя отладочного проекта из версий до 0.0.0.0022 (один уровень, 300 фигур). */
export const DEBUG_PROJECT_NAME = 'Тест (Отладка)';

/** Имена проектов по уровням: у каждого своё, чтобы они не перезаписывали друг друга. */
export const DEBUG_PROJECT_NAMES: Record<DebugLevel, string> = {
  soft: 'Тест (Отладка - Софт)',
  medium: 'Тест (Отладка - Медиум)',
  hard: 'Тест (Отладка - Хард)',
};

/** Отладочный ли это проект (в нём показывается кнопка «PERF»). */
export function isDebugProjectName(name: string): boolean {
  return name === DEBUG_PROJECT_NAME || Object.values(DEBUG_PROJECT_NAMES).includes(name);
}

/** Половина стороны одного «блока» с фигурами, мм: блок — примерно квадрат 1000×1000. */
const HALF = 500;
const DEBUG_APPEARANCE: ShapeAppearance = {
  lineStyle: 'solid_thin',
  color: '#000000',
  autoColor: true,
};

/** Сколько фигур каждого вида в одном блоке. */
interface BlockCounts {
  /** Окружности «розетки» вокруг центра блока. */
  rosette: number;
  /** Концентрические окружности вокруг центра блока. */
  rings: number;
  randomCircles: number;
  /** Пар отрезков сетки (горизонтальный + вертикальный). */
  gridLines: number;
  randomSegments: number;
  /** Прямые «звезды» через одну точку. */
  starLines: number;
  randomXLines: number;
  /** Точек сетки по одной стороне (всего — квадрат этого числа). */
  gridPointsSide: number;
  randomPoints: number;
}

/** Медиум: 50 окружностей, 50 отрезков, 50 прямых, 150 точек = 300 фигур. */
const MEDIUM_COUNTS: BlockCounts = {
  rosette: 24,
  rings: 6,
  randomCircles: 20,
  gridLines: 10,
  randomSegments: 30,
  starLines: 20,
  randomXLines: 30,
  gridPointsSide: 10,
  randomPoints: 50,
};

/** Софт (в 10 раз меньше): 5 окружностей, 5 отрезков, 5 прямых, 15 точек = 30 фигур. */
const SOFT_COUNTS: BlockCounts = {
  rosette: 3,
  rings: 1,
  randomCircles: 1,
  gridLines: 1,
  randomSegments: 3,
  starLines: 2,
  randomXLines: 3,
  gridPointsSide: 3,
  randomPoints: 6,
};

/**
 * Хард: 5 блоков «Медиум» (250 окружностей, 250 отрезков, 250 прямых, 750 точек = 1500 фигур).
 * Центры блоков — в центре и по углам квадрата 6000×6000 мм: при приближении к одному
 * блоку остальные уходят за экран и должны отсекаться.
 */
const HARD_BLOCK_CENTERS: Point[] = [
  { x: 0, y: 0 },
  { x: -2500, y: -2500 },
  { x: 2500, y: -2500 },
  { x: -2500, y: 2500 },
  { x: 2500, y: 2500 },
];

/**
 * Генератор «случайных» чисел от 0 до 1 с фиксированным зерном (алгоритм mulberry32).
 * Одно и то же зерно — одна и та же последовательность, поэтому тестовый
 * набор при каждом пересоздании получается одинаковым.
 */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Дописывает в `shapes` один блок фигур с центром в (ox; oy).
 * `id` — общий счётчик id на весь проект, чтобы id не повторялись между блоками.
 */
function addBlock(
  shapes: Shape[],
  id: () => string,
  counts: BlockCounts,
  ox: number,
  oy: number,
  seed: number,
) {
  const random = makeRandom(seed);
  /** Случайное число в диапазоне [min, max). */
  const between = (min: number, max: number) => min + random() * (max - min);
  /** Точка относительно центра блока, координаты округлены до 0.001 мм. */
  const pt = (x: number, y: number): Point => ({ x: roundMm(ox + x), y: roundMm(oy + y) });
  /** Случайная точка внутри квадрата ±limit вокруг центра блока. */
  const randomPt = (limit: number) => pt(between(-limit, limit), between(-limit, limit));
  /** Координата i-й из n равномерно расставленных линий сетки (для n = 10: −450…450, шаг 100). */
  const gridCoord = (i: number, n: number) => -HALF + ((i + 0.5) * 2 * HALF) / n;

  // ── Окружности ──────────────────────────────────────────────────
  // «Розетка»: окружности R=150, центры на кольце R=150 вокруг центра блока.
  // Каждая проходит через центр блока и пересекает соседние.
  for (let i = 0; i < counts.rosette; i++) {
    const a = (i / counts.rosette) * 2 * Math.PI;
    shapes.push({ ...DEBUG_APPEARANCE,
      id: id(),
      type: 'circle',
      center: pt(150 * Math.cos(a), 150 * Math.sin(a)),
      radius: 150,
    });
  }
  // Концентрические окружности (R = 80, 160, …): режут всё, что внутри.
  for (let i = 0; i < counts.rings; i++) {
    shapes.push({ ...DEBUG_APPEARANCE, id: id(), type: 'circle', center: pt(0, 0), radius: 80 + i * 80 });
  }
  // Хаотичные окружности разного радиуса по всему блоку.
  for (let i = 0; i < counts.randomCircles; i++) {
    shapes.push({ ...DEBUG_APPEARANCE,
      id: id(),
      type: 'circle',
      center: randomPt(HALF - 100),
      radius: roundMm(between(20, 220)),
    });
  }

  // ── Отрезки ─────────────────────────────────────────────────────
  // Сетка: горизонтальные и вертикальные отрезки через весь блок.
  for (let i = 0; i < counts.gridLines; i++) {
    const c = gridCoord(i, counts.gridLines);
    shapes.push({ ...DEBUG_APPEARANCE, id: id(), type: 'segment', start: pt(-HALF, c), end: pt(HALF, c) });
    shapes.push({ ...DEBUG_APPEARANCE, id: id(), type: 'segment', start: pt(c, -HALF), end: pt(c, HALF) });
  }
  // Хаотичные отрезки длиной 150…700 мм под случайными углами.
  for (let i = 0; i < counts.randomSegments; i++) {
    const mid = randomPt(HALF - 150);
    const a = between(0, Math.PI);
    const half = between(75, 350);
    shapes.push({ ...DEBUG_APPEARANCE,
      id: id(),
      type: 'segment',
      start: { x: roundMm(mid.x - half * Math.cos(a)), y: roundMm(mid.y - half * Math.sin(a)) },
      end: { x: roundMm(mid.x + half * Math.cos(a)), y: roundMm(mid.y + half * Math.sin(a)) },
    });
  }

  // ── Прямые ──────────────────────────────────────────────────────
  // «Звезда»: прямые через одну точку (250; 250) от центра блока с шагом 9°.
  for (let i = 0; i < counts.starLines; i++) {
    shapes.push({ ...DEBUG_APPEARANCE, id: id(), type: 'xline', point: pt(250, 250), angle: i * 9 });
  }
  // Прямые через случайные точки под случайными углами [0°, 180°).
  for (let i = 0; i < counts.randomXLines; i++) {
    shapes.push({ ...DEBUG_APPEARANCE,
      id: id(),
      type: 'xline',
      point: randomPt(HALF),
      angle: roundMm(between(0, 180)) % 180,
    });
  }

  // ── Точки ───────────────────────────────────────────────────────
  // Точки в узлах сетки (в Медиуме совпадают с пересечениями отрезков сетки).
  for (let ix = 0; ix < counts.gridPointsSide; ix++) {
    for (let iy = 0; iy < counts.gridPointsSide; iy++) {
      shapes.push({ ...DEBUG_APPEARANCE,
        id: id(),
        type: 'point',
        p: pt(gridCoord(ix, counts.gridPointsSide), gridCoord(iy, counts.gridPointsSide)),
      });
    }
  }
  // Хаотичные точки.
  for (let i = 0; i < counts.randomPoints; i++) {
    shapes.push({ ...DEBUG_APPEARANCE, id: id(), type: 'point', p: randomPt(HALF) });
  }
}

/** Набор тестовых фигур для уровня нагрузки. Обычные циклы, без лишних копий массивов. */
function buildDebugShapes(level: DebugLevel): Shape[] {
  const shapes: Shape[] = [];
  let nextId = 1;
  const id = () => String(nextId++);

  if (level === 'soft') {
    addBlock(shapes, id, SOFT_COUNTS, 0, 0, 12345);
  } else if (level === 'medium') {
    addBlock(shapes, id, MEDIUM_COUNTS, 0, 0, 12345);
  } else {
    // У каждого блока своё зерно — блоки получаются разными.
    HARD_BLOCK_CENTERS.forEach((c, i) => addBlock(shapes, id, MEDIUM_COUNTS, c.x, c.y, 12345 + i));
  }
  return shapes;
}

/**
 * Создаёт отладочный проект нужного уровня или, если он уже есть, перезаписывает его фигуры
 * свежим тестовым набором. Возвращает id проекта.
 */
export async function createDebugProject(level: DebugLevel): Promise<string> {
  const name = DEBUG_PROJECT_NAMES[level];
  const projects = await getProjects();
  const existing = projects.find((p) => p.name === name);
  const id = existing ? existing.id : await createProject(name);
  await saveProject(id, buildDebugShapes(level));
  return id;
}
