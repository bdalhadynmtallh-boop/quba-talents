import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
const unicodeHex = (hex: string) =>
  Buffer.from(Buffer.from(hex, 'hex').swap16().toString('utf16le').normalize('NFKC'), 'utf16le')
    .swap16()
    .toString('hex')
    .toUpperCase();
// Chromium can map Arabic glyphs to presentation forms. Normalize only text maps,
// preserving the glyphs and positions so selection/search uses ordinary Unicode.
export async function normalizePdfUnicode(bytes: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || !object.has(PDFName.of('ToUnicode'))) continue;
    const raw = doc.context.lookup(object.get(PDFName.of('ToUnicode')));
    if (!(raw instanceof PDFRawStream)) continue;
    const text = Buffer.from(decodePDFRawStream(raw).decode()).toString('ascii');
    const normalized = text
      .replace(
        /(\d+) beginbfchar([\s\S]*?)endbfchar/g,
        (_, count: string, pairs: string) =>
          `${count} beginbfchar${pairs.replace(/<([\da-f]+)>\s*<([\da-f]+)>/gi, (_: string, glyph: string, value: string) => `<${glyph}> <${unicodeHex(value)}>`)}endbfchar`,
      )
      .replace(
        /(\d+) beginbfrange([\s\S]*?)endbfrange/g,
        (block: string, _count: string, ranges: string) => {
          if (ranges.includes('[')) return block;
          const pairs: string[] = [];
          for (const match of ranges.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]{4})>/gi)) {
            const first = parseInt(match[1]!, 16),
              last = parseInt(match[2]!, 16),
              code = parseInt(match[3]!, 16);
            if (last - first > 65536) throw new Error('Invalid CMap range');
            for (let i = first; i <= last; i++)
              pairs.push(
                `<${i.toString(16).padStart(4, '0')}> <${unicodeHex((code + i - first).toString(16).padStart(4, '0'))}>`,
              );
          }
          return pairs.length
            ? Array.from({ length: Math.ceil(pairs.length / 100) }, (_, i) => {
                const chunk = pairs.slice(i * 100, (i + 1) * 100);
                return `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`;
              }).join('\n')
            : block;
        },
      );
    object.set(PDFName.of('ToUnicode'), doc.context.register(doc.context.flateStream(normalized)));
  }
  return Buffer.from(await doc.save());
}
