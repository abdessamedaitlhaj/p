import { FastifyRequest, FastifyReply } from 'fastify';
import { getAllMessages, createMessage } from "../models/Message";
import { db } from "../db/db";


interface CreateMessageBody {
  sender_id: number;
  receiver_id: number; 
  text: string;
}

export const getMessages = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Only return messages where the authenticated user is sender or receiver
    const userId = request.user_infos?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'User not authenticated' });
    }

    const messages = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT * FROM messages 
        WHERE sender_id = ? OR receiver_id = ?
        ORDER BY timestamp DESC
      `, [userId, userId], (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    return { messages };
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: 'Failed to fetch messages' });
  }
};

export const createMsg = async (
  request: FastifyRequest<{ Body: CreateMessageBody }>, 
  reply: FastifyReply
) => {
  const { sender_id, receiver_id, text } = request.body;
  const authenticatedUserId = request.user_infos?.id;

  if (!sender_id || !receiver_id || !text) {
    return reply.status(400).send({ error: 'Missing required fields' });
  }

  if (!authenticatedUserId) {
    return reply.status(401).send({ error: 'User not authenticated' });
  }

  // Ensure the authenticated user matches the sender_id (prevent impersonation)
  if (authenticatedUserId !== String(sender_id)) {
    return reply.status(403).send({ error: 'You can only send messages as yourself' });
  }

  try {
    const message = await createMessage({ 
      sender_id, 
      receiver_id, 
      text 
    });
    reply.status(201).send({ message });
  } catch (error: any) {
    request.log.error(error);
    reply.status(500).send({ error: 'Failed to create message' });
  }
};

interface ConversationParams {
  userId: string;
  otherUserId: string;
}

export const getConversation = async (
  request: FastifyRequest<{ Params: ConversationParams }>, 
  reply: FastifyReply
) => {
  const { userId, otherUserId } = request.params;
  const authenticatedUserId = request.user_infos?.id;

  if (!userId || !otherUserId) {
    return reply.status(400).send({ error: 'Missing user IDs' });
  }

  if (!authenticatedUserId) {
    return reply.status(401).send({ error: 'User not authenticated' });
  }

  // Ensure the authenticated user is one of the participants in the conversation
  // Convert to strings for comparison since URL params are strings
  if (String(authenticatedUserId) !== userId && String(authenticatedUserId) !== otherUserId) {
    return reply.status(403).send({ error: 'You are not authorized to view this conversation' });
  }

  try {
    const messages = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY timestamp ASC
      `, [userId, otherUserId, otherUserId, userId], (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    const formattedMessages = messages.map(msg => ({
      sender_id: String(msg.sender_id),
      receiver_id: String(msg.receiver_id),
      text: msg.content,
      timestamp: new Date(msg.timestamp).toISOString() // Ensure consistent ISO format
    }));

    return { messages: formattedMessages };
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: 'Failed to fetch conversation' });
  }
};