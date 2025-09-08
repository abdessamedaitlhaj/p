import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useUsers } from '@/store/useUsers';

interface TournamentInvitePayload {
  id: string; // tournament id
  matchKey: 'semi1'|'semi2'|'final';
  seconds?: number; // initial seconds (optional)
  p1?: string;
  p2?: string;
  p1Name?: string;
  p2Name?: string;
  you?: 'p1'|'p2';
  expiresAt: number; // epoch ms
  invite?: { p1?: 'pending'|'accepted'|'declined'; p2?: 'pending'|'accepted'|'declined'; expiresAt: number };
}

interface ActiveInvite extends TournamentInvitePayload {
  remaining: number; // seconds
  sending?: boolean; // local action in-flight
}

// Responsive, stacked tournament invite cards (similar style to InviteNotification but smaller)
export const TournamentInviteCards = () => {
  const socket = useStore(s => s.socket);
  const user = useStore(s => s.user);
  const [invites, setInvites] = useState<Record<string, ActiveInvite>>({});
  const { data: users } = useUsers();
  const userMap = useMemo(() => {
    const m: Record<string,{username:string;alias?:string|null}> = {};
    (users||[]).forEach(u=>{ m[String(u.id)] = { username: u.username, alias: (u as any).alias }; });
    return m;
  }, [users]);
  const format = (uid?: string, serverName?: string) => {
    // If server provided a name (fresh from DB), use it
    if (serverName) return serverName;
    
    // Otherwise fallback to local userMap
    if (!uid) return 'Player';
    const r = userMap[uid];
    const username = r?.username || uid;
    const alias = r?.alias;
    if (alias) return `${alias} (#${username})`;
    return `#${username}`;
  };

  // Recalculate countdown each second
  useEffect(() => {
    if (!Object.keys(invites).length) return;
    const i = setInterval(() => {
      setInvites(prev => {
        const next: typeof prev = { ...prev };
        let changed = false;
        for (const k of Object.keys(next)) {
          const inv = next[k];
            const remaining = Math.max(0, Math.ceil((inv.expiresAt - Date.now())/1000));
            if (remaining !== inv.remaining) { next[k] = { ...inv, remaining }; changed = true; }
            if (remaining <= 0) { delete next[k]; changed = true; continue; }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [invites]);

  const keyOf = (p: { id: string; matchKey: string }) => `${p.id}:${p.matchKey}`;

  const removeInvite = useCallback((k: string) => {
    setInvites(prev => { const n = { ...prev }; delete n[k]; return n; });
  }, []);

  useEffect(() => {
    if (!socket || !user) return;

    const onInvite = (p: TournamentInvitePayload) => {
      // Only show if user is one of p1/p2 (server already filters, safeguard)
      if (String(p.p1) !== String(user.id) && String(p.p2) !== String(user.id)) return;
      const k = keyOf(p);
      setInvites(prev => ({ ...prev, [k]: { ...p, remaining: Math.max(0, Math.ceil((p.expiresAt - Date.now())/1000)) } }));
    };

    const onUpdate = (p: any) => {
      const k = keyOf(p);
      setInvites(prev => {
        const existing = prev[k];
        if (!existing) return prev; // not tracked
        // If invite resolved (no invite object) or both accepted -> remove
        const record = p.invite;
        if (!record || (record.p1 === 'accepted' && record.p2 === 'accepted')) {
          const n = { ...prev }; delete n[k]; return n;
        }
        return { ...prev, [k]: { ...existing, invite: record, expiresAt: record.expiresAt, remaining: Math.max(0, Math.ceil((record.expiresAt - Date.now())/1000)), sending: false } };
      });
    };

    const onBracketUpdate = (p: any) => {
      // Remove invites for matches that have advanced (winner, roomId, or no invite object)
      setInvites(prev => {
        const next = { ...prev };
        let changed = false;
        const tId = p.id;
        const bracket = p.bracket || {};
        for (const key of Object.keys(next)) {
          if (!key.startsWith(tId + ':')) continue;
          const matchKey = key.split(':')[1];
          const match = bracket[matchKey];
          if (!match) continue;
          if (match.roomId || match.winner || !match.invite) { delete next[key]; changed = true; }
        }
        return changed ? next : prev;
      });
    };
    const onTournamentResolved = (p: any) => {
      // Remove all invites for this tournament
      setInvites(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (key.startsWith(p.id + ':')) { delete next[key]; changed = true; }
        }
        return changed ? next : prev;
      });
    };
    const onRemoteRoomJoined = (payload: any) => {
      const mt = payload?.matchType;
      if (!mt || mt === 'remote' || mt === 'matchmaking') return; // tournament id format
      setInvites(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (key.startsWith(mt + ':')) { delete next[key]; changed = true; }
        }
        return changed ? next : prev;
      });
    };

    socket.on('tournament_match_invite', onInvite);
    socket.on('tournament_match_invite_update', onUpdate);
    socket.on('tournament_update', onBracketUpdate);
    socket.on('tournament_completed', onTournamentResolved);
    socket.on('tournament_cancelled', onTournamentResolved);
    socket.on('remote_room_joined', onRemoteRoomJoined);

    return () => {
      socket.off('tournament_match_invite', onInvite);
      socket.off('tournament_match_invite_update', onUpdate);
      socket.off('tournament_update', onBracketUpdate);
      socket.off('tournament_completed', onTournamentResolved);
      socket.off('tournament_cancelled', onTournamentResolved);
      socket.off('remote_room_joined', onRemoteRoomJoined);
    };
  }, [socket, user]);

  const respond = (k: string, tournamentId: string, matchKey: string, response: 'accept'|'decline') => {
    if (!socket) return;
    setInvites(prev => ({ ...prev, [k]: { ...prev[k], sending: true } }));
    socket.emit('tournament_match_invite_response', { tournamentId, matchKey, response });
    // Optimistic update of status
    setInvites(prev => {
      const cur = prev[k]; if (!cur) return prev;
      const invite = cur.invite || { p1: 'pending', p2: 'pending', expiresAt: cur.expiresAt };
      if (cur.you === 'p1' && invite.p1 === 'pending') invite.p1 = response === 'accept' ? 'accepted' : 'declined';
      if (cur.you === 'p2' && invite.p2 === 'pending') invite.p2 = response === 'accept' ? 'accepted' : 'declined';
      return { ...prev, [k]: { ...cur, invite, sending: true } };
    });
  };

  const entries = Object.entries(invites)
    .sort((a,b) => a[0].localeCompare(b[0]));

  if (!entries.length) return null;

  return (
    <div className="fixed z-[9998] bottom-4 left-4 flex flex-col gap-3 w-[18rem] sm:w-80 max-w-[90vw]">
      {entries.map(([k, inv]) => {
        const youStatus = inv.invite?.[inv.you || 'p1'];
        const otherRole = inv.you === 'p1' ? 'p2' : 'p1';
        const otherStatus = inv.invite?.[otherRole as 'p1'|'p2'];
  const label = `${format(inv.p1, inv.p1Name)} vs ${format(inv.p2, inv.p2Name)}`;
    const resolved = (inv.invite && (inv.invite.p1 === 'declined' || inv.invite.p2 === 'declined' || (inv.invite.p1 === 'accepted' && inv.invite.p2 === 'accepted')));
        return (
          <div key={k} className={`group rounded-xl border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm shadow-lg ring-1 ring-indigo-500/30 px-4 py-3 flex flex-col gap-2 transition-all duration-200 ${resolved ? 'opacity-60' : 'opacity-100'} animate-[fadeIn_0.18s_ease-out]`}>            
            <div className="text-xs font-semibold text-indigo-300/90 tracking-wide">Tournament Match</div>
            <div className="text-sm font-medium text-white truncate" title={label}>{label}</div>
            <div className="flex items-center justify-between text-[11px] text-gray-300/80 font-mono">
              <span>You: {(inv.you||'').toUpperCase()}</span>
      <span className="font-semibold text-indigo-300">{inv.remaining}s</span>
            </div>
            {inv.invite && (
              <div className="flex justify-between text-[11px] text-gray-400/80">
                <span>P1: {inv.invite.p1 || 'pending'}</span>
                <span>P2: {inv.invite.p2 || 'pending'}</span>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                disabled={!!youStatus && youStatus !== 'pending' || resolved || inv.sending}
                onClick={() => respond(k, inv.id, inv.matchKey, 'accept')}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${youStatus === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-emerald-500/80 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}
              >{youStatus === 'accepted' ? 'Accepted' : 'Accept'}</button>
              <button
                disabled={!!youStatus && youStatus !== 'pending' || resolved || inv.sending}
                onClick={() => respond(k, inv.id, inv.matchKey, 'decline')}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${youStatus === 'declined' ? 'bg-red-600 text-white' : 'bg-red-500/80 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'}`}
              >{youStatus === 'declined' ? 'Declined' : 'Decline'}</button>
              <button
                onClick={() => removeInvite(k)}
                className="px-2 py-1 rounded-md text-xs bg-gray-700/70 hover:bg-gray-700 text-gray-300"
                aria-label="Dismiss"
              >✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
