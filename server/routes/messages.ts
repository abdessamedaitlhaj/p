// src/routes/messages.ts
import type { FastifyInstance } from 'fastify';
import { createMsg, getMessages, getConversation } from '../controllers/messages.ts';
import { verifyToken } from '../middleware/verifyToken';

interface Params {
    id: number;
}

export async function MessageRoutes(fastify: FastifyInstance) {
    fastify.get('/', { preHandler: verifyToken }, getMessages);
    fastify.post('/', { preHandler: verifyToken }, createMsg);
    fastify.get('/conversation/:userId/:otherUserId', { preHandler: verifyToken }, getConversation);
}
