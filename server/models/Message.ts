import { db } from "../db/db.ts";

export interface Message {
  sender_id: number;
  sender_avatarurl?: string;
  receiver_id: number;
  content: string;
  timestamp?: string;
}

db.serialize(() => {
  // messages table

  db.run(
    `
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER NOT NULL,
          sender_avatarurl TEXT NOT NULL,
          receiver_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES users(id),
          FOREIGN KEY (receiver_id) REFERENCES users(id)
        )
      `,
    (err) => {
      if (err) {
        console.error("Error creating posts table:", err.message);
      } else {
        console.log("Messages ready");
      }
    }
  );
});

// Message queries

export const getAllMessages = (): Promise<Message[]> => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM messages ORDER BY timestamp DESC", (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as Message[]);
      }
    });
  });
};

export const createMessage = async (
  message: Omit<Message, "id" | "timestamp">
): Promise<Message> => {
  const timestamp = new Date().toISOString();

  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO messages (sender_id, sender_avatarurl, receiver_id, content, timestamp) VALUES (?, ?, ?, ?, ?)",
      [
        message.sender_id,
        message.sender_avatarurl,
        message.receiver_id,
        message.content,
        timestamp,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            sender_id: message.sender_id,
            sender_avatarurl: message.sender_avatarurl,
            receiver_id: message.receiver_id,
            content: message.content,
            timestamp: timestamp,
          });
        }
      }
    );
  });
};
