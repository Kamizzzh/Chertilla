import { File, Paths } from 'expo-file-system';

const ERROR_LOG_FILE_NAME = 'error_log.json';
const MAX_ERROR_ENTRIES = 50;

export type ErrorLogEntry = {
  id: string;
  /** Дата возникновения ошибки в формате ISO. */
  timestamp: string;
  /** Короткий текст для списка. */
  message: string;
  /** Контекст и полный стек для детального окна. */
  details: string;
};

type ErrorLogListener = (entries: ErrorLogEntry[]) => void;

let entries: ErrorLogEntry[] = [];
let loadPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const listeners = new Set<ErrorLogListener>();

function errorLogFile(): File {
  return new File(Paths.document, ERROR_LOG_FILE_NAME);
}

function notifyListeners(): void {
  const snapshot = [...entries];
  listeners.forEach((listener) => listener(snapshot));
}

function setEntries(next: ErrorLogEntry[]): void {
  entries = next.slice(0, MAX_ERROR_ENTRIES);
  notifyListeners();
}

function isErrorLogEntry(value: unknown): value is ErrorLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ErrorLogEntry>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.details === 'string'
  );
}

/** Читает журнал один раз. Новые записи, появившиеся во время чтения, не затираются. */
function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let stored: ErrorLogEntry[] = [];
    try {
      const file = errorLogFile();
      if (file.exists) {
        const parsed: unknown = JSON.parse(await file.text());
        if (Array.isArray(parsed)) stored = parsed.filter(isErrorLogEntry);
      }
    } catch {
      // Повреждённый или недоступный вспомогательный журнал не должен ломать приложение.
    }

    const freshIds = new Set(entries.map((entry) => entry.id));
    setEntries([...entries, ...stored.filter((entry) => !freshIds.has(entry.id))]);
  })();

  return loadPromise;
}

function queuePersist(): void {
  writeQueue = writeQueue
    .then(async () => {
      await ensureLoaded();
      const file = errorLogFile();
      if (!file.exists) file.create();
      await file.write(JSON.stringify(entries));
    })
    .catch(() => {
      // Запись остаётся в памяти, даже если хранилище временно недоступно.
    });
}

/** Список недавних ошибок, сначала новые. Никаких окон при чтении не появляется. */
export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  await ensureLoaded();
  return [...entries];
}

/** Подписка открытого журнала на новые ошибки. */
export function subscribeErrorLog(listener: ErrorLogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function appendEntry(entry: ErrorLogEntry): ErrorLogEntry {
  setEntries([entry, ...entries]);
  queuePersist();
  return entry;
}

/** Переносит текстовый отчёт старого логгера без потери исходных даты и стека. */
export function recordErrorReport(report: string): ErrorLogEntry {
  const time = report.match(/^Time: (.+)$/m)?.[1];
  const message = report.match(/^Error Message: (.+)$/m)?.[1] ?? 'Ошибка предыдущего запуска';
  const timestamp = time && !Number.isNaN(new Date(time).getTime()) ? time : new Date().toISOString();
  return appendEntry({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    message,
    details: report,
  });
}

/**
 * Тихо добавляет ошибку в память и ставит сохранение в очередь.
 * Функция нарочно не выбрасывает исключения, чтобы журнал не стал источником нового сбоя.
 */
export function recordError(error: unknown, context?: string): ErrorLogEntry {
  const normalized = error instanceof Error ? error : null;
  const rawMessage = normalized?.message ?? String(error);
  const firstLine = rawMessage.trim().split('\n').find((line) => line.trim().length > 0);
  const message = firstLine?.trim() || normalized?.name || 'Неизвестная ошибка';
  const errorDetails = normalized?.stack ?? rawMessage;
  const entry: ErrorLogEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    message,
    details: context ? `${context}\n\n${errorDetails}` : errorDetails,
  };

  return appendEntry(entry);
}
