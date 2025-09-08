import React, { useEffect, useState } from 'react';
import api from '@/utils/Axios';

const MatchStatsPage = () => {
  const [json, setJson] = useState('');
  useEffect(() => {
    api.get('/stats/matches')
      .then(res => setJson(JSON.stringify(res.data, null, 2)))
      .catch(err => {
        console.error('Error fetching match stats:', err);
        setJson('[]');
      });
  }, []);
  return (
    <div className="p-4">
      <h2 className="font-bold mb-2">Match Stats</h2>
      <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">{json}</pre>
    </div>
  );
};
export default MatchStatsPage;
