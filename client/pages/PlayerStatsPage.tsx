import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/utils/Axios';

const PlayerStatsPage = () => {
  const { state } = useAuth();
  const [json, setJson] = useState('');
  const [daily, setDaily] = useState<Record<string, { rallies: number; wins: number }> | null>(null);
  const userId = state?.user?.user?.id;

  useEffect(() => {
    api.get('/stats/player')
      .then(res => setJson(JSON.stringify(res.data, null, 2)))
      .catch(err => {
        console.error('Error fetching player stats:', err);
        setJson('[]');
      });
  }, []);

  useEffect(() => {
    if (!userId) return;
    api.get(`/stats/player/daily7?userId=${userId}`)
      .then(res => setDaily(res.data))
      .catch(err => {
        console.error('Error fetching daily stats:', err);
        setDaily(null);
      });
  }, [userId]);
  return (
    <div className="p-4">
      <h2 className="font-bold mb-2">Player Stats</h2>
      {daily && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">Last 7 Days (You)</h3>
          <div className="overflow-x-auto">
            <table className="text-xs min-w-full border">
              <thead>
                <tr className="bg-gray-200">
                  <th className="p-1 border">Date</th>
                  <th className="p-1 border">Rallies</th>
                  <th className="p-1 border">Wins</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(daily).map(([date, v]) => (
                  <tr key={date} className="odd:bg-white even:bg-gray-50">
                    <td className="p-1 border whitespace-nowrap">{date}</td>
                    <td className="p-1 border text-center">{v.rallies}</td>
                    <td className="p-1 border text-center">{v.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">{json}</pre>
    </div>
  );
};
export default PlayerStatsPage;
