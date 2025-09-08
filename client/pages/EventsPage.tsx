import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export default function EventsPage() {
  const { socket } = useStore();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [name, setName] = useState('Community Cup');
  const [minutes, setMinutes] = useState(10);
  const navigate = useNavigate();
  const { user } = useStore();
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!socket) return;
    const onList = (list: any[]) => setTournaments(list);
    const onCreated = (t: any) => {
      setCreating(false);
      setTournaments(prev => [...prev, t]);
      toast.success('Tournament created');
    };
    const onJoined = (t: any) => {
      setJoining(j => ({ ...j, [t.id]: false }));
      // Stay on page; refresh list to reflect updated players
      socket.emit('tournament_list');
    };
    const onError = (e: string) => {
      console.error('Tournament error', e);
      toast.error(e || 'Tournament error');
      setCreating(false);
      // Reset all pending join/leave states (best-effort)
      setJoining({});
      setLeaving({});
    };
  const onLeft = (t: any) => {
      setLeaving(l => ({ ...l, [t.id]: false }));
      setTournaments(prev => prev.map(x => x.id === t.id ? t : x));
      toast('Left tournament');
    };
    const onCountdown = (p: any) => {
      if (p && p.id && user?.id) {
        const t = tournaments.find(x => x.id === p.id);
        if (t && t.players.includes(String(user.id))) {
          navigate('/tournament', { state: { id: p.id } });
        }
      }
    };
    socket.on('tournament_list', onList);
    socket.on('tournament_created', onCreated);
    socket.on('tournament_joined', onJoined);
    socket.on('tournament_error', onError);
  socket.on('tournament_left', onLeft);
    socket.on('tournament_countdown', onCountdown);
  socket.emit('tournament_list');
    return () => {
      socket.off('tournament_list', onList);
      socket.off('tournament_created', onCreated);
      socket.off('tournament_joined', onJoined);
      socket.off('tournament_error', onError);
  socket.off('tournament_left', onLeft);
      socket.off('tournament_countdown', onCountdown);
    };
  }, [socket, navigate, tournaments, user?.id]);

  // Local ticking so countdowns update live
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const createTournament = () => {
    if (creating) return;
    setCreating(true);
    socket?.emit('tournament_create', { name, startsInMinutes: minutes });
  };
  const joinTournament = (id: string) => {
    setJoining(j => ({ ...j, [id]: true }));
    socket?.emit('tournament_join', { id });
  };
  const leaveTournament = (id: string) => {
    setLeaving(l => ({ ...l, [id]: true }));
    socket?.emit('tournament_leave', { id });
  };

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return tournaments;
    return tournaments.filter(t => (t.name||'').toLowerCase().includes(qq));
  }, [q, tournaments]);

  return (
    <div className="min-h-screen p-6 text-white bg-gray-900">
      <h1 className="text-3xl font-bold mb-6">Events</h1>
      <div className="mb-8 space-y-2">
        <h2 className="text-xl font-semibold">Create Tournament</h2>
        <div className="flex gap-2 items-center">
          <input className="px-2 py-1 bg-gray-800 rounded" value={name} onChange={e=>setName(e.target.value)} />
          <input className="px-2 py-1 bg-gray-800 rounded w-24" type="number" value={minutes} onChange={e=>setMinutes(Number(e.target.value))} />
          <span className="opacity-70">minutes (max 30)</span>
          <button disabled={creating} onClick={createTournament} className={`px-3 py-1 rounded ${creating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}>{creating ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
      <h2 className="text-xl font-semibold mb-2">Upcoming Tournaments</h2>
      <div className="mb-3">
        <input
          placeholder="Search events by name..."
          className="px-2 py-1 bg-gray-800 rounded w-full max-w-md"
          value={q}
          onChange={e=>setQ(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        {filtered.map(t => {
          const amIn = !!user?.id && t.players?.includes(String(user.id));
          return (
          <div key={t.id} className="flex justify-between items-center bg-gray-800 rounded p-3">
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-sm opacity-75">Starts in {Math.max(0, Math.ceil((t.startsAt - Date.now())/1000))}s</div>
              <div className="text-sm opacity-75">Players: {t.players.length}/4</div>
            </div>
            <div className="flex gap-2">
              {!amIn && (
                <button disabled={joining[t.id]} onClick={()=>joinTournament(t.id)} className={`px-3 py-1 rounded ${joining[t.id] ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500'}`}>{joining[t.id] ? 'Joining...' : 'Join'}</button>
              )}
              {amIn && (
                <button disabled={leaving[t.id]} onClick={()=>leaveTournament(t.id)} className={`px-3 py-1 rounded ${leaving[t.id] ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500'}`}>{leaving[t.id] ? 'Leaving...' : 'Leave'}</button>
              )}
              <button onClick={()=>navigate('/tournament', { state: { id: t.id } })} className="px-3 py-1 bg-blue-600 rounded">View</button>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}
