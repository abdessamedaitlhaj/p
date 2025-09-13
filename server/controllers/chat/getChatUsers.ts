import { db } from "../../db/db";

export const getChatUsers = async (request: any, reply: any) => {
  try {
    const userId = request.user_infos?.id;
    if (!userId) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const users = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `
            SELECT DISTINCT u.id, u.username, u.avatarurl
            FROM users u
            JOIN conversation_participants cp ON u.id = cp.user_id
            WHERE cp.conversation_id IN (
            SELECT conversation_id
            FROM conversation_participants
            WHERE user_id = ?
            ) AND u.id != ?
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

    return { users };
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: "Failed to fetch chat users" });
  }
};
