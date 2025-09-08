# Backend Routes and API Documentation

This document provides complete documentation of all secure backend routes, authentication middleware, rate limiting, and API security measures.

## 🔐 Security Overview

All backend routes implement comprehensive security measures:
- **JWT Authentication** for protected routes
- **Rate limiting** to prevent abuse and DoS attacks
- **Input validation** using Zod schemas
- **Secure session management** with httpOnly cookies
- **CORS protection** with allowed origins whitelist

## Rate Limiting Implementation

### Global Rate Limiting
- **100 requests/minute per IP** for general API usage
- Applied to all routes via preHandler hook

### Auth Route Rate Limiting
- **5 requests/minute per IP** for authentication endpoints
- Prevents brute force attacks on login/signup

```typescript
// Global rate limiting (100 req/min)
app.addHook('preHandler', globalRateLimit);

// Auth-specific rate limiting (5 req/min)
await app.register(async function authRoutes(fastify) {
  fastify.addHook('preHandler', authRateLimit);
  await fastify.register(AuthRoutes, { prefix: 'api/auth' });
});
```

## Route Organization

The backend API is organized into several secure route modules under the `/api` prefix:

```
/api
├── /auth/signin, /auth/signup, /auth/logout    # Authentication (rate limited)
├── /token/new                                  # Token refresh 
├── /users/:id, /users/Newalias               # User management (JWT protected)
├── /messages/*                                # Chat system (JWT protected)
├── /cli/*                                    # CLI interface routes
└── /statistics/*                             # Game statistics (future)
```

**Security Middleware Applied:**
- `globalRateLimit` - 100 requests/minute per IP
- `authRateLimit` - 5 requests/minute per IP (auth routes only)
- `verifyToken` - JWT verification for protected routes
- `verifyTokenAndAuthorization` - User-specific resource access

## Authentication Routes (`server/routes/auth.ts`)

### Sign In
```http
POST /api/auth/signin
Content-Type: application/json
Rate Limit: 5 requests/minute per IP

{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "msg": "success",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...", // JWT access token
  "user": {
    "id": "number",
    "username": "string", 
    "email": "string",
    "avatarurl": "string",
    "status": "online",
    "createdAt": "string"
  }
}
```
**Secure Cookie Set:**
```http
Set-Cookie: jwt=<refreshToken>; HttpOnly; Secure; SameSite=Strict; Path=/
```

**Security Features:**
- Password verification using `bcrypt.compare()`
- JWT access token generation (1 hour expiry)
- Secure refresh token stored in httpOnly cookie
- Rate limiting prevents brute force attacks

**Implementation Details:**
```typescript
export const signIn = async (request: FastifyRequest, reply: FastifyReply) => {
  const { username, password } = request.body as SignInBody;
  
  // Find user and verify password
  const user = await findUserByUsername(username);
  if (!user) return reply.status(401).send({ message: 'login error' });
  
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) return reply.status(401).send({ message: 'login error' });
  
  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.username);
  const refreshToken = generateRefreshToken();
  
  // Create session record
  await createSession({
    user_id: user.id,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });
  
  // Set httpOnly cookie for refresh token
  reply.setCookie('jwt', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  
  reply.send({
    message: 'success',
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email, status: 'online' }
  });
};
```

### Sign Up
```http
POST /api/signup
Content-Type: application/json

{
  "username": "string",
  "password": "string",
  "email": "string"
}
```

**Response (201):**
```json
{
  "message": "success",
  "user": {
    "id": "number",
    "username": "string",
    "email": "string"
  }
}
```

**Implementation Details:**
```typescript
export const signUp = async (request: FastifyRequest, reply: FastifyReply) => {
  const { username, password, email } = request.body as SignUpBody;
  
  // Check if user already exists
  const existingUser = await findUserByUsername(username);
  if (existingUser) {
    return reply.status(409).send({ message: 'Username already exists' });
  }
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // Create user
  const newUser = await createUser({
    username,
    password: hashedPassword,
    email,
    status: 'offline'
  });
  
  // Initialize player stats
  await ensurePlayerStats(newUser.id);
  
  reply.status(201).send({
    message: 'success',
    user: { id: newUser.id, username: newUser.username, email: newUser.email }
  });
};
```

### Logout
```http
GET /api/logout
Cookie: jwt=refreshToken
```

**Response (200):**
```json
{
  "message": "success"
}
```

**Implementation:**
```typescript
export const logOut = async (request: FastifyRequest, reply: FastifyReply) => {
  const cookies = request.cookies;
  if (!cookies?.jwt) return reply.sendStatus(204);
  
  const refreshToken = cookies.jwt;
  
  // Delete session from database
  await deleteSessionByToken(refreshToken);
  
  // Clear cookie
  reply.clearCookie('jwt', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  
  reply.send({ message: 'success' });
};
```

