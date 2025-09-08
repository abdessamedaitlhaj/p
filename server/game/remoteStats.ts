import type { PerMatchStats, GameResult, GameSettingsWithTheme } from '../types';
import { GameState } from './GameState';

export interface RemoteStatsTracker {
  startTimeMs: number; currentRallyHits: number; rallyLengths: number[]; pointsTimeline: Array<'p1'|'p2'>; momentumTimeline: Array<{ t:number; leader:'p1'|'p2'|'tie'; score:{p1:number;p2:number} }>;
}

export function createStatsTracker(): RemoteStatsTracker {
  return { startTimeMs: Date.now(), currentRallyHits: 0, rallyLengths: [], pointsTimeline: [], momentumTimeline: [] };
}

export function recordScored(tracker: RemoteStatsTracker, state: GameState, scoredBy?: 'p1'|'p2') {
  tracker.rallyLengths.push(tracker.currentRallyHits); tracker.currentRallyHits = 0; if (scoredBy) tracker.pointsTimeline.push(scoredBy);
  const diff = state.score.p1 - state.score.p2; const leader: 'p1'|'p2'|'tie' = diff===0 ? 'tie' : diff>0 ? 'p1' : 'p2';
  tracker.momentumTimeline.push({ t: Date.now() - tracker.startTimeMs, leader, score: { ...state.score } });
}

export function recordPaddleHit(tracker: RemoteStatsTracker) { tracker.currentRallyHits += 1; }

export function buildResult(tracker: RemoteStatsTracker, state: GameState, original: GameSettingsWithTheme, winner: 'p1'|'p2'|'none', matchType: string, ids: { p1: string; p2: string }, roomId: string): GameResult {
  const { theme: _omitTheme, ...settingsNoTheme } = original as any; const duration = Date.now() - tracker.startTimeMs;
  const longestRally = tracker.rallyLengths.length ? Math.max(...tracker.rallyLengths) : 0;
  const averageRally = tracker.rallyLengths.length ? (tracker.rallyLengths.reduce((a,b)=>a+b,0) / tracker.rallyLengths.length) : 0;
  const computeComeback = (timeline: Array<'p1'|'p2'>, finalWinner: 'p1'|'p2'|'none') => { if (finalWinner === 'none') return 0; let sp1=0, sp2=0, minDiffP1=0, minDiffP2=0; for (const s of timeline) { if (s==='p1') sp1++; else sp2++; minDiffP1 = Math.min(minDiffP1, sp1 - sp2); minDiffP2 = Math.min(minDiffP2, sp2 - sp1); } return finalWinner==='p1' ? Math.max(0, -minDiffP1) : Math.max(0, -minDiffP2); };
  const perMatchStats: PerMatchStats = { finalScore: { ...state.score }, pointsTimeline: tracker.pointsTimeline, rallyLengths: tracker.rallyLengths, longestRally, averageRally, comebackFactor: computeComeback(tracker.pointsTimeline, winner), momentumTimeline: tracker.momentumTimeline, matchDurationMs: duration };
  return { roomId: roomId as any, winner, score: state.score, settings: settingsNoTheme, status: state.endReason as any || 'completed', matchType, endedAt: new Date().toISOString(), player1UserId: ids.p1, player2UserId: ids.p2, perMatchStats };
}
