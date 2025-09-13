import { db } from "../../db/db.ts";

export const initiateConversationTable = () => {
  db.run(
    `
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
    (err) => {
      if (err) {
        console.error("Error creating conversations table:", err.message);
      } else {
        console.log("✅ Conversations table ready");
      }
    }
  );
};
