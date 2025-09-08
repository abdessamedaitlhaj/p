# Socket.IO Architecture and Communication Patterns

This document provides comprehensive coverage of the secure Socket.IO implementation, including authentication middleware, namespace isolation, event validation, rate limiting, and real-time communication patterns.

## Overview

The Pong platform uses a **secure Socket.IO architecture** for all real-time communication. The system implements comprehensive security measures including JWT authentication, namespace isolation, input validation, and rate limiting to ensure secure real-time interactions.

## 🔐 Security Implementation

### Socket Authentication Middleware (`server/middleware/socketAuth.ts`)

All socket connections are protected by JWT authentication middleware:

```typescript
export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  try {
    // Multiple token sources for flexibility
    let token = socket.handshake.auth?.accessToken 
      || socket.handshake.auth?.token 
      || socket.handshake.query?.accessToken;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, accessTokenSecret) as DecodedToken;
    
    // Attach authenticated user info to socket
    (socket as any).userId = String(decoded.UserInfo.id);
    (socket as any).userInfo = decoded.UserInfo;
    
    next();
  } catch (error) {
    return next(new Error('Authentication failed'));
  }
};
```

### Namespace Isolation (`server/socket/namespaces.ts`)

The system uses **separate namespaces** for different functionalities:

```typescript
export function createSocketNamespaces(app: FastifyInstance): SocketNamespaces {
  const chatNamespace = app.io.of('/chat');
  const gameNamespace = app.io.of('/game');
  const lobbyNamespace = app.io.of('/lobby');
  const tournamentNamespace = app.io.of('/tournament');

  // Authentication required for ALL namespaces
  chatNamespace.use(socketAuthMiddleware);
  gameNamespace.use(socketAuthMiddleware);
  lobbyNamespace.use(socketAuthMiddleware);
  tournamentNamespace.use(socketAuthMiddleware);

  return { chat: chatNamespace, game: gameNamespace, lobby: lobbyNamespace, tournament: tournamentNamespace };
}
```

## Socket.IO Setup and Configuration

### Server Setup (`server/index.ts`)

```typescript
// Secure Socket.IO integration with Fastify
await app.register(fastifySocketIO, {
  cors: { 
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:8080"], 
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

app.ready().then(() => {
  console.log("🎮 Secure Socket.IO server ready");
  
  // Create secure namespaces with authentication
  const namespaces = createSocketNamespaces(app);
  
  // Register secure event handlers
  registerSecureHandlers(app, namespaces);
});
```

### Secure Client Setup

```typescript
import io, { Socket } from 'socket.io-client';
import { useAuth } from '@/hooks/useAuth';

// Socket connection with JWT authentication
const { state } = useAuth();
const socket = io('http://localhost:3000/game', {
  auth: {
    accessToken: state.user?.accessToken // JWT token required
  },
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  transports: ['websocket', 'polling']
});
});

// Connection state management
socket.on('connect', () => {
  console.log('🔌 Connected to server');
  setIsConnected(true);
  
  // Auto-authenticate on connection
  if (user?.id) {
    socket.emit('join', user.id);
  }
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server');
  setIsConnected(false);
});
```

## Event Registration Architecture

### Central Handler Registration (`server/socket/registerHandlers.ts`)

```typescript
export function registerSocketHandlers(app: FastifyInstance) {
  // Shared state tracking
  const onlineUsers: string[] = [];
  const socketToUser = new Map<string, string>();         // socket.id -> userId
  const socketToRoom = new Map<string, string>();         // socket.id -> roomId
  const userConnectionCounts = new Map<string, number>(); // userId -> socket count
  const userInitialized = new Set<string>();             // userId -> initialized flag
  const matchmakingQueue: string[] = [];                  // Queue of socket IDs

  // Initialize activity manager
  activityManager.initialize(app.io);

  // Helper function for username lookup
  const getUsername = (userId: string) => new Promise<string>((resolve) => {
    db.get('SELECT username FROM users WHERE id = ?', [userId], (err: any, row: any) => 
      resolve(row?.username || userId)
    );
  });

  app.io.on('connection', (socket) => {
    console.log('🔌 New socket connection:', socket.id);
    
    // Register all event listeners
    registerAuthenticationEvents(socket);
    registerGameEvents(socket);
    registerMatchmakingEvents(socket);
    registerInviteEvents(socket);
    registerTournamentEvents(socket);
    registerChatEvents(socket);
    registerDisconnectionHandler(socket);
  });
}
```

### Event Categories and Handlers

```ascii
Socket.IO Event Architecture

┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Authentication    │    │    Game Events      │    │   Tournament        │
│                     │    │                     │    │                     │
│ • join              │    │ • join_game         │    │ • tournament_list   │
│ • logout            │    │ • leave_game        │    │ • tournament_create │
│ • user_online       │    │ • join_remote_room  │    │ • tournament_join   │
│ • user_offline      │    │ • remote_game_input │    │ • tournament_leave  │
│ • user_locked       │    │ • remote_start_game │    │ • match_invite_resp │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘

┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Matchmaking       │    │    Invite System    │    │    Chat System      │
│                     │    │                     │    │                     │
│ • matchmaking_join  │    │ • send_invite       │    │ • send_message      │
│ • matchmaking_leave │    │ • accept_invite     │    │ • receive_message   │
│ • matchmaking_status│    │ • decline_invite    │    │ • istyping          │
│ • matchmaking_error │    │ • receive_invite    │    │ • stop_typing       │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Authentication and User Management Events

### Connection and Authentication

```typescript
socket.on('join', async (rawUserId) => {
  const userId = String(rawUserId);
  
  // Join personal room for targeted messages
  socket.join(userId);
  socketToUser.set(socket.id, userId);
  
  // Update tournament socket tracking
  try { 
    tournamentManager.updatePlayerSocket(userId, socket.id); 
  } catch {}
  
  // Multi-tab connection tracking
  const prevCount = userConnectionCounts.get(userId) || 0;
  userConnectionCounts.set(userId, prevCount + 1);
  
  // First connection initialization
  if (!userInitialized.has(userId)) {
    try { 
      activityManager.resetLocksForUser(userId); 
    } catch {}
    userInitialized.add(userId);
  }
  
  // Update online status only for first connection
  if (prevCount === 0) {
    if (!onlineUsers.includes(userId)) onlineUsers.push(userId);
    
    try {
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
          ['online', new Date(), Number(userId)], 
          function (err) { if (err) reject(err); else resolve(); }
        );
      });
      
      // Broadcast user online to all clients
      app.io.emit('user_online', onlineUsers);
    } catch (e) { 
      console.error('online update failed', e); 
    }
  }
  
  // Send current activity lock state
  const lock = activityManager.isUserLocked(userId);
  if (lock.locked) {
    socket.emit('user_locked', { 
      reason: lock.reason, 
      inMatch: lock.reason === 'match' 
    });
  }
});

socket.on('disconnect', async () => {
  const userId = socketToUser.get(socket.id);
  
  if (userId) {
    // Decrement connection count
    const prev = userConnectionCounts.get(userId) || 1;
    const next = Math.max(0, prev - 1);
    userConnectionCounts.set(userId, next);
    
    // Mark offline only if last socket
    if (next === 0) {
      try {
        await new Promise<void>((resolve, reject) => {
          db.run(
            'UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
            ['offline', new Date(), userId], 
            function (err) { if (err) reject(err); else resolve(); }
          );
        });
        
        const idx = onlineUsers.indexOf(userId);
        if (idx !== -1) onlineUsers.splice(idx, 1);
        app.io.emit('user_offline', onlineUsers);
      } catch (e) { 
        console.error('offline update failed', e); 
      }
    }
    
    socketToUser.delete(socket.id);
  }
  
  // Cleanup room assignments
  const roomId = socketToRoom.get(socket.id);
  if (roomId) {
    if (roomId.startsWith('remote_')) {
      roomManager.deleteRemoteRoom(roomId);
    } else {
      roomManager.deleteRoom(roomId);
    }
    socketToRoom.delete(socket.id);
  }
  
  // Remove from matchmaking queue
  const idx = matchmakingQueue.indexOf(socket.id);
  if (idx !== -1) {
    matchmakingQueue.splice(idx, 1);
  }
  
  // Clean up tournament participation
  try { 
    tournamentManager.leaveAllBySocket(socket.id); 
  } catch {}
  
  // Best-effort unlock on disconnect
  if (userId) {
    activityManager.unlockUser(userId);
  }
});
```

### User Status Broadcasting

```typescript
// Real-time user status updates
app.io.emit('user_online', onlineUsers);
app.io.emit('user_offline', onlineUsers);

// Activity lock notifications
socket.emit('user_locked', { reason: 'match', inMatch: true });
socket.emit('user_unlocked');

// Multi-tab synchronization
app.io.to(userId).emit('activity_state_changed', lockState);
```

## Game Events and Room Management

### Local Game Events

```typescript
socket.on('join_game', (payload: { 
  settings?: any; 
  userId?: string; 
  clientRoomId?: string 
}) => {
  try {
    // Clean up existing local room
    const existingRoomId = socketToRoom.get(socket.id);
    if (existingRoomId && existingRoomId.startsWith('local_')) {
      roomManager.deleteRoom(existingRoomId);
      socket.leave(existingRoomId);
      socketToRoom.delete(socket.id);
    }
    
    // Parse settings
    const settingsPayload = payload?.settings;
    let settings: GameSettingsWithTheme;
    settings = typeof settingsPayload === 'string' 
      ? JSON.parse(settingsPayload) 
      : settingsPayload;
    
    if (!settings) {
      socket.emit('error', 'Invalid game settings');
      return;
    }
    
    // Create local room
    roomManager.createLocalRoom(socket, settings).then(roomId => {
      socketToRoom.set(socket.id, roomId);
      socket.emit('room_joined', { roomId });
    }).catch(e => {
      console.error('Failed to create local room:', e);
      socket.emit('error', 'Failed to create game room');
    });
    
  } catch (e) {
    console.error('join_game error:', e);
    socket.emit('error', 'Failed to create game room');
  }
});

