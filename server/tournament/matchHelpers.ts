import { Tournament, MatchInviteState } from './types';
import { ensureBracket } from './bracketController';
import { db } from '../db/db';

function formatDisplayName(alias: string | null, username: string | null, fallback: string): string {
  if (alias && username) {
    return `${alias} (#${username})`;
  } else if (username) {
    return `#${username}`;
  }
  return fallback;
}

export function getSocketByUserId(io: import('socket.io').Server, t: Tournament, userId: string) {
  const mappedId = t.playersSockets[userId]; if (mappedId) { const s = io.sockets.sockets.get(mappedId); if (s) return s; }
  for (const sId of io.sockets.sockets.keys()) { const s = io.sockets.sockets.get(sId)!; if (s.rooms.has(String(userId))) return s; }
  return null;
}

export function initiateMatchInvite(io: import('socket.io').Server, t: Tournament, key: 'semi1'|'semi2'|'final', evaluate: () => void) {
  ensureBracket(t); const match: any = t.bracket?.[key]; if (!match?.p1 || !match?.p2) return; if (match.roomId || match.invite) return;
  const expiresAt = Date.now() + 30_000; match.invite = { p1: 'pending', p2: 'pending', expiresAt } as MatchInviteState;
  
  console.log(`[MatchInvite] Fetching fresh aliases for ${key} match: p1=${match.p1}, p2=${match.p2}`);
  // Always fetch latest alias for both players before sending invite
  db.get('SELECT u.username, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId WHERE u.id = ?', [match.p1], (err1: any, row1: any) => {
    const p1Name = formatDisplayName(row1?.alias, row1?.username, match.p1);
    console.log(`[MatchInvite] P1 ${match.p1} display name: "${p1Name}" (alias: ${row1?.alias}, username: ${row1?.username})`);
    
    db.get('SELECT u.username, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId WHERE u.id = ?', [match.p2], (err2: any, row2: any) => {
      const p2Name = formatDisplayName(row2?.alias, row2?.username, match.p2);
      console.log(`[MatchInvite] P2 ${match.p2} display name: "${p2Name}" (alias: ${row2?.alias}, username: ${row2?.username})`);
      
      // Update the match names with fresh data
      match.p1Name = p1Name;
      match.p2Name = p2Name;
      
      console.log(`[MatchInvite] Sending invite for ${key} with names: "${p1Name}" vs "${p2Name}"`);
      const payloadBase = { id: t.id, matchKey: key, seconds: 30, p1: match.p1, p2: match.p2, p1Name, p2Name, expiresAt };
      const s1 = getSocketByUserId(io, t, match.p1); const s2 = getSocketByUserId(io, t, match.p2);
      s1?.emit('tournament_match_invite', { ...payloadBase, you: 'p1' }); s2?.emit('tournament_match_invite', { ...payloadBase, you: 'p2' });
      match.invite.timerId = setTimeout(() => { evaluate(); }, 30_000 + 200);
    });
  });
}
