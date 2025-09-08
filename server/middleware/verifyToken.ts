import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';


interface UserInfo {
  id: string;
  username: string;
}

interface JwtPayload {
  UserInfo: UserInfo;
  iat?: number;
  exp?: number;
}

// Extend FastifyRequest to include user_infos
declare module 'fastify' {
  interface FastifyRequest {
    user_infos?: UserInfo;
  }
}

interface AuthorizedParams {
  id: number;
}

const verifyJwt = (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return reply.status(401).send({message: 'undefined Auth', authHeader});
  }

  if (!authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({message: 'Invalid Auth'});
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string, (err: any, decoded: any) => {
    if (err) return reply.status(403).send({ error: 'invalid token' }); // invalid token
    
    const payload = decoded as JwtPayload;
    req.user_infos = payload.UserInfo;
    done();
  });
};

// user/:id or /settings  
export const verifyTokenAndAuthorization = (req: FastifyRequest<{ Params: AuthorizedParams , Query : {id:string}}>, reply: FastifyReply, done: HookHandlerDoneFunction) => {
  verifyJwt(req, reply, () => {
    // Check both params.id and query.id for backward compatibility
    const requestId = (req.params as any)?.id || (req.query as any)?.id;
    if (req.user_infos && req.user_infos.id == requestId) {
      done();
    } else {
      reply.status(403).send('You are not allowed to do that');
    }
  });
};

// for authenticated pages
export const verifyToken = (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
  verifyJwt(req, reply, done);
};