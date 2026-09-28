import type { Row } from '../types';

export interface SalesforceClient {
  readonly source: 'zapier-mcp' | 'mock';
  /** Run one SOQL SELECT. Pagination is handled inside the client. */
  soql(query: string): Promise<Row[]>;
  /** Warnings raised so far (truncated results and so on). Clears the list. */
  drainWarnings(): string[];
  /** Number of underlying calls and their total duration since the client was created. */
  stats(): { calls: number; ms: number };
  close(): Promise<void>;
}

export class SoqlError extends Error {
  constructor(message: string, readonly query: string, readonly transient = false) {
    super(message);
  }
}

export const isAggregate = (q: string) => /\b(count|sum|avg|min|max)\s*\(/i.test(q) || /\bgroup\s+by\b/i.test(q);
