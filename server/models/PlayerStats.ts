import { db } from '../db/db';
import { format } from 'date-fns';

// Create player_stats table
// Create player_stats table with daily_stats JSON text column
db.run(
  `CREATE TABLE IF NOT EXISTS player_stats (
    user_id INTEGER PRIMARY KEY,
    total_matches INTEGER NOT NULL DEFAULT 0,
    total_wins INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    total_rallies INTEGER NOT NULL DEFAULT 0,
    total_rally_exchanges INTEGER NOT NULL DEFAULT 0,
    longest_rally INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    longest_win_streak INTEGER NOT NULL DEFAULT 0,
    current_win_streak INTEGER NOT NULL DEFAULT 0,
    daily_stats TEXT DEFAULT '{}' /* JSON: { 'YYYY-MM-DD': { rallies:number, wins:number } } */,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  (err) => {
    if (err) console.error('❌ Failed creating player_stats table', err.message);
    else console.log('✅ player_stats table ready.');
  }
);

export interface PlayerStats {
  user_id: number;
  total_matches: number;
  total_wins: number;
  total_points: number;
  total_rallies: number;
  total_rally_exchanges: number;
  longest_rally: number;
  total_duration_ms: number;
  longest_win_streak: number;
  current_win_streak: number;
  daily_stats?: string; // stored JSON string
}

export function ensurePlayerStats(userId: number) {
  db.run(
    `INSERT OR IGNORE INTO player_stats (user_id) VALUES (?)`,
    [userId],
    (err) => {
      if (err) console.error('Failed ensurePlayerStats', err.message);
    }
  );
}

export function updatePlayerStats(params: {
  userId: number; didWin: boolean; scoredPoints: number; matchStats?: {
    rallyLengths?: number[]; longestRally?: number; matchDurationMs?: number;
  };
}) {
  const { userId, didWin, scoredPoints, matchStats } = params;
  // Fetch existing to compute streaks & longest
  db.get(`SELECT * FROM player_stats WHERE user_id = ?`, [userId], (err: any, row: PlayerStats) => {
    if (err) { console.error('player_stats select error', err.message); return; }
    if (!row) { ensurePlayerStats(userId); return updatePlayerStats(params); }
    const total_matches = row.total_matches + 1;
    const total_wins = row.total_wins + (didWin ? 1 : 0);
    const current_win_streak = didWin ? row.current_win_streak + 1 : 0;
    const longest_win_streak = Math.max(row.longest_win_streak, current_win_streak);
    const total_points = row.total_points + scoredPoints;
    const ralliesCount = matchStats?.rallyLengths?.length || 0;
    const rallySum = matchStats?.rallyLengths?.reduce((a,b)=>a+b,0) || 0;
    const total_rallies = row.total_rallies + ralliesCount;
    const total_rally_exchanges = row.total_rally_exchanges + rallySum;
    const longest_rally = Math.max(row.longest_rally, matchStats?.longestRally || 0);
    const total_duration_ms = row.total_duration_ms + (matchStats?.matchDurationMs || 0);

    // Daily stats update
    let parsedDaily: Record<string, { rallies: number; wins: number }>; 
    try { parsedDaily = row.daily_stats ? JSON.parse(row.daily_stats) : {}; } catch { parsedDaily = {}; }
    const today = format(new Date(), 'yyyy-MM-dd');
    if (!parsedDaily[today]) parsedDaily[today] = { rallies: 0, wins: 0 };
    parsedDaily[today].rallies += ralliesCount;
    if (didWin) parsedDaily[today].wins += 1;
    const daily_stats = JSON.stringify(parsedDaily);
    db.run(
      `UPDATE player_stats SET 
        total_matches=?, total_wins=?, total_points=?, total_rallies=?, total_rally_exchanges=?, longest_rally=?, total_duration_ms=?, longest_win_streak=?, current_win_streak=?, daily_stats=?
        WHERE user_id = ?`,
      [total_matches, total_wins, total_points, total_rallies, total_rally_exchanges, longest_rally, total_duration_ms, longest_win_streak, current_win_streak, daily_stats, userId],
      (uErr) => {
        if (uErr) console.error('player_stats update error', uErr.message);
      }
    );
  });
}

// Return last 7 days (including today) stats with zero-fill for missing days
export function getLast7DayDailyStats(userId: number, callback: (err: any, data?: Record<string, { rallies: number; wins: number }>) => void) {
  db.get(`SELECT daily_stats FROM player_stats WHERE user_id = ?`, [userId], (err: any, row: { daily_stats?: string }) => {
    if (err) { callback(err); return; }
    let parsed: Record<string, { rallies: number; wins: number }>; 
    try { parsed = row?.daily_stats ? JSON.parse(row.daily_stats) : {}; } catch { parsed = {}; }
    const result: Record<string, { rallies: number; wins: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const date = format(new Date(Date.now() - i * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
      if (parsed[date]) result[date] = { rallies: parsed[date].rallies ?? 0, wins: parsed[date].wins ?? 0 };
      else result[date] = { rallies: 0, wins: 0 };
    }
    callback(null, result);
  });
}

