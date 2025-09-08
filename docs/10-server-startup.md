# Server Startup and Initialization

This document explains the secure server startup process, security middleware initialization, authentication setup, and the complete security-hardened bootstrap process.

## 🔐 Security-First Startup Flow

### Initialization Sequence

```ascii
Secure Server Startup Flow

1. Environment Setup    2. Fastify App       3. Security Plugins
   ↓                      ↓                    ↓
   Load .env              Create instance      Helmet (CSP, XSS protection)
   Validate secrets       Security logging     Rate limiting middleware
   CORS whitelist         
   
4. Authentication       5. Database Init     6. Manager Setup
   ↓                      ↓                    ↓
   JWT secret validation  SQLite connection    Secure Socket namespaces
   Token middleware       Table creation       Activity Manager
                         Foreign keys         Tournament Manager
   
7. Socket Security      8. Route Registration 9. Server Listen
   ↓                      ↓                    ↓
   Auth middleware        Protected endpoints  Start listening
   Namespace isolation    Rate-limited routes  Security headers active
   Event validation       Input validation
```

### Secure Server Setup (`server/index.ts`)

```typescript
export async function createServer() {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
      },
    },
  });

  // Security-first plugin registration
  await app.register(fastifyCookie);
  await app.register(fastifyFormbody);
  
  // Enhanced security headers with CSP
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws://localhost:3000", "wss://localhost:3000"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false // Needed for Socket.IO
  });

  // Global rate limiting middleware
  app.addHook('preHandler', globalRateLimit);

  // Secure CORS with environment-based origins
  await app.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:8080"],
    methods: ["GET", "POST"],
    credentials: true,
  });

  // Rate-limited authentication routes
  await app.register(async function authRoutes(fastify) {
    fastify.addHook('preHandler', authRateLimit); // 5 req/min
    await fastify.register(AuthRoutes, { prefix: 'api/auth' });
  });
```
  await app.register(fastifyFormbody);   // Form body parsing
  await app.register(fastifyHelmet);     // Security headers

  // Route registration
  await app.register(AuthRoutes, { prefix: "api/auth" });
  await app.register(RefreshRoutes, { prefix: "api/token" });
  await app.register(UserRoutes, { prefix: "api/users" });
  await app.register(MessageRoutes, { prefix: "api/messages" });
  await app.register(CliAuthRoutes, { prefix: 'api/authcli' });
  await app.register(CliRoutes, { prefix: 'api/cli' });

  // Socket.IO setup with CORS
  await app.register(fastifySocketIO, {
    cors: {
      origin: "http://localhost:8080",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  return app;
}
```

## Database Initialization

### SQLite Connection and Schema Creation

```typescript
// server/db/db.ts - Automatic initialization
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./server/db/database.sqlite', (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    
    // Enable foreign key constraints
    db.run('PRAGMA foreign_keys = ON');
    
    // Enable WAL mode for better concurrency
    db.run('PRAGMA journal_mode = WAL');
  }
});

export { db };
```

### Model-Driven Schema Creation

Each model file creates its own table on import:

```typescript
// server/models/Users.ts
import { db } from '../db/db';

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'in_game')),
    created_at TEXT DEFAULT (datetime('now'))
  )
`, (err) => {
  if (err) console.error('❌ Failed creating users table', err.message);
  else console.log('✅ users table ready.');
});

// Similar pattern for all models:
// - PlayerStats.ts creates player_stats table
// - GameResults.ts creates game_results table  
// - Message.ts creates messages table
// - UserSessions.ts creates user_sessions table
// - Tournaments.ts creates tournaments table
```

### Database Indexes Creation

Performance indexes are created automatically:

```sql
-- Created during model initialization
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_game_results_player1 ON game_results(player1_user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_player2 ON game_results(player2_user_id);
```

## Manager Initialization

### Room Manager Setup

