export function requireTestDatabaseUrl(value: string | undefined): string {
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required; application environment files are never a fallback.',
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid dedicated test database configuration.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^\/[a-zA-Z0-9_-]+_test$/.test(url.pathname)
  ) {
    throw new Error('Use a dedicated PostgreSQL database whose name ends in _test.');
  }
  return value;
}
