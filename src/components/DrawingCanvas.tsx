import {
  Canvas,
  DashPathEffect,
  Group,
  Line,
  PaintStyle,
  Path,
  Picture,
  PointMode,
  Skia,
  StrokeCap,
  vec,
  type Matrix3,
  type SkFont,
  type SkPaint,
  type SkPathBuilder,
  type SkPicture,
  type SkPoint,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CANVAS_COLORS, type CanvasColors } from '@/constants/canvasTheme';
import {
  DASH_INTERVALS_PX,
  WAVY_AMPLITUDE_MM,
  WAVY_PERIOD_MM,
} from '@/constants/lineStyles';
import type { LineStyle, Shape, Tool } from '@/types/shapes';
import type { UCS } from '@/types/ucs';
import {
  angleTo,
  arcBox,
  arcEndpoints,
  arcMidAngle,
  arcSweep,
  DIM_TEXT_HEIGHT_MM,
  dimensionBox,
  dimensionLayout,
  dimensionLength,
  dimensionNormal,
  dimensionOffsetHandle,
  pointAtAngle,
  rectBox,
  rectCorners,
  roundAngle,
  type Box,
} from '@/utils/geometry';
import { hitTest, shapesInRect } from '@/utils/hitTest';
import { canIntersect } from '@/utils/intersection';
import { findSnapPoint, type SnapResult } from '@/utils/snap';
import { translateShape } from '@/utils/shapeTransform';
import { drawingToScreen, screenToDrawing, ucsToWorld } from '@/utils/ucs';
import { addWavyArc, addWavySegment } from '@/utils/wavyPath';
import {
  clampScale,
  gridStepMm,
  MIN_GRID_PX,
  PX_PER_MM,
  pxPerMm,
  roundMm,
  screenToWorld,
  snapToGridMm,
  worldToScreen,
  type Point,
  type Viewport,
} from '@/utils/viewport';

// Цвета служебных маркеров не зависят от темы; палитра чертежа приходит в props.
const COLORS = {
  pending: '#1E88E5',
  snap: '#1E88E5',
  selected: '#1E88E5',
  handle: '#1E88E5',
  handleBorder: '#FFFFFF',
  intersect: '#FF6D00',
  objectSnap: '#43A047',
  marqueeFill: 'rgba(30, 136, 229, 0.2)',
  marqueeStroke: '#1E88E5',
  crosshair: '#D32F2F',
  ucsX: '#FF5252',
  ucsY: '#00E676',
};

const RESET_DURATION_MS = 250;

// Размеры фигур в мм чертежа — масштабируются вместе с зумом, как в CAD.
const SEGMENT_WIDTH_MM = 0.2;
const POINT_RADIUS_MM = 0.5;

// Пределы размеров на экране, px: чтобы линии не исчезали при отдалении
// и не перекрывали всё при сильном приближении.
const SEGMENT_WIDTH_MIN_PX = 1;
const SEGMENT_WIDTH_MAX_PX = 6;
const POINT_RADIUS_MIN_PX = 1.5;
const POINT_RADIUS_MAX_PX = 12;

// Толщина осей на экране, px (не зависит от зума).
// Линии сетки — «волосяные» (толщина 0): Skia рисует их ровно в 1 px экрана при любом зуме.
const AXIS_WIDTH_PX = 1.5;

// «Быстрый жест»: после того как пальцы отпустили, сглаживание включается обратно
// через столько мс — чтобы между двумя быстрыми жестами картинка не мигала.
const INTERACTION_END_DELAY_MS = 100;

// Каждая какая линия сетки — основная (темнее).
const GRID_MAJOR_EVERY = 10;

// Первая точка недостроенной фигуры рисуется во столько раз крупнее обычной точки.
const PENDING_RADIUS_FACTOR = 1.5;

// На сколько пикселей палец может сдвинуться, чтобы касание ещё считалось тапом.
// Рамка, которую после зажатия растянули меньше чем на столько px, считается
// не растянутой: палец просто отпустили, и ставится первый угол (выделение в два тапа).
const TAP_MAX_DISTANCE_PX = 10;

// Удержание пальца дольше этого времени включает лупу (инструменты построения)
// или рамку выделения («Выделение»); более короткое касание — обычный тап.
const LONG_PRESS_MS = 300;

// Радиус поиска привязки вокруг пальца, px экрана.
const SNAP_RADIUS_PX = 20;
// Подсвеченная фигура рисуется толще обычной на столько px.
const HIGHLIGHT_EXTRA_PX = 2;
// Допуск поиска фигуры под пальцем при выделении, px экрана.
// Больше, чем толщина линии: палец закрывает несколько пикселей вокруг точки касания.
const HIT_TOLERANCE_PX = 12;
// Небольшой порог отличает перемещение фигуры от тапа и долгого нажатия для рамки.
const MOVE_START_DISTANCE_PX = 2;
// Толщина обводки рамки выделения, px.
const MARQUEE_STROKE_PX = 1.5;
// Маркер первого угла рамки (выделение в два тапа): длина лучей крестика и радиус кружка, px.
const MARQUEE_CORNER_ARM_PX = 10;
const MARQUEE_CORNER_DOT_PX = 3;
// Рукоятки выделенной фигуры: половина стороны квадратика и радиус «захвата» пальцем, px.
// Захват больше квадратика: палец закрывает его целиком.
const HANDLE_HALF_PX = 7;
const HANDLE_HIT_PX = 30;
const HANDLE_BORDER_PX = 1.5;
// Вторая рукоятка прямой (угол) стоит на таком расстоянии от опорной точки вдоль линии,
// в px ЭКРАНА (как в CAD): при любом зуме она рядом с опорной точкой, а не улетает за экран.
const XLINE_HANDLE_PX = 60;
// Половина размера маркера привязки (квадрат / ромб), px.
const SNAP_MARKER_HALF_PX = 6;
// Маркеры точек пересечения (инструмент «Пересечение»): радиус кружка, px.
const INTERSECT_MARKER_RADIUS_PX = 8;
// Радиус точки под пальцем, px.
const TOUCH_DOT_RADIUS_PX = 4;
// Пунктир будущей оси X при создании СК, px экрана.
const UCS_PREVIEW_DASH_PX = [8, 6];

// Лупа: радиус, расстояние от пальца до нижнего края лупы и увеличение.
const LOUPE_RADIUS_PX = 50;
const LOUPE_GAP_PX = 60;
const LOUPE_ZOOM = 2;
// Перекрестие в лупе: пустой промежуток в центре, чтобы было видно саму точку, px.
const CROSSHAIR_GAP_PX = 5;

// Запас области покрытия вокруг видимой области, в долях экрана (с каждой стороны).
// 0.5 — покрытие строится заново, если вид сдвинули больше чем на полэкрана
// или отдалили в 2 раза.
const COVER_MARGIN_SCREENS = 0.5;
// Если при приближении покрытие стало шире видимой области больше чем во столько раз
// (приблизили в 2 раза) — строим его заново, иначе в сцену попадает много невидимых фигур.
const COVER_MAX_RATIO = 4;

// Сцена (Skia Picture) записывается с толщиной линий для «ступеньки» масштаба:
// столько ступенек на каждое удвоение зума (4 — шаг ~19%, толщина ошибается не больше ~9%).
// Пока масштаб в пределах ступеньки (пан, лёгкий зум), сцена не перезаписывается.
const K_STEPS_PER_DOUBLING = 4;

// Упрощение отрисовки (LOD) включается, если в покрытии больше стольких фигур.
const LOD_MIN_SHAPES = 100;
// При LOD окружность с радиусом на экране меньше стольких px рисуется точкой.
const LOD_TINY_CIRCLE_PX = 3;
// При LOD отрезок короче стольких px на экране рисуется точкой.
const LOD_TINY_SEGMENT_PX = 1;

// Текст размеров: шрифт системный, текст мельче этого на экране (px) не рисуется — всё равно не прочесть.
const DIM_FONT_FAMILY = Platform.OS === 'ios' ? 'Helvetica' : 'sans-serif';
const DIM_TEXT_MIN_PX = 12; // текст размера на экране не мельче
const DIM_TEXT_MAX_PX = 32; // и не крупнее
const AXIS_SNAP_PX = 10; // «прилипание» точки размера к осям X и Y, px экрана

// Единичная матрица 3×3: «ничего не менять».
const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const NO_TRANSFORM: Transforms3d = [];

/** Команды, которые экран может вызвать у холста. */
export type DrawingCanvasHandle = {
  resetView: () => void;
  /** Убрать первый угол рамки (выделение в два тапа), если он поставлен. Виньетка гаснет. */
  cancelMarquee: () => void;
};

/**
 * Режим изменения выделенной фигуры: 'none' — рукояток нет (обычное выделение),
 * 'drag' — у единственной выделенной фигуры видны рукоятки, их тянут пальцем.
 */
export type EditMode = 'none' | 'drag';

type Props = {
  ref?: Ref<DrawingCanvasHandle>;
  tool: Tool;
  shapes: Shape[];
  canvasColors: CanvasColors;
  activeUCS: UCS;
  ucsList: UCS[];
  ucsCreationActive: boolean;
  ucsOrigin: Point | null;
  onUcsTap: (world: Point) => void;
  /**
   * Первая точка фигуры (начало отрезка, центр окружности, точка прямой, угол прямоугольника,
   * начало дуги), если фигура ещё не достроена.
   */
  pendingStart: Point | null;
  /** Вторая точка дуги (точка на дуге), если третья ещё не поставлена. */
  pendingMiddle: Point | null;
  /** id выделенных фигур (рисуются синим и толще). Пустой массив — ничего не выделено. */
  selectedShapeIds: string[];
  /**
   * 'drag' — у единственной выделенной фигуры рисуются рукоятки и их можно тянуть.
   * В этом режиме тап и рамка выключены (выделение не меняется), один палец мимо
   * рукоятки двигает вид.
   */
  editMode: EditMode;
  /**
   * Привязка к сетке (шаг 10 мм): тап, лупа и рукоятки ставят точки в узлы сетки.
   * Включена — привязки к объектам при перетаскивании рукояток нет.
   */
  snapToGrid: boolean;
  /** Орто-режим: отрезок и прямая по двум точкам строятся строго по осям X или Y. */
  isOrthoEnabled: boolean;
  /**
   * Точка, поставленная пальцем: короткий тап или отпускание после долгого нажатия с лупой.
   * Координаты — в мм чертежа, округлены до 0.001. Не вызывается при инструменте «Выделение».
   * hitSegment — только при инструменте «Размер» и первом тапе: отрезок под пальцем (или null).
   */
  onTap: (world: Point, hitSegment?: Shape | null) => void;
  /**
   * Новое выделение при инструменте «Выделение»:
   * тап по фигуре — [её id], тап по пустому месту — [], рамка — все фигуры, которые она задела.
   */
  onSelectShapes: (ids: string[]) => void;
  /**
   * true, пока идёт выделение рамкой: палец зажат и тянет рамку или поставлен первый угол
   * (выделение в два тапа). Холст сам записывает сюда значение (в UI-потоке),
   * а экран по нему показывает свечение по краям (SelectionVignette) — без перерисовки React.
   */
  marqueeActive: SharedValue<boolean>;
  /**
   * Поставлен / убран первый угол рамки (выделение в два тапа).
   * Экран по нему показывает подсказку «коснитесь второго угла» с кнопкой «Отмена».
   */
  onMarqueePendingChange: (pending: boolean) => void;
  /**
   * Фигуру изменили перетаскиванием за рукоятку или целиком и отпустили палец.
   * Новая фигура — с тем же id, координаты округлены до 0.001 мм.
   * Вызывается один раз в конце жеста и только если фигура действительно изменилась.
   */
  onUpdateShape: (shape: Shape) => void;
  /** Точки, которые инструмент «Пересечение» показывает яркими кружками (мм чертежа). */
  intersectMarkers: Point[];
  /**
   * Тап при инструменте «Пересечение»: markerIndex ≥ 0 — тап по маркеру (индекс в intersectMarkers),
   * иначе shape — фигура под пальцем (отрезок, окружность, дуга, прямоугольник, прямая) или null.
   */
  onIntersectTap: (shape: Shape | null, markerIndex: number) => void;
  /** Тап при инструменте «Разделить»: отрезок, окружность или дуга под пальцем (либо null). */
  onDivideTap: (shape: Shape | null) => void;
};

/** Рамка выделения, px экрана: угол, где палец начал движение (x0, y0), и где он сейчас (x1, y1). */
type Marquee = { x0: number; y0: number; x1: number; y1: number };

/**
 * За какую рукоятку взялись: её номер (см. shapeHandles) и сдвиг рукоятки от пальца, мм.
 * Сдвиг нужен, чтобы рукоятка не «прыгала» под палец, если взяли её не точно по центру.
 */
type Grab = { index: number; dx: number; dy: number };

/** Как записывать фигуры в сцену: цвет, прибавка к толщине и использование цвета фигуры. */
type SceneStyle = {
  color: string;
  extraWidthPx: number;
  pointFactor: number;
  respectShapeColor: boolean;
};

const SELECTED_STYLE: SceneStyle = {
  color: COLORS.selected,
  extraWidthPx: HIGHLIGHT_EXTRA_PX,
  pointFactor: PENDING_RADIUS_FACTOR,
  respectShapeColor: false,
};

