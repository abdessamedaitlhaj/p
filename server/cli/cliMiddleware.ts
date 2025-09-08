import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { cliTokenStore } from './cliTokenStore';
import jwt from 'jsonwebtoken';

declare module 'fastify' {
  interface FastifyRequest { cliUserId?: string; cliSocketId?: string; }
}

export function verifyCliToken(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    reply.status(401).send({ message: 'login error' }); return;
  }
  const token = header.split(' ')[1];
  const rec = cliTokenStore.validate(token);
  if (!rec) { reply.status(401).send({ message: 'login error' }); return; }
  // Validate socket still connected
  const io: any = (global as any).io;
  if (!io?.sockets?.sockets?.get(rec.socketId)) { cliTokenStore.revoke(rec.userId); reply.status(401).send({ message: 'login error' }); return; }
  req.cliUserId = rec.userId;
  req.cliSocketId = rec.socketId;
  done();
}
