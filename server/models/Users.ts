import { resolve } from 'path';
import { db } from '../db/db.ts';
import { ensurePlayerStats } from './PlayerStats';

export const USER_STATUS = {
	ACTIVE: 'in_game',
	CONNECT: 'online',
	DISCONNECT: 'offline',
} as const;


const statusValues = Object.values(USER_STATUS).map((s) => `'${s}'`).join(', ');

const icon_url = "https://www.meme-arsenal.com/memes/0854907ebde1bf28f572b7e99dbf5601.jpg"
// Create users table
db.serialize(() => {
	db.run(
		`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			avatarurl TEXT NOT NULL DEFAULT '${icon_url}',
			refreshToken TEXT,
			status TEXT NOT NULL DEFAULT '${USER_STATUS.DISCONNECT}'
				CHECK (status IN (${statusValues})),
			last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
			createdAt TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`,
		(err) => {
			if (err) console.error('❌ Failed to create users table:', err.message);
			else console.log('✅ Users table ready.');
		}
	);

});

// Define a User type for better typing
export interface User {
		id: number;
		username: string;
		password: string;
		email: string;
		avatar_url?: string | null;
		refreshToken?: string | null;
		status: typeof USER_STATUS[keyof typeof USER_STATUS];
		last_seen?: string | null;
		createdAt: string;
}

// Helper functions
export const findByEmailOrUsername = (
	email: string,
	username: string
): Promise<User | undefined> => {
	return new Promise((resolve, reject) => {
		db.get(
			'SELECT * FROM users WHERE email = ? OR username = ?',
			[email, username],
			(err, row) => {
				if (err) reject(err);
				else resolve(row as User | undefined);
			}
		);
	});
};

export const FindByUser = (username:string) : Promise<User | null> => {
	return  new Promise((resolve, reject)=>{
		db.get(
			`SELECT u.id, u.username, u.email, u.avatarurl, u.status, u.password, ua.alias
			FROM users u
			LEFT JOIN userAliases ua ON u.id = ua.userId
			WHERE u.username = ?`, [username],
			
			(err:Error, row:User) => {
				if (err)	reject(err);
				else resolve(row as User | null)
		})
	})
}



export const FindById = (id:string) : Promise<User | null> => {
	return new Promise((resolve, reject) =>{
		db.get(`SELECT u.id, u.username, u.email, u.avatarurl, u.status, u.password, ua.alias
				FROM users u
				LEFT JOIN userAliases ua ON u.id = ua.userId
				where u.id = ?`, [id],
			(err:Error, row:User)=>{
				if (err) reject(err);
				else resolve(row as User | null)
		})
	})
}


export const createUser = (
	username: string,
	email: string,
	hashedPassword: string
): Promise<number> => {
	return new Promise((resolve, reject) => {
		db.run(
			'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
			[username, email, hashedPassword],
			function (err) {
				if (err) reject(err);
				else {
					// Initialize player_stats row
					ensurePlayerStats(this.lastID);
					resolve(this.lastID);
				}
			}
		);
	});
};


export const countUsers = (): Promise<number> => {
	return new Promise((resolve, reject) => {
		db.get('SELECT COUNT(*) as total_rows FROM users', [], (err, row: any) => {
			if (err) reject(err);
			else resolve(row?.total_rows ?? 0);
		});
	});
};

export const getAllUsers = (): Promise<User[]> => {
		return new Promise((resolve, reject) => {
			// Include alias if present
			db.all(`SELECT u.*, ua.alias FROM users u LEFT JOIN userAliases ua ON u.id = ua.userId`, (err, rows) => {
				if (err) {
					reject(err);
				} else {
					resolve(rows as User[]);
				}
			});
		});
}


export const SearchByName = (username: string,  id : string) : Promise<User[]> => {
	return new Promise((resolve, reject) => {
		const searchPattern = `%${username}%`;
		db.all(`SELECT u.id, u.username, u.avatarurl, ua.alias, u.status, f.status AS friendship_status, f.requester_id, f.receiver_id
				FROM users u
				LEFT JOIN userAliases ua ON u.id = ua.userId
				LEFT JOIN friendships f ON ((f.requester_id = ? AND f.receiver_id = u.id) OR (f.requester_id = u.id AND f.receiver_id = ?))
				WHERE u.username LIKE ? AND u.id != ? LIMIT 10`, [id, id, searchPattern, id],
			(err, rows) => {
				if (err) reject(err);
				else resolve(rows as User[]);
			});
	})
}