"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = value.trim();
      startTransition(() => router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname));
    }, 250);
    return () => clearTimeout(t);
  }, [value, pathname, router]);

  return (
    <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="account-search" className="sr-only">
        Search accounts
      </label>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="account-search"
        type="search"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Company name…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {pending && <span className="pending">Searching…</span>}
    </form>
  );
}
