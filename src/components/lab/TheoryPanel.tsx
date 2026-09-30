import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildCitationIndex } from "@/components/hallmark/Cite";
import type { GlossaryEntry } from "@/lib/glossary";
import { countedLessons, lessonAnchor } from "@/lib/lessons";
import type { BookRef, Gotcha, Lesson } from "@/lib/types";
import { makeEnricher } from "./enrich";
import { GlossaryChips } from "./GlossaryTerm";
import { InteractiveTable } from "./InteractiveTable";
import { DecisionCheckpoint } from "./DecisionCheckpoint";
import { LessonCheck, LessonNav } from "./Lessons";
import { MechanismDiagram } from "./MechanismDiagram";
import type { DecisionCheckpointSpec } from "@/lib/checkpoints";

function sourceFrom(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(sourceFrom).join("");
  if (isValidElement<{ children?: ReactNode }>(children)) return sourceFrom(children.props.children);
  return "";
}

export function TheoryPanel({
  moduleId,
  markdown,
  intro,
  lessons,
  trace,
  books,
  gotchas,
  concepts,
  checkpoint,
  after,
}: {
  moduleId: string;
  /** Whole theory: citation numbering runs across every lesson. */
  markdown: string;
  intro: string;
  lessons: Lesson[];
  trace: string | null;
  books: BookRef[];
  gotchas: Gotcha[];
  concepts: GlossaryEntry[];
  checkpoint?: DecisionCheckpointSpec | null;
  after?: React.ReactNode;
}) {
  const citations = buildCitationIndex(
    [markdown, ...gotchas.map((gotcha) => gotcha.text), ...(checkpoint ? [checkpoint.source] : [])],
    books,
  );
  const enrich = makeEnricher(books, concepts, citations);
  const counted = countedLessons(lessons);
  const components: Components = {
    p: ({ children }) => <p>{enrich(children)}</p>,
    li: ({ children }) => <li>{enrich(children)}</li>,
    table: ({ children }) => <InteractiveTable>{children}</InteractiveTable>,
    td: ({ children }) => <td>{enrich(children)}</td>,
    pre: ({ children }) => <MechanismDiagram source={sourceFrom(children)} />,
  };

  return (
    <div className="theory-shell">
      <section className="reading-orientation" aria-label="Guía de lectura">
        <div className="min-w-0">
          <h2 className="reading-title">Lee el mecanismo; después interroga la evidencia.</h2>
          <p className="mt-2xs max-w-[64ch] text-sm text-muted">
            La teoría define qué debe ocurrir. Las figuras y tablas reducen el mecanismo a señales observables; la
            topología y el inspector de paquete permiten comprobarlo después. Cada lección termina con «Lo entiendo»:
            márcala cuando puedas explicarla, no cuando la hayas leído.
          </p>
        </div>
        <details className="concept-drawer">
          <summary>
            <span>Conceptos disponibles</span>
            <span className="concept-count">{concepts.length}</span>
          </summary>
          <div className="mt-sm">
            <GlossaryChips entries={concepts.map(({ id, term, short, analogy, why }) => ({ id, term, short, analogy, why }))} />
          </div>
        </details>
      </section>

      <div className="theory-reader">
        <div className="min-w-0">
          {intro && (
            <article className="prose-lab">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {intro}
              </ReactMarkdown>
            </article>
          )}
          {lessons.map((lesson) => {
            const at = counted.findIndex((c) => c.id === lesson.id);
            return (
              <section key={lesson.id} id={lessonAnchor(lesson.id)} className="lesson" data-kind={lesson.kind} tabIndex={-1}>
                <article className="prose-lab">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {lesson.markdown}
                  </ReactMarkdown>
                </article>
                {at >= 0 ? (
                  <LessonCheck moduleId={moduleId} lesson={counted[at]!} next={counted[at + 1] ?? null} />
                ) : lesson.kind === "referencia" ? (
                  <p className="lesson-note">
                    Referencia: no cuenta para tu progreso. Vuelve aquí cuando necesites un campo o un estado concreto.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>

        <aside className="theory-rail">
          {lessons.length > 0 && (
            <LessonNav
              moduleId={moduleId}
              items={lessons.map(({ id, title, kind, minutes }) => ({ id, title, kind, minutes }))}
            />
          )}

          <section>
            <p className="rail-label">Trampas en producción</p>
            <ul className="rail-gotchas">
              {gotchas.map((gotcha) => (
                <li key={gotcha.text}>{enrich(gotcha.text)}</li>
              ))}
            </ul>
          </section>

          {citations.size > 0 && (
            <details className="rail-details">
              <summary>Referencias de la lectura <span>{citations.size}</span></summary>
              <ol className="mt-sm grid gap-xs text-xs text-neutral">
                {[...citations.values()].map((citation) => (
                  <li key={citation.reference} className="reference-item">
                    <span className="cite">[{citation.number}]</span> {citation.detail}
                  </li>
                ))}
              </ol>
            </details>
          )}

          {trace && (
            <details className="rail-details">
              <summary>Fuentes del módulo <span>{books.length}</span></summary>
              <p className="mt-sm text-sm text-neutral">{trace}</p>
              <ul className="mt-sm grid gap-xs">
                {books.map((book) => (
                  <li key={book.title} className="text-sm">
                    <span className="cite">{book.abbr ?? "—"}</span> <span className="text-ink">{book.title}</span>
                    <span className="block text-xs text-neutral">{book.chapters.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
      {checkpoint && (
        <div id="checkpoint" className="theory-practice" tabIndex={-1}>
          <DecisionCheckpoint checkpoint={checkpoint} source={enrich(checkpoint.source)} />
        </div>
      )}
      {after}
    </div>
  );
}