/** Состояние долгого нажатия (пока на экране лупа). */
type TouchState = {
  finger: Point; // где палец, px экрана
  target: Point; // куда встанет точка: точка привязки или точка под пальцем, мм
  snap: SnapResult | null;
};

/**
 * Область покрытия — прямоугольник чертежа (мм), чуть больше видимой области.
 * В пути попадают только фигуры, которые её задевают (отсечение невидимого),
 * а бесконечные прямые обрезаются по её краям. Пока вид остаётся внутри покрытия,
 * пути не пересоздаются — их двигает матрица группы.
 */
type Cover = {
  x0: number; // левый край, мм
  y0: number; // нижний край, мм
  x1: number; // правый край, мм
  y1: number; // верхний край, мм
};

const EMPTY_COVER: Cover = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * Сколько px экрана в 1 мм, но никогда не 0, не NaN и не бесконечность:
 * на это число делятся толщины линий.
 */
function safeK(vp: Viewport): number {
  'worklet';
  const k = pxPerMm(vp);
  return k > 0 && Number.isFinite(k) ? k : 1;
}

/**
 * Размер в px экрана -> размер внутри масштабируемой группы (делим на k).
 * Если получилось не число — возвращаем 1, чтобы Skia не получила NaN.
 */
function toLocal(px: number, k: number): number {
  'worklet';
  const w = px / k;
  return w > 0 && Number.isFinite(w) ? w : 1;
}

/** Видимая область в локальных мм активной СК; при повороте учитываются все 4 угла. */
function visibleRect(vp: Viewport, ucs: UCS) {
  'worklet';
  const corners = [
    screenToDrawing(vp, { x: 0, y: 0 }, ucs),
    screenToDrawing(vp, { x: vp.width, y: 0 }, ucs),
    screenToDrawing(vp, { x: 0, y: vp.height }, ucs),
    screenToDrawing(vp, { x: vp.width, y: vp.height }, ucs),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Новая область покрытия вокруг текущего вида. */
function makeCover(vp: Viewport, ucs: UCS): Cover {
  'worklet';
  const v = visibleRect(vp, ucs);
  const mx = (v.x1 - v.x0) * COVER_MARGIN_SCREENS;
  const my = (v.y1 - v.y0) * COVER_MARGIN_SCREENS;
  return { x0: v.x0 - mx, y0: v.y0 - my, x1: v.x1 + mx, y1: v.y1 + my };
}

/**
 * Нужно ли строить покрытие заново:
 * - видимая область вышла за край покрытия (сдвинули вид больше чем на экран или отдалили);
 * - покрытие стало намного больше видимой области (сильно приблизили).
 */
function needsNewCover(c: Cover, vp: Viewport, ucs: UCS): boolean {
  'worklet';
  if (vp.width <= 0 || vp.height <= 0) return false;
  const v = visibleRect(vp, ucs);
  // Вид посчитался в NaN / бесконечность — покрытие не трогаем.
  if (![v.x0, v.y0, v.x1, v.y1].every(Number.isFinite)) return false;
  if (v.x0 < c.x0 || v.x1 > c.x1 || v.y0 < c.y0 || v.y1 > c.y1) return true;
  return c.x1 - c.x0 > (v.x1 - v.x0) * COVER_MAX_RATIO;
}

/**
 * Кисть для «волосяных» линий: толщина 0 — ровно 1 px экрана при любой матрице.
 * Объявлена ВЫШЕ recordGridTile: worklet-функция видит только те функции, что объявлены
 * до неё (иначе в UI-потоке «undefined is not a function», сетка пустая — было до хотфикса 0.0.0.0029).
 */
function hairlinePaint(color: string, antiAlias: boolean): SkPaint {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(antiAlias);
  paint.setColor(Skia.Color(color));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(0);
  return paint;
}

/**
 * «Плитка» сетки в единицах шага сетки: линии стоят в точках ..., -1, 0, 1, 2, ...
 * Зависит ТОЛЬКО от размера холста, поэтому строится один раз (и при повороте экрана).
 *
 * Сетка повторяется через каждые 10 шагов (основная линия — каждая 10-я), поэтому
 * одну и ту же плитку можно сдвигать и растягивать матрицей: сдвиг берётся по остатку
 * от деления на 10 шагов, а растяжение — это размер шага в px (от 8 до 80 px).
 * Линий хватает, чтобы закрыть экран даже при самом мелком шаге (MIN_GRID_PX).
 *
 * Плитка записывается в Skia Picture отдельными командами drawLine, а не одним большим
 * путём: путь из сотен линий Skia разбивает на треугольники процессором, а отдельные
 * линии рисует быстрым готовым способом на видеокарте.
 *
 * Линии «волосяные» (толщина 0) — 1 px экрана при любом растяжении матрицей,
 * поэтому плитку не нужно перезаписывать при зуме.
 * antiAlias = false — без сглаживания (для «быстрого жеста»).
 */
function recordGridTile(
  width: number,
  height: number,
  antiAlias: boolean,
  gridMinor: string,
  gridMajor: string,
): SkPicture {
  'worklet';
  // Симметричная плитка перекрывает экран даже после поворота СК.
  const extent = Math.ceil(Math.hypot(width, height) / (2 * MIN_GRID_PX)) + GRID_MAJOR_EVERY * 2;
  const from = -extent;
  const nx = extent;
  const ny = extent;

  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(from, from, nx - from, ny - from));
  if (!(width > 0) || !(height > 0)) return recorder.finishRecordingAsPicture();

  // Сначала мелкие линии, потом основные — чтобы на пересечениях была видна основная.
  for (const major of [false, true]) {
    const paint = hairlinePaint(major ? gridMajor : gridMinor, antiAlias);
    for (let i = from; i <= nx; i++) {
      if ((i % GRID_MAJOR_EVERY === 0) !== major) continue;
      canvas.drawLine(i, from, i, ny, paint);
    }
    for (let j = from; j <= ny; j++) {
      if ((j % GRID_MAJOR_EVERY === 0) !== major) continue;
      canvas.drawLine(from, j, nx, j, paint);
    }
  }
  return recorder.finishRecordingAsPicture();
}

/**
 * Отрезки, окружности, прямоугольники и дуги, в мм чертежа (для подсветки привязки).
 * От вида не зависят — строятся один раз.
 * Угол дуги в Skia растёт «по часовой» на экране, но внутри матрицы чертежа ось Y
 * перевёрнута — там это «против часовой», как и хранится дуга.
 */
function addOutlines(path: SkPathBuilder, shapes: Shape[]) {
  'worklet';
  for (const s of shapes) {
    if (s.type === 'segment') {
      path.moveTo(s.start.x, s.start.y);
      path.lineTo(s.end.x, s.end.y);
    } else if (s.type === 'circle') {
      path.addCircle(s.center.x, s.center.y, s.radius);
    } else if (s.type === 'rect') {
      const b = rectBox(s.p1, s.p2);
      path.addRect(Skia.XYWHRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0));
    } else if (s.type === 'arc') {
      const r = s.radius;
      path.addArc(
        Skia.XYWHRect(s.center.x - r, s.center.y - r, r * 2, r * 2),
        s.startAngle,
        arcSweep(s.startAngle, s.endAngle),
      );
    }
  }
}

/**
 * Какая часть линии p + d·t (t от t0 до t1) лежит внутри прямоугольника c.
 * Возвращает [tMin, tMax] или null, если линия прямоугольник не задевает.
 * Для отрезка t0 = 0, t1 = 1; для бесконечной прямой — от −∞ до +∞.
 */
function clipLine(
  p: Point,
  dx: number,
  dy: number,
  t0: number,
  t1: number,
  c: Cover,
): [number, number] | null {
  'worklet';
  let tMin = t0;
  let tMax = t1;
  if (Math.abs(dx) < 1e-12) {
    if (p.x < c.x0 || p.x > c.x1) return null;
  } else {
    const a = (c.x0 - p.x) / dx;
    const b = (c.x1 - p.x) / dx;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  }
  if (Math.abs(dy) < 1e-12) {
    if (p.y < c.y0 || p.y > c.y1) return null;
  } else {
    const a = (c.y0 - p.y) / dy;
    const b = (c.y1 - p.y) / dy;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  }
  return tMin <= tMax ? [tMin, tMax] : null;
}

/**
 * Видна ли окружность (сама линия, а не круг) в прямоугольнике c.
 * Не видна в двух случаях: окружность целиком снаружи прямоугольника
 * или прямоугольник целиком внутри окружности (приблизились к середине большого круга).
 */
function circleTouchesRect(center: Point, r: number, c: Cover): boolean {
  'worklet';
  // Ближайшая к центру точка прямоугольника.
  const nx = Math.min(c.x1, Math.max(c.x0, center.x));
  const ny = Math.min(c.y1, Math.max(c.y0, center.y));
  if (Math.hypot(center.x - nx, center.y - ny) > r) return false;
  // Самый дальний от центра угол прямоугольника.
  const fx = Math.max(Math.abs(center.x - c.x0), Math.abs(center.x - c.x1));
  const fy = Math.max(Math.abs(center.y - c.y0), Math.abs(center.y - c.y1));
  return Math.hypot(fx, fy) >= r;
}

/** Пересекаются ли габарит b и прямоугольник c (касание краями тоже считается). */
function boxTouchesRect(b: Box, c: Cover): boolean {
  'worklet';
  return b.x0 <= c.x1 && b.x1 >= c.x0 && b.y0 <= c.y1 && b.y1 >= c.y0;
}

/**
 * Видны ли стороны прямоугольника b в прямоугольнике c. Не видны, если b целиком снаружи c
 * или c целиком внутри b (приблизились к середине большого прямоугольника).
 */
function rectOutlineTouchesRect(b: Box, c: Cover): boolean {
  'worklet';
  if (!boxTouchesRect(b, c)) return false;
  return !(c.x0 > b.x0 && c.x1 < b.x1 && c.y0 > b.y0 && c.y1 < b.y1);
}

/**
 * Отсечение невидимого: только фигуры, которые задевают область покрытия c.
 * - точка — внутри прямоугольника;
 * - отрезок — хотя бы его часть внутри (конец внутри или пересекает край);
 * - окружность — её линия проходит через прямоугольник;
 * - прямоугольник — его стороны проходят через область (не целиком снаружи и не вокруг неё);
 * - дуга — линия её окружности проходит через область И габарит дуги её задевает
 *   (с небольшим запасом: иногда в сцену попадает невидимая дуга, но видимая не теряется);
 * - прямая — пересекает прямоугольник;
 * - размер — габарит его точек и размерной линии задевает область (текст не учитывается).
 */
function getVisibleShapes(shapes: Shape[], c: Cover): Shape[] {
  'worklet';
  if (c.x1 <= c.x0 || c.y1 <= c.y0) return [];
  return shapes.filter((s) => {
    switch (s.type) {
      case 'point':
        return s.p.x >= c.x0 && s.p.x <= c.x1 && s.p.y >= c.y0 && s.p.y <= c.y1;
      case 'segment': {
        const dx = s.end.x - s.start.x;
        const dy = s.end.y - s.start.y;
        return clipLine(s.start, dx, dy, 0, 1, c) !== null;
      }
      case 'circle':
        return circleTouchesRect(s.center, s.radius, c);
      case 'rect':
        return rectOutlineTouchesRect(rectBox(s.p1, s.p2), c);
      case 'arc':
        return circleTouchesRect(s.center, s.radius, c) && boxTouchesRect(arcBox(s), c);
      case 'xline': {
        const rad = (s.angle * Math.PI) / 180;
        return clipLine(s.point, Math.cos(rad), Math.sin(rad), -Infinity, Infinity, c) !== null;
      }
      case 'dimension':
        return boxTouchesRect(dimensionBox(s), c);
    }
  });
}

/**
 * Бесконечные прямые, обрезанные по области покрытия, в мм чертежа.
 * Прямую нельзя нарисовать «бесконечной»: берём только тот кусок, который
 * попадает в покрытие (а оно всегда шире экрана). Так координаты остаются
 * небольшими и Skia не теряет точность при сильном приближении.
 */
