import { db } from "../../db/db.ts";

export interface Message {
  sender_id: number;
  sender_avatarurl?: string;
  receiver_id: number;
  content: string;
  timestamp?: string;
}

export const initiateMessageTable = () => {
  db.run(
    `
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER,
          sender_id INTEGER NOT NULL,
          sender_avatarurl TEXT NOT NULL,
          receiver_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES users(id),
          FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `,
    (err) => {
      if (err) {
        console.error("Error creating posts table:", err.message);
      } else {
        console.log("✅ Messages ready");
      }
    }
  );
};
