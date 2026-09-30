import type { Metadata } from "next";
import { ReviewSession } from "@/components/review/ReviewSession";
import { loadModules } from "@/lib/content";
import { buildDeck } from "@/lib/deck";

export const metadata: Metadata = {
  title: "Repaso",
  description: "Repaso espaciado de las lecciones, conceptos y checkpoints que ya marcaste como aprendidos.",
};

export default function ReviewPage() {
  const modules = loadModules();
  return (
    <div className="px-gutter">
      <header className="mx-auto max-w-[52rem] pt-md pb-lg">
        <p className="module-eyebrow">
          <span className="tok-prompt">$</span> repaso --espaciado
        </p>
        <h1 className="module-title mt-xs">Repaso</h1>
        <p className="mt-sm max-w-[60ch] text-md text-muted">
          Recordar cuesta un poco, y ese esfuerzo es lo que fija lo aprendido. Aquí vuelven, a intervalos cada vez más
          largos, las lecciones que marcaste como entendidas, sus conceptos y los checkpoints que resolviste.
        </p>
      </header>
      <div className="mx-auto max-w-[52rem]">
        <ReviewSession
          deck={buildDeck(modules)}
          modules={modules.map((m) => ({ id: m.meta.id, num: m.meta.id.replace("modulo-", "M"), title: m.meta.title }))}
        />
      </div>
    </div>
  );
}