```typescript
// server/roomManager.ts - Singleton pattern
class RoomManager {
  private gameRooms = new Map<string, GameRoom>();
  private remoteRooms = new Map<string, RemoteGameRoom>();
  
  constructor() {
    console.log('🎮 RoomManager initialized');
    
    // Periodic cleanup of stale rooms
    setInterval(() => {
      this.cleanupStaleRooms();
    }, 5 * 60 * 1000); // Every 5 minutes
  }
  
  private cleanupStaleRooms() {
    const now = Date.now();
    const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    
    // Clean up inactive local rooms
    for (const [roomId, room] of this.gameRooms.entries()) {
      if (now - (room as any).createdAt > ROOM_TIMEOUT) {
        console.log(`🗑️ Cleaning up stale local room ${roomId}`);
        this.deleteGameRoom(roomId);
      }
    }
    
    // Clean up inactive remote rooms
    for (const [roomId, room] of this.remoteRooms.entries()) {
      if (now - (room as any).createdAt > ROOM_TIMEOUT) {
        console.log(`🗑️ Cleaning up stale remote room ${roomId}`);
        this.deleteRemoteRoom(roomId);
      }
    }
  }
}

export const roomManager = new RoomManager();
```

### Tournament Manager Initialization

```typescript
// server/tournamentManager.ts
export class TournamentManager {
  private tournaments: Map<string, Tournament> = new Map();
  private matchFlow: MatchFlowController;

  constructor() {
    this.matchFlow = new MatchFlowController(/* ... */);
    
    // Load existing tournaments from database
    this.loadFromDatabase();
  }
  
  private async loadFromDatabase() {
    try {
      const records = await loadTournaments();
      
      for (const tournamentData of records) {
        const tournament = this.ensureDefaults(tournamentData as Tournament);
        this.tournaments.set(tournament.id, tournament);
      }
      
      console.log(`✅ Loaded ${this.tournaments.size} tournaments from DB`);
      
      // Clean up stale state from server restarts
      this.startupCleanup();
      
    } catch (error) {
      console.error('❌ Failed to load tournaments from DB', error);
    }
  }
  
  private startupCleanup() {
    const now = Date.now();
    let changed = false;
    
    console.log(`🧹 Starting tournament cleanup with ${this.tournaments.size} tournaments`);
    
    for (const tournament of this.tournaments.values()) {
      // Handle tournaments that should have started
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
          if (match.invite?.expiresAt && now > match.invite.expiresAt) {
            console.log(`🧹 Cleaning up expired invite in ${tournament.id}:${matchKey}`);
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
}

export const tournamentManager = new TournamentManager();
```

### Activity Manager Setup

```typescript
// server/activityManager.ts
class ActivityManager {
  private io: Server | null = null;
  private locks: Map<string, ActivityLock> = new Map();
  private lastResetAt: Map<string, number> = new Map();

  public initialize(io: Server) {
    this.io = io;
    console.log('✅ ActivityManager initialized');
  }
  
  // Called during server startup to clear stale locks
  public forceUnlockAll(includeTournament = false) {
    for (const [userId, lock] of this.locks.entries()) {
      lock.inMatch = false;
      lock.pendingInviteId = undefined;
      
      if (includeTournament) {
        lock.tournamentLocked = false;
      }
      
      this.broadcastLockState(userId);
    }
    
    console.log(`🧹 Force unlocked all users (includeTournament: ${includeTournament})`);
  }
}

export const activityManager = new ActivityManager();
```

## Socket.IO Setup and Event Registration

### Global IO Reference

```typescript
// Server ready callback
app.ready().then(() => {
  console.log("🎮 Socket.IO server ready, waiting for connections...");
  
  // Expose IO globally for modules that cannot import Fastify instance
  (global as any).io = app.io;
  (global as any).fastifyIo = app.io;
  
  // Initialize activity manager with IO instance
  import('./activityManager').then(m => {
    m.activityManager.initialize(app.io);
  });
  
  // Register all Socket.IO event handlers
  registerSocketHandlers(app);
  
  // Clear stale locks from server restarts
  import('./activityManager').then(m => {
    try {
      m.activityManager.forceUnlockAll(false); // Don't clear tournament locks
      console.log('🧹 Cleared stale match/invite locks at startup');
    } catch (error) {
      console.error('⚠️ Failed to clear stale locks:', error);
    }
  });
});
```

### Socket Event Handler Registration

