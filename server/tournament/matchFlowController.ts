import { roomManager } from '../roomManager';
import type { Tournament } from './types';
import { shouldInviteFinal } from './bracketController';
import { initiateMatchInvite } from './matchHelpers';
import { db } from '../db/db';
import type { GameResult } from '../types';

function formatDisplayName(alias: string | null, username: string | null, fallback: string): string {
  if (alias && username) {
    return `${alias} (#${username})`;
  } else if (username) {
    return `#${username}`;
  }
  return fallback;
}

export class MatchFlowController {
  constructor(private tournaments: Map<string, Tournament>, private broadcast: (io: import('socket.io').Server, t: Tournament, event: string, payload: any) => void, private persist: () => void, private evaluateElimination: (io: import('socket.io').Server, t: Tournament) => void) {}


  // Start tournament bracket (called from manager.tick when countdown hits 0)
  startTournament(io: import('socket.io').Server, id: string) {
    const t = this.tournaments.get(id);
    if (!t || t.status !== 'countdown') return;
    // Take first 4 players
    const [u1,u2,u3,u4] = t.players.slice(0,4);
    const getDisplayName = (uid: string) => new Promise<string>((resolve) => {
      db.get('SELECT u.username, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId WHERE u.id = ?', [uid], (err: any, row: any) => {
        if (row?.alias) resolve(row.alias);
        else if (row?.username) resolve(row.username);
        else resolve(uid);
      });
    });
    Promise.all([getDisplayName(u1), getDisplayName(u2), getDisplayName(u3), getDisplayName(u4)]).then(([n1,n2,n3,n4]) => {
      t.bracket = { semi1: { p1: u1, p2: u2, p1Name: n1, p2Name: n2 }, semi2: { p1: u3, p2: u4, p1Name: n3, p2Name: n4 }, final: {} };
      t.status = 'running';
      this.broadcast(io, t, 'tournament_started', { id: t.id, bracket: t.bracket });
      initiateMatchInvite(io, t, 'semi1', () => this.evaluateMatchInvite(io, t.id, 'semi1'));
      initiateMatchInvite(io, t, 'semi2', () => this.evaluateMatchInvite(io, t.id, 'semi2'));
      this.persist();
    }).catch(() => {
      t.bracket = { semi1: { p1: u1, p2: u2 }, semi2: { p1: u3, p2: u4 }, final: {} };
      t.status = 'running';
      this.broadcast(io, t, 'tournament_started', { id: t.id, bracket: t.bracket });
      initiateMatchInvite(io, t, 'semi1', () => this.evaluateMatchInvite(io, t.id, 'semi1'));
      initiateMatchInvite(io, t, 'semi2', () => this.evaluateMatchInvite(io, t.id, 'semi2'));
      this.persist();
    });
  }

