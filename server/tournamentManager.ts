import { Socket } from 'socket.io';
import { roomManager } from './roomManager';
import { upsertTournament, loadTournaments } from './models/Tournaments';
import { GameResult } from './types';
import { Tournament, TournamentStatus, MatchInviteState } from './tournament/types';
import { applyGameResult, shouldInviteFinal, evaluateEliminationState, ensureBracket } from './tournament/bracketController';
import { initiateMatchInvite, getSocketByUserId } from './tournament/matchHelpers';
import { MatchFlowController } from './tournament/matchFlowController';
import { activityManager } from './activityManager';
import { db } from './db/db';

export class TournamentManager {
  private tournaments: Map<string, Tournament> = new Map();
  private matchFlow: MatchFlowController;

  constructor() {
  this.matchFlow = new MatchFlowController(this.tournaments, (io,t,e,p)=>this.broadcast(io,t,e,p), ()=>this.persist(), (io,t)=>this.evaluateElimination(io,t));
    // Async load from DB
    loadTournaments().then(records => {
      for (const tRaw of records) {
        const t = this.ensureDefaults(tRaw as Tournament);
        this.tournaments.set(t.id, t);
      }
      console.log(`Loaded ${this.tournaments.size} tournaments from DB`);
  try { this.startupCleanup(); } catch (e) { console.error('Tournament startup cleanup failed', e); }
    }).catch(e => console.error('Failed to load tournaments from DB', e));
  }

  private ensureDefaults(t: Tournament): Tournament {
    if (!t.playersSockets) t.playersSockets = {};
    if (!t.sockets) t.sockets = [];
    if (!t.players) t.players = [] as any;
    if (!t.eliminationReasons) t.eliminationReasons = {};
    if (!t.playerNames) t.playerNames = {};
    if (t.bracket) {
      t.bracket.semi1 = t.bracket.semi1 || {};
      t.bracket.semi2 = t.bracket.semi2 || {};
      t.bracket.final = t.bracket.final || {};
    }
    return t;
  }

  private formatDisplayName(alias: string | null, username: string | null, fallback: string): string {
    if (alias && username) {
      return `${alias} (#${username})`;
    } else if (username) {
      return `#${username}`;
    }
    return fallback;
  }

