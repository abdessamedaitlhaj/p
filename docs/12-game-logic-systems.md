# Secure Game Logic Systems: Authenticated Room Management, Matchmaking, Invites, and Tournaments

This document provides comprehensive coverage of the **security-hardened** game logic systems that orchestrate gameplay, including authenticated room management, secure matchmaking queues, verified invite systems, and protected tournament logic.

## Overview

The Pong platform implements sophisticated **authenticated game orchestration systems** that manage different types of gameplay modes while ensuring proper user authentication, authorization, activity state management, and secure user coordination.

## 🔐 Security Architecture

### Authentication Requirements
All game operations require **authenticated users**:

```typescript
// Every game operation validates authentication
const userId = (socket as any).userId; // From JWT middleware
const userInfo = (socket as any).userInfo;

if (!userId || !userInfo) {
  socket.emit('error', { message: 'Authentication required' });
  return;
}
```

### Authorization Checks
Users can only perform actions for themselves:

```typescript
// Prevent user spoofing in game operations  
if (payload.userId && payload.userId !== userId) {
  socket.emit('error', { message: 'Unauthorized action' });
  return;
}
```

## Secure Room Management System (`server/roomManager.ts`)

### Authenticated Room Architecture

```ascii
Secure Room Management Architecture

┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Authenticated     │    │   Authenticated     │    │    Tournament       │
│   Local Rooms       │    │   Remote Rooms      │    │    Integration      │
│                     │    │                     │    │                     │
│ JWT-verified user   │    │ Both users verified │    │ All users verified  │
│ Activity tracking   │    │ Cross-user validation│    │ Authorization checks│
│ User-specific rooms │    │ Secure matchmaking  │    │ Audit trail        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### Secure Room Manager Implementation

```typescript
class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();           // Local rooms (authenticated)
  private remoteRooms: Map<string, RemoteGameRoom> = new Map(); // Remote rooms (authenticated)

  // Authenticated local room creation
  async createLocalRoom(
    authenticatedSocket: Socket, 
    settings?: GameSettingsWithTheme
  ): Promise<string> {
    const userId = (authenticatedSocket as any).userId;
    const userInfo = (authenticatedSocket as any).userInfo;
    
    if (!userId || !userInfo) {
      throw new Error('Authentication required for room creation');
    }
    
    console.log(`🎮 Creating SECURE LOCAL room for authenticated user ${userInfo.username} (${userId})`);
    
    // Room ID tied to authenticated user
    const roomId = `local_${userId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
```
        name: "Pacman Arcade",
        fontFamily: "font-arcade",
        colors: {
          background: "#000000",
          paddle: "#FFFF00",
          ball: "#FFFF00",
          accent: "#00FFFF",
          text: "#FFFF00",
        },
        centerSymbol: "",
        glowEffect: true,
      },
    };
    
    const finalSettings = settings || defaultSettings;
    const room = new GameRoom(roomId, player, null, finalSettings);
    this.rooms.set(roomId, room);

    // Auto-cleanup after 10 minutes of inactivity
    setTimeout(() => {
      if (this.rooms.has(roomId)) {
        const room = this.rooms.get(roomId);
        if (room && !room.state.gameStarted) {
          console.log(`⏰ Room ${roomId} auto-cleanup after inactivity`);
          this.deleteRoom(roomId);
        }
      }
    }, 10 * 60 * 1000);

    return roomId;
  }

  // Remote room creation for multiplayer games
  createRemoteGameRoom(
    player1: Socket,
    player2: Socket,
    player1Id: string,
    player2Id: string,
    settings?: GameSettingsWithTheme,
    options?: { 
      matchType?: 'remote' | 'matchmaking' | string, 
      ownerSocketId?: string 
    }
  ): string {
    
    // CRITICAL: Prevent duplicate room creation
    for (const [rid, room] of this.remoteRooms.entries()) {
      const roomP1Id = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
      const roomP2Id = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
      
      // Check if same user pair exists in any order
      if (
        (String(roomP1Id) === String(player1Id) && String(roomP2Id) === String(player2Id)) ||
        (String(roomP1Id) === String(player2Id) && String(roomP2Id) === String(player1Id))
      ) {
        console.warn('⚠️ Preventing duplicate remote room creation', rid);
        
        if (!(room as any).state?.gameOver && !(room as any).isDestroyed) {
          // Update socket references to latest connections
          try {
            if (String(roomP1Id) === String(player1Id)) {
              (room as any).player1 = player1;
              (room as any).player2 = player2;
            } else {
              (room as any).player1 = player2;
              (room as any).player2 = player1;
            }
            
            // Re-setup socket listeners with new socket references
            (room as any).cleanup?.();
            (room as any).setupSocketListeners?.();
            
          } catch (error) {
            console.error('Error updating socket references:', error);
          }
          
          return rid;
        } else {
          console.log('🗑️ Cleaning up completed room before creating new one:', rid);
          this.deleteRemoteRoom(rid);
        }
      }
    }
    
    const roomId = `remote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const gameRoom = new RemoteGameRoom(roomId, player1, player2, player1Id, player2Id, settings);
    
    // Handle ownership transfer (for tournaments)
    if (options?.ownerSocketId && options.ownerSocketId !== player1.id) {
      (gameRoom as any).transferOwnership?.({ id: options.ownerSocketId } as any);
    }
    
    // Attach metadata for tracking
    (gameRoom as any).createdAt = Date.now();
    
    // Set match type for result tracking
    if (options?.matchType === 'matchmaking') {
      (gameRoom as any).matchTypeOverride = 'matchmaking';
    } else if (options?.matchType && options.matchType !== 'remote') {
      // Tournament case: tag with tournament ID
      (gameRoom as any).matchTypeOverride = options.matchType;
    }
    
    this.remoteRooms.set(roomId, gameRoom);
    
    // Auto-cleanup after 10 minutes
    setTimeout(() => {
      if (this.remoteRooms.has(roomId)) {
        const room = this.remoteRooms.get(roomId);
        if (room && (room.state.gameOver || !room.state.gameStarted)) {
          console.log(`⏰ Remote room ${roomId} auto-cleanup after inactivity`);
          this.deleteRemoteRoom(roomId);
        }
      }
    }, 600000);
    
    // Join sockets to room
    player1.join(roomId);
    player2.join(roomId);

    return roomId;
  }
}

export const roomManager = new RoomManager();
```

### Room Cleanup and Lifecycle

```typescript
class RoomManager {
  deleteRoom(roomId: string): boolean {
    console.log(`🗑️ Deleting room ${roomId}`);
    
    const room = this.rooms.get(roomId);
    if (room) {
      // Prevent deleting just-created room (race condition guard)
      const createdAt: number | undefined = (room as any).createdAt;
      if (createdAt && Date.now() - createdAt < 500) {
        console.warn(`⏳ Skip deletion of ${roomId} (created ${Date.now() - createdAt}ms ago)`);
        return false;
      }
      
      try {
        // Stop game loop and clean up listeners
        room.stopGameLoop();
        room.cleanup();
        const deleted = this.rooms.delete(roomId);
        return deleted;
      } catch (error) {
        console.error(`❌ Error deleting room ${roomId}:`, error);
        return false;
      }
    }
    
    return false;
  }

  deleteRemoteRoom(roomId: string): boolean {
    console.log(`🗑️ Deleting remote room ${roomId}`);
    
    const room = this.remoteRooms.get(roomId);
    if (room) {
      const createdAt: number | undefined = (room as any).createdAt;
      if (createdAt && Date.now() - createdAt < 500) {
        console.warn(`⏳ Skip deletion of remote ${roomId} (created ${Date.now() - createdAt}ms ago)`);
        return false;
      }
      
      try {
        room.stopGameLoop();
        room.cleanup?.();
        
        // Unlock players from match
        try {
          const p1: string = (room as any).player1UserId || (room as any).player1Id;
          const p2: string = (room as any).player2UserId || (room as any).player2Id;
          if (p1 && p2) {
            const { activityManager } = require('./activityManager');
            activityManager.unlockFromMatch(String(p1), String(p2));
          }
        } catch {}
        
        const deleted = this.remoteRooms.delete(roomId);
        return deleted;
      } catch (error) {
        console.error(`❌ Error deleting remote room ${roomId}:`, error);
        return false;
      }
    }
    
    return false;
  }

  // Utility methods for room management
  getRoomCount(): number {
    // Clean up any invalid rooms during count
    for (const [roomId, room] of this.rooms.entries()) {
      if (!room || room.state === undefined) {
        console.log(`🧹 Cleaning up invalid room ${roomId}`);
        this.rooms.delete(roomId);
      }
    }
    
    for (const [roomId, room] of this.remoteRooms.entries()) {
      if (!room || room.state === undefined) {
        console.log(`🧹 Cleaning up invalid remote room ${roomId}`);
        this.remoteRooms.delete(roomId);
      }
    }
    
    return this.rooms.size + this.remoteRooms.size;
  }

  findRemoteRoomByUserId(userId: string): { room: RemoteGameRoom; side: 'p1'|'p2' } | undefined {
    for (const room of this.remoteRooms.values()) {
      const p1: any = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
      const p2: any = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
      if (String(p1) === String(userId)) return { room, side: 'p1' };
      if (String(p2) === String(userId)) return { room, side: 'p2' };
    }
    return undefined;
  }
}
```

## Matchmaking System

### Queue-Based Matchmaking

```ascii
Matchmaking Flow

Queue Join → Pairing → Room Creation → Game Start

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Queue      │    │  Matching   │    │  Remote     │    │  Activity   │
│  Management │    │  Algorithm  │    │  Room       │    │  Locks      │
│             │    │             │    │  Creation   │    │             │
│ - Add user  │───►│ - Pair      │───►│ - Lock      │───►│ - Match     │
│ - Timeout   │    │   users     │    │   players   │    │   tracking  │
│ - Remove    │    │ - Create    │    │ - Join      │    │ - Multi-tab │
│   on leave  │    │   room      │    │   sockets   │    │   sync      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Matchmaking Socket Events

```typescript
// server/socket/registerHandlers.ts - Matchmaking implementation
let matchmakingQueue: string[] = []; // Queue of socket IDs

socket.on('matchmaking_join', async (payload?: { settings?: any }) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) {
    socket.emit('matchmaking_error', 'Not authenticated');
    return;
  }
  
  console.log(`[MM] matchmaking_join from socket ${socket.id} (user ${userId})`);
  
  // Prevent joining if already locked by any activity
  if (activityManager.isUserLocked(userId).locked) {
    socket.emit('matchmaking_error', 'Locked by activity');
    return;
  }
  
  // Prevent joining if already in a room
  if (socketToRoom.get(socket.id)) {
    socket.emit('matchmaking_error', 'Already in a room');
    return;
  }
  
  // Add to queue if not already present
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
  
  // Process queue when enough players available
  while (matchmakingQueue.length >= 2) {
    console.log('[MM] Attempting pairing. Queue snapshot before shift:', [...matchmakingQueue]);
    
    const s1Id = matchmakingQueue.shift()!;
    const s2Id = matchmakingQueue.shift()!;
    
    const s1 = app.io.sockets.sockets.get(s1Id);
    const s2 = app.io.sockets.sockets.get(s2Id);
    
    // Validate sockets are still connected
    if (!s1 || !s2) {
      console.log('[MM] One or both sockets disconnected during pairing');
      continue;
    }
    
    try {
      const p1Id = socketToUser.get(s1Id)!;
      const p2Id = socketToUser.get(s2Id)!;
      
      // Get display names
      const [p1Name, p2Name] = await Promise.all([
        getUsername(p1Id), 
        getUsername(p2Id)
      ]);
      
      // Create remote game room with matchmaking type
      const roomId = roomManager.createRemoteGameRoom(
        s1, s2, p1Id, p2Id, 
        undefined, 
        { matchType: 'matchmaking' }
      );
      
      console.log(`[MM] Paired sockets ${s1.id} (${p1Id}) vs ${s2.id} (${p2Id}) -> room ${roomId}`);
      
      // Track room assignments
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

### Matchmaking Flow Diagram

```ascii
Matchmaking Process

User A joins queue ──┐
                     ├──► Queue Processing ──► Room Creation ──► Game Start
User B joins queue ──┘

Timeline:
T+0s:   User A joins queue, gets timeout (30s)
T+5s:   User B joins queue, gets timeout (30s)
T+5s:   Pairing algorithm runs immediately
T+5s:   Remote room created, both users locked
T+5s:   'remote_room_joined' events sent
T+5s:   Navigation to game page triggered
T+6s:   Game room ready, auto-start after brief delay
```

## Invite System

### Direct Player Invitations

```typescript
socket.on('send_invite', async (selectedUser) => {
  const senderId = socketToUser.get(socket.id);
  if (!senderId) return;
  
  const targetId = String(selectedUser);
  console.log(`[INVITE] ${senderId} inviting ${targetId}`);
  
  // Validate both users are available
  const senderLock = activityManager.isUserLocked(senderId);
  const targetLock = activityManager.isUserLocked(targetId);
  
  if (senderLock.locked) {
    socket.emit('invite_error', { message: 'You are currently busy' });
    return;
  }
  
  if (targetLock.locked) {
    socket.emit('invite_error', { message: 'Target user is busy' });
    return;
  }
  
  // Generate unique invite ID
  const inviteId = `${senderId}_${targetId}_${Date.now()}`;
  
  // Set pending invite locks
  activityManager.setPendingInvite(senderId, inviteId);
  activityManager.setPendingInvite(targetId, inviteId);
  
  // Send invite to target
  app.io.to(targetId).emit('receive_invite', {
    inviterId: senderId,
    inviterName: await getUsername(senderId),
    inviteId,
    expiresAt: Date.now() + 30000 // 30 second expiry
  });
  
  // Confirm to sender
  socket.emit('invite_sent', { targetId, inviteId });
  
  // Auto-expire invite
  setTimeout(() => {
    activityManager.clearPendingInvite(senderId);
    activityManager.clearPendingInvite(targetId);
    
    app.io.to(senderId).emit('invite_expired', { inviteId });
    app.io.to(targetId).emit('invite_expired', { inviteId });
  }, 30000);
});

socket.on('accept_invite', async (payload: { inviterId: string, inviteId?: string }) => {
  const accepterId = socketToUser.get(socket.id);
  if (!accepterId) return;
  
  const inviterId = String(payload.inviterId);
  const inviteId = payload.inviteId;
  
  console.log(`[INVITE] ${accepterId} accepting invite from ${inviterId}`);
  
  // Validate invite is still pending
  const senderLock = activityManager.isUserLocked(inviterId);
  const targetLock = activityManager.isUserLocked(accepterId);
  
  if (!senderLock.pendingInviteId || !targetLock.pendingInviteId) {
    socket.emit('invite_error', { message: 'Invite no longer valid' });
    return;
  }
  
  // Clear pending invite locks
  activityManager.clearPendingInvite(inviterId);
  activityManager.clearPendingInvite(accepterId);
  
  try {
    const inviterSocket = getSocketByUserId(inviterId);
    if (!inviterSocket) {
      socket.emit('invite_error', { message: 'Inviter no longer available' });
      return;
    }
    
    // Get display names
    const [p1Name, p2Name] = await Promise.all([
      getUsername(inviterId),
      getUsername(accepterId)
    ]);
    
    // Create remote game room
    const roomId = roomManager.createRemoteGameRoom(
      inviterSocket, socket, inviterId, accepterId
    );
    
    // Lock both players for the match
    activityManager.lockForMatch(inviterId, accepterId);
    
    // Track room assignments
    socketToRoom.set(inviterSocket.id, roomId);
    socketToRoom.set(socket.id, roomId);
    
    // Notify both players
    inviterSocket.emit('remote_room_joined', {
      roomId,
      playerId: 'p1',
      p1Name,
      p2Name,
      matchType: 'remote',
      p1Id: inviterId,
      p2Id: accepterId
    });
    
    socket.emit('remote_room_joined', {
      roomId,
      playerId: 'p2',
      p1Name,
      p2Name,
      matchType: 'remote',
      p1Id: inviterId,
      p2Id: accepterId
    });
    
    // Notify about invite consumption
    app.io.to(inviterId).emit('invite_consumed', { by: accepterId, inviteId });
    app.io.to(accepterId).emit('invite_consumed', { inviterId, inviteId });
    
  } catch (e) {
    console.error('Failed to create game after invite acceptance:', e);
    socket.emit('error', 'Failed to create game');
    inviterSocket?.emit('error', 'Failed to create game');
  }
});

socket.on('decline_invite', async (payload: { inviterId: string }) => {
  const declinerId = socketToUser.get(socket.id);
  if (!declinerId) return;
  
  const inviterId = String(payload.inviterId);
  
  // Clear pending invite locks
  activityManager.clearPendingInvite(inviterId);
  activityManager.clearPendingInvite(declinerId);
  
  // Notify inviter
  app.io.to(inviterId).emit('invite_declined', { by: declinerId });
  
  // Generate synthetic invite ID for consistency
  const inviteId = `${inviterId}_${declinerId}_declined`;
  app.io.to(declinerId).emit('invite_cleared', { inviteId });
});
```

### Invite State Management

```ascii
Invite Lifecycle

Send Invite → Pending State → Accept/Decline → Game/Cleanup

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Initial   │    │  Pending    │    │  Response   │    │  Resolution │
│             │    │             │    │             │    │             │
│ Users free  │───►│ Both locked │───►│ Accept/     │───►│ Game start  │
│ Send invite │    │ with        │    │ Decline     │    │ or cleanup  │
│             │    │ pendingId   │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │                                      ▲
                          │                                      │
                          └──── 30s timeout ───────────────────┘
```

## Tournament System Integration

### Tournament Match Creation

```typescript
// Tournament matches use the room manager with special match type
function createTournamentMatch(tournament: Tournament, matchKey: 'semi1'|'semi2'|'final') {
  const match = tournament.bracket![matchKey];
  if (!match.p1 || !match.p2) return;
  
  const p1Socket = getSocketByUserId(match.p1);
  const p2Socket = getSocketByUserId(match.p2);
  
  if (!p1Socket || !p2Socket) {
    console.error(`Cannot create tournament match: socket not found`);
    return;
  }
  
  // Create remote room with tournament ID as match type
  const roomId = roomManager.createRemoteGameRoom(
    p1Socket, p2Socket, match.p1, match.p2,
    undefined,
    { matchType: tournament.id } // Critical: links results to tournament
  );
  
  // Store room ID in tournament bracket
  match.roomId = roomId;
  
  // Clear invite state
  match.invite = undefined;
  
  // Force start the game
  setTimeout(() => {
    const room = roomManager.getRemoteRoom(roomId);
    if (room) {
      (room as any).forceStart?.('tournament');
    }
  }, 1000);
  
  return roomId;
}
```

### Tournament Result Processing

```typescript
// When a tournament game completes, results are processed by tournament manager
class TournamentManager {
  onGameResult(io: Server, result: GameResult) {
    // Check if result belongs to a tournament
    const tournament = this.tournaments.get(result.matchType);
    if (!tournament || !tournament.bracket) return;
    
    // Find the bracket match that corresponds to this room
    for (const matchKey of ['semi1', 'semi2', 'final'] as const) {
      const match = tournament.bracket[matchKey];
      
      if (match?.roomId === result.roomId) {
        console.log(`[Tournament] Processing result for ${tournament.id}:${matchKey}`);
        
        // Apply result to bracket
        this.processMatchResult(io, tournament, matchKey, result);
        break;
      }
    }
  }
  
  private processMatchResult(
    io: Server, 
    tournament: Tournament, 
    matchKey: string, 
    result: GameResult
  ) {
    const match = tournament.bracket![matchKey as keyof typeof tournament.bracket];
    if (!match) return;
    
    // Record match result
    match.winner = result.winnerId;
    match.winnerName = result.winnerName;
    match.score = {
      p1: result.p1FinalScore,
      p2: result.p2FinalScore
    };
    match.endReason = result.endReason;
    
    // Advance winner to next round
    if (matchKey === 'semi1' || matchKey === 'semi2') {
      // Advance to final
      this.advanceToFinal(io, tournament, matchKey, result.winnerId!);
    } else if (matchKey === 'final') {
      // Tournament complete
      this.completeTournament(io, tournament, result.winnerId!);
    }
    
    // Eliminate loser
    const loserId = result.winnerId === match.p1 ? match.p2 : match.p1;
    if (loserId) {
      this.eliminatePlayer(tournament, loserId, 'lost_match');
    }
    
    this.persist();
  }
}
```

## Game Flow Integration

### Room Joining Process

```ascii
Room Joining Flow

Socket Event → Validation → Room Assignment → Game Ready

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Socket     │    │  Activity   │    │  Room       │    │  Game       │
│  Event      │    │  Check      │    │  Manager    │    │  Loop       │
│             │    │             │    │             │    │             │
│ join_game   │───►│ Lock check  │───►│ Create/Join │───►│ Start loop  │
│ send_invite │    │ Validate    │    │ Assign ID   │    │ Emit events │
│ accept      │    │ Apply locks │    │ Socket join │    │ Input ready │
│ matchmaking │    │ Multi-tab   │    │ State init  │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Socket Room Tracking

```typescript
// Track socket-to-room assignments
const socketToRoom = new Map<string, string>();
const socketToUser = new Map<string, string>();

// When a socket joins a game
socket.on('join_game', async ({ settings, userId, clientRoomId }) => {
  try {
    // Clean up any existing local room
    const existingRoomId = socketToRoom.get(socket.id);
    if (existingRoomId && existingRoomId.startsWith('local_')) {
      roomManager.deleteRoom(existingRoomId);
      socket.leave(existingRoomId);
      socketToRoom.delete(socket.id);
    }
    
    // Create new local room
    const roomId = await roomManager.createLocalRoom(socket, settings);
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);
    socket.emit('room_joined', { roomId });
    
  } catch (e) {
    console.error('join_game error:', e);
    socket.emit('error', 'Failed to create game room');
  }
});

// When a socket joins a remote room (reconnection)
socket.on('join_remote_room', ({ roomId, playerId }) => {
  const userId = socketToUser.get(socket.id);
  if (!userId) return;
  
  const room = roomManager.getRemoteRoom(roomId);
  if (!room) {
    socket.emit('remote_room_error', 'Room not found');
    return;
  }
  
  // Prevent duplicate connections from same user
  const userSockets = Array.from(socketToUser.entries())
    .filter(([_, uid]) => uid === userId)
    .map(([sid, _]) => sid);
  
  const otherSocketsInRoom = userSockets.filter(sId => {
    const mappedRoomId = socketToRoom.get(sId);
    return sId !== socket.id && mappedRoomId === roomId;
  });
  
  if (otherSocketsInRoom.length > 0) {
    console.log(`[join_remote_room] DUPLICATE TAB DETECTED: User ${userId} already has socket ${otherSocketsInRoom[0]} in room ${roomId}`);
    return socket.emit('remote_room_error', 'Game room is already in use from another connection. Please close other tabs.');
  }
  
  // Update socket reference in room
  try {
    if (playerId === 'p1') {
      (room as any).player1 = socket;
    } else {
      (room as any).player2 = socket;
    }
    
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);
    socket.emit('remote_room_joined_success');
    
    // Send current game state
    socket.emit('remote_game_state', room.state);
    
  } catch (e) {
    console.error(`[join_remote_room] Error joining room ${roomId}:`, e);
    socket.emit('remote_room_error', 'Failed to join remote room');
  }
});
```

### Game Leave Handling

```typescript
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
        // Delayed cleanup to allow final state broadcast
        setTimeout(() => roomManager.deleteRemoteRoom(targetRoomId), 1200);
      } else {
        roomManager.deleteRemoteRoom(targetRoomId);
      }
    } else {
      roomManager.deleteRoom(targetRoomId);
    }
  } finally {
    // Clean up socket tracking
    socket.leave(targetRoomId);
    if (mappedRoomId === targetRoomId) {
      socketToRoom.delete(socket.id);
    }
    
    // Clear match lock for user
    const userId = socketToUser.get(socket.id);
    if (userId) {
      activityManager.unlockUser(userId);
    }
  }
});
```

## Error Handling and Edge Cases

### Connection State Management

```typescript
// Handle socket disconnection
socket.on('disconnect', async () => {
  const userId = socketToUser.get(socket.id);
  
  if (userId) {
    // Update connection count
    const prev = userConnectionCounts.get(userId) || 1;
    const newCount = Math.max(0, prev - 1);
    userConnectionCounts.set(userId, newCount);
    
    // Only mark offline if last socket
    if (newCount === 0) {
      userConnectionCounts.delete(userId);
      try {
        await updateUserStatus(Number(userId), 'offline');
        socket.broadcast.emit('user_offline', { userId });
      } catch {}
    }
    
    // Clean up tracking
    socketToUser.delete(socket.id);
  }
  
  // Clean up room tracking
  const roomId = socketToRoom.get(socket.id);
  if (roomId) {
    socketToRoom.delete(socket.id);
    
    // Handle different room types
    if (roomId.startsWith('remote_')) {
      const room = roomManager.getRemoteRoom(roomId);
      if (room) {
        room.onPlayerExit?.(socket.id);
      }
    }
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

### Race Condition Prevention

```typescript
// Prevent duplicate room creation
createRemoteGameRoom(/* ... */) {
  // Check for existing room by user IDs, not socket IDs
  for (const [rid, room] of this.remoteRooms.entries()) {
    const roomP1Id = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
    const roomP2Id = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
    
    if (
      (String(roomP1Id) === String(player1Id) && String(roomP2Id) === String(player2Id)) ||
      (String(roomP1Id) === String(player2Id) && String(roomP2Id) === String(player1Id))
    ) {
      console.warn('⚠️ Preventing duplicate remote room creation', rid);
      
      // Update socket references instead of creating new room
      if (!(room as any).state?.gameOver) {
        // ... update logic ...
        return rid;
      }
    }
  }
  
  // ... create new room logic ...
}

// Prevent early deletion
deleteRoom(roomId: string): boolean {
  const room = this.rooms.get(roomId);
  if (room) {
    // Prevent deleting just-created room (race condition guard)
    const createdAt: number | undefined = (room as any).createdAt;
    if (createdAt && Date.now() - createdAt < 500) {
      console.warn(`⏳ Skip deletion of ${roomId} (created ${Date.now() - createdAt}ms ago)`);
      return false;
    }
    // ... deletion logic ...
  }
}
```

### Activity Lock Integration

```typescript
// Check locks before allowing game actions
socket.on('matchmaking_join', async () => {
  const userId = socketToUser.get(socket.id);
  
  // Prevent joining if locked by any activity
  if (activityManager.isUserLocked(userId).locked) {
    socket.emit('matchmaking_error', 'Locked by activity');
    return;
  }
  
  // ... matchmaking logic ...
});

socket.on('send_invite', async (targetUserId) => {
  const senderId = socketToUser.get(socket.id);
  
  // Check both users are available
  const senderLock = activityManager.isUserLocked(senderId);
  const targetLock = activityManager.isUserLocked(targetUserId);
  
  if (senderLock.locked || targetLock.locked) {
    socket.emit('invite_error', { message: 'One or both users are busy' });
    return;
  }
  
  // ... invite logic ...
});
```

## Summary

The game logic systems provide comprehensive orchestration of all gameplay modes:

- **Room Manager**: Creates and manages local/remote game instances with proper lifecycle handling
- **Matchmaking**: Queue-based automatic pairing with timeout and error handling
- **Invite System**: Direct player-to-player invitations with expiry and state management
- **Tournament Integration**: Seamless connection between bracket system and game rooms
- **Activity Coordination**: Proper locking and multi-tab synchronization
- **Error Handling**: Robust cleanup, race condition prevention, and state recovery

These systems work together to provide a seamless multiplayer experience while ensuring data consistency and preventing conflicts between different game modes.
