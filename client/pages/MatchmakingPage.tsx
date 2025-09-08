import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';

export default function MatchmakingPage() {
  const { socket, isConnected } = useStore();
  const [status, setStatus] = useState<'idle'|'queued'|'matched'|'timeout'|'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    const onStatus = ({ status }: { status: string }) => {
      if (status === 'queued') { setStatus('queued'); setMessage('Searching for an opponent...'); }
      if (status === 'left') { setStatus('idle'); setMessage('Left queue'); }
    };
    const onTimeout = () => { setStatus('timeout'); setMessage('No match found in 30s'); };
    const onError = (err: string) => { setStatus('error'); setMessage(err); };
    const onMatched = ({ opponent, roomId }: { opponent: string; roomId: string }) => {
      setStatus('matched');
      setMessage(`Matched with ${opponent}! Starting game...`);
      // Navigation will be handled by the CliNavigator listening to 'remote_room_joined' -> 'navigateToRemote'
    };

    socket.on('matchmaking_status', onStatus);
    socket.on('matchmaking_timeout', onTimeout);
    socket.on('matchmaking_error', onError);
    socket.on('matchmaking_matched', onMatched);

    return () => {
      socket.off('matchmaking_status', onStatus);
      socket.off('matchmaking_timeout', onTimeout);
      socket.off('matchmaking_error', onError);
      socket.off('matchmaking_matched', onMatched);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    if (isConnected) {
      socket.emit('matchmaking_join');
    }
    return () => {
      try { socket?.emit('matchmaking_leave'); } catch {}
    };
  }, [socket, isConnected]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Matchmaking</h1>
      <p>{message || (status === 'queued' ? 'Searching for an opponent...' : 'Preparing...')}</p>
      {status === 'queued' && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>}
      {status === 'matched' && <div className="animate-pulse">🎮 Game Found!</div>}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
          disabled={status === 'matched'}
        >Cancel</button>
      </div>
    </div>
  );
}
