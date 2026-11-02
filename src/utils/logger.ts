import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { APP_VERSION } from '@/constants/version';

const CRASH_FILE_NAME = 'last_crash.log';
const TELEGRAM_MIN_INTERVAL_MS = 5_000;
const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;
const TELEGRAM_MAX_MESSAGE_LENGTH = 4_000;

type TelegramParseMode = 'MarkdownV2';

let isLoggerInitialized = false;
let lastTelegramRequestAt = 0;
let telegramQueue: Promise<void> = Promise.resolve();

function crashFileUri(): string {
  const documentDirectory = FileSystem.documentDirectory;

  if (!documentDirectory) {
    throw new Error('Папка документов приложения недоступна');
  }

  return documentDirectory + CRASH_FILE_NAME;
}

/** Читает сохранённый краш. Отсутствие файла и ошибка чтения не мешают запуску. */
export async function readLastCrash(): Promise<string | null> {
  try {
    const uri = crashFileUri();
    const info = await FileSystem.getInfoAsync(uri);

    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri);
  } catch {
    return null;
  }
}

/** Удаляет только файл краша; повторное удаление безопасно. */
export async function deleteLastCrash(): Promise<void> {
  try {
    await FileSystem.deleteAsync(crashFileUri(), { idempotent: true });
  } catch {
    // Не вызываем новый сбой из-за невозможности удалить вспомогательный лог.
  }
}

function formatCrashReport(error: unknown): string {
  const normalizedError = error instanceof Error ? error : null;
  const name = normalizedError?.name ?? 'Error';
  const message = normalizedError?.message ?? String(error);
  const stack = normalizedError?.stack ?? 'Stack trace is unavailable';

  return [
    `Time: ${new Date().toISOString()}`,
    `OS: ${Platform.OS} ${Platform.Version}`,
    `Version: ${APP_VERSION}`,
    `Error Name: ${name}`,
    `Error Message: ${message}`,
    'Stack Trace:',
    stack,
  ].join('\n');
}

function telegramConfig(): { token: string; chatId: string } | null {
  const extra = Constants.expoConfig?.extra;
  const token = extra?.telegramToken ?? extra?.TELEGRAM_BOT_TOKEN;
  const rawChatId = extra?.telegramChatId ?? extra?.TELEGRAM_CHAT_ID;
  const chatId = typeof rawChatId === 'number' ? String(rawChatId) : rawChatId;

  if (
    typeof token !== 'string' ||
    !token.trim() ||
    token === 'PLACEHOLDER' ||
    typeof chatId !== 'string' ||
    !chatId.trim() ||
    chatId === 'PLACEHOLDER'
  ) {
    return null;
  }

  return { token, chatId };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postTelegramChunk(
  token: string,
  chatId: string,
  text: string,
  parseMode?: TelegramParseMode,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendToTelegramNow(
  text: string,
  parseMode?: TelegramParseMode,
): Promise<boolean> {
  const config = telegramConfig();
  if (!config || !text) return false;

  // Telegram принимает до 4096 символов. Делим по строкам, чтобы не разорвать Markdown-разметку.
  for (let offset = 0; offset < text.length; ) {
    const remaining = text.slice(offset);
    const firstPart = remaining.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
    const lastNewline =
      remaining.length > TELEGRAM_MAX_MESSAGE_LENGTH ? firstPart.lastIndexOf('\n') : -1;
    const chunk = lastNewline > 0 ? firstPart.slice(0, lastNewline + 1) : firstPart;

    const elapsed = Date.now() - lastTelegramRequestAt;
    const throttleDelay = Math.max(0, TELEGRAM_MIN_INTERVAL_MS - elapsed);
    if (throttleDelay > 0) await wait(throttleDelay);

    lastTelegramRequestAt = Date.now();
    const sent = await postTelegramChunk(config.token, config.chatId, chunk, parseMode);
    if (!sent) return false;
    offset += chunk.length;
  }

  return true;
}

/**
 * Ставит отправку в общую очередь: даже одновременные вызовы не нарушат лимит 1 сообщение / 5 секунд.
 * Возвращает false при офлайне, ошибке Telegram или незаполненной конфигурации.
 */
export function sendToTelegram(text: string, parseMode?: TelegramParseMode): Promise<boolean> {
  const result = telegramQueue.then(() => sendToTelegramNow(text, parseMode)).catch(() => false);
  telegramQueue = result.then(() => undefined);
  return result;
}

async function persistAndSendCrash(report: string): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(crashFileUri(), report);
  } catch {
    // Даже если диск недоступен, всё равно пробуем отправить отчёт по сети.
  }

  const sent = await sendToTelegram(report);
  if (sent) await deleteLastCrash();
}

/** Перехватывает фатальные JS-ошибки и сохраняет стандартное поведение React Native. */
export function initErrorLogger(): void {
  if (isLoggerInitialized) return;
  isLoggerInitialized = true;

  const previousHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    try {
      if (isFatal) {
        void persistAndSendCrash(formatCrashReport(error));
      }
    } finally {
      previousHandler(error, isFatal);
    }
  });
}
