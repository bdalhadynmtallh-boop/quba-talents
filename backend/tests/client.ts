import type { FastifyInstance, InjectOptions } from 'fastify';
export class TestClient {
  private cookies = new Map<string, string>();
  constructor(
    public app: FastifyInstance,
    private origin: string,
  ) {}
  async request(options: InjectOptions) {
    const response = await this.app.inject({
      ...options,
      headers: {
        cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...options.headers,
      },
    });
    for (const cookie of response.cookies) {
      if (cookie.value) this.cookies.set(cookie.name, cookie.value);
      else this.cookies.delete(cookie.name);
    }
    return response;
  }
  async csrf() {
    const result = await this.request({ url: '/api/auth/csrf' });
    return { origin: this.origin, 'x-csrf-token': result.json<{ token: string }>().token };
  }
  async post(url: string, payload?: InjectOptions['payload']) {
    return this.request({ method: 'POST', url, payload, headers: await this.csrf() });
  }
  async mutate(method: 'PUT' | 'DELETE', url: string, payload?: InjectOptions['payload']) {
    return this.request({ method, url, payload, headers: await this.csrf() });
  }
}
export function multipart(
  data: unknown,
  files: Array<{ name: string; type: string; buffer: Buffer }>,
) {
  const boundary = 'quba-test-boundary';
  const parts: Buffer[] = [];
  if (data !== undefined)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n`,
      ),
    );
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.buffer,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
