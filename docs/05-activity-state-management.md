# Activity State Management and Multi-Tab Coordination

This document explains how secure activity state and locks are handled across multiple authenticated tabs, what sockets get activity updates, and how activity locking prevents conflicts between authenticated users' matchmaking, invites, and tournaments.

## Overview

The **secure activity state management system** prevents authenticated users from being in multiple conflicting activities simultaneously (e.g., in a game while also in matchmaking queue). It coordinates state across multiple browser tabs for authenticated users and ensures consistent user experience through centralized lock management and authenticated socket-based communication.

## 🔐 Secure Activity Manager Architecture

### Authenticated Lock Management

The `ActivityManager` maintains centralized state for all **authenticated user activities**:

```typescript
class ActivityManager {
  private locks: Map<string, {
    inMatch: boolean;           // Currently in an active game
    tournamentLocked: boolean;  // Locked for tournament participation
    pendingInviteId?: string;   // Has pending invite (sent or received)
  }> = new Map();
  
  private lastResetAt: Map<string, number> = new Map(); // Debug tracking
  private io: Server | null = null; // Socket.IO server instance

  // User locks are tied to authenticated user IDs (from JWT)
  public lockUserForMatch(userId: string): void {
    if (!userId) return; // Only authenticated users can be locked
    const lock = this.ensureLock(userId);
    lock.inMatch = true;
    this.broadcastActivityUpdate(userId);
  }
}
```

### Security Features

- **User ID Validation**: All lock operations require authenticated user IDs
- **Socket Authentication**: Activity updates only sent to authenticated sockets
- **Authorization Checks**: Users can only access their own activity state

```typescript
// Only authenticated sockets receive activity updates
public broadcastActivityUpdate(userId: string): void {
  if (!this.io) return;
  
  // Find authenticated sockets for this user
  for (const [socketId, socket] of this.io.sockets.sockets) {
    const socketUserId = (socket as any).userId; // From JWT middleware
    if (socketUserId === userId) {
      socket.emit('activity_update', this.getUserLockStatus(userId));
    }
  }
}
```

### Lock State Types

```typescript
interface UserLockState {
  inMatch: boolean;           // Playing a game (local/remote)
  tournamentLocked: boolean;  // In tournament (waiting/countdown/playing)
  pendingInviteId?: string;   // Invite ID if invite is pending
}

interface LockStatus {
  locked: boolean;
  reason: 'none' | 'match' | 'tournament' | 'invite';
}
```

### Lock Priority and Precedence

```typescript
public isUserLocked(userId: string): { locked: boolean; reason: 'none' | 'match' | 'tournament' } {
  const lock = this.ensureLock(userId);
  
  // Match locks take highest priority
  if (lock.inMatch) return { locked: true, reason: 'match' };
  
  // Tournament locks prevent other activities
  if (lock.tournamentLocked) return { locked: true, reason: 'tournament' };
  
  // User is free for activities
  return { locked: false, reason: 'none' };
}

// Special check for invite eligibility (includes pending invites)
public isUserBusyForInvite(userId: string): boolean {
  const lock = this.ensureLock(userId);
  return !!(lock.inMatch || lock.tournamentLocked || lock.pendingInviteId);
}
```

## Multi-Tab State Coordination

### Socket Room Structure

Each user automatically joins a personal socket room for targeted messaging:

```ascii
Socket Room Architecture

User "user123" logs in from multiple tabs:

Tab 1 Socket: socket_abc123
Tab 2 Socket: socket_def456
Tab 3 Socket: socket_ghi789
        ↓
All join room: "user123"
        ↓
Activity messages sent to room reach all tabs
```

### User Room Joining

```typescript
// When socket connects and user joins
socket.on('join', (userId) => {
  if (!userId) return;
  
  // Join user's personal room for targeted messages
  socket.join(userId);
  
  // Reset stale locks from server restarts
  activityManager.resetLocksForUser(userId);
  
  // Update user status to online
  updateUserStatus(userId, 'online');
  
  // Send current lock state to this tab
  const lockInfo = activityManager.isUserLocked(userId);
  socket.emit(lockInfo.locked ? 'user_locked' : 'user_unlocked', {
    reason: lockInfo.reason,
    inMatch: lockInfo.reason === 'match'
  });
  
  // Broadcast online status to other users
  socket.broadcast.emit('user_online', { userId });
});
```

### Lock State Broadcasting

When activity state changes, all user's tabs are notified:

