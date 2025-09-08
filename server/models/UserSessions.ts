import { db } from '../db/db.ts';

// Create user_sessions table if not exists (multi-session refresh tokens)
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        refreshToken TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_used TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
     )`,
    (err) => {
      if (err) console.error('❌ Failed to create user_sessions table:', err.message);
      else console.log('✅ user_sessions table ready.');
    }
  );
});

export interface UserSession {
  id: number;
  user_id: number;
  refreshToken: string;
  created_at: string;
  last_used: string;
}

export const createSession = (userId: number, refreshToken: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO user_sessions (user_id, refreshToken) VALUES (?, ?)',
      [userId, refreshToken],
      function (err) {
        if (err) reject(err); else resolve(this.lastID as number);
      }
    );
  });
};

export const findSessionByToken = (token: string): Promise<UserSession | undefined> => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM user_sessions WHERE refreshToken = ?', [token], (err, row) => {
      if (err) reject(err); else resolve(row as UserSession | undefined);
    });
  });
};

export const deleteSessionByToken = (token: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM user_sessions WHERE refreshToken = ?', [token], function (err) {
      if (err) reject(err); else resolve();
    });
  });
};

export const touchSession = (token: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run('UPDATE user_sessions SET last_used = CURRENT_TIMESTAMP WHERE refreshToken = ?', [token], function (err) {
      if (err) reject(err); else resolve();
    });
  });
};

export const listSessionsForUser = (userId: number): Promise<UserSession[]> => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
      if (err) reject(err); else resolve(rows as UserSession[]);
    });
  });
};
