import { db } from "../../db/db.ts";

export const initiateBlockedUsersTable = () => {
  db.run(
    `CREATE TABLE IF NOT EXISTS blocked_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocked_user INTEGER,
      blocker_user INTEGER,
      FOREIGN KEY (blocked_user) REFERENCES users(id),
      FOREIGN KEY (blocker_user) REFERENCES users(id)
    )`,
    (err) => {
      if (err)
        console.error("Error creating blocked_users table:", err.message);
      else console.log("✅ Blocked users table ready");
    }
  );
};
