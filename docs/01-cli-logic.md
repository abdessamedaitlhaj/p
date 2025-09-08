# CLI Logic and Authentication

This document explains the secure CLI authentication system, token handling, protected CLI endpoints, authorization middleware, and security measures for command-line access to the Pong platform.

## Overview

The CLI system provides a **secure, token-based way** for command-line interfaces to interact with the game server. It implements comprehensive security measures including JWT-based CLI tokens, user authorization, and protected endpoints with rate limiting.

## 🔐 Secure CLI Authentication Flow

### 1. Initial Authentication
```typescript
// User must first authenticate normally via web interface or API
POST /api/auth/signin
Headers: { Content-Type: "application/json" }
Body: { username, password }
Response: { 
  accessToken: "eyJhbGciOiJIUzI1NiIs...", 
  user: {...}, 
  // refreshToken set as httpOnly cookie
}
```

### 2. Secure CLI Token Request
```typescript
// Request CLI token using authenticated access token
POST /api/cli/authorize
Headers: { Authorization: "Bearer <accessToken>" }
Body: { socketId: string }
Response: { 
  token: "eyJhbGciOiJIUzI1NiIs...",  // JWT CLI token 
  expiresAt: 1234567890 
}
```

### 3. Protected CLI Operations
```typescript
// Use CLI token for authenticated CLI operations
GET /api/cli/profile
Headers: { Authorization: "Bearer <cliToken>" }

POST /api/cli/navigate
Headers: { Authorization: "Bearer <cliToken>" }
Body: { page: "game", settings: {...} }
```

**Security Features:**
- CLI tokens are **separate from access tokens** (principle of least privilege)
- CLI tokens have **shorter expiration times**
- All CLI routes require **valid JWT authentication**
- User can only access **their own CLI operations**

## Token Management System

### CLI Token Store (`server/cli/cliTokenStore.ts`)

The `CliTokenStore` class manages temporary CLI tokens:

```typescript
export interface CliTokenRecord {
  token: string;        // JWT token
  userId: string;       // User ID
  socketId: string;     // Associated socket ID
  expiresAt: number;    // Expiration timestamp
  jti: string;          // Unique token ID
}

class CliTokenStore {
  private byUser = new Map<string, CliTokenRecord>();
  
  // Issue new token (revokes existing)
  issue(userId: string, socketId: string, hours = 1): CliTokenRecord
  
  // Revoke token for user
  revoke(userId: string)
  
  // Find token by user ID
  findByUser(userId: string): CliTokenRecord | undefined
  
  // Validate and return token record
  validate(token: string): CliTokenRecord | null
}
```

**Key Features:**
- **Single Token Per User**: Each user can only have one active CLI token
- **Socket Binding**: Tokens are tied to specific socket connections
- **Auto-Expiration**: Tokens expire after specified time (default 1 hour)
- **In-Memory Storage**: Tokens are stored in memory (process-specific)

### Token Validation Process

```typescript
// 1. Parse JWT token
const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

// 2. Check token type
if (decoded?.type !== 'cli') return null;

// 3. Find stored record
const rec = this.byUser.get(decoded.userId);

// 4. Validate token match and expiration
if (rec?.token !== token || Date.now() > rec.expiresAt) return null;

// 5. Verify socket still connected
const socket = io.sockets.sockets.get(rec.socketId);
if (!socket) return null;
```

## Backend Endpoints

### Authentication Endpoints (`server/cli/cliAuth.ts`)

#### Authorize CLI Access
```typescript
POST /api/cli/authorize
Headers: { Authorization: "Bearer <accessToken>" }
Body: { socketId: string }

Response: {
  token: string,      // CLI token
  expiresAt: number   // Expiration timestamp
}

Errors:
- 401: Invalid access token
- 400: Missing socketId or invalid socket
```

#### Revoke CLI Access
```typescript
POST /api/cli/revoke
Headers: { Authorization: "Bearer <token>" } // CLI or normal token

Response: { revoked: boolean }
```

### Game Action Endpoints (`server/cli/cliGameActions.ts`)

CLI-specific endpoints for game actions:

```typescript
// Get user's current status
GET /api/cli/status
Response: {
  status: 'online' | 'offline' | 'in_game',
  inMatch: boolean,
  tournamentLocked: boolean,
  pendingInviteId: string | null
}

// Start local game
POST /api/cli/game/local
Body: { settings?: GameSettings }
Response: { roomId: string, message: string }

// Send game input
POST /api/cli/game/input
Body: { key: string, isKeyDown: boolean }
Response: { success: boolean }

// Join matchmaking
POST /api/cli/matchmaking/join
Body: { settings?: GameSettings }
Response: { message: string }

// Send invite to player
POST /api/cli/invite/send
Body: { targetUserId: string }
Response: { message: string }
```

## Socket Listener Integration

### Socket-CLI Token Binding

The CLI system integrates with Socket.IO through socket ID binding:

```typescript
// When CLI token is issued
const socket = io.sockets.sockets.get(socketId);
if (!socket) {
  return reply.status(400).send({ message: 'invalid socket' });
}

// Token is bound to this specific socket connection
const rec = cliTokenStore.issue(userId, socketId, 1);
```

### Game Event Listeners

CLI tokens enable listening to game events through the bound socket:

```typescript
// Socket events that CLI can receive
socket.on('game_state', (gameState) => {
  // Game state updates during gameplay
});

socket.on('room_joined', (roomData) => {
  // Confirmation of joining a game room
});

socket.on('remote_room_joined', (roomData) => {
  // Joined remote multiplayer game
});

socket.on('receive_invite', (inviteData) => {
  // Received game invite from another player
});

socket.on('matchmaking_status', (status) => {
  // Matchmaking queue status updates
});
```

## Game Navigation System

### Status-Based Navigation

The CLI system uses user status to determine available actions:

```typescript
// User status affects available commands
interface UserStatus {
  inMatch: boolean;           // Currently in a game
  tournamentLocked: boolean;  // Participating in tournament
  pendingInviteId: string;    // Has pending invite
}

// Navigation logic based on status
if (userStatus.inMatch) {
  // Only allow game control commands
  availableActions = ['move', 'pause', 'quit'];
} else if (userStatus.tournamentLocked) {
  // Tournament-specific actions
  availableActions = ['tournament_status', 'accept_match'];
} else if (userStatus.pendingInviteId) {
  // Invite response actions
  availableActions = ['accept_invite', 'decline_invite'];
} else {
  // Full menu available
  availableActions = ['local_game', 'matchmaking', 'send_invite', 'join_tournament'];
}
```

### SPA Navigation Events

CLI actions can trigger SPA navigation through custom events:

```typescript
// Emit navigation event when game starts
socket.emit('join_game', { settings, userId, clientRoomId });

// Listen for room_joined event
socket.on('room_joined', (roomData) => {
  // Trigger SPA navigation to game page
  window.dispatchEvent(new CustomEvent('navigate-to-game', {
    detail: { roomId: roomData.roomId }
  }));
});
```

## Move Matching System

### Input Processing Flow

```ascii
CLI Input → Socket Event → Game Room → Game Engine → State Update → Broadcast

1. CLI sends input     2. Socket receives    3. Room queues input
   POST /api/cli/         'game_input'          handleInput()
   game/input             event
   
4. Engine processes    5. State updated      6. Broadcast to clients
   updatePaddles()        gameState.update()    'game_state' event
```

### Input Validation and Queuing

```typescript
// In RemoteGameRoom or GameRoom
handleInput(playerId: string, key: string, isKeyDown: boolean) {
  // Validate player is in this room
  if (!this.players.has(playerId)) return;
  
  // Validate key is allowed
  const allowedKeys = ['ArrowUp', 'ArrowDown', 'w', 's'];
  if (!allowedKeys.includes(key)) return;
  
  // Queue input for next game loop iteration
  this.inputQueue.push({
    playerId,
    key,
    isKeyDown,
    timestamp: Date.now()
  });
}
```

### Game Loop Integration

```typescript
// 60 FPS game loop processes inputs
gameLoop() {
  // Process all queued inputs
  while (this.inputQueue.length > 0) {
    const input = this.inputQueue.shift();
    this.applyInput(input);
  }
  
  // Update game physics
  this.engine.update(1/60);
  
  // Broadcast new state
  this.broadcastGameState();
  
  // Schedule next iteration
  setTimeout(() => this.gameLoop(), 1000/60);
}
```

## Functions Used in CLI System

### Authentication Functions

```typescript
// cliAuth.ts
export const authorizeCli = async (req, reply) => {
  // Verify normal access token
  // Validate socket connection
  // Issue CLI token
};

export const revokeCli = async (req, reply) => {
  // Accept CLI or normal token
  // Revoke CLI access
};

function verifyNormalAccessToken(req) {
  // Extract Bearer token
  // Verify JWT with ACCESS_TOKEN_SECRET
  // Return userId or null
}
```

### Token Management Functions

```typescript
// cliTokenStore.ts
class CliTokenStore {
  issue(userId, socketId, hours = 1) {
    // Generate unique JTI
    // Create JWT token
    // Store record in memory
    // Return token record
  }
  
  validate(token) {
    // Verify JWT signature
    // Check token type
    // Validate socket connection
    // Return record or null
  }
  
  revoke(userId) {
    // Remove token from memory store
  }
}
```

### Middleware Functions

```typescript
// cliMiddleware.ts
export function verifyCliToken(req, reply, done) {
  // Extract Authorization header
  // Validate CLI token
  // Check socket connection
  // Set req.cliUserId and req.cliSocketId
  // Continue or reject request
}
```

### Game Action Functions

```typescript
// cliGameActions.ts
export const getStatus = async (req, reply) => {
  // Get user activity status
  // Return current locks and state
};

export const startLocalGame = async (req, reply) => {
  // Create local game room
  // Emit socket event to start game
  // Return room information
};

export const sendGameInput = async (req, reply) => {
  // Find user's current room
  // Emit game input event
  // Return success status
};
```

## Error Handling and Edge Cases

### Token Expiration
```typescript
// Automatic cleanup on validation
if (Date.now() > rec.expiresAt) {
  this.byUser.delete(rec.userId);
  return null;
}
```

### Socket Disconnection
```typescript
// Validate socket still exists
const socket = io.sockets.sockets.get(rec.socketId);
if (!socket) {
  cliTokenStore.revoke(rec.userId);
  return reply.status(401).send({ message: 'login error' });
}
```

### Token Supersession
```typescript
// Only one CLI token per user
if (this.byUser.has(userId)) {
  this.byUser.delete(userId); // Remove old token
}
```

### Rate Limiting Considerations
- CLI tokens expire after 1 hour by default
- One token per user prevents token accumulation
- Socket binding prevents token sharing

This CLI system provides secure, temporary access for command-line interfaces while maintaining the real-time capabilities needed for game interactions.
