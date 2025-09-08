# Tournament System

This document explains how the secure tournament system works on the backend, covering authentication requirements, user authorization, tournament lifecycle, joining process, invites, brackets, result processing, and persistence mechanisms.

## Overview

The tournament system manages **authenticated, competitive brackets** for 4+ players with a semi-final → final structure. All tournament operations require valid JWT authentication, and the system implements comprehensive security measures including user authorization, input validation, and activity state management.

## 🔐 Security Implementation

### Authentication Requirements
All tournament operations require **authenticated users**:

```typescript
// Tournament namespace with authentication
const tournamentNamespace = app.io.of('/tournament');
tournamentNamespace.use(socketAuthMiddleware);

tournamentNamespace.on('connection', (socket) => {
  const userId = (socket as any).userId; // From JWT middleware
  console.log(`🏆 Tournament namespace - User ${userId} connected`);
});
```

### Input Validation
All tournament events use **Zod schema validation**:

```typescript
export const TournamentCreateSchema = z.object({
  name: z.string().min(1).max(50),
  startsInMinutes: z.number().min(1).max(60).optional()
});

export const TournamentJoinSchema = z.object({
  tournamentId: z.string().min(1).max(100)
});

// Validation applied to all tournament events
const validatedData = TournamentCreateSchema.parse(payload);
```

### User Authorization
Users can only perform actions as themselves:

```typescript
// Users cannot spoof other players' actions
if (payload.userId && payload.userId !== userId) {
  socket.emit('tournament_error', { message: 'Unauthorized action' });
  return;
}
```

## Tournament Lifecycle

### Tournament States

```ascii
Tournament State Flow

waiting → countdown → running → completed/cancelled
   ↓         ↓          ↓            ↓
Players   10s Timer  Matches    Results
Join      Before     Execute    Stored
          Start
```

```typescript
export type TournamentStatus = 'waiting' | 'countdown' | 'running' | 'completed' | 'cancelled';

interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  createdAt: string;
  startsAt: number;        // Timestamp when tournament begins
  countdownUntil?: number; // Countdown end timestamp
  players: string[];       // User IDs of participants
  bracket?: Bracket;       // Match bracket structure
  eliminated?: string[];   // Eliminated player IDs
  result?: TournamentResult; // Final results
  eliminationReasons?: Record<string, string>; // Why players were eliminated
}
```

### Tournament Creation and Joining

```typescript
// Create new tournament
socket.on('tournament_create', async ({ name, startsInMinutes }) => {
  // Validate user not locked
  if (activityManager.isLocked(userId)) {
    socket.emit('tournament_error', { message: 'Already busy' });
    return;
  }

  const tournament: Tournament = {
    id: generateId(),
    name,
    status: 'waiting',
    createdAt: new Date().toISOString(),
    startsAt: Date.now() + (startsInMinutes * 60 * 1000),
    players: [userId],
    playersSockets: { [userId]: socket.id },
    playerNames: { [userId]: await getUserDisplayName(userId) }
  };

  tournamentManager.create(tournament);
  socket.emit('tournament_created', { tournament });
});

// Join existing tournament
socket.on('tournament_join', async ({ id }) => {
  const tournament = tournamentManager.get(id);
  
  // Validate tournament state and user eligibility
  if (!tournament || tournament.status !== 'waiting') {
    socket.emit('tournament_error', { message: 'Cannot join tournament' });
    return;
  }
  
  if (tournament.players.includes(userId)) {
    socket.emit('tournament_error', { message: 'Already joined' });
    return;
  }

  // Add player to tournament
  tournament.players.push(userId);
  tournament.playersSockets[userId] = socket.id;
  tournament.playerNames[userId] = await getUserDisplayName(userId);
  
  // Lock player for tournament
  activityManager.setTournamentLock(userId, true);
  
  // Persist and broadcast update
  tournamentManager.persist();
  tournamentManager.broadcast(io, tournament, 'tournament_updated', {
    tournament: tournamentManager.sanitize(tournament)
  });
});
```

## Tournament Timing and Countdown

### Pre-Tournament Lock Phase

Players are locked 10 minutes before tournament start to ensure commitment:

```typescript
// Tournament manager tick system (runs every second)
tick(io: Server) {
  const now = Date.now();
  
  for (const tournament of this.tournaments.values()) {
    if (tournament.status === 'waiting') {
      // Start pre-tournament lock 10 minutes before start
      if (now >= tournament.startsAt - 10 * 60 * 1000) {
        if (tournament.players.length < 4) {
          // Cancel if insufficient players
          tournament.status = 'cancelled';
          this.unlockAllPlayers(tournament);
          this.broadcast(io, tournament, 'tournament_cancelled', { id: tournament.id });
        } else {
          // Begin countdown phase
          tournament.status = 'countdown';
          tournament.countdownUntil = now + 10 * 1000; // 10 second countdown
          this.broadcast(io, tournament, 'tournament_countdown', { 
            id: tournament.id, 
            secondsLeft: 10 
          });
        }
        this.persist();
      }
    }
    
    else if (tournament.status === 'countdown') {
      // Handle countdown progression
      const secondsLeft = Math.max(0, Math.ceil((tournament.countdownUntil! - now) / 1000));
      
      if (secondsLeft === 0) {
        // Start tournament
        this.matchFlow.startTournament(io, tournament.id);
      } else {
        // Broadcast countdown updates
        this.broadcast(io, tournament, 'tournament_countdown', { 
          id: tournament.id, 
          secondsLeft 
        });
      }
    }
  }
}
```

### Activity Locking Integration

```typescript
// Lock players during tournament phases
private lockTournamentPlayers(tournament: Tournament) {
  for (const playerId of tournament.players) {
    activityManager.setTournamentLock(playerId, true);
    
    // Emit lock status to user
    const socket = getSocketByUserId(playerId);
    if (socket) {
      socket.emit('user_locked', { 
        reason: `Tournament "${tournament.name}" starting soon` 
      });
    }
  }
}

// Unlock players when eliminated or tournament ends
private unlockPlayer(playerId: string, tournament: Tournament) {
  // Only unlock if not active in any other tournament
  if (!this.isUserActiveInOtherTournaments(playerId, tournament.id)) {
    activityManager.setTournamentLock(playerId, false);
    
    const socket = getSocketByUserId(playerId);
    if (socket) {
      socket.emit('user_unlocked');
    }
  }
}
```

## Bracket System

### Bracket Structure

The tournament uses a semi-final → final bracket for 4+ players:

```ascii
Tournament Bracket Structure

Player 1 ─┐
          ├─ Semi1 Winner ─┐
Player 2 ─┘                ├─ Tournament Winner
                           │
Player 3 ─┐                │
          ├─ Semi2 Winner ─┘
Player 4 ─┘

Additional players are eliminated in first round
```

```typescript
interface Bracket {
  semi1: Match;
  semi2: Match;
  final: Match;
}

interface Match {
  p1?: string;        // Player 1 ID
  p2?: string;        // Player 2 ID
  p1Name?: string;    // Display name for Player 1
  p2Name?: string;    // Display name for Player 2
  winner?: string;    // Winner ID
  winnerName?: string; // Winner display name
  roomId?: string;    // Active game room ID
  invite?: MatchInvite; // Invitation state
  score?: { p1: number; p2: number }; // Final score
  endReason?: string; // How match ended
}
```

### Bracket Initialization

```typescript
// When countdown reaches 0, initialize bracket
startTournament(io: Server, id: string) {
  const tournament = this.tournaments.get(id);
  if (!tournament || tournament.status !== 'countdown') return;
  
  // Take first 4 players for bracket
  const [u1, u2, u3, u4] = tournament.players.slice(0, 4);
  
  // Get display names for players
  const getDisplayName = (uid: string) => 
    this.getUserDisplayName(uid).catch(() => uid);
  
  Promise.all([
    getDisplayName(u1), getDisplayName(u2), 
    getDisplayName(u3), getDisplayName(u4)
  ]).then(([n1, n2, n3, n4]) => {
    // Initialize bracket structure
    tournament.bracket = {
      semi1: { p1: u1, p2: u2, p1Name: n1, p2Name: n2 },
      semi2: { p1: u3, p2: u4, p1Name: n3, p2Name: n4 },
      final: {}
    };
    
    tournament.status = 'running';
    
    // Eliminate excess players
    const excess = tournament.players.slice(4);
    tournament.eliminated = [...(tournament.eliminated || []), ...excess];
    for (const playerId of excess) {
      tournament.eliminationReasons![playerId] = 'excess';
      this.unlockPlayer(playerId, tournament);
    }
    
    // Start semi-final matches
    this.initiateMatchInvite(io, tournament, 'semi1');
    this.initiateMatchInvite(io, tournament, 'semi2');
    
    this.broadcast(io, tournament, 'tournament_started', { 
      id: tournament.id, 
      bracket: tournament.bracket 
    });
    
    this.persist();
  });
}
```

