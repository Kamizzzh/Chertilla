import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CoordinateModal,
  type CoordinateFields,
  type CoordinateInitial,
  type CoordinateInput,
} from '@/components/CoordinateModal';
import { DrawingCanvas, type DrawingCanvasHandle, type EditMode } from '@/components/DrawingCanvas';
import { DivideModal } from '@/components/DivideModal';
import { ErrorLogModal } from '@/components/ErrorLogModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import LineStylePicker from '@/components/LineStylePicker';
import { PerfMonitor, PerfToggle } from '@/components/PerfMonitor';
import { SelectionVignette } from '@/components/SelectionVignette';
import { SettingsModal } from '@/components/SettingsModal';
import { Toolbar } from '@/components/Toolbar';
import { FLOATING_MARGIN, TopBar } from '@/components/TopBar';
import { UcsModal } from '@/components/UcsModal';
import { XLineMenu } from '@/components/XLineMenu';
import { CANVAS_COLORS } from '@/constants/canvasTheme';
import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useShapeHistory } from '@/hooks/useShapeHistory';
import type { DimensionAxis, LineStyle, Shape, ShapeAppearance, Tool, XLineMode } from '@/types/shapes';
import type { UCS, UcsAction } from '@/types/ucs';
import { recordAction } from '@/utils/actionHistory';
import { recordError } from '@/utils/errorLog';
import { sendFeedback } from '@/utils/feedback';
import { divideShape, getArcFrom3Points, roundAngle } from '@/utils/geometry';
import { computeIntersection } from '@/utils/intersection';
import { parseNumber } from '@/utils/number';
import { shareDrawing, type ExportFormat } from '@/utils/shareExport';
import { translateShape } from '@/utils/shapeTransform';
import { getProject, loadProject, saveProject, type ProjectLoadResult } from '@/utils/storage';
import { WCS } from '@/utils/ucs';
import { roundMm, type Point } from '@/utils/viewport';

// Простой счётчик для уникальных id фигур.
let nextShapeId = 1;
let nextUcsId = 1;
function makeId(): string {
  return String(nextShapeId++);
}

/**
 * После загрузки проекта счётчик продолжает нумерацию после самого большого id,
 * иначе новые фигуры получили бы id, уже занятые загруженными.
 */
function continueIdsAfter(shapes: Shape[]) {
  for (const shape of shapes) {
    const n = Number(shape.id);
    if (Number.isInteger(n) && n >= nextShapeId) nextShapeId = n + 1;
  }
}

/** Продолжает нумерацию СК после загрузки, чтобы новые id не совпадали с сохранёнными. */
function continueUcsIdsAfter(systems: UCS[]) {
  for (const ucs of systems) {
    const match = /^ucs-(\d+)$/.exec(ucs.id);
    const n = match ? Number(match[1]) : NaN;
    if (Number.isInteger(n) && n >= nextUcsId) nextUcsId = n + 1;
  }
}

/**
 * Приводит угол прямой к диапазону [0°, 180°) и округляет до 0.001°.
 * У прямой нет направления: 30° и 210° — одна и та же линия.
 */
function normalizeLineAngle(deg: number): number {
  const a = ((deg % 180) + 180) % 180;
  return roundMm(a) % 180;
}

/** Координаты точки для подсказок: «(12.5; -3)». */
function formatPoint(p: Point): string {
  return `(${p.x}; ${p.y})`;
}

/** Совпадают ли две точки. */
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Название фигуры для панели действий. */
const SHAPE_NAMES: Record<Shape['type'], string> = {
  point: 'Точка',
  segment: 'Отрезок',
  circle: 'Окружность',
  xline: 'Прямая',
  rect: 'Прямоугольник',
  arc: 'Дуга',
  dimension: 'Размер',
};

const SHAPE_CREATED_ACTIONS: Record<Shape['type'], string> = {
  point: 'Создана точка',
  segment: 'Создан отрезок',
  circle: 'Создана окружность',
  xline: 'Создана прямая',
  rect: 'Создан прямоугольник',
  arc: 'Создана дуга',
  dimension: 'Создан размер',
};

const TOOL_NAMES: Record<Tool, string> = {
  none: 'Без инструмента',
  select: 'Выделение',
  point: 'Точка',
  segment: 'Отрезок',
  circle: 'Окружность',
  xline: 'Прямая',
  rect: 'Прямоугольник',
  arc: 'Дуга',
  dimension: 'Размер',
  intersect: 'Пересечение',
  divide: 'Разделить',
};

// Размерная линия нового размера стоит на таком расстоянии от измеряемых точек, мм.
// Потом её можно сдвинуть рукояткой.
const DEFAULT_DIMENSION_OFFSET_MM = 10;
// Дубликат смещается по обеим осям, чтобы не лежать точно поверх исходной фигуры.
const COPY_OFFSET_MM = 10;

/** Какие поля показать в окне «Изменить» и чем их заполнить — по типу фигуры. */
function getEditFields(shape: Shape): { fields: CoordinateFields; initial: CoordinateInitial } {
  switch (shape.type) {
    case 'point':
      return { fields: 'xy', initial: { p: shape.p } };
    case 'segment':
      return { fields: 'segment', initial: { p: shape.start, p2: shape.end } };
    case 'circle':
      return { fields: 'circle', initial: { p: shape.center, radius: shape.radius } };
    case 'xline':
      return { fields: 'xyAngle', initial: { p: shape.point, angle: shape.angle } };
    case 'rect':
      // Те же поля X1, Y1, X2, Y2, что у отрезка: два противоположных угла.
      return { fields: 'segment', initial: { p: shape.p1, p2: shape.p2 } };
    case 'arc':
      return {
        fields: 'arc',
        initial: {
          p: shape.center,
          radius: shape.radius,
          angle: shape.startAngle,
          angle2: shape.endAngle,
        },
      };
    case 'dimension':
      // Измеряемые точки — как концы отрезка. Смещение размерной линии меняется рукояткой.
      return { fields: 'segment', initial: { p: shape.p1, p2: shape.p2 } };
  }
}