  // Cleanup stale tournaments on server startup (e.g., after crash / restart) so users are not blocked
  private startupCleanup() {
    const now = Date.now();
    let changed = false;
    console.log(`[TournamentManager] Starting startup cleanup with ${this.tournaments.size} tournaments loaded`);
    
    for (const t of this.tournaments.values()) {
      const originalStatus = t.status;
      const originalPlayerCount = t.players?.length || 0;
      
      // If waiting and start time passed -> cancel (if <4 players) or begin countdown anew
      if (t.status === 'waiting' && now >= t.startsAt) {
        if (t.players.length < 4) {
          t.status = 'cancelled';
          changed = true;
        } else {
          t.status = 'running'; 
          t.countdownUntil = now + 10_000; // restart countdown window
          changed = true;
        }
      }
      
      // Handle stuck "running" tournaments that should be completed/cancelled
      if (t.status === 'running' && t.bracket) {
        const final = t.bracket.final;
        const semi1 = t.bracket.semi1;
        const semi2 = t.bracket.semi2;
        
        // Check for expired invites in semifinals
        let hasExpiredInvites = false;
        if (semi1?.invite && semi1.invite.expiresAt && now > semi1.invite.expiresAt) {
          console.log(`[TournamentManager] Semi1 invite expired in tournament ${t.id}, auto-declining`);
          semi1.invite.p1 = 'declined';
          semi1.invite.p2 = 'declined';
          hasExpiredInvites = true;
          changed = true;
        }
        if (semi2?.invite && semi2.invite.expiresAt && now > semi2.invite.expiresAt) {
          console.log(`[TournamentManager] Semi2 invite expired in tournament ${t.id}, auto-declining`);
          semi2.invite.p1 = 'declined';
          semi2.invite.p2 = 'declined';
          hasExpiredInvites = true;
          changed = true;
        }
        if (final?.invite && final.invite.expiresAt && now > final.invite.expiresAt) {
          console.log(`[TournamentManager] Final invite expired in tournament ${t.id}, auto-declining`);
          final.invite.p1 = 'declined';
          final.invite.p2 = 'declined';
          hasExpiredInvites = true;
          changed = true;
        }
        
        // If we have expired invites, cancel the entire tournament  
        if (hasExpiredInvites) {
          console.log(`[TournamentManager] Cancelling tournament ${t.id} due to expired invites`);
          t.status = 'cancelled';
          changed = true;
        }
        
        // Check if final match had a room but no winner recorded (stale final)
        if (final?.roomId && !final.winner) {
          // If final room created more than 10 minutes ago, consider it abandoned
          const roomCreatedTime = this.extractTimeFromRoomId(final.roomId);
          if (roomCreatedTime && now - roomCreatedTime > 10 * 60 * 1000) {
            console.log(`[TournamentManager] Detected abandoned final in tournament ${t.id} - cancelling`);
            t.status = 'cancelled';
            changed = true;
          }
        }
        // Check if we have winners for both semis but no final match initiated (stuck waiting for final)
        else if (semi1?.winner && semi2?.winner && (!final || (!final.roomId && !final.invite))) {
          console.log(`[TournamentManager] Detected tournament ${t.id} stuck waiting for final - forcing completion evaluation`);
          // Set up final participants so evaluation can proceed
          if (!t.bracket.final) t.bracket.final = {};
          t.bracket.final.p1 = semi1.winner;
          t.bracket.final.p1Name = semi1.winnerName;
          t.bracket.final.p2 = semi2.winner;
          t.bracket.final.p2Name = semi2.winnerName;
          changed = true;
        }
        // Check if tournament is very old and should be auto-cancelled
        else if (now - t.startsAt > 24 * 60 * 60 * 1000) { // 24 hours old
          console.log(`[TournamentManager] Cancelling very old running tournament ${t.id}`);
          t.status = 'cancelled';
          changed = true;
        }
      }
      
      // While iterating, prune obviously stale participants (no socket mapping + waiting/countdown phase)
      if (['waiting','countdown'].includes(t.status)) {
        this.ensureDefaults(t);
        const beforeCount = t.players.length;
        console.log(`[TournamentManager] Checking tournament ${t.id} (${t.name}, status: ${t.status}) - ${beforeCount} players, sockets: ${JSON.stringify(t.playersSockets)}`);
        
        t.players = t.players.filter(uid => {
          const sid = t.playersSockets?.[uid];
          const socketTracked = sid && t.sockets.includes(sid);
          if (!socketTracked) {
            delete t.playersSockets[uid];
            console.log(`[TournamentManager] Startup prune removed stale user ${uid} from tournament ${t.id} (no valid socket mapping)`);
            return false;
          }
          return true;
        });
        if (t.players.length !== beforeCount) {
          changed = true;
          console.log(`[TournamentManager] Tournament ${t.id} player count changed from ${beforeCount} to ${t.players.length}`);
        }
        // If tournament loses creator, optionally transfer createdBy to first remaining player
        if (t.players.length && !t.players.includes(t.createdBy)) {
          const newCreator = t.players[0];
          console.log(`[TournamentManager] Transferring ownership of tournament ${t.id} from ${t.createdBy} to ${newCreator}`);
          t.createdBy = newCreator;
          changed = true;
        }
        // If no players remain, cancel it
        if (beforeCount > 0 && t.players.length === 0 && t.status === 'waiting') {
          t.status = 'cancelled';
          changed = true;
          console.log(`[TournamentManager] Cancelled empty tournament ${t.id}`);
        }
      }
      
      // Log any tournaments that might be problematic
      if (['waiting','countdown','running'].includes(t.status)) {
        console.log(`[TournamentManager] Active tournament found: ${t.id} (${t.name}) - status: ${t.status}, players: [${t.players?.join(', ') || ''}], created by: ${t.createdBy}`);
      }
    }
    
    if (changed) {
      console.log('[TournamentManager] Startup cleanup adjusted tournaments, persisting...');
      this.persist();
    } else {
      console.log('[TournamentManager] Startup cleanup completed - no changes needed');
    }
  }

