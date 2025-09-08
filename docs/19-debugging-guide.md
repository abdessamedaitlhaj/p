# Security-Aware Debugging and Troubleshooting Guide

This guide helps you identify, diagnose, and fix common issues in the Pong platform while maintaining security best practices. It covers development setup problems, authentication issues, and secure production debugging strategies.

## 🔍 Security-First Diagnosis Checklist

When something goes wrong, start with these security-aware checks:

1. **Check browser console** (F12 → Console) - Look for auth/CORS errors
2. **Check server terminal** - Look for authentication failures and rate limiting
3. **Verify security services** - Backend (auth required), Frontend (tokens valid)
4. **Check network requests** (F12 → Network) - Look for 401/403 responses
5. **Verify security environment** - JWT secrets, CORS origins, rate limits
6. **Monitor failed auth attempts** - Check for potential attacks

---

## 🚨 Security-Related Issues and Solutions

### 1. Authentication and Authorization Issues

#### Issue: "Authentication required" or 401 Unauthorized
```bash
# Symptoms
Socket connection fails with "Authentication required"
HTTP requests return 401 Unauthorized
Console shows: "No access token provided"

# Diagnosis
# Check if JWT token exists and is valid
localStorage.getItem('accessToken')  # Should not be null
# Check token format in Network tab headers
Authorization: "Bearer eyJhbGciOiJIUzI1NiIs..."

# Solutions
1. Login again to get fresh tokens
2. Check token expiration (JWT has 1h expiry)
3. Verify refresh token mechanism is working
4. Check if ACCESS_TOKEN_SECRET matches server
```

#### Issue: "Rate limit exceeded" or 429 errors
```bash
# Symptoms
"Rate limit exceeded. Try again in X seconds"
Multiple failed requests from same IP

# Diagnosis
# Check rate limiting logs in server terminal
console.log("Rate limit hit for IP:", request.ip)

# Solutions (Development)
# Wait for rate limit window to reset
# OR temporarily increase limits in development
const globalRateLimit = createRateLimit(1000, 60000); // Higher dev limit

# Solutions (Production)
# Monitor for potential DoS attacks
# Check if legitimate traffic is being limited
# Adjust rate limits if needed for normal usage
```
```

#### Issue: "Permission denied" during npm install
```bash
# Symptoms
EACCES: permission denied, mkdir '/usr/local/lib/node_modules'

# Solutions (pick one)
sudo chown -R $(whoami) ~/.npm  # Fix npm permissions
# OR
npm config set prefix ~/.npm-global  # Use different directory
export PATH=~/.npm-global/bin:$PATH  # Add to PATH
```

#### Issue: Environment variables not loading
```bash
# Symptoms
ACCESS_TOKEN_SECRET is undefined

# Diagnosis
cat .env  # Check file exists
echo $ACCESS_TOKEN_SECRET  # Check if loaded

# Solutions
cp .env.example .env  # Create from template
# Then edit .env with real values
# Make sure no spaces around = sign
ACCESS_TOKEN_SECRET=your_secret_here  # ✅ Correct
ACCESS_TOKEN_SECRET = your_secret_here  # ❌ Wrong
```

---

### 2. Database Issues

#### Issue: "Database is locked" error
```bash
# Symptoms
Error: SQLITE_BUSY: database is locked

# Diagnosis
lsof server/db/database.sqlite  # Check what's using the database

# Solutions
# Stop all servers first
npm run clean
# Remove lock file if it exists
rm server/db/database.sqlite-wal
rm server/db/database.sqlite-shm
# Restart server
npm run dev:full
```

#### Issue: Database schema corruption
```sql
-- Symptoms
Error: no such table: users
Error: no such column: created_at

-- Diagnosis
sqlite3 server/db/database.sqlite
.tables  -- List all tables
.schema users  -- Check table structure

-- Solutions (DESTRUCTIVE - loses data)
-- Exit sqlite3 first (.quit)
```
```bash
# Backup first (if data is important)
cp server/db/database.sqlite server/db/database.sqlite.backup

# Delete corrupted database
rm server/db/database.sqlite

# Restart server (will recreate tables)
npm run server
```

#### Issue: Migration errors or missing columns
```sql
-- Symptoms
Error: no such column: new_field

-- Diagnosis
sqlite3 server/db/database.sqlite
.schema table_name  -- Check current schema

