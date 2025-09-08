import {db} from '../db/db.ts';

db.serialize(()=>{
	db.run(`
	CREATE TABLE IF NOT EXISTS userAliases (
		id INTEGER PRIMARY  KEY AUTOINCREMENT,
		alias TEXT NOT NULL UNIQUE,
		createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
		userId INTEGER NOT NULL UNIQUE,
		FOREIGN KEY (userId) REFERENCES users(id)
	)`,
	(err)=>{
		if (err) console.error('❌ Failed to create userAliases table:', err.message);
		else console.log('✅ userAliases table ready.');
	})
})

export const setAlias = (alias:string, userId:string): Promise<number> => {
	return new Promise((resolve, reject)=>{
		db.run('INSERT INTO userAliases (alias, userId) VALUES (?, ?)' +
		'ON CONFLICT(userId) DO UPDATE SET alias=excluded.alias',
		[alias, userId], function(err){
			if (err) reject(err);
			else resolve(this.lastID);
		})
	})
}