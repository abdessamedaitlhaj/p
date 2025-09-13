import { db } from "../../db/db.ts";

export const initiateConversationParticipantsTable = () => {
  db.run(
    `
        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (conversation_id, user_id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `,
    (err) => {
      if (err) {
        console.error(
          "Error creating conversation_participants table:",
          err.message
        );
      } else {
        console.log("✅ Conversation_participants table ready");
      }
    }
  );
};