-- Manual fix (add missing column)
ALTER TABLE users ADD COLUMN new_field TEXT DEFAULT NULL;
```

---

### 3. Socket.IO Connection Issues

#### Issue: "Socket.IO connection failed"
```javascript
// Symptoms (in browser console)
WebSocket connection to 'ws://localhost:3000/socket.io/' failed

// Diagnosis steps
// 1. Check if backend is running (use ping endpoint)
fetch('http://localhost:3000/api/ping')
  .then(r => r.json())
  .then(console.log)  // Should show { message: "Pong! 🏓", timestamp: "..." }

// 2. Check Socket.IO endpoint
fetch('http://localhost:3000/socket.io/')
  .then(r => r.text())
  .then(console.log)  // Should show Socket.IO info
```

**Solutions:**
```bash
# Verify backend is running on correct port
curl http://localhost:3000/socket.io/  # Should return Socket.IO info

# Check environment variables
grep VITE_SOCKET_URL client/.env  # Should be ws://localhost:3000

# Restart with cleanup
npm run clean && npm run dev:full
```

#### Issue: Socket events not working
```javascript
// Symptoms
socket.emit('game_start') // No response
socket.on('game_state') // Never fires

// Diagnosis (add to your component)
useEffect(() => {
  socket.on('connect', () => console.log('✅ Connected'));
  socket.on('disconnect', () => console.log('❌ Disconnected'));
  socket.on('connect_error', (err) => console.error('Connection error:', err));
}, []);
```

**Solutions:**
```javascript
// 1. Check authentication
socket.emit('join', userId);  // Must join first

// 2. Check event names (case sensitive)
socket.on('game_state', handler);  // ✅ Correct
socket.on('gameState', handler);   // ❌ Wrong

// 3. Add error handling
socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

#### Issue: Multiple socket connections
```javascript
// Symptoms
Multiple 'game_state' events firing
Socket connection count keeps growing

// Diagnosis
// Check for missing cleanup in useEffect
useEffect(() => {
  // Event listeners
  
  return () => {
    // Missing cleanup causes multiple connections
    socket.off('game_state', handler);  // ✅ Add this
  };
}, []);
```

---

### 4. Game Logic Issues

#### Issue: Game state desynchronization
```javascript
// Symptoms
Players see different ball positions
Score doesn't match between players

// Diagnosis
console.log('Client game state:', gameState);
// Check server logs for 'Broadcasting state' messages

// Solutions
// 1. Check client-side prediction is disabled for authoritative server
// 2. Verify interpolation buffer size
const INTERPOLATION_BUFFER = 100; // ms

// 3. Add network compensation
const renderState = interpolateState(receivedStates, currentTime);
```

#### Issue: Input lag or unresponsive controls
```javascript
// Symptoms
Paddle movement feels delayed
Input events not registering

// Diagnosis
// Add input debugging
socket.emit('game_input', {
  type: 'paddle_move',
  direction: 'up',
  timestamp: Date.now()  // Add timestamp
});

// Check for throttling
let lastInputTime = 0;
const INPUT_THROTTLE = 16; // 60 FPS

function sendInput(input) {
  const now = Date.now();
  if (now - lastInputTime > INPUT_THROTTLE) {
    socket.emit('game_input', input);
    lastInputTime = now;
  }
}
```

#### Issue: Room cleanup failures
```bash
# Symptoms
Error: Room game_12345 already exists
Memory usage keeps growing

# Diagnosis (check server logs)
grep "Room created\|Room destroyed" server-logs.txt
```

**Solutions:**
```javascript
// Add cleanup timeouts
setTimeout(() => {
  roomManager.deleteRoom(roomId);
}, 5000); // Cleanup after 5 seconds

// Add connection cleanup
socket.on('disconnect', () => {
  const roomId = socketToRoom.get(socket.id);
  if (roomId) {
    roomManager.deleteRoom(roomId);
  }
});
```

---

### 5. Tournament System Issues

#### Issue: Tournament bracket corruption
```bash
# Symptoms
Error: Cannot read property 'players' of undefined
Tournament bracket shows wrong matchups

# Diagnosis
# Check tournament data in database
sqlite3 server/db/database.sqlite
SELECT * FROM tournaments WHERE id = 'tournament_id';
# Look at the bracket_data JSON
```

