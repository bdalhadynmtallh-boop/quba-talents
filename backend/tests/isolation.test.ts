import test from 'node:test';
import assert from 'node:assert/strict';
import { requireTestDatabaseUrl } from './isolation.js';

test('Test configuration rejects application databases and never falls back to environment files', () => {
  for (const value of [
    undefined,
    '',
    'not-a-url',
    'https://localhost/quba_test',
    'postgresql://localhost/quba',
    'postgresql://localhost/',
  ]) {
    assert.throws(() => requireTestDatabaseUrl(value));
  }
  const dedicated = 'postgresql://test-only@127.0.0.1:55462/quba_isolated_test';
  assert.equal(requireTestDatabaseUrl(dedicated), dedicated);
});
