import { db } from '../db/db.ts';

db.run(
  `
  CREATE TABLE IF NOT EXISTS usersettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    paddle_color VARCHAR(9),
    paddle_size INTEGER,
    ball_speed INTEGER,
    createdAT TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
  `,
  (err) => {
    if (err) console.error('❌ Failed to create usersettings table', err.message);
    else console.log('✅ usersettings table ready.');
  }
);
