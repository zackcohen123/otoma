import { describe, expect, it } from 'vitest';
import { assertReadOnlyTool, assertSelectOnly } from '../lib/soql-guard';

describe('query validator', () => {
  it.each([
    'UPDATE Account SET Name = 1',
    'DELETE FROM Account',
    'INSERT INTO Account (Name) VALUES (1)',
    'upsert Account',
    'SELECT Id FROM Account; DELETE FROM Account',
    'SELECT Id FROM Account; SELECT Id FROM Contact',
    'SELECT Id FROM Account FOR UPDATE',
    'SELECT Id FROM Account FOR VIEW',
    '  -- SELECT\nDELETE FROM Account',
    '',
  ])('rejects %j', (q) => {
    expect(() => assertSelectOnly(q)).toThrow();
  });

  it('accepts SELECT, including write words inside string literals', () => {
    expect(assertSelectOnly('  select Id FROM Account')).toBe('select Id FROM Account');
    expect(() => assertSelectOnly("SELECT Id FROM Task WHERE Subject = 'Update; delete pending'")).not.toThrow();
  });

  it('refuses tools whose names imply writes', () => {
    for (const t of ['salesforce_update_record', 'salesforce_create_contact', 'execute_zapier_write_action', 'salesforce_make_api_mutating_request', 'salesforce_delete_record']) {
      expect(() => assertReadOnlyTool(t)).toThrow();
    }
    for (const t of ['salesforce_custom_soql_query', 'execute_zapier_read_action', 'inspect_zapier_actions']) {
      expect(assertReadOnlyTool(t)).toBe(t);
    }
  });
});
