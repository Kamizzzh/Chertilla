import { useCallback, useReducer } from 'react';

import type { Shape } from '@/types/shapes';

/** Сколько шагов назад можно отменить. Старые шаги забываются. */
const HISTORY_LIMIT = 20;

/**
 * История чертежа:
 * past    — прошлые состояния (последнее — самое свежее), для «Отменить»;
 * present — то, что сейчас на экране;
 * future  — отменённые состояния (первое — ближайшее), для «Вернуть».
 */
type HistoryState = {
  past: Shape[][];
  present: Shape[];
  future: Shape[][];
};

type HistoryAction =
  | { type: 'add'; shape: Shape }
  | { type: 'delete'; ids: string[] }
  | { type: 'update'; id: string; shape: Shape }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }
  | { type: 'set'; shapes: Shape[] };

/** Записывает новое состояние чертежа: текущее уходит в прошлое, «Вернуть» сбрасывается. */
function commit(state: HistoryState, next: Shape[]): HistoryState {
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'add':
      return commit(state, [...state.present, action.shape]);

    case 'delete': {
      // Удаление — один шаг истории, сколько бы фигур ни удалили:
      // одно «Отменить» вернёт их все на место.
      const ids = new Set(action.ids);
      const next = state.present.filter((s) => !ids.has(s.id));
      // Таких фигур нет — ничего не меняем и не засоряем историю.
      if (next.length === state.present.length) return state;
      return commit(state, next);
    }

    case 'update': {
      // Изменение фигуры: новая фигура встаёт на место старой с тем же id
      // (и тем же местом в списке). Одно «Отменить» вернёт старые параметры.
      const index = state.present.findIndex((s) => s.id === action.id);
      if (index === -1) return state;
      const updated: Shape = { ...action.shape, id: action.id };
      // Параметры не изменились (нажали «Сохранить», ничего не поправив) — шаг истории не нужен.
      if (JSON.stringify(updated) === JSON.stringify(state.present[index])) return state;
      const next = [...state.present];
      next[index] = updated;
      return commit(state, next);
    }

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: rest,
      };
    }

    case 'clear':
      // Пустой холст очищать незачем — не засоряем историю лишним шагом.
      if (state.present.length === 0) return state;
      // Очистка — обычный шаг истории: её можно отменить, если нажали случайно.
      return commit(state, []);

    case 'set':
      // Полная замена чертежа (загрузка проекта): история начинается заново,
      // чтобы «Отменить» не вернул чертёж, который был до загрузки.
      return { past: [], present: action.shapes, future: [] };
  }
}

const INITIAL_STATE: HistoryState = { past: [], present: [], future: [] };

/**
 * Фигуры чертежа с историей действий
 * (Добавить / Удалить / Изменить / Отменить / Вернуть / Очистить / Заменить целиком).
 */
export function useShapeHistory() {
  const [state, dispatch] = useReducer(historyReducer, INITIAL_STATE);

  const addShape = useCallback((shape: Shape) => dispatch({ type: 'add', shape }), []);
  const deleteShapes = useCallback((ids: string[]) => dispatch({ type: 'delete', ids }), []);
  const updateShape = useCallback(
    (id: string, newShapeData: Shape) => dispatch({ type: 'update', id, shape: newShapeData }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const setShapes = useCallback(
    (newShapes: Shape[]) => dispatch({ type: 'set', shapes: newShapes }),
    [],
  );

  return {
    shapes: state.present,
    addShape,
    deleteShapes,
    updateShape,
    undo,
    redo,
    clear,
    setShapes,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
