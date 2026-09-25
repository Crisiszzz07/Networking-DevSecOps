import { Constellation } from "@/components/sky/Constellation";
import { loadModules } from "@/lib/content";
import { buildSky } from "@/lib/sky";

export default function Dashboard() {
  const modules = loadModules();
  const books = new Map<string, { abbr: string | null; modules: string[]; chapters: Set<string> }>();
  for (const m of modules) {
    for (const b of m.meta.books) {
      const entry = books.get(b.title) ?? { abbr: b.abbr, modules: [], chapters: new Set<string>() };
      entry.modules.push(m.meta.id.replace("modulo-", "M"));
      b.chapters.forEach((c) => entry.chapters.add(c));
      books.set(b.title, entry);
    }
  }
  return (
    <>
      <Constellation sky={buildSky(modules)} />
      <div className="px-gutter">
      <p className="orn-rule mt-2xl" aria-hidden>
        ◇
      </p>
      <section className="mx-auto mt-2xl max-w-[78rem]">
        <div className="plate hud min-w-0 overflow-x-auto">
          <div className="plate-h">
            <h2>Fuentes</h2>
            <p>// de dónde sale cada concepto</p>
          </div>
          <table className="data-table mt-md">
            <thead>
              <tr>
                <th scope="col">Cita</th>
                <th scope="col">Libro</th>
                <th scope="col">Módulos</th>
              </tr>
            </thead>
            <tbody>
              {[...books].map(([title, b]) => (
                <tr key={title} className="cursor-default">
                  <td>{b.abbr ?? "—"}</td>
                  <td>
                    <span className="text-ink">{title}</span>
                    <span className="mt-2xs block text-xs text-neutral">{[...b.chapters].join(" · ")}</span>
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{b.modules.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </>
  );
}
