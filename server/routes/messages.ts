// src/routes/messages.ts
import type { FastifyInstance } from "fastify";
import {
  createMessage,
  getMessages,
  getConversation,
} from "../controllers/chat/messages.ts";
import { verifyToken } from "../middleware/verifyToken";

interface Params {
  id: number;
}

export async function MessageRoutes(fastify: FastifyInstance) {
  fastify.get("/", { preHandler: verifyToken }, getMessages);
  fastify.post("/", { preHandler: verifyToken }, createMessage);
  fastify.get(
    "/conversation/:userId/:otherUserId",
    { preHandler: verifyToken },
    getConversation
  );
}
