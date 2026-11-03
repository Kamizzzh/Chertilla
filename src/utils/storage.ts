// Хранение проектов в локальных JSON-файлах.
// Файлы лежат в папке документов приложения — их не видно другим программам.
//
// projects_index.json — список проектов (id, название, дата последнего изменения);
// project_{id}.json   — фигуры одного проекта.

import { File, Paths } from 'expo-file-system';

import type { Shape } from '@/types/shapes';

const INDEX_FILE_NAME = 'projects_index.json';
/** Файл единственного проекта из версий до 0.0.0.0011. Переносится в список при первом запуске. */
const LEGACY_PROJECT_FILE_NAME = 'project.json';

/** Версия формата файлов. Пригодится, если структура когда-нибудь изменится. */
const FORMAT_VERSION = 1;

/** Краткие сведения о проекте для списка в главном меню. */
export type ProjectMeta = {
  id: string;
  name: string;
  /** Дата последнего изменения (создание или сохранение) в формате ISO. */
  date: string;
};

type IndexFile = {
  version: number;
  projects: ProjectMeta[];
};

type ProjectFile = {
  version: number;
  shapes: Shape[];
};

export type ProjectLoadResult = {
  /** null — файл ещё не создан; массив — загруженный или восстановленный пустой чертёж. */
  shapes: Shape[] | null;
  /** true — повреждённый файл удалён и вместо него создан пустой проект. */
  recovered: boolean;
};

function indexFile(): File {
  return new File(Paths.document, INDEX_FILE_NAME);
}

