import { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../../db/db";
import { Message } from "@/types/types";

export const getMessages = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Only return messages where the authenticated user is sender or receiver
    const userId = request.user_infos?.id;
    if (!userId) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const messages = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `
        SELECT * FROM messages 
        WHERE sender_id = ? OR receiver_id = ?
        ORDER BY timestamp DESC
      `,
        [userId, userId],
        (err: any, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    return { messages };
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Failed to fetch messages" });
  }
};

// --- Promisified DB Helpers ---

// Helper for INSERT/UPDATE/DELETE operations (db.run)
const dbRun = (
  sql: string,
  params: any[] = []
): Promise<{ lastID: number; changes: number }> => {
  return new Promise((resolve, reject) => {
    db.run(
      sql,
      params,
      function (
        this: { lastID: number; changes: number } | undefined,
        err: Error | null
      ) {
        if (err) {
          return reject(err);
        }
        // 'this' context holds lastID and changes for successful runs
        resolve({ lastID: this?.lastID || 0, changes: this?.changes || 0 });
      }
    );
  });
};

// Helper for SELECT single row (db.get)
const dbGet = <T = any>(
  sql: string,
  params: any[] = []
): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
};

// Helper for SELECT multiple rows (db.all) - not strictly needed here but good to have
const dbAll = <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
};

interface SaveMessageParams {
  sender_id: number;
  sender_avatarurl?: string;
  receiver_id: number;
  content: string;
}

export async function createMessage(
  params: SaveMessageParams,
  log?: (message: string, ...args: any[]) => void
): Promise<Message> {
  const { sender_id, sender_avatarurl, receiver_id, content } = params;

  if (!sender_id || !receiver_id || !content) {
    throw new Error("Missing required fields for message creation.");
  }

  const logger = log || console.log;

  try {
    interface ConversationParticipantRow {
      conversation_id: number;
      user_id: string;
    }

    const existingConversation = await dbGet<ConversationParticipantRow>(
      `
      SELECT cp.conversation_id
      FROM conversation_participants cp
      WHERE cp.user_id = ?
      AND cp.conversation_id IN (
          SELECT cp2.conversation_id
          FROM conversation_participants cp2
          WHERE cp2.user_id = ?
      )
      LIMIT 1;
      `,
      [sender_id, receiver_id]
    );

    let conversationId: number;

    if (!existingConversation) {
      const conversationResult = await dbRun(
        `INSERT INTO conversations DEFAULT VALUES`
      );
      conversationId = conversationResult.lastID;

      await dbRun(
        `
        INSERT INTO conversation_participants (conversation_id, user_id)
        VALUES (?, ?), (?, ?)
        `,
        [conversationId, sender_id, conversationId, receiver_id]
      );
      logger(
        `[saveMessageToDb] Created conversation ${conversationId} and added participants.`
      );
    } else {
      conversationId = existingConversation.conversation_id;
      logger(
        `[saveMessageToDb] Using existing conversation ${conversationId}.`
      );
    }

    const timestamp = new Date().toISOString();
    const messageResult = await dbRun(
      "INSERT INTO messages (sender_id, sender_avatarurl, receiver_id, content, timestamp, conversation_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        sender_id,
        sender_avatarurl,
        receiver_id,
        content,
        timestamp,
        conversationId,
      ]
    );

    console.log("----------------Messsage Result--------------");
    console.log(messageResult);
    console.log("----------------Messsage Result--------------");
    const newMessage: Message = {
      id: messageResult.lastID,
      sender_id,
      sender_avatarurl,
      receiver_id,
      content,
      timestamp,
      conversation_id: conversationId,
    };

    return newMessage;
  } catch (err: any) {
    logger(`[saveMessageToDb] Error: ${err.message}`);
    throw err;
  }
}

interface ConversationParams {
  userId: number;
  otherUserId: number;
}

export const getConversation = async (
  request: FastifyRequest<{ Params: ConversationParams }>,
  reply: FastifyReply
) => {
  const { userId, otherUserId } = request.params;
  const authenticatedUserId = request.user_infos?.id;

  if (!userId || !otherUserId) {
    return reply.status(400).send({ error: "Missing user IDs" });
  }

  if (!authenticatedUserId) {
    return reply.status(401).send({ error: "User not authenticated" });
  }

  // Ensure the authenticated user is one of the participants in the conversation
  if (
    String(authenticatedUserId) !== String(userId) &&
    String(authenticatedUserId) !== String(otherUserId)
  ) {
    return reply
      .status(403)
      .send({ error: "You are not authorized to view this conversation" });
  }

  try {
    const messages = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY timestamp ASC
      `,
        [userId, otherUserId, otherUserId, userId],
        (err: any, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    const formattedMessages = messages.map((msg) => ({
      sender_id: String(msg.sender_id),
      sender_avatarurl: msg.sender_avatarurl,
      receiver_id: String(msg.receiver_id),
      text: msg.content,
      timestamp: msg.timestamp,
    }));

    return { messages: formattedMessages };
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Failed to fetch conversation" });
  }
};