socket.on('leave_game', (payload?: { roomId?: string }) => {
  const mappedRoomId = socketToRoom.get(socket.id);
  const targetRoomId = payload?.roomId || mappedRoomId;
  
  if (!targetRoomId) return;
  
  console.log('[leave_game] request', {
    socket: socket.id,
    mappedRoomId,
    targetRoomId,
    reason: 'client_initiated'
  });
  
  try {
    // Handle different room types
    if (targetRoomId.startsWith('remote_')) {
      const remoteRoom = roomManager.getRemoteRoom(targetRoomId);
      if (remoteRoom) {
        remoteRoom.onPlayerExit?.(socket.id);
        // Delayed cleanup for final state broadcast
        setTimeout(() => roomManager.deleteRemoteRoom(targetRoomId), 1200);
      } else {
        roomManager.deleteRemoteRoom(targetRoomId);
      }
    } else {
      roomManager.deleteRoom(targetRoomId);
    }
  } finally {
    socket.leave(targetRoomId);
    if (mappedRoomId === targetRoomId) {
      socketToRoom.delete(socket.id);
    }
    
    // Clear match lock
    const userId = socketToUser.get(socket.id);
    if (userId) {
      activityManager.unlockUser(userId);
    }
  }
});
```

### Remote Game Events

```typescript
socket.on('join_remote_room', (p: { roomId: string; playerId: 'p1'|'p2' }) => {
  console.log(`[join_remote_room] Request for room ${p?.roomId} as player ${p?.playerId}`);
  
  if (!p?.roomId || !p?.playerId) {
    return socket.emit('remote_room_error', 'Invalid join payload');
  }
  
  const userId = socketToUser.get(socket.id);
  if (!userId) {
    return socket.emit('remote_room_error', 'Not authenticated');
  }
  
  // Prevent joining multiple remote rooms
  const existingRoomId = socketToRoom.get(socket.id);
  if (existingRoomId && existingRoomId.startsWith('remote_') && existingRoomId !== p.roomId) {
    console.log(`[join_remote_room] User ${userId} already in room ${existingRoomId}`);
    return socket.emit('remote_room_error', 'Already in another remote game');
  }
  
  const room = roomManager.getRemoteRoom(p.roomId);
  if (!room) {
    console.log(`[join_remote_room] Room ${p.roomId} not found`);
    return socket.emit('remote_room_error', 'Room not found');
  }
  
  // Verify user authorization
  const roomP1Id = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
  const roomP2Id = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
  const userIdStr = String(userId);
  
  if (p.playerId === 'p1' && String(roomP1Id) !== userIdStr) {
    console.log(`[join_remote_room] User ${userId} not authorized for p1 in room ${p.roomId}`);
    return socket.emit('remote_room_error', 'Not authorized for this position');
  }
  
  if (p.playerId === 'p2' && String(roomP2Id) !== userIdStr) {
    console.log(`[join_remote_room] User ${userId} not authorized for p2 in room ${p.roomId}`);
    return socket.emit('remote_room_error', 'Not authorized for this position');
  }
  
  // DUPLICATE TAB PROTECTION
  const userSockets = Array.from(socketToUser.entries())
    .filter(([_, uId]) => uId === userId)
    .map(([socketId, _]) => socketId);
  
  const otherSocketsInRoom = userSockets.filter(sId => {
    const roomId = socketToRoom.get(sId);
    return sId !== socket.id && roomId === p.roomId;
  });
  
  if (otherSocketsInRoom.length > 0) {
    console.log(`[join_remote_room] DUPLICATE TAB DETECTED: User ${userId} already has socket ${otherSocketsInRoom[0]} in room ${p.roomId}`);
    return socket.emit('remote_room_error', 'Game room is already in use from another connection. Please close other tabs.');
  }
  
  console.log(`[join_remote_room] Room ${p.roomId} found, attempting to join as ${p.playerId}`);
  
  try {
    // Update socket reference in room
    if (p.playerId === 'p1') {
      (room as any).player1 = socket;
    } else {
      (room as any).player2 = socket;
    }
    
    socketToRoom.set(socket.id, p.roomId);
    socket.join(p.roomId);
    socket.emit('remote_room_joined_success');
    
    console.log(`[join_remote_room] Successfully joined ${p.roomId} as ${p.playerId}`);
    
    // Send current game state
    try {
      const state = room.state;
      socket.emit('remote_game_state', state);
    } catch {}
    
  } catch (e) {
    console.error(`[join_remote_room] Error joining room ${p.roomId}:`, e);
    socket.emit('remote_room_error', 'Failed to join remote room');
  }
});
```

## Matchmaking System Events

### Queue Management

```typescript
socket.on('matchmaking_join', async (payload?: { settings?: any }) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) {
    socket.emit('matchmaking_error', 'Not authenticated');
    return;
  }
  
  // Prevent joining if locked by activity
  const currentLock = activityManager.isUserLocked(userId);
  if (currentLock.reason === 'match') {
    socket.emit('matchmaking_error', 'Already in a match');
    return;
  }
  
  if (activityManager.isUserLocked(userId).locked) {
    socket.emit('matchmaking_error', 'Locked by activity');
    return;
  }
  
  if (socketToRoom.get(socket.id)) {
    socket.emit('matchmaking_error', 'Already in a room');
    return;
  }
  
  console.log(`[MM] matchmaking_join from socket ${socket.id} (user ${userId})`);
  
  // Add to queue
  if (!matchmakingQueue.includes(socket.id)) {
    matchmakingQueue.push(socket.id);
    socket.emit('matchmaking_status', { status: 'queued' });
    console.log(`[MM] Added socket ${socket.id} to queue. New queue: [${matchmakingQueue.join(', ')}]`);
    
    // Set 30 second timeout
    const timeout = setTimeout(() => {
      const idx = matchmakingQueue.indexOf(socket.id);
      if (idx !== -1) {
        matchmakingQueue.splice(idx, 1);
        socket.emit('matchmaking_timeout');
      }
    }, 30000);
    
    // Store timeout for cleanup
    (socket as any).data = (socket as any).data || {};
    (socket as any).data.mmTimeout = timeout;
  }
  
  // Process queue for pairing
  while (matchmakingQueue.length >= 2) {
    console.log('[MM] Attempting pairing. Queue snapshot:', [...matchmakingQueue]);
    
    const s1Id = matchmakingQueue.shift()!;
    const s2Id = matchmakingQueue.shift()!;
    
    const s1 = app.io.sockets.sockets.get(s1Id);
    const s2 = app.io.sockets.sockets.get(s2Id);
    
    // Validate sockets still connected
    if (!s1 || !s2) {
      if (s1 && !matchmakingQueue.includes(s1.id)) matchmakingQueue.unshift(s1.id);
      if (s2 && !matchmakingQueue.includes(s2.id)) matchmakingQueue.unshift(s2.id);
      break;
    }
    
    // Clear timeouts
    if ((s1 as any)?.data?.mmTimeout) clearTimeout((s1 as any).data.mmTimeout);
    if ((s2 as any)?.data?.mmTimeout) clearTimeout((s2 as any).data.mmTimeout);
    
    const p1Id = socketToUser.get(s1.id)!;
    const p2Id = socketToUser.get(s2.id)!;
    
    // Prevent self-matching
    if (p1Id === p2Id) {
      if (!matchmakingQueue.includes(s2.id)) matchmakingQueue.unshift(s2.id);
      continue;
    }
    
    try {
      // Get display names
      const [p1Name, p2Name] = await Promise.all([
        getUsername(p1Id), 
        getUsername(p2Id)
      ]);
      
      // Create remote room with matchmaking type
      const roomId = roomManager.createRemoteGameRoom(
        s1, s2, p1Id, p2Id, 
        undefined, 
        { matchType: 'matchmaking' }
      );
      
      console.log(`[MM] Paired sockets ${s1.id} (${p1Id}) vs ${s2.id} (${p2Id}) -> room ${roomId}`);
      
      // Track assignments
      socketToRoom.set(s1.id, roomId);
      socketToRoom.set(s2.id, roomId);
      
      // Lock both users for the match
      activityManager.lockForMatch(p1Id, p2Id);
      
      // Notify both players
      s1.emit('remote_room_joined', {
        roomId,
        playerId: 'p1',
        matchType: 'matchmaking',
        p1Name,
        p2Name,
        p1Id,
        p2Id
      });
      
      s2.emit('remote_room_joined', {
        roomId,
        playerId: 'p2',
        matchType: 'matchmaking',
        p1Name,
        p2Name,
        p1Id,
        p2Id
      });
      
    } catch (e) {
      console.error('[MM] Pairing failed', e);
      s1.emit('matchmaking_error', 'Failed');
      s2.emit('matchmaking_error', 'Failed');
    }
  }
});

socket.on('matchmaking_leave', () => {
  const idx = matchmakingQueue.indexOf(socket.id);
  if (idx !== -1) {
    matchmakingQueue.splice(idx, 1);
  }
  
  // Clear timeout
  if ((socket as any).data?.mmTimeout) {
    clearTimeout((socket as any).data.mmTimeout);
    (socket as any).data.mmTimeout = undefined;
  }
  
  socket.emit('matchmaking_status', { status: 'left' });
});
```

## Invite System Events

### Sending and Managing Invites

```typescript
socket.on('send_invite', async (selectedUser) => {
  const inviterId = socketToUser.get(socket.id);
  if (!inviterId) {
    socket.emit('error', 'Authentication error');
    return;
  }
  
  // Prevent inviting while busy
  const currentLock = activityManager.isUserLocked(inviterId);
  if (currentLock.reason === 'match') {
    socket.emit('error', 'Already in a match');
    return;
  }
  
  if (activityManager.isUserBusyForInvite(inviterId)) {
    socket.emit('error', 'Already handling an invite or busy');
    return;
  }
  
  if (inviterId === String(selectedUser.id)) {
    socket.emit('error', 'Cannot invite yourself');
    return;
  }
  
  const targetId = String(selectedUser.id);
  
  // Check target availability
  if (activityManager.isUserBusyForInvite(targetId)) {
    socket.emit('error', 'User is busy');
    return;
  }
  
  try {
    // Get inviter information
    const inviterInfo = await new Promise<any>((resolve, reject) => {
      db.get(
        'SELECT id, username, email, avatarurl FROM users WHERE id = ?', 
        [inviterId], 
        (err, row) => err ? reject(err) : resolve(row)
      );
    });
    
    if (!inviterInfo) {
      socket.emit('error', 'User not found');
      return;
    }
    
    // Generate invite ID and set pending state
    const inviteId = `${inviterId}-${targetId}-${Date.now()}`;
    activityManager.setPendingInvite(inviterId, targetId, inviteId);
    
    // Find target sockets
    const sockets = await app.io.in(targetId).fetchSockets();
    if (!sockets.length) {
      socket.emit('error', 'User not online');
      activityManager.clearPendingInvite(inviterId, targetId);
      return;
    }
    
    // Send invite to all target sockets
    for (const s of sockets) {
      s.emit('receive_invite', {
        inviter: inviterInfo,
        inviterId,
        inviteId
      });
    }
    
    // Confirm to sender
    app.io.to(inviterId).emit('invite_sent', { to: targetId, inviteId });
    
  } catch (e) {
    socket.emit('error', 'Failed to send invite');
  }
});

socket.on('accept_invite', async (payload: { inviterId: string; inviteId?: string }) => {
  const accepterId = socketToUser.get(socket.id);
  if (!accepterId) {
    socket.emit('error', 'Not authenticated');
    return;
  }
  
  // Prevent accepting if already in match
  if (activityManager.isUserLocked(accepterId).reason === 'match') {
    socket.emit('error', 'Already in a match');
    return;
  }
  
  const inviterSocketId = Array.from(socketToUser.entries())
    .find(([_, uid]) => uid === payload.inviterId)?.[0];
  
  if (!inviterSocketId) {
    socket.emit('error', 'Inviter not online');
    return;
  }
  
  const inviterSocket = app.io.sockets.sockets.get(inviterSocketId);
  if (!inviterSocket) {
    socket.emit('error', 'Inviter socket missing');
    return;
  }
  
  // Validate pending invite state
  const inviterState: any = activityManager.getLockState(payload.inviterId);
  const accepterState: any = activityManager.getLockState(accepterId);
  
  if (!inviterState.pendingInviteId || inviterState.pendingInviteId !== accepterState.pendingInviteId) {
    socket.emit('error', 'No matching invite');
    return;
  }
  
  const inviteId = inviterState.pendingInviteId;
  
  // Prevent duplicate room creation
  if (socketToRoom.get(inviterSocketId) || socketToRoom.get(socket.id)) {
    console.warn('[INVITE] Duplicate accept_invite ignored; one or both players already in room');
    return;
  }
  
  try {
    // Create remote game room
    const roomId = roomManager.createRemoteGameRoom(
      inviterSocket, socket, payload.inviterId, accepterId
    );
    
    socketToRoom.set(inviterSocketId, roomId);
    socketToRoom.set(socket.id, roomId);
    
    // Get display names
    const [p1Name, p2Name] = await Promise.all([
      getUsername(payload.inviterId),
      getUsername(accepterId)
    ]);
    
    // Transition from invite to match
    activityManager.clearPendingInvite(payload.inviterId, accepterId);
    activityManager.lockForMatch(payload.inviterId, accepterId);
    
    // Notify both players
    inviterSocket.emit('remote_room_joined', {
      roomId,
      playerId: 'p1',
      p1Name,
      p2Name,
      matchType: 'remote',
      p1Id: payload.inviterId,
      p2Id: accepterId
    });
    
    socket.emit('remote_room_joined', {
      roomId,
      playerId: 'p2',
      p1Name,
      p2Name,
      matchType: 'remote',
      p1Id: payload.inviterId,
      p2Id: accepterId
    });
    
    // Notify about invite consumption
    app.io.to(payload.inviterId).emit('invite_consumed', { by: accepterId, inviteId });
    app.io.to(accepterId).emit('invite_consumed', { inviterId: payload.inviterId, inviteId });
    
  } catch (e) {
    socket.emit('error', 'Failed to create game');
    inviterSocket.emit('error', 'Failed to create game');
  }
});

socket.on('decline_invite', (payload: { inviterId: string; inviteId?: string }) => {
  const inviterSocketId = Array.from(socketToUser.entries())
    .find(([_, uid]) => uid === payload.inviterId)?.[0];
  
  if (inviterSocketId) {
    app.io.sockets.sockets.get(inviterSocketId)?.emit('invite_declined', {
      declinerId: socketToUser.get(socket.id)
    });
  }
  
  const declinerId = socketToUser.get(socket.id);
  if (declinerId) {
    // Capture invite ID before clearing
    const inviterState: any = activityManager.getLockState(payload.inviterId);
    const inviteId = inviterState?.pendingInviteId;
    
    activityManager.clearPendingInvite(payload.inviterId, declinerId);
    
    app.io.to(payload.inviterId).emit('invite_cleared', { inviteId });
    app.io.to(declinerId).emit('invite_cleared', { inviteId });
  }
});
```

## Tournament Events

### Tournament Management

```typescript
socket.on('tournament_list', () => {
  socket.emit('tournament_list', tournamentManager.listAvailable());
  try {
    socket.emit('tournament_completed_list', tournamentManager.listCompleted());
  } catch {}
});

socket.on('tournament_create', (p: { name: string; startsInMinutes: number }) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) {
    return socket.emit('tournament_error', 'Not authenticated');
  }
  
  if (activityManager.isUserLocked(userId).locked) {
    return socket.emit('tournament_error', 'User locked by activity');
  }
  
  try {
    const t = tournamentManager.create(p.name, userId, socket, p.startsInMinutes);
    socket.emit('tournament_created', t);
  } catch (e) {
    socket.emit('tournament_error', (e as Error).message || 'Create failed');
  }
});

socket.on('tournament_join', (p: { id: string }) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) {
    return socket.emit('tournament_error', 'Not authenticated');
  }
  
  if (activityManager.isUserLocked(userId).locked) {
    return socket.emit('tournament_error', 'User locked by activity');
  }
  
  try {
    const t = tournamentManager.join(p.id, userId, socket);
    socket.emit('tournament_joined', t);
  } catch (e) {
    socket.emit('tournament_error', (e as Error).message);
  }
});

socket.on('tournament_leave', (p: { id: string }) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) {
    return socket.emit('tournament_error', 'Not authenticated');
  }
  
  try {
    const t = tournamentManager.leaveByUser(p.id, userId);
    
    // Unlock if no longer active in any tournament
    if (!tournamentManager.isUserActive(userId)) {
      activityManager.setTournamentLock(userId, false);
    }
    
    socket.emit('tournament_left', t);
  } catch (e) {
    socket.emit('tournament_error', (e as Error).message);
  }
});

socket.on('tournament_match_invite_response', (p: {
  tournamentId: string;
  matchKey: 'semi1'|'semi2'|'final';
  response: 'accept'|'decline'
}) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) return;
  
  try {
    tournamentManager.respondToMatchInvite(app.io, p.tournamentId, p.matchKey, userId, p.response);
  } catch {}
});
```

## Chat System Events

### Real-time Messaging

```typescript
socket.on('send_message', async (payload) => {
  const senderId = String(payload.sender_id);
  const receiverId = String(payload.receiver_id);
  const timestamp = new Date().toISOString();
  
  // Save to database
  try {
    const { createMessage } = await import('../models/Message');
    await createMessage({
      sender_id: Number(senderId),
      receiver_id: Number(receiverId),
      text: payload.text
    });
  } catch (e) {
    console.error('save message failed', e);
  }
  
  // Enrich message with timestamp
  const enriched = { ...payload, timestamp };
  
  // Send to both sender and receiver rooms
  app.io.to(senderId).emit('receive_message', enriched);
  app.io.to(receiverId).emit('receive_message', enriched);
});

socket.on('istyping', (rid) => {
  app.io.to(String(rid)).emit('typing');
});

socket.on('stop_typing', (rid) => {
  app.io.to(String(rid)).emit('stop_typing');
});
```

## Room-Based Communication Patterns

### Personal Rooms for Targeted Messages

```typescript
// Each user automatically joins their personal room
socket.join(userId);

// Send messages to specific user (all their tabs)
app.io.to(userId).emit('user_locked', lockState);
app.io.to(userId).emit('tournament_joined', tournamentData);
app.io.to(userId).emit('receive_invite', inviteData);

// Broadcast to all users except sender
socket.broadcast.emit('user_online', { userId });
socket.broadcast.emit('user_offline', { userId });
```

### Game Room Communication

```typescript
// Join game-specific room
socket.join(`game_${roomId}`);
socket.join(`remote_${roomId}`);

// Broadcast to room participants
app.io.to(roomId).emit('remote_game_state', gameState);
app.io.to(roomId).emit('remote_game_over', gameResult);

// Leave room on game end
socket.leave(roomId);
```

### Tournament Communication

```typescript
// Tournament-wide broadcasts
tournamentManager.broadcast(io, tournament, 'tournament_updated', data);
tournamentManager.broadcast(io, tournament, 'tournament_started', bracketData);

// Match-specific invites
p1Socket.emit('tournament_match_invite', {
  tournamentId: tournament.id,
  matchKey: 'semi1',
  opponent: p2Name,
  expiresAt: Date.now() + 30000
});
```

## Multi-Tab Coordination

### Connection State Tracking

```typescript
// Track multiple sockets per user
const userConnectionCounts = new Map<string, number>();

// On connection
const prevCount = userConnectionCounts.get(userId) || 0;
userConnectionCounts.set(userId, prevCount + 1);

// Only transition to online on first connection
if (prevCount === 0) {
  updateUserStatus(userId, 'online');
  app.io.emit('user_online', onlineUsers);
}

// On disconnection
const next = Math.max(0, prev - 1);
userConnectionCounts.set(userId, next);

// Only mark offline when last socket disconnects
if (next === 0) {
  updateUserStatus(userId, 'offline');
  app.io.emit('user_offline', onlineUsers);
}
```

### Activity State Synchronization

```typescript
// Broadcast lock state to all user's tabs
app.io.to(userId).emit('user_locked', {
  reason: 'match',
  inMatch: true,
  lockDetails: activityManager.getLockState(userId)
});

// Prevent duplicate tab actions
const userSockets = Array.from(socketToUser.entries())
  .filter(([_, uId]) => uId === userId)
  .map(([socketId, _]) => socketId);

const otherSocketsInRoom = userSockets.filter(sId => {
  const roomId = socketToRoom.get(sId);
  return sId !== socket.id && roomId === targetRoomId;
});

if (otherSocketsInRoom.length > 0) {
  return socket.emit('remote_room_error', 
    'Game room is already in use from another connection'
  );
}
```

## Error Handling and Recovery

### Connection Error Handling

```typescript
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
  
  // Exponential backoff for reconnection
  setTimeout(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, Math.min(1000 * Math.pow(2, reconnectAttempts), 30000));
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
  
  // Re-authenticate on reconnection
  if (user?.id) {
    socket.emit('join', user.id);
  }
  
  // Re-join game room if applicable
  const gameState = getGameState();
  if (gameState.roomId) {
    socket.emit('join_remote_room', {
      roomId: gameState.roomId,
      playerId: gameState.playerId
    });
  }
});
```

### Event Error Handling

```typescript
// Validation and error responses
socket.on('matchmaking_join', async () => {
  const userId = socketToUser.get(socket.id);
  
  if (!userId) {
    socket.emit('matchmaking_error', 'Not authenticated');
    return;
  }
  
  if (activityManager.isUserLocked(userId).locked) {
    socket.emit('matchmaking_error', 'Locked by activity');
    return;
  }
  
  // ... proceed with matchmaking logic
});

// Graceful degradation for failed operations
try {
  const roomId = roomManager.createRemoteGameRoom(/* ... */);
  socket.emit('remote_room_joined', { roomId });
} catch (e) {
  console.error('Failed to create remote room:', e);
  socket.emit('error', 'Failed to create game');
  
  // Clean up any partial state
  activityManager.unlockUser(userId);
}
```

### State Recovery Patterns

```typescript
// On socket reconnection, send current state
socket.on('join', async (userId) => {
  // ... authentication logic ...
  
  // Send current activity lock state
  const lock = activityManager.isUserLocked(userId);
  if (lock.locked) {
    socket.emit('user_locked', {
      reason: lock.reason,
      inMatch: lock.reason === 'match'
    });
  }
  
  // Send current tournament state if participating
  const activeTournaments = tournamentManager.listActiveForUser(userId);
  for (const tournament of activeTournaments) {
    socket.emit('tournament_state_recovery', tournament);
  }
});

// On remote room rejoin, send current game state
socket.on('join_remote_room', ({ roomId, playerId }) => {
  // ... validation logic ...
  
  try {
    const state = room.state;
    socket.emit('remote_game_state', state);
  } catch {}
});
```

## Performance Optimization

### Event Debouncing

```typescript
// Debounce rapid fire events
const eventDebounce = new Map<string, NodeJS.Timeout>();

socket.on('game_input', (input) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) return;
  
  // Clear previous timeout
  const existingTimeout = eventDebounce.get(userId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Process immediately but prevent spam
  processGameInput(input);
  
  // Set cooldown
  eventDebounce.set(userId, setTimeout(() => {
    eventDebounce.delete(userId);
  }, 16)); // ~60 FPS limit
});
```

### Selective Broadcasting

```typescript
// Only broadcast to relevant sockets
function broadcastToTournamentParticipants(tournament: Tournament, event: string, data: any) {
  for (const playerId of tournament.players) {
    // Only send to online participants
    const sockets = app.io.sockets.adapter.rooms.get(playerId);
    if (sockets && sockets.size > 0) {
      app.io.to(playerId).emit(event, data);
    }
  }
}

// Batch similar events
const pendingBroadcasts = new Map<string, any[]>();

function queueBroadcast(event: string, data: any) {
  if (!pendingBroadcasts.has(event)) {
    pendingBroadcasts.set(event, []);
    
    // Process queue on next tick
    process.nextTick(() => {
      const items = pendingBroadcasts.get(event) || [];
      pendingBroadcasts.delete(event);
      
      if (items.length > 0) {
        app.io.emit(event, items);
      }
    });
  }
  
  pendingBroadcasts.get(event)!.push(data);
}
```

## Summary

The Socket.IO architecture provides comprehensive real-time communication supporting:

- **Authentication Flow**: Multi-tab user management with connection state tracking
- **Game Coordination**: Local and remote game room management with state synchronization
- **Matchmaking System**: Queue-based automatic pairing with timeout handling
- **Invite System**: Direct player invitations with expiry and state management
- **Tournament Flow**: Real-time bracket progression with match invitations
- **Chat System**: Real-time messaging with typing indicators
- **Activity Management**: Cross-tab activity lock synchronization
- **Error Recovery**: Graceful handling of disconnections and state recovery
- **Performance**: Event debouncing, selective broadcasting, and connection optimization

The system ensures consistent real-time state across multiple browser tabs while maintaining proper error handling and recovery mechanisms for a seamless multiplayer experience.
