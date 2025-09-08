# Player Statistics and Match Analytics

This document explains how player statistics and match analytics are securely recorded, processed, and stored in the game backend, including authenticated stat tracking, per-match analytics, and secure data persistence.

## Overview

The Pong platform captures comprehensive statistics with **full authentication and security**:
1. **Secure Match Recording**: All match data tied to authenticated users
2. **Per-Match Analytics**: Detailed gameplay metrics for individual matches
3. **Cumulative Player Stats**: Aggregated performance data across all authenticated matches
4. **Data Integrity**: Statistics can only be recorded for authenticated participants

## 🔐 Security and Authentication

### Authenticated Stat Recording
All statistics are tied to **authenticated user sessions**:

```typescript
// Only authenticated users can have stats recorded
if (!userId) {
  console.error('Cannot record stats for unauthenticated user');
  return;
}

// Match results tied to verified user IDs
const matchResult = {
  roomId: gameRoomId,
  winner: winnerId,
  player1_user_id: authenticatedPlayer1Id,  // From JWT
  player2_user_id: authenticatedPlayer2Id,  // From JWT
  player1_score: finalScore.p1,
  player2_score: finalScore.p2,
  duration_seconds: matchDuration,
  stats_snapshot: JSON.stringify(detailedStats)
};
```

### Secure Data Storage
Match results are stored with **proper user attribution**:

