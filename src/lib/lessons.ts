import type { Lesson, LessonKind, LessonRef } from "./types";

// Lesson naming shared by the build-time parser and the client components.

/** Accent-free, lowercase, dash-separated: the lesson id. */
export function lessonSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** In-page anchor of a lesson; keeps the "lectura-" prefix the reading map already used. */
export const lessonAnchor = (id: string) => `lectura-${id}`;

export function lessonKind(title: string): LessonKind {
  if (/^Ruta de estudio/i.test(title)) return "orientacion";
  if (/^Referencia t[eé]cnica/i.test(title)) return "referencia";
  return "leccion";
}

/** The lessons that count towards understanding, stripped to what the client needs. */
export const countedLessons = (lessons: Lesson[]): LessonRef[] =>
  lessons.filter((l) => l.kind === "leccion").map(({ id, title, minutes }) => ({ id, title, minutes }));
