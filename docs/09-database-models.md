# Database Models and Data Architecture

This document explains all database schemas, security considerations, what data is saved in the database versus kept in runtime memory, and the data lifecycle throughout the application.

## Database Overview

The application uses **SQLite with security enhancements** for data persistence with the following key principles:
- **Runtime Performance**: Hot data kept in memory for low-latency access
- **Secure Storage**: Sensitive data like passwords properly hashed and tokens secured
- **Persistent State**: Critical data persisted to survive server restarts
- **JSON Storage**: Complex objects stored as JSON for flexibility
- **Relational Integrity**: Foreign keys maintain data consistency
- **Parameterized Queries**: All database operations use prepared statements to prevent SQL injection

## 🔐 Security Considerations

### Password Security
- All passwords are **bcrypt hashed** with salt rounds
- Raw passwords are **never stored** in the database
- Password comparison uses secure `bcrypt.compare()`

### Token Management
- **Refresh tokens** are stored securely in database
- **Access tokens** are stateless JWT (not stored in DB)
- Tokens have proper expiration times
- Token cleanup on logout

### SQL Injection Prevention
All database queries use **parameterized statements**:
```typescript
// Secure parameterized query
db.get('SELECT * FROM users WHERE username = ?', [username], callback);
// Never: db.get(`SELECT * FROM users WHERE username = '${username}'`);
```

## Database Schema Overview

```sql
-- Core user management with security
users (id, username, password[hashed], email, avatarurl, refreshToken, status, createdAt)
userAliases (userId, alias) -- Display names

-- Session management 
-- refreshToken stored directly in users table for simplicity
-- access tokens are stateless JWT (not stored in DB)

-- Game data
player_stats (user_id, total_matches, total_wins, ...) -- Cumulative stats
game_results (id, room_id, winner, player1_user_id, player2_user_id, ...) -- Match history

-- Communication
messages (id, sender_id, receiver_id, text, created_at)
friendships (user1_id, user2_id, status, created_at) -- Future feature

-- Tournament system
tournaments (id, name, status, snapshot, created_at, updated_at)

-- Settings (future)
usersGameSettings (user_id, settings_json)
```

## User Management Models

### Users Table (`server/models/Users.ts`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,                    -- bcrypt hashed with salt
  email TEXT UNIQUE NOT NULL,
  avatarurl TEXT NOT NULL DEFAULT '...',     -- Profile picture URL
  refreshToken TEXT,                         -- JWT refresh token for session management
  status TEXT NOT NULL DEFAULT 'offline' 
    CHECK (status IN ('online', 'offline', 'in_game')),
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Security Features:**
- Passwords are **bcrypt hashed** with salt rounds (never stored as plaintext)
- Refresh tokens enable secure session management
- Status field tracks user activity for UI updates
- Unique constraints prevent duplicate usernames/emails

**Key Operations:**
```typescript
// Secure user creation with hashed password
const salt = await bcrypt.genSalt(10);
const hashedPass = await bcrypt.hash(password, salt);
await createUser(username, email, hashedPass);

// Secure login verification
const match = await bcrypt.compare(password, user.password);
```

**TypeScript Interface:**
```typescript
export interface User {
  id: number;
  username: string;
  password: string; // Hashed with bcrypt
  email: string;
  status: 'online' | 'offline' | 'in_game';
  created_at: string;
}
```

**Key Functions:**
```typescript
// User creation with password hashing
export function createUser(userData: Omit<User, 'id' | 'created_at'>) {
  const hashedPassword = bcrypt.hashSync(userData.password, 12);
  
  db.run(
    'INSERT INTO users (username, password, email, status) VALUES (?, ?, ?, ?)',
    [userData.username, hashedPassword, userData.email, userData.status]
  );
}

// Authentication queries
export function findUserByUsername(username: string): Promise<User | null>
export function findUserById(id: number): Promise<User | null>
export function updateUserStatus(userId: number, status: User['status'])

// Status management for presence system
export function setUserOnline(userId: number) {
  updateUserStatus(userId, 'online');
}

export function setUserInGame(userId: number) {
  updateUserStatus(userId, 'in_game');
}
```

### User Sessions (`server/models/UserSessions.ts`)

Multi-session refresh token management:

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id INTEGER NOT NULL,
  refresh_token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Session Lifecycle:**
