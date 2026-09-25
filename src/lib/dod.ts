import type { DodLine, DodSpec } from "./types";

// The DoD scripts in /content are `set -euo pipefail` bash with one assertion per
// line and a final `echo PASS-<lab>`. Run as-is they only say "all passed" or
// abort silently at the first failure. We classify each line and generate an
// instrumented variant that reports every check individually. The Go verifier
// (tools/verifier) emits the exact same markers, so the UI parses both.

export const MARKER = "::lnet";

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function describeCheck(src: string): string | null {
  const s = src.replace(/^!\s*/, "");
  const negated = src.trimStart().startsWith("!");
  const grepQ = s.match(/grep -q(?:x)?\s+(?:--\s+)?(\$?'[^']*'|"[^"]*"|\S+)/);
  const unq = (v: string) => v.replace(/^\$?['"]|['"]$/g, "");
  if (/^test -s /.test(s)) return `el fichero ${s.split(/\s+/)[2]} existe y no está vacío`;
  if (/^test -r /.test(s)) return `${s.split(/\s+/)[2]} es legible`;
  if (/^test "\$\(wc -l/.test(s)) return "el número de líneas coincide con el esperado";
  if (/^awk /.test(s) && /exit found/.test(s)) return "no existe ninguna fila con el flujo prohibido";
  if (/^awk /.test(s)) return "todas las filas cumplen la condición de awk";
  if (/ss -ltn/.test(s) && grepQ) return `hay un listener TCP en ${unq(grepQ[1]!)}`;
  if (/route get/.test(s) && grepQ) return `la ruta resuelve ${unq(grepQ[1]!)}`;
  if (grepQ) {
    const needle = unq(grepQ[1]!);
    return negated ? `la salida NO contiene «${needle}»` : `la salida contiene «${needle}»`;
  }
  if (/>\/dev\/null$/.test(s)) return "el comando termina con código 0";
  return null;
}

export function parseDod(script: string, labId: string): DodSpec {
  const lines: DodLine[] = [];
  let checks = 0;
  let passToken = `PASS-${labId}`;
  script.split("\n").forEach((raw, index) => {
    const source = raw.trimEnd();
    if (!source.trim()) return;
    const t = source.trim();
    if (t.startsWith("#!")) {
      lines.push({ index, kind: "shebang", source, check: null, describe: null, warning: null });
    } else if (/^set\s+-/.test(t) || ASSIGNMENT.test(t)) {
      lines.push({ index, kind: "preamble", source, check: null, describe: null, warning: null });
    } else if (/^echo\s+PASS-/.test(t)) {
      passToken = t.replace(/^echo\s+/, "").replace(/['"]/g, "");
      lines.push({ index, kind: "pass", source, check: null, describe: null, warning: null });
    } else {
      const warning = t.startsWith("!")
        ? "Bajo `set -e`, un comando negado con `!` nunca aborta el script: en la versión original este check no puede fallar. La versión instrumentada sí lo evalúa."
        : null;
      lines.push({ index, kind: "check", source, check: checks++, describe: describeCheck(t), warning });
    }
  });
  return { script, passToken, lines, checkCount: checks };
}

/** Bash that evaluates every check independently and prints one marker per check. */
export function instrumentDod(spec: DodSpec, labId: string): string {
  const out: string[] = ["#!/usr/bin/env bash", `# instrumentado por learning-network para ${labId}`];
  for (const line of spec.lines) {
    if (line.kind === "shebang" || line.kind === "pass") continue;
    if (line.kind === "preamble") {
      // errexit would stop at the first failure; each check is guarded explicitly instead.
      out.push(line.source.trim().startsWith("set ") ? "set -uo pipefail" : line.source.trim());
      continue;
    }
    out.push(
      `if { ${line.source.trim()} ; } >/dev/null 2>&1; then echo "${MARKER} ${labId} check ${line.check} pass"; else echo "${MARKER} ${labId} check ${line.check} fail"; fi`,
    );
  }
  out.push(`echo "${MARKER} ${labId} done"`);
  return out.join("\n") + "\n";
}

export type CheckStatus = "pass" | "fail" | "pending";

export type ParsedRun = {
  statuses: CheckStatus[];
  source: "markers" | "json" | "pass-token" | "trace" | "none";
  summary: string;
};

/**
 * Accepts whatever the learner pastes: instrumented markers, the Go verifier's JSON,
 * the original script's PASS token, or a `bash -x` trace of the original script.
 */
export function parseRunOutput(output: string, spec: DodSpec, labId: string): ParsedRun {
  const n = spec.checkCount;
  const statuses: CheckStatus[] = Array.from({ length: n }, () => "pending");
  const text = output.trim();
  if (!text) return { statuses, source: "none", summary: "Sin salida que analizar." };

  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text) as { lab?: string; checks?: { index: number; status: string }[] };
      if (data.lab && data.lab !== labId) {
        return { statuses, source: "json", summary: `El informe es de ${data.lab}, no de ${labId}.` };
      }
      for (const c of data.checks ?? []) {
        if (c.index >= 0 && c.index < n && (c.status === "pass" || c.status === "fail")) statuses[c.index] = c.status;
      }
      return { statuses, source: "json", summary: summarise(statuses) };
    } catch {
      /* fall through to line-based parsing */
    }
  }

  const marker = new RegExp(`^${MARKER} (\\S+) check (\\d+) (pass|fail)$`);
  let sawMarker = false;
  let foreign: string | null = null;
  for (const line of text.split("\n")) {
    const m = line.trim().match(marker);
    if (!m) continue;
    sawMarker = true;
    if (m[1] !== labId) {
      foreign = m[1]!;
      continue;
    }
    const idx = Number(m[2]);
    if (idx < n) statuses[idx] = m[3] as CheckStatus;
  }
  if (sawMarker) {
    if (foreign && statuses.every((s) => s === "pending")) {
      return { statuses, source: "markers", summary: `Los marcadores son de ${foreign}, no de ${labId}.` };
    }
    return { statuses, source: "markers", summary: summarise(statuses) };
  }

  if (text.split("\n").some((l) => l.trim() === spec.passToken)) {
    statuses.fill("pass");
    const neg = spec.lines.some((l) => l.warning);
    return {
      statuses,
      source: "pass-token",
      summary: neg
        ? `${spec.passToken} recibido. Ojo: un check negado no pudo fallar en el script original; confirma con la versión instrumentada.`
        : `${spec.passToken} recibido: todos los checks pasaron.`,
    };
  }

  const traced = text.split("\n").filter((l) => /^\+ /.test(l));
  if (traced.length) {
    const checks = spec.lines.filter((l) => l.kind === "check");
    let pointer = -1;
    for (const t of traced) {
      const head = t.slice(2).replace(/['"]/g, "").split(/\s+/).slice(0, 2).join(" ");
      const hit = checks.findIndex(
        (c, i) => i >= Math.max(pointer, 0) && c.source.replace(/^!\s*/, "").replace(/['"]/g, "").includes(head),
      );
      if (hit >= 0) pointer = hit;
    }
    if (pointer >= 0) {
      for (let i = 0; i < pointer; i++) statuses[i] = "pass";
      statuses[pointer] = "fail";
      return {
        statuses,
        source: "trace",
        summary: `La traza termina en el check ${pointer + 1} sin ${spec.passToken}: ahí abortó el script.`,
      };
    }
  }

  return {
    statuses,
    source: "none",
    summary: `No encontré marcadores, JSON ni ${spec.passToken}. Pega la salida del script instrumentado o de \`lnverify run ${labId}\`.`,
  };
}

function summarise(statuses: CheckStatus[]): string {
  const pass = statuses.filter((s) => s === "pass").length;
  const fail = statuses.filter((s) => s === "fail").length;
  const pending = statuses.length - pass - fail;
  if (fail === 0 && pending === 0) return `${pass}/${statuses.length} checks pasaron.`;
  const parts = [`${pass} pasan`];
  if (fail) parts.push(`${fail} fallan`);
  if (pending) parts.push(`${pending} sin datos`);
  return parts.join(" · ") + ".";
}