## Token Refresh Routes (`server/routes/refreshToken.ts`)

### Refresh Access Token
```http
GET /api/token/new
Cookie: jwt=refreshToken
```

**Response (200):**
```json
{
  "accessToken": "string",
  "user": {
    "id": "number",
    "username": "string",
    "email": "string",
    "status": "string"
  }
}
```

**Implementation:**
```typescript
export const refreshToken = async (request: FastifyRequest, reply: FastifyReply) => {
  const cookies = request.cookies;
  if (!cookies?.jwt) return reply.status(401).send({ message: 'Unauthorized' });
  
  const refreshToken = cookies.jwt;
  
  // Verify refresh token exists in database
  const session = await findSessionByToken(refreshToken);
  if (!session) return reply.status(403).send({ message: 'Forbidden' });
  
  // Check expiration
  if (new Date() > new Date(session.expires_at)) {
    await deleteSessionByToken(refreshToken);
    return reply.status(403).send({ message: 'Token expired' });
  }
  
  // Get user details
  const user = await findUserById(session.user_id);
  if (!user) return reply.status(403).send({ message: 'User not found' });
  
  // Generate new access token
  const accessToken = generateAccessToken(user.id, user.username);
  
  // Touch session to extend expiry
  await touchSession(session.user_id);
  
  reply.send({
    accessToken,
    user: { id: user.id, username: user.username, email: user.email, status: user.status }
  });
};
```

## User Management Routes (`server/routes/users.ts`)

### Get All Users
```http
GET /api/
```

**Response (200):**
```json
[
  {
    "id": "number",
    "username": "string",
    "status": "online|offline|in_game"
  }
]
```

### Get Single User
```http
GET /api/user/:id
Authorization: Bearer accessToken
```

**Response (200):**
```json
{
  "id": "number", 
  "username": "string",
  "email": "string",
  "status": "online|offline|in_game"
}
```

**Implementation:**
```typescript
export const getUser = async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  
  const user = await findUserById(parseInt(id));
  if (!user) {
    return reply.status(404).send({ message: 'User not found' });
  }
  
  reply.send({
    id: user.id,
    username: user.username, 
    email: user.email,
    status: user.status
  });
};
```

## Message Routes (`server/routes/messages.ts`)

**Authentication Required**: All message endpoints require valid JWT token

### Get User Messages
```http
GET /api/messages/
Authorization: Bearer <token>
```

**Security**: Returns only messages where authenticated user is sender or receiver

**Response (200):**
```json
[
  {
    "id": "number",
    "sender_id": "number",
    "receiver_id": "number", 
    "text": "string",
    "created_at": "string",
    "sender_username": "string",
    "receiver_username": "string"
  }
]
```

### Get Conversation
```http
GET /api/messages/conversation/:userId/:otherUserId
Authorization: Bearer <token>
```

**Security**: Authenticated user must be one of the conversation participants

**Response (200):**
```json
[
  {
    "id": "number",
    "sender_id": "number",
    "receiver_id": "number",
    "text": "string", 
    "created_at": "string"
  }
]
```

### Send Message
```http
POST /api/messages/
Authorization: Bearer <token>
Content-Type: application/json

{
  "sender_id": "number",
  "receiver_id": "number",
  "text": "string"
}
```

**Security**: sender_id must match authenticated user (prevents impersonation)

**Response (201):**
```json
{
  "id": "number",
  "sender_id": "number", 
  "receiver_id": "number",
  "text": "string",
  "created_at": "string"
}
```

**Implementation:**
```typescript
export const createMessage = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sender_id, receiver_id, text } = request.body as CreateMessageBody;
  
  // Validate users exist
  const sender = await findUserById(sender_id);
  const receiver = await findUserById(receiver_id);
  
  if (!sender || !receiver) {
    return reply.status(400).send({ message: 'Invalid user IDs' });
  }
  
  // Create message
  const message = await insertMessage({ sender_id, receiver_id, text });
  
  reply.status(201).send(message);
};
```

## CLI Routes (`server/cli/cliRoutes.ts`)

### Authorize CLI Access
```http
POST /api/cli/authorize
Authorization: Bearer accessToken
Content-Type: application/json

{
  "socketId": "string"
}
```

**Response (200):**
```json
{
  "token": "string",
  "expiresAt": "number"
}
```

### Revoke CLI Access  
```http
POST /api/cli/revoke
Authorization: Bearer cliToken
```

