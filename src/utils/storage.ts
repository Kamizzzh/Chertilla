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

function indexFile(): File {
  return new File(Paths.document, INDEX_FILE_NAME);
}

function projectFile(id: string): File {
  return new File(Paths.document, `project_${id}.json`);
}

/** Записывает текст в файл, создавая его при необходимости (старое содержимое заменяется). */
async function writeJson(file: File, data: unknown): Promise<void> {
  if (!file.exists) file.create();
  await file.write(JSON.stringify(data));
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
 * Читает фигуры проекта.
 * Возвращает null, если файла проекта нет. Если файл повреждён — бросает ошибку.
 */
export async function loadProject(id: string): Promise<Shape[] | null> {
  const file = projectFile(id);
  if (!file.exists) return null;

  const data = JSON.parse(await file.text()) as Partial<ProjectFile>;
  if (!Array.isArray(data.shapes)) {
    throw new Error('В файле проекта нет списка фигур');
  }
  return data.shapes;
}

/** Удаляет проект: убирает его из списка и стирает файл с фигурами. */
export async function deleteProject(id: string): Promise<void> {
  const projects = await readIndex();
  await writeIndex(projects.filter((p) => p.id !== id));
  const file = projectFile(id);
  if (file.exists) file.delete();
}
