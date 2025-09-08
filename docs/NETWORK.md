# Network Configuration Guide

This document explains how to configure the Pong platform to accept external connections from domains like `e3r4p5.1337.ma:8080`, including frontend hosting, backend exposure, and secure cross-origin configuration.

## 🌐 Network Architecture Overview

```ascii
Network Configuration Architecture

External Domain               Local Development
e3r4p5.1337.ma:8080    ←→    localhost:8080 (Frontend)
                                    ↓
                              localhost:3000 (Backend Server)
                                    ↓
                              Socket.IO + HTTP API
```

## 🔧 Configuration Steps

### 1. Frontend (Client) Configuration

#### Update API Base URLs
**File**: `client/utils/Axios.ts`

```typescript
import axios from 'axios';

// Replace localhost with your actual backend server IP/domain
const api = axios.create({
  baseURL: 'http://YOUR_BACKEND_IP:3000/api/',  // Change this
  withCredentials: true,
  timeout: 10000,
});

// For production deployment
const BACKEND_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-backend-domain.com/api/'
  : 'http://localhost:3000/api/';

const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
  timeout: 10000,
});
```

#### Update Socket.IO Client Connection
**Files**: Look for Socket.IO client connections throughout the codebase

```typescript
// Current (localhost only)
const socket = io('http://localhost:3000', {
  auth: { accessToken: state.user?.accessToken }
});

// Updated (external access)
const SOCKET_URL = process.env.NODE_ENV === 'production'
  ? 'https://your-backend-domain.com'
  : 'http://YOUR_BACKEND_IP:3000';

const socket = io(SOCKET_URL, {
  auth: { accessToken: state.user?.accessToken },
  transports: ['websocket', 'polling']
});
```

### 2. Backend (Server) Configuration

#### Update CORS Configuration
**File**: `server/index.ts`

```typescript
// Current configuration (localhost only)
await app.register(fastifyCors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:8080"],
  methods: ["GET", "POST"],
  credentials: true,
});

// Updated configuration (external domain support)
await app.register(fastifyCors, {
  origin: [
    "http://localhost:8080",           // Local development
    "http://e3r4p5.1337.ma:8080",     // External domain
    "https://e3r4p5.1337.ma:8080",    // HTTPS version
    // Add more domains as needed
  ],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
});
```

#### Update Socket.IO CORS
**File**: `server/index.ts`

```typescript
// Current Socket.IO configuration
await app.register(fastifySocketIO, {
  cors: { 
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:8080"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// Updated Socket.IO configuration
await app.register(fastifySocketIO, {
  cors: { 
    origin: [
      "http://localhost:8080",
      "http://e3r4p5.1337.ma:8080",
      "https://e3r4p5.1337.ma:8080"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});
```

#### Update Content Security Policy
**File**: `server/index.ts`

```typescript
await app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        "ws://localhost:3000", 
        "wss://localhost:3000",
        "ws://e3r4p5.1337.ma:3000",    // Add external WebSocket
        "wss://e3r4p5.1337.ma:3000",   // Add secure WebSocket
        "http://e3r4p5.1337.ma:3000",  // Add external HTTP
        "https://e3r4p5.1337.ma:3000"  // Add secure HTTP
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
});
```

### 3. Environment Configuration

#### Update `.env` File
```bash
# CORS Security - Add external domains
ALLOWED_ORIGINS=http://localhost:8080,http://e3r4p5.1337.ma:8080,https://e3r4p5.1337.ma:8080

# Server binding (allow external connections)
HOST=0.0.0.0  # Accept connections from any IP
PORT=3000

# Frontend URL (for redirects, emails, etc.)
FRONTEND_URL=http://e3r4p5.1337.ma:8080

# JWT Secrets (keep these secure!)
ACCESS_TOKEN_SECRET=your-super-secure-64-char-access-token-secret-here
REFRESH_TOKEN_SECRET=your-different-64-char-refresh-token-secret-here

# Database
DATABASE_URL=./db/pong.db

# Environment
NODE_ENV=production  # or development
```

## 🚀 Deployment Scenarios

### Scenario 1: Frontend on External Domain, Backend Local
```bash
# Frontend served from: e3r4p5.1337.ma:8080
# Backend running on: localhost:3000 (or local IP)

# Backend needs to accept connections from the external domain
ALLOWED_ORIGINS=http://e3r4p5.1337.ma:8080,https://e3r4p5.1337.ma:8080
HOST=0.0.0.0  # Accept external connections
```