## Match Invite System

### Invitation Process

Each tournament match requires both players to accept an invitation:

```typescript
interface MatchInvite {
  p1: MatchInviteState;      // Player 1 response
  p2: MatchInviteState;      // Player 2 response
  expiresAt: number;         // Invitation expiry timestamp
  timeoutId?: NodeJS.Timeout; // Cleanup timer ID
}

type MatchInviteState = 'pending' | 'accepted' | 'declined';
```

### Sending Match Invites

```typescript
function initiateMatchInvite(
  io: Server, 
  tournament: Tournament, 
  matchKey: 'semi1' | 'semi2' | 'final'
) {
  const match = tournament.bracket![matchKey];
  if (!match.p1 || !match.p2) return;
  
  // Create invitation with 30 second timeout
  const expiresAt = Date.now() + 30 * 1000;
  match.invite = {
    p1: 'pending',
    p2: 'pending',
    expiresAt
  };
  
  // Set auto-timeout
  match.invite.timeoutId = setTimeout(() => {
    handleMatchInviteTimeout(io, tournament.id, matchKey);
  }, 30000);
  
  // Send invites to both players
  const p1Socket = getSocketByUserId(match.p1);
  const p2Socket = getSocketByUserId(match.p2);
  
  if (p1Socket) {
    p1Socket.emit('tournament_match_invite', {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      matchKey,
      opponent: match.p2Name || match.p2,
      expiresAt
    });
  }
  
  if (p2Socket) {
    p2Socket.emit('tournament_match_invite', {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      matchKey,
      opponent: match.p1Name || match.p1,
      expiresAt
    });
  }
}
```

### Handling Invite Responses

```typescript
socket.on('tournament_match_invite_response', ({ tournamentId, matchKey, response }) => {
  const tournament = tournamentManager.get(tournamentId);
  const match = tournament?.bracket?.[matchKey];
  
  if (!match || !match.invite) {
    socket.emit('tournament_error', { message: 'Invalid match invite' });
    return;
  }
  
  // Record player response
  const playerId = userId;
  if (match.p1 === playerId) {
    match.invite.p1 = response;
  } else if (match.p2 === playerId) {
    match.invite.p2 = response;
  }
  
  // Broadcast invite status update
  tournamentManager.broadcast(io, tournament, 'tournament_match_invite_update', {
    tournamentId,
    matchKey,
    invite: match.invite
  });
  
  // Check if both players responded
  if (match.invite.p1 !== 'pending' && match.invite.p2 !== 'pending') {
    evaluateMatchInvite(io, tournamentId, matchKey);
  }
  
  tournamentManager.persist();
});
```

### Match Creation on Acceptance

```typescript
function evaluateMatchInvite(io: Server, tournamentId: string, matchKey: string) {
  const tournament = tournamentManager.get(tournamentId);
  const match = tournament?.bracket?.[matchKey];
  
  if (!match?.invite) return;
  
  // Clear timeout
  if (match.invite.timeoutId) {
    clearTimeout(match.invite.timeoutId);
  }
  
  // Both accepted - create game room
  if (match.invite.p1 === 'accepted' && match.invite.p2 === 'accepted') {
    const p1Socket = getSocketByUserId(match.p1!);
    const p2Socket = getSocketByUserId(match.p2!);
    
    if (p1Socket && p2Socket) {
      // Create remote game room
      const room = roomManager.createRemoteGameRoom(
        p1Socket, p2Socket, match.p1!, match.p2!
      );
      
      // Set tournament match type for result tracking
      room.matchTypeOverride = tournamentId;
      match.roomId = room.id;
      match.invite = undefined; // Clear invite
      
      // Force start the game
      setTimeout(() => room.forceStart('tournament'), 1000);
      
      tournamentManager.broadcast(io, tournament, 'tournament_match_started', {
        tournamentId,
        matchKey,
        roomId: room.id
      });
    }
  }
  
  // Either declined - eliminate both players
  else {
    tournament.eliminated = Array.from(new Set([
      ...(tournament.eliminated || []),
      match.p1!, match.p2!
    ]));
    
    // Set elimination reasons
    if (match.invite.p1 === 'declined') {
      tournament.eliminationReasons![match.p1!] = 'declined_invite';
    }
    if (match.invite.p2 === 'declined') {
      tournament.eliminationReasons![match.p2!] = 'declined_invite';
    }
    
    match.invite = undefined;
    tournamentManager.evaluateElimination(io, tournament);
  }
  
  tournamentManager.persist();
}
```

