"use client";

import { useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<Mode, string> = { auto: "Auto", light: "Light", dark: "Dark" };

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setMode(t);
  }, []);

  function cycle() {
    const next = NEXT[mode];
    setMode(next);
    const root = document.documentElement;
    try {
      if (next === "auto") {
        delete root.dataset.theme;
        localStorage.removeItem("theme");
      } else {
        root.dataset.theme = next;
        localStorage.setItem("theme", next);
      }
    } catch {}
  }

  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={cycle} title="Switch color theme">
      <span aria-hidden>{mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐"}</span> {LABEL[mode]}
    </button>
  );
}