/** Выход в главное меню. Если экран открыт напрямую (истории переходов нет) — заменяем его меню. */
function goToMenu() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const insets = useSafeAreaInsets();
  const { colors, colorScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canvasColors = CANVAS_COLORS[colorScheme];

  const [tool, setTool] = useState<Tool>('none');
  // Фигуры чертежа и история действий (Отменить / Вернуть).
  const {
    shapes,
    addShape: addShapeToHistory,
    addShapes: addShapesToHistory,
    deleteShapes,
    updateShape,
    updateShapes,
    undo,
    redo,
    setShapes,
    canUndo,
    canRedo,
  } = useShapeHistory();

  // Все способы построения проходят через эти обёртки, поэтому журнал не зависит от жеста или окна ввода.
  const addShape = useCallback(
    (shape: Shape) => {
      addShapeToHistory(shape);
      recordAction(SHAPE_CREATED_ACTIONS[shape.type]);
    },
    [addShapeToHistory],
  );
  const addShapes = useCallback(
    (newShapes: Shape[]) => {
      if (newShapes.length === 0) return;
      addShapesToHistory(newShapes);
      recordAction(`Создано фигур: ${newShapes.length}`);
    },
    [addShapesToHistory],
  );

  // id выделенных фигур (инструмент «Выделение»). Пустой массив — ничего не выделено.
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  // Сами фигуры. Тех, которых уже нет в чертеже (например, после «Отменить»), здесь нет;
  // если не осталось ни одной — панели нет.
  const selectedShapes = useMemo(() => {
    if (selectedShapeIds.length === 0) return [];
    const ids = new Set(selectedShapeIds);
    return shapes.filter((s) => ids.has(s.id));
  }, [shapes, selectedShapeIds]);
  const selectedCount = selectedShapes.length;
  // true, пока идёт выделение рамкой: холст пишет сюда в UI-потоке, виньетка читает.
  const marqueeActive = useSharedValue(false);
  // Поставлен первый угол рамки (выделение в два тапа) — ждём второй тап.
  const [marqueePending, setMarqueePending] = useState(false);

  const [projectName, setProjectName] = useState('');
  // Фигуры на момент последнего сохранения или загрузки. null — проект ещё загружается.
  // Сравнение по ссылке: «Отменить» до сохранённого состояния возвращает тот же массив,
  // поэтому чертёж снова считается сохранённым.
  const [savedShapes, setSavedShapes] = useState<Shape[] | null>(null);
  const isLoading = savedShapes === null;
  // Первая точка фигуры, которая строится в несколько тапов
  // (начало отрезка, центр окружности, первая точка прямой, угол прямоугольника,
  // начало дуги). null — фигура не начата.
  const [pendingStart, setPendingStart] = useState<Point | null>(null);
  // Вторая точка дуги (точка на дуге) — дуга строится в три тапа. null — ещё не поставлена.
  const [pendingMiddle, setPendingMiddle] = useState<Point | null>(null);

  // Настройки инструмента «Прямая».
  const [xlineMode, setXlineMode] = useState<XLineMode>('twoPoints');
  const [angleText, setAngleText] = useState('45');
  const customAngle = parseNumber(angleText);

  // Вид размера для инструмента «Размер».
  const [dimensionAxis, setDimensionAxis] = useState<DimensionAxis>('aligned');

  // Текущий CAD-стиль для новых фигур; null — автоматический чёрный/белый цвет.
  const [lineStyle, setLineStyle] = useState<LineStyle>('solid_thin');
  const [lineColor, setLineColor] = useState<string | null>(null);
  const appearance: ShapeAppearance = {
    lineStyle,
    color: lineColor ?? canvasColors.shape,
    autoColor: lineColor === null,
  };

  // СК живут на экране проекта: активная применяется к холсту, список — к меткам и окну.
  const [ucsList, setUcsList] = useState<UCS[]>([WCS]);
  const [activeUcsId, setActiveUcsId] = useState(WCS.id);
  const activeUCS = ucsList.find((ucs) => ucs.id === activeUcsId) ?? WCS;
  const [savedUcsList, setSavedUcsList] = useState<UCS[] | null>(null);
  const [savedActiveUcsId, setSavedActiveUcsId] = useState(WCS.id);
  const isDirty =
    savedShapes !== null &&
    (shapes !== savedShapes || ucsList !== savedUcsList || activeUcsId !== savedActiveUcsId);
  const [ucsCreationActive, setUcsCreationActive] = useState(false);
  const [ucsOrigin, setUcsOrigin] = useState<Point | null>(null);
  const [ucsModalVisible, setUcsModalVisible] = useState(false);

  // Открыто ли окно ввода координат.
  const [coordModalVisible, setCoordModalVisible] = useState(false);
  // Открыто ли окно «Изменить» (параметры единственной выделенной фигуры).
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [errorLogVisible, setErrorLogVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  // Фигура, которую можно изменить: выделена ровно одна.
  const editTarget = selectedCount === 1 ? selectedShapes[0] : null;
  const editFields = editTarget ? getEditFields(editTarget) : null;
  // Режим изменения: 'drag' — на холсте рукоятки (нажата кнопка «Рукоятки»).
  // Сбрасывается вместе с выделением. Если выделенная фигура пропала, режим не действует.
  const [editMode, setEditMode] = useState<EditMode>('none');
  const dragMode = editMode === 'drag' && editTarget !== null;
  // Монитор производительности (FPS, память). Выключен по умолчанию,
  // кнопка «PERF» есть в любом проекте.
  const [perfVisible, setPerfVisible] = useState(false);
  // Привязка к сетке (шаг 10 мм) для тапа, лупы и рукояток. По умолчанию выключена.
  const [snapToGrid, setSnapToGrid] = useState(false);
  // Орто-режим: вторая точка отрезка или прямой даёт строго горизонтальную/вертикальную линию.
  const [isOrthoEnabled, setIsOrthoEnabled] = useState(false);

  // Инструмент ждёт вторую точку (отрезок, окружность, прямоугольник, прямая «2 точки»).
  // Дуга ждёт ещё и третью — см. pendingMiddle.
  const twoStepTool =
    tool === 'segment' ||
    tool === 'circle' ||
    tool === 'rect' ||
    tool === 'dimension' ||
    (tool === 'xline' && xlineMode === 'twoPoints');
  // Инструмент строит фигуры (нужна кнопка «Ввод» координат).
  const drawingTool =
    tool !== 'none' && tool !== 'select' && tool !== 'intersect' && tool !== 'divide';

  // Инструмент «Пересечение»: id выбранных тапом фигур (0, 1 или 2).
  const [intersectIds, setIntersectIds] = useState<string[]>([]);
  // Результат для двух выбранных фигур. Если одна из них пропала (например, после «Отменить») — null.
  const intersectPair = useMemo(
    () =>
      intersectIds
        .map((sid) => shapes.find((s) => s.id === sid))
        .filter((s): s is Shape => s !== undefined),
    [shapes, intersectIds],
  );
  const intersection = useMemo(
    () => (intersectPair.length === 2 ? computeIntersection(intersectPair[0], intersectPair[1]) : null),
    [intersectPair],
  );
  // Варианты точек и те из них, что рисуются маркерами на холсте.
  const intersectOptions = intersection?.options ?? [];
  const markerOptions = useMemo(
    () => (intersection ? intersection.options.filter((o) => o.marker) : []),
    [intersection],
  );
  const intersectMarkers = useMemo(() => markerOptions.map((o) => o.p), [markerOptions]);

  // Инструмент «Разделить»: выбранная фигура и окно ввода количества сегментов.
  const [divideTargetId, setDivideTargetId] = useState<string | null>(null);
  const [divideModalVisible, setDivideModalVisible] = useState(false);
  const divideTarget = shapes.find((s) => s.id === divideTargetId) ?? null;

  // Выбранные фигуры подсвечиваются тем же синим, что и выделение.
  const canvasSelectedIds =
    tool === 'intersect'
      ? intersectPair.map((s) => s.id)
      : tool === 'divide' && divideTarget
        ? [divideTarget.id]
        : selectedShapeIds;

  /** Убирает недостроенную фигуру (все уже поставленные её точки). */
  const clearPending = () => {
    setPendingStart(null);
    setPendingMiddle(null);
    setIntersectIds([]);
    setDivideTargetId(null);
    setDivideModalVisible(false);
    setUcsCreationActive(false);
    setUcsOrigin(null);
  };

  /** Создаёт обычную точку в выбранном месте пересечения и начинает выбор заново. */
  const createIntersectPoint = (p: Point) => {
    addShape({ id: makeId(), ...appearance, type: 'point', p: { x: roundMm(p.x), y: roundMm(p.y) } });
    setIntersectIds([]);
  };

  const handleIntersectTap = (shape: Shape | null, markerIndex: number) => {
    // Тап по уже найденной точке — она просто создаётся.
    if (markerIndex >= 0) {
      const option = markerOptions[markerIndex];
      if (option) createIntersectPoint(option.p);
      return;
    }
    if (!shape) {
      setIntersectIds([]); // тап по пустому месту — начать выбор заново
      return;
    }
    if (intersectIds.length === 1) {
      if (intersectIds[0] === shape.id) return; // та же фигура — вторую ещё ждём
      setIntersectIds([intersectIds[0], shape.id]);
      return;
    }
    // Нет выбранных или уже выбрана пара — начинаем новую пару.
    setIntersectIds([shape.id]);
  };

  const handleDivideTap = (shape: Shape | null) => {
    if (!shape) {
      setDivideTargetId(null);
      return;
    }
    setDivideTargetId(shape.id);
    setDivideModalVisible(true);
  };

  const closeDivideModal = () => {
    setDivideModalVisible(false);
    setDivideTargetId(null);
  };

  const handleDivideSubmit = (segments: number): string | null => {
    if (
      !divideTarget ||
      (divideTarget.type !== 'segment' &&
        divideTarget.type !== 'circle' &&
        divideTarget.type !== 'arc')
    ) {
      return 'Выбранная фигура больше недоступна';
    }
    const points = divideShape(divideTarget, segments);
    if (points.length === 0) return 'Не удалось разделить фигуру';

    // Все точки добавляются одним действием: одно «Отменить» удалит всю группу.
    addShapes(points.map((p) => ({ id: makeId(), ...appearance, type: 'point' as const, p })));
    closeDivideModal();
    return null;
  };

  /** Новое выделение. Режим перетаскивания рукояток при этом всегда выключается. */
  const selectShapes = (ids: string[]) => {
    setSelectedShapeIds(ids);
    setEditMode('none');
    if (ids.length === 1) {
      const shape = shapes.find((s) => s.id === ids[0]);
      if (shape) {
        setLineStyle(shape.lineStyle ?? 'solid_thin');
        setLineColor(shape.autoColor === false ? shape.color : null);
      }
    }
  };

  const selectTool = (next: Tool) => {
    recordAction(next === 'none' ? 'Инструмент отключен' : `Выбран инструмент: ${TOOL_NAMES[next]}`);
    setTool(next);
    clearPending(); // при смене инструмента недостроенная фигура сбрасывается
    selectShapes([]); // и выделение тоже
    canvasRef.current?.cancelMarquee(); // и начатая рамка
  };

  const handleLineStyleChange = (next: LineStyle) => {
    setLineStyle(next);
    if (tool === 'select' && selectedShapes.length > 0) {
      updateShapes(selectedShapes.map((shape) => ({ ...shape, lineStyle: next })));
      recordAction('Изменён стиль выделенных фигур');
    }
  };

  const handleLineColorChange = (next: string | null) => {
    setLineColor(next);
    if (tool === 'select' && selectedShapes.length > 0) {
      updateShapes(
        selectedShapes.map((shape) => ({
          ...shape,
          color: next ?? canvasColors.shape,
          autoColor: next === null,
        })),
      );
      recordAction('Изменён цвет выделенных фигур');
    }
  };

  const deleteUcs = (ucsId: string) => {
    if (ucsId === WCS.id) return;
    setUcsList((current) => current.filter((ucs) => ucs.id !== ucsId));
    if (activeUcsId === ucsId) setActiveUcsId(WCS.id);
    recordAction('Удалена система координат');
  };

  const handleUcsAction = (action: UcsAction) => {
    if (action === 'wcs') {
      setActiveUcsId(WCS.id);
      setUcsCreationActive(false);
      setUcsOrigin(null);
      recordAction('Активна мировая система координат');
    } else if (action === 'create') {
      selectTool('none');
      setUcsCreationActive(true);
      setUcsOrigin(null);
      recordAction('Начато создание системы координат');
    } else if (action === 'delete') {
      deleteUcs(activeUcsId);
    } else {
      setUcsModalVisible(true);
    }
  };

  const handleUcsTap = (p: Point) => {
    if (!ucsCreationActive) return;
    if (!ucsOrigin) {
      setUcsOrigin(p);
      return;
    }
    if (samePoint(p, ucsOrigin)) return;
    const angle = roundAngle((Math.atan2(p.y - ucsOrigin.y, p.x - ucsOrigin.x) * 180) / Math.PI);
    const number = nextUcsId++;
    const created: UCS = {
      id: `ucs-${number}`,
      name: `СК ${number}`,
      dx: roundMm(ucsOrigin.x),
      dy: roundMm(ucsOrigin.y),
      angle,
    };
    setUcsList((current) => [...current, created]);
    setActiveUcsId(created.id);
    setUcsCreationActive(false);
    setUcsOrigin(null);
    recordAction(`Создана система координат: ${created.name}`);
  };

  // Кнопки панели действий с выделенными фигурами.
  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    // Один шаг истории на все фигуры: одно «Отменить» вернёт их все.
    deleteShapes(selectedShapes.map((s) => s.id));
    recordAction(
      selectedCount === 1
        ? `Удалена фигура: ${SHAPE_NAMES[selectedShapes[0].type]}`
        : `Удалено фигур: ${selectedCount}`,
    );
    selectShapes([]);
  };

  // Копия добавляется одним шагом истории и сразу становится единственной выделенной фигурой.
  const handleCopySelected = () => {
    if (tool !== 'select' || selectedCount !== 1) return;
    const source = selectedShapes[0];
    const copy = {
      ...translateShape(source, COPY_OFFSET_MM, COPY_OFFSET_MM),
      id: makeId(),
    };
    addShape(copy);
    selectShapes([copy.id]);
  };

  // «Рукоятки» и «Ввод ⌨» — только для одной фигуры, сразу, без промежуточных вопросов.
  const handleStartDrag = () => {
    if (!editTarget) return;
    setEditMode('drag');
  };

  const handleOpenEditModal = () => {
    if (!editTarget) return;
    setEditModalVisible(true);
  };

  /**
   * Новые параметры из окна «Изменить». Фигура заменяется на новую с тем же id
   * (один шаг истории) и остаётся выделенной.
   */
  const handleEditSubmit = ({ p, p2, radius, angle, angle2 }: CoordinateInput): string | null => {
    if (!editTarget) return 'Фигура больше не выделена';
    if (!p) return 'Введите координаты';

    let next: Shape;
    switch (editTarget.type) {
      case 'point':
        next = { ...editTarget, p };
        break;
      case 'segment':
        if (!p2) return 'Введите координаты конца отрезка';
        if (p.x === p2.x && p.y === p2.y) {
          return 'Начало и конец совпадают — отрезок получится нулевой длины';
        }
        next = { ...editTarget, start: p, end: p2 };
        break;
      case 'circle':
        if (radius === null) return 'Введите радиус';
        next = { ...editTarget, center: p, radius };
        break;
      case 'xline':
        if (angle === null) return 'Введите угол';
        next = { ...editTarget, point: p, angle: normalizeLineAngle(angle) };
        break;
      case 'rect':
        if (!p2) return 'Введите координаты второго угла';
        if (p.x === p2.x || p.y === p2.y) {
          return 'Углы на одной горизонтали или вертикали — прямоугольник получится нулевой ширины или высоты';
        }
        next = { ...editTarget, p1: p, p2 };
        break;
      case 'arc': {
        if (radius === null) return 'Введите радиус';
        if (angle === null || angle2 === null) return 'Введите оба угла';
        // Углы приводим к [0°, 360°): 370° и 10° — одно и то же направление.
        const startAngle = roundAngle(angle);
        const endAngle = roundAngle(angle2);
        if (startAngle === endAngle) return 'Углы совпадают — дуга получится нулевой длины';
        next = { ...editTarget, center: p, radius, startAngle, endAngle };
        break;
      }
      case 'dimension':
        if (!p2) return 'Введите координаты второй точки';
        if (samePoint(p, p2)) return 'Точки совпадают — измерять нечего';
        next = { ...editTarget, p1: p, p2 };
        break;
    }
    updateShape(editTarget.id, next);
    recordAction(`Изменена фигура: ${SHAPE_NAMES[next.type]}`);
    setEditModalVisible(false);
    return null;
  };

  // Фигуру изменили на холсте, потянув за рукоятку: тот же шаг истории, что и «Изменить».
  // Фигура остаётся выделенной (id тот же).
  const handleCanvasUpdateShape = (shape: Shape) => {
    updateShape(shape.id, shape);
    recordAction(`Изменена фигура: ${SHAPE_NAMES[shape.type]}`);
  };

  const selectDimensionAxis = (next: DimensionAxis) => {
    setDimensionAxis(next);
    clearPending();
  };

  const selectXlineMode = (next: XLineMode) => {
    setXlineMode(next);
    clearPending();
  };

  const handleToggleSnapToGrid = () => {
    const next = !snapToGrid;
    setSnapToGrid(next);
    recordAction(next ? 'Включена привязка к сетке' : 'Выключена привязка к сетке');
  };

  const handleToggleOrtho = () => {
    const next = !isOrthoEnabled;
    setIsOrthoEnabled(next);
    recordAction(next ? 'Включен Орто-режим' : 'Выключен Орто-режим');
  };

  // При отмене, возврате и загрузке недостроенная фигура и выделение сбрасываются:
  // они могли относиться к уже исчезнувшему состоянию чертежа.
  const handleUndo = () => {
    if (!canUndo) return;
    recordAction('Отмена действия');
    clearPending();
    selectShapes([]);
    undo();
  };

  const handleRedo = () => {
    if (!canRedo) return;
    recordAction('Повтор действия');
    clearPending();
    selectShapes([]);
    redo();
  };

  /** Сохраняет чертёж. Ошибка попадает в журнал и не закрывает рабочий экран. */
  const save = useCallback(async (): Promise<boolean> => {
    try {
      const customUcs = ucsList.filter((ucs) => ucs.id !== WCS.id);
      await saveProject(id, shapes, activeUCS, customUcs);
      setSavedShapes(shapes);
      setSavedUcsList(ucsList);
      setSavedActiveUcsId(activeUcsId);
      recordAction('Проект сохранён');
      return true;
    } catch (e) {
      recordAction('Ошибка сохранения проекта');
      recordError(e, 'Не удалось сохранить проект');
      return false;
    }
  }, [id, shapes, activeUCS, activeUcsId, ucsList]);

  const handleSave = async () => {
    if (await save()) Alert.alert('Сохранено', `Фигур в проекте: ${shapes.length}`);
  };

  const handleFeedbackSubmit = async (text: string): Promise<string | null> => {
    const sent = await sendFeedback(text, {
      projectId: id,
      projectName,
      toolName: TOOL_NAMES[tool],
      shapeCount: shapes.length,
      isDirty,
    });
    if (!sent) {
      return 'Сообщение не отправлено. Проверьте интернет и настройку Telegram, затем повторите.';
    }
    recordAction('Отправлено сообщение об ошибке');
    return null;
  };

  // Экспорт текущего чертежа (включая несохранённые изменения) в SVG или DXF.
  const handleExport = async (format: ExportFormat) => {
    if (shapes.length === 0) {
      Alert.alert('Нечего экспортировать', 'На чертеже пока нет фигур.');
      return;
    }
    try {
      await shareDrawing(shapes, projectName, format);
    } catch (e) {
      recordError(e, `Не удалось экспортировать чертёж в ${format.toUpperCase()}`);
    }
  };

  /** Показывает фигуры и СК, прочитанные из файла (история действий начинается заново). */
  const applyLoaded = useCallback(
    (result: ProjectLoadResult) => {
      const list = result.shapes ?? []; // файла нет — проект пустой
      const loadedUcsList = [WCS, ...result.customUcs];
      continueIdsAfter(list);
      continueUcsIdsAfter(result.customUcs);
      setPendingStart(null);
      setPendingMiddle(null);
      setIntersectIds([]);
      setDivideTargetId(null);
      setDivideModalVisible(false);
      setSelectedShapeIds([]);
      setEditMode('none');
      setUcsCreationActive(false);
      setUcsOrigin(null);
      setUcsList(loadedUcsList);
      setActiveUcsId(result.activeUcs.id);
      setSavedUcsList(loadedUcsList);
      setSavedActiveUcsId(result.activeUcs.id);
      setShapes(list); // заодно очищает историю: «Отменить» не откатит загрузку
      setSavedShapes(list);
      if (result.recovered) {
        recordError(
          new Error('Повреждённый файл чертежа заменён пустым проектом'),
          'Восстановление проекта',
        );
      }
      recordAction(
        result.recovered
          ? 'Повреждённый файл заменён пустым проектом'
          : `Загружен проект: ${list.length} фигур`,
      );
    },
    [setShapes],
  );

  // Кнопка «Загрузить»: вернуть чертёж к последнему сохранению.
  const handleLoad = async () => {
    try {
      applyLoaded(await loadProject(id));
    } catch (e) {
      recordError(e, 'Не удалось загрузить сохранённый проект');
    }
  };

  // Открыли экран — загружаем название и фигуры проекта. Ошибки не показываются
  // отдельными окнами: их можно посмотреть позже в «Журнале ошибок».
  useEffect(() => {
    getProject(id)
      .then((meta) => setProjectName(meta?.name ?? 'Без названия'))
      .catch((e: unknown) => {
        recordError(e, 'Не удалось прочитать название проекта');
        setProjectName('Без названия');
      });
    loadProject(id)
      .then(applyLoaded)
      .catch((e: unknown) => {
        recordError(e, 'Не удалось открыть проект');
        goToMenu();
      });
  }, [id, applyLoaded]);

  // Кнопка «Назад»: если есть несохранённые изменения — спрашиваем, что с ними делать.
  const handleBack = useCallback(() => {
    if (!isDirty) {
      goToMenu();
      return;
    }
    Alert.alert('Есть несохранённые изменения', 'Сохранить чертёж перед выходом?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Не сохранять', style: 'destructive', onPress: goToMenu },
      {
        text: 'Сохранить',
        onPress: async () => {
          if (await save()) goToMenu();
        },
      },
    ]);
  }, [isDirty, save]);

  // Системная кнопка «Назад» на Android работает так же, как круглая кнопка «Назад» на экране.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true; // true — сами обработали, стандартный выход не нужен
      });
      return () => sub.remove();
    }, [handleBack]),
  );

  const handleTap = (p: Point, hitSegment?: Shape | null) => {
    // При «Выделении» фигуры не создаются (тап обрабатывает холст через onSelectShapes).
    if (tool === 'select') return;

    if (tool === 'dimension') {
      // Тап по отрезку — размер его длины (p1, p2 — концы отрезка).
      if (!pendingStart && hitSegment?.type === 'segment') {
        addShape({
          id: makeId(), ...appearance,
          type: 'dimension',
          p1: hitSegment.start,
          p2: hitSegment.end,
          offset: DEFAULT_DIMENSION_OFFSET_MM,
          axis: dimensionAxis,
        });
        return;
      }
      // Иначе — две точки: первая запоминается, вторая создаёт размер.
      if (!pendingStart) {
        setPendingStart(p);
        return;
      }
      if (samePoint(p, pendingStart)) return;
      addShape({
        id: makeId(), ...appearance,
        type: 'dimension',
        p1: pendingStart,
        p2: p,
        offset: DEFAULT_DIMENSION_OFFSET_MM,
        axis: dimensionAxis,
      });
      setPendingStart(null);
      return;
    }

    if (tool === 'point') {
      addShape({ id: makeId(), ...appearance, type: 'point', p });
      return;
    }

    if (tool === 'segment') {
      if (!pendingStart) {
        setPendingStart(p);
        return;
      }
      // Отрезок нулевой длины не создаём — ждём другую вторую точку.
      if (p.x === pendingStart.x && p.y === pendingStart.y) return;
      addShape({ id: makeId(), ...appearance, type: 'segment', start: pendingStart, end: p });
      setPendingStart(null);
      return;
    }

    if (tool === 'circle') {
      if (!pendingStart) {
        setPendingStart(p);
        return;
      }
      const radius = roundMm(Math.hypot(p.x - pendingStart.x, p.y - pendingStart.y));
      // Окружность нулевого радиуса не создаём — ждём другую точку.
      if (radius <= 0) return;
      addShape({ id: makeId(), ...appearance, type: 'circle', center: pendingStart, radius });
      setPendingStart(null);
      return;
    }

    if (tool === 'rect') {
      if (!pendingStart) {
        setPendingStart(p);
        return;
      }
      // Второй угол на одной горизонтали или вертикали с первым — прямоугольник
      // нулевой ширины или высоты не создаём, ждём другую точку.
      if (p.x === pendingStart.x || p.y === pendingStart.y) return;
      addShape({ id: makeId(), ...appearance, type: 'rect', p1: pendingStart, p2: p });
      setPendingStart(null);
      return;
    }

    if (tool === 'arc') {
      // Дуга в три тапа: начало, любая точка на дуге, конец.
      if (!pendingStart) {
        setPendingStart(p);
        return;
      }
      if (!pendingMiddle) {
        if (samePoint(p, pendingStart)) return;
        setPendingMiddle(p);
        return;
      }
      // Точки на одной прямой (или совпадают) — дугу не построить, ждём другую третью точку.
      const arc = getArcFrom3Points(pendingStart, pendingMiddle, p);
      if (!arc) return;
      addShape({ id: makeId(), ...appearance, type: 'arc', ...arc });
      clearPending();
      return;
    }

    if (tool === 'xline') {
      Keyboard.dismiss(); // убираем клавиатуру после ввода угла

      if (xlineMode === 'axisX' || xlineMode === 'axisY') {
        const angle = xlineMode === 'axisX' ? 0 : 90;
        addShape({ id: makeId(), ...appearance, type: 'xline', point: p, angle });
        return;
      }

      if (xlineMode === 'angle') {
        // В поле не число — прямую не строим (поле подсвечено красным).
        if (customAngle === null) return;
        addShape({ id: makeId(), ...appearance, type: 'xline', point: p, angle: normalizeLineAngle(customAngle) });
        return;
      }

      // Режим «2 точки».
      if (!pendingStart) {
        setPendingStart(p);
        return;
      }
      if (p.x === pendingStart.x && p.y === pendingStart.y) return;
      const deg = (Math.atan2(p.y - pendingStart.y, p.x - pendingStart.x) * 180) / Math.PI;
      addShape({
        id: makeId(), ...appearance,
        type: 'xline',
        point: pendingStart,
        angle: normalizeLineAngle(deg),
      });
      setPendingStart(null);
    }
  };

  /**
   * Координаты из окна ввода. Проверяем то, что handleTap молча пропустил бы,
   * чтобы показать пользователю понятную ошибку, а не закрыть окно впустую.
   */
  const handleCoordSubmit = ({ p, radius }: CoordinateInput): string | null => {
    // Окружность с введённым радиусом строится сразу, без второй точки.
    // Центр — уже заданный (pendingStart) или только что введённые X и Y.
    if (tool === 'circle' && radius !== null) {
      const center = pendingStart ?? p;
      if (!center) return 'Сначала задайте центр окружности';
      addShape({ id: makeId(), ...appearance, type: 'circle', center, radius });
      setPendingStart(null);
      setCoordModalVisible(false);
      return null;
    }
    // Без X и Y окно присылает только радиус, а он обработан выше.
    if (!p) return 'Введите координаты';

    if ((twoStepTool || tool === 'arc') && pendingStart && samePoint(p, pendingStart)) {
      return 'Точка совпадает с первой точкой — фигура получится нулевой длины';
    }
    if (tool === 'rect' && pendingStart && (p.x === pendingStart.x || p.y === pendingStart.y)) {
      return 'Углы на одной горизонтали или вертикали — прямоугольник получится нулевой ширины или высоты';
    }
    if (tool === 'arc' && pendingStart && pendingMiddle) {
      if (samePoint(p, pendingMiddle)) return 'Точка совпадает со второй точкой дуги';
      if (!getArcFrom3Points(pendingStart, pendingMiddle, p)) {
        return 'Три точки лежат на одной прямой — дугу не построить';
      }
    }
    if (tool === 'xline' && xlineMode === 'angle' && customAngle === null) {
      return 'Сначала введите угол прямой в подменю';
    }
    // Ввели не последнюю точку фигуры — окно не закрываем,
    // оно сразу переключается на ввод следующей точки.
    const keepOpen = tool === 'arc' ? !pendingMiddle : twoStepTool && !pendingStart;
    handleTap(p);
    if (!keepOpen) setCoordModalVisible(false);
    return null;
  };

  // Заголовок окна ввода: что именно сейчас вводим.
  let coordTitle = 'Координаты точки';
  if (tool === 'segment') coordTitle = pendingStart ? 'Отрезок: конец' : 'Отрезок: начало';
  if (tool === 'circle') coordTitle = pendingStart ? 'Окружность: радиус' : 'Окружность: центр';
  if (tool === 'rect') {
    coordTitle = pendingStart ? 'Прямоугольник: второй угол' : 'Прямоугольник: первый угол';
  }
  if (tool === 'dimension') {
    coordTitle = pendingStart ? 'Размер: вторая точка' : 'Размер: первая точка';
  }
  if (tool === 'arc') {
    coordTitle = !pendingStart
      ? 'Дуга: начало'
      : !pendingMiddle
        ? 'Дуга: точка на дуге'
        : 'Дуга: конец';
  }
  if (tool === 'xline') {
    coordTitle =
      xlineMode === 'twoPoints'
        ? pendingStart
          ? 'Прямая: вторая точка'
          : 'Прямая: первая точка'
        : 'Прямая: точка';
  }
  let coordHint: string | undefined;
  if (twoStepTool && pendingStart) {
    let name = 'Первая точка';
    if (tool === 'circle') name = 'Центр';
    if (tool === 'rect') name = 'Первый угол';
    coordHint = `${name}: ${formatPoint(pendingStart)}`;
  }
  if (tool === 'arc' && pendingStart) {
    coordHint = `Начало: ${formatPoint(pendingStart)}`;
    if (pendingMiddle) coordHint += `\nТочка на дуге: ${formatPoint(pendingMiddle)}`;
  }
  // Для окружности есть поле радиуса: вместе с центром или (если центр уже задан) вместо точки.
  let coordFields: CoordinateFields = 'xy';
  if (tool === 'circle') coordFields = pendingStart ? 'radius' : 'xyRadius';

  return (
    <View style={styles.container}>
      <TopBar
        projectName={isDirty ? `${projectName} •` : projectName}
        canUndo={canUndo}
        canRedo={canRedo}
        onBack={handleBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onFeedback={() => setFeedbackModalVisible(true)}
        onLoad={handleLoad}
        onExport={handleExport}
        onErrorLog={() => setErrorLogVisible(true)}
        onSettings={() => setSettingsVisible(true)}
      />

      <View style={styles.canvasArea}>
        <DrawingCanvas
          ref={canvasRef}
          tool={tool}
          shapes={shapes}
          canvasColors={canvasColors}
          activeUCS={activeUCS}
          ucsList={ucsList}
          ucsCreationActive={ucsCreationActive}
          ucsOrigin={ucsOrigin}
          onUcsTap={handleUcsTap}
          pendingStart={pendingStart}
          pendingMiddle={pendingMiddle}
          selectedShapeIds={canvasSelectedIds}
          editMode={dragMode ? 'drag' : 'none'}
          snapToGrid={snapToGrid}
          isOrthoEnabled={isOrthoEnabled}
          intersectMarkers={intersectMarkers}
          onIntersectTap={handleIntersectTap}
          onDivideTap={handleDivideTap}
          onTap={handleTap}
          onSelectShapes={selectShapes}
          marqueeActive={marqueeActive}
          onMarqueePendingChange={setMarqueePending}
          onUpdateShape={handleCanvasUpdateShape}
        />

        {(drawingTool || (tool === 'select' && selectedCount > 0)) && (
          <LineStylePicker
            visible
            lineStyle={lineStyle}
            color={lineColor}
            onSelectStyle={handleLineStyleChange}
            onSelectColor={handleLineColorChange}
          />
        )}

        {/* Синее свечение по краям холста, пока тянут рамку выделения. */}
        {tool === 'select' && <SelectionVignette active={marqueeActive} />}

        {/* Нижний край холста: ввод координат, сброс вида и подменю прямой.
            box-none — пустые места этого блока пропускают касания на холст. */}
        <View
          pointerEvents="box-none"
          style={[styles.bottomOverlay, { left: insets.left + 12, right: insets.right + 16 }]}>
          {/* Кнопка ввода координат нужна, только когда выбран инструмент построения. */}
          {drawingTool && (
            <Pressable
              onPress={() => setCoordModalVisible(true)}
              style={({ pressed }) => [styles.coordButton, pressed && styles.coordButtonPressed]}>
              <Text style={styles.coordButtonIcon}>⌨</Text>
              <Text style={styles.coordButtonText}>Ввод</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => canvasRef.current?.resetView()}
            style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}>
            <Text style={styles.resetButtonText}>Сбросить вид</Text>
          </Pressable>

          {tool === 'xline' && (
            <XLineMenu
              mode={xlineMode}
              onSelectMode={selectXlineMode}
              angleText={angleText}
              onChangeAngleText={setAngleText}
              angleInvalid={customAngle === null}
            />
          )}

          {/* Панель действий с выделенными фигурами — внизу холста, сразу над панелью инструментов.
              Она поверх холста, а не между холстом и тулбаром: иначе холст менял бы размер
              и чертёж сдвигался бы при каждом выделении. */}
          {ucsCreationActive && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle} numberOfLines={2}>
                {ucsOrigin
                  ? 'СК: коснитесь точки на направлении оси X'
                  : 'СК: коснитесь центра X0, Y0'}
              </Text>
              <View style={styles.actionButtons}>
                <Pressable
                  onPress={() => {
                    setUcsCreationActive(false);
                    setUcsOrigin(null);
                  }}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                  <Text style={styles.actionButtonText}>Отмена</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Выделение в два тапа: первый угол рамки стоит, ждём второй. Пока эта подсказка
              видна, панель выделенных фигур скрыта — у обеих кнопка «Отмена» на одном месте. */}
          {marqueePending && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle} numberOfLines={1}>
                Рамка: коснитесь второго угла
              </Text>
              <View style={styles.actionButtons}>
                <Pressable
                  onPress={() => canvasRef.current?.cancelMarquee()}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                  <Text style={styles.actionButtonText}>Отмена</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Инструмент «Разделить»: выбор фигуры, затем число сегментов в отдельном окне. */}
          {tool === 'divide' && !divideModalVisible && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle} numberOfLines={2}>
                Разделить: коснитесь отрезка, окружности или дуги
              </Text>
            </View>
          )}

          {/* Инструмент «Пересечение»: подсказка, кнопки вариантов точки и «Отмена». */}
          {tool === 'intersect' && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle} numberOfLines={2}>
                {intersectPair.length === 0
                  ? 'Пересечение: коснитесь первой фигуры'
                  : intersectPair.length === 1
                    ? 'Пересечение: коснитесь второй фигуры'
                    : !intersection
                      ? 'Эти фигуры не поддерживаются'
                      : intersection.exact
                        ? intersectOptions.length > 4
                          ? 'Пересечений много: коснитесь нужного оранжевого кружка'
                          : 'Выберите точку или коснитесь оранжевого кружка'
                        : 'Фигуры не пересекаются. Ближайшие точки:'}
              </Text>
              <View style={styles.actionButtons}>
                {intersectOptions.length <= 4 &&
                  intersectOptions.map((option) => (
                    <Pressable
                      key={option.label}
                      onPress={() => createIntersectPoint(option.p)}
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionButtonPressed,
                      ]}>
                      <Text style={styles.actionButtonText} numberOfLines={1}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                {intersectIds.length > 0 && (
                  <Pressable
                    onPress={() => setIntersectIds([])}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                    <Text style={styles.actionButtonText} numberOfLines={1}>
                      Отмена
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Режим перетаскивания рукояток: вместо обычной панели — подсказка и «Готово». */}
          {!marqueePending && dragMode && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle} numberOfLines={2}>
                {`${SHAPE_NAMES[editTarget.type]}: тяните синие квадратики. Один палец мимо них — сдвиг вида`}
              </Text>
              <View style={styles.actionButtons}>
                <Pressable
                  onPress={() => setEditMode('none')}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                  <Text style={styles.actionButtonText}>Готово</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!marqueePending && !dragMode && selectedCount > 0 && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle} numberOfLines={1}>
                {selectedCount === 1
                  ? `Выбрано: 1 (${SHAPE_NAMES[selectedShapes[0].type]})`
                  : `Выбрано: ${selectedCount}`}
              </Text>
              <View style={styles.actionButtons}>
                <Pressable
                  onPress={handleDeleteSelected}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.actionButtonDanger,
                    pressed && styles.actionButtonDangerPressed,
                  ]}>
                  <Text
                    style={[styles.actionButtonText, styles.actionButtonTextDanger]}
                    numberOfLines={1}>
                    {selectedCount === 1 ? 'Удалить' : `Удалить (${selectedCount})`}
                  </Text>
                </Pressable>
                {/* Изменить можно только одну фигуру: при нескольких этих кнопок нет. */}
                {selectedCount === 1 && (
                  <>
                    <Pressable
                      onPress={handleStartDrag}
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionButtonPressed,
                      ]}>
                      <Text style={styles.actionButtonText} numberOfLines={1}>
                        Рукоятки
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleOpenEditModal}
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionButtonPressed,
                      ]}>
                      <Text style={styles.actionButtonText} numberOfLines={1}>
                        Ввод ⌨
                      </Text>
                    </Pressable>
                  </>
                )}
                <Pressable
                  onPress={() => selectShapes([])}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                  <Text style={styles.actionButtonText} numberOfLines={1}>
                    Отмена
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Правый верхний угол холста: кнопка «PERF» и под ней монитор производительности. */}
        <View
          pointerEvents="box-none"
          style={[
            styles.perfArea,
            {
              top: 8,
              right: insets.right + FLOATING_MARGIN,
            },
          ]}>
          <PerfToggle active={perfVisible} onPress={() => setPerfVisible((v) => !v)} />
          {perfVisible && <PerfMonitor />}
        </View>

        {/* Пока проект читается из файла, закрываем холст, чтобы не начать рисовать раньше времени. */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Загрузка проекта…</Text>
          </View>
        )}
      </View>

      <Toolbar
        activeTool={tool}
        onSelectTool={selectTool}
        dimensionAxis={dimensionAxis}
        onSelectDimensionAxis={selectDimensionAxis}
        snapToGrid={snapToGrid}
        onToggleSnapToGrid={handleToggleSnapToGrid}
        isOrthoEnabled={isOrthoEnabled}
        onToggleOrtho={handleToggleOrtho}
        canCopy={tool === 'select' && selectedCount === 1}
        onCopy={handleCopySelected}
        canDelete={selectedCount > 0}
        onDelete={handleDeleteSelected}
        activeUcsId={activeUcsId}
        ucsCreationActive={ucsCreationActive}
        onUcsAction={handleUcsAction}
      />

      <DivideModal
        visible={divideModalVisible && divideTarget !== null}
        shapeName={divideTarget ? SHAPE_NAMES[divideTarget.type] : 'фигура'}
        onCancel={closeDivideModal}
        onSubmit={handleDivideSubmit}
      />

      <FeedbackModal
        visible={feedbackModalVisible}
        onClose={() => setFeedbackModalVisible(false)}
        onSubmit={handleFeedbackSubmit}
      />

      <ErrorLogModal visible={errorLogVisible} onClose={() => setErrorLogVisible(false)} />
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <UcsModal
        visible={ucsModalVisible}
        systems={ucsList}
        activeId={activeUcsId}
        onSelect={(ucsId) => {
          setActiveUcsId(ucsId);
          recordAction('Переключена система координат');
        }}
        onDelete={deleteUcs}
        onClose={() => setUcsModalVisible(false)}
      />

      <CoordinateModal
        visible={coordModalVisible}
        title={coordTitle}
        hint={coordHint}
        fields={coordFields}
        onCancel={() => setCoordModalVisible(false)}
        onSubmit={handleCoordSubmit}
      />

      {/* Окно «Изменить» — отдельный экземпляр того же окна: так значения, которые
          пользователь вводил при построении, не затираются параметрами изменённой фигуры. */}
      <CoordinateModal
        visible={editModalVisible && editTarget !== null}
        title={editTarget ? `Изменить: ${SHAPE_NAMES[editTarget.type]}` : 'Изменить'}
        fields={editFields?.fields ?? 'xy'}
        initial={editFields?.initial}
        submitLabel="Сохранить"
        onCancel={() => setEditModalVisible(false)}
        onSubmit={handleEditSubmit}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    canvasArea: {
      flex: 1,
    },
    bottomOverlay: {
      position: 'absolute',
      bottom: 16,
      gap: 10,
      alignItems: 'flex-start',
    },
    coordButton: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 52,
      paddingHorizontal: 20,
      borderRadius: 26,
      // Синий акцент — единственная цветная кнопка на экране, поэтому сразу заметна.
      backgroundColor: colors.accent,
      // Тень, чтобы кнопка «парила» над холстом.
      elevation: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 3 },
    },
    coordButtonPressed: {
      backgroundColor: colors.accentPressed,
    },
    coordButtonIcon: {
      fontSize: 22,
      color: colors.onAccent,
    },
    coordButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.onAccent,
    },
    resetButton: {
      alignSelf: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    resetButtonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    resetButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    actionPanel: {
      alignSelf: 'stretch',
      gap: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
    },
    actionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accentText,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 6,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    actionButtonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    actionButtonDanger: {
      backgroundColor: colors.dangerSurface,
      borderColor: colors.dangerBorder,
    },
    actionButtonDangerPressed: {
      backgroundColor: colors.dangerPressed,
    },
    actionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    actionButtonTextDanger: {
      color: colors.dangerText,
    },
    perfArea: {
      position: 'absolute',
      alignItems: 'flex-end',
      gap: 6,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      fontSize: 15,
      color: colors.textMuted,
    },
  });