  onGameResult(io: import('socket.io').Server, result: GameResult) {
    const t = this.tournaments.get(result.matchType);
    if (!t || !t.bracket) return;
    let advanced = false;
    for (const key of ['semi1','semi2','final'] as const) {
      const m = t.bracket[key];
      if (m?.roomId === result.roomId) {
        const winner = result.winner === 'p1' ? m.p1 : result.winner === 'p2' ? m.p2 : undefined;
        if (winner) {
          m.winner = winner; m.winnerName = result.winner === 'p1' ? (m.p1Name || m.p1) : (m.p2Name || m.p2);
          (m as any).score = result.score; (m as any).endReason = result.status;
          const loser = m.p1 === winner ? m.p2 : m.p2 === winner ? m.p1 : undefined;
          if (loser) { 
            t.eliminated = Array.from(new Set([...(t.eliminated||[]), loser])); 
            if (!t.eliminationReasons![loser]) t.eliminationReasons![loser] = 'lost';
            // Immediately unlock eliminated player
            try { 
              const { activityManager } = require('../../activityManager'); 
              activityManager.setTournamentLock(loser, false); 
              activityManager.unlockUser(loser);
              console.log(`[MatchFlow] Eliminated and unlocked loser ${loser} from tournament ${t.id}`);
            } catch (e) {
              console.error(`[MatchFlow] Failed to unlock loser ${loser}:`, e);
            }
          }
        } else {
          if (key === 'semi1' || key === 'semi2') {
            t.eliminated = Array.from(new Set([...(t.eliminated||[]), m.p1, m.p2]));
            if (m.p1) t.eliminationReasons![m.p1] = t.eliminationReasons![m.p1] || 'both_exit';
            if (m.p2) t.eliminationReasons![m.p2] = t.eliminationReasons![m.p2] || 'both_exit';
            try { const { activityManager } = require('../../activityManager'); const { tournamentManager } = require('../../tournamentManager'); for (const uid of [m.p1, m.p2]) if (uid && !tournamentManager.isUserActive(uid)) activityManager.setTournamentLock(uid, false); } catch {}
            m.winner = undefined; m.winnerName = undefined;
          } else if (key === 'final') {
            t.status = 'cancelled'; this.broadcast(io, t, 'tournament_cancelled', { id: t.id });
            // Use centralized unlock mechanism
            this.evaluateElimination(io, t);
            this.persist(); return;
          }
        }
        if (key === 'semi1') {
          if (m.winner) { t.bracket.final!.p1 = m.winner; t.bracket.final!.p1Name = m.winnerName || m.winner; }
        } else if (key === 'semi2') {
          if (m.winner) { t.bracket.final!.p2 = m.winner; t.bracket.final!.p2Name = m.winnerName || m.winner; }
        } else if (key === 'final') {
          if (m.winner) {
            t.status = 'completed';
            t.result = { 
              winner: m.winnerName || m.winner, 
              runnersUp: [
                t.bracket.semi1!.p1Name || t.bracket.semi1!.p1!, 
                t.bracket.semi1!.p2Name || t.bracket.semi1!.p2!, 
                t.bracket.semi2!.p1Name || t.bracket.semi2!.p1!, 
                t.bracket.semi2!.p2Name || t.bracket.semi2!.p2!
              ].filter(u => u !== (m.winnerName || m.winner)), 
              completedAt: new Date().toISOString() 
            };
            
            // Send winner notification to the tournament winner
            try {
              const winnerId = m.winner;
              if (winnerId) {
                const winnerSocket = this.getSocketByUserId(io, t, winnerId);
                if (winnerSocket) {
                  console.log(`[MatchFlow] Sending tournament win notification to ${winnerId}`);
                  winnerSocket.emit('tournament_winner', { 
                    tournamentId: t.id,
                    tournamentName: t.name,
                    message: `🏆 Congratulations! You won the tournament: ${t.name}`
                  });
                }
              }
            } catch (error) {
              console.error(`[MatchFlow] Error sending winner notification:`, error);
            }
            
            this.broadcast(io, t, 'tournament_completed', { id: t.id, result: t.result });
            // Use centralized unlock mechanism
            this.evaluateElimination(io, t);
            this.persist(); 
            return;
          }
        }
        advanced = true; break;
      }
    }
    // Fallback: ensure loser(s) of semifinals have match lock cleared if room deletion hasn't yet occurred
    try {
      const { activityManager } = require('../../activityManager');
      if (result.matchType === t.id && (result.status === 'completed' || result.status === 'disconnected' || result.status === 'exited')) {
        const p1 = result.player1UserId ? String(result.player1UserId) : undefined;
        const p2 = result.player2UserId ? String(result.player2UserId) : undefined;
        if (p1 && p2 && result.winner) {
          const loser = result.winner === 'p1' ? p2 : p1;
          if (loser && !this.tournaments.get(t.id)?.players.includes(loser)) {
            // no-op: loser not part of tournament (shouldn't happen)
          }
          // Unlock loser match state (tournament lock handled elsewhere when eliminated)
          activityManager.unlockUser(loser);
        }
      }
    } catch {}
    if (advanced && t.status !== 'completed') {
      this.broadcast(io, t, 'tournament_update', { id: t.id, bracket: t.bracket });
      if (shouldInviteFinal(t)) {
        setTimeout(() => { const freshT = this.tournaments.get(t.id); if (!freshT || freshT.status !== 'running') return; if (shouldInviteFinal(freshT)) initiateMatchInvite(io, freshT, 'final', () => this.evaluateMatchInvite(io, freshT.id, 'final')); }, 1200);
      }
      // Rescue: if after 3s both semi winners are set but no final invite (missed broadcast), force initiate
      setTimeout(() => {
        const fresh = this.tournaments.get(t.id); if (!fresh || fresh.status !== 'running' || !fresh.bracket) return;
        const fb: any = fresh.bracket; const final = fb.final;
        if (fb.semi1?.winner && fb.semi2?.winner && !final?.invite && !final?.roomId) {
          console.warn('[MatchFlow] Forcing final invite (rescue)', { tid: fresh.id });
          initiateMatchInvite(io, fresh, 'final', () => this.evaluateMatchInvite(io, fresh.id, 'final'));
        }
      }, 3000);
    }
    this.evaluateElimination(io, t); this.persist();
  }

