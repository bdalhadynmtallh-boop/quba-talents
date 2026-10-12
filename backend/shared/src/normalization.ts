export function normalizeArabic(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Catalog names additionally ignore the Arabic definite article, so برمجة / البرمجه collide.
export function catalogNameKey(value: string): string {
  return normalizeArabic(value).replace(/(^| )ال(?=[\u0621-\u064A])/g, '$1');
}
