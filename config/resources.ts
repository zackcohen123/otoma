/**
 * Default Quick Access rows, merged with each Account's
 * Quick_Access_Resources__c field. "*" applies to every account; other keys
 * match the Account's Type picklist value (case-insensitive).
 *
 * Leave `url` empty for a resource that doesn't exist yet — it renders as
 * "Pending" instead of a broken link. An account's own field entry with the
 * same label replaces the default (so you can point "Case study" at the
 * right one per account).
 */
export type ResourceDefault = { label: string; url?: string; note?: string };

export const resourceDefaults: Record<string, ResourceDefault[]> = {
  "*": [
    { label: "Otoma POV (PDF)", url: "" },
    { label: "One-pager", url: "" },
  ],
  Prospect: [{ label: "Case study", url: "" }],
  Customer: [{ label: "Account plan", url: "" }],
};