**Solutions:**
```javascript
// Add validation before bracket operations
function validateTournament(tournament) {
  if (!tournament || !tournament.bracket_data) {
    throw new Error('Invalid tournament structure');
  }
  
  try {
    const bracket = JSON.parse(tournament.bracket_data);
    if (!bracket.players || !Array.isArray(bracket.players)) {
      throw new Error('Invalid bracket data');
    }
    return bracket;
  } catch (e) {
    throw new Error('Corrupted bracket JSON');
  }
}

// Recovery procedure
async function recoverTournament(tournamentId) {
  const tournament = await getTournament(tournamentId);
  
  // Reset to last valid state or recreate bracket
  const validBracket = createBracketFromPlayers(tournament.players);
  await updateTournament(tournamentId, { bracket_data: JSON.stringify(validBracket) });
}
```

#### Issue: Tournament invite timeouts
```javascript
// Symptoms
Match invites never expire
Players stuck in "waiting for invite response" state

// Diagnosis
// Check for timeout cleanup in tournament manager
console.log('Active invite timeouts:', Object.keys(inviteTimeouts));

// Solutions
// Add proper timeout management
const inviteTimeouts = new Map();

function sendMatchInvite(playerId, matchData) {
  // Clear any existing timeout
  const existingTimeout = inviteTimeouts.get(playerId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Set new timeout
  const timeout = setTimeout(() => {
    // Auto-decline expired invite
    handleInviteResponse(playerId, 'decline');
    inviteTimeouts.delete(playerId);
  }, 30000); // 30 second timeout
  
  inviteTimeouts.set(playerId, timeout);
  
  // Send invite
  socket.emit('tournament_match_invite', matchData);
}
```

---

### 6. Authentication Issues

#### Issue: "Invalid token" errors
```bash
# Symptoms
403 Unauthorized on protected routes
Token verification failed logs

# Diagnosis
# Check token in browser storage
localStorage.getItem('access_token')
# Check token expiration
jwt.decode(token)  # Use JWT debugger online
```

**Solutions:**
```javascript
// Add token refresh logic
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        // Try to refresh token
        await refreshToken();
        // Retry original request
        return axios.request(error.config);
      } catch (refreshError) {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

#### Issue: Cookie authentication not working
```javascript
// Symptoms
Refresh token not found in cookies
CORS issues with credentials

// Solutions
// 1. Ensure credentials are included
axios.defaults.withCredentials = true;

// 2. Check CORS configuration
// server/index.ts
await app.register(fastifyCors, {
  origin: 'http://localhost:8080',  // Specific origin, not '*'
  credentials: true,  // Allow cookies
});

// 3. Check cookie settings
reply.setCookie('refresh_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'  // Important for cross-origin
});
```

#### Issue: Direct page access causes "Cannot read properties of null" errors
```bash
# Symptoms
ChatSidebar.tsx:23 Uncaught TypeError: Cannot read properties of null (reading 'id')
Works when navigating from home page, fails on direct /chat access
Components crash with null reference errors on page refresh

# Root Cause
Race condition between React Context state and Zustand store initialization:
1. PersistLogin calls refreshToken() on direct access
2. refreshToken() updates React Context state
3. Components try to access Zustand store (still null)
4. Crash occurs before Context useEffect can initialize store

# Diagnosis
console.log('Context state:', state.user); // Has user data
console.log('Store state:', useStore().user); // Shows null

# Solution - Fix useRefreshToken.ts
```

Add store initialization directly in useRefreshToken:

```typescript
// client/hooks/useRefreshToken.ts
import { useStore } from '../store/useStore';

const useRefreshToken = () => {
    const {dispatch} = useAuth()
    const { setUser, connect } = useStore();  // Add store access

    const refresh = async()=>{
        try{
            const {data} = await api.get('token/new', {withCredentials: true})
            dispatch({type:'Persist_Login', payload:data})
            
            // CRITICAL: Initialize store immediately to prevent null access
            if (data?.user) {
                const userWithStringId = {
                    ...data.user,
                    id: String(data.user.id)
                };
                setUser(userWithStringId);    // Initialize Zustand store
                connect("http://localhost:3000"); // Connect socket
            }
            
            return data
        }catch(err){
            console.error(err)
        }
    }
    return refresh
}
```

Add safety checks in components:
```typescript
// client/components/chat/ChatSidebar.tsx
const filtredUsers = data?.filter((u) => user?.id && String(u.id) !== String(user.id));
//                                   ^^^^^ Add null check
```

**Why this works:**
- Eliminates race condition by initializing both state systems simultaneously
- Ensures store is ready before components try to access user data
- Maintains backward compatibility with existing navigation flow

---

### 7. Frontend State Issues

#### Issue: Zustand state not updating
```javascript
// Symptoms
Component not re-rendering after state change
State appears to update but UI doesn't reflect changes

