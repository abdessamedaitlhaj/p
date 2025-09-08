import type { GameResult as CoreGameResult } from '../types';
import { tournamentManager } from '../tournamentManager';
import { insertGameResult } from '../models/GameResults';
import { updatePlayerStats } from '../models/PlayerStats';

export interface GameResult extends CoreGameResult {}

// Persist a completed game result and update player cumulative stats
export function saveGameResult(result: GameResult) {
  // Use setImmediate to avoid blocking the game loop
  setImmediate(() => {
    try {
      insertGameResult({
        roomId: result.roomId,
        winner: result.winner,
        player1UserId: result.player1UserId ? Number(result.player1UserId) : undefined,
        player2UserId: result.player2UserId ? Number(result.player2UserId) : undefined,
        score: result.score,
        matchType: result.matchType,
        status: result.status,
        endedAt: result.endedAt,
        settings: result.settings,
        perMatchStats: result.perMatchStats
      });

    if (result.player1UserId && result.player2UserId && result.matchType !== 'local') {
      updatePlayerStats({
        userId: Number(result.player1UserId),
        didWin: result.winner === 'p1',
        scoredPoints: result.score.p1,
        matchStats: result.perMatchStats ? {
          rallyLengths: result.perMatchStats.rallyLengths,
          longestRally: result.perMatchStats.longestRally,
          matchDurationMs: result.perMatchStats.matchDurationMs
        } : undefined
      });
      updatePlayerStats({
        userId: Number(result.player2UserId),
        didWin: result.winner === 'p2',
        scoredPoints: result.score.p2,
        matchStats: result.perMatchStats ? {
          rallyLengths: result.perMatchStats.rallyLengths,
            longestRally: result.perMatchStats.longestRally,
            matchDurationMs: result.perMatchStats.matchDurationMs
        } : undefined
      });
    }

    try { tournamentManager.onGameResult((global as any).fastifyIo || (global as any).io, result as CoreGameResult); } catch {}
    } catch (e) {
      console.error('Error saving game result to DB', e);
    }
  });
}
