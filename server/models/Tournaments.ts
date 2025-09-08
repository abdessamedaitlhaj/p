import { db } from '../db/db';

// Simplified persistence: store overall tournament state snapshot as JSON in tournaments table
db.run(
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    data_json TEXT NOT NULL,
    result_winner TEXT,
    result_runners_up TEXT,
    result_completed_at TEXT
  )`,
  (err) => {
    if (err) console.error('❌ Failed creating tournaments table', err.message);
    else console.log('✅ tournaments table ready.');
  }
);

export interface TournamentRecord {
  id: string;
  name: string;
  created_by: string;
  starts_at: number;
  status: string;
  data_json: string; // serialized Tournament object snapshot
  result_winner?: string | null;
  result_runners_up?: string | null; // JSON array
  result_completed_at?: string | null;
}

export function upsertTournament(t: any) {
  const { id, name, createdBy, startsAt, status, result } = t;
  const result_winner = result?.winner || null;
  const result_runners_up = result?.runnersUp ? JSON.stringify(result.runnersUp) : null;
  const result_completed_at = result?.completedAt || null;
  db.run(
    `INSERT INTO tournaments (id, name, created_by, starts_at, status, data_json, result_winner, result_runners_up, result_completed_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, created_by=excluded.created_by, starts_at=excluded.starts_at, status=excluded.status, data_json=excluded.data_json, result_winner=excluded.result_winner, result_runners_up=excluded.result_runners_up, result_completed_at=excluded.result_completed_at`,
    [id, name, createdBy, startsAt, status, JSON.stringify(t), result_winner, result_runners_up, result_completed_at],
    (err) => { if (err) console.error('Failed upsert tournament', err.message); }
  );
}

export function loadTournaments(): Promise<any[]> {
  return new Promise((resolve) => {
    db.all(`SELECT data_json FROM tournaments`, [], (err, rows: any[]) => {
      if (err) { console.error('Failed load tournaments', err.message); resolve([]); return; }
      resolve(rows.map(r => { try { return JSON.parse(r.data_json); } catch { return null; } }).filter(Boolean));
    });
  });
}