### Scenario 2: Both Frontend and Backend on External Domain
```bash
# Frontend: e3r4p5.1337.ma:8080
# Backend: e3r4p5.1337.ma:3000

ALLOWED_ORIGINS=http://e3r4p5.1337.ma:8080,https://e3r4p5.1337.ma:8080
HOST=0.0.0.0
```

### Scenario 3: Development with External Access
```bash
# Allow both localhost and external domain for development
ALLOWED_ORIGINS=http://localhost:8080,http://e3r4p5.1337.ma:8080,https://e3r4p5.1337.ma:8080
NODE_ENV=development
HOST=0.0.0.0
```

## 🔒 Security Considerations

### 1. Domain Verification
```typescript
// Verify domains in your CORS configuration
const allowedOrigins = [
  'http://localhost:8080',           // Development
  'http://e3r4p5.1337.ma:8080',     // Production
  'https://e3r4p5.1337.ma:8080'     // Secure production
];

// Never use wildcards in production
// ❌ BAD: origin: "*"
// ✅ GOOD: origin: allowedOrigins
```

### 2. HTTPS Considerations
```typescript
// For production, always prefer HTTPS
const isProduction = process.env.NODE_ENV === 'production';

await app.register(fastifyCors, {
  origin: isProduction 
    ? ['https://e3r4p5.1337.ma:8080']  // HTTPS only in production
    : ['http://localhost:8080', 'http://e3r4p5.1337.ma:8080'],
  credentials: true,
});
```

### 3. Cookie Security
```typescript
// Update cookie settings for external domains
reply.setCookie('jwt', refreshToken, {
  httpOnly: true,
  secure: isProduction,  // HTTPS only in production
  sameSite: isProduction ? 'none' : 'lax',  // Cross-site cookies
  path: '/',
  domain: isProduction ? '.1337.ma' : undefined  // Allow subdomains
});
```

## 🛠️ Testing External Connections

### 1. Test CORS
```bash
# Test from browser console on e3r4p5.1337.ma:8080
fetch('http://YOUR_BACKEND_IP:3000/api/auth/signin', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test' })
});
```

### 2. Test Socket.IO Connection
```javascript
// Test from browser console
const socket = io('http://YOUR_BACKEND_IP:3000', {
  auth: { accessToken: 'your-jwt-token' }
});

socket.on('connect', () => {
  console.log('Socket connected successfully!');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection failed:', error);
});
```

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. CORS Errors
```
Access to fetch at 'http://localhost:3000' from origin 'http://e3r4p5.1337.ma:8080' has been blocked by CORS policy
```

**Solution**: Add the external domain to your CORS configuration.

#### 2. Socket.IO Connection Failures
```
WebSocket connection to 'ws://localhost:3000/socket.io/' failed
```

**Solution**: Update the Socket.IO client URL and server CORS settings.

#### 3. Cookie Not Being Set
```
Set-Cookie header is ignored in cross-origin context
```

**Solution**: Update cookie settings for cross-origin requests:
```typescript
sameSite: 'none',
secure: true,  // Requires HTTPS
```

## 📝 Quick Setup Checklist

- [ ] Update `ALLOWED_ORIGINS` in `.env` to include `e3r4p5.1337.ma:8080`
- [ ] Set `HOST=0.0.0.0` in `.env` to accept external connections
- [ ] Update CORS configuration in `server/index.ts`
- [ ] Update Socket.IO CORS configuration
- [ ] Update CSP headers to allow external domain
- [ ] Update frontend API URLs to point to your backend
- [ ] Update Socket.IO client connection URLs
- [ ] Test CORS and Socket.IO connections
- [ ] Verify authentication works cross-origin
- [ ] Check cookie settings for cross-origin scenarios

## 🚨 Production Security Notes

1. **Always use HTTPS** in production environments
2. **Explicitly list allowed origins** - never use wildcards
3. **Monitor CORS violations** in server logs
4. **Use secure cookie settings** for cross-origin authentication
5. **Implement rate limiting** per domain/IP
6. **Regular security audits** of network configuration

---

*Last Updated: September 4, 2025*
*Network Configuration Version: 1.0*