  evaluateMatchInvite(io: import('socket.io').Server, tournamentId: string, matchKey: 'semi1'|'semi2'|'final') {
    const t = this.tournaments.get(tournamentId);
    if (!t || !t.bracket) return;
    const match: any = t.bracket[matchKey];
    if (!match?.invite || match.roomId) return;
    if (matchKey === 'final') {
      console.log('[MatchFlow] Evaluating final invite', { tournamentId, p1: match.p1, p2: match.p2, invite: match.invite });
    }
    const inv = match.invite; const expired = Date.now() > inv.expiresAt; const p1 = inv.p1; const p2 = inv.p2;
    if (p1 === 'accepted' && p2 === 'accepted') { clearTimeout(inv.timerId); match.invite = undefined; this.startMatch(io, t, matchKey); return; }
    if (p1 === 'declined' && p2 !== 'declined') { this.walkover(io, t, matchKey, match.p2, match.p2Name); return; }
    if (p2 === 'declined' && p1 !== 'declined') { this.walkover(io, t, matchKey, match.p1, match.p1Name); return; }
    if ((p1 === 'declined' && p2 === 'declined') || (expired && (p1 !== 'accepted' && p2 !== 'accepted'))) {
      if (matchKey === 'semi1' || matchKey === 'semi2') {
        match.winner = undefined; match.winnerName = undefined; match.invite = undefined; 
        t.eliminated = Array.from(new Set([...(t.eliminated||[]), match.p1, match.p2])); 
        t.eliminationReasons![match.p1] = t.eliminationReasons![match.p1] || (p1==='declined'?'declined':'no_response'); 
        t.eliminationReasons![match.p2] = t.eliminationReasons![match.p2] || (p2==='declined'?'declined':'no_response');
        
        const otherKey = matchKey === 'semi1' ? 'semi2' : 'semi1'; 
        const other = (t.bracket as any)[otherKey];
        
        try { 
          const { activityManager } = require('../../activityManager'); 
          for (const uid of [match.p1, match.p2]) {
            if (uid) { 
              activityManager.unlockUser(uid); 
              if (!require('../../tournamentManager').tournamentManager.isUserActive(uid)) {
                activityManager.setTournamentLock(uid, false); 
              }
            }
          }
        } catch {}
        
        // CRITICAL FIX: Check if 3+ players declined total across both semis
        const totalDeclined = (t.eliminated || []).filter(uid => 
          t.eliminationReasons?.[uid] === 'declined'
        ).length;
        
        console.log(`[MatchFlow] ${totalDeclined} players declined in tournament ${t.id}`);
        
        if (totalDeclined >= 3) {
          console.log(`[MatchFlow] Cancelling tournament ${t.id} - ${totalDeclined} players declined`);
          t.status = 'cancelled';
          this.broadcast(io, t, 'tournament_cancelled', { 
            id: t.id, 
            reason: 'insufficient_participants'
          });
          this.evaluateElimination(io, t);
          this.persist(); 
          return;
        }
        
        if (other?.winner) { 
          t.status = 'completed'; 
          t.result = { 
            winner: other.winnerName || other.winner, 
            runnersUp: [], 
            completedAt: new Date().toISOString() 
          }; 
          this.broadcast(io, t, 'tournament_completed', { id: t.id, result: t.result });
          this.evaluateElimination(io, t); // Use centralized unlock
        } else { 
          this.broadcast(io, t, 'tournament_update', { id: t.id, bracket: t.bracket }); 
        }
      } else if (matchKey === 'final') { 
        t.status = 'cancelled'; 
        this.broadcast(io, t, 'tournament_cancelled', { 
          id: t.id, 
          reason: 'final_declined' 
        });
        this.evaluateElimination(io, t); // Use centralized unlock
      }
      try { this.evaluateElimination(io, t); } catch {}
      this.persist(); return; 
    }
    if (expired) {
      if (p1 === 'accepted' && p2 !== 'accepted') { if (match.p2) { t.eliminated = Array.from(new Set([...(t.eliminated||[]), match.p2])); t.eliminationReasons![match.p2] = t.eliminationReasons![match.p2] || 'no_response'; } this.walkover(io, t, matchKey, match.p1, match.p1Name); return; }
      if (p2 === 'accepted' && p1 !== 'accepted') { if (match.p1) { t.eliminated = Array.from(new Set([...(t.eliminated||[]), match.p1])); t.eliminationReasons![match.p1] = t.eliminationReasons![match.p1] || 'no_response'; } this.walkover(io, t, matchKey, match.p2, match.p2Name); return; }
    }
  }