## Result Processing

### Game Result Integration

Tournament matches are tracked by setting `matchType` to the tournament ID:

```typescript
// When creating tournament game room
const room = roomManager.createRemoteGameRoom(p1Socket, p2Socket, p1Id, p2Id);
room.matchTypeOverride = tournamentId; // Links results to tournament

// Game result handler automatically processes tournament results
onGameResult(io: Server, result: GameResult) {
  // Check if result belongs to tournament
  const tournament = this.tournaments.get(result.matchType);
  if (!tournament || !tournament.bracket) return;
  
  // Find matching bracket slot
  for (const matchKey of ['semi1', 'semi2', 'final'] as const) {
    const match = tournament.bracket[matchKey];
    
    if (match?.roomId === result.roomId) {
      // Process match result
      this.processMatchResult(io, tournament, matchKey, result);
      break;
    }
  }
}
```

### Bracket Advancement

```typescript
private processMatchResult(
  io: Server,
  tournament: Tournament,
  matchKey: 'semi1' | 'semi2' | 'final',
  result: GameResult
) {
  const match = tournament.bracket![matchKey];
  
  // Determine winner and loser
  const winner = result.winner === 'p1' ? match.p1 : 
                 result.winner === 'p2' ? match.p2 : undefined;
  const loser = match.p1 === winner ? match.p2 : match.p1;
  
  if (winner) {
    // Record match result
    match.winner = winner;
    match.winnerName = result.winner === 'p1' ? match.p1Name : match.p2Name;
    match.score = result.score;
    match.endReason = result.status;
    
    // Eliminate loser
    if (loser) {
      tournament.eliminated = Array.from(new Set([
        ...(tournament.eliminated || []), loser
      ]));
      tournament.eliminationReasons![loser] = 'lost';
      this.unlockPlayer(loser, tournament);
    }
    
    // Advance winner to next round
    if (matchKey === 'semi1') {
      tournament.bracket.final!.p1 = winner;
      tournament.bracket.final!.p1Name = match.winnerName;
    } else if (matchKey === 'semi2') {
      tournament.bracket.final!.p2 = winner;  
      tournament.bracket.final!.p2Name = match.winnerName;
    } else if (matchKey === 'final') {
      // Tournament complete
      this.completeTournament(io, tournament, winner);
      return;
    }
    
    // Check if final can start
    if (this.shouldInviteFinal(tournament)) {
      this.initiateMatchInvite(io, tournament, 'final');
    }
  }
  
  this.broadcast(io, tournament, 'tournament_bracket_update', {
    tournamentId: tournament.id,
    bracket: tournament.bracket
  });
  
  this.persist();
}
```

### Tournament Completion

```typescript
private completeTournament(io: Server, tournament: Tournament, winner: string) {
  tournament.status = 'completed';
  tournament.result = {
    winner: tournament.playerNames[winner] || winner,
    runnersUp: [
      tournament.bracket!.semi1.p1Name || tournament.bracket!.semi1.p1!,
      tournament.bracket!.semi2.p1Name || tournament.bracket!.semi2.p1!
    ].filter(name => name !== (tournament.playerNames[winner] || winner)),
    completedAt: new Date().toISOString()
  };
  
  // Unlock all remaining players
  this.unlockAllPlayers(tournament);
  
  this.broadcast(io, tournament, 'tournament_completed', {
    tournamentId: tournament.id,
    result: tournament.result
  });
  
  this.persist();
}
```

## Persistence System

### Database Storage

Tournaments are persisted as JSON snapshots in SQLite:

```sql
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot TEXT NOT NULL,      -- JSON serialized tournament state
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Snapshot Management

```typescript
// Save tournament state to database
private persist() {
  for (const tournament of this.tournaments.values()) {
    // Remove volatile data before persisting
    const snapshot = this.sanitizeForPersistence(tournament);
    
    upsertTournament({
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      snapshot: JSON.stringify(snapshot),
      created_at: tournament.createdAt,
      updated_at: new Date().toISOString()
    });
  }
}

