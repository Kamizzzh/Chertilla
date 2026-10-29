/**
 * Текст из поля ввода -> число. null, если там не число.
 * Запятая тоже считается разделителем дробной части ("12,5" = 12.5).
 */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Число -> текст для файлов экспорта (SVG, DXF): не больше 6 знаков после точки,
 * без записи вида «1e-7» и без «-0».
 */
export function formatExportNumber(value: number): string {
  const rounded = Number(value.toFixed(6));
  return rounded === 0 ? '0' : String(rounded);
}