function projectFile(id: string): File {
  return new File(Paths.document, `project_${id}.json`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Убирает следы прерванной записи и возвращает бэкап, если основной файл не был заменён. */
async function recoverJsonFile(file: File): Promise<void> {
  const tempFile = new File(`${file.uri}.tmp`);
  const backupFile = new File(`${file.uri}.bak`);

  if (!file.exists) {
    if (backupFile.exists) await backupFile.move(file);
    if (tempFile.exists) tempFile.delete();
    return;
  }

  if (tempFile.exists) tempFile.delete();
  if (backupFile.exists) backupFile.delete();
}

/** Записывает JSON через временный файл, не затрагивая прежнюю версию до готовности новой. */
async function writeJson(file: File, data: unknown): Promise<void> {
  const targetPath = file.uri;
  const tempPath = `${targetPath}.tmp`;
  const tempFile = new File(tempPath);
  const backupFile = new File(`${targetPath}.bak`);
  // Отдельный объект: move() меняет uri у перемещённого объекта, а file должен указывать на цель.
  const targetFile = new File(targetPath);

  try {
    const json = JSON.stringify(data);

    if (tempFile.exists) tempFile.delete();
    tempFile.create();
    await tempFile.write(json);

    if (targetFile.exists) {
      await targetFile.move(backupFile, { overwrite: true });
    }

    await tempFile.move(file);
    if (backupFile.exists) backupFile.delete();
  } catch (error) {
    const details = [errorMessage(error)];

    try {
      // Новый объект нужен потому, что после move() uri у tempFile уже мог измениться.
      const leftoverTempFile = new File(tempPath);
      if (leftoverTempFile.exists) leftoverTempFile.delete();
    } catch (cleanupError) {
      details.push(`не удалось удалить .tmp: ${errorMessage(cleanupError)}`);
    }

    try {
      if (backupFile.exists && !file.exists) {
        await backupFile.move(file);
      }
    } catch (restoreError) {
      details.push(`не удалось восстановить .bak: ${errorMessage(restoreError)}`);
    }

    throw new Error(`Не удалось сохранить файл ${file.name}: ${details.join('; ')}`);
  }
}

/** Уникальный id проекта: время создания + случайный хвост (на случай двух проектов за 1 мс). */
function makeProjectId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function writeIndex(projects: ProjectMeta[]): Promise<void> {
  const data: IndexFile = { version: FORMAT_VERSION, projects };
  await writeJson(indexFile(), data);
}

/**
 * Читает список проектов из файла (без сортировки).
 * Если списка ещё нет, а есть старый project.json — переносит его как «Мой проект».
 */
async function readIndex(): Promise<ProjectMeta[]> {
  const file = indexFile();
  await recoverJsonFile(file);
  if (file.exists) {
    const data = JSON.parse(await file.text()) as Partial<IndexFile>;
    if (!Array.isArray(data.projects)) {
      throw new Error('Файл списка проектов повреждён');
    }
    return data.projects;
  }

  const legacy = new File(Paths.document, LEGACY_PROJECT_FILE_NAME);
  if (!legacy.exists) return [];

  // Перенос чертежа из старой версии: копируем содержимое в новый файл и удаляем старый.
  const meta: ProjectMeta = {
    id: makeProjectId(),
    name: 'Мой проект',
    date: new Date().toISOString(),
  };
  await writeJson(projectFile(meta.id), JSON.parse(await legacy.text()));
  await writeIndex([meta]);
  legacy.delete();
  return [meta];
}

/** Список проектов: сначала недавно изменённые. */
export async function getProjects(): Promise<ProjectMeta[]> {
  const projects = await readIndex();
  return [...projects].sort((a, b) => b.date.localeCompare(a.date));
}

/** Сведения об одном проекте. null — такого проекта нет. */
export async function getProject(id: string): Promise<ProjectMeta | null> {
  const projects = await readIndex();
  return projects.find((p) => p.id === id) ?? null;
}

/** Создаёт пустой проект с заданным названием и возвращает его id. */
export async function createProject(name: string): Promise<string> {
  const projects = await readIndex();
  const meta: ProjectMeta = { id: makeProjectId(), name, date: new Date().toISOString() };
  await writeJson(projectFile(meta.id), { version: FORMAT_VERSION, shapes: [] } satisfies ProjectFile);
  await writeIndex([...projects, meta]);
  return meta.id;
}

/** Сохраняет фигуры проекта (старый файл перезаписывается) и обновляет дату изменения. */
export async function saveProject(id: string, shapes: Shape[]): Promise<void> {
  const projects = await readIndex();
  if (!projects.some((p) => p.id === id)) {
    throw new Error('Проект не найден — возможно, он был удалён');
  }
  const data: ProjectFile = { version: FORMAT_VERSION, shapes };
  await writeJson(projectFile(id), data);
  const date = new Date().toISOString();
  await writeIndex(projects.map((p) => (p.id === id ? { ...p, date } : p)));
}

/**
 * Читает фигуры проекта. При ошибке чтения или разбора JSON удаляет повреждённый файл
 * и создаёт на его месте пустой проект с тем же id, чтобы приложение продолжило работать.
 */
export async function loadProject(id: string): Promise<ProjectLoadResult> {
  const file = projectFile(id);
  await recoverJsonFile(file);
  if (!file.exists) return { shapes: null, recovered: false };

  try {
    const data = JSON.parse(await file.text()) as Partial<ProjectFile>;
    if (!Array.isArray(data.shapes)) {
      throw new Error('В файле проекта нет списка фигур');
    }
    return { shapes: data.shapes, recovered: false };
  } catch (error) {
    const readError = errorMessage(error);

    try {
      if (file.exists) file.delete();
      const emptyProject: ProjectFile = { version: FORMAT_VERSION, shapes: [] };
      await writeJson(file, emptyProject);
    } catch (recoveryError) {
      throw new Error(
        `Файл проекта повреждён (${readError}); не удалось создать пустой проект: ${errorMessage(recoveryError)}`,
      );
    }

    console.warn(`Повреждённый файл ${file.name} заменён пустым проектом: ${readError}`);
    return { shapes: [], recovered: true };
  }
}

/** Удаляет проект: убирает его из списка и стирает файл с фигурами. */
export async function deleteProject(id: string): Promise<void> {
  const projects = await readIndex();
  await writeIndex(projects.filter((p) => p.id !== id));
  const file = projectFile(id);
  if (file.exists) file.delete();
}