  // Helper to extract timestamp from room ID format: remote_TIMESTAMP_randomstring
  private extractTimeFromRoomId(roomId: string): number | null {
    const match = roomId.match(/^remote_(\d+)_/);
    return match ? parseInt(match[1]) : null;
  }

  // Keep userId -> socketId mapping fresh when users reconnect
  updatePlayerSocket(userId: string, socketId: string) {
    for (const t of this.tournaments.values()) {
      if (t.players.includes(userId)) {
        t.playersSockets[userId] = socketId;
        if (!t.sockets.includes(socketId)) t.sockets.push(socketId);
      }
    }
    this.persist();
  }

  listUpcoming(now = Date.now()) {
    return Array.from(this.tournaments.values()).filter(t => t.status === 'waiting' && t.startsAt > now);
  }
  listAll() { return Array.from(this.tournaments.values()); }
  // Alias for clarity in callers
  listAvailable(now = Date.now()) { return this.listUpcoming(now); }
  listCompleted() { 
    // CRITICAL FIX: Only return tournaments that are actually completed, not cancelled
    return Array.from(this.tournaments.values()).filter(t => t.status === 'completed' && t.result?.winner); 
  }
  listActiveForUser(userId: string) {
    return Array.from(this.tournaments.values()).filter(t => ['waiting','countdown','running'].includes(t.status) && t.players.includes(userId));
  }

  create(name: string, creatorUserId: string, creatorSocket: Socket, startsInMinutes: number) {
    const startsAt = Date.now() + Math.min(30, Math.max(1, startsInMinutes)) * 60 * 1000;
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    // Enforce unique name among available tournaments (case-insensitive, trimmed)
    const normalized = name.trim().toLowerCase();
    const conflict = this.listUpcoming().some(t => (t.name || '').trim().toLowerCase() === normalized);
    if (conflict) {
      throw new Error('Tournament name already exists');
    }
    // Before enforcing single-active rule, prune any stale participation for this user (e.g., after server restart)
    this.pruneStaleParticipationForUser(creatorUserId);
    // Disallow creation if user is already registered in any active (waiting/countdown/running) tournament
    if (this.userInActiveTournament(creatorUserId)) {
      throw new Error('Already registered in another tournament');
    }
    const t: Tournament = {
      id,
      name,
      createdBy: creatorUserId,
      startsAt,
      status: 'waiting',
      players: [creatorUserId],
      sockets: [creatorSocket.id],
      playersSockets: { [creatorUserId]: creatorSocket.id }
    };
    this.ensureDefaults(t);
    this.tournaments.set(id, t);

    // Lookup current display name (alias preferred) and cache it for the creator
    try {
      db.get('SELECT u.username, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId WHERE u.id = ?', [creatorUserId], (err: any, row: any) => {
        if (!err && row) {
          const name = this.formatDisplayName(row.alias, row.username, creatorUserId);
          t.playerNames![creatorUserId] = name;
          try { this.persist(); } catch {}
        }
      });
    } catch {}

    this.persist();
    return t;
  }

  // Helper: is user currently listed in any tournament that hasn't completed/cancelled?
  userInActiveTournament(userId: string) {
    for (const t of this.tournaments.values()) {
      if (['waiting','countdown','running'].includes(t.status) && t.players.includes(userId)) return true;
    }
    return false;
  }

