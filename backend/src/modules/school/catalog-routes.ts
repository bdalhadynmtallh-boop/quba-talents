import type { FastifyInstance } from 'fastify';
import { catalogSchema, talentCatalogSchema, catalogNameKey } from '@quba/shared';
import { paramId } from '../../lib/params.js';
import { AppError } from '../../lib/errors.js';
import { ensureSchool } from './routes.js';
export async function catalogRoutes(app: FastifyInstance) {
  const select = { id: true, name: true, sortOrder: true, active: true };
  const orderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];
  const read = async (activeOnly: boolean) => ({
    classrooms: await app.db.classroom.findMany({
      where: { schoolId: 'school', ...(activeOnly ? { active: true } : {}) },
      select,
      orderBy,
    }),
    talents: await app.db.talent.findMany({
      where: { schoolId: 'school', ...(activeOnly ? { active: true } : {}) },
      select,
      orderBy,
    }),
  });
  app.get('/registration-options', async () => {
    const data = await read(true);
    // Public projection deliberately exposes only the two active lists.
    return {
      classrooms: data.classrooms.map(({ id, name }) => ({ id, name })),
      talents: data.talents.map(({ id, name }) => ({ id, name })),
    };
  });
  app.get('/school/catalogs', { preHandler: app.requireAdmin }, () => read(false));
  for (const kind of ['classrooms', 'talents'] as const) {
    const schema = kind === 'classrooms' ? catalogSchema : talentCatalogSchema;
    app.post(`/school/${kind}`, { preHandler: app.requireAdmin }, async (request, reply) => {
      const input = schema.parse(request.body),
        nameKey = catalogNameKey(input.name);
      if (!nameKey) throw new AppError(400, 'CATALOG_NAME', 'أدخل اسمًا واضحًا يحتوي على حروف.');
      await ensureSchool(app);
      const data = { ...input, nameKey, schoolId: 'school' };
      const item =
        kind === 'classrooms'
          ? await app.db.classroom.create({ data, select })
          : await app.db.talent.create({ data, select });
      return reply.code(201).send(item);
    });
    app.put(`/school/${kind}/:id`, { preHandler: app.requireAdmin }, async (request) => {
      const input = schema.parse(request.body),
        nameKey = catalogNameKey(input.name),
        id = paramId(request.params, 'id');
      if (!nameKey) throw new AppError(400, 'CATALOG_NAME', 'أدخل اسمًا واضحًا يحتوي على حروف.');
      const data = { ...input, nameKey };
      return kind === 'classrooms'
        ? app.db.classroom.update({ where: { id, schoolId: 'school' }, data, select })
        : app.db.talent.update({ where: { id, schoolId: 'school' }, data, select });
    });
  }
  // Catalog deletion is deliberately absent; disable retains all existing relationships.
}