// Diagnosis
// Add state logging
const MyComponent = () => {
  const state = useStore(state => state.gameState);
  console.log('Current state:', state); // Check if state is changing
  
  useEffect(() => {
    console.log('State changed:', state);
  }, [state]);
};

// Solutions
// 1. Check selector specificity
const gameState = useStore(state => state.game.currentGame); // ✅ Specific
const state = useStore(state => state); // ❌ Too broad

// 2. Ensure immutable updates
set((state) => ({
  ...state,
  game: {
    ...state.game,
    currentGame: newGameState  // ✅ Create new object
  }
}));

// Not:
state.game.currentGame = newGameState; // ❌ Mutates existing state
```

#### Issue: React hooks dependency warnings
```javascript
// Symptoms
Warning: useEffect has a missing dependency
Infinite re-render loops

// Solutions
// 1. Add missing dependencies
useEffect(() => {
  fetchData(userId);
}, [userId]); // ✅ Include userId

// 2. Use useCallback for functions
const fetchData = useCallback(async (id) => {
  // fetch logic
}, []);

useEffect(() => {
  fetchData(userId);
}, [fetchData, userId]); // Now fetchData won't change on every render
```

---

### 8. Performance Issues

#### Issue: High CPU usage during games
```bash
# Symptoms
Fan spinning up during gameplay
Browser becomes unresponsive

# Diagnosis
# Use browser performance profiler
# F12 → Performance tab → Record during gameplay

# Check game loop frequency
console.time('render');
renderFrame();
console.timeEnd('render'); // Should be < 16ms for 60 FPS
```

**Solutions:**
```javascript
// 1. Optimize render loop
let lastRenderTime = 0;
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;

function gameLoop(currentTime) {
  if (currentTime - lastRenderTime >= FRAME_TIME) {
    render(gameState);
    lastRenderTime = currentTime;
  }
  requestAnimationFrame(gameLoop);
}

// 2. Use canvas efficiently
const canvas = useRef();
const ctx = canvas.current?.getContext('2d');

// Clear only dirty regions
ctx.clearRect(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);

// 3. Throttle socket events
const throttledEmit = throttle((data) => {
  socket.emit('game_input', data);
}, 16); // ~60 FPS
```

#### Issue: Memory leaks
```javascript
// Symptoms
Memory usage grows over time
Browser becomes sluggish after extended play

// Diagnosis
// Browser → F12 → Memory tab → Take heap snapshot
// Look for detached DOM nodes and growing object counts

// Solutions
// 1. Clean up event listeners
useEffect(() => {
  const handler = (event) => { /* handle */ };
  socket.on('game_state', handler);
  
  return () => {
    socket.off('game_state', handler); // ✅ Always cleanup
  };
}, []);

// 2. Cancel timers and intervals
useEffect(() => {
  const interval = setInterval(() => {
    // periodic task
  }, 1000);
  
  return () => clearInterval(interval); // ✅ Cleanup
}, []);

// 3. Abort fetch requests on unmount
useEffect(() => {
  const controller = new AbortController();
  
  fetch('/api/data', { signal: controller.signal })
    .then(handleData);
  
  return () => controller.abort(); // ✅ Cancel pending requests
}, []);
```

---

## 🔧 Debugging Tools and Techniques

### Browser DevTools

**Console Debugging:**
```javascript
// Add strategic console.logs
console.log('🎮 Game state update:', gameState);
console.log('🔌 Socket event received:', eventName, data);
console.log('📊 Store state changed:', store.getState());

// Use console.table for complex objects
console.table(players);