  join(id: string, userId: string, socket: Socket) {
    const t = this.tournaments.get(id);
    if (!t) throw new Error('Tournament not found');
    if (t.status !== 'waiting') throw new Error('Tournament already started');
    this.ensureDefaults(t);
    // Prune stale participation for this user across other tournaments before checking conflicts
    this.pruneStaleParticipationForUser(userId);
    // Enforce not already in another tournament (waiting/countdown/running)
    const conflict = this.userInActiveTournament(userId);
    if (conflict) throw new Error('Already registered in another tournament');
    if (t.players.includes(userId)) {
      throw new Error('Already joined this tournament');
    }
    t.players.push(userId);
    if (!t.sockets.includes(socket.id)) t.sockets.push(socket.id);
    t.playersSockets[userId] = socket.id;

    // Lookup current display name (alias preferred) and cache it
    try {
      console.log(`[TournamentManager] Fetching alias for user ${userId} joining tournament ${t.id}`);
      db.get('SELECT u.username, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId WHERE u.id = ?', [userId], (err: any, row: any) => {
        console.log(`[TournamentManager] DB result for user ${userId}:`, { err, row });
        if (!err && row) {
          const name = this.formatDisplayName(row.alias, row.username, userId);
          console.log(`[TournamentManager] Setting display name for user ${userId}: "${name}" (alias: ${row.alias}, username: ${row.username})`);
          t.playerNames![userId] = name;
          // Persist again with name included & broadcast update so any lobby UI can refresh names
          try { this.persist(); } catch {}
          try { const io = (global as any).fastifyIo; if (io) this.broadcast(io, t, 'tournament_update', { id: t.id, players: t.players, playerNames: t.playerNames }); } catch {}
        }
      });
    } catch (e) {
      console.error(`[TournamentManager] Error fetching alias for user ${userId}:`, e);
    }
    // Do not immediately lock on join; locks are applied during tick when window criteria met
    this.persist();
    return t;
  }

  leave(id: string, socketId: string) {
    const t = this.tournaments.get(id);
    if (!t) return;
    this.ensureDefaults(t);
    t.sockets = t.sockets.filter(s => s !== socketId);
    // Remove any user mapping pointing to this socket
    if (t.playersSockets) {
      for (const [uid, sid] of Object.entries(t.playersSockets)) {
        if (sid === socketId) delete t.playersSockets[uid];
      }
    }
    this.persist();
  }
  // Explicit leave by user before the tournament starts (waiting or countdown)
  leaveByUser(id: string, userId: string) {
    const t = this.tournaments.get(id);
    if (!t) throw new Error('Tournament not found');
    if (!(t.status === 'waiting' || t.status === 'countdown')) throw new Error('Cannot leave after start');
    this.ensureDefaults(t);
    t.players = t.players.filter(p => p !== userId);
    if (t.playersSockets) delete t.playersSockets[userId];
    // After removal, recompute participation and clear lock if free
    if (!this.isUserActive(userId)) {
      try { activityManager.setTournamentLock(userId, false); } catch {}
    }
  // Explicitly clear any tournament lock (in waiting/counted down phase leaving should free immediately)
  try { activityManager.setTournamentLock(userId, false); } catch {}
    // Also prune any socket tracked for this user (best-effort)
    if (t.sockets?.length) {
      const userSocketId = Object.values(t.playersSockets || {}).find(() => false);
      // no-op: we don't reliably track per-user sockets here
    }
    this.persist();
    return t;
  }
  leaveAllBySocket(socketId: string) {
    for (const t of this.tournaments.values()) {
      this.ensureDefaults(t);
      const before = t.sockets.length;
      t.sockets = t.sockets.filter(s => s !== socketId);
      if (t.playersSockets) {
        for (const [uid, sid] of Object.entries(t.playersSockets)) {
          if (sid === socketId) delete t.playersSockets[uid];
        }
      }
      if (t.sockets.length !== before) this.persist();
    }
  }