function addXLines(path: SkPathBuilder, shapes: Shape[], c: Cover) {
  'worklet';
  if (c.x1 <= c.x0 || c.y1 <= c.y0) return;
  for (const s of shapes) {
    if (s.type !== 'xline') continue;
    const rad = (s.angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const p = s.point;
    const t = clipLine(p, ux, uy, -Infinity, Infinity, c);
    if (!t) continue; // прямая не проходит через покрытие
    path.moveTo(p.x + ux * t[0], p.y + uy * t[0]);
    path.lineTo(p.x + ux * t[1], p.y + uy * t[1]);
  }
}

/**
 * Точки, в мм чертежа. Каждая точка — линия нулевой длины: при круглом конце
 * линии (strokeCap="round") Skia рисует её кружком диаметром strokeWidth.
 */
function addPoints(path: SkPathBuilder, shapes: Shape[]) {
  'worklet';
  for (const s of shapes) {
    if (s.type !== 'point') continue;
    path.moveTo(s.p.x, s.p.y);
    path.lineTo(s.p.x, s.p.y);
  }
}

/** Число value, зажатое в пределы [min, max]. */
function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Толщина линий (отрезки, окружности, прямые) на экране, px. k — сколько px в 1 мм. */
function segmentWidthPx(k: number): number {
  'worklet';
  return clamp(SEGMENT_WIDTH_MM * k, SEGMENT_WIDTH_MIN_PX, SEGMENT_WIDTH_MAX_PX);
}

/** Радиус точек на экране, px. k — сколько px в 1 мм. */
function pointRadiusPx(k: number): number {
  'worklet';
  return clamp(POINT_RADIUS_MM * k, POINT_RADIUS_MIN_PX, POINT_RADIUS_MAX_PX);
}

/**
 * Номер «ступеньки» масштаба: k округляется до ближайшей степени 2^(1/K_STEPS_PER_DOUBLING).
 * Целое число — его удобно сравнивать, чтобы понять, сменилась ли ступенька.
 */
function kLevel(k: number): number {
  'worklet';
  return Math.round(Math.log2(k) * K_STEPS_PER_DOUBLING);
}

/** k (px в 1 мм) для ступеньки масштаба. */
function levelToK(level: number): number {
  'worklet';
  return Math.pow(2, level / K_STEPS_PER_DOUBLING);
}

/**
 * Кисть для линий в мм чертежа: цвет color, толщина width (уже поделена на k, 0 — «волосяная»),
 * конец линии cap, сглаживание antiAlias.
 */
function strokePaint(color: string, width: number, cap: StrokeCap, antiAlias: boolean): SkPaint {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(antiAlias);
  paint.setColor(Skia.Color(color));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(cap);
  return paint;
}

function lineWidthFactor(lineStyle: LineStyle): number {
  'worklet';
  return lineStyle === 'solid_thick' || lineStyle === 'dash_dot_thick' ? 2 : 1;
}

function lineWidthFor(k: number, extraWidthPx: number, lineStyle: LineStyle): number {
  'worklet';
  const widthPx = segmentWidthPx(k) * lineWidthFactor(lineStyle) + extraWidthPx;
  return widthPx <= SEGMENT_WIDTH_MIN_PX ? 0 : toLocal(widthPx, k);
}

/** ГОСТовские штрихи задаются в px экрана и переводятся в локальные мм. */
function applyLinePathEffect(paint: SkPaint, lineStyle: LineStyle, k: number) {
  'worklet';
  const intervals = DASH_INTERVALS_PX[lineStyle];
  if (intervals) paint.setPathEffect(Skia.PathEffect.MakeDash(intervals.map((v) => toLocal(v, k)), 0));
}

function cachedStrokePaint(
  cache: Record<string, SkPaint>,
  color: string,
  width: number,
  cap: StrokeCap,
  antiAlias: boolean,
  lineStyle: LineStyle,
  k: number,
): SkPaint {
  'worklet';
  const key = `${color}|${width}|${cap}|${antiAlias}|${lineStyle}`;
  const existing = cache[key];
  if (existing) return existing;
  const paint = strokePaint(color, width, cap, antiAlias);
  applyLinePathEffect(paint, lineStyle, k);
  cache[key] = paint;
  return paint;
}

function shapeSceneColor(s: Shape, style: SceneStyle): string {
  'worklet';
  return style.respectShapeColor && s.autoColor === false && s.color ? s.color : style.color;
}

type ScenePointGroup = { color: string; points: SkPoint[] };

function addScenePoint(groups: ScenePointGroup[], color: string, p: Point) {
  'worklet';
  let group = groups.find((g) => g.color === color);
  if (!group) {
    group = { color, points: [] };
    groups.push(group);
  }
  group.points.push(vec(p.x, p.y));
}

/** Пустая сцена — безопасное значение, если что-то пошло не так. */
function emptyPicture(): SkPicture {
  'worklet';
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
}

/**
 * Шрифт для чисел размеров: высота sizeMm в мм чертежа.
 * null — шрифт не нашёлся (размеры тогда рисуются без текста).
 */
function makeDimFont(sizeMm: number): SkFont | null {
  'worklet';
  try {
    const typeface = Skia.FontMgr.System().matchFamilyStyle(DIM_FONT_FAMILY, {
      weight: 400,
      width: 5,
      slant: 0,
    });
    return Skia.Font(typeface, sizeMm);
  } catch (e) {
    console.warn('[DrawingCanvas] font:', e);
    return null;
  }
}

/**
 * Записывает видимые фигуры в одну сцену Skia (Picture), в мм чертежа.
 *
 * Почему не один общий путь: путь из сотен пересекающихся линий и окружностей Skia
 * не умеет быстро рисовать на видеокарте и растеризует его процессором — целиком,
 * на каждом кадре пана. Отдельные простые команды (drawCircle, drawLine, drawPoints)
 * Skia рисует быстрыми готовыми способами, а то, что за экраном, сразу пропускает.
 *
 * Толщины записываются под ступеньку масштаба k, поэтому сцену нужно перезаписать
 * только при смене ступеньки, покрытия или списка фигур.
 *
 * LOD (упрощение): если фигур больше LOD_MIN_SHAPES, крошечные окружности
 * и отрезки рисуются точками.
 *
 * Если толщина линий на экране упёрлась в минимум (1 px, сильное отдаление), линии
 * записываются «волосяными» (толщина 0): на вид то же самое, но видеокарта рисует их
 * самым быстрым способом. antiAlias = false — без сглаживания (для «быстрого жеста»).
 *
 * style — цвет и толщина: обычные фигуры или выделенная (синяя и толще).
 * Передаётся всегда явно: значение по умолчанию у параметра worklet-функции
 * не переносится в UI-поток (была ошибка «Property 'NORMAL_STYLE' doesn't exist»).
 */
function recordShapes(
  shapes: Shape[],
  c: Cover,
  k: number,
  antiAlias: boolean,
  style: SceneStyle,
): SkPicture {
  'worklet';
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0));
  if (c.x1 <= c.x0 || c.y1 <= c.y0) return recorder.finishRecordingAsPicture();

  const strokeCache: Record<string, SkPaint> = {};
  const textCache: Record<string, SkPaint> = {};
  const pointDiameter = toLocal(pointRadiusPx(k) * 2 * style.pointFactor, k);
  // При обычном зуме волна растягивается вместе с чертежом. При сильном отдалении
  // период и амплитуда не даём уменьшить до невидимого шума (и не строим миллионы точек).
  const wavyAmplitudeMm = Math.max(WAVY_AMPLITUDE_MM, 3 / k);
  const wavyPeriodMm = Math.max(WAVY_PERIOD_MM, 24 / k);

  const lod = shapes.length > LOD_MIN_SHAPES;
  const tinyCircleMm = LOD_TINY_CIRCLE_PX / k;
  const tinySegmentMm = LOD_TINY_SEGMENT_PX / k;
  // Точки группируются по цвету: одна команда drawPoints на каждый цвет.
  const pointGroups: ScenePointGroup[] = [];

  // Текст размеров: размер на экране = DIM_TEXT_HEIGHT_MM · k, зажатый в [MIN, MAX] px;
  // в мм чертежа — делим на k. Шрифт создаётся, только если на сцене есть размер.
  const dimTextPx = Math.min(DIM_TEXT_MAX_PX, Math.max(DIM_TEXT_MIN_PX, DIM_TEXT_HEIGHT_MM * k));
  const dimTextMm = dimTextPx / k;
  const dimFont = shapes.some((s) => s.type === 'dimension') ? makeDimFont(dimTextMm) : null;

  for (const s of shapes) {
    const lineStyle = s.lineStyle ?? 'solid_thin';
    const color = shapeSceneColor(s, style);
    const width = lineWidthFor(k, style.extraWidthPx, lineStyle);
    const baseCap = s.type === 'dimension' || s.type === 'xline' ? StrokeCap.Butt : StrokeCap.Round;
    const cap = lineStyle === 'open_dotted' ? StrokeCap.Round : baseCap;
    const linePaint = cachedStrokePaint(strokeCache, color, width, cap, antiAlias, lineStyle, k);
    if (s.type === 'dimension') {
      const layout = dimensionLayout(s);
      if (!layout) continue;
      if (lineStyle === 'wavy') {
        const path = Skia.PathBuilder.Make();
        for (const [a, b] of layout.lines) {
          addWavySegment(path, a, b, wavyAmplitudeMm, wavyPeriodMm);
        }
        canvas.drawPath(path.build(), linePaint);
      } else {
        for (const [a, b] of layout.lines) canvas.drawLine(a.x, a.y, b.x, b.y, linePaint);
      }
      let textPaint = textCache[color];
      if (!textPaint) {
        textPaint = Skia.Paint();
        textPaint.setAntiAlias(antiAlias);
        textPaint.setColor(Skia.Color(color));
        textCache[color] = textPaint;
      }
      const t = layout.text;
      const w = dimFont ? dimFont.measureText(t.value).width : 0;
      // Текст не рисуется, если размерная линия на экране короче него (иначе каша).
      if (dimFont && dimensionLength(s) * k >= w * k) {
        // Текст рисуется в повёрнутой и «перевёрнутой по Y» системе (внутри матрицы ось Y
        // смотрит вверх, а буквы Skia растут вниз), центр основания — над серединой линии
        // на расстоянии 0.3 высоты шрифта (в layout зазор посчитан под DIM_TEXT_HEIGHT_MM).
        const rad = (t.angle * Math.PI) / 180;
        const lift = dimTextMm * 0.3;
        canvas.save();
        canvas.translate(
          (layout.a.x + layout.b.x) / 2 - Math.sin(rad) * lift,
          (layout.a.y + layout.b.y) / 2 + Math.cos(rad) * lift,
        );
        canvas.rotate(t.angle, 0, 0);
        canvas.scale(1, -1);
        canvas.drawText(t.value, -w / 2, 0, textPaint, dimFont);
        canvas.restore();
      }
    } else if (s.type === 'point') {
      addScenePoint(pointGroups, color, s.p);
    } else if (s.type === 'segment') {
      const len = Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y);
      if (lod && len < tinySegmentMm) {
        addScenePoint(pointGroups, color, {
          x: (s.start.x + s.end.x) / 2,
          y: (s.start.y + s.end.y) / 2,
        });
      } else if (lineStyle === 'wavy') {
        const path = Skia.PathBuilder.Make();
        addWavySegment(path, s.start, s.end, wavyAmplitudeMm, wavyPeriodMm);
        canvas.drawPath(path.build(), linePaint);
      } else {
        canvas.drawLine(s.start.x, s.start.y, s.end.x, s.end.y, linePaint);
      }
    } else if (s.type === 'circle') {
      if (lod && s.radius < tinyCircleMm) {
        addScenePoint(pointGroups, color, s.center);
      } else if (lineStyle === 'wavy') {
        const path = Skia.PathBuilder.Make();
        addWavyArc(path, s.center, s.radius, 0, 360, wavyAmplitudeMm, wavyPeriodMm, true);
        canvas.drawPath(path.build(), linePaint);
      } else {
        canvas.drawCircle(s.center.x, s.center.y, s.radius, linePaint);
      }
    } else if (s.type === 'rect') {
      const b = rectBox(s.p1, s.p2);
      if (lod && Math.max(b.x1 - b.x0, b.y1 - b.y0) < tinySegmentMm) {
        addScenePoint(pointGroups, color, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
      } else if (lineStyle === 'wavy') {
        const corners = rectCorners(s.p1, s.p2);
        const path = Skia.PathBuilder.Make();
        for (let i = 0; i < corners.length; i++) {
          addWavySegment(
            path,
            corners[i],
            corners[(i + 1) % corners.length],
            wavyAmplitudeMm,
            wavyPeriodMm,
          );
        }
        canvas.drawPath(path.build(), linePaint);
      } else {
        canvas.drawRect(Skia.XYWHRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0), linePaint);
      }
    } else if (s.type === 'arc') {
      if (lod && s.radius < tinyCircleMm) {
        addScenePoint(pointGroups, color, s.center);
      } else if (lineStyle === 'wavy') {
        const path = Skia.PathBuilder.Make();
        addWavyArc(
          path,
          s.center,
          s.radius,
          s.startAngle,
          arcSweep(s.startAngle, s.endAngle),
          wavyAmplitudeMm,
          wavyPeriodMm,
          false,
        );
        canvas.drawPath(path.build(), linePaint);
      } else {
        // Угол в Skia растёт к оси +Y. Внутри матрицы чертежа ось Y смотрит вверх,
        // поэтому положительный угол — «против часовой», как и хранится дуга (см. addOutlines).
        const r = s.radius;
        canvas.drawArc(
          Skia.XYWHRect(s.center.x - r, s.center.y - r, r * 2, r * 2),
          s.startAngle,
          arcSweep(s.startAngle, s.endAngle),
          false,
          linePaint,
        );
      }
    } else if (s.type === 'xline') {
      // Бесконечная прямая — только кусок внутри покрытия (см. addXLines).
      const rad = (s.angle * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const p = s.point;
      const t = clipLine(p, ux, uy, -Infinity, Infinity, c);
      if (!t) continue;
      const a = { x: p.x + ux * t[0], y: p.y + uy * t[0] };
      const b = { x: p.x + ux * t[1], y: p.y + uy * t[1] };
      if (lineStyle === 'wavy') {
        const path = Skia.PathBuilder.Make();
        addWavySegment(path, a, b, wavyAmplitudeMm, wavyPeriodMm);
        canvas.drawPath(path.build(), linePaint);
      } else {
        canvas.drawLine(a.x, a.y, b.x, b.y, linePaint);
      }
    }
  }

  for (const group of pointGroups) {
    const paint = strokePaint(group.color, pointDiameter, StrokeCap.Round, antiAlias);
    canvas.drawPoints(PointMode.Points, group.points, paint);
  }
  return recorder.finishRecordingAsPicture();
}

