/** Relationship statuses that should read as a warning get the rust accent; healthy ones get teal. */
export function statusTone(status: string | null): "teal" | "rust" | "" {
  if (!status) return "";
  if (/risk|churn|lost|inactive|stalled|dormant|closed|former|cancel/i.test(status)) return "rust";
  if (/^\s*not\b|unengaged/i.test(status)) return "";
  if (/active|customer|live|engaged|evaluat|open|partner|expan|pilot|opportun/i.test(status)) return "teal";
  return "";
}