  // Called periodically from server to check start times - optimized to only process active tournaments
  tick(io: import('socket.io').Server) {
    const now = Date.now();
    const activeTournaments = Array.from(this.tournaments.values()).filter(t => 
      ['waiting', 'countdown', 'running'].includes(t.status)
    );
    
    // Reduced logging - only log when there are active tournaments and less frequently
    if (activeTournaments.length > 0 && now % 30000 < 10000) { // Only every 30 seconds
      console.log(`[TournamentTick] Processing ${activeTournaments.length} active tournaments`);
    }
    
    // Early return if no active tournaments to reduce CPU usage
    if (activeTournaments.length === 0) return;
    
    let needsPersist = false;
    
    for (const t of activeTournaments) {
      // Remove any tournament locks accidentally lingering while still in waiting (we no longer pre-lock)
      if (t.status === 'waiting') {
        for (const uid of t.players) { try { activityManager.setTournamentLock(uid, false); } catch {} }
      }
      if (t.status === 'waiting' && now >= t.startsAt) {
        if (t.players.length >= 4) {
          // Start countdown
          t.status = 'countdown';
    this.ensureDefaults(t);
          t.countdownUntil = now + 10_000;
          // Countdown started: lock all participants (active lock window begins here)
          for (const uid of t.players) { if ((t.eliminated||[]).includes(uid)) continue; try { activityManager.setTournamentLock(uid, true); } catch {} }
          const seconds = Math.max(0, Math.ceil((t.countdownUntil - now) / 1000));
          this.broadcast(io, t, 'tournament_countdown', { id: t.id, seconds });
        } else {
          // Cancel if not enough players
          t.status = 'cancelled';
          this.broadcast(io, t, 'tournament_cancelled', { id: t.id });
          // Immediately clear all locks so participants are freed
          this.clearAllLocks(t);
        }
        needsPersist = true;
      } else if (t.status === 'countdown') {
        if (!t.countdownUntil) {
          t.countdownUntil = now + 10_000;
        }
        const seconds = Math.max(0, Math.ceil((t.countdownUntil - now) / 1000));
        if (seconds <= 0) {
          this.matchFlow.startTournament(io, t.id);
        } else {
          // Tournament running: keep locks (already set) — ensure any late additions locked
          for (const uid of t.players) { if ((t.eliminated||[]).includes(uid)) continue; try { activityManager.setTournamentLock(uid, true); } catch {} }
          this.broadcast(io, t, 'tournament_countdown', { id: t.id, seconds });
        }
        needsPersist = true;
      } else if (t.status === 'running') {
        console.log(`[TournamentTick] Processing running tournament ${t.id}`);
        try {
          console.log(`[TournamentTick] Bracket state:`, JSON.stringify(t.bracket, (key, value) => {
            // Skip Timer objects and circular references that might cause issues
            if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Timeout') {
              return '[Timeout Object]';
            }
            return value;
          }, 2));
        } catch (e) {
          console.log(`[TournamentTick] Bracket state: [Unable to serialize bracket - ${e.message}]`);
        }
        // Fallback safeguard: if both semifinal winners determined but final invite not yet issued (e.g., server restart), issue it.
        try {
          if (shouldInviteFinal(t)) {
            console.log(`[TournamentTick] Should invite final for tournament ${t.id}`);
            this.initiateMatchInvite(io, t, 'final');
          } else {
            console.log(`[TournamentTick] Should NOT invite final yet for tournament ${t.id}`);
          }
          // Additional fallback: final invite accepted by both but room not created (retry)
          const f: any = t.bracket?.final;
          if (f?.invite && f.invite.p1 === 'accepted' && f.invite.p2 === 'accepted' && !f.roomId) {
            console.warn('[TournamentTick] Final invite fully accepted but no room yet. Retrying startMatch evaluation.', { id: t.id });
            try { this.matchFlow.evaluateMatchInvite(io, t.id, 'final'); } catch (e) { console.error('[TournamentTick] Retry final start failed', e); }
          }
          // Continuous elimination evaluation to auto-complete/cancel stuck tournaments (e.g., one finalist only)
          try { this.evaluateElimination(io, t); } catch {}
        } catch {}
      }
    }
    
