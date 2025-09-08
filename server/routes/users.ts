import type { FastifyInstance } from "fastify"
import {getUserById, getUsers, newAlias, NewFriendRequest, RemoveRequst, FriendRequests, SearchRequest} from '../controllers/users'
import { verifyTokenAndAuthorization, verifyToken } from "../middleware/verifyToken"

interface Params {
	id: string;
}

export async function UserRoutes(fastify: FastifyInstance) {
	// users routes
	fastify.get<{ Params: any }>(
		'/user/:id',
		{ preHandler: verifyTokenAndAuthorization,},
		getUserById);
	
	fastify.get('/', {preHandler: verifyToken}, getUsers);

	fastify.post('/user/Newalias/:id', { preHandler: verifyTokenAndAuthorization}, newAlias);

	// freindship routes
	fastify.post('/user/freindRequests/:id', { preHandler: verifyTokenAndAuthorization}, NewFriendRequest)
	fastify.delete('/user/freindRequests/:id', { preHandler: verifyTokenAndAuthorization}, RemoveRequst)
	fastify.get('/user/freindRequests/:id', {preHandler: verifyTokenAndAuthorization}, FriendRequests)
	fastify.get('/user/search', {preHandler: verifyToken}, SearchRequest)
}
