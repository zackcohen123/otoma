// Read-only guard. Every query sent to Salesforce passes through assertSelectOnly,
// and every MCP tool we call passes through assertReadOnlyTool.

const WRITE_KEYWORDS = /\b(insert|update|delete|upsert|merge|undelete)\b/i;

export class UnsafeQueryError extends Error {}

export function assertSelectOnly(query: string): string {
  const q = query.trim();
  if (!/^select\s/i.test(q)) throw new UnsafeQueryError('Only SELECT queries are allowed');
  // Strip string literals before looking for statement separators or DML keywords,
  // so a value such as 'Update pending' does not trip the check.
  const bare = q.replace(/'(?:\\.|[^'\\])*'/g, "''");
  if (bare.includes(';')) throw new UnsafeQueryError('Multiple statements are not allowed');
  if (WRITE_KEYWORDS.test(bare)) throw new UnsafeQueryError('Write keywords are not allowed');
  // SOQL "FOR UPDATE" locks rows; "FOR VIEW"/"FOR REFERENCE" update LastViewedDate. Reject both.
  if (/\bfor\s+(update|view|reference)\b/i.test(bare)) throw new UnsafeQueryError('FOR clauses are not allowed');
  return q;
}

const WRITE_TOOL_NAME = /(create|update|delete|remove|upsert|insert|send|launch|convert|add_|mutating|write|apex|attach|file)/i;

export function assertReadOnlyTool(name: string): string {
  if (WRITE_TOOL_NAME.test(name)) throw new UnsafeQueryError(`Refusing to call tool "${name}": name implies a write`);
  return name;
}