```typescript
// Secure parameterized query prevents SQL injection
const query = `
  INSERT INTO game_results 
  (room_id, winner, player1_user_id, player2_user_id, 
   player1_score, player2_score, duration_seconds, stats_snapshot, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`;

db.run(query, [roomId, winner, p1UserId, p2UserId, p1Score, p2Score, duration, statsJSON]);
```

## Per-Match Statistics System

### Remote Stats Tracker

For remote (multiplayer) games, detailed statistics are tracked throughout the match:

```typescript
export interface RemoteStatsTracker {
  startTimeMs: number;                    // Match start timestamp
  currentRallyHits: number;              // Active rally hit count
  rallyLengths: number[];                // Completed rally lengths
  pointsTimeline: Array<'p1'|'p2'>;      // Who scored each point
  momentumTimeline: Array<{              // Score progression tracking
    t: number;                           // Time offset from start
    leader: 'p1'|'p2'|'tie';            // Current leader
    score: { p1: number; p2: number };   // Score at this moment
  }>;
}
```

### Real-Time Data Collection

Statistics are collected during game loop execution:

```typescript
// During game loop in RemoteGameRoom
const result = GameEngine.update(this.state, this.inputs);
this.state = result.state;

// Track paddle hits for rally counting
if (result.paddleHit) {
  recordPaddleHit(this.stats);
}

// Track scoring events and momentum changes
if (result.scored) {
  recordScored(this.stats, this.state, result.scoredBy);
}

// Functions for data collection
export function recordPaddleHit(tracker: RemoteStatsTracker) {
  tracker.currentRallyHits += 1;
}

export function recordScored(
  tracker: RemoteStatsTracker, 
  state: GameState, 
  scoredBy?: 'p1'|'p2'
) {
  // End current rally
  tracker.rallyLengths.push(tracker.currentRallyHits);
  tracker.currentRallyHits = 0;
  
  // Record scorer
  if (scoredBy) {
    tracker.pointsTimeline.push(scoredBy);
  }
  
  // Track momentum shift
  const diff = state.score.p1 - state.score.p2;
  const leader: 'p1'|'p2'|'tie' = diff === 0 ? 'tie' : diff > 0 ? 'p1' : 'p2';
  
  tracker.momentumTimeline.push({
    t: Date.now() - tracker.startTimeMs,
    leader,
    score: { ...state.score }
  });
}
```

### Advanced Analytics Computation

When a match ends, comprehensive analytics are computed:

```typescript
export function buildResult(
  tracker: RemoteStatsTracker,
  state: GameState,
  original: GameSettingsWithTheme,
  winner: 'p1'|'p2'|'none',
  matchType: string,
  ids: { p1: string; p2: string },
  roomId: string
): GameResult {
  const duration = Date.now() - tracker.startTimeMs;
  
  // Rally analytics
  const longestRally = tracker.rallyLengths.length ? 
    Math.max(...tracker.rallyLengths) : 0;
  const averageRally = tracker.rallyLengths.length ? 
    (tracker.rallyLengths.reduce((a,b) => a+b, 0) / tracker.rallyLengths.length) : 0;
  
  // Comeback factor calculation
  const computeComeback = (timeline: Array<'p1'|'p2'>, finalWinner: 'p1'|'p2'|'none') => {
    if (finalWinner === 'none') return 0;
    
    let sp1 = 0, sp2 = 0;
    let minDiffP1 = 0, minDiffP2 = 0;
    
    // Track maximum deficit overcome
    for (const scorer of timeline) {
      if (scorer === 'p1') sp1++;
      else sp2++;
      
      minDiffP1 = Math.min(minDiffP1, sp1 - sp2);
      minDiffP2 = Math.min(minDiffP2, sp2 - sp1);
    }
    
    // Return maximum deficit overcome by winner
    return finalWinner === 'p1' ? Math.max(0, -minDiffP1) : Math.max(0, -minDiffP2);
  };
  
  const perMatchStats: PerMatchStats = {
    finalScore: { ...state.score },
    pointsTimeline: tracker.pointsTimeline,
    rallyLengths: tracker.rallyLengths,
    longestRally,
    averageRally,
    comebackFactor: computeComeback(tracker.pointsTimeline, winner),
    momentumTimeline: tracker.momentumTimeline,
    matchDurationMs: duration
  };
  
  return {
    roomId,
    winner,
    score: state.score,
    settings: settingsNoTheme,
    status: state.endReason || 'completed',
    matchType,
    endedAt: new Date().toISOString(),
    player1UserId: ids.p1,
    player2UserId: ids.p2,
    perMatchStats
  };
}
```

### Per-Match Stats Schema

```typescript
interface PerMatchStats {
  finalScore: { p1: number; p2: number };           // Final game score
  pointsTimeline: Array<'p1'|'p2'>;                 // Chronological scoring
  rallyLengths: number[];                           // Length of each rally
  longestRally: number;                             // Longest rally in match
  averageRally: number;                             // Average rally length
  comebackFactor: number;                           // Largest deficit overcome
  momentumTimeline: Array<{                         // Score progression
    t: number;                                      // Time offset (ms)
    leader: 'p1'|'p2'|'tie';                      // Leader at time
    score: { p1: number; p2: number };             // Score at time
  }>;
  matchDurationMs: number;                          // Total match duration
}
```

## Game Results Storage

### Database Schema

Match results are stored with both basic outcome and detailed analytics:

```sql
CREATE TABLE IF NOT EXISTS game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  winner TEXT NOT NULL,                   -- 'p1', 'p2', or 'none'
  player1_user_id INTEGER,               -- Player 1 user ID
  player2_user_id INTEGER,               -- Player 2 user ID  
  score_p1 INTEGER NOT NULL,             -- Player 1 final score
  score_p2 INTEGER NOT NULL,             -- Player 2 final score
  match_type TEXT NOT NULL,              -- 'local', 'remote', 'matchmaking', or tournament ID
  status TEXT NOT NULL,                  -- 'completed', 'disconnected', 'exited'
  ended_at TEXT NOT NULL,                -- ISO timestamp
  settings_json TEXT NOT NULL,           -- Game settings (without theme)
  per_match_stats_json TEXT,             -- Detailed match analytics
  FOREIGN KEY (player1_user_id) REFERENCES users(id),
  FOREIGN KEY (player2_user_id) REFERENCES users(id)
);
```

### Result Storage Process

```typescript
// Save game result to database
export function insertGameResult(params: InsertGameResultParams) {
  db.run(
    `INSERT INTO game_results (
      room_id, winner, player1_user_id, player2_user_id, 
      score_p1, score_p2, match_type, status, ended_at, 
      settings_json, per_match_stats_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      params.roomId,
      params.winner,
      params.player1UserId ?? null,
      params.player2UserId ?? null,
      params.score.p1,
      params.score.p2,
      params.matchType,
      params.status,
      params.endedAt,
      JSON.stringify(params.settings),
      params.perMatchStats ? JSON.stringify(params.perMatchStats) : null
    ],
    (err) => {
      if (err) console.error('Failed to insert game_result', err.message);
    }
  );
}
```

### Match Type Classification

Different match types are tracked for analytics segmentation:

```typescript
// Match type determines result classification
interface MatchTypeMapping {
  'local': LocalGameResult;      // Same-device games (no cumulative stats)
  'remote': RemoteGameResult;    // Direct invite multiplayer
  'matchmaking': MatchmakingResult; // Queue-based matching
  [tournamentId: string]: TournamentResult; // Tournament matches
}