  private async startMatch(io: import('socket.io').Server, t: Tournament, key: 'semi1'|'semi2'|'final') {
    const match = t.bracket?.[key] || {};
    if (key === 'final') console.log('[MatchFlow] Attempting to start final match', { tid: t.id, p1: match.p1, p2: match.p2, eliminated: t.eliminated });
    if (!match.p1 || !match.p2) return; if (t.eliminated && (t.eliminated.includes(match.p1) || t.eliminated.includes(match.p2))) return;
    
    // Always fetch latest alias for both players before starting match
    const getDisplayName = (uid: string) => new Promise<string>((resolve) => {
      db.get('SELECT u.username, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId WHERE u.id = ?', [uid], (err: any, row: any) => {
        const name = formatDisplayName(row?.alias, row?.username, uid);
        console.log(`[StartMatch] User ${uid} display name: "${name}" (alias: ${row?.alias}, username: ${row?.username})`);
        resolve(name);
      });
    });
    console.log(`[StartMatch] Fetching fresh aliases for ${key} match: p1=${match.p1}, p2=${match.p2}`);
    const [p1Name, p2Name] = await Promise.all([getDisplayName(match.p1), getDisplayName(match.p2)]);
    match.p1Name = p1Name;
    match.p2Name = p2Name;
    console.log(`[StartMatch] Updated match names: "${p1Name}" vs "${p2Name}"`);
    const findSocket = async (userId: string) => {
      let s = this.getSocketByUserId(io, t, userId); if (s) return s; try { const sockets = await io.in(String(userId)).fetchSockets(); const candidateId = sockets?.[0]?.id as string | undefined; if (candidateId) s = io.sockets.sockets.get(candidateId) || null; } catch {} return s; };
    let s1 = await findSocket(match.p1); let s2 = await findSocket(match.p2);
    if (!s1 || !s2) { 
      match.retryCount = (match.retryCount || 0) + 1; 
      // Reduced retries from 10 to 5 and increased delay from 2s to 5s for better performance
      if (match.retryCount <= 5) { 
        setTimeout(() => { 
          const freshT = this.tournaments.get(t.id); 
          if (!freshT || freshT.status !== 'running' || !freshT.bracket) return; 
          this.startMatch(io, freshT, key); 
        }, 5000); // Changed from 2000ms to 5000ms
        return; 
      }
      delete (match as any).roomId; match.winner = s1 ? match.p1 : s2 ? match.p2 : undefined; match.winnerName = s1 ? (match.p1Name || match.p1) : s2 ? (match.p2Name || match.p2) : undefined;
      if (!s1 && match.p1) { t.eliminated = Array.from(new Set([...(t.eliminated||[]), match.p1])); t.eliminationReasons![match.p1] = t.eliminationReasons![match.p1] || 'no_show'; }
      if (!s2 && match.p2) { t.eliminated = Array.from(new Set([...(t.eliminated||[]), match.p2])); t.eliminationReasons![match.p2] = t.eliminationReasons![match.p2] || 'no_show'; }
      this.broadcast(io, t, 'tournament_update', { id: t.id, bracket: t.bracket }); const b = t.bracket;
      if (key !== 'final' && b?.semi1?.winner && b?.semi2?.winner && !b.final?.roomId) { this.startMatch(io, t, 'final'); }
      else if (key === 'final') { 
        t.status = 'completed'; 
        t.result = { winner: match.winnerName || match.winner!, runnersUp: [b!.semi1!.p1Name || b!.semi1!.p1!, b!.semi1!.p2Name || b!.semi1!.p2!, b!.semi2!.p1Name || b!.semi2!.p1!, b!.semi2!.p2Name || b!.semi2!.p2!].filter((u: string) => u !== (match.winnerName || match.winner)), completedAt: new Date().toISOString() }; 
        this.broadcast(io, t, 'tournament_completed', { id: t.id, result: t.result }); 
        // CRITICAL: Must unlock all participants when tournament completes
        this.evaluateElimination(io, t);
      }
      this.persist(); return;
    }
    // If players are in an existing remote (non-tournament) match, instruct clients to leave
    try {
      [s1, s2].forEach(s => { if (s) s.emit('tournament_force_exit_current_match'); });
    } catch {}
    const roomId = roomManager.createRemoteGameRoom(s1, s2, match.p1!, match.p2!, undefined, { matchType: t.id as any }); match.roomId = roomId; match.retryCount = 0;
  if (key === 'final') console.log('[MatchFlow] Final room created', { tid: t.id, roomId });
  try {
    const { activityManager } = require('../../activityManager');
    activityManager.lockForMatch(match.p1, match.p2);
  } catch {}
  s1.emit('remote_room_joined', { roomId, playerId: 'p1', matchType: t.id, p1Name: match.p1Name, p2Name: match.p2Name, p1Id: match.p1, p2Id: match.p2 }); s2.emit('remote_room_joined', { roomId, playerId: 'p2', matchType: t.id, p1Name: match.p1Name, p2Name: match.p2Name, p1Id: match.p1, p2Id: match.p2 });
  try { (io.to(match.p1) as any).emit('user_locked', { reason:'match', inMatch:true }); (io.to(match.p2) as any).emit('user_locked', { reason:'match', inMatch:true }); } catch {}
  }

