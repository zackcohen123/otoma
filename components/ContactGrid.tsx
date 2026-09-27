"use client";

import { useOptimistic, useState, useTransition } from "react";
import { togglePrimary } from "@/app/a/[id]/actions";
import type { Contact } from "@/lib/types";

export function ContactGrid({
  accountId,
  contacts,
  canPin,
  primaryField,
}: {
  accountId: string;
  contacts: Contact[];
  canPin: boolean;
  primaryField: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    contacts,
    (state, change: { id: string; isPrimary: boolean }) =>
      state.map((c) => (c.id === change.id ? { ...c, isPrimary: change.isPrimary } : c)),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Primary contacts first; otherwise keep Salesforce's (last name) order.
  const sorted = [...optimistic].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  function toggle(c: Contact) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ id: c.id, isPrimary: !c.isPrimary });
      const res = await togglePrimary(accountId, c.id, !c.isPrimary);
      if (!res.ok) setError(`Couldn’t update ${c.name}: ${res.error}`);
    });
  }

  if (!contacts.length) return <p className="empty">No contacts on this account in Salesforce yet.</p>;

  return (
    <>
      <div className="contacts">
        {sorted.map((c) => (
          <article key={c.id} className={`contact${c.isPrimary ? " primary" : ""}`}>
            {c.isPrimary && <div className="primary-label">Primary</div>}
            <div className="name">{c.name}</div>
            <div className="title">{c.title ?? "No title on record"}</div>
            <div className="links">
              {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="missing">No email</span>}
              {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>}
            </div>
            <button
              type="button"
              className="pin"
              aria-pressed={c.isPrimary}
              disabled={!canPin}
              onClick={() => toggle(c)}
              title={
                canPin
                  ? c.isPrimary
                    ? "Unmark as primary"
                    : "Mark as primary"
                  : `Add a writable Contact.${primaryField} checkbox to enable pinning`
              }
              aria-label={`${c.isPrimary ? "Unmark" : "Mark"} ${c.name} as primary contact`}
            >
              {c.isPrimary ? "★" : "☆"}
            </button>
          </article>
        ))}
      </div>
      {error && <p className="error-inline">{error}</p>}
      {!canPin && (
        <p className="hint">
          Pinning is off: create a checkbox field <code>Contact.{primaryField}</code> and give the integration user edit
          access to it.
        </p>
      )}
    </>
  );
}
