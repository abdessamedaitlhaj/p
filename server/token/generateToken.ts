import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

interface UserPayload {
  username: string;
  id: number
}

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as string;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET as string;

export function generateAccessToken(user: UserPayload): string {
  return jwt.sign(
    { UserInfo: { username: user.username, id : user.id} },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '1h' }
  );
}

export function generateRefreshToken(user: UserPayload): string {
  return jwt.sign(
    { username: user.username },
    REFRESH_TOKEN_SECRET,
    { expiresIn: '1h' }
  );
}