```typescript
export interface UserSession {
  user_id: number;
  refresh_token: string;
  expires_at: string;
  created_at: string;
}

// Session management functions
export function createSession(session: Omit<UserSession, 'created_at'>)
export function findSessionByToken(refreshToken: string): Promise<UserSession | null>
export function deleteSessionByToken(refreshToken: string)
export function touchSession(userId: number) // Extend session expiry
export function cleanupExpiredSessions() // Maintenance function
```

## Game Data Models

### Player Statistics (`server/models/PlayerStats.ts`)

Cumulative player performance tracking:

```sql
CREATE TABLE IF NOT EXISTS player_stats (
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
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Analytics Calculations:**
```typescript
export interface PlayerStats {
  user_id: number;
  total_matches: number;        // Career games played
  total_wins: number;           // Career wins
  total_points: number;         // Career points scored
  total_rallies: number;        // Career rallies played  
  total_rally_exchanges: number; // Total paddle hits
  longest_rally: number;        // Best single rally
  total_duration_ms: number;    // Total play time
  longest_win_streak: number;   // Best win streak
  current_win_streak: number;   // Active win streak
}

// Derived analytics
export function getWinRate(stats: PlayerStats): number {
  return stats.total_matches > 0 ? stats.total_wins / stats.total_matches : 0;
}

export function getAverageRallyLength(stats: PlayerStats): number {
  return stats.total_rallies > 0 ? stats.total_rally_exchanges / stats.total_rallies : 0;
}

export function getTotalPlayHours(stats: PlayerStats): number {
  return stats.total_duration_ms / (1000 * 60 * 60);
}
```

**Update Process:**
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
  // Fetch current stats
  const currentStats = await getPlayerStats(params.userId);
  
  // Calculate increments
  const newMatches = currentStats.total_matches + 1;
  const newWins = currentStats.total_wins + (params.didWin ? 1 : 0);
  const newStreak = params.didWin ? currentStats.current_win_streak + 1 : 0;
  const longestStreak = Math.max(currentStats.longest_win_streak, newStreak);
  
  // Update database
  db.run(
    `UPDATE player_stats SET 
      total_matches=?, total_wins=?, current_win_streak=?, longest_win_streak=?, ...
     WHERE user_id = ?`,
    [newMatches, newWins, newStreak, longestStreak, ..., params.userId]
  );
}
```

### Game Results (`server/models/GameResults.ts`)

Detailed match history with analytics:

```sql
CREATE TABLE IF NOT EXISTS game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  winner TEXT NOT NULL, -- 'p1', 'p2', 'none'
  player1_user_id INTEGER,
  player2_user_id INTEGER,
  score_p1 INTEGER NOT NULL,
  score_p2 INTEGER NOT NULL,
  match_type TEXT NOT NULL, -- 'local', 'remote', 'matchmaking', tournament_id
  status TEXT NOT NULL, -- 'completed', 'disconnected', 'exited'
  ended_at TEXT NOT NULL,
  settings_json TEXT NOT NULL, -- Game settings without theme
  per_match_stats_json TEXT, -- Detailed analytics for remote games
  FOREIGN KEY (player1_user_id) REFERENCES users(id),
  FOREIGN KEY (player2_user_id) REFERENCES users(id)
);
```

**Game Result Types:**
```typescript
export interface GameResult {
  id?: number;
  roomId: string;
  winner: 'p1' | 'p2' | 'none';
  player1UserId?: number;
  player2UserId?: number;
  score: { p1: number; p2: number };
  matchType: string; // 'local' | 'remote' | 'matchmaking' | tournament_id
  status: 'completed' | 'disconnected' | 'exited';
  endedAt: string;
  settings: GameSettings; // Without theme
  perMatchStats?: PerMatchStats; // Only for remote games
}

// Per-match detailed analytics
export interface PerMatchStats {
  finalScore: { p1: number; p2: number };
  pointsTimeline: Array<'p1'|'p2'>; // Who scored each point
  rallyLengths: number[]; // Length of each rally
  longestRally: number;
  averageRally: number;
  comebackFactor: number; // Largest deficit overcome
  momentumTimeline: Array<{
    t: number; // Time offset
    leader: 'p1'|'p2'|'tie';
    score: { p1: number; p2: number };
  }>;
  matchDurationMs: number;
}
```