// Remove non-persistent data
private sanitizeForPersistence(tournament: Tournament) {
  const sanitized = { ...tournament };
  
  // Remove socket connections (volatile)
  delete sanitized.playersSockets;
  delete sanitized.sockets;
  
  // Remove timeout IDs from invites
  if (sanitized.bracket) {
    for (const match of Object.values(sanitized.bracket)) {
      if (match.invite?.timeoutId) {
        delete match.invite.timeoutId;
      }
    }
  }
  
  return sanitized;
}

// Load tournaments on server startup
async loadTournaments(): Promise<Tournament[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tournaments', (err, rows) => {
      if (err) reject(err);
      else {
        const tournaments = rows.map(row => {
          const tournament = JSON.parse(row.snapshot) as Tournament;
          return this.ensureDefaults(tournament);
        });
        resolve(tournaments);
      }
    });
  });
}
```

### Startup Recovery

The system handles server restarts gracefully by recovering tournament state:

```typescript
private startupCleanup() {
  const now = Date.now();
  let changed = false;
  
  for (const tournament of this.tournaments.values()) {
    // Handle tournaments that were waiting when server restarted
    if (tournament.status === 'waiting' && now >= tournament.startsAt) {
      if (tournament.players.length < 4) {
        tournament.status = 'cancelled';
        changed = true;
      } else {
        tournament.status = 'running';
        tournament.countdownUntil = now + 10_000; // Restart countdown
        changed = true;
      }
    }
    
    // Clean up expired invites
    if (tournament.status === 'running' && tournament.bracket) {
      for (const [matchKey, match] of Object.entries(tournament.bracket)) {
        if (match.invite && match.invite.expiresAt && now > match.invite.expiresAt) {
          console.log(`Cleaning up expired invite in ${tournament.id}:${matchKey}`);
          match.invite.p1 = 'declined';
          match.invite.p2 = 'declined';
          changed = true;
        }
      }
    }
  }
  
  if (changed) {
    this.persist();
  }
}
```

## Error Handling and Edge Cases

### Player Disconnection

```typescript
// Handle player leaving tournament
socket.on('tournament_leave', ({ id }) => {
  const tournament = tournamentManager.get(id);
  if (!tournament) return;
  
  if (tournament.status === 'waiting') {
    // Remove from player list
    tournament.players = tournament.players.filter(p => p !== userId);
    delete tournament.playersSockets[userId];
    delete tournament.playerNames[userId];
    
    activityManager.setTournamentLock(userId, false);
  } else {
    // Mark as eliminated if tournament is running
    tournament.eliminated = Array.from(new Set([
      ...(tournament.eliminated || []), userId
    ]));
    tournament.eliminationReasons![userId] = 'left';
  }
  
  tournamentManager.evaluateElimination(io, tournament);
  tournamentManager.persist();
});
```

### Invite Timeouts

```typescript
function handleMatchInviteTimeout(io: Server, tournamentId: string, matchKey: string) {
  const tournament = tournamentManager.get(tournamentId);
  const match = tournament?.bracket?.[matchKey];
  
  if (!match?.invite) return;
  
  // Auto-decline expired invites
  if (match.invite.p1 === 'pending') match.invite.p1 = 'declined';
  if (match.invite.p2 === 'pending') match.invite.p2 = 'declined';
  
  // Process as declined invites
  evaluateMatchInvite(io, tournamentId, matchKey);
  
  console.log(`Auto-declined expired invites for ${tournamentId}:${matchKey}`);
}
```

### Concurrent Access Protection

```typescript
// Prevent race conditions in tournament operations
private readonly operationLocks = new Set<string>();

private async withLock<T>(tournamentId: string, operation: () => Promise<T>): Promise<T> {
  const lockKey = `tournament:${tournamentId}`;
  
  if (this.operationLocks.has(lockKey)) {
    throw new Error('Tournament operation in progress');
  }
  
  this.operationLocks.add(lockKey);
  try {
    return await operation();
  } finally {
    this.operationLocks.delete(lockKey);
  }
}
```

The tournament system provides a robust, persistent, and user-friendly competitive gaming experience with proper error handling, state recovery, and real-time updates throughout the entire tournament lifecycle.
