"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type State = "idle" | "success" | "error";

/** Label swap is the feedback — no toast. Reverts after 2.5s. */
export function CopyButton({
  value,
  label = "Copiar",
  className = "",
  size = "xs",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "xs" | "md";
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("success");
    } catch {
      setState("error");
    }
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  const Icon = state === "success" ? Check : state === "error" ? TriangleAlert : Copy;
  const text = state === "success" ? "Copiado" : state === "error" ? "Sin acceso" : label;
  return (
    <button
      type="button"
      onClick={copy}
      data-state={state === "idle" ? undefined : state}
      className={`btn ${size === "xs" ? "btn-xs" : ""} ${className}`}
      aria-live="polite"
    >
      <Icon size={size === "xs" ? 13 : 15} aria-hidden />
      {text}
    </button>
  );
}
