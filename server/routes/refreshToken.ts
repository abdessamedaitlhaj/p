// src/routes/refreshToken.ts
import type { FastifyInstance } from 'fastify';
import { handleRefreshToken } from '../controllers/refreshToken.ts';

export async function RefreshRoutes(fastify: FastifyInstance) {
  fastify.get('/new', handleRefreshToken);
}
