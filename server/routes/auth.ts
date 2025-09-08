// src/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import { Login, SignUp, Logout } from '../controllers/auth.ts';
import { getUsers } from '../controllers/users.ts';


export async function AuthRoutes(fastify: FastifyInstance) {
  fastify.post('/signin', Login);
  fastify.post('/signup', SignUp);
  fastify.get('/logout', Logout);
}