// Group related logs
console.group('Game Initialization');
console.log('Loading game settings...');
console.log('Creating game room...');
console.groupEnd();
```

**Network Debugging:**
```javascript
// Monitor all socket events
const originalEmit = socket.emit;
socket.emit = function(event, ...args) {
  console.log('📤 Socket emit:', event, args);
  return originalEmit.apply(this, arguments);
};

const originalOn = socket.on;
socket.on = function(event, callback) {
  return originalOn.call(this, event, (...args) => {
    console.log('📥 Socket receive:', event, args);
    callback(...args);
  });
};
```

### Server-Side Debugging

**Enhanced Logging:**
```javascript
// server/utils/logger.ts
export const logger = {
  info: (message, data = {}) => {
    console.log(`ℹ️ [${new Date().toISOString()}] ${message}`, data);
  },
  error: (message, error = {}) => {
    console.error(`❌ [${new Date().toISOString()}] ${message}`, error);
  },
  debug: (message, data = {}) => {
    if (process.env.DEBUG) {
      console.log(`🐛 [${new Date().toISOString()}] ${message}`, data);
    }
  }
};

// Usage
logger.info('Game room created', { roomId, players });
logger.error('Database query failed', error);
```

**Database Query Logging:**
```javascript
// Add to db.ts
const originalRun = db.run;
db.run = function(sql, params, callback) {
  console.log('🗃️ SQL:', sql, params);
  const start = Date.now();
  
  return originalRun.call(this, sql, params, function(err) {
    const duration = Date.now() - start;
    console.log(`🗃️ Query took ${duration}ms`);
    callback?.call(this, err);
  });
};
```

### Performance Monitoring

**Frame Rate Monitoring:**
```javascript
let frameCount = 0;
let lastTime = performance.now();

function trackFPS() {
  frameCount++;
  const currentTime = performance.now();
  
  if (currentTime - lastTime >= 1000) {
    console.log(`🎯 FPS: ${frameCount}`);
    frameCount = 0;
    lastTime = currentTime;
  }
  
  requestAnimationFrame(trackFPS);
}
trackFPS();
```

**Memory Usage Tracking:**
```javascript
function logMemoryUsage() {
  if (performance.memory) {
    const memory = performance.memory;
    console.log(`📊 Memory Usage:
      Used: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)} MB
      Total: ${Math.round(memory.totalJSHeapSize / 1024 / 1024)} MB
      Limit: ${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)} MB
    `);
  }
}

setInterval(logMemoryUsage, 10000); // Every 10 seconds
```

---

## 🚀 Production Debugging

### Health Check Endpoints
```javascript
// server/routes/health.ts
app.get('/health', async (request, reply) => {
  try {
    // Check database
    await new Promise((resolve, reject) => {
      db.get('SELECT 1', (err) => err ? reject(err) : resolve(null));
    });
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      rooms: roomManager.getRoomCount(),
      onlineUsers: onlineUsers.length
    };
  } catch (error) {
    return reply.code(503).send({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

### Error Tracking
```javascript
// Capture and log critical errors
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Send to error tracking service
  // process.exit(1); // Consider graceful shutdown
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Send to error tracking service
});
```

## 📋 Troubleshooting Checklist

### Before Asking for Help

- [ ] **Checked browser console** for JavaScript errors
- [ ] **Checked server terminal** for error messages  
- [ ] **Verified all services are running** (ports 3000 and 8080)
- [ ] **Checked network requests** in browser DevTools
- [ ] **Verified environment variables** are set correctly
- [ ] **Tried restarting** the development servers
- [ ] **Checked if issue is reproducible** in different browsers
- [ ] **Looked through recent changes** that might have caused the issue

### Information to Include in Bug Reports

1. **Environment Details:**
   - Operating system and version
   - Node.js version (`node --version`)
   - Browser and version
   - npm version (`npm --version`)

2. **Steps to Reproduce:**
   - Exact steps to trigger the issue
   - Expected vs actual behavior
   - Screenshots or videos if helpful

3. **Error Information:**
   - Complete error messages (don't truncate)
   - Browser console output
   - Server console output
   - Network requests that failed

4. **Context:**
   - When did the issue start?
   - Does it happen consistently?
   - What were you trying to accomplish?

By following this debugging guide, you should be able to identify and resolve most issues that arise during development. Remember: debugging is a skill that improves with practice, so don't get discouraged if it takes time to track down tricky issues!