```typescript
private broadcastLockState(userId: string) {
  if (!this.io) return;
  
  const lockInfo = this.isUserLocked(userId);
  const payload = {
    reason: lockInfo.reason,
    inMatch: lockInfo.reason === 'match'
  };
  
  if (lockInfo.locked) {
    // Send lock notification to all user's tabs
    this.io.to(userId).emit('user_locked', payload);
    console.log(`Emitted user_locked for ${userId}:`, payload);
  } else {
    // Send unlock notification to all user's tabs  
    this.io.to(userId).emit('user_unlocked', payload);
    console.log(`Emitted user_unlocked for ${userId}:`, payload);
  }
  
  // Global presence update for other users to see status
  try {
    this.io.emit('user_lock_state', {
      userId,
      locked: lockInfo.locked,
      reason: payload.reason,
      inMatch: payload.inMatch
    });
  } catch (e) {
    console.error('Failed to broadcast global lock state:', e);
  }
}
```

### Frontend Lock State Handling

Frontend components react to lock state changes across all tabs:

```typescript
// client/store/slices/userSlice.ts
export interface UserSlice {
  user: User | null;
  isLocked: boolean;
  lockReason: string;
  setUser: (user: User | null) => void;
  setLocked: (locked: boolean, reason?: string) => void;
}

// Socket event listeners for lock state
socket.on('user_locked', ({ reason, inMatch }) => {
  userSlice.setLocked(true, reason);
  
  // Show notification in current tab
  toast.error(`You are locked: ${reason}`);
  
  // Disable relevant UI elements
  setUIDisabled(true);
});

socket.on('user_unlocked', ({ reason }) => {
  userSlice.setLocked(false);
  
  // Re-enable UI elements
  setUIDisabled(false);
  
  // Optionally show unlock notification
  if (reason !== 'none') {
    toast.success('You are now available for activities');
  }
});
```

## Socket Communication Patterns

### Chat and Invite Distribution

Chat messages and invites are distributed based on user rooms and activity state:

```typescript
// Chat message distribution
socket.on('send_message', async ({ sender_id, receiver_id, text }) => {
  // Save message to database
  const message = await createMessage({ sender_id, receiver_id, text });
  
  // Send to both sender and receiver's rooms (all tabs)
  io.to(sender_id).emit('receive_message', message);
  io.to(receiver_id).emit('receive_message', message);
  
  // Send notification if receiver is not actively chatting
  const receiverSockets = await io.in(receiver_id).fetchSockets();
  if (receiverSockets.length === 0) {
    // User is offline, could store notification for later
    storeOfflineNotification(receiver_id, 'new_message', message);
  }
});

// Game invite distribution
socket.on('send_invite', async ({ targetUserId }) => {
  const senderId = getUserId(socket);
  
  // Check if both users are available
  if (activityManager.isUserBusyForInvite(senderId)) {
    socket.emit('invite_error', { message: 'You are currently busy' });
    return;
  }
  
  if (activityManager.isUserBusyForInvite(targetUserId)) {
    socket.emit('invite_error', { message: 'Target user is busy' });
    return;
  }
  
  const inviteId = generateInviteId();
  
  // Set pending invite state for both users
  activityManager.setPendingInvite(senderId, targetUserId, inviteId);
  
  // Send invite to target's room (all tabs)
  io.to(targetUserId).emit('receive_invite', {
    inviteId,
    inviterId: senderId,
    inviterName: await getUserDisplayName(senderId),
    expiresAt: Date.now() + 30000 // 30 second timeout
  });
  
  // Confirm to sender's room (all tabs)
  io.to(senderId).emit('invite_sent', {
    inviteId,
    targetId: targetUserId,
    targetName: await getUserDisplayName(targetUserId)
  });
  
  // Set automatic cleanup
  setTimeout(() => {
    activityManager.clearPendingInvite(senderId, targetUserId);
    io.to(senderId).emit('invite_expired', { inviteId });
    io.to(targetUserId).emit('invite_expired', { inviteId });
  }, 30000);
});
```

### Activity Lock Enforcement

Different activities enforce locks to prevent conflicts:

```typescript
// Matchmaking join - check locks first
socket.on('matchmaking_join', async ({ settings }) => {
  const userId = getUserId(socket);
  
  // Verify user is not locked
  if (activityManager.isUserLocked(userId).locked) {
    socket.emit('matchmaking_error', { 
      message: 'Cannot join matchmaking while in another activity' 
    });
    return;
  }
  
  // Add to matchmaking queue
  matchmakingQueue.add(userId, settings);
  
  // User is now committed to matchmaking (soft lock)
  socket.emit('matchmaking_status', { status: 'queued', position: matchmakingQueue.getPosition(userId) });
});

// Tournament join - applies tournament lock
socket.on('tournament_join', async ({ id }) => {
  const userId = getUserId(socket);
  const tournament = tournamentManager.get(id);
  
  // Check eligibility
  if (activityManager.isUserLocked(userId).locked) {
    socket.emit('tournament_error', { message: 'Cannot join tournament while busy' });
    return;
  }
  
  // Add to tournament
  tournament.players.push(userId);
  
  // Apply tournament lock (prevents other activities)
  activityManager.setTournamentLock(userId, true);
  
  // Broadcast update to all user's tabs
  io.to(userId).emit('tournament_joined', { tournamentId: id });
});

// Game start - applies match lock
function startRemoteGame(player1Id: string, player2Id: string) {
  // Lock both players for the match
  activityManager.lockForMatch(player1Id, player2Id);
  
  // Create game room
  const room = roomManager.createRemoteGameRoom(player1Socket, player2Socket, player1Id, player2Id);
  
  // Notify all tabs for both players
  io.to(player1Id).emit('remote_room_joined', {
    roomId: room.id,
    playerId: player1Id,
    opponentId: player2Id
  });
  
  io.to(player2Id).emit('remote_room_joined', {
    roomId: room.id,
    playerId: player2Id,
    opponentId: player1Id
  });
}
```

## Activity Lock Types and Conflicts

### Lock Conflict Matrix

```ascii
Activity Conflict Matrix

Current State    | Matchmaking | Invite Send | Invite Accept | Tournament Join | Local Game
-----------------|-------------|-------------|---------------|----------------|------------
None             |     ✓       |      ✓      |       ✓       |       ✓        |     ✓
In Match         |     ✗       |      ✗      |       ✗       |       ✗        |     ✗
Tournament Lock  |     ✗       |      ✗      |       ✗       |       ✗        |     ✓*
Pending Invite   |     ✗       |      ✗      |       ✓       |       ✗        |     ✗
Matchmaking      |     ✗       |      ✗      |       ✗       |       ✗        |     ✗

* Local games allowed during tournament waiting period only
```

### Lock Implementation Details

```typescript
// Match locks (highest priority)
public lockForMatch(userId1: string, userId2: string) {
  console.log(`LOCK: Locking ${userId1} and ${userId2} for match.`);
  
  const lock1 = this.ensureLock(userId1);
  const lock2 = this.ensureLock(userId2);
  
  // Set match lock
  lock1.inMatch = true;
  lock2.inMatch = true;
  
  // Clear any pending invites (they're now in a game)
  lock1.pendingInviteId = undefined;
  lock2.pendingInviteId = undefined;
  
  // Notify all tabs for both users
  this.broadcastLockState(userId1);
  this.broadcastLockState(userId2);
}

// Tournament locks (prevent most activities)
public setTournamentLock(userId: string, isLocked: boolean) {
  const lock = this.ensureLock(userId);
  
  if (lock.tournamentLocked === isLocked) return; // No change needed
  
  console.log(`TOURNAMENT_LOCK: Setting user ${userId} tournament lock to ${isLocked}`);
  
  lock.tournamentLocked = isLocked;
  this.broadcastLockState(userId);
}

// Invite locks (temporary, cleared on response)
public setPendingInvite(inviterId: string, recipientId: string, inviteId: string) {
  console.log(`INVITE: Setting pending invite ${inviteId} between ${inviterId} and ${recipientId}`);
  
  const inviterLock = this.ensureLock(inviterId);
  const recipientLock = this.ensureLock(recipientId);
  
  // Both users get the same invite ID
  inviterLock.pendingInviteId = inviteId;
  recipientLock.pendingInviteId = inviteId;
  
  // Notify all tabs
  this.broadcastLockState(inviterId);
  this.broadcastLockState(recipientId);
}
```

## Session Management and Recovery

### Server Restart Recovery

When the server restarts, stale locks are cleaned up:

```typescript
// Called when user first joins after server restart
public resetLocksForUser(userId: string) {
  const lock = this.ensureLock(userId);
  const before = { ...lock };
  
  // Clear potentially stale locks
  lock.inMatch = false;
  lock.pendingInviteId = undefined;
  
  // DO NOT clear tournament locks (legitimate pre-tournament locks)
  // Tournament manager will handle its own state recovery
  
  this.lastResetAt.set(userId, Date.now());
  
  // Log and broadcast changes
  if (before.inMatch || before.pendingInviteId) {
    console.log(`[ActivityManager] Reset locks for user ${userId}`, { before, after: lock });
    this.broadcastLockState(userId);
  }
}

// Emergency unlock for maintenance
public forceUnlockAll(includeTournament = false) {
  for (const [userId, lock] of this.locks.entries()) {
    lock.inMatch = false;
    lock.pendingInviteId = undefined;
    
    if (includeTournament) {
      lock.tournamentLocked = false;
    }
    
    this.broadcastLockState(userId);
  }
  
  console.log(`Force unlocked all users (includeTournament: ${includeTournament})`);
}
```

