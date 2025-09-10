import { db } from "../db/db.ts"

db.run(
    `
    CREATE TABLE IF NOT EXISTS blocked_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blocked_user INTEGER,
        blocker_user INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
)