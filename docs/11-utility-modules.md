# Secure Utility Modules and Helper Functions

This document covers all security-aware utility functions, authenticated helper modules, validation functions, secure formatting utilities, and other supporting modules with security considerations throughout the codebase.

## Overview

The Pong platform includes various **security-hardened utility modules** that provide reusable functionality across both client and server components. These utilities handle everything from authenticated API calls to input validation and secure data formatting.

## 🔐 Security-First Client Utilities

### Secure Axios Configuration (`client/utils/Axios.ts`)

**Security-hardened** HTTP client configuration for authenticated API communication:

```typescript
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/',
  withCredentials: true,  // Enables secure cookie transmission
  timeout: 10000,         // Prevents hanging requests
});

// Request interceptor to add JWT tokens
api.interceptors.request.use((config) => {
  const { state } = useAuth();
  
  if (state.user?.accessToken) {
    config.headers.Authorization = `Bearer ${state.user.accessToken}`;
  }
  
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token expiration and refresh
      await handleTokenRefresh();
    }
    return Promise.reject(error);
  }
);
```

**Security Features:**
- **Automatic JWT token injection** in Authorization headers
- **Secure cookie transmission** via withCredentials
- **Request timeout** to prevent DoS
- **Token refresh handling** on 401 responses
- **No token storage in localStorage** (XSS prevention)

### Game State Interpolation Utilities (`client/components/PongTable/render/interpolation.ts`)

Mathematical utilities for smooth client-side rendering:

```typescript
// Linear interpolation
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

// Smooth step interpolation (ease-in-out)
export function smoothStep(start: number, end: number, factor: number): number {
  const t = factor * factor * (3 - 2 * factor); // Smooth step function
  return start + (end - start) * t;
}

export class GameStateInterpolator {
  private prevState: InterpolatedGameState | null = null;
  private currentState: InterpolatedGameState | null = null;
  private interpolationEnabled = true;
  private ballSmoothingFactor = 0.7;  // Adjust for ball smoothness
  private paddleSmoothingFactor = 0.5; // Adjust for paddle responsiveness

  // Interpolate between two game states for smooth rendering
  interpolate(
    prev: InterpolatedGameState, 
    current: InterpolatedGameState, 
    factor: number
  ): InterpolatedGameState {
    if (!this.interpolationEnabled) return current;

    return {
      ...current,
      ball: this.interpolateBall(prev.ball, current.ball, factor),
      paddles: this.interpolatePaddles(prev.paddles, current.paddles, factor),
      interpolationFactor: factor
    };
  }

  private interpolateBall(
    prev: { x: number; y: number; vx: number; vy: number },
    curr: { x: number; y: number; vx: number; vy: number },
    factor: number
  ): { x: number; y: number } {
    const adjustedFactor = factor * this.ballSmoothingFactor;
    
    return {
      x: smoothStep(prev.x, curr.x, adjustedFactor),
      y: smoothStep(prev.y, curr.y, adjustedFactor)
    };
  }

  private interpolatePaddles(
    prev: { p1: number; p2: number },
    curr: { p1: number; p2: number },
    factor: number
  ): { p1: number; p2: number } {
    const adjustedFactor = factor * this.paddleSmoothingFactor;
    
    return {
      p1: lerp(prev.p1, curr.p1, adjustedFactor),
      p2: lerp(prev.p2, curr.p2, adjustedFactor)
    };
  }

  // Configuration methods
  setInterpolationEnabled(enabled: boolean) {
    this.interpolationEnabled = enabled;
  }

  setSmoothingFactors(ball: number, paddle: number) {
    this.ballSmoothingFactor = Math.max(0, Math.min(1, ball));
    this.paddleSmoothingFactor = Math.max(0, Math.min(1, paddle));
  }

  reset() {
    this.prevState = null;
    this.currentState = null;
  }
}
```

**Mathematical Functions Used:**
- **Linear Interpolation (LERP)**: Smooth transitions between values
- **Smooth Step**: Easing function for natural motion
- **Factor Clamping**: Ensures interpolation values stay in valid ranges
- **State Buffering**: Manages previous/current state for interpolation

## Server-Side Utilities

### Token Generation (`server/token/generateToken.ts`)

JWT token creation utilities for authentication:

```typescript
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

interface UserPayload {
  username: string;
  id: number;
}

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as string;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET as string;

export function generateAccessToken(user: UserPayload): string {
  return jwt.sign(
    { UserInfo: { username: user.username, id: user.id } },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '1h' }
  );
}

export function generateRefreshToken(user: UserPayload): string {
  return jwt.sign(
    { username: user.username },
    REFRESH_TOKEN_SECRET,
    { expiresIn: '24h' } // Longer-lived for session persistence
  );
}
```

**Security Features:**
- Short-lived access tokens (1 hour)
- Long-lived refresh tokens (24 hours)
- Separate secrets for different token types
- User payload encryption

### CLI Token Management (`server/cli/cliTokenStore.ts`)

Specialized token management for CLI access:

```typescript
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

interface CliTokenRecord {
  jti: string;        // Unique token identifier
  token: string;      // JWT token
  userId: number;     // Associated user
  socketId: string;   // Bound socket connection
  issuedAt: number;   // Timestamp
  expiresAt: number;  // Expiry timestamp
}

class CliTokenStore {
  private tokens: Map<string, CliTokenRecord> = new Map();
  private byUser: Map<number, string> = new Map(); // userId -> jti lookup

  issue(userId: number, socketId: string, hours: number = 1): CliTokenRecord {
    // Revoke any existing token for this user
    if (this.byUser.has(userId)) {
      const existingJti = this.byUser.get(userId)!;
      this.tokens.delete(existingJti);
    }

    const jti = uuidv4();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + (hours * 60 * 60 * 1000);

    const payload = {
      sub: userId,
      jti,
      socketId,
      type: 'cli',
      iat: Math.floor(issuedAt / 1000),
      exp: Math.floor(expiresAt / 1000)
    };

    const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET!);

    const record: CliTokenRecord = {
      jti,
      token,
      userId,
      socketId,
      issuedAt,
      expiresAt
    };

    this.tokens.set(jti, record);
    this.byUser.set(userId, jti);

    return record;
  }

  validate(token: string): CliTokenRecord | null {
    try {
      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;
      
      if (payload.type !== 'cli' || !payload.jti) {
        return null;
      }

      const record = this.tokens.get(payload.jti);
      if (!record) {
        return null;
      }

      // Check expiry
      if (Date.now() > record.expiresAt) {
        this.tokens.delete(payload.jti);
        this.byUser.delete(record.userId);
        return null;
      }

      return record;

    } catch (error) {
      return null;
    }
  }

  revoke(userId: number): boolean {
    const jti = this.byUser.get(userId);
    if (!jti) return false;

    this.tokens.delete(jti);
    this.byUser.delete(userId);
    return true;
  }

  // Cleanup expired tokens
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [jti, record] of this.tokens.entries()) {
      if (now > record.expiresAt) {
        this.tokens.delete(jti);
        this.byUser.delete(record.userId);
        cleaned++;
      }
    }

    return cleaned;
  }

  getStats() {
    return {
      totalTokens: this.tokens.size,
      activeUsers: this.byUser.size
    };
  }
}

export const cliTokenStore = new CliTokenStore();

// Cleanup every 15 minutes
setInterval(() => {
  const cleaned = cliTokenStore.cleanup();
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired CLI tokens`);
  }
}, 15 * 60 * 1000);
```

**Token Features:**
- Unique identifier (JTI) for each token
- Socket binding prevents token sharing
- Automatic cleanup of expired tokens
- One token per user limitation
- Real-time validation

### Database Utilities (`server/models/`)

Each model file includes utility functions for database operations:

```typescript
// Example from Users.ts
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
        else resolve(this.lastID);
      }
    );
  });
};

export const updateUserStatus = (
  userId: number, 
  status: UserStatus
): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
      [status, userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};
```

## Validation and Middleware Utilities

### Token Verification (`server/middleware/verifyToken.ts`)

Reusable middleware for JWT validation:

```typescript
import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';

interface UserInfo {
  id: number;
  username: string;
}

interface JwtPayload {
  UserInfo: UserInfo;
  iat?: number;
  exp?: number;
}

const verifyJwt = (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return reply.status(401).send({ message: 'Undefined Authorization header' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ message: 'Invalid Authorization format' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string, (err: any, decoded: any) => {
    if (err) {
      console.error('Token verification error:', err.message);
      return reply.status(403).send({ error: 'Invalid or expired token' });
    }
    
    const payload = decoded as JwtPayload;
    req.user_infos = payload.UserInfo;
    done();
  });
};

// Route-specific middleware
export const verifyTokenAndAuthorization = (
  req: FastifyRequest<{ Params: { id: string } }>, 
  reply: FastifyReply, 
  done: HookHandlerDoneFunction
) => {
  verifyJwt(req, reply, () => {
    if (req.user_infos && req.user_infos.id.toString() === req.params.id) {
      done();
    } else {
      reply.status(403).send({ message: 'Access denied' });
    }
  });
};

export const verifyToken = (
  req: FastifyRequest, 
  reply: FastifyReply, 
  done: HookHandlerDoneFunction
) => {
  verifyJwt(req, reply, done);
};
```

### CLI Middleware (`server/cli/cliMiddleware.ts`)

Specialized middleware for CLI token validation:

```typescript
import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { cliTokenStore } from './cliTokenStore';

export function verifyCliToken(
  req: FastifyRequest, 
  reply: FastifyReply, 
  done: HookHandlerDoneFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const record = cliTokenStore.validate(token);

  if (!record) {
    return reply.status(401).send({ message: 'Invalid or expired CLI token' });
  }

  // Verify socket still exists
  const io = (global as any).io;
  const socket = io.sockets.sockets.get(record.socketId);
  
  if (!socket) {
    console.log(`🔌 Socket ${record.socketId} not found, revoking CLI token for user ${record.userId}`);
    cliTokenStore.revoke(record.userId);
    return reply.status(401).send({ message: 'Associated socket disconnected' });
  }

  // Add user info to request
  (req as any).cliUserId = record.userId;
  (req as any).cliSocketId = record.socketId;

  done();
}
```

## Input Validation Utilities

### Request Body Validation

```typescript
// Common validation patterns used across controllers
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUsername(username: string): boolean {
  // 3-20 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

export function validatePassword(password: string): boolean {
  // At least 6 characters
  return password.length >= 6;
}

export function sanitizeUser(user: any) {
  // Remove sensitive fields before sending to client
  const { password, refreshToken, ...sanitized } = user;
  return sanitized;
}
```

### Game Input Validation

```typescript
// Used in game controllers
export function validateGameInput(input: any): boolean {
  if (typeof input !== 'object') return false;
  
  // Check required fields
  if (!input.hasOwnProperty('type')) return false;
  
  // Validate input type
  const validTypes = ['paddle_up', 'paddle_down', 'paddle_stop', 'start_game'];
  if (!validTypes.includes(input.type)) return false;
  
  // Validate paddle number if applicable
  if (input.type.startsWith('paddle_') && !input.paddleNumber) return false;
  if (input.paddleNumber && ![1, 2].includes(input.paddleNumber)) return false;
  
  return true;
}
```

## Shared Code (`shared/api.ts`)

Common types and utilities used by both client and server:

```typescript
/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

// Common API response structure
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Game-related shared types
export interface GameSettings {
  ballSpeed: number;
  paddleSpeed: number;
  winScore: number;
  theme: string;
}

// Tournament shared types
export interface TournamentInvite {
  id: string;
  tournamentId: string;
  inviterId: number;
  inviteeId: number;
  status: 'pending' | 'accepted' | 'declined';
  expiresAt: number;
}

// Common error types
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  USER_LOCKED: 'USER_LOCKED',
  GAME_FULL: 'GAME_FULL',
  TOURNAMENT_FULL: 'TOURNAMENT_FULL'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// Utility functions for both client and server
export function isValidId(id: any): id is number {
  return typeof id === 'number' && id > 0 && Number.isInteger(id);
}

export function formatTimestamp(timestamp: number | string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export function calculateWinPercentage(wins: number, totalGames: number): number {
  if (totalGames === 0) return 0;
  return Math.round((wins / totalGames) * 100);
}
```

## Configuration Utilities

### Environment Configuration

```typescript
// server/config/env.ts (conceptual - could be extracted)
export function validateRequiredEnvVars() {
  const required = [
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('✅ All required environment variables present');
}

export function getConfig() {
  return {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    databasePath: process.env.DATABASE_PATH || './server/db/database.sqlite',
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}
```

## Error Handling Utilities

### Centralized Error Responses

```typescript
// server/utils/errors.ts (conceptual)
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export function createErrorResponse(error: AppError | Error) {
  return {
    success: false,
    message: error.message,
    code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };
}

// Common error factory functions
export const createValidationError = (message: string) => 
  new AppError(message, 400, 'VALIDATION_ERROR');

export const createUnauthorizedError = (message: string = 'Unauthorized') => 
  new AppError(message, 401, 'UNAUTHORIZED');

export const createForbiddenError = (message: string = 'Forbidden') => 
  new AppError(message, 403, 'FORBIDDEN');

export const createNotFoundError = (message: string = 'Not Found') => 
  new AppError(message, 404, 'NOT_FOUND');
```

## Performance and Optimization Utilities

### Rate Limiting Helpers

```typescript
// server/utils/rateLimiting.ts (conceptual)
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private records = new Map<string, RateLimitRecord>();

  check(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record) {
      this.records.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return true;
    }

    if (record.count >= maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetTime) {
        this.records.delete(key);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

// Cleanup every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);
```

### Database Query Helpers

```typescript
// server/utils/database.ts (conceptual)
export function runQuery<T>(
  query: string, 
  params: any[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export function runSingle<T>(
  query: string, 
  params: any[] = []
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | null);
    });
  });
}

export function runInsert(
  query: string, 
  params: any[] = []
): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

export function runUpdate(
  query: string, 
  params: any[] = []
): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}
```

## Testing Utilities

### Mock Data Generators

```typescript
// server/utils/mockData.ts (conceptual)
export function generateMockUser(): Partial<User> {
  return {
    username: `user_${Math.random().toString(36).substr(2, 9)}`,
    email: `test${Date.now()}@example.com`,
    status: 'offline'
  };
}

export function generateMockGameState(): GameState {
  return {
    ball: { x: 400, y: 300, vx: 200, vy: 150 },
    paddles: { p1: 250, p2: 250 },
    scores: { p1: 0, p2: 0 },
    gameStarted: false,
    gameOver: false,
    winner: null,
    lastUpdate: Date.now()
  };
}

export function generateMockTournament(): Tournament {
  return {
    id: `tournament_${Date.now()}`,
    name: 'Test Tournament',
    status: 'waiting',
    players: [],
    maxPlayers: 8,
    startsAt: Date.now() + 30000,
    createdAt: Date.now()
  };
}
```

## Utility Module Usage Examples

### Client-Side Usage

```typescript
// Using interpolation utilities in game rendering
import { GameStateInterpolator, lerp } from '@/components/PongTable/render/interpolation';

const interpolator = new GameStateInterpolator();

function renderFrame(prevState: GameState, currentState: GameState, deltaTime: number) {
  const interpolatedState = interpolator.interpolate(prevState, currentState, deltaTime);
  
  // Render interpolated positions for smooth animation
  drawBall(interpolatedState.ball.x, interpolatedState.ball.y);
  drawPaddle1(interpolatedState.paddles.p1);
  drawPaddle2(interpolatedState.paddles.p2);
}
```

### Server-Side Usage

```typescript
// Using validation utilities in controllers
import { validateEmail, validateUsername, sanitizeUser } from '@/utils/validation';

export const createUser = async (req: FastifyRequest, reply: FastifyReply) => {
  const { username, email, password } = req.body as any;

  // Validate input
  if (!validateUsername(username)) {
    return reply.status(400).send({ message: 'Invalid username format' });
  }

  if (!validateEmail(email)) {
    return reply.status(400).send({ message: 'Invalid email format' });
  }

  // ... user creation logic ...

  // Return sanitized user data
  reply.send({ 
    message: 'User created successfully',
    user: sanitizeUser(newUser)
  });
};
```

## Summary

The utility modules provide essential supporting functionality across the entire Pong platform:

- **Mathematical utilities** for smooth game rendering
- **Token management** for secure authentication
- **Database helpers** for consistent data operations
- **Validation functions** for input security
- **Error handling** for consistent responses
- **Configuration management** for environment setup
- **Shared types** for client-server consistency

These utilities ensure code reusability, maintain consistency, and provide robust foundations for the platform's core functionality.
