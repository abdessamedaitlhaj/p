import { db } from '../db/db.ts';



export interface Message {
	id?: number;
	sender_id: number;
	receiver_id: number;
	content: string;
	timestamp?: string;
  }


db.serialize(() => {
	// messages table

	db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER NOT NULL,
          receiver_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES users(id),
          FOREIGN KEY (receiver_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating posts table:', err.message);
        } else {
          console.log('Messages ready');
        }
      });
});

  // Message queries

  export const  getAllMessages = (): Promise<Message[]> => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM messages ORDER BY timestamp DESC', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as Message[]);
        }
      });
    });
  }


  export const createMessage = (message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> => {
    return new Promise((resolve, reject) => {
    	db.run(
        'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
        [message.sender_id, message.receiver_id, message.content],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              sender_id: message.sender_id,
              receiver_id: message.receiver_id,
              content: message.content,
              timestamp: new Date().toISOString()
            });
          }
        }
      );
    }
)}