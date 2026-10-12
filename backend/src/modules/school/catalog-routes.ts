import type { FastifyInstance } from 'fastify';
import { catalogSchema, talentCatalogSchema } from '@quba/shared';
import { paramId } from '../../lib/params.js';
import { createCatalogService } from './catalog-service.js';
export async function catalogRoutes(app: FastifyInstance) {
  const catalog = createCatalogService(app.db),
    auth = { preHandler: app.requireAdmin };
  app.get('/registration-options', async () => {
    const data = await catalog.read(true);

    // Public projection deliberately exposes only the two active lists.
    return {
      classrooms: data.classrooms.map(({ id, name }) => ({ id, name })),
      talents: data.talents.map(({ id, name }) => ({ id, name })),
    };
  });
  app.get('/school/catalogs', auth, () => catalog.read(false));
  for (const kind of ['classrooms', 'talents'] as const) {
    const schema = kind === 'classrooms' ? catalogSchema : talentCatalogSchema;
    app.post(`/school/${kind}`, auth, async (request, reply) =>
      reply.code(201).send(await catalog.create(kind, schema.parse(request.body))),
    );
    app.put(`/school/${kind}/:id`, auth, (request) =>
      catalog.update(kind, paramId(request.params, 'id'), schema.parse(request.body)),
    );
  }
}
