import type { FastifyInstance } from 'fastify';
import { getDashboard } from './service.js';
export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: app.requireAdmin }, () => getDashboard(app.db));
}
