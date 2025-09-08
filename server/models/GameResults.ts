import { db } from '../db/db';

// Stores each finished (or aborted) game with optional per-match stats JSON
db.run(
  `CREATE TABLE IF NOT EXISTS game_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    winner TEXT NOT NULL,
    player1_user_id INTEGER,
    player2_user_id INTEGER,
    score_p1 INTEGER NOT NULL,
    score_p2 INTEGER NOT NULL,
    match_type TEXT NOT NULL,
    status TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    per_match_stats_json TEXT,
    FOREIGN KEY (player1_user_id) REFERENCES users(id),
    FOREIGN KEY (player2_user_id) REFERENCES users(id)
  )`,
  (err) => {
    if (err) console.error('❌ Failed creating game_results table', err.message);
    else console.log('✅ game_results table ready.');
  }
);

export interface InsertGameResultParams {
  roomId: string;
  winner: string;
  player1UserId?: number;
  player2UserId?: number;
  score: { p1: number; p2: number };
  matchType: string;
  status: string;
  endedAt: string;
  settings: any;
  perMatchStats?: any;
}

export function insertGameResult(r: InsertGameResultParams) {
  db.run(
    `INSERT INTO game_results (room_id, winner, player1_user_id, player2_user_id, score_p1, score_p2, match_type, status, ended_at, settings_json, per_match_stats_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [r.roomId, r.winner, r.player1UserId ?? null, r.player2UserId ?? null, r.score.p1, r.score.p2, r.matchType, r.status, r.endedAt, JSON.stringify(r.settings), r.perMatchStats ? JSON.stringify(r.perMatchStats) : null],
    (err) => { if (err) console.error('Failed to insert game_result', err.message); }
  );
}