```typescript
// server/socket/registerHandlers.ts
export function registerSocketHandlers(app: FastifyInstance) {
  const io = app.io;
  
  io.on('connection', (socket) => {
    console.log(`👤 Socket connected: ${socket.id}`);
    
    // Authentication events
    socket.on('join', async (userId) => {
      if (!userId) return;
      
      // Join user's personal room for targeted messages
      socket.join(userId);
      
      // Reset stale locks for this user
      activityManager.resetLocksForUser(userId);
      
      // Update user status
      updateUserStatus(userId, 'online');
      
      // Broadcast user online to others
      socket.broadcast.emit('user_online', { userId });
      
      console.log(`🟢 User ${userId} joined from socket ${socket.id}`);
    });
    
    // Game events
    socket.on('join_game', handleJoinGame);
    socket.on('start_game', handleStartGame);
    socket.on('game_input', handleGameInput);
    
    // Remote game events  
    socket.on('send_invite', handleSendInvite);
    socket.on('accept_invite', handleAcceptInvite);
    socket.on('decline_invite', handleDeclineInvite);
    
    // Tournament events
    socket.on('tournament_create', handleTournamentCreate);
    socket.on('tournament_join', handleTournamentJoin);
    socket.on('tournament_leave', handleTournamentLeave);
    
    // Chat events
    socket.on('send_message', handleSendMessage);
    socket.on('istyping', handleTyping);
    socket.on('stop_typing', handleStopTyping);
    
    // Disconnect handling
    socket.on('disconnect', () => {
      console.log(`👋 Socket disconnected: ${socket.id}`);
      handleDisconnect(socket);
    });
  });
  
  console.log('✅ Socket.IO event handlers registered');
}
```

## Periodic Tasks and Background Jobs

### Tournament Tick System

```typescript
// Tournament state management every 10 seconds
setInterval(() => {
  try {
    tournamentManager.tick(app.io);
  } catch (error) {
    console.error('❌ Tournament tick error', error);
  }
}, 10000); // 10 second intervals

// Tournament tick handles:
// - Countdown progression
// - Tournament start triggers  
// - Match invite timeouts
// - Player elimination checks
// - Status transitions
```

### Room Count Broadcasting

```typescript
// Broadcast room count updates (with change detection)
setInterval(() => {
  const count = roomManager.getRoomCount();
  
  // Only broadcast if count changed to reduce network traffic
  if ((global as any).lastRoomCount !== count) {
    (global as any).lastRoomCount = count;
    app.io.emit("room_count_update", count);
  }
}, 10000); // 10 second intervals
```

### Database Maintenance

```typescript
// Periodic cleanup tasks (can be added to startup)
function scheduleMaintenance() {
  // Clean expired sessions every hour
  setInterval(() => {
    cleanupExpiredSessions();
  }, 60 * 60 * 1000);
  
  // Archive old game results monthly
  setInterval(() => {
    archiveOldGameResults();
  }, 30 * 24 * 60 * 60 * 1000);
  
  // Clean completed tournaments weekly
  setInterval(() => {
    cleanupCompletedTournaments();
  }, 7 * 24 * 60 * 60 * 1000);
}
```

## Health Check and Monitoring Endpoints

### System Status Endpoints

```typescript
// Basic health check - REMOVED for security
// app.get("/api/health", async () => {
//   return {
//     status: "healthy",
//     rooms: roomManager.getRoomCount(),
//     tournaments: tournamentManager.getActiveTournamentCount(),
//     uptime: process.uptime(),
//     memory: process.memoryUsage(),
//     timestamp: new Date().toISOString(),
//   };
// });

// Ping endpoint for connectivity testing - PUBLIC
app.get("/api/ping", async () => {
  return { 
    message: "Pong! 🏓", 
    timestamp: new Date().toISOString() 
  };
});

// Room status endpoint - REMOVED for security
// app.get("/api/rooms", async () => {
//   const roomCount = roomManager.getRoomCount();
//   const allRooms = roomManager.getAllRooms();
//
//   return {
//     count: roomCount,
//     rooms: allRooms.map((room) => ({
//       id: room.id,
//       players: room.player2 ? 2 : 1,
//       gameStarted: room.state.gameStarted,
//       gameOver: room.state.gameOver,
//       createdAt: (room as any).createdAt
    })),
  };
});
```

### Statistics Endpoints

```typescript
### Statistics Endpoints

```typescript
// Player statistics - REQUIRES AUTHENTICATION
app.get('/api/stats/player', { preHandler: verifyToken }, (_req, reply) => {
  db.all('SELECT * FROM player_stats', [], (err, rows) => {
    if (err) return reply.code(500).send({ error: 'Database error' });
    return reply.send(rows);
  });
});

