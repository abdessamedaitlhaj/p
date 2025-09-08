# Architecture Decision Records

This document explains the key architectural and **security decisions** made in building the Pong platform, including security-first reasoning behind technology choices, security trade-offs considered, and secure alternatives evaluated.

## 📋 Decision Summary

| Decision | Status | Security Impact | Performance Impact |
|----------|--------|-----------------|-------------------|
| [Secure Backend: Fastify + Security Middleware](#secure-backend-fastify--security-middleware) | ✅ Accepted | Critical | High |
| [Authentication: JWT + Secure Cookies](#authentication-jwt--secure-cookies) | ✅ Accepted | Critical | Medium |
| [Socket Security: Namespace Isolation + Auth](#socket-security-namespace-isolation--auth) | ✅ Accepted | Critical | High |
| [Input Validation: Zod Schemas](#input-validation-zod-schemas) | ✅ Accepted | Critical | Low |
| [Rate Limiting: Custom Implementation](#rate-limiting-custom-implementation) | ✅ Accepted | High | Low |
| [Database: SQLite with Parameterized Queries](#database-sqlite-with-parameterized-queries) | ✅ Accepted | Medium | Medium |
| [CORS: Whitelist-based](#cors-whitelist-based) | ✅ Accepted | High | Low |
| [Security Headers: Helmet.js](#security-headers-helmetjs) | ✅ Accepted | High | Low |
| [Password Security: bcrypt](#password-security-bcrypt) | ✅ Accepted | Critical | Low |

---

## Secure Backend: Fastify + Security Middleware

**Decision:** Use Fastify with comprehensive security middleware stack

### Security Context
The backend needed to handle:
- **Authenticated** HTTP requests for REST API
- **Secure** WebSocket connections via Socket.IO
- **Rate-limited** endpoints to prevent abuse
- **Input validation** to prevent injection attacks
- **Security headers** to prevent XSS and other attacks

### Security-First Implementation

**Why this security stack was chosen:**
```typescript
// Comprehensive security setup
const app = Fastify({ logger: true });

// Security headers (XSS, CSP, clickjacking protection)
await app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws://localhost:3000", "wss://localhost:3000"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  }
});

// Rate limiting (DoS protection)
app.addHook('preHandler', globalRateLimit); // 100 req/min

// Secure CORS (not allowing all origins)
await app.register(fastifyCors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:8080"],
  credentials: true
});
```
});

// Plugin architecture
await server.register(fastifyCors);
await server.register(fastifySocketIO);
await server.register(fastifyCookie);
```

**Performance Comparison:**
- Fastify: ~30,000 requests/second
- Express: ~15,000 requests/second  
- Built-in JSON validation reduces code complexity

**Alternatives Considered:**

1. **Express.js**
   - ❌ Slower performance
   - ❌ Manual validation setup required
   - ❌ More middleware configuration needed
   - ✅ Larger community and more examples

2. **Koa.js**
   - ❌ Smaller ecosystem
   - ❌ Less Socket.IO integration examples
   - ✅ Modern async/await support
   - ✅ Lightweight

3. **NestJS**
   - ❌ Too heavy for our needs
   - ❌ Steep learning curve
   - ✅ Excellent TypeScript support
   - ✅ Enterprise-grade architecture

### Trade-offs Accepted

**Benefits Gained:**
- 2x better performance under load
- Built-in request validation
- Excellent TypeScript integration
- Plugin-based architecture
- Built-in logging system

**Costs Accepted:**
- Smaller community than Express
- Less Stack Overflow answers available
- Learning curve for Express developers
- Fewer third-party examples

### Implementation Impact

```typescript
// Clean plugin registration
export async function createServer() {
  const app = Fastify({
    logger: { level: "info" }
  });

  // Type-safe route handlers
  app.post<{
    Body: { username: string; password: string }
  }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    // Validated request.body is available
    const { username, password } = request.body;
    // ...
  });
}
```

---

## State Management: Zustand

**Decision:** Use Zustand for global state management instead of Redux or Context API

### Context
The React frontend needed global state management for:
- User authentication state
- Game state synchronization  
- Real-time chat messages
- Tournament bracket data
- Activity locks across tabs

### Decision Factors

**Why Zustand was chosen:**
```typescript
// Simple store creation
export const useGameStore = create<GameState>((set) => ({
  currentGame: null,
  isPlaying: false,
  setCurrentGame: (game) => set({ currentGame: game }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
}));

// Easy usage in components  
const { currentGame, setCurrentGame } = useGameStore();

// TypeScript support
interface GameState {
  currentGame: GameData | null;
  isPlaying: boolean;
  setCurrentGame: (game: GameData | null) => void;
  setIsPlaying: (playing: boolean) => void;
}
```

**Alternatives Considered:**

1. **Redux Toolkit**
   - ❌ More boilerplate code required
   - ❌ Steeper learning curve
   - ❌ Need additional packages (React-Redux)
   - ✅ Excellent DevTools support
   - ✅ Time-travel debugging
   - ✅ Large community

2. **React Context API**
   - ❌ Performance issues with frequent updates
   - ❌ Provider hell with multiple contexts
   - ❌ No built-in persistence
   - ✅ Built into React
   - ✅ No additional dependencies

3. **Jotai**
   - ❌ Newer, less stable ecosystem
   - ❌ Different mental model (atomic state)
   - ✅ Excellent performance
   - ✅ Great TypeScript support

### Trade-offs Accepted

**Benefits Gained:**
- Minimal boilerplate code
- Excellent TypeScript support
- Small bundle size (~2KB)
- No provider wrapper needed
- Built-in persistence options
- Easy testing

**Costs Accepted:**
- Less mature ecosystem than Redux
- Fewer debugging tools
- No time-travel debugging
- Learning new state management pattern

### Implementation Impact

```typescript
// Modular store slices
export interface RootState extends 
  UserState & UserActions,
  GameState & GameActions,
  ChatState & ChatActions {
}

export const createRootStore = (): RootState => create()(
  subscribeWithSelector(
    persist(
      (...args) => ({
        ...createUserSlice(...args),
        ...createGameSlice(...args), 
        ...createChatSlice(...args),
      }),
      {
        name: 'pong-storage',
        partialize: (state) => ({
          user: state.user, // Only persist user data
        }),
      }
    )
  )
);
```

---

## Database: SQLite

**Decision:** Use SQLite as the database instead of PostgreSQL or MongoDB

### Context
We needed a database solution that could handle:
- User accounts and authentication
- Game results and statistics
- Tournament data and brackets
- Chat message history
- Real-time read/write operations

### Decision Factors

**Why SQLite was chosen:**
```javascript
// Simple setup - no external dependencies
import sqlite3 from 'sqlite3';
export const db = new sqlite3.Database('./server/db/database.sqlite');

// ACID transactions for consistency
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  db.run('INSERT INTO game_results ...');
  db.run('UPDATE player_stats ...');
  db.run('COMMIT');
});

// Full SQL support
db.all(`
  SELECT u.username, ps.games_won, ps.games_played,
         ROUND(ps.games_won * 100.0 / ps.games_played, 1) as win_rate
  FROM users u 
  JOIN player_stats ps ON u.id = ps.user_id 
  WHERE ps.games_played > 0
  ORDER BY win_rate DESC
`, callback);
```

**Alternatives Considered:**

1. **PostgreSQL**
   - ❌ Requires separate database server setup
   - ❌ More complex deployment
   - ❌ Connection pooling complexity
   - ✅ Better performance under high load
   - ✅ Advanced features (JSON columns, arrays)
   - ✅ Better concurrent write performance

2. **MongoDB**
   - ❌ NoSQL learning curve for SQL developers
   - ❌ Requires separate database server
   - ❌ Less suitable for relational game data
   - ✅ Good for flexible schemas
   - ✅ Built-in horizontal scaling

3. **MySQL**
   - ❌ Requires separate database server setup
   - ❌ More complex configuration
   - ✅ Wide adoption and knowledge
   - ✅ Good performance characteristics

### Trade-offs Accepted

**Benefits Gained:**
- Zero setup - database is just a file
- Perfect for development and small deployments
- Full SQL feature support
- ACID transactions
- No network latency (embedded)
- Easy backup (copy file)
- No additional services to manage

**Costs Accepted:**
- Limited concurrent write performance
- No built-in replication
- Single-server deployment only
- File locking issues under extreme load
- Limited to ~1TB practical size

### Implementation Impact

```typescript
// Runtime schema management
export class PlayerStats {
  constructor() {
    this.createTable();
  }
  
  private createTable(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS player_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;
    
    db.run(sql, (err) => {
      if (err) console.error('Error creating player_stats table:', err);
      else console.log('✅ player_stats table ready');
    });
  }
}
```

---

## Real-time: Socket.IO

**Decision:** Use Socket.IO for real-time communication instead of native WebSockets

### Context
The platform needed real-time communication for:
- 60 FPS game state synchronization
- Live chat messaging
- Tournament match invitations
- Multi-tab activity coordination
- Matchmaking queue updates

### Decision Factors

**Why Socket.IO was chosen:**
```javascript
// Automatic reconnection and fallbacks
const socket = io('http://localhost:3000', {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  transports: ['websocket', 'polling'] // Fallback to HTTP long-polling
});

// Event-based communication
socket.emit('game_input', { paddle: 'up', timestamp: Date.now() });
socket.on('game_state', (state) => updateGameDisplay(state));

// Room management
socket.join(userId); // Personal room for targeted messages
socket.to(roomId).emit('game_update', data); // Broadcast to game room
```

**Alternatives Considered:**

1. **Native WebSockets**
   - ❌ Manual reconnection logic required
   - ❌ No automatic fallbacks
   - ❌ Binary message handling complexity
   - ❌ No built-in room concept
   - ✅ Lower overhead per message
   - ✅ More direct control

2. **Server-Sent Events (SSE)**
   - ❌ Unidirectional (server → client only)
   - ❌ No binary data support
   - ❌ Connection limit per domain
   - ✅ Simple HTTP-based
   - ✅ Built into browsers

3. **WebRTC Data Channels**
   - ❌ Complex peer-to-peer setup
   - ❌ NAT traversal issues
   - ❌ No server-based game state authority
   - ✅ Lowest possible latency
   - ✅ Direct peer communication

### Trade-offs Accepted

**Benefits Gained:**
- Automatic reconnection handling
- Transport fallbacks (WebSocket → polling)
- Built-in room/namespace concepts  
- Event-based message routing
- Browser compatibility guarantees
- Excellent debugging tools

**Costs Accepted:**
- Slightly higher message overhead
- Additional dependency
- Less direct control over connection
- Binary data requires encoding

### Implementation Impact

```typescript
// Centralized event handling
export function registerSocketHandlers(app: FastifyInstance) {
  app.io.on('connection', (socket) => {
    // Authentication
    socket.on('join', async (userId) => {
      socket.join(userId); // Personal room
      socketToUser.set(socket.id, userId);
    });
    
    // Game events
    socket.on('game_input', (input) => {
      const room = getRoomForSocket(socket.id);
      room?.handleInput(input);
    });
    
    // Cleanup on disconnect
    socket.on('disconnect', () => {
      cleanupSocketResources(socket.id);
    });
  });
}

// Type-safe event definitions
interface ServerToClientEvents {
  game_state: (state: GameState) => void;
  user_online: (users: string[]) => void;
  tournament_update: (tournament: Tournament) => void;
}

interface ClientToServerEvents {
  game_input: (input: GameInput) => void;
  join_matchmaking: () => void;
  send_invite: (targetUserId: string) => void;
}
```

---

## Authoritative Server

**Decision:** Implement authoritative server-side game physics instead of client-side prediction

### Context
For a competitive multiplayer game, we needed to decide how to handle:
- Game physics calculations
- Cheat prevention
- State synchronization
- Latency compensation

### Decision Factors

**Why authoritative server was chosen:**
```typescript
// Server-side game loop at 60 FPS
class GameRoom {
  constructor() {
    this.interval = setInterval(() => {
      // Authoritative physics update
      const result = GameEngine.update(this.state, this.inputQueue);
      this.state = result.state;
      this.inputQueue = [];
      
      // Broadcast to all clients
      this.broadcastState();
    }, 1000/60); // 16.67ms intervals
  }
  
  private broadcastState(): void {
    const gameState = {
      ...this.state,
      timestamp: Date.now() // For client interpolation
    };
    
    this.socket1.emit('game_state', gameState);
    this.socket2.emit('game_state', gameState);
  }
}
```

**Alternatives Considered:**

1. **Client-Side Prediction**
   - ❌ Vulnerable to cheating
   - ❌ Complex rollback/reconciliation
   - ❌ Harder to maintain consistency
   - ✅ Lower perceived input lag
   - ✅ Smoother local movement

2. **Hybrid Approach**
   - ❌ Significantly more complex
   - ❌ Harder to debug desync issues
   - ✅ Best of both worlds potentially
   - ✅ Can optimize per-game-element

3. **Peer-to-Peer**
   - ❌ No authoritative truth
   - ❌ Complex consensus algorithms
   - ❌ Vulnerable to network partitions
   - ✅ No server costs for game logic
   - ✅ Lower latency between peers

### Trade-offs Accepted

**Benefits Gained:**
- Cheat prevention (server has final say)
- Consistent game state for all players
- Simpler client implementation
- Easy to add spectator mode
- Centralized game result recording

**Costs Accepted:**
- Input lag (network round trip)
- Server CPU usage for physics
- Single point of failure
- Bandwidth usage for state broadcasting

### Implementation Impact

```typescript
// Pure game engine functions
export class GameEngine {
  static update(state: GameState, inputs: GameInput[]): UpdateResult {
    // Process inputs in timestamp order
    inputs.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const input of inputs) {
      state = this.applyInput(state, input);
    }
    
    // Physics simulation
    state = this.updateBall(state);
    state = this.updatePaddles(state);
    
    // Collision detection
    const collisions = this.detectCollisions(state);
    state = this.resolveCollisions(state, collisions);
    
    return { state, events: collisions };
  }
}

// Client-side interpolation to smooth server updates
function interpolateGameState(
  previousState: GameState,
  currentState: GameState, 
  alpha: number
): GameState {
  return {
    ...currentState,
    ball: {
      x: lerp(previousState.ball.x, currentState.ball.x, alpha),
      y: lerp(previousState.ball.y, currentState.ball.y, alpha),
      // ...
    }
  };
}
```

---

## Build Tool: Vite

**Decision:** Use Vite for frontend development and building instead of Create React App or Webpack

### Context
We needed a build tool that could:
- Provide fast development server with HMR
- Bundle the React application efficiently
- Support TypeScript out of the box
- Handle modern JavaScript features
- Integrate with our backend proxy needs

### Decision Factors

**Why Vite was chosen:**
```javascript
// Fast dev server startup
npm run dev  // Starts in ~500ms vs 10+ seconds

// Built-in TypeScript support
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',  // Proxy API calls
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true,  // WebSocket proxy
      },
    },
  },
});
```

**Alternatives Considered:**

1. **Create React App (CRA)**
   - ❌ Slow development server startup
   - ❌ Heavy webpack configuration
   - ❌ Limited customization without ejecting
   - ✅ Zero configuration
   - ✅ Well-documented and stable

2. **Custom Webpack**
   - ❌ Complex configuration
   - ❌ Slower development builds
   - ❌ More maintenance overhead
   - ✅ Maximum flexibility
   - ✅ Mature ecosystem

3. **Parcel**
   - ❌ Less configuration control
   - ❌ Smaller community
   - ✅ Zero configuration
   - ✅ Good performance

### Trade-offs Accepted

**Benefits Gained:**
- Lightning-fast development server
- Near-instant HMR updates
- Built-in TypeScript support
- Modern ES modules in development
- Optimized production builds
- Easy proxy configuration

**Costs Accepted:**
- Newer tool with less Stack Overflow answers
- Some plugins may not be as mature
- Different mental model from webpack

### Implementation Impact

```typescript
// Simple development workflow
npm run dev      // Start dev server with HMR
npm run build    // Production build
npm run preview  // Preview production build

