export const schoolChangeEvent = 'school-data-changed';
export const sessionExpiredEvent = 'quba-session-expired';
export type ChangeScope = 'all' | 'school' | 'catalogs' | 'academic-years' | 'students';
export const notifySchoolChange = (scope: ChangeScope = 'all') =>
  window.dispatchEvent(new CustomEvent(schoolChangeEvent, { detail: { scope } }));
export function resourceAffected(url: string, scope: ChangeScope) {
  if (scope === 'all') return true;
  if (url.startsWith('/students') || url.startsWith('/dashboard')) return true;
  if (scope === 'school') return url === '/school';
  if (scope === 'catalogs')
    return url.startsWith('/school/catalogs') || url.startsWith('/registration-options');
  if (scope === 'academic-years') return url.startsWith('/academic-years');
  return url.startsWith('/registrations');
}
