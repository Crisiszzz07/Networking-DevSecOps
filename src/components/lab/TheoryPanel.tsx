import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildCitationIndex } from "@/components/hallmark/Cite";
import type { GlossaryEntry } from "@/lib/glossary";
import type { BookRef, Gotcha } from "@/lib/types";
import { makeEnricher } from "./enrich";
import { GlossaryChips } from "./GlossaryTerm";
import { InteractiveTable } from "./InteractiveTable";
import { DecisionCheckpoint } from "./DecisionCheckpoint";
import { MechanismDiagram } from "./MechanismDiagram";
import type { DecisionCheckpointSpec } from "@/lib/checkpoints";

function anchorFor(title: string) {
  return "lectura-" + title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function sectionsIn(markdown: string) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => {
    const title = match[1]!.trim();
    return { title, id: anchorFor(title) };
  });
}

function sourceFrom(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(sourceFrom).join("");
  if (isValidElement<{ children?: ReactNode }>(children)) return sourceFrom(children.props.children);
  return "";
}

export function TheoryPanel({
  markdown,
  trace,
  books,
  gotchas,
  concepts,
  checkpoint,
  after,
}: {
  markdown: string;
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
  const sections = sectionsIn(markdown);
  const enrich = makeEnricher(books, concepts, citations);

  return (
    <div className="theory-shell">
      <section className="reading-orientation" aria-label="Guía de lectura">
        <div className="min-w-0">
          <h2 className="reading-title">Lee el mecanismo; después interroga la evidencia.</h2>
          <p className="mt-2xs max-w-[64ch] text-sm text-muted">
            La teoría define qué debe ocurrir. Las figuras y tablas reducen el mecanismo a señales observables; la
            topología y el inspector de paquete permiten comprobarlo después.
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
        <article className="prose-lab min-w-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => <h2 id={anchorFor(String(children))}>{children}</h2>,
              p: ({ children }) => <p>{enrich(children)}</p>,
              li: ({ children }) => <li>{enrich(children)}</li>,
              table: ({ children }) => <InteractiveTable>{children}</InteractiveTable>,
              td: ({ children }) => <td>{enrich(children)}</td>,
              pre: ({ children }) => <MechanismDiagram source={sourceFrom(children)} />,
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>

        <aside className="theory-rail">
          {sections.length > 0 && (
            <nav aria-label="Mapa de esta lectura">
              <p className="rail-label">En esta lectura</p>
              <ol className="reading-nav">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a href={"#" + section.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
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
        <div className="theory-practice">
          <DecisionCheckpoint checkpoint={checkpoint} source={enrich(checkpoint.source)} />
        </div>
      )}
      {after}
    </div>
  );
}