// Hot Module Replacement works seamlessly
function GameComponent() {
  const [state, setState] = useState(0);
  
  // Changes to this file update instantly in browser
  return <div>Game State: {state}</div>;
}

// Environment variable support
const API_URL = import.meta.env.VITE_API_URL;
```

---

## JWT with Refresh Tokens

**Decision:** Use JWT access tokens with httpOnly refresh token cookies for authentication

### Context
The authentication system needed to:
- Secure API endpoints
- Support multiple concurrent sessions
- Work across browser tabs
- Prevent XSS token theft
- Allow for token revocation

### Decision Factors

**Why JWT + Refresh pattern was chosen:**
```typescript
// Short-lived access token (15 minutes)
const accessToken = generateAccessToken({
  id: user.id,
  username: user.username,
  email: user.email
}, '15m');

// Long-lived refresh token in httpOnly cookie (7 days)
reply.setCookie('refresh_token', refreshToken, {
  httpOnly: true,      // Not accessible via JavaScript
  secure: isProduction,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// Client can't access refresh token directly
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include'  // Send cookies
});
```

**Alternatives Considered:**

1. **Session Cookies Only**
   - ❌ Requires server-side session storage
   - ❌ Harder to scale across servers
   - ❌ CSRF vulnerability concerns
   - ✅ Automatic expiration
   - ✅ Server-controlled revocation

2. **JWT in localStorage**
   - ❌ Vulnerable to XSS attacks
   - ❌ No automatic expiration
   - ❌ Persists across browser restarts
   - ✅ Simple client-side implementation
   - ✅ Works with CORS

3. **OAuth with Third-party**
   - ❌ External dependency
   - ❌ More complex implementation
   - ❌ User data privacy concerns
   - ✅ No password management
   - ✅ Standard implementation

### Trade-offs Accepted

**Benefits Gained:**
- XSS protection (httpOnly refresh tokens)
- Stateless API endpoints (JWT verification)
- Automatic token refresh
- Multi-tab synchronization
- Short-lived access tokens limit damage

**Costs Accepted:**
- More complex authentication flow
- Need to handle token refresh logic
- Slightly more network requests
- CSRF protection needed for cookies

### Implementation Impact

```typescript
// Automatic token refresh interceptor
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        await refreshToken(); // Uses httpOnly cookie
        return axios(originalRequest); // Retry with new token
      } catch (refreshError) {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// Socket.IO authentication
socket.on('connect', () => {
  const token = localStorage.getItem('access_token');
  socket.emit('authenticate', { token });
});
```

---

## Summary of Key Benefits

These architectural decisions work together to create:

1. **High Performance**
   - Fastify + Vite + authoritative server = fast, responsive experience
   - SQLite eliminates network database latency

2. **Developer Experience**
   - TypeScript throughout provides type safety
   - Vite enables instant feedback during development
   - Zustand reduces state management complexity

3. **Security**
   - Authoritative server prevents cheating
   - JWT + httpOnly cookies prevent XSS token theft
   - Input validation at multiple layers

4. **Reliability**
   - Socket.IO handles connection issues gracefully
   - SQLite's ACID properties ensure data consistency
   - Comprehensive error handling patterns

5. **Scalability Preparation**
   - Modular architecture makes it easy to extract services
   - Stateless JWT design supports horizontal scaling
   - Clear separation between client and server logic

These decisions prioritize development speed, security, and user experience for a real-time multiplayer gaming platform while maintaining the flexibility to scale as needed.
