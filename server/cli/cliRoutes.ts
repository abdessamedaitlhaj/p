import type { FastifyInstance } from 'fastify';
import { authorizeCli, revokeCli } from './cliAuth';
import { verifyCliToken } from './cliMiddleware';
import { cliStart, cliMove, cliStatus } from './cliGameActions';
import { verifyToken } from '../middleware/verifyToken';

export async function CliAuthRoutes(app: FastifyInstance) {
  app.post('/authorize', { preHandler: verifyToken }, authorizeCli); // requires normal access token
  app.post('/revoke', { preHandler: verifyToken }, revokeCli); // now requires authentication
}

export async function CliRoutes(app: FastifyInstance) {
  app.post('/start', { preHandler: verifyCliToken }, cliStart);
  app.post('/move', { preHandler: verifyCliToken }, cliMove);
  app.get('/status', { preHandler: verifyCliToken }, cliStatus);
}