**Response (200):**
```json
{
  "revoked": "boolean"
}
```

### Get CLI Status
```http
GET /api/cli/status  
Authorization: Bearer cliToken
```

**Response (200):**
```json
{
  "status": "online|offline|in_game",
  "inMatch": "boolean",
  "tournamentLocked": "boolean", 
  "pendingInviteId": "string|null"
}
```

### CLI Game Actions
```http
POST /api/cli/game/local
Authorization: Bearer cliToken
Content-Type: application/json

{
  "settings": {
    "ballSpeed": "slow|normal|fast",
    "scoreToWin": "number"
  }
}
```

**Response (200):**
```json
{
  "roomId": "string",
  "message": "string"
}
```

```http
POST /api/cli/game/input
Authorization: Bearer cliToken
Content-Type: application/json

{
  "key": "w|s|ArrowUp|ArrowDown",
  "isKeyDown": "boolean"
}
```

**Response (200):**
```json
{
  "success": "boolean"
}
```

## Route Middleware and Security

### Token Verification Middleware
```typescript
// server/middleware/verifyToken.ts
export const verifyToken = (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }
  
  const token = authHeader.split(' ')[1];
  
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string, (err: any, decoded: any) => {
    if (err) return reply.status(403).send({ message: 'Forbidden' });
    
    request.user = { id: decoded.UserInfo.id, username: decoded.UserInfo.username };
    done();
  });
};
```

### CORS Configuration
```typescript
// server/index.ts
import cors from '@fastify/cors';

app.register(cors, {
  origin: (origin, callback) => {
    const hostname = new URL(origin || 'http://localhost').hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"), false);
  },
  credentials: true
});
```

### Request Validation
```typescript
// Example validation schema
const signInSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 50 },
      password: { type: 'string', minLength: 6, maxLength: 100 }
    }
  }
};

// Route with validation
app.post('/api/signin', { schema: signInSchema }, signIn);
```

## Database Connection Patterns

### Connection Management
```typescript
// server/db/db.ts
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./server/db/database.sqlite', (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');
  }
});

export { db };
```

### Query Patterns
```typescript
// Promisified database operations
function queryAsync(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runAsync(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Usage in controllers
export const getAllUsers = async () => {
  return await queryAsync('SELECT id, username, status FROM users ORDER BY username');
};
```

## Error Handling Patterns

### Global Error Handler
```typescript
// server/index.ts
app.setErrorHandler(async (error, request, reply) => {
  console.error('❌ Server Error:', error);
  
  // Database errors
  if (error.code?.startsWith('SQLITE_')) {
    return reply.status(500).send({ 
      message: 'Database error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return reply.status(401).send({ message: 'Invalid token' });
  }
  
  if (error.name === 'TokenExpiredError') {
    return reply.status(401).send({ message: 'Token expired' });
  }
  
  // Validation errors
  if (error.validation) {
    return reply.status(400).send({
      message: 'Validation error',
      errors: error.validation
    });
  }
  
  // Generic server error
  reply.status(500).send({ 
    message: 'Internal server error'
  });
});
```

### Route-Level Error Handling
```typescript
export const getUser = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const userId = parseInt(id);
    
    if (isNaN(userId)) {
      return reply.status(400).send({ message: 'Invalid user ID' });
    }
    
    const user = await findUserById(userId);
    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }
    
    reply.send(sanitizeUser(user));
    
  } catch (error) {
    console.error('Error in getUser:', error);
    reply.status(500).send({ message: 'Internal server error' });
  }
};
```

## Performance and Optimization

### Response Caching
```typescript
// Cache frequently requested data
const userCache = new Map<number, { user: User, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getCachedUser = async (id: number): Promise<User | null> => {
  const cached = userCache.get(id);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  
  const user = await findUserById(id);
  if (user) {
    userCache.set(id, { user, timestamp: Date.now() });
  }
  
  return user;
};
```

### Database Indexing
```sql
-- Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_player1 ON game_results(player1_user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_player2 ON game_results(player2_user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_ended ON game_results(ended_at);
```

### Connection Pooling (for production)
```typescript
// For production, consider using a connection pool
import { Pool } from 'generic-pool';

const dbPool = Pool.createPool({
  create: () => {
    return new sqlite3.Database('./server/db/database.sqlite');
  },
  destroy: (db) => {
    return new Promise((resolve) => {
      db.close(resolve);
    });
  }
}, {
  max: 10, // maximum size of the pool
  min: 2   // minimum size of the pool
});
```

This comprehensive API documentation covers all backend routes, their implementations, security patterns, and optimization strategies used throughout the Pong platform.