// Match history - REQUIRES AUTHENTICATION
app.get('/api/stats/matches', { preHandler: verifyToken }, async (_req, reply) => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM game_results ORDER BY ended_at DESC LIMIT 100', [], (err, rows) => {
      if (err) {
        reply.code(500).send({ error: 'Database error' });
        resolve(null);
        return;
      }
      reply.send(rows);
      resolve(null);
    });
  });
});

// Tournament history - REQUIRES AUTHENTICATION
app.get('/api/stats/tournaments', { preHandler: verifyToken }, async (_req, reply) => {
  return new Promise((resolve) => {
    db.all('SELECT id, name, status, created_at, updated_at FROM tournaments ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        reply.code(500).send({ error: 'Database error' });
        resolve(null);
        return;
      }
      reply.send(rows);
      resolve(null);
    });
  });
});
```
```

## Graceful Shutdown Handling

### Signal Handling

```typescript
let runningApp: FastifyInstance | null = null;

async function gracefulExit(signal: string) {
  console.log(`🛑 ${signal} received, closing server...`);
  
  try {
    if (runningApp) {
      // Stop accepting new connections
      await runningApp.close();
      console.log('✅ Fastify server closed.');
    }
    
    // Save any pending tournament state
    tournamentManager.persist();
    
    // Unlock all users (they'll reconnect)
    activityManager.forceUnlockAll(false);
    
  } catch (error) {
    console.error('⚠️ Error during shutdown:', error);
  } finally {
    if (signal === 'SIGUSR2') {
      // Nodemon restart: allow process to continue for restart
      process.kill(process.pid, 'SIGUSR2');
    } else {
      process.exit(0);
    }
  }
}

// Handle various shutdown signals
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(sig => {
  process.once(sig as NodeJS.Signals, () => gracefulExit(sig));
});
```

## Error Handling and Recovery

### Port Conflict Detection

```typescript
const startServer = async () => {
  const app = await createServer();
  runningApp = app;
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await app.listen({ port: Number(port), host });
    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log(`🎮 Game server ready for connections`);
    
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.error(`🔥 Port ${port} already in use. Listing processes:`);
      try {
        const { execSync } = await import('node:child_process');
        const list = execSync(`lsof -i:${port} | head -n 20`).toString();
        console.error(list);
      } catch (lsofError) {
        console.error('Could not list processes using port');
      }
    }
    console.error("🔥 Server failed to start:", err);
    // Allow nodemon to attempt restart after cleanup
  }
};
```

### Global Error Handling

```typescript
// Unhandled promise rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  // Log the promise that was rejected
  console.error('Promise:', promise);
});

// Uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  
  // Attempt graceful shutdown
  gracefulExit('SIGTERM');
});
```

## Environment Configuration

### Required Environment Variables

```bash
# .env file structure
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# JWT Secrets (required)
ACCESS_TOKEN_SECRET=your_access_token_secret_here
REFRESH_TOKEN_SECRET=your_refresh_token_secret_here

# Database (optional - defaults to SQLite)
DATABASE_PATH=./server/db/database.sqlite

# Logging (optional)
LOG_LEVEL=info
```

### Configuration Validation

```typescript
// Environment variable validation
function validateConfig() {
  const required = ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'];
  
  for (const envVar of required) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }
  
  console.log('✅ Configuration validated');
}

// Call during startup
dotenv.config();
validateConfig();
```

## Server Startup Checklist

When the server starts up, the following sequence occurs:

1. **✅ Environment loaded** - `.env` file processed
2. **✅ Database connected** - SQLite connection established
3. **✅ Tables created** - All model schemas initialized
4. **✅ Indexes created** - Performance indexes established
5. **✅ Managers initialized** - Room, Tournament, Activity managers ready
6. **✅ Socket handlers registered** - All event listeners attached
7. **✅ Routes registered** - HTTP API endpoints available
8. **✅ Periodic tasks started** - Tournament ticks, cleanup routines
9. **✅ Global references set** - IO instance available to all modules
10. **✅ Stale data cleaned** - Activity locks and expired data cleared
11. **✅ Server listening** - Ready to accept connections

The server initialization is designed to be resilient, with proper error handling, graceful degradation, and automatic recovery mechanisms to ensure reliable operation in production environments.