    // Single persist call at the end instead of multiple calls during processing
    if (needsPersist) {
      this.persist();
    }
  }

  // Socket lookup delegated to helper
  private getSocketByUserId(io: import('socket.io').Server, t: Tournament, userId: string) { return getSocketByUserId(io, t, userId); }

  // Send a 30s accept/decline invite for the given match before starting actual game room
  private initiateMatchInvite(io: import('socket.io').Server, t: Tournament, key: 'semi1'|'semi2'|'final') { initiateMatchInvite(io, t, key, () => this.matchFlow.evaluateMatchInvite(io, t.id, key)); }

  // Player response handler (called from server/index socket listener)
  respondToMatchInvite(io: import('socket.io').Server, tournamentId: string, matchKey: 'semi1'|'semi2'|'final', userId: string, response: 'accept'|'decline') {
    const t = this.tournaments.get(tournamentId); if (!t || !t.bracket) return; const match: any = t.bracket[matchKey]; if (!match?.invite) return; if (Date.now() > match.invite.expiresAt) return;
    if (match.p1 === userId && match.invite.p1 === 'pending') match.invite.p1 = response === 'accept' ? 'accepted' : 'declined';
    if (match.p2 === userId && match.invite.p2 === 'pending') match.invite.p2 = response === 'accept' ? 'accepted' : 'declined';
    if (response === 'decline') { this.eliminate(t, userId, 'declined'); }
    this.broadcast(io, t, 'tournament_match_invite_update', { id: t.id, matchKey, invite: match.invite });
  this.matchFlow.evaluateMatchInvite(io, tournamentId, matchKey); this.persist();
  }

  // Call when a game result is saved to advance bracket
  onGameResult(io: import('socket.io').Server, result: GameResult) { this.matchFlow.onGameResult(io, result); }

  private broadcast(io: import('socket.io').Server, t: Tournament, event: string, payload: any) {
    // Sanitize bracket invites (strip timerId) if present in payload
    if (payload?.bracket) {
      const clean: any = { ...payload.bracket };
      for (const key of ['semi1','semi2','final']) {
        if (clean[key]?.invite?.timerId) {
          const { timerId, ...rest } = clean[key].invite; clean[key].invite = rest;
        }
      }
      payload = { ...payload, bracket: clean, eliminationReasons: t.eliminationReasons };
    } else {
      payload = { ...payload, eliminationReasons: t.eliminationReasons };
    }
    for (const sId of t.sockets) {
      io.sockets.sockets.get(sId)?.emit(event, payload);
    }
  }

  // Returns true if user is still participating (not eliminated) in an active tournament
  isUserActive(userId: string) {
    // Pure scan (avoid consulting activityManager to prevent circular lock dependency)
    for (const t of this.tournaments.values()) {
      if (!['waiting','countdown','running'].includes(t.status)) continue;
      if (t.players?.includes(userId) && !(t.eliminated||[]).includes(userId)) return true;
    }
    return false;
  }

  // Returns true if user is in countdown or running (lock periods)
  isUserLocked(userId: string, now = Date.now()) {
    for (const t of this.tournaments.values()) {
      if (!['countdown','running'].includes(t.status)) continue;
      if (!t.players?.includes(userId)) continue;
      if ((t.eliminated||[]).includes(userId)) continue;
      return true;
    }
    return false;
  }

  persist() {
    for (const t of this.tournaments.values()) {
      const copy: any = { ...t };
      if (copy.bracket) {
        const cleanBracket: any = {};
        for (const key of ['semi1','semi2','final'] as const) {
          const m: any = copy.bracket[key];
          if (!m) continue;
          const { invite, ...restMatch } = m;
          if (invite) {
            const { timerId, ...restInvite } = invite as any;
            cleanBracket[key] = { ...restMatch, invite: restInvite };
          } else cleanBracket[key] = { ...restMatch };
        }
        copy.bracket = cleanBracket;
      }
      upsertTournament(copy);
    }
  }

  private evaluateElimination(io: import('socket.io').Server, t: Tournament) {
    const res = evaluateEliminationState(t);
    if (res.winnerDeclared) { 
      this.broadcast(io, t, 'tournament_completed', { id: t.id, result: t.result });
      this.clearAllLocks(t);
      return; 
    }
    if (res.cancelled) { 
      this.broadcast(io, t, 'tournament_cancelled', { id: t.id });
      this.clearAllLocks(t);
      return; 
    }
    
    // CRITICAL FIX: Always clear locks for completed/cancelled tournaments
    // even if evaluateEliminationState doesn't return flags (due to status already changed)
    if (t.status === 'completed' || t.status === 'cancelled') {
      console.log(`[TournamentManager] Force clearing locks for ${t.status} tournament ${t.id}`);
      this.clearAllLocks(t);
      return;
    }
  }

  private eliminate(t: Tournament, userId: string, reason: string) {
    t.eliminated = Array.from(new Set([...(t.eliminated||[]), userId]));
    t.eliminationReasons = t.eliminationReasons || {}; t.eliminationReasons[userId] = t.eliminationReasons[userId] || reason;
    // Clear locks immediately when eliminated
    try { 
      activityManager.setTournamentLock(userId, false); 
      activityManager.unlockUser(userId);
      console.log(`[TournamentManager] Eliminated and unlocked user ${userId} from tournament ${t.id} (reason: ${reason})`);
    } catch (e) {
      console.error(`[TournamentManager] Failed to unlock eliminated user ${userId}:`, e);
    }
  }

  // Clear locks for all participants when tournament completes or cancels
  private clearAllLocks(t: Tournament) {
    console.log(`[TournamentManager] Clearing all locks for tournament ${t.id} with players: [${t.players.join(', ')}]`);
    
    // Clear any pending match invite timers to prevent memory leaks
    if (t.bracket) {
      for (const key of ['semi1', 'semi2', 'final'] as const) {
        const match = t.bracket[key];
        if (match?.invite?.timerId) {
          clearTimeout(match.invite.timerId);
          delete match.invite.timerId;
        }
      }
    }
    
    for (const uid of t.players) {
      try { 
        activityManager.setTournamentLock(uid, false); 
        activityManager.unlockUser(uid); 
        console.log(`[TournamentManager] Cleared locks for user ${uid}`);
      } catch (e) {
        console.error(`[TournamentManager] Failed to clear locks for user ${uid}:`, e);
      }
    }
  }

  // Remove a user's membership from tournaments that are in pre-start phases if their socket mapping is absent.
  private pruneStaleParticipationForUser(userId: string) {
    let changed = false;
    console.log(`[TournamentManager] Pruning stale participation for user ${userId}`);
    
    for (const t of this.tournaments.values()) {
      if (!['waiting','countdown'].includes(t.status)) continue;
      if (!t.players.includes(userId)) continue;
      
      this.ensureDefaults(t);
      const sid = t.playersSockets?.[userId];
      const socketTracked = sid && t.sockets.includes(sid);
      
      console.log(`[TournamentManager] User ${userId} in tournament ${t.id} - socketId: ${sid}, socketTracked: ${socketTracked}, allSockets: [${t.sockets.join(', ')}]`);
      
      if (!socketTracked) {
        t.players = t.players.filter(p => p !== userId);
        if (t.playersSockets) delete t.playersSockets[userId];
        console.log(`[TournamentManager] Pruned stale user ${userId} from tournament ${t.id} during create/join validation`);
        changed = true;
        // If tournament now has <1 player, mark cancelled to prevent dangling empty waiters
        if (t.players.length === 0) {
          t.status = 'cancelled';
          console.log(`[TournamentManager] Cancelled empty tournament ${t.id} after pruning`);
        }
      }
    }
    
    if (changed) {
      console.log(`[TournamentManager] Pruning for user ${userId} made changes, persisting...`);
      this.persist();
    } else {
      console.log(`[TournamentManager] No stale participation found for user ${userId}`);
    }
  }

  // Update cached alias / display name for a user across all active tournaments.
  // Called when user changes alias. Will also update bracket participant names for matches not yet started (no roomId).
  updateAlias(userId: string, newAlias: string) {
    let changed = false;
    const io = (global as any).fastifyIo;
    for (const t of this.tournaments.values()) {
      if (!['waiting','countdown','running'].includes(t.status)) continue;
      if (!t.players.includes(userId)) continue;
      this.ensureDefaults(t);
      const prev = t.playerNames?.[userId];
      if (prev === newAlias) continue;
      t.playerNames![userId] = newAlias;
      // Update bracket names where applicable (only if match not started / no room)
      if (t.bracket) {
        for (const key of ['semi1','semi2','final'] as const) {
          const m: any = t.bracket[key];
          if (!m) continue;
          if (m.p1 === userId && !m.roomId) m.p1Name = newAlias;
          if (m.p2 === userId && !m.roomId) m.p2Name = newAlias;
          if (m.winner === userId) m.winnerName = newAlias; // ensure winner display updates post-completion
        }
      }
      changed = true;
      if (io) {
        try { this.broadcast(io, t, 'tournament_update', { id: t.id, bracket: t.bracket, players: t.players, playerNames: t.playerNames }); } catch {}
      }
    }
    if (changed) this.persist();
  }
}

export const tournamentManager = new TournamentManager();
