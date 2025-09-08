import { Socket } from 'socket.io';

export type TournamentStatus = 'waiting' | 'countdown' | 'running' | 'completed' | 'cancelled';

// Track per-match acceptance workflow
export interface MatchInviteState { p1?: 'pending'|'accepted'|'declined'; p2?: 'pending'|'accepted'|'declined'; expiresAt: number; timerId?: any; }

export interface TournamentBracketMatch { p1?: string; p2?: string; p1Name?: string; p2Name?: string; roomId?: string; winner?: string; winnerName?: string; retryCount?: number; invite?: MatchInviteState; score?: { p1: number; p2: number }; endReason?: string; }

export interface TournamentResult { winner: string; runnersUp: string[]; completedAt: string; }

export interface Tournament {
  id: string; name: string; createdBy: string; startsAt: number; status: TournamentStatus; players: string[]; sockets: string[];
  countdownUntil?: number; playersSockets: Record<string,string>; bracket?: { semi1?: TournamentBracketMatch; semi2?: TournamentBracketMatch; final?: TournamentBracketMatch };
  result?: TournamentResult; eliminated?: string[]; eliminationReasons?: Record<string,string>;
  // Cached display names (alias if set, else username) captured at join / alias update
  playerNames?: Record<string,string>;
}

export interface ITournamentPersistence { upsert(t: Tournament): void; }
