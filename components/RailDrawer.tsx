"use client";

import { useState } from "react";

/** On narrow screens the rail's facts + resources fold behind this toggle; on desktop it's always open. */
export function RailDrawer({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rail-drawer${open ? " open" : ""}`}>
      <button type="button" className="drawer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{summary}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      <div className="drawer-body">{children}</div>
    </div>
  );
}
