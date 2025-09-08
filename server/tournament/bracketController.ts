import { Tournament } from './types';

// Utility: ensure bracket object shell exists
export function ensureBracket(t: Tournament) {
  if (!t.bracket) t.bracket = { semi1: {}, semi2: {}, final: {} };
  t.bracket.semi1 = t.bracket.semi1 || {};
  t.bracket.semi2 = t.bracket.semi2 || {};
  t.bracket.final = t.bracket.final || {};
}

export function applyGameResult(t: Tournament, key: 'semi1'|'semi2'|'final', data: { winner?: string; winnerName?: string; score?: { p1:number; p2:number }; endReason?: string; }) {
  if (!t.bracket) return;
  const m: any = t.bracket[key];
  if (!m) return;
  if (data.winner) { m.winner = data.winner; m.winnerName = data.winnerName || data.winner; }
  if (data.score) (m as any).score = data.score;
  if (data.endReason) (m as any).endReason = data.endReason;
  if (key === 'semi1' && m.winner) { t.bracket.final!.p1 = m.winner; t.bracket.final!.p1Name = m.winnerName || m.winner; }
  if (key === 'semi2' && m.winner) { t.bracket.final!.p2 = m.winner; t.bracket.final!.p2Name = m.winnerName || m.winner; }
}

// Determine if final invite can start
export function shouldInviteFinal(t: Tournament) {
  const b: any = t.bracket; if (!b) return false;
  return b?.semi1?.winner && b?.semi2?.winner && !b.final?.roomId && !b.final?.invite;
}

// Simple elimination evaluation extracted for readability
export function evaluateEliminationState(t: Tournament): { winnerDeclared?: boolean; cancelled?: boolean } {
  if (!['running','countdown','waiting'].includes(t.status)) return {};
  const active = t.players.filter(p => !(t.eliminated||[]).includes(p));
  if (t.status === 'running') {
    if (active.length === 1 && (!t.bracket?.final?.roomId && !t.result)) {
      t.status = 'completed'; t.result = { winner: active[0], runnersUp: [], completedAt: new Date().toISOString() }; return { winnerDeclared: true };
    }
    if (active.length <= 1 && !t.result) {
      if (active.length === 1) { t.status = 'completed'; t.result = { winner: active[0], runnersUp: [], completedAt: new Date().toISOString() }; return { winnerDeclared: true }; }
      else { t.status = 'cancelled'; return { cancelled: true }; }
    }
  }
  return {};
}
