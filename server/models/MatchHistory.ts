import { db } from '../db/db.ts';

const MATCH_TYPE = {
  RANKED: 'ranked',
  FRIENDLY: 'friendly',
} as const;

const type_values = Object.values(MATCH_TYPE).map((val) => `'${val}'`).join(', ');

db.run(
  `
  CREATE TABLE IF NOT EXISTS matchistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    player1_id INTEGER,
    player2_id INTEGER,
    winner_id INTEGER,
    
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id),
    
    player1_score INTEGER NOT NULL,
    player2_score INTEGER NOT NULL,
    
    match_type TEXT NOT NULL
      CHECK (match_type IN (${type_values})),
    
    createdAT TEXT DEFAULT CURRENT_TIMESTAMP
  )
  `,
  (err) => {
    if (err) console.error('❌ Failed to create matchistory table', err.message);
    else console.log('✅ matchistory table ready.');
  }
);
