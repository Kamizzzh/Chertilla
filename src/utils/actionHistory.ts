const ACTION_HISTORY_LIMIT = 20;

// Журнал живёт только в памяти: после перезапуска приложения начинается заново.
const actions: string[] = [];

function formatTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/** Добавляет действие с локальным временем и хранит только последние 20 записей. */
export function recordAction(action: string): void {
  const text = action.trim();
  if (!text) return;

  actions.push(`${formatTimestamp(new Date())} - ${text}`);
  if (actions.length > ACTION_HISTORY_LIMIT) {
    actions.splice(0, actions.length - ACTION_HISTORY_LIMIT);
  }
}

/** Возвращает копию, чтобы код формирования отчёта не мог случайно изменить журнал. */
export function getActionHistory(): string[] {
  return [...actions];
}
