"use client";

import { useState } from "react";

export function ShowMore({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <li>
      <button type="button" className="show-more" onClick={() => setOpen(true)}>
        Show {count} older {count === 1 ? "activity" : "activities"}
      </button>
    </li>
  );
}
