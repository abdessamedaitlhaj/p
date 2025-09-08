import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useUsers } from '@/store/useUsers';

export default function TournamentPage() {
  const { socket } = useStore();
  const { user } = useStore();
  const userId = String(user?.id || '');
  const [elimReasons, setElimReasons] = useState<Record<string,string>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = (location.state as any) || {};
  const [bracket, setBracket] = useState<any>();
  const [status, setStatus] = useState<string>('waiting');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [completed, setCompleted] = useState<any[]>([]);
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const { data: users } = useUsers();

  const userMap = useMemo(() => {
    const map: Record<string, { username: string; alias?: string | null }> = {};
    if (!users) return map; // Early return for null/undefined users
    users.forEach(u => { map[String(u.id)] = { username: u.username, alias: (u as any).alias }; });
    return map;
  }, [users]);

  const formatDisplay = useCallback((uid?: string, fallback?: string) => {
    if (!uid) return fallback || 'TBD';
    const record = userMap[uid];
    const username = record?.username || fallback || uid;
    const alias = record?.alias;
    if (alias) {
      return <span><span className="font-semibold">{alias}</span> <span className="text-[10px] opacity-70">#{username}</span></span>;
    }
    return <span className="font-semibold">#{username}</span>;
  }, [userMap]);

  // Memoized event handlers to prevent recreation on every render
  const eventHandlers = useMemo(() => {
    return {
      onCountdown: (p: any) => { if (p.id === id) { setStatus('countdown'); setCountdown(p.seconds); } },
      onStarted: (p: any) => { if (p.id === id) { setStatus('running'); setBracket(p.bracket); setCountdown(null); setElimReasons(p.eliminationReasons || {}); } },
      onUpdate: (p: any) => { if (p.id === id) { setBracket(p.bracket); setElimReasons(p.eliminationReasons || {}); } },
      onCompleted: (p: any) => { if (p.id === id) { setStatus('completed'); setResult(p.result); } },
      onCancelled: (p: any) => { if (p.id === id) { setStatus('cancelled'); import('react-hot-toast').then(({ toast }) => toast.error('Tournament cancelled')); } },
      onTournamentWinner: (p: any) => {
        console.log('Tournament winner notification received:', p);
        import('react-hot-toast').then(({ toast }) => {
          toast.success(p.message || '🏆 You won the tournament!', {
            duration: 6000,
            style: {
              background: '#10B981',
              color: '#FFFFFF',
            },
          });
        });
      },
      onList: (list: any[]) => {
        const t = list.find((x: any) => x.id === id);
        if (t) {
          setStatus(t.status);
          setBracket(t.bracket);
          setStartsAt(t.startsAt);
          if (t.status === 'countdown') setCountdown(10);
        }
      },
      onCompletedList: (list: any[]) => setCompleted(list)
    };
  }, [id]); // Only recreate when tournament id changes

  // Combined useEffect for socket events and countdown
  useEffect(() => {
    if (!socket) return;
    
    const {
      onCountdown, onStarted, onUpdate, onCompleted, onCancelled,
      onTournamentWinner, onList, onCompletedList
    } = eventHandlers;
    
    socket.on('tournament_countdown', onCountdown);
    socket.on('tournament_started', onStarted);
    socket.on('tournament_update', onUpdate);
    socket.on('tournament_completed', onCompleted);
    socket.on('tournament_cancelled', onCancelled);
    socket.on('tournament_winner', onTournamentWinner);
    socket.on('tournament_list', onList);
    socket.on('tournament_completed_list', onCompletedList);
    socket.emit('tournament_list');
    
    // Handle countdown timer in the same effect
    let countdownInterval: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown((s) => (s !== null ? s - 1 : s));
      }, 1000);
    }
    
    return () => {
      socket.off('tournament_countdown', onCountdown);
      socket.off('tournament_started', onStarted);
      socket.off('tournament_update', onUpdate);
      socket.off('tournament_completed', onCompleted);
      socket.off('tournament_cancelled', onCancelled);
      socket.off('tournament_winner', onTournamentWinner);
      socket.off('tournament_list', onList);
      socket.off('tournament_completed_list', onCompletedList);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [socket, eventHandlers, countdown]); // Added countdown to dependencies

  const reasonLabel = (uid?: string, match?: any) => {
    if (!uid) return '';
    if (match && match.winner && match.winner === uid) return '';
    const r = elimReasons[uid];
    if (!r) return '';
    const map: any = {
      declined: 'declined',
      no_response: 'no response',
      walkover: 'walkover',
      no_show: 'no show',
      both_exit: 'both exited',
      lost: 'lost'
    };
    return map[r] || r;
  };

  // Show toast if redirected after a tournament win
  useEffect(() => {
    if (id) return; // only on preview page
    try {
      const flag = sessionStorage.getItem('tournamentJustWon');
      if (flag === '1') {
        sessionStorage.removeItem('tournamentJustWon');
        import('react-hot-toast').then(({ toast }) => {
          toast.success('🏆 You won the tournament!');
        });
      }
    } catch {}
  }, [id]);

  const navigateToMatch = (roomId: string, match: any) => {
    if (!roomId) return;
    // Determine stage by inspecting bracket reference (match key stored in match.key maybe) or fallback by presence of winner in other semis
    let stage = 'semi';
    try {
      if (match?.matchKey === 'final' || match?.isFinal) stage = 'final';
      else if (match?.matchKey === 'semi1' || match?.matchKey === 'semi2') stage = 'semi';
      else if (match?.key === 'final') stage = 'final';
      else if (match?.key === 'semi1' || match?.key === 'semi2') stage = 'semi';
    } catch {}
    try { sessionStorage.setItem('tournamentStage', stage); } catch {}
  navigate('/remote', { state: { roomId, playerId: match.p1 === userId ? 'p1' : 'p2', matchType: id, p1Name: match.p1Name, p2Name: match.p2Name, p1Id: match.p1, p2Id: match.p2 } });
  };

  return (
    <div className="min-h-screen p-6 text-white bg-gray-900">
      <h1 className="text-3xl font-bold mb-6">Tournament</h1>
      {id && <div className="mb-1">Status: {status}</div>}
  {!id && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Completed Tournaments</h2>
          <div className="space-y-4 max-h-[60vh] overflow-auto pr-2">
            {completed.map(ct => {
              const b = ct.bracket || {};
              const matches = ['semi1','semi2','final'].map(k => ({ key: k, m: b[k] || {} }));
              return (
                <div key={ct.id} className="bg-gray-800 p-3 rounded text-sm">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-semibold">{ct.name}</div>
                    <div className="text-xs opacity-70">Finished: {ct.result?.completedAt}</div>
                  </div>
                  <div className="text-xs mb-2">Winner: <span className="font-medium">{ct.result?.winner || '-'}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {matches.map(({key, m}) => {
                      const title = key === 'semi1' ? 'Semi 1' : key === 'semi2' ? 'Semi 2' : 'Final';
                      const score = m.score ? `${m.score.p1}-${m.score.p2}` : undefined;
                      const winner = m.winnerName || m.winner || '-';
                      return (
                        <div key={key} className="bg-gray-700/60 p-2 rounded space-y-1">
                          <div className="font-semibold text-[11px] tracking-wide">{title}</div>
                          <div className="leading-tight">
                            {(m.p1Name || m.p1 || 'TBD')} {ct.eliminationReasons?.[m.p1] && m.winner !== m.p1 && <span className="text-[10px] text-red-400">({ct.eliminationReasons[m.p1]})</span>}<br/>vs<br/>{(m.p2Name || m.p2 || 'TBD')} {ct.eliminationReasons?.[m.p2] && m.winner !== m.p2 && <span className="text-[10px] text-red-400">({ct.eliminationReasons[m.p2]})</span>}
                          </div>
                          {score && <div className="text-[10px] opacity-80">Score: {score}</div>}
                          {m.endReason && <div className="text-[10px] opacity-70">Ended: {m.endReason}</div>}
                          <div className="text-[10px] opacity-70">Winner: {winner}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!completed.length && <div className="text-sm opacity-60">No completed tournaments yet.</div>}
          </div>
        </div>
      )}
      {startsAt && status === 'waiting' && (
        <div className="mb-4">Starts in: {Math.max(0, Math.ceil((startsAt - Date.now())/1000))}s</div>
      )}
      {countdown !== null && status === 'countdown' && <div className="mb-4">Starting in: {Math.max(0, countdown)}s</div>}
      {id && bracket && (
        <div className="grid grid-cols-3 gap-4">
          {['semi1','semi2','final'].map(key => {
            const m = (bracket as any)[key] || {};
            const title = key === 'semi1' ? 'Semi-final 1' : key === 'semi2' ? 'Semi-final 2' : 'Final';
            const score = m.score ? `${m.score.p1}-${m.score.p2}` : undefined;
            return (
              <div key={key} className="bg-gray-800 p-3 rounded space-y-1 text-sm">
                <div className="font-semibold mb-1">{title}</div>
                <div>
          {formatDisplay(m.p1, m.p1Name)}{reasonLabel(m.p1, m) && <span className="text-xs text-red-400 ml-1">({reasonLabel(m.p1, m)})</span>} vs {formatDisplay(m.p2, m.p2Name)}{reasonLabel(m.p2, m) && <span className="text-xs text-red-400 ml-1">({reasonLabel(m.p2, m)})</span>}
                </div>
                {m.invite && !m.roomId && !m.winner && (
                  <div className="text-xs text-indigo-300">Invite: P1 {m.invite.p1} / P2 {m.invite.p2}</div>
                )}
                {score && <div className="text-xs opacity-80">Score: {score}</div>}
                {m.endReason && <div className="text-xs opacity-70">Ended: {m.endReason}</div>}
                <div className="text-xs opacity-70">Winner: {m.winnerName || m.winner || '-'}</div>
                {m.roomId && !m.winner && (m.p1 === userId || m.p2 === userId) && (
                  <button onClick={() => navigateToMatch(m.roomId, m)} className="mt-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded">Play Match</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {id && result && (
        <div className="mt-6 bg-gray-800 p-3 rounded">
          <div className="font-semibold">Winner: {result.winner}</div>
          {!!result.runnersUp?.length && (
            <div className="opacity-80 text-sm mt-1">Runners-up: {result.runnersUp.join(', ')}</div>
          )}
        </div>
      )}
    {id && result && (
        <div className="mt-4 bg-gray-800 p-3 rounded text-xs max-h-64 overflow-auto">
          <div className="font-semibold mb-1">Raw Result JSON</div>
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify({ ...result, eliminationReasons: elimReasons, bracket }, null, 2)}</pre>
        </div>
      )}
      {!id && !!user?.id && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Your Recent Tournaments</h2>
          <div className="space-y-2 max-h-60 overflow-auto pr-1">
            {completed.filter(c=>c.players?.includes(String(user.id))).slice(-10).reverse().map(c => (
              <div key={c.id} className="bg-gray-800 p-2 rounded text-xs flex justify-between">
                <span className="truncate max-w-[60%]" title={c.name}>{c.name}</span>
                <span className="opacity-70">{c.result?.winner === user.username ? 'You Won' : (c.result?.winner || '—')}</span>
              </div>
            ))}
            {!completed.filter(c=>c.players?.includes(String(user.id))).length && <div className="text-xs opacity-60">No participation yet.</div>}
          </div>
        </div>
      )}
      <div className="mt-6">
        <button onClick={() => navigate('/events')} className="px-3 py-1 bg-blue-600 rounded">Back to Events</button>
        {!id && <button onClick={()=>socket?.emit('tournament_list')} className="ml-2 px-3 py-1 bg-gray-700 rounded">Refresh</button>}
      </div>
    </div>
  );
}
