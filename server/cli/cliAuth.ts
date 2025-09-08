import type { FastifyRequest, FastifyReply } from 'fastify';
import { cliTokenStore } from './cliTokenStore';
import jwt from 'jsonwebtoken';

interface AuthorizeBody { socketId: string; }

// Normal access token verification (reuse ACCESS_TOKEN_SECRET)
function verifyNormalAccessToken(req: FastifyRequest): { userId: string } | null {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string);
    const id = decoded?.UserInfo?.id;
    if (!id) return null;
    return { userId: String(id) };
  } catch {
    return null;
  }
}

export const authorizeCli = async (req: FastifyRequest<{ Body: AuthorizeBody }>, reply: FastifyReply) => {
  const auth = verifyNormalAccessToken(req);
  if (!auth) return reply.status(401).send({ message: 'login error' });
  const { socketId } = req.body || {};
  if (!socketId) return reply.status(400).send({ message: 'socketId required' });
  // Validate socket still connected
  const io: any = (global as any).io;
  if (!io?.sockets?.sockets?.get(socketId)) return reply.status(400).send({ message: 'invalid socket' });
  const rec = cliTokenStore.issue(auth.userId, socketId, 1); // 1 hour
  reply.send({ token: rec.token, expiresAt: rec.expiresAt });
};

export const revokeCli = async (req: FastifyRequest, reply: FastifyReply) => {
  // Accept either CLI token or normal token for convenience
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    const normal = verifyNormalAccessToken(req);
    if (normal) { cliTokenStore.revoke(normal.userId); return reply.send({ revoked: true }); }
    // Try CLI token decode
    try { const decoded: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string); if (decoded?.type === 'cli') { cliTokenStore.revoke(String(decoded.userId)); return reply.send({ revoked: true }); } } catch {}
  }
  reply.status(400).send({ revoked: false });
};
