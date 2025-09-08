import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';

interface DecodedToken {
  UserInfo: {
    id: string;
    username: string;
    email: string;
  };
  iat: number;
  exp: number;
}

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  try {
    console.log(`🔐 Socket ${socket.id} - Auth middleware triggered`);
    console.log(`🔍 Handshake auth:`, socket.handshake.auth);
    console.log(`🔍 Handshake query:`, socket.handshake.query);
    console.log(`🔍 Handshake headers (subset):`, {
      origin: socket.handshake.headers.origin,
      cookie: socket.handshake.headers.cookie?.slice(0,120)
    });
    
    // Get token from multiple potential sources to aid migration.
    let token = socket.handshake.auth?.accessToken 
      || socket.handshake.auth?.token 
      || (typeof socket.handshake.query?.accessToken === 'string' ? socket.handshake.query!.accessToken as string : undefined);

    // Allow reading from cookie (not recommended long term for WS auth) as a fallback for debugging.
    if (!token && socket.handshake.headers.cookie) {
      const m = /jwt=([^;]+)/.exec(socket.handshake.headers.cookie);
      if (m) token = m[1];
    }
    
    if (!token) {
      console.log(`❌ Socket ${socket.id} - No access token provided`);
      console.log(`🔍 Available auth keys:`, Object.keys(socket.handshake.auth || {}));
      return next(new Error('Authentication required'));
    }

    const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
    if (!accessTokenSecret) {
      console.error('❌ ACCESS_TOKEN_SECRET not configured');
      return next(new Error('Server configuration error'));
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, accessTokenSecret) as DecodedToken;
    
  if (!decoded?.UserInfo?.id) {
      console.log(`❌ Socket ${socket.id} - Invalid token payload`);
      return next(new Error('Invalid token'));
    }

    // Attach user info to socket for later use
  (socket as any).userId = String(decoded.UserInfo.id);
  (socket as any).userInfo = decoded.UserInfo;
    
    console.log(`✅ Socket ${socket.id} authenticated for user ${decoded.UserInfo.id} (${decoded.UserInfo.username})`);
    next();
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log(`❌ Socket ${socket.id} - Token expired`);
      return next(new Error('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log(`❌ Socket ${socket.id} - Invalid token: ${error.message}`);
      return next(new Error('Invalid token'));
    } else {
      console.error(`❌ Socket ${socket.id} - Auth error:`, error);
      return next(new Error('Authentication failed'));
    }
  }
};
