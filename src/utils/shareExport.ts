// Экспорт чертежа в файл: текст SVG/DXF записывается во временную папку приложения (кэш),
// затем открывается системное меню «Поделиться» — пользователь сам выбирает,
// куда сохранить файл или в какое приложение отправить.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Shape } from '@/types/shapes';
import { exportToDxf } from '@/utils/exportDxf';
import { exportToSvg } from '@/utils/exportSvg';

export type ExportFormat = 'svg' | 'dxf';

const MIME_TYPES: Record<ExportFormat, string> = {
  svg: 'image/svg+xml',
  dxf: 'application/dxf',
};

/** Название проекта -> имя файла: символы, запрещённые в именах файлов, заменяются на «_». */
function toFileName(projectName: string, format: ExportFormat): string {
  const base = projectName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Чертёж';
  return `${base}.${format}`;
}

/**
 * Создаёт файл чертежа в нужном формате и открывает меню «Поделиться».
 * Ошибки (нет места, меню недоступно) пробрасываются — сообщение показывает экран.
 */
export async function shareDrawing(
  shapes: Shape[],
  projectName: string,
  format: ExportFormat,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('На этом устройстве недоступно меню «Поделиться»');
  }

  const text = format === 'svg' ? exportToSvg(shapes) : exportToDxf(shapes);
  const file = new File(Paths.cache, toFileName(projectName, format));
  if (!file.exists) file.create();
  await file.write(text); // старое содержимое заменяется

  await Sharing.shareAsync(file.uri, {
    mimeType: MIME_TYPES[format],
    dialogTitle: `Экспорт ${format.toUpperCase()}`,
  });
}
