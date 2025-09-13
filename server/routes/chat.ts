import type { FastifyInstance } from "fastify";
import { getChatUsers } from "../controllers/chat/getChatUsers.ts";
import { verifyToken } from "server/middleware/verifyToken.ts";

export async function ChatRoutes(fastify: FastifyInstance) {
  fastify.get("/chatUsers", { preHandler: verifyToken }, getChatUsers);
}
