import type { Server } from 'socket.io';

// A centralized manager for user activity state to prevent multi-session conflicts.
class ActivityManager {
  private io: Server | null = null;
  private locks: Map<string, { inMatch: boolean; tournamentLocked: boolean; pendingInviteId?: string }> = new Map();
  // Track last reset to help debug stale lock clears
  private lastResetAt: Map<string, number> = new Map();

  public initialize(io: Server) {
    this.io = io;
    console.log('✅ ActivityManager initialized.');
  }

  private ensureLock(userId: string) {
    if (!this.locks.has(userId)) {
      this.locks.set(userId, { inMatch: false, tournamentLocked: false });
    }
    return this.locks.get(userId)!;
  }

  private broadcastLockState(userId: string) {
    if (!this.io) return;
    const lockInfo = this.isUserLocked(userId);
    const payload = { reason: lockInfo.reason, inMatch: lockInfo.reason === 'match' };
    if (lockInfo.locked) {
      this.io.to(userId).emit('user_locked', payload);
      console.log(`Emitted user_locked for ${userId}:`, payload);
    } else {
      this.io.to(userId).emit('user_unlocked', payload);
      console.log(`Emitted user_unlocked for ${userId}:`, payload);
    }
  // Global presence update for other clients (so they can show in-game/red indicator)
  try { this.io.emit('user_lock_state', { userId, locked: lockInfo.locked, reason: payload.reason, inMatch: payload.inMatch }); } catch {}
  }

  // --- Public API ---

  public isUserLocked(userId: string): { locked: boolean; reason: 'none' | 'match' | 'tournament' } {
    const lock = this.ensureLock(userId);
    if (lock.inMatch) return { locked: true, reason: 'match' };
    if (lock.tournamentLocked) return { locked: true, reason: 'tournament' };
    return { locked: false, reason: 'none' };
  }

  // Specific helper: is user busy for receiving/sending a new invite
  public isUserBusyForInvite(userId: string): boolean {
    const l = this.ensureLock(userId);
    return !!(l.inMatch || l.tournamentLocked || l.pendingInviteId);
  }

  public getLockState(userId: string) {
      return this.ensureLock(userId);
  }

  public lockForMatch(userId1: string, userId2: string) {
    console.log(`LOCK: Locking ${userId1} and ${userId2} for match.`);
    const lock1 = this.ensureLock(userId1);
    const lock2 = this.ensureLock(userId2);
    lock1.inMatch = true;
    lock2.inMatch = true;
    lock1.pendingInviteId = undefined; // Clear any pending invites
    lock2.pendingInviteId = undefined;
    this.broadcastLockState(userId1);
    this.broadcastLockState(userId2);
  }

  public unlockFromMatch(userId1: string, userId2: string) {
    console.log(`UNLOCK: Unlocking ${userId1} and ${userId2} from match.`);
    const lock1 = this.ensureLock(userId1);
    const lock2 = this.ensureLock(userId2);
    lock1.inMatch = false;
    lock2.inMatch = false;
    this.broadcastLockState(userId1);
    this.broadcastLockState(userId2);
  }

  // Convenience: unlock a single user (used when a single side leaves)
  public unlockUser(userId: string) {
    const lock = this.ensureLock(userId);
  if (lock.inMatch) {
      lock.inMatch = false;
      this.broadcastLockState(userId);
    }
  }
  
  // Hard reset non-tournament locks for a user (used on first socket join to clear stale state after server restart / crash)
  public resetLocksForUser(userId: string) {
    const lock = this.ensureLock(userId);
    const before = { ...lock };
    lock.inMatch = false;
    lock.pendingInviteId = undefined;
    // Intentionally DO NOT clear tournamentLocked here to preserve legitimate pre-locks or active tournament state
    this.lastResetAt.set(userId, Date.now());
    if (before.inMatch || before.pendingInviteId) {
      console.log(`[ActivityManager] Reset locks for user ${userId}`, { before, after: lock });
      this.broadcastLockState(userId);
    }
  }

  // Global unlock (used only on explicit maintenance scripts – not automatically invoked to avoid wiping tournament state)
  public forceUnlockAll(includeTournament = false) {
    for (const [uid, lock] of this.locks.entries()) {
      lock.inMatch = false;
      lock.pendingInviteId = undefined;
      if (includeTournament) lock.tournamentLocked = false;
      this.broadcastLockState(uid);
    }
  }
  
  public setPendingInvite(inviterId: string, recipientId: string, inviteId: string) {
      console.log(`INVITE: Setting pending invite ${inviteId} between ${inviterId} and ${recipientId}`);
      const inviterLock = this.ensureLock(inviterId);
      const recipientLock = this.ensureLock(recipientId);
      inviterLock.pendingInviteId = inviteId;
      recipientLock.pendingInviteId = inviteId;
      this.broadcastLockState(inviterId);
      this.broadcastLockState(recipientId);
  }

  public clearPendingInvite(userId1: string, userId2: string) {
      console.log(`INVITE_CLEAR: Clearing pending invites for ${userId1} and ${userId2}`);
      const lock1 = this.ensureLock(userId1);
      const lock2 = this.ensureLock(userId2);
      lock1.pendingInviteId = undefined;
      lock2.pendingInviteId = undefined;
      this.broadcastLockState(userId1);
      this.broadcastLockState(userId2);
  }

  public setTournamentLock(userId: string, isLocked: boolean) {
  const lock = this.ensureLock(userId);
  if (lock.tournamentLocked === isLocked) return; // no change
  console.log(`TOURNAMENT_LOCK: Setting user ${userId} tournament lock to ${isLocked}`);
  lock.tournamentLocked = isLocked;
  this.broadcastLockState(userId);
  }
}

export const activityManager = new ActivityManager();