/**
 * Рукоятки фигуры, мм чертежа. Номер рукоятки — её место в массиве:
 * - точка: [точка];
 * - отрезок: [начало, конец];
 * - окружность: [центр, точка на правом краю] — вторая меняет радиус;
 * - прямая: [опорная точка, точка в XLINE_HANDLE_PX px экрана вдоль линии] — вторая меняет угол;
 * - прямоугольник: 4 угла [p1, (p2.x; p1.y), p2, (p1.x; p2.y)] — противоположный угол стоит на месте;
 * - дуга: [центр, начало, конец, середина] — центр двигает дугу, начало и конец меняют углы,
 *   середина — радиус;
 * - размер: [p1, p2, середина размерной линии] — третья меняет offset.
 * k — сколько px экрана в 1 мм (нужно только прямой: её вторая рукоятка стоит в px, а не в мм).
 */
function shapeHandles(s: Shape, k: number): Point[] {
  'worklet';
  switch (s.type) {
    case 'point':
      return [s.p];
    case 'segment':
      return [s.start, s.end];
    case 'circle':
      return [s.center, { x: s.center.x + s.radius, y: s.center.y }];
    case 'xline': {
      const rad = (s.angle * Math.PI) / 180;
      const len = XLINE_HANDLE_PX / k; // 60 px экрана -> мм
      return [s.point, { x: s.point.x + Math.cos(rad) * len, y: s.point.y + Math.sin(rad) * len }];
    }
    case 'rect':
      return rectCorners(s.p1, s.p2);
    case 'arc': {
      const [a, b] = arcEndpoints(s);
      return [s.center, a, b, pointAtAngle(s.center, s.radius, arcMidAngle(s))];
    }
    case 'dimension':
      return [s.p1, s.p2, dimensionOffsetHandle(s)];
  }
}

/**
 * Фигура s, у которой рукоятку index перенесли в точку target (мм, уже округлена).
 * null — так фигуру не построить (отрезок нулевой длины, радиус 0, угол не определён):
 * тогда остаётся предыдущее положение.
 * Угол прямой здесь не приводится к [0°, 180°): пока тянут, рукоятка остаётся
 * с той стороны, куда ведут палец (см. finishDraggedShape).
 */
function moveHandle(s: Shape, index: number, target: Point): Shape | null {
  'worklet';
  switch (s.type) {
    case 'point':
      return { ...s, p: target };
    case 'segment': {
      const start = index === 0 ? target : s.start;
      const end = index === 0 ? s.end : target;
      if (start.x === end.x && start.y === end.y) return null;
      return { ...s, start, end };
    }
    case 'circle': {
      // Центр двигается вместе с окружностью, радиус не меняется.
      if (index === 0) return { ...s, center: target };
      const radius = roundMm(Math.hypot(target.x - s.center.x, target.y - s.center.y));
      return radius > 0 ? { ...s, radius } : null;
    }
    case 'xline': {
      // Опорная точка двигает прямую параллельно, угол не меняется.
      if (index === 0) return { ...s, point: target };
      // Рукоятка угла: прямая поворачивается вокруг опорной точки и смотрит на палец.
      const dx = target.x - s.point.x;
      const dy = target.y - s.point.y;
      if (dx === 0 && dy === 0) return null;
      return { ...s, angle: roundMm((Math.atan2(dy, dx) * 180) / Math.PI) };
    }
    case 'rect': {
      // Угол уходит за пальцем, противоположный (index + 2) стоит на месте.
      // Углы 1 и 3 «собраны» из координат p1 и p2 (см. rectCorners).
      let p1 = s.p1;
      let p2 = s.p2;
      if (index === 0) p1 = target;
      else if (index === 2) p2 = target;
      else if (index === 1) {
        p1 = { x: p1.x, y: target.y };
        p2 = { x: target.x, y: p2.y };
      } else {
        p1 = { x: target.x, y: p1.y };
        p2 = { x: p2.x, y: target.y };
      }
      // Нулевая ширина или высота — такой прямоугольник не строим.
      if (p1.x === p2.x || p1.y === p2.y) return null;
      return { ...s, p1, p2 };
    }
    case 'arc': {
      // Центр двигает дугу целиком: радиус и углы не меняются.
      if (index === 0) return { ...s, center: target };
      if (target.x === s.center.x && target.y === s.center.y) return null;
      // Середина меняет радиус, углы остаются.
      if (index === 3) {
        const radius = roundMm(Math.hypot(target.x - s.center.x, target.y - s.center.y));
        return radius > 0 ? { ...s, radius } : null;
      }
      // Начало (1) или конец (2): угол — направление из центра на палец, радиус не меняется.
      const angle = roundAngle(angleTo(s.center, target));
      const startAngle = index === 1 ? angle : s.startAngle;
      const endAngle = index === 2 ? angle : s.endAngle;
      if (startAngle === endAngle) return null;
      return { ...s, startAngle, endAngle };
    }
    case 'dimension': {
      // Концы p1 и p2 переносятся за пальцем (смещение размерной линии не меняется).
      if (index === 0 || index === 1) {
        const p1 = index === 0 ? target : s.p1;
        const p2 = index === 0 ? s.p2 : target;
        if (p1.x === p2.x && p1.y === p2.y) return null;
        return { ...s, p1, p2 };
      }
      // Рукоятка размерной линии: смещение — расстояние от p1–p2 до пальца вдоль нормали.
      const n = dimensionNormal(s);
      if (!n) return null;
      return { ...s, offset: roundMm((target.x - s.p1.x) * n.x + (target.y - s.p1.y) * n.y) };
    }
  }
}

/**
 * Фигура после перетаскивания — в том виде, в каком её сохраняет «Изменить»:
 * угол прямой приведён к [0°, 180°) (у прямой нет направления: 30° и 210° — одна линия).
 */
function finishDraggedShape(s: Shape): Shape {
  'worklet';
  if (s.type !== 'xline') return s;
  const a = ((s.angle % 180) + 180) % 180;
  return { ...s, angle: roundMm(a) % 180 };
}

/** Фигура, к которой сейчас привязались (массив из 0 или 1 элемента). */
function snappedShapes(t: TouchState | null, shapes: Shape[]): Shape[] {
  'worklet';
  if (!t || !t.snap) return [];
  const id = t.snap.shapeId;
  return shapes.filter((s) => s.id === id);
}

/**
 * Где на экране нарисовать лупу: над пальцем, а если сверху не хватает места — под ним.
 * По горизонтали лупа не выходит за края холста.
 */
function loupeCenterPx(finger: Point, canvasWidth: number): Point {
  'worklet';
  const r = LOUPE_RADIUS_PX;
  const x = Math.min(canvasWidth - r, Math.max(r, finger.x));
  let y = finger.y - LOUPE_GAP_PX - r;
  if (y - r < 0) y = finger.y + LOUPE_GAP_PX + r;
  return { x, y };
}

/** Орто-режим: по большей дельте оставляем только горизонтальное или вертикальное движение. */
function constrainOrthoPoint(start: Point, point: Point, enabled: boolean): Point {
  'worklet';
  if (!enabled) return point;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  return Math.abs(dx) > Math.abs(dy)
    ? { x: point.x, y: start.y }
    : { x: start.x, y: point.y };
}

/** Треугольный наконечник оси СК в px экрана. */
function addUcsArrow(
  path: SkPathBuilder,
  tip: Point,
  direction: Point,
  length: number,
  halfWidth: number,
) {
  'worklet';
  const base = {
    x: tip.x - direction.x * length,
    y: tip.y - direction.y * length,
  };
  const normal = { x: -direction.y, y: direction.x };
  path.moveTo(tip.x, tip.y);
  path.lineTo(base.x + normal.x * halfWidth, base.y + normal.y * halfWidth);
  path.lineTo(base.x - normal.x * halfWidth, base.y - normal.y * halfWidth);
  path.close();
}

/** Точка лупы: при создании СК она мировая, при построении — локальная активной СК. */
function touchTargetToScreen(vp: Viewport, p: Point, ucs: UCS, ucsCreation: boolean): Point {
  'worklet';
  return ucsCreation ? worldToScreen(vp, p) : drawingToScreen(vp, p, ucs);
}