// Example result processing
function saveGameResult(result: GameResult) {
  // Store detailed result
  insertGameResult({
    roomId: result.roomId,
    winner: result.winner,
    player1UserId: result.player1UserId,
    player2UserId: result.player2UserId,
    score: result.score,
    matchType: result.matchType,
    status: result.status,
    endedAt: result.endedAt,
    settings: result.settings,
    perMatchStats: result.perMatchStats
  });
  
  // Update cumulative stats (only for remote games)
  if (result.matchType !== 'local' && result.player1UserId && result.player2UserId) {
    updatePlayerStats({
      userId: result.player1UserId,
      didWin: result.winner === 'p1',
      scoredPoints: result.score.p1,
      matchStats: result.perMatchStats
    });
    
    updatePlayerStats({
      userId: result.player2UserId,
      didWin: result.winner === 'p2', 
      scoredPoints: result.score.p2,
      matchStats: result.perMatchStats
    });
  }
  
  // Tournament-specific processing
  if (result.matchType.match(/^tournament_/)) {
    tournamentManager.onGameResult(io, result);
  }
}
```

## Cumulative Player Statistics

### Player Stats Schema

Long-term player progression is tracked in a separate table:

```sql
CREATE TABLE IF NOT EXISTS player_stats (
  user_id INTEGER PRIMARY KEY,
  total_matches INTEGER NOT NULL DEFAULT 0,        -- Total games played
  total_wins INTEGER NOT NULL DEFAULT 0,           -- Total games won
  total_points INTEGER NOT NULL DEFAULT 0,         -- Total points scored
  total_rallies INTEGER NOT NULL DEFAULT 0,        -- Total rallies played
  total_rally_exchanges INTEGER NOT NULL DEFAULT 0, -- Total hits in all rallies
  longest_rally INTEGER NOT NULL DEFAULT 0,        -- Longest single rally
  total_duration_ms INTEGER NOT NULL DEFAULT 0,    -- Total play time
  longest_win_streak INTEGER NOT NULL DEFAULT 0,   -- Best win streak
  current_win_streak INTEGER NOT NULL DEFAULT 0,   -- Active win streak
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Statistics Aggregation

Player stats are updated after each remote game:

```typescript
export function updatePlayerStats(params: {
  userId: number;
  didWin: boolean;
  scoredPoints: number;
  matchStats?: {
    rallyLengths?: number[];
    longestRally?: number;
    matchDurationMs?: number;
  };
}) {
  const { userId, didWin, scoredPoints, matchStats } = params;
  
  // Fetch current stats to compute increments
  db.get(`SELECT * FROM player_stats WHERE user_id = ?`, [userId], (err, row: PlayerStats) => {
    if (err) {
      console.error('player_stats select error', err.message);
      return;
    }
    
    // Ensure record exists
    if (!row) {
      ensurePlayerStats(userId);
      return updatePlayerStats(params);
    }
    
    // Compute new values
    const total_matches = row.total_matches + 1;
    const total_wins = row.total_wins + (didWin ? 1 : 0);
    
    // Win streak calculations
    const current_win_streak = didWin ? row.current_win_streak + 1 : 0;
    const longest_win_streak = Math.max(row.longest_win_streak, current_win_streak);
    
    // Point totals
    const total_points = row.total_points + scoredPoints;
    
    // Rally statistics
    const ralliesCount = matchStats?.rallyLengths?.length || 0;
    const rallySum = matchStats?.rallyLengths?.reduce((a, b) => a + b, 0) || 0;
    const total_rallies = row.total_rallies + ralliesCount;
    const total_rally_exchanges = row.total_rally_exchanges + rallySum;
    const longest_rally = Math.max(row.longest_rally, matchStats?.longestRally || 0);
    
    // Duration tracking
    const total_duration_ms = row.total_duration_ms + (matchStats?.matchDurationMs || 0);
    
    // Update database
    db.run(
      `UPDATE player_stats SET 
        total_matches=?, total_wins=?, total_points=?, 
        total_rallies=?, total_rally_exchanges=?, longest_rally=?, 
        total_duration_ms=?, longest_win_streak=?, current_win_streak=?
        WHERE user_id = ?`,
      [
        total_matches, total_wins, total_points,
        total_rallies, total_rally_exchanges, longest_rally,
        total_duration_ms, longest_win_streak, current_win_streak,
        userId
      ],
      (updateErr) => {
        if (updateErr) console.error('player_stats update error', updateErr.message);
        else console.log(`Updated stats for user ${userId}: ${total_wins}/${total_matches} wins, streak ${current_win_streak}`);
      }
    );
  });
}
```

### Derived Analytics

Additional analytics can be computed from stored data:

```typescript
// Win rate calculation
function getWinRate(stats: PlayerStats): number {
  return stats.total_matches > 0 ? stats.total_wins / stats.total_matches : 0;
}

// Average points per game
function getAveragePoints(stats: PlayerStats): number {
  return stats.total_matches > 0 ? stats.total_points / stats.total_matches : 0;
}

// Average rally length
function getAverageRallyLength(stats: PlayerStats): number {
  return stats.total_rallies > 0 ? stats.total_rally_exchanges / stats.total_rallies : 0;
}

// Play time in hours
function getTotalPlayHours(stats: PlayerStats): number {
  return stats.total_duration_ms / (1000 * 60 * 60);
}

// Streak status
function getStreakStatus(stats: PlayerStats): string {
  if (stats.current_win_streak > 0) {
    return `${stats.current_win_streak} game win streak`;
  } else {
    return `Best streak: ${stats.longest_win_streak} games`;
  }
}
```

## Statistics API and Access

### Statistics Retrieval Endpoints

```typescript
// Get player statistics
app.get('/api/statistics/player/:userId', verifyToken, async (req, reply) => {
  const { userId } = req.params;
  
  // Basic stats
  const stats = await getPlayerStats(userId);
  
  // Recent match history
  const recentMatches = await getRecentMatches(userId, 10);
  
  // Win/loss trends
  const trends = await calculateTrends(userId);
  
  reply.send({
    stats,
    recentMatches,
    trends,
    computed: {
      winRate: getWinRate(stats),
      averagePoints: getAveragePoints(stats),
      averageRallyLength: getAverageRallyLength(stats),
      totalPlayHours: getTotalPlayHours(stats),
      streakStatus: getStreakStatus(stats)
    }
  });
});

// Get detailed match data
app.get('/api/statistics/match/:matchId', verifyToken, async (req, reply) => {
  const { matchId } = req.params;
  
  const match = await getMatchDetails(matchId);
  if (!match) {
    return reply.status(404).send({ error: 'Match not found' });
  }
  
  // Parse detailed analytics if available
  const analytics = match.per_match_stats_json ? 
    JSON.parse(match.per_match_stats_json) : null;
  
  reply.send({
    match: {
      id: match.id,
      roomId: match.room_id,
      winner: match.winner,
      score: { p1: match.score_p1, p2: match.score_p2 },
      matchType: match.match_type,
      status: match.status,
      endedAt: match.ended_at,
      settings: JSON.parse(match.settings_json)
    },
    analytics
  });
});
```

### Frontend Integration

```typescript
// client/hooks/usePlayerStats.ts
export function usePlayerStats(userId?: string) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!userId) return;
    
    fetch(`/api/statistics/player/${userId}`)
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load player stats:', err);
        setLoading(false);
      });
  }, [userId]);
  
  return { stats, loading };
}

// Usage in components
function PlayerStatsPage({ userId }: { userId: string }) {
  const { stats, loading } = usePlayerStats(userId);
  
  if (loading) return <div>Loading stats...</div>;
  if (!stats) return <div>No stats available</div>;
  
  return (
    <div className="stats-dashboard">
      <h2>Player Statistics</h2>
      <div className="stat-grid">
        <StatCard label="Matches Played" value={stats.stats.total_matches} />
        <StatCard label="Win Rate" value={`${(stats.computed.winRate * 100).toFixed(1)}%`} />
        <StatCard label="Current Streak" value={stats.computed.streakStatus} />
        <StatCard label="Longest Rally" value={stats.stats.longest_rally} />
        <StatCard label="Total Play Time" value={`${stats.computed.totalPlayHours.toFixed(1)}h`} />
      </div>
    </div>
  );
}
```

## Data Lifecycle and Performance

### Statistics vs Runtime Data

```typescript
// Runtime data (in-memory, volatile)
interface RuntimeGameData {
  activeRooms: Map<string, GameRoom>;           // Current games
  playerConnections: Map<string, Socket>;      // Socket connections
  inputQueues: Map<string, InputEvent[]>;      // Pending inputs
  gameStates: Map<string, GameState>;          // Current game states
}

// Persistent data (database, permanent)
interface PersistentGameData {
  game_results: GameResult[];                  // Completed matches
  player_stats: PlayerStats[];               // Cumulative statistics  
  tournaments: Tournament[];                  // Tournament history
  users: User[];                             // Player profiles
}
```

### Performance Considerations

```typescript
// Batch statistics updates for high-traffic scenarios
class StatsBatchProcessor {
  private pendingUpdates: Map<number, PlayerStatUpdate[]> = new Map();
  private batchTimeout: NodeJS.Timeout | null = null;
  
  queueUpdate(userId: number, update: PlayerStatUpdate) {
    if (!this.pendingUpdates.has(userId)) {
      this.pendingUpdates.set(userId, []);
    }
    
    this.pendingUpdates.get(userId)!.push(update);
    this.scheduleBatch();
  }
  
  private scheduleBatch() {
    if (this.batchTimeout) return;
    
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
      this.batchTimeout = null;
    }, 5000); // Process every 5 seconds
  }
  
  private processBatch() {
    for (const [userId, updates] of this.pendingUpdates) {
      // Aggregate all updates for this user
      const aggregated = this.aggregateUpdates(updates);
      
      // Single database update
      updatePlayerStats({
        userId,
        ...aggregated
      });
    }
    
    this.pendingUpdates.clear();
  }
}
```

### Data Retention and Archival

```typescript
// Archive old match data
export function archiveOldMatches() {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1); // Archive matches > 1 year old
  
  db.run(
    `INSERT INTO game_results_archive SELECT * FROM game_results WHERE ended_at < ?`,
    [cutoffDate.toISOString()],
    function(err) {
      if (err) {
        console.error('Failed to archive old matches:', err);
        return;
      }
      
      console.log(`Archived ${this.changes} old matches`);
      
      // Delete from main table after successful archive
      db.run(
        `DELETE FROM game_results WHERE ended_at < ?`,
        [cutoffDate.toISOString()],
        (deleteErr) => {
          if (deleteErr) {
            console.error('Failed to delete archived matches:', deleteErr);
          } else {
            console.log('Cleaned up archived matches from main table');
          }
        }
      );
    }
  );
}
```

The statistics system provides comprehensive gameplay analytics while maintaining performance through efficient data structures, batch processing, and strategic data retention policies.
