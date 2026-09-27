/**
 * Turns Salesforce long-text / rich-text field values into simple blocks the
 * UI can render as readable prose — no raw HTML ever reaches the page.
 */
export type ProseBlock =
  | { kind: "para"; lines: ProseLine[] }
  | { kind: "list"; ordered: boolean; items: ProseLine[] };
export type ProseLine = { lead: string | null; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function htmlToText(input: string) {
  if (!/<[a-z!/][\s\S]*>/i.test(input)) return input;
  return input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) =>
      ENTITIES[e] ?? (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1)) || 32) : m),
    );
}

const BULLET = /^\s*(?:[-*•–·]|\d+[.)])\s+/;

// "Champion: Jane Doe" → bold "Champion:" so labelled notes scan quickly.
function splitLead(text: string): ProseLine {
  const m = text.match(/^([A-Z][^:.!?]{0,28}):\s+(.+)$/);
  return m ? { lead: m[1] + ":", text: m[2] } : { lead: null, text };
}

export function toProse(raw: string | null): ProseBlock[] {
  if (!raw) return [];
  const text = htmlToText(raw).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n");
  const blocks: ProseBlock[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: ProseLine[] = [];
    let list: { ordered: boolean; items: ProseLine[] } | null = null;
    const flushPara = () => {
      if (para.length) blocks.push({ kind: "para", lines: para });
      para = [];
    };
    const flushList = () => {
      if (list) blocks.push({ kind: "list", ...list });
      list = null;
    };
    for (const line of lines) {
      if (BULLET.test(line)) {
        flushPara();
        list ??= { ordered: /^\s*\d/.test(line), items: [] };
        list.items.push(splitLead(line.replace(BULLET, "")));
      } else {
        flushList();
        para.push(splitLead(line));
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}