export function DrawingCanvas({
  ref,
  tool,
  shapes,
  canvasColors,
  activeUCS,
  ucsList,
  ucsCreationActive,
  ucsOrigin,
  onUcsTap,
  pendingStart,
  pendingMiddle,
  selectedShapeIds,
  editMode,
  snapToGrid,
  isOrthoEnabled,
  onTap,
  onSelectShapes,
  marqueeActive,
  onMarqueePendingChange,
  onUpdateShape,
  intersectMarkers,
  onIntersectTap,
  onDivideTap,
}: Props) {
  // Инструмент строит фигуры (точка, отрезок, окружность, прямая) — нужны лупа и привязка.
  // «Пересечение» и «Разделить» только выбирают фигуры тапом — лупы нет.
  const drawingTool =
    tool !== 'none' && tool !== 'select' && tool !== 'intersect' && tool !== 'divide';
  const selectTool = tool === 'select';

  // Выделенные фигуры. Тех, которых уже нет в чертеже (например, после «Отменить»),
  // здесь нет — они не подсвечиваются.
  const selectedShapes = useMemo(() => {
    if (selectedShapeIds.length === 0) return [];
    const ids = new Set(selectedShapeIds);
    return shapes.filter((s) => ids.has(s.id));
  }, [shapes, selectedShapeIds]);

  // Фигура с рукоятками: включён режим перетаскивания и выделена ровно одна фигура.
  const editShape =
    selectTool && editMode === 'drag' && selectedShapes.length === 1 ? selectedShapes[0] : null;
  const dragMode = editShape !== null;

  // --- Данные из React для UI-потока ---
  // Фигуры, выделение и фигура с рукоятками передаются в Reanimated-хуки через shared values,
  // а не через массивы зависимостей: на телефоне Reanimated массивы не читает и ругается
  // («Dependencies should only be used on the web»). Хук, который читает shared value,
  // сам пересчитывается при её изменении.
  const shapesSV = useSharedValue<Shape[]>(shapes);
  const selectedSV = useSharedValue<Shape[]>(selectedShapes);
  const canvasColorsSV = useSharedValue<CanvasColors>(canvasColors);
  const normalStyleSV = useSharedValue<SceneStyle>({
    color: canvasColors.shape,
    extraWidthPx: 0,
    pointFactor: 1,
    respectShapeColor: true,
  });
  const ucsSV = useSharedValue<UCS>(activeUCS);
  const ucsListSV = useSharedValue<UCS[]>(ucsList);
  const ucsOriginSV = useSharedValue<Point | null>(ucsOrigin);
  useEffect(() => {
    canvasColorsSV.set(canvasColors);
    normalStyleSV.set({
      color: canvasColors.shape,
      extraWidthPx: 0,
      pointFactor: 1,
      respectShapeColor: true,
    });
  }, [canvasColors, canvasColorsSV, normalStyleSV]);
  useEffect(() => {
    ucsSV.set(activeUCS);
  }, [activeUCS, ucsSV]);
  useEffect(() => {
    ucsListSV.set(ucsList);
  }, [ucsList, ucsListSV]);
  useEffect(() => {
    ucsOriginSV.set(ucsOrigin);
  }, [ucsOrigin, ucsOriginSV]);
  const markersSV = useSharedValue<Point[]>(intersectMarkers);
  useEffect(() => {
    markersSV.set(intersectMarkers);
  }, [intersectMarkers, markersSV]);
  const editShapeSV = useSharedValue<Shape | null>(editShape);
  const snapToGridSV = useSharedValue(snapToGrid);
  useEffect(() => {
    snapToGridSV.set(snapToGrid);
  }, [snapToGrid, snapToGridSV]);
  const isOrthoEnabledSV = useSharedValue(isOrthoEnabled);
  useEffect(() => {
    isOrthoEnabledSV.set(isOrthoEnabled);
  }, [isOrthoEnabled, isOrthoEnabledSV]);
  const pendingStartSV = useSharedValue<Point | null>(pendingStart);
  useEffect(() => {
    pendingStartSV.set(pendingStart);
  }, [pendingStart, pendingStartSV]);

  // Состояние вида живёт в UI-потоке, чтобы пан и зум были плавными.
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // --- «Быстрый жест»: пока холст двигают пальцами, рисуем без сглаживания ---
  // interaction: 1 — идёт пан/зум, 0 — нет. Это число, а не true/false, потому что
  // withDelay умеет откладывать только анимацию числа.
  // activeGestures — сколько жестов (пан, щипок) сейчас активны: пан и щипок идут
  // одновременно, и конец одного не должен выключать режим, пока идёт другой.
  const interaction = useSharedValue(0);
  const activeGestures = useSharedValue(0);
  const isInteracting = useDerivedValue(() => interaction.get() > 0);

  // Долгое нажатие с лупой. null — лупы нет.
  const touch = useSharedValue<TouchState | null>(null);
  // Показана ли лупа. Пока её нет, второй экземпляр чертежа (внутри лупы)
  // вообще не попадает на холст и не тратит время на отрисовку.
  const [loupeVisible, setLoupeVisible] = useState(false);

  // Один пустой путь на всё время жизни холста: его возвращают маркеры и лупа,
  // пока палец не на экране, — без создания новых объектов на каждом кадре.
  const noPath = useMemo(() => Skia.PathBuilder.Make().build(), []);

  const viewport = useDerivedValue<Viewport>(() => ({
    width: width.get(),
    height: height.get(),
    translateX: translateX.get(),
    translateY: translateY.get(),
    scale: scale.get(),
  }));

  // Сколько px экрана в 1 мм чертежа (никогда не 0 — см. safeK).
  const k = useDerivedValue(() => safeK(viewport.get()));

  // --- Матрица «чертёж (мм) -> экран (px)» ---
  // Одна матрица Skia 3×3 на всю группу фигур. Сами пути при пане и зуме не меняются.
  //   экран.x = k·x + tx
  //   экран.y = −k·y + ty   (минус — ось Y чертежа направлена вверх)
  // Формат Skia: [scaleX, skewX, transX, skewY, scaleY, transY, 0, 0, 1].
  const worldMatrix = useDerivedValue<Matrix3>(() => {
    const vp = viewport.get();
    if (vp.width <= 0 || vp.height <= 0) return IDENTITY;
    const kk = safeK(vp);
    const ucs = ucsSV.get();
    const rad = (ucs.angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    // V · U: сначала локальная СК поворачивается и смещается, затем вид (мм -> px, Y вниз).
    const tx = vp.width / 2 + vp.translateX + kk * ucs.dx;
    const ty = vp.height / 2 + vp.translateY - kk * ucs.dy;
    if (![tx, ty, c, s].every(Number.isFinite)) return IDENTITY;
    return [kk * c, -kk * s, tx, -kk * s, -kk * c, ty, 0, 0, 1];
  });

  // --- Сетка: плитка (Skia Picture) записывается только при изменении размера холста ---
  // Сразу два варианта — со сглаживанием и без (для «быстрого жеста»), чтобы при
  // начале и конце жеста не перезаписывать, а только переключать готовую сцену.
  // Пан и зум меняют лишь матрицу сетки (сдвиг по остатку и размер шага в px).
  const gridPictures = useDerivedValue(() => {
    try {
      const palette = canvasColorsSV.get();
      return {
        smooth: recordGridTile(width.get(), height.get(), true, palette.gridMinor, palette.gridMajor),
        fast: recordGridTile(width.get(), height.get(), false, palette.gridMinor, palette.gridMajor),
      };
    } catch (e) {
      console.warn('[DrawingCanvas] grid:', e);
      const empty = emptyPicture();
      return { smooth: empty, fast: empty };
    }
  });
  const gridPicture = useDerivedValue(() =>
    isInteracting.get() ? gridPictures.get().fast : gridPictures.get().smooth,
  );

  // Размер шага сетки на экране, px (от 8 до 80).
  const gridStepPx = useDerivedValue(() => {
    const vp = viewport.get();
    return gridStepMm(vp) * safeK(vp);
  });

  // Матрица сетки: плитка растягивается до шага в px и сдвигается так, чтобы
  // основные линии совпали с линиями, кратными 10 шагам от начала координат.
  // Сдвиг берётся по остатку от деления на 10 шагов — поэтому плитки всегда хватает.
  const gridMatrix = useDerivedValue<Matrix3>(() => {
    const vp = viewport.get();
    const ucs = ucsSV.get();
    const stepPx = gridStepPx.get();
    const kk = safeK(vp);
    const stepMm = stepPx / kk;
    const periodMm = stepMm * GRID_MAJOR_EVERY;
    const center = screenToDrawing(vp, { x: vp.width / 2, y: vp.height / 2 }, ucs);
    const anchor = {
      x: Math.round(center.x / periodMm) * periodMm,
      y: Math.round(center.y / periodMm) * periodMm,
    };
    const origin = drawingToScreen(vp, anchor, ucs);
    const rad = (ucs.angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const sn = Math.sin(rad);
    if (!(stepPx > 0) || ![origin.x, origin.y, c, sn].every(Number.isFinite)) return IDENTITY;
    return [kk * c * stepMm, -kk * sn * stepMm, origin.x, -kk * sn * stepMm, -kk * c * stepMm, origin.y, 0, 0, 1];
  });

  // --- Оси активной СК: проходят через её начало и повернуты вместе с чертежом ---
  const ucsOriginScreen = useDerivedValue(() => {
    const ucs = ucsSV.get();
    return worldToScreen(viewport.get(), { x: ucs.dx, y: ucs.dy });
  });
  const axisXStart = useDerivedValue(() => {
    const vp = viewport.get();
    const o = ucsOriginScreen.get();
    const rad = (ucsSV.get().angle * Math.PI) / 180;
    const length = Math.hypot(vp.width, vp.height);
    return vec(o.x - Math.cos(rad) * length, o.y + Math.sin(rad) * length);
  });
  const axisXEnd = useDerivedValue(() => {
    const vp = viewport.get();
    const o = ucsOriginScreen.get();
    const rad = (ucsSV.get().angle * Math.PI) / 180;
    const length = Math.hypot(vp.width, vp.height);
    return vec(o.x + Math.cos(rad) * length, o.y - Math.sin(rad) * length);
  });
  const axisYStart = useDerivedValue(() => {
    const vp = viewport.get();
    const o = ucsOriginScreen.get();
    const rad = (ucsSV.get().angle * Math.PI) / 180;
    const length = Math.hypot(vp.width, vp.height);
    return vec(o.x + Math.sin(rad) * length, o.y + Math.cos(rad) * length);
  });
  const axisYEnd = useDerivedValue(() => {
    const vp = viewport.get();
    const o = ucsOriginScreen.get();
    const rad = (ucsSV.get().angle * Math.PI) / 180;
    const length = Math.hypot(vp.width, vp.height);
    return vec(o.x - Math.sin(rad) * length, o.y - Math.cos(rad) * length);
  });

  // Метки СК рисуются в местах их установки; размер осей задан в px экрана.
  const ucsMarkers = useDerivedValue(() => {
    const vp = viewport.get();
    const activeId = ucsSV.get().id;
    const activeX = Skia.PathBuilder.Make();
    const activeY = Skia.PathBuilder.Make();
    const inactiveX = Skia.PathBuilder.Make();
    const inactiveY = Skia.PathBuilder.Make();
    for (const ucs of ucsListSV.get()) {
      const active = ucs.id === activeId;
      const xPath = active ? activeX : inactiveX;
      const yPath = active ? activeY : inactiveY;
      const o = worldToScreen(vp, { x: ucs.dx, y: ucs.dy });
      const rad = (ucs.angle * Math.PI) / 180;
      const length = active ? 52 : 38;
      const xDirection = { x: Math.cos(rad), y: -Math.sin(rad) };
      const yDirection = { x: -Math.sin(rad), y: -Math.cos(rad) };
      const xTip = { x: o.x + xDirection.x * length, y: o.y + xDirection.y * length };
      const yTip = { x: o.x + yDirection.x * length, y: o.y + yDirection.y * length };
      xPath.moveTo(o.x, o.y);
      xPath.lineTo(xTip.x, xTip.y);
      yPath.moveTo(o.x, o.y);
      yPath.lineTo(yTip.x, yTip.y);
      addUcsArrow(xPath, xTip, xDirection, active ? 10 : 8, active ? 4 : 3);
      addUcsArrow(yPath, yTip, yDirection, active ? 10 : 8, active ? 4 : 3);
      xPath.addCircle(o.x, o.y, active ? 3 : 2);
    }
    return {
      activeX: activeX.build(),
      activeY: activeY.build(),
      inactiveX: inactiveX.build(),
      inactiveY: inactiveY.build(),
    };
  });
  const ucsActiveXPath = useDerivedValue(() => ucsMarkers.get().activeX);
  const ucsActiveYPath = useDerivedValue(() => ucsMarkers.get().activeY);
  const ucsInactiveXPath = useDerivedValue(() => ucsMarkers.get().inactiveX);
  const ucsInactiveYPath = useDerivedValue(() => ucsMarkers.get().inactiveY);
  const ucsDraftPath = useDerivedValue(() => {
    const origin = ucsOriginSV.get();
    if (!origin || !ucsCreationActive) return noPath;
    const o = worldToScreen(viewport.get(), origin);
    const path = Skia.PathBuilder.Make();
    path.addCircle(o.x, o.y, 8);
    path.moveTo(o.x - 14, o.y);
    path.lineTo(o.x + 14, o.y);
    path.moveTo(o.x, o.y - 14);
    path.lineTo(o.x, o.y + 14);
    return path.build();
  });

  // Будущая ось X: от первой точки СК до пальца; при привязке — точно до её точки.
  // Координаты здесь экранные, поэтому длина штрихов не зависит от зума.
  const ucsAxisPreviewPath = useDerivedValue(() => {
    const origin = ucsOriginSV.get();
    const t = touch.get();
    if (!origin || !t || !ucsCreationActive) return noPath;
    const vp = viewport.get();
    const a = worldToScreen(vp, origin);
    const b = worldToScreen(vp, t.target);
    const path = Skia.PathBuilder.Make();
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
    return path.build();
  });

  // --- Перетаскивание рукоятки выделенной фигуры ---
  // Всё живёт в UI-потоке: фигура меняется за пальцем без участия React.
  // dragOrigin — фигура до начала перетаскивания (null — никто ничего не тянет),
  // dragShape — она же в текущем положении, grab — за какую рукоятку взялись.
  // После отпускания dragOrigin и dragShape держатся, пока экран не пришлёт новый список
  // фигур (см. useEffect ниже) — иначе на кадр-другой мелькнуло бы старое положение.
  const dragOrigin = useSharedValue<Shape | null>(null);
  const dragShape = useSharedValue<Shape | null>(null);
  const grab = useSharedValue<Grab | null>(null);
  // Точка привязки к объекту под рукояткой (мм), пока тянут. null — привязки нет.
  const dragSnap = useSharedValue<Point | null>(null);

  // Перемещение выделенной фигуры целиком. Во время жеста меняются только эти
  // shared values: React не перерисовывается, а синяя сцена одной фигуры следует за пальцем.
  const moveOrigin = useSharedValue<Shape | null>(null);
  const moveOffset = useSharedValue<Point>({ x: 0, y: 0 });
  // true, пока палец на экране. После успешного конца жеста положение держим до нового списка shapes.
  const moveActive = useSharedValue(false);

  // Зелёный квадратик привязки к объекту (px экрана).
  const dragSnapMarker = useDerivedValue(() => {
    const sp = dragSnap.get();
    if (!sp) return noPath;
    const p = drawingToScreen(viewport.get(), sp, ucsSV.get());
    const h = SNAP_MARKER_HALF_PX;
    const path = Skia.PathBuilder.Make();
    path.addRect(Skia.XYWHRect(p.x - h, p.y - h, h * 2, h * 2));
    return path.build();
  });

  // Новый список фигур — в UI-поток. Если это изменение после перетаскивания
  // (записано в историю), перетаскивание закончено: фигура дальше рисуется из списка.
  // Обе записи в одном эффекте — в одном кадре, без мелькания старого положения.
  useEffect(() => {
    shapesSV.set(shapes);
    if (dragOrigin.get() && !grab.get()) {
      dragShape.set(null);
      dragOrigin.set(null);
    }
    if (moveOrigin.get() && !moveActive.get()) {
      moveOrigin.set(null);
      moveOffset.set({ x: 0, y: 0 });
    }
  }, [shapes, shapesSV, dragOrigin, dragShape, grab, moveOrigin, moveActive, moveOffset]);

  useEffect(() => {
    selectedSV.set(selectedShapes);
  }, [selectedShapes, selectedSV]);

  useEffect(() => {
    editShapeSV.set(editShape);
  }, [editShape, editShapeSV]);

  // --- Область покрытия и ступенька масштаба: меняются редко ---
  // Покрытие — при сдвиге больше чем на полэкрана или зуме в 2 раза.
  // Ступенька — при изменении зума на ~19%. На каждом кадре здесь только сравнение чисел;
  // новые значения записываются, лишь когда действительно сменились.
  const cover = useSharedValue<Cover>(EMPTY_COVER);
  const sceneLevel = useSharedValue(kLevel(PX_PER_MM)); // при открытии зум = 1
  useAnimatedReaction(
    () => ({ vp: viewport.get(), ucs: ucsSV.get() }),
    (current, previous) => {
      try {
        const { vp, ucs } = current;
        const ucsChanged =
          !previous ||
          previous.ucs.id !== ucs.id ||
          previous.ucs.dx !== ucs.dx ||
          previous.ucs.dy !== ucs.dy ||
          previous.ucs.angle !== ucs.angle;
        if (ucsChanged || needsNewCover(cover.get(), vp, ucs)) cover.set(makeCover(vp, ucs));
        const level = kLevel(safeK(vp));
        if (level !== sceneLevel.get()) sceneLevel.set(level);
      } catch (e) {
        console.warn('[DrawingCanvas] cover:', e);
      }
    },
  );

  // --- Фигуры в мм чертежа ---
  // Отсечение невидимого: в сцену попадают только фигуры, задевающие область покрытия.
  // Пересчитывается только при смене покрытия или списка фигур, а не на каждом кадре.
  // Фигуру, которую тянут за рукоятку или целиком, основная сцена не рисует —
  // её рисует сцена выделения в новом положении. Перезапись только в начале и конце жеста.
  const visibleShapes = useDerivedValue(() => {
    const all = shapesSV.get();
    const dragging = dragOrigin.get();
    const moving = moveOrigin.get();
    const list = all.filter(
      (s) => (!dragging || s.id !== dragging.id) && (!moving || s.id !== moving.id),
    );
    return getVisibleShapes(list, cover.get());
  });

  // Сцена (Skia Picture) со всеми видимыми фигурами. Перезаписывается только при смене
  // покрытия, ступеньки масштаба или списка фигур. При пане её просто двигает матрица.
  // Ещё перезаписывается при начале и конце «быстрого жеста» (сглаживание вкл/выкл):
  // это одна запись на жест, а не на кадр.
  const shapesPicture = useDerivedValue(() => {
    try {
      return recordShapes(
        visibleShapes.get(),
        cover.get(),
        levelToK(sceneLevel.get()),
        !isInteracting.get(),
        normalStyleSV.get(),
      );
    } catch (e) {
      console.warn('[DrawingCanvas] picture:', e);
      return emptyPicture();
    }
  });

  // Отдельная сцена для выделенных фигур: синие и толще, рисуются поверх основной.
  // Основную сцену при выделении перезаписывать не нужно.
  // Перетаскиваемую фигуру рисуем в текущем положении. При движении целиком новые
  // координаты получаются из moveOrigin + moveOffset прямо на UI-потоке, без React.
  const selectionPicture = useDerivedValue(() => {
    try {
      const dragged = dragShape.get();
      const moving = moveOrigin.get();
      const offset = moveOffset.get();
      const live = dragged ?? (moving ? translateShape(moving, offset.x, offset.y) : null);
      const selected = selectedSV.get();
      const list = live ? selected.map((s) => (s.id === live.id ? live : s)) : selected;
      return recordShapes(
        getVisibleShapes(list, cover.get()),
        cover.get(),
        levelToK(sceneLevel.get()),
        !isInteracting.get(),
        SELECTED_STYLE,
      );
    } catch (e) {
      console.warn('[DrawingCanvas] selection:', e);
      return emptyPicture();
    }
  });

  // Рукоятки — синие квадратики в px экрана (размер не зависит от зума).
  // Только в режиме перетаскивания; пока тянут — у фигуры в текущем положении.
  const handlesPath = useDerivedValue(() => {
    const s = dragShape.get() ?? editShapeSV.get();
    if (!s) return noPath;
    const vp = viewport.get();
    const h = HANDLE_HALF_PX;
    const path = Skia.PathBuilder.Make();
    for (const point of shapeHandles(s, safeK(vp))) {
      const p = drawingToScreen(vp, point, ucsSV.get());
      path.addRect(Skia.XYWHRect(p.x - h, p.y - h, h * 2, h * 2));
    }
    return path.build();
  });

  // Маркеры пересечений — кружки в px экрана (размер не зависит от зума).
  const intersectPath = useDerivedValue(() => {
    const list = markersSV.get();
    if (list.length === 0) return noPath;
    const vp = viewport.get();
    const path = Skia.PathBuilder.Make();
    for (const point of list) {
      const p = drawingToScreen(vp, point, ucsSV.get());
      path.addCircle(p.x, p.y, INTERSECT_MARKER_RADIUS_PX);
    }
    return path.build();
  });

  // Уже поставленные точки недостроенной фигуры (у дуги их может быть две).
  const pendingPath = useMemo(() => {
    const path = Skia.PathBuilder.Make();
    for (const p of [pendingStart, pendingMiddle]) {
      if (!p) continue;
      path.moveTo(p.x, p.y);
      path.lineTo(p.x, p.y);
    }
    return path.build();
  }, [pendingStart, pendingMiddle]);

  // Размер точек (для первой точки недостроенной фигуры и подсветки): нужный размер
  // в px делим на k. Матрица умножит обратно на k — на экране получится ровно нужное число px.
  const pointDiameter = useDerivedValue(() => toLocal(pointRadiusPx(k.get()) * 2, k.get()));
  const pendingDiameter = useDerivedValue(() => pointDiameter.get() * PENDING_RADIUS_FACTOR);

  // --- Привязка: подсветка фигуры и маркер точки привязки ---
  // Всё ниже пересчитывается только пока палец держат с лупой (touch не null).
  // При обычном пане и зуме touch = null, и функции сразу возвращают пустой путь.

  // Подсветка — в мм, внутри группы фигур. От пана и зума не зависит.
  const highlightStrokes = useDerivedValue(() => {
    const t = touch.get();
    if (!t || !t.snap) return noPath;
    try {
      const path = Skia.PathBuilder.Make();
      const snapped = snappedShapes(t, shapesSV.get());
      addOutlines(path, snapped);
      addXLines(path, snapped, cover.get());
      return path.build();
    } catch (e) {
      console.warn('[DrawingCanvas] highlightStrokes:', e);
      return noPath;
    }
  });
  const highlightWidth = useDerivedValue(() =>
    toLocal(segmentWidthPx(k.get()) + HIGHLIGHT_EXTRA_PX, k.get()),
  );
  const highlightPoints = useDerivedValue(() => {
    const t = touch.get();
    if (!t || !t.snap) return noPath;
    try {
      const path = Skia.PathBuilder.Make();
      addPoints(path, snappedShapes(t, shapesSV.get()));
      return path.build();
    } catch (e) {
      console.warn('[DrawingCanvas] highlightPoints:', e);
      return noPath;
    }
  });

  // Маркер привязки (в px экрана): треугольник — середина, квадрат — другая характерная точка
  // (конец, центр и т.п.), ромб — ближайшая точка на линии.
  const snapMarker = useDerivedValue(() => {
    const t = touch.get();
    if (!t || !t.snap) return noPath;
    const path = Skia.PathBuilder.Make();
    const p = touchTargetToScreen(viewport.get(), t.target, ucsSV.get(), ucsCreationActive);
    const h = SNAP_MARKER_HALF_PX;
    if (t.snap.kind === 'midpoint') {
      path.moveTo(p.x, p.y - h);
      path.lineTo(p.x + h, p.y + h);
      path.lineTo(p.x - h, p.y + h);
      path.close();
    } else if (t.snap.kind === 'nearest') {
      path.moveTo(p.x, p.y - h);
      path.lineTo(p.x + h, p.y);
      path.lineTo(p.x, p.y + h);
      path.lineTo(p.x - h, p.y);
      path.close();
    } else {
      path.addRect(Skia.XYWHRect(p.x - h, p.y - h, h * 2, h * 2));
    }
    return path.build();
  });

  // Точка под пальцем (на основном холсте). При привязке «прилипает» к фигуре и синеет.
  const touchDot = useDerivedValue(() => {
    const t = touch.get();
    if (!t) return noPath;
    const path = Skia.PathBuilder.Make();
    const p = touchTargetToScreen(viewport.get(), t.target, ucsSV.get(), ucsCreationActive);
    path.addCircle(p.x, p.y, TOUCH_DOT_RADIUS_PX);
    return path.build();
  });
  const touchDotColor = useDerivedValue(() =>
    touch.get()?.snap ? COLORS.snap : canvasColorsSV.get().touchDot,
  );

  // --- Лупа ---

  const loupeCenter = useDerivedValue(() => {
    const t = touch.get();
    return t ? loupeCenterPx(t.finger, width.get()) : { x: 0, y: 0 };
  });

  // Круг лупы. Пока лупы нет — путь пустой.
  const loupeCircle = useDerivedValue(() => {
    if (!touch.get()) return noPath;
    const c = loupeCenter.get();
    const path = Skia.PathBuilder.Make();
    path.addCircle(c.x, c.y, LOUPE_RADIUS_PX);
    return path.build();
  });
  const loupeOuterCircle = useDerivedValue(() => {
    if (!touch.get()) return noPath;
    const c = loupeCenter.get();
    const path = Skia.PathBuilder.Make();
    path.addCircle(c.x, c.y, LOUPE_RADIUS_PX + 2.5);
    return path.build();
  });

  // Содержимое лупы: тот же чертёж, увеличенный в LOUPE_ZOOM раз вокруг точки target.
  // Точка target попадает ровно в центр лупы — под перекрестие.
  const loupeTransform = useDerivedValue<Transforms3d>(() => {
    const t = touch.get();
    if (!t) return NO_TRANSFORM;
    const c = loupeCenter.get();
    const p = touchTargetToScreen(viewport.get(), t.target, ucsSV.get(), ucsCreationActive);
    return [
      { translateX: c.x },
      { translateY: c.y },
      { scale: LOUPE_ZOOM },
      { translateX: -p.x },
      { translateY: -p.y },
    ];
  });

  const crosshair = useDerivedValue(() => {
    if (!touch.get()) return noPath;
    const { x, y } = loupeCenter.get();
    const arm = LOUPE_RADIUS_PX;
    const gap = CROSSHAIR_GAP_PX;
    const path = Skia.PathBuilder.Make();
    path.moveTo(x - arm, y);
    path.lineTo(x - gap, y);
    path.moveTo(x + gap, y);
    path.lineTo(x + arm, y);
    path.moveTo(x, y - arm);
    path.lineTo(x, y - gap);
    path.moveTo(x, y + gap);
    path.lineTo(x, y + arm);
    return path.build();
  });

  // --- Рамка выделения (инструмент «Выделение», палец зажали и тянут по холсту) ---
  // null — рамки нет. Живёт в UI-потоке: рамка тянется за пальцем без участия React.
  const marquee = useSharedValue<Marquee | null>(null);

  // Первый угол рамки при выделении в два тапа (зажали и отпустили, не сдвигая), мм чертежа.
  // В мм, а не в px: между двумя тапами вид можно двигать двумя пальцами — угол
  // остаётся на своём месте чертежа. null — угол не поставлен.
  const marqueePoint1 = useSharedValue<Point | null>(null);

  // Виньетка горит, пока тянут рамку или поставлен первый угол.
  useAnimatedReaction(
    () => marquee.get() !== null || marqueePoint1.get() !== null,
    (active, prev) => {
      if (active !== prev) marqueeActive.set(active);
    },
  );

  // Экрану нужно знать, поставлен ли первый угол (подсказка с кнопкой «Отмена»).
  // Без массива зависимостей: Reanimated сам видит onMarqueePendingChange во внешних значениях.
  useAnimatedReaction(
    () => marqueePoint1.get() !== null,
    (pending, prev) => {
      if (prev !== null && pending !== prev) scheduleOnRN(onMarqueePendingChange, pending);
    },
  );

  // Маркер первого угла, px экрана: крестик с кружком в центре.
  const marqueePoint1Marker = useDerivedValue(() => {
    const p1 = marqueePoint1.get();
    if (!p1) return noPath;
    const { x, y } = drawingToScreen(viewport.get(), p1, ucsSV.get());
    const arm = MARQUEE_CORNER_ARM_PX;
    const path = Skia.PathBuilder.Make();
    path.moveTo(x - arm, y);
    path.lineTo(x + arm, y);
    path.moveTo(x, y - arm);
    path.lineTo(x, y + arm);
    path.addCircle(x, y, MARQUEE_CORNER_DOT_PX);
    return path.build();
  });

  // Рамка прямоугольна в локальной СК и на экране поворачивается вместе с чертежом.
  const marqueePath = useDerivedValue(() => {
    const m = marquee.get();
    if (!m) return noPath;
    const vp = viewport.get();
    const ucs = ucsSV.get();
    const a = screenToDrawing(vp, { x: m.x0, y: m.y0 }, ucs);
    const b = screenToDrawing(vp, { x: m.x1, y: m.y1 }, ucs);
    const p1 = drawingToScreen(vp, a, ucs);
    const p2 = drawingToScreen(vp, { x: b.x, y: a.y }, ucs);
    const p3 = drawingToScreen(vp, b, ucs);
    const p4 = drawingToScreen(vp, { x: a.x, y: b.y }, ucs);
    const path = Skia.PathBuilder.Make();
    path.moveTo(p1.x, p1.y);
    path.lineTo(p2.x, p2.y);
    path.lineTo(p3.x, p3.y);
    path.lineTo(p4.x, p4.y);
    path.close();
    return path.build();
  });

  useImperativeHandle(ref, () => ({
    resetView: () => {
      translateX.set(withTiming(0, { duration: RESET_DURATION_MS }));
      translateY.set(withTiming(0, { duration: RESET_DURATION_MS }));
      scale.set(withTiming(1, { duration: RESET_DURATION_MS }));
    },
    cancelMarquee: () => {
      if (marqueePoint1.get()) marqueePoint1.set(null);
    },
  }));

  // Начался пан или щипок — сразу выключаем сглаживание.
  // Новое значение отменяет и отложенное включение от предыдущего жеста.
  const startInteraction = () => {
    'worklet';
    activeGestures.set(activeGestures.get() + 1);
    interaction.set(1);
  };

  // Закончился пан или щипок. Если других жестов нет — через INTERACTION_END_DELAY_MS
  // включаем сглаживание обратно.
  const endInteraction = () => {
    'worklet';
    const left = Math.max(0, activeGestures.get() - 1);
    activeGestures.set(left);
    if (left > 0) return;
    interaction.set(withDelay(INTERACTION_END_DELAY_MS, withTiming(0, { duration: 0 })));
  };

  // Пан: когда выбран инструмент построения или «Выделение» — только двумя пальцами
  // (один палец занят под тапы и лупу / рамку выделения), когда инструмент не выбран —
  // можно двигать вид и одним пальцем (короткий тап без сдвига всё равно остаётся тапом).
  // В режиме перетаскивания рукояток тапа и рамки нет — один палец мимо рукоятки двигает вид.
  // Только меняет сдвиг — никакого поиска привязки.
  const pan = Gesture.Pan()
    .minPointers((tool === 'none' && !ucsCreationActive) || dragMode ? 1 : 2)
    .averageTouches(true)
    .onStart(startInteraction)
    .onChange((e) => {
      translateX.set(translateX.get() + e.changeX);
      translateY.set(translateY.get() + e.changeY);
    })
    .onEnd(endInteraction);

  // Зум щипком: точка чертежа под пальцами остаётся на месте.
  // Тоже только меняет сдвиг и масштаб — никакого поиска привязки.
  const pinch = Gesture.Pinch()
    .onStart(startInteraction)
    .onChange((e) => {
      const prevScale = scale.get();
      const nextScale = clampScale(prevScale * e.scaleChange);
      const ratio = nextScale / prevScale;

      // Центр щипка относительно центра холста.
      const fx = e.focalX - width.get() / 2;
      const fy = e.focalY - height.get() / 2;

      translateX.set(fx - (fx - translateX.get()) * ratio);
      translateY.set(fy - (fy - translateY.get()) * ratio);
      scale.set(nextScale);
    })
    .onEnd(endInteraction);

  // Рамка готова: ищем фигуры, которые она задела (в JS-потоке, где живёт список фигур).
  // a и b — противоположные углы рамки, мм чертежа.
  const selectInRect = (a: Point, b: Point) => {
    onSelectShapes(shapesInRect(shapes, a, b).map((s) => s.id));
  };

  // Короткий тап одним пальцем без сдвига — работает, только когда выбран инструмент.
  // При «Выделении» тап не ставит точку, а ищет фигуру под пальцем
  // (или ставит второй угол рамки, если первый уже поставлен).
  // runOnJS(true): обработчики выполняются в JS-потоке, где живёт состояние фигур.
  // maxDuration: если палец держат дольше — это уже долгое нажатие
  // (лупа или рамка выделения), а не тап.
  // В режиме перетаскивания рукояток тап выключен: выделение не должно сбиться случайным касанием.
  const tap = Gesture.Tap()
    .enabled((tool !== 'none' || ucsCreationActive) && !dragMode)
    .runOnJS(true)
    .maxDistance(TAP_MAX_DISTANCE_PX)
    .maxDuration(LONG_PRESS_MS)
    .onTouchesDown((e, manager) => {
      // Второй палец на экране — это пан или зум, а не тап.
      if (e.numberOfTouches > 1) manager.fail();
    })
    .onEnd((e, success) => {
      if (!success) return;
      const vp = viewport.get();
      if (ucsCreationActive) {
        const screenPoint = { x: e.x, y: e.y };
        const world = screenToWorld(vp, screenPoint);
        let target = { x: roundMm(world.x), y: roundMm(world.y) };
        if (ucsOrigin) {
          // Короткий тап использует ту же объектную привязку, что и лупа.
          // Фигуры хранятся в активной СК, а новая СК задаётся в мировых координатах.
          const drawingPoint = screenToDrawing(vp, screenPoint, activeUCS);
          const snap = findSnapPoint(shapes, drawingPoint, SNAP_RADIUS_PX / safeK(vp));
          if (snap) {
            const snappedWorld = ucsToWorld(snap.p, activeUCS);
            target = { x: roundMm(snappedWorld.x), y: roundMm(snappedWorld.y) };
          }
        }
        onUcsTap(target);
        return;
      }
      const world = screenToDrawing(vp, { x: e.x, y: e.y }, ucsSV.get());
      if (selectTool) {
        // Выделение в два тапа: первый угол уже стоит — этот тап ставит второй,
        // выделяются все фигуры, которые задела рамка, виньетка гаснет.
        const p1 = marqueePoint1.get();
        if (p1) {
          marqueePoint1.set(null);
          selectInRect(p1, world);
          return;
        }
        // Допуск в px экрана переводим в мм: при отдалении он в мм больше.
        // Тап по фигуре выделяет только её (прежнее выделение сбрасывается),
        // тап по пустому месту сбрасывает всё выделение.
        const hit = hitTest(shapes, world, HIT_TOLERANCE_PX / safeK(vp));
        onSelectShapes(hit ? [hit.id] : []);
        return;
      }
      if (tool === 'intersect') {
        // Сначала маркеры (они лежат поверх фигур), затем фигура под пальцем.
        const tol = HIT_TOLERANCE_PX / safeK(vp);
        let markerIndex = -1;
        let bestDist = tol;
        intersectMarkers.forEach((m, i) => {
          const d = Math.hypot(m.x - world.x, m.y - world.y);
          if (d <= bestDist) {
            bestDist = d;
            markerIndex = i;
          }
        });
        if (markerIndex >= 0) {
          onIntersectTap(null, markerIndex);
          return;
        }
        onIntersectTap(hitTest(shapes.filter(canIntersect), world, tol), -1);
        return;
      }
      if (tool === 'divide') {
        const dividable = shapes.filter(
          (s) => s.type === 'segment' || s.type === 'circle' || s.type === 'arc',
        );
        onDivideTap(hitTest(dividable, world, HIT_TOLERANCE_PX / safeK(vp)));
        return;
      }
      const rawPoint = snapToGrid
        ? { x: snapToGridMm(world.x), y: snapToGridMm(world.y) }
        : { x: roundMm(world.x), y: roundMm(world.y) };
      const point =
        pendingStart && (tool === 'segment' || tool === 'xline')
          ? constrainOrthoPoint(pendingStart, rawPoint, isOrthoEnabled)
          : rawPoint;
      if (tool === 'dimension' && !pendingStart) {
        // «Размер»: тап по отрезку измеряет весь отрезок (второго тапа не нужно).
        const segments = shapes.filter((s) => s.type === 'segment');
        onTap(point, hitTest(segments, world, HIT_TOLERANCE_PX / safeK(vp)));
        return;
      }
      onTap(point);
    });

  // Палец на экране: ищем привязку и запоминаем, куда встанет точка.
  // Вызывается ТОЛЬКО из жеста лупы (долгое нажатие одним пальцем).
  const updateTouch = (x: number, y: number) => {
    'worklet';
    const vp = viewport.get();
    const ucs = ucsSV.get();
    const rawWorld = ucsCreationActive
      ? screenToWorld(vp, { x, y })
      : screenToDrawing(vp, { x, y }, ucs);
    if (ucsCreationActive) {
      // На втором тапе ищем привязку в локальных координатах фигур, а результат
      // возвращаем в мировые: именно из мировых точек экран считает угол новой СК.
      let snap: SnapResult | null = null;
      if (ucsOriginSV.get()) {
        const drawingPoint = screenToDrawing(vp, { x, y }, ucs);
        const localSnap = findSnapPoint(shapesSV.get(), drawingPoint, SNAP_RADIUS_PX / safeK(vp));
        if (localSnap) snap = { ...localSnap, p: ucsToWorld(localSnap.p, ucs) };
      }
      touch.set({ finger: { x, y }, target: snap ? snap.p : rawWorld, snap });
      return;
    }
    const orthoStart = tool === 'segment' || tool === 'xline' ? pendingStartSV.get() : null;
    const world = orthoStart
      ? constrainOrthoPoint(orthoStart, rawWorld, isOrthoEnabledSV.get())
      : rawWorld;
    // Орто ограничивает точку ДО поиска привязки, чтобы оба режима работали с одной точкой.
    const snap = findSnapPoint(shapesSV.get(), world, SNAP_RADIUS_PX / pxPerMm(vp));
    // Нет привязки к объекту, но включена сетка — перекрестие встаёт в узел сетки.
    const gridWorld = snapToGridSV.get()
      ? { x: snapToGridMm(world.x), y: snapToGridMm(world.y) }
      : world;
    touch.set({ finger: { x, y }, target: snap ? snap.p : gridWorld, snap });
  };

  // Долгое нажатие одним пальцем: появляется лупа, палец можно вести по холсту,
  // точка «магнитится» к фигурам. Отпустили палец — точка ставится туда, где перекрестие.
  // Работает в UI-потоке, чтобы лупа двигалась без задержек.
  // Жест не запускается при пане/зуме: он включается только после удержания
  // одного пальца и сразу отменяется, если на экране появился второй палец.
  // При «Выделении» лупы нет: точку ставить не нужно, а один палец тянет рамку выделения.
  const loupe = Gesture.Pan()
    .enabled(drawingTool || ucsCreationActive)
    .activateAfterLongPress(LONG_PRESS_MS)
    .maxPointers(1)
    .onTouchesDown((e, manager) => {
      // Второй палец — пользователь передумал и двигает/зумирует вид. Лупу отменяем.
      if (e.numberOfTouches > 1) {
        manager.fail();
        return;
      }
      // Для второй точки СК превью и привязка включаются сразу при касании,
      // не дожидаясь LONG_PRESS_MS; сама лупа появится только после удержания.
      const t = e.changedTouches[0];
      if (ucsCreationActive && ucsOriginSV.get() && t) updateTouch(t.x, t.y);
    })
    .onStart((e) => {
      updateTouch(e.x, e.y);
      scheduleOnRN(setLoupeVisible, true);
    })
    .onUpdate((e) => updateTouch(e.x, e.y))
    .onEnd((_e, success) => {
      const t = touch.get();
      if (!success || !t) return;
      const target = { x: roundMm(t.target.x), y: roundMm(t.target.y) };
      if (ucsCreationActive) scheduleOnRN(onUcsTap, target);
      else scheduleOnRN(onTap, target);
    })
    .onFinalize(() => {
      // Жест лупы заканчивается и у каждого короткого тапа — тогда лупы и не было,
      // лишний раз React не дёргаем.
      if (!touch.get()) return;
      touch.set(null);
      scheduleOnRN(setLoupeVisible, false);
    });

  // Выделение рамкой, как в CAD: при «Выделении» палец зажимают на LONG_PRESS_MS
  // в любом месте (в том числе на линии) — загорается синяя виньетка. Дальше два способа:
  //  А) не отпуская, тянут палец — рамка рисуется за ним; отпустили — выделяются
  //     все фигуры, которые рамка хотя бы задела;
  //  Б) отпускают палец на месте — там ставится первый угол рамки (крестик), виньетка
  //     продолжает гореть; следующий тап в любом месте ставит второй угол (см. tap).
  // Короткий тап до срабатывания зажатия — обычный тап (выбор одной фигуры).
  // Второй палец — это пан или зум, рамку отменяем. В режиме перетаскивания рукояток рамки нет.
  const marqueeGesture = Gesture.Pan()
    .enabled(selectTool && !dragMode)
    .activateAfterLongPress(LONG_PRESS_MS)
    .maxPointers(1)
    .onTouchesDown((e, manager) => {
      if (e.numberOfTouches > 1) manager.fail();
    })
    .onStart((e) => {
      // Новое зажатие начинает рамку заново: старый первый угол (способ Б) убираем.
      if (marqueePoint1.get()) marqueePoint1.set(null);
      // Угол рамки — там, где палец коснулся экрана (а не где жест запустился).
      marquee.set({ x0: e.x - e.translationX, y0: e.y - e.translationY, x1: e.x, y1: e.y });
    })
    .onUpdate((e) => {
      const m = marquee.get();
      if (!m) return;
      marquee.set({ x0: m.x0, y0: m.y0, x1: e.x, y1: e.y });
    })
    .onEnd((_e, success) => {
      const m = marquee.get();
      if (!success || !m) return;
      const vp = viewport.get();
      const a = screenToDrawing(vp, { x: m.x0, y: m.y0 }, ucsSV.get());
      const dragged = Math.max(Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0)) > TAP_MAX_DISTANCE_PX;
      if (dragged) {
        // Способ А: рамку растянули — выделяем.
        const b = screenToDrawing(vp, { x: m.x1, y: m.y1 }, ucsSV.get());
        scheduleOnRN(selectInRect, a, b);
      } else {
        // Способ Б: зажали и отпустили на месте — ставим первый угол и ждём второй тап.
        marqueePoint1.set(a);
      }
    })
    .onFinalize(() => {
      // Виньетку отдельно гасить не нужно: она горит, пока есть рамка или первый угол.
      if (marquee.get()) marquee.set(null);
    });

  // Перетаскивание закончилось без сохранения (фигура не изменилась, жест отменён).
  const clearDrag = () => {
    'worklet';
    grab.set(null);
    dragSnap.set(null);
    if (dragShape.get()) dragShape.set(null);
    if (dragOrigin.get()) dragOrigin.set(null);
  };

  // Отмена перемещения целиком: фигура сразу возвращается в исходную точку.
  const clearMove = () => {
    'worklet';
    moveActive.set(false);
    moveOrigin.set(null);
    moveOffset.set({ x: 0, y: 0 });
  };

  // Какая рукоятка под пальцем (x, y — px экрана): номер ближайшей в пределах HANDLE_HIT_PX
  // или -1, если ни одной рядом нет. Ближайшая — потому что при сильном отдалении
  // рукоятки отрезка или окружности могут оказаться почти в одной точке.
  const hitTestHandle = (handles: Point[], vp: Viewport, x: number, y: number): number => {
    'worklet';
    let index = -1;
    let best = HANDLE_HIT_PX;
    for (let i = 0; i < handles.length; i++) {
      const p = drawingToScreen(vp, handles[i], ucsSV.get());
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= best) {
        index = i;
        best = d;
      }
    }
    return index;
  };

  // Перетаскивание рукоятки: только в режиме 'drag' («Изменить» → «Перетаскиванием»).
  // Палец коснулся экрана ближе HANDLE_HIT_PX к рукоятке — запоминаем её, и с первым же
  // сдвигом пальца жест включается (minDistance(0)), фигура меняется за пальцем.
  // Мимо рукоятки — жест сразу отказывается, и касание достаётся пану (вид двигается).
  // Ручного включения (manualActivation) нет: жест включается сам, как обычный пан.
  // Отпустили палец — новая фигура уходит в историю (onUpdateShape), один шаг на перетаскивание.
  // Второй палец отменяет перетаскивание: фигура возвращается на место.
  const handleDrag = Gesture.Pan()
    .enabled(dragMode)
    .minDistance(0)
    .maxPointers(1)
    .onTouchesDown((e, manager) => {
      const s = editShapeSV.get();
      const t = e.changedTouches[0];
      // Второй палец (пан или зум) или нет фигуры — не перетаскиваем.
      if (!s || !t || e.numberOfTouches > 1) {
        manager.fail();
        return;
      }
      const vp = viewport.get();
      const handles = shapeHandles(s, safeK(vp));
      const index = hitTestHandle(handles, vp, t.x, t.y);
      if (index < 0) {
        manager.fail();
        return;
      }
      // Новое касание всегда начинает заново: старое значение grab (если прошлый жест
      // оборвался без onFinalize) не мешает.
      const w = screenToDrawing(vp, { x: t.x, y: t.y }, ucsSV.get());
      grab.set({ index, dx: handles[index].x - w.x, dy: handles[index].y - w.y });
      dragOrigin.set(s);
      dragShape.set(s);
    })
    .onUpdate((e) => {
      const g = grab.get();
      const s = dragShape.get();
      if (!g || !s) return;
      const vp = viewport.get();
      const w = screenToDrawing(vp, { x: e.x, y: e.y }, ucsSV.get());
      let tx = roundMm(w.x + g.dx);
      let ty = roundMm(w.y + g.dy);
      let objectSnap: Point | null = null;
      if (snapToGridSV.get()) {
        // Сетка включена: в узел сетки, привязки к объектам нет.
        tx = snapToGridMm(tx);
        ty = snapToGridMm(ty);
      } else {
        // Привязка к объектам (кроме самой тянутой фигуры): конец, центр, середина и т.д.
        const others = shapesSV.get().filter((o) => o.id !== s.id);
        const snap = findSnapPoint(others, { x: tx, y: ty }, SNAP_RADIUS_PX / safeK(vp));
        // 'nearest' (любая точка линии) не берём: только характерные точки, иначе рукоятка «липнет» к линиям.
        if (snap && snap.kind !== 'nearest') {
          objectSnap = snap.p;
          tx = roundMm(snap.p.x);
          ty = roundMm(snap.p.y);
        } else if (s.type === 'dimension' && g.index < 2) {
          // Точки размера (p1, p2) «прилипают» к осям: близко к оси — координата обнуляется.
          const snapMm = AXIS_SNAP_PX / safeK(vp);
          if (Math.abs(tx) <= snapMm) tx = 0;
          if (Math.abs(ty) <= snapMm) ty = 0;
        }
      }
      dragSnap.set(objectSnap);
      const next = moveHandle(s, g.index, { x: tx, y: ty });
      if (next) dragShape.set(next);
    })
    .onEnd((_e, success) => {
      const live = dragShape.get();
      const origin = dragOrigin.get();
      if (!success || !live || !origin) {
        clearDrag();
        return;
      }
      dragSnap.set(null);
      const finished = finishDraggedShape(live);
      // Ничего не изменилось (коснулись рукоятки и отпустили) — в историю не пишем.
      // Сравнение — как в updateShape (useShapeHistory), иначе экран не прислал бы
      // новый список фигур и перетаскивание «зависло» бы.
      if (JSON.stringify(finished) === JSON.stringify(origin)) {
        clearDrag();
        return;
      }
      grab.set(null);
      dragShape.set(finished);
      scheduleOnRN(onUpdateShape, finished);
    })
    .onFinalize(() => {
      // Жест прервали, не дойдя до onEnd, — возвращаем фигуру на место.
      if (grab.get()) clearDrag();
    });

  // Перемещение единственной выделенной фигуры за её линию (не за рукоятку).
  // Касание в другом месте сразу отдаётся рамке, а второй палец отменяет перемещение
  // и позволяет обычным жестам пана/зума работать без конфликта.
  const shapeMove = Gesture.Pan()
    .enabled(selectTool && !dragMode && selectedShapes.length === 1)
    .minDistance(MOVE_START_DISTANCE_PX)
    .maxPointers(1)
    .onTouchesDown((e, manager) => {
      if (moveActive.get() || moveOrigin.get()) clearMove();
      const selected = selectedSV.get();
      const t = e.changedTouches[0];
      if (selected.length !== 1 || !t || e.numberOfTouches > 1) {
        manager.fail();
        return;
      }
      const vp = viewport.get();
      const world = screenToDrawing(vp, { x: t.x, y: t.y }, ucsSV.get());
      const hit = hitTest(selected, world, HIT_TOLERANCE_PX / safeK(vp));
      if (!hit) {
        manager.fail();
        return;
      }
      moveOrigin.set(selected[0]);
      moveOffset.set({ x: 0, y: 0 });
      moveActive.set(true);
    })
    .onUpdate((e) => {
      if (!moveActive.get() || !moveOrigin.get()) return;
      const kk = safeK(viewport.get());
      const ucs = ucsSV.get();
      const rad = (ucs.angle * Math.PI) / 180;
      const worldDx = e.translationX / kk;
      const worldDy = -e.translationY / kk;
      moveOffset.set({
        x: Math.cos(rad) * worldDx + Math.sin(rad) * worldDy,
        y: -Math.sin(rad) * worldDx + Math.cos(rad) * worldDy,
      });
    })
    .onEnd((_e, success) => {
      const origin = moveOrigin.get();
      const offset = moveOffset.get();
      if (!success || !origin) {
        clearMove();
        return;
      }
      const finished = translateShape(origin, offset.x, offset.y);
      if (JSON.stringify(finished) === JSON.stringify(origin)) {
        clearMove();
        return;
      }
      // История меняется только здесь: всё перемещение — один шаг «Отменить».
      moveActive.set(false);
      scheduleOnRN(onUpdateShape, finished);
    })
    .onFinalize(() => {
      if (moveActive.get()) clearMove();
    });

  // Рукоятки важнее остальных жестов. Перемещение и рамка соревнуются через Race:
  // сдвиг сразу начинает Move, а неподвижное долгое нажатие по-прежнему начинает рамку.
  const gesture = Gesture.Exclusive(
    handleDrag,
    // Лупа имеет приоритет над тапом: при коротком касании она отклоняется и срабатывает
    // тап, а долгое нажатие перехватывает касание даже во время создания СК.
    loupe,
    Gesture.Simultaneous(pan, pinch, tap, Gesture.Race(shapeMove, marqueeGesture)),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
    height.set(e.nativeEvent.layout.height);
  };

  // Чертёж целиком. Рисуется на холсте и (увеличенным) внутри лупы, пока она открыта.
  const scene = (
    <>
      {/* Сетка: одна и та же плитка-сцена, её двигает и растягивает gridMatrix. */}
      <Group matrix={gridMatrix}>
        <Picture picture={gridPicture} />
      </Group>

      {/* Оси — поверх сетки, в px экрана. */}
      <Line p1={axisXStart} p2={axisXEnd} strokeWidth={AXIS_WIDTH_PX} color={canvasColors.axisX} />
      <Line p1={axisYStart} p2={axisYEnd} strokeWidth={AXIS_WIDTH_PX} color={canvasColors.axisY} />

      {/* Фигуры — в мм чертежа. На экран переводит матрица worldMatrix. */}
      <Group matrix={worldMatrix}>
        <Picture picture={shapesPicture} />
        {/* Выделенная фигура — поверх обычной, синяя и толще. */}
        <Picture picture={selectionPicture} />
        <Path
          path={pendingPath}
          style="stroke"
          strokeWidth={pendingDiameter}
          strokeCap="round"
          color={COLORS.pending}
        />

        <Path
          path={highlightStrokes}
          style="stroke"
          strokeWidth={highlightWidth}
          strokeCap="round"
          color={COLORS.snap}
        />
        <Path
          path={highlightPoints}
          style="stroke"
          strokeWidth={pendingDiameter}
          strokeCap="round"
          color={COLORS.snap}
        />
      </Group>

      {/* Маркер привязки — в px экрана, его размер не зависит от зума. */}
      <Path path={snapMarker} style="stroke" strokeWidth={2} color={COLORS.snap} />
    </>
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.container, { backgroundColor: canvasColors.background }]}
        onLayout={onLayout}>
        <Canvas style={[styles.canvas, { backgroundColor: canvasColors.background }]}>
          {scene}
          <Path path={touchDot} style="fill" color={touchDotColor} />

          {/* Активная СК яркая, остальные — полупрозрачные; концы осей — треугольники. */}
          <Path path={ucsInactiveXPath} style="fill" color={COLORS.ucsX} opacity={0.35} />
          <Path path={ucsInactiveYPath} style="fill" color={COLORS.ucsY} opacity={0.35} />
          <Path path={ucsActiveXPath} style="fill" color={COLORS.ucsX} />
          <Path path={ucsActiveYPath} style="fill" color={COLORS.ucsY} />
          <Path path={ucsInactiveXPath} style="stroke" strokeWidth={1.5} color={COLORS.ucsX} opacity={0.35} />
          <Path path={ucsInactiveYPath} style="stroke" strokeWidth={1.5} color={COLORS.ucsY} opacity={0.35} />
          <Path path={ucsActiveXPath} style="stroke" strokeWidth={2.5} color={COLORS.ucsX} />
          <Path path={ucsActiveYPath} style="stroke" strokeWidth={2.5} color={COLORS.ucsY} />
          <Path path={ucsAxisPreviewPath} style="stroke" strokeWidth={2} color={COLORS.ucsX}>
            <DashPathEffect intervals={UCS_PREVIEW_DASH_PX} />
          </Path>
          <Path path={ucsDraftPath} style="stroke" strokeWidth={2} color={COLORS.pending} />

          {/* Рукоятки выделенной фигуры — синие квадратики с белой обводкой, в px экрана. */}
          <Path path={handlesPath} style="fill" color={COLORS.handle} />
          <Path
            path={handlesPath}
            style="stroke"
            strokeWidth={HANDLE_BORDER_PX}
            color={COLORS.handleBorder}
          />

          {/* Точки пересечения: яркий кружок с белой обводкой. */}
          <Path path={intersectPath} style="fill" color={COLORS.intersect} />
          <Path path={intersectPath} style="stroke" strokeWidth={2} color={COLORS.handleBorder} />

          {/* Зелёный квадратик: рукоятка привязалась к объекту. */}
          <Path path={dragSnapMarker} style="stroke" strokeWidth={2} color={COLORS.objectSnap} />

          {/* Рамка выделения — в px экрана: полупрозрачная заливка и синяя обводка. */}
          <Path path={marqueePath} style="fill" color={COLORS.marqueeFill} />
          <Path
            path={marqueePath}
            style="stroke"
            strokeWidth={MARQUEE_STROKE_PX}
            color={COLORS.marqueeStroke}
          />
          {/* Первый угол рамки при выделении в два тапа — крестик с кружком. */}
          <Path
            path={marqueePoint1Marker}
            style="stroke"
            strokeWidth={2}
            color={COLORS.marqueeStroke}
          />

          {/* Лупа: белый круг, внутри — увеличенный чертёж и перекрестие.
              Рисуется только пока она открыта, иначе чертёж пришлось бы рисовать дважды. */}
          {loupeVisible && (
            <>
              <Path path={loupeCircle} style="fill" color={canvasColors.background} />
              <Group clip={loupeCircle}>
                <Group transform={loupeTransform}>{scene}</Group>
                <Path path={crosshair} style="stroke" strokeWidth={1.5} color={COLORS.crosshair} />
              </Group>
              <Path path={loupeCircle} style="stroke" strokeWidth={4} color={canvasColors.loupeRim} />
              <Path
                path={loupeOuterCircle}
                style="stroke"
                strokeWidth={1}
                color={canvasColors.loupeOuterRim}
              />
            </>
          )}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CANVAS_COLORS.light.background,
  },
  canvas: {
    flex: 1,
  },
});
