import { Platform } from 'react-native';

import { APP_VERSION } from '@/constants/version';
import { getActionHistory } from '@/utils/actionHistory';
import { sendToTelegram } from '@/utils/logger';

export const MAX_FEEDBACK_LENGTH = 1000;

export type FeedbackContext = {
  projectId: string;
  projectName: string;
  toolName: string;
  shapeCount: number;
  isDirty: boolean;
};

/** Экранирует пользовательский текст, чтобы он не ломал разметку Telegram MarkdownV2. */
function escapeMarkdownV2(value: string): string {
  return value.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function formatFeedbackMessage(text: string, context: FeedbackContext): string {
  const history = getActionHistory();
  const actionLines =
    history.length > 0
      ? history.map((action) => escapeMarkdownV2(action)).join('\n')
      : 'Действий пока нет';

  return [
    '🐞 *Чертилла — сообщение об ошибке*',
    `*Версия:* ${escapeMarkdownV2(APP_VERSION)}`,
    `*Устройство:* ${escapeMarkdownV2(`${Platform.OS} ${Platform.Version}`)}`,
    `*Проект:* ${escapeMarkdownV2(context.projectName || 'Без названия')}`,
    `*ID проекта:* ${escapeMarkdownV2(context.projectId)}`,
    `*Инструмент:* ${escapeMarkdownV2(context.toolName)}`,
    `*Фигур на чертеже:* ${context.shapeCount}`,
    `*Несохранённые изменения:* ${context.isDirty ? 'Да' : 'Нет'}`,
    `*Время отчёта:* ${escapeMarkdownV2(new Date().toISOString())}`,
    '',
    '*Комментарий пользователя:*',
    escapeMarkdownV2(text),
    '',
    '*Последние действия:*',
    actionLines,
  ].join('\n');
}

/** Отправляет комментарий, состояние проекта и последние 20 действий в Telegram. */
export function sendFeedback(text: string, context: FeedbackContext): Promise<boolean> {
  return sendToTelegram(formatFeedbackMessage(text.trim(), context), 'MarkdownV2');
}