**Storage Strategy:**
```typescript
// Local games: Basic results only (no cumulative impact)
function saveLocalGameResult(result: GameResult) {
  insertGameResult({
    ...result,
    matchType: 'local',
    perMatchStats: undefined // No detailed stats for local games
  });
  // Don't update player_stats for local games
}

// Remote games: Full analytics and cumulative updates
function saveRemoteGameResult(result: GameResult) {
  // Store detailed result
  insertGameResult(result);
  
  // Update cumulative player stats
  if (result.player1UserId) {
    updatePlayerStats({
      userId: result.player1UserId,
      didWin: result.winner === 'p1',
      scoredPoints: result.score.p1,
      matchStats: result.perMatchStats
    });
  }
  
  if (result.player2UserId) {
    updatePlayerStats({
      userId: result.player2UserId,
      didWin: result.winner === 'p2',
      scoredPoints: result.score.p2,
      matchStats: result.perMatchStats
    });
  }
  
  // Tournament processing if applicable
  if (result.matchType.startsWith('tournament_')) {
    tournamentManager.onGameResult(result);
  }
}
```

## Tournament System Models

### Tournaments Table (`server/models/Tournaments.ts`)

Tournament state persistence via JSON snapshots:

```sql
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'waiting', 'countdown', 'running', 'completed', 'cancelled'
  snapshot TEXT NOT NULL, -- JSON serialized tournament state
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Tournament State Structure:**
```typescript
export interface Tournament {
  id: string;
  name: string;
  status: 'waiting' | 'countdown' | 'running' | 'completed' | 'cancelled';
  createdAt: string;
  startsAt: number; // Timestamp
  countdownUntil?: number;
  
  // Participant data
  players: string[]; // User IDs
  playerNames: Record<string, string>; // Display names
  eliminated?: string[];
  eliminationReasons?: Record<string, string>;
  
  // Tournament structure
  bracket?: {
    semi1: TournamentMatch;
    semi2: TournamentMatch;
    final: TournamentMatch;
  };
  
  result?: {
    winner: string;
    runnersUp: string[];
    completedAt: string;
  };
  
  // Runtime data (not persisted)
  playersSockets?: Record<string, string>; // User ID -> Socket ID
  sockets?: string[]; // All connected sockets
}

interface TournamentMatch {
  p1?: string; p2?: string; // Player IDs
  p1Name?: string; p2Name?: string; // Display names
  winner?: string; winnerName?: string;
  roomId?: string; // Active game room
  invite?: { // Match invitation state
    p1: 'pending' | 'accepted' | 'declined';
    p2: 'pending' | 'accepted' | 'declined';
    expiresAt: number;
    timeoutId?: NodeJS.Timeout; // Not persisted
  };
  score?: { p1: number; p2: number };
  endReason?: string;
}
```

**Persistence Strategy:**
```typescript
// Save tournament state (removes volatile data)
export function upsertTournament(tournament: Tournament) {
  // Sanitize for storage
  const snapshot = sanitizeForPersistence(tournament);
  
  db.run(
    `INSERT OR REPLACE INTO tournaments (id, name, status, snapshot, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      tournament.id,
      tournament.name, 
      tournament.status,
      JSON.stringify(snapshot),
      tournament.createdAt,
      new Date().toISOString()
    ]
  );
}

// Load tournaments on server startup
export function loadTournaments(): Promise<Tournament[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tournaments', (err, rows) => {
      if (err) reject(err);
      else {
        const tournaments = rows.map(row => {
          const tournament = JSON.parse(row.snapshot) as Tournament;
          return ensureTournamentDefaults(tournament);
        });
        resolve(tournaments);
      }
    });
  });
}

// Remove volatile data before persistence
function sanitizeForPersistence(tournament: Tournament) {
  const sanitized = { ...tournament };
  
  // Remove socket connections (runtime only)
  delete sanitized.playersSockets;
  delete sanitized.sockets;
  
  // Remove timeout IDs from match invites
  if (sanitized.bracket) {
    for (const match of Object.values(sanitized.bracket)) {
      if (match.invite?.timeoutId) {
        delete match.invite.timeoutId;
      }
    }
  }
  
  return sanitized;
}
```

## Communication Models

### Messages (`server/models/Message.ts`)

Real-time chat system persistence:

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);
```

**Message Operations:**
```typescript
export interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
  created_at: string;
}

