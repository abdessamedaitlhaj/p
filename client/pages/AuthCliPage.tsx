import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'cliTokenInfo';

interface CliTokenInfo { token: string; expiresAt: number; issuedAt: number; socketId?: string; }

export default function AuthCliPage() {
  const { socket, isConnected } = useStore();
  const { state } = useAuth();
  const [info, setInfo] = useState<CliTokenInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { const parsed = JSON.parse(raw); setInfo(parsed); } catch {}
    }
  }, []);

  // Token is only considered valid if socket is currently connected.
  // Token is only considered valid if socket is currently connected and not expired.
  const isTokenValid = !!(info && info.socketId === socket?.id && Date.now() < info.expiresAt && isConnected);
  const [remainingMin, setRemainingMin] = useState(0);

  // Timer effect: only runs when token is valid
  useEffect(() => {
    if (isTokenValid) {
      const update = () => {
        if (info) {
          const mins = Math.max(0, Math.floor((info.expiresAt - Date.now()) / 60000));
          setRemainingMin(mins);
        }
      };
      update();
      const interval = setInterval(update, 1000); // update every second for responsiveness
      return () => clearInterval(interval);
    } else {
      setRemainingMin(0);
    }
  }, [isTokenValid, info]);

  const authorize = async () => {
    if (!socket || !socket.id) { setError('Socket not connected'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('http://localhost:3000/api/authcli/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.user?.accessToken}`
        },
        body: JSON.stringify({ socketId: socket.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed');
  const newInfo: CliTokenInfo = { token: data.token, expiresAt: data.expiresAt, issuedAt: Date.now(), socketId: socket.id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newInfo));
      setInfo(newInfo);
      // Emit join event for CLI socket to ensure matchmaking works
      if (socket && state.user?.user?.id) {
        socket.emit('join', state.user.user.id);
      }
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const revoke = async () => {
    if (!info) return;
    setLoading(true); setError(null);
    try {
      await fetch('http://localhost:3000/api/authcli/revoke', { method: 'POST', headers: { 'Authorization': `Bearer ${info.token}` } });
    } catch {}
    finally { setLoading(false); localStorage.removeItem(STORAGE_KEY); setInfo(null); }
  };

  // If socket disconnects while we have a token, invalidate locally so user can re-authorize.
  useEffect(() => {
    if (!isConnected && info) {
      localStorage.removeItem(STORAGE_KEY);
      setInfo(null);
    }
  }, [isConnected, info]);

  // Invalidate if socket id changed (reconnection with new id)
  useEffect(() => {
    if (info && socket?.id && info.socketId && info.socketId !== socket.id) {
      localStorage.removeItem(STORAGE_KEY);
      setInfo(null);
    }
  }, [socket?.id, info]);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 text-sm">
      <h1 className="text-xl font-bold">CLI Authorization</h1>
      <div className="bg-yellow-100 p-4 rounded border border-yellow-300 leading-relaxed">
        <p className="font-semibold mb-2">Disclaimer</p>
        <ul className="list-disc ms-5 space-y-1">
          <li>This CLI token grants limited control: matchmaking start, paddle movement, status.</li>
          <li>Token is bound to this browser tab's socket id. Closing or refreshing invalidates it.</li>
          <li>Only one active CLI token per user at a time. New authorization revokes the previous.</li>
          <li>Token lifetime: 1 hour. After expiry you must re-authorize.</li>
        </ul>
      </div>
      {error && <div className="text-red-500">{error}</div>}
      {!isConnected && (
        <div className="text-xs text-orange-600">Socket disconnected. Reconnect will require new authorization.</div>
      )}
      <div className="flex gap-4 items-center">
        <button
          disabled={loading || isTokenValid}
          onClick={authorize}
          className={`px-4 py-2 rounded text-white ${isTokenValid ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-500'}`}
        >
          {isTokenValid
            ? `Authorized (${remainingMin}m left)`
            : loading
              ? 'Authorizing...'
              : 'I Authorize'}
        </button>
        {info && <button disabled={loading} onClick={revoke} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-500">Revoke</button>}
      </div>
      {info && (
        <div className="bg-gray-100 p-3 rounded font-mono break-all text-xs">
          <p className="font-semibold mb-1">CLI Token</p>
          <code>{info.token}</code>
        </div>
      )}
      <div>
        <h2 className="font-semibold mb-1">Usage (example curl)</h2>
  <pre className="bg-black text-green-300 p-3 rounded overflow-auto text-xs">
{`curl -H "Authorization: Bearer <TOKEN>" -X POST http://localhost:3000/api/cli/start
curl -H "Authorization: Bearer <TOKEN>" -H 'Content-Type: application/json' -d '{"direction":"up"}' http://localhost:3000/api/cli/move
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/cli/status`}
  </pre>
      </div>
    </div>
  );
}