  private walkover(io: import('socket.io').Server, t: Tournament, matchKey: 'semi1'|'semi2'|'final', winnerUserId: string, winnerName?: string) {
    if (!t.bracket) return; const match: any = t.bracket[matchKey]; if (!match) return; match.winner = winnerUserId; match.winnerName = winnerName || winnerUserId; match.invite = undefined; const loser = match.p1 === winnerUserId ? match.p2 : match.p1; if (loser) { t.eliminated = Array.from(new Set([...(t.eliminated||[]), loser])); t.eliminationReasons![loser] = t.eliminationReasons![loser] || 'walkover'; }
    this.broadcast(io, t, 'tournament_update', { id: t.id, bracket: t.bracket });
  if (matchKey === 'semi1') { (t.bracket.final||{}).p1 = winnerUserId; (t.bracket.final||{}).p1Name = match.winnerName; }
    else if (matchKey === 'semi2') { (t.bracket.final||{}).p2 = winnerUserId; (t.bracket.final||{}).p2Name = match.winnerName; }
    else if (matchKey === 'final') { t.status = 'completed'; t.result = { winner: match.winnerName || winnerUserId, runnersUp: [], completedAt: new Date().toISOString() }; this.broadcast(io, t, 'tournament_completed', { id: t.id, result: t.result }); this.evaluateElimination(io, t); this.persist(); return; }
    const b: any = t.bracket; if (shouldInviteFinal(t) && t.status === 'running') initiateMatchInvite(io, t, 'final', () => this.evaluateMatchInvite(io, t.id, 'final'));
  // Unlock loser if now fully eliminated from all active tournaments
  try { const { activityManager } = require('../../activityManager'); const { tournamentManager } = require('../../tournamentManager'); const loser = match.p1 === winnerUserId ? match.p2 : match.p1; if (loser && !tournamentManager.isUserActive(loser)) activityManager.setTournamentLock(loser, false); } catch {}
    this.evaluateElimination(io, t); this.persist();
  }

  private getSocketByUserId(io: import('socket.io').Server, t: Tournament, userId: string) {
    const sid = t.playersSockets?.[userId]; if (sid) return io.sockets.sockets.get(sid) || null;
    for (const s of io.sockets.sockets.values()) { if ((s as any).userId === userId) return s; }
    return null;
  }
}
