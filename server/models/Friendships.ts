import { db } from '../db/db.ts';

const USER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  BLOCKED: 'blocked',
} as const;

// This will result in: "'pending', 'accepted', 'blocked'"
const statusValues = Object.values(USER_STATUS).map((val) => `'${val}'`).join(', ');

db.run(
  `
  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER,
    receiver_id INTEGER,
    status TEXT NOT NULL DEFAULT '${USER_STATUS.PENDING}'
    CHECK (status IN (${statusValues})),
    createdAT TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  )
  `,
  (err) => {
    if (err) console.error('❌ Failed to create friendships table', err.message);
    else console.log('✅ Friendships table ready.');
  }
);

export interface Friendship {
  id: number;
  requester_id: number;
  receiver_id: number;
  status: typeof USER_STATUS[keyof typeof USER_STATUS];
  createdAT: string;
}

export const createFriendRequest = 
    (requester_id: string, receiver_id: string): Promise<Friendship> => {
        return new Promise((resolve, reject) => {
          db.run('INSERT INTO friendships (requester_id, receiver_id) VALUES (?, ?)',
          [requester_id, receiver_id], function(err) {
            if(err) reject(err);
            else {
              db.get('SELECT * FROM friendships WHERE id = ?', [this.lastID], (err, row) => {
                if(err) reject(err);
                else resolve(row as Friendship);
              });
            }
          })
        });
    }

export const getFriendInvitations = (user_id: string): Promise<Friendship[]> => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT f.id, f.requester_id, f.receiver_id, f.status, u.username, u.avatarurl
            FROM friendships f
            LEFT JOIN users u ON f.requester_id = u.id
            WHERE f.receiver_id = ? AND f.status = ?`,
            [user_id, USER_STATUS.PENDING],
    (err, rows) => {
      if (err) reject(err);
      else resolve(rows as Friendship[]);
    });
  })
}


export const AllreadyRequested = (requester_id: string, receiver_id: string):
    Promise<Friendship | undefined> => {
      return new Promise ((resolve, reject)=> {
        db.get('SELECT * FROM friendships WHERE requester_id = ? AND receiver_id = ?',
        [requester_id, receiver_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as Friendship | undefined);
        })
      })
}

export const removeFriendship = (userId: string, friendId: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		db.run(`DELETE FROM friendships
				WHERE(requester_id = ? AND receiver_id = ?) OR
				(requester_id = ? AND receiver_id = ?)`, [userId, friendId, friendId, userId],
			(err, )=>{
				if (err) reject(err);
				else resolve();
			})
	})
}

// export const AlreadySentMe = (requester_id: string, receiver_id: string):
//     Promise<Friendship> => {
//       return new Promise ((resolve, reject)=>{

//       })
// }