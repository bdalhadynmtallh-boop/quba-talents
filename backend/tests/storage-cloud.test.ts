import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { SupabaseStorage } from '../src/services/storage/supabase.js';

test('Private object storage validates uploads, reads them and cleans up failed writes', async () => {
  const files = new Map<string, Buffer>();
  let publicBucket = false,
    failUpload = false,
    uploads = 0;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.apikey, 'server-only-test-key-1234567890');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const path = req.url!;
    const key = path.split('/').pop()!;
    res.setHeader('Content-Type', 'application/json');
    if (path === '/storage/v1/bucket/quba-private') {
      res.end(JSON.stringify({ id: 'quba-private', name: 'quba-private', public: publicBucket }));
    } else if (req.method === 'POST' && path.startsWith('/storage/v1/object/quba-private/')) {
      uploads++;
      files.set(key, bytes);
      res.statusCode = failUpload ? 503 : 200;
      res.end(JSON.stringify(failUpload ? { message: 'Test outage' } : { Key: key }));
    } else if (
      req.method === 'GET' &&
      path.startsWith('/storage/v1/object/quba-private/')
    ) {
      if (!files.has(key)) {
        res.statusCode = 404;
        res.end('{}');
      } else {
        res.setHeader('Content-Type', 'image/png');
        res.end(files.get(key));
      }
    } else if (req.method === 'DELETE' && path === '/storage/v1/object/quba-private') {
      const input = JSON.parse(bytes.toString()) as { prefixes: string[] };
      for (const prefix of input.prefixes) files.delete(prefix);
      res.end('[]');
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const storage = new SupabaseStorage(
    `http://127.0.0.1:${address.port}`,
    'server-only-test-key-1234567890',
    'quba-private',
  );
  try {
    await storage.initialize();
    publicBucket = true;
    await assert.rejects(storage.initialize(), /خاصة/);
    publicBucket = false;
    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#0066ff' },
    })
      .png()
      .toBuffer();
    await assert.rejects(storage.put(Buffer.from('<html>bad</html>'), 'bad.html'));
    assert.equal(uploads, 0);
    const file = await storage.put(image, 'student-original.png');
    assert.match(file.storageKey, /^[a-f0-9-]{36}\.png$/);
    assert.equal(file.originalName, 'student-original.png');
    const saved = await storage.read(file.storageKey);
    assert.equal((await sharp(saved).metadata()).format, 'png');
    const stream = await storage.open(file.storageKey);
    const parts: Buffer[] = [];
    for await (const part of stream) parts.push(Buffer.from(part));
    assert.deepEqual(Buffer.concat(parts), saved);
    await assert.rejects(storage.read('../secret'));
    await storage.remove(file.storageKey);
    await storage.remove(file.storageKey);
    assert.equal(files.size, 0);
    failUpload = true;
    await assert.rejects(storage.put(image, 'failed.png'));
    assert.equal(files.size, 0, 'A partially written object is deleted after upload failure');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
