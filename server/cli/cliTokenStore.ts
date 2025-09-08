import jwt from 'jsonwebtoken';

export interface CliTokenRecord {
  token: string;
  userId: string;
  socketId: string;
  expiresAt: number; // epoch ms
  jti: string;
}

// In-memory store (single process). If multi-process, would need shared cache.
class CliTokenStore {
  private byUser = new Map<string, CliTokenRecord>();

  issue(userId: string, socketId: string, hours = 1): CliTokenRecord {
    // Revoke existing
    if (this.byUser.has(userId)) this.byUser.delete(userId);
    const jti = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    const secret = process.env.ACCESS_TOKEN_SECRET as string; // Reuse main secret or set CLI_ACCESS_TOKEN_SECRET
    const expiresInSec = hours * 3600;
    const token = jwt.sign({ type: 'cli', userId, socketId, jti }, secret, { expiresIn: expiresInSec });
    const rec: CliTokenRecord = { token, userId, socketId, expiresAt: Date.now() + expiresInSec * 1000, jti };
    this.byUser.set(userId, rec);
    return rec;
  }

  revoke(userId: string) {
    this.byUser.delete(userId);
  }

  findByUser(userId: string) {
    return this.byUser.get(userId);
  }

  validate(token: string): CliTokenRecord | null {
    try {
      const secret = process.env.ACCESS_TOKEN_SECRET as string;
      const decoded: any = jwt.verify(token, secret);
      if (decoded?.type !== 'cli') return null;
      const rec = this.byUser.get(String(decoded.userId));
      if (!rec) return null;
      if (rec.token !== token) return null; // superseded
      if (Date.now() > rec.expiresAt) { this.byUser.delete(rec.userId); return null; }
      if (rec.socketId !== decoded.socketId) return null;
      return rec;
    } catch {
      return null;
    }
  }
}

export const cliTokenStore = new CliTokenStore();