### Multi-Tab Session Replacement

The system handles session replacement when a user logs in from a new device:

```typescript
// When new login detected for existing user
socket.on('join', (userId) => {
  const existingSockets = io.sockets.adapter.rooms.get(userId);
  
  if (existingSockets && existingSockets.size > 0) {
    // Notify existing sessions
    io.to(userId).emit('session_replaced');
    
    // Give existing sessions time to disconnect gracefully
    setTimeout(() => {
      // Force disconnect any remaining old sessions
      for (const socketId of existingSockets) {
        const oldSocket = io.sockets.sockets.get(socketId);
        if (oldSocket && oldSocket.id !== socket.id) {
          oldSocket.disconnect(true);
        }
      }
    }, 2000);
  }
  
  // Continue with normal join process
  socket.join(userId);
  activityManager.resetLocksForUser(userId);
});

// Frontend handling of session replacement
socket.on('session_replaced', () => {
  toast.error('Session opened elsewhere. This tab disconnected.');
  
  // Disconnect socket
  socket.disconnect();
  
  // Clear local storage
  sessionStorage.clear();
  localStorage.setItem('sessionReplaced', '1');
  
  // Redirect to login
  window.location.href = '/';
});
```

## Frontend State Synchronization

### Zustand Store Integration

The frontend uses Zustand to maintain activity state across components:

```typescript
// client/store/slices/activitySlice.ts
export interface ActivitySlice {
  isLocked: boolean;
  lockReason: 'none' | 'match' | 'tournament' | 'invite';
  pendingInvites: PendingInvite[];
  setLocked: (locked: boolean, reason?: string) => void;
  addPendingInvite: (invite: PendingInvite) => void;
  removePendingInvite: (inviteId: string) => void;
}

// Socket event integration
useEffect(() => {
  if (!socket) return;
  
  const handleUserLocked = ({ reason, inMatch }: { reason: string, inMatch: boolean }) => {
    activitySlice.setLocked(true, reason);
    
    // Update UI state
    setGameUIDisabled(inMatch);
    setTournamentUIDisabled(reason === 'tournament');
    
    // Show appropriate notification
    const lockMessage = getLockMessage(reason);
    toast.error(lockMessage);
  };
  
  const handleUserUnlocked = () => {
    activitySlice.setLocked(false, 'none');
    
    // Re-enable UI
    setGameUIDisabled(false);
    setTournamentUIDisabled(false);
  };
  
  socket.on('user_locked', handleUserLocked);
  socket.on('user_unlocked', handleUserUnlocked);
  
  return () => {
    socket.off('user_locked', handleUserLocked);
    socket.off('user_unlocked', handleUserUnlocked);
  };
}, [socket]);
```

### UI State Management

Components use activity state to control availability:

```typescript
// Game invitation button
function InviteButton({ targetUserId }: { targetUserId: string }) {
  const { isLocked, lockReason } = useActivityState();
  const { sendInvite } = useGameActions();
  
  const canSendInvite = !isLocked && lockReason === 'none';
  const buttonText = getInviteButtonText(isLocked, lockReason);
  
  return (
    <button
      disabled={!canSendInvite}
      onClick={() => sendInvite(targetUserId)}
      className={`invite-btn ${!canSendInvite ? 'disabled' : ''}`}
      title={!canSendInvite ? `Cannot invite: ${lockReason}` : ''}
    >
      {buttonText}
    </button>
  );
}

// Matchmaking queue button  
function MatchmakingButton() {
  const { isLocked, lockReason } = useActivityState();
  const { joinMatchmaking, leaveMatchmaking } = useMatchmaking();
  
  if (isLocked && lockReason === 'match') {
    return <div>Currently in game...</div>;
  }
  
  if (isLocked && lockReason === 'tournament') {
    return <div>Tournament active - cannot join matchmaking</div>;
  }
  
  return (
    <button
      disabled={isLocked}
      onClick={joinMatchmaking}
      className="matchmaking-btn"
    >
      {isLocked ? `Busy (${lockReason})` : 'Join Matchmaking'}
    </button>
  );
}
```

This comprehensive activity management system ensures consistent user experience across multiple tabs while preventing conflicting activities and maintaining proper state synchronization through centralized lock management and socket-based communication.
