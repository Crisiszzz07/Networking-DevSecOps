import { checkpointFor } from "./checkpoints";
import { conceptsIn, GLOSSARY } from "./glossary";
import { lessonAnchor } from "./lessons";
import type { CardKey, ReviewCard } from "./review";
import type { LearningModule } from "./types";

// Build-time deck: every counted lesson, every glossary concept a counted lesson
// discusses, and every module checkpoint becomes one review card.

const numOf = (m: LearningModule) => m.meta.id.replace("modulo-", "M");

export function buildDeck(modules: LearningModule[]): ReviewCard[] {
  // A concept is unlocked by any lesson that discusses it; it is filed after the first one.
  const refs = new Map<string, { moduleId: string; lessonId: string }[]>();
  const firstIn = new Map<string, string[]>();
  for (const m of modules) {
    for (const l of m.theory.lessons) {
      if (l.kind !== "leccion") continue;
      const lessonKey = `${m.meta.id}:${l.id}`;
      for (const g of conceptsIn(l.markdown)) {
        if (!refs.has(g.id)) firstIn.set(lessonKey, [...(firstIn.get(lessonKey) ?? []), g.id]);
        refs.set(g.id, [...(refs.get(g.id) ?? []), { moduleId: m.meta.id, lessonId: l.id }]);
      }
    }
  }

  // Course order, so new cards arrive as they were learned: each lesson, the
  // concepts it introduced, and the module checkpoint last.
  const deck: ReviewCard[] = [];
  for (const m of modules) {
    const base = `/modules/${m.meta.slug}/`;
    const at = { moduleId: m.meta.id, moduleNum: numOf(m) };
    for (const l of m.theory.lessons) {
      if (l.kind !== "leccion") continue;
      const href = base + "#" + lessonAnchor(l.id);
      deck.push({
        kind: "leccion",
        id: `leccion:${m.meta.id}:${l.id}`,
        ...at,
        href,
        unlock: { kind: "lessons", refs: [{ moduleId: m.meta.id, lessonId: l.id }] },
        title: l.title,
        answer: l.summary,
      });
      for (const id of firstIn.get(`${m.meta.id}:${l.id}`) ?? []) {
        const g = GLOSSARY.find((x) => x.id === id)!;
        deck.push({
          kind: "concepto",
          id: `concepto:${g.id}`,
          ...at,
          href,
          unlock: { kind: "lessons", refs: refs.get(g.id)! },
          term: g.term,
          short: g.short,
          analogy: g.analogy,
          why: g.why,
        });
      }
    }
    const cp = checkpointFor(m.meta.id);
    if (cp) {
      deck.push({
        kind: "checkpoint",
        id: `checkpoint:${cp.id}`,
        ...at,
        href: base + "#checkpoint",
        unlock: { kind: "checkpoint", id: cp.id },
        title: cp.title,
        prompt: cp.prompt,
        observation: cp.observation,
        question: cp.question,
        options: cp.options.map(({ label, correct }) => ({ label, correct })),
        takeaway: cp.takeaway,
      });
    }
  }
  return deck;
}

export const deckKeys = (deck: ReviewCard[]): CardKey[] => deck.map(({ id, unlock }) => ({ id, unlock }));