// Message CRUD operations
export function insertMessage(message: Omit<Message, 'id' | 'created_at'>)
export function getAllMessages(): Promise<Message[]>
export function getConversation(userId1: number, userId2: number): Promise<Message[]>

// Enhanced queries with user data
export function getMessagesWithUsernames(): Promise<Array<Message & {
  sender_username: string;
  receiver_username: string;
}>>
```

## Runtime vs Persistent Data

### Memory-Based Systems

**Game Rooms (`roomManager.ts`)**
- **Runtime**: Active game rooms, socket connections, input queues
- **Persistent**: Final game results only
- **Lifecycle**: Created on game start, destroyed on completion/disconnect

```typescript
// Runtime game room data
class GameRoom {
  public state: GameState; // Current game state
  private inputs: { p1: string[]; p2: string[] }; // Input queues
  private interval: NodeJS.Timeout; // Game loop timer
  
  // NOT persisted - rebuilt on each game
}

// Only final results are saved
function onGameComplete() {
  saveGameResult({
    roomId: this.id,
    winner: determineWinner(),
    score: this.state.score,
    // ... other persistent fields
  });
}
```

**Activity Manager (`activityManager.ts`)**
- **Runtime**: User lock states, pending invites
- **Persistent**: None (locks cleared on server restart except tournaments)
- **Recovery**: Stale locks cleared on user reconnection

```typescript
// Runtime activity locks
private locks: Map<string, {
  inMatch: boolean;
  tournamentLocked: boolean; // May persist via tournament state
  pendingInviteId?: string;
}>;

// Cleanup on server restart
public resetLocksForUser(userId: string) {
  const lock = this.ensureLock(userId);
  lock.inMatch = false; // Clear stale match locks
  lock.pendingInviteId = undefined; // Clear stale invites
  // Keep tournamentLocked - managed by tournament system
}
```

### Hybrid Systems

**Tournament Manager**
- **Runtime**: Socket connections, timeout IDs, active match rooms
- **Persistent**: Tournament state, bracket progression, player participation
- **Recovery**: Tournament state restored, volatile data rebuilt

```typescript
// Persistent tournament data
{
  id: "tournament_123",
  name: "Evening Tournament",
  status: "running",
  players: ["user1", "user2", "user3", "user4"],
  bracket: {
    semi1: { p1: "user1", p2: "user2", winner: "user1" },
    semi2: { p1: "user3", p2: "user4" }, // ongoing
    final: {}
  }
}

// Volatile data (rebuilt on startup)
{
  playersSockets: { "user1": "socket_abc", "user3": "socket_def" },
  sockets: ["socket_abc", "socket_def"],
  // Timeout IDs for match invites recreated
}
```

## Data Indexing Strategy

### Performance Indexes

```sql
-- User queries
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Session management
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

-- Message queries
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Game results
CREATE INDEX IF NOT EXISTS idx_game_results_player1 ON game_results(player1_user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_player2 ON game_results(player2_user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_ended ON game_results(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_results_match_type ON game_results(match_type);

-- Tournament queries
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_created ON tournaments(created_at DESC);
```

## Data Lifecycle Management

### Cleanup and Archival

```typescript
// Session cleanup (periodic maintenance)
export function cleanupExpiredSessions() {
  db.run('DELETE FROM user_sessions WHERE expires_at < datetime("now")');
}

// Game results archival (optional)
export function archiveOldGameResults() {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  
  db.run(
    `INSERT INTO game_results_archive SELECT * FROM game_results 
     WHERE ended_at < ?`,
    [cutoffDate.toISOString()]
  );
  
  db.run(
    'DELETE FROM game_results WHERE ended_at < ?',
    [cutoffDate.toISOString()]
  );
}

// Tournament cleanup (completed tournaments)
export function cleanupCompletedTournaments() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  db.run(
    `DELETE FROM tournaments 
     WHERE status IN ('completed', 'cancelled') AND updated_at < ?`,
    [thirtyDaysAgo.toISOString()]
  );
}
```

This database architecture balances performance, persistence, and recovery needs while maintaining clear separation between runtime optimization and persistent state requirements.
