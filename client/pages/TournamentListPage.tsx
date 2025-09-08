import React, { useEffect, useState } from 'react';

const TournamentListPage = () => {
  const [json, setJson] = useState('');
  useEffect(() => {
    fetch('/api/stats/tournaments')
      .then(res => res.json())
      .then(data => setJson(JSON.stringify(data, null, 2)))
      .catch(() => setJson('[]'));
  }, []);
  return (
    <div className="p-4">
      <h2 className="font-bold mb-2">Tournaments</h2>
      <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">{json}</pre>
    </div>
  );
};
export default TournamentListPage;
