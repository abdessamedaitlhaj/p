# Configuration Files Documentation

This document provides comprehensive coverage of all configuration files, security configurations, build setups, environment management, and secure development/production workflows for the Pong platform.

## Overview

The Pong platform uses a **security-hardened TypeScript configuration stack** with Vite for frontend builds, Fastify for backend services, and comprehensive security tooling for development, testing, and production deployment.

## Security Configuration

### Environment Variables (`.env`)

**Critical Security Variables:**
```bash
# JWT Security
ACCESS_TOKEN_SECRET=your-super-secure-64-char-secret-here
REFRESH_TOKEN_SECRET=your-different-64-char-secret-here

# CORS Security
ALLOWED_ORIGINS=http://localhost:8080,https://yourdomain.com

# Database
DATABASE_URL=./db/pong.db

# Server
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
```

**Security Requirements:**
- JWT secrets must be **64+ characters** and cryptographically random
- Different secrets for access and refresh tokens
- ALLOWED_ORIGINS must be **explicitly set** in production (no wildcards)
- NODE_ENV affects security headers and debug features

## Package Management and Dependencies

### `package.json` (Root Configuration)

```json
{
  "name": "fusion-starter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --config ./client/vite.config.ts",
    "server": "nodemon --exec tsx server/index.ts",
    "dev:full": "concurrently -n 'SERVER,VITE' -c 'cyan,green' \"npm run server\" \"npm run dev\"",
    "clean": "bash scripts/cleanup-dev.sh",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --config ./client/vite.config.ts",
    "build:server": "vite build --config ./server/vite.config.server.ts",
    "start": "node dist/server/node-build.mjs",
    "security:audit": "npm audit --audit-level moderate",
    "security:check": "npm run security:audit && npm run lint"
  }
}
```

**Security Configuration Details**:
- **Module Type**: ESM for modern JavaScript modules
- **Security Scripts**: Regular audit checks and linting
- **Production Build**: Compiled and bundled for security

### Security Dependencies

```json
"dependencies": {
  // Security Framework
  "fastify": "^4.29.1",
  "@fastify/helmet": "^11.1.1",    // Security headers (CSP, XSS protection)
  "@fastify/rate-limit": "^9.1.0", // Rate limiting (DoS protection)
  "@fastify/cors": "^8.5.0",       // CORS protection
  "@fastify/cookie": "^8.3.0",     // Secure cookie handling
  
  // Authentication & Validation
  "jsonwebtoken": "^9.0.2",        // JWT tokens
  "bcrypt": "^5.1.1",             // Password hashing
  "zod": "^3.22.4",               // Input validation
  "@fastify/helmet": "^10.1.1",
  "@fastify/static": "^8.2.0",
  
  // Real-time Communication
  "fastify-socket.io": "^5.1.0",
  "socket.io": "^4.8.1",
  "socket.io-client": "^4.8.1",
  
  // Authentication & Security
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^6.0.0",
  "dotenv": "^17.2.1",
  
  // Database & Utilities
  "sqlite3": "^5.1.7",
  "axios": "^1.11.0",
  "moment": "^2.30.1",
  
  // Frontend State & UI
  "zustand": "^5.0.7",
  "next-themes": "^0.4.6",
  "react-hot-toast": "^2.5.2",
  "lucide-react": "^0.539.0",
  
  // Styling
  "tailwindcss-animate": "^1.0.7",
  "autoprefixer": "^10.4.21"
}
```

### Development Dependencies

```json
"devDependencies": {
  // Build Tools
  "vite": "^6.3.5",
  "@vitejs/plugin-react-swc": "^3.5.0",
  "tsx": "^4.20.3",
  "typescript": "^5.5.3",
  
  // React & Types
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.26.2",
  "@types/react": "^18.3.23",
  "@types/react-dom": "^18.3.7",
  "@types/node": "^22.16.5",
  
  // Development Utilities
  "nodemon": "^3.1.10",
  "concurrently": "^9.2.0",
  "pino-pretty": "^13.0.0",
  
  // Additional React Tools
  "@tanstack/react-query": "^5.84.2",
  
  // Styling Tools
  "tailwindcss": "^3.4.17",
  "postcss": "^8.5.6",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.5.2",
  
  // UI Components
  "sonner": "^1.5.0"
}
```

## TypeScript Configuration

### `tsconfig.json` (Shared TypeScript Config)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    
    /* Bundler mode */
    "moduleResolution": "node",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,

    /* Linting - Relaxed for rapid development */
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitAny": false,
    "noFallthroughCasesInSwitch": false,
    "strictNullChecks": false,

    /* Path mapping */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./client/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": [
    "client/**/*",
    "server/**/*", 
    "shared/**/*",
    "vite.config.ts",
    "vite.config.server.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

**Key Configuration Features**:
- **Modern Target**: ES2020 with ESNext modules for latest JavaScript features
- **React JSX**: Using React 18's new JSX transform
- **Path Aliases**: `@/` for client code, `@shared/` for shared types
- **Relaxed Linting**: Optimized for rapid development (can be tightened for production)
- **Module Resolution**: Node-style resolution with TypeScript extensions allowed

## Vite Build Configuration

### Frontend Build (`client/vite.config.ts`)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname),
  
  server: {
    host: "0.0.0.0",  // Allow external connections
    port: 8080,       // Frontend dev server port
    
    proxy: {
      "/api": {
        target: process.env.VITE_SERVER_URL || "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.VITE_SOCKET_URL || "ws://localhost:3000", 
        ws: true,  // Enable WebSocket proxying
      },
    },
  },
  
  build: {
    outDir: "../dist/spa",  // Single Page Application output
  },
  
  plugins: [
    react()  // React with SWC for fast compilation
  ],
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../client"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
}));
```

**Key Features**:
- **SWC Plugin**: Super-fast React compilation with SWC instead of Babel
- **Development Proxy**: Automatic proxying of API and Socket.IO requests to backend
- **External Access**: `0.0.0.0` host allows container/VM access
- **Path Aliases**: Consistent import paths across the application

### Backend Build (`server/vite.config.server.ts`)

```typescript
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "./node-build.ts"),
      name: "server",
      fileName: "production",
      formats: ["es"],
    },
    outDir: "../dist/server",
    target: "node22",    // Target Node.js 22
    ssr: true,          // Server-side rendering mode
    
    rollupOptions: {
      external: [
        // Node.js built-ins
        "node:fs", "node:path", "node:url", "node:http", 
        "node:https", "node:os", "node:crypto", "node:stream",
        "node:util", "node:events", "node:buffer", 
        "node:querystring", "node:child_process",
        
        // External dependencies (not bundled)
        "fastify", "@fastify/static", "fastify-cors"
      ],
      
      output: {
        format: "es",
        entryFileNames: "[name].mjs",  // ES modules with .mjs extension
      },
    },
    
    minify: false,    // Keep readable for debugging
    sourcemap: true,  // Generate source maps
  },
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../client"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
```

**Key Features**:
- **Node.js Target**: Optimized for Node.js 22 runtime
- **ES Modules**: Generates modern `.mjs` files
- **External Dependencies**: Excludes Node.js built-ins and heavy dependencies
- **Source Maps**: Enabled for production debugging
- **No Minification**: Keeps code readable for server debugging

## Styling Configuration

### Tailwind CSS (`tailwind.config.ts`)

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],  // Class-based dark mode
  content: ["./client/**/*.{ts,tsx}"],  // Scan client files
  prefix: "",
  
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    
    extend: {
      fontFamily: {
        japanese: ["Sawarabi Mincho", "serif"],
        moroccan: ["Cormorant Garamond", "serif"], 
        arcade: ["Orbitron", "monospace"],
        space: ["Orbitron", "sans-serif"],
      },
      
      colors: {
        // Design system colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        
        // Game theme colors
        japanese: {
          background: "#faf8f3",
          paddle: "#dc2626", 
          ball: "#1f2937",
          accent: "#dc2626",
          text: "#1f2937",
        },
        
        moroccan: {
          background: "#1e3a8a",
          paddle: "#f59e0b",
          ball: "#ea580c", 
          accent: "#16a34a",
          text: "#f8fafc",
        },
        
        arcade: {
          background: "#1e293b",
          paddle: "#dc2626",
          ball: "#3b82f6",
          accent: "#ef4444",
          text: "#f1f5f9",
        },
        
        space: {
          background: "#0f0f23",
          paddle: "#06b6d4",
          ball: "#10b981",
          accent: "#f97316", 
          text: "#f8fafc",
        },
      },
      
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        glow: {
          "0%, 100%": { filter: "drop-shadow(0 0 5px currentColor)" },
          "50%": { filter: "drop-shadow(0 0 15px currentColor)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out", 
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
      },
      
      backgroundImage: {
        "japanese-pattern": "radial-gradient(circle at 20% 20%, rgba(220, 38, 38, 0.1) 0%, transparent 50%)",
        "moroccan-pattern": "repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.1) 10px, transparent 10px, transparent 20px)",
        "space-stars": "radial-gradient(2px 2px at 20px 30px, #eee, transparent), radial-gradient(2px 2px at 40px 70px, #fff, transparent), radial-gradient(1px 1px at 90px 40px, #fff, transparent)",
      },
    },
  },
  
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

**Key Features**:
- **Game Themes**: Four distinct visual themes (Japanese, Moroccan, Arcade, Space)
- **Custom Fonts**: Theme-specific typography
- **Animation System**: Custom keyframes for UI effects
- **Design Tokens**: CSS custom property integration
- **Background Patterns**: Theme-specific decorative backgrounds

### PostCSS (`postcss.config.js`)

```javascript
export default {
  plugins: {
    tailwindcss: {},    // Tailwind CSS processing
    autoprefixer: {},   // Automatic vendor prefixes
  },
};
```

## Environment Configuration

### Development Environment (`.env`)

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Client Configuration  
VITE_SERVER_URL=http://localhost:3000
VITE_SOCKET_URL=ws://localhost:3000

# Authentication Secrets
ACCESS_TOKEN_SECRET=tagfq
REFRESH_TOKEN_SECRET=edsfgsg
```

### Environment Template (`.env.example`)

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Client Configuration
VITE_SERVER_URL=http://localhost:3000
VITE_SOCKET_URL=ws://localhost:3000

# Authentication Secrets (Generate secure secrets for production)
ACCESS_TOKEN_SECRET=your_secure_access_token_secret_here
REFRESH_TOKEN_SECRET=your_secure_refresh_token_secret_here
```

### Vite Environment Types (`client/vite-env.d.ts`)

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string
  readonly VITE_SOCKET_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

**Purpose**: Provides TypeScript definitions for Vite environment variables accessed via `import.meta.env`

## Development Tools

### Nodemon Configuration (`nodemon.json`)

```json
{
  "watch": [
    "server/**/*.ts",
    "server/**/*.js"
  ],
  "ignore": [
    "server/db/**",      // Ignore database files
    "**/*.log",          // Ignore log files
    "client/**",         // Ignore client code (handled by Vite)
    "public/**",         // Ignore static assets
    "dist/**",           // Ignore build output
    "node_modules/**"    // Ignore dependencies
  ],
  "ext": "ts,js,json",   // Watch TypeScript, JavaScript, and JSON files
  "exec": "tsx server/index.ts"  // Execute with tsx (TypeScript runner)
}
```

**Key Features**:
- **Smart Watching**: Only watches server files, ignores database/client/build
- **TypeScript Support**: Uses `tsx` for direct TypeScript execution
- **File Extension Filtering**: Watches relevant file types only

### Development Cleanup Script (`scripts/cleanup-dev.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT=${PORT:-3000}
RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; NC="\033[0m"

echo -e "${YELLOW}🔍 Checking for stale dev processes...${NC}"

# Kill processes matching dev scripts
while :; do
  pids=$(ps -eo pid,command | grep -E "(nodemon --exec tsx server/index.ts|concurrently -n SERVER,VITE|vite --config ./client/vite.config.ts)" | grep -v grep | awk '{print $1}') || true
  if [ -z "${pids}" ]; then break; fi
  echo -e "${YELLOW}⚠️  Killing stale processes: ${pids}${NC}"
  kill -9 ${pids} 2>/dev/null || true
  sleep 0.5
done

# Free server port
echo -e "${YELLOW}🔍 Checking port ${PORT}...${NC}"
port_pid=$(lsof -ti:${PORT}) || true
if [ -n "${port_pid}" ]; then
  echo -e "${YELLOW}⚠️  Port ${PORT} in use by PID ${port_pid}, killing...${NC}"
  kill -9 ${port_pid} || true
  sleep 1
fi

echo -e "${GREEN}✅ Development environment cleaned${NC}"
```

**Purpose**: Cleans up stale development processes and frees ports for fresh starts

## Production Build Configuration

### Server Production Entry (`server/node-build.ts`)

```typescript
import path from "path";
import { createServer } from "./index";

const port = parseInt(process.env.PORT || "3000");
const host = process.env.HOST || "0.0.0.0";

async function startServer() {
  const app = await createServer();
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const distPath = path.join(__dirname, "../spa");

  // Serve static files in production
  if (process.env.NODE_ENV === "production") {
    app.register(import("@fastify/static"), {
      root: distPath,
      wildcard: false
    });

    // Handle React Router - serve index.html for all non-API routes
    app.setNotFoundHandler((_request, reply) => {
      reply.sendFile("./client/index.html", distPath);
    });
  }

  try {
    await app.listen({ port, host });
    console.log(`🚀 Fastify server running on port ${port}`);
    console.log(`📱 Frontend: http://localhost:${port}`);
    console.log(`🔧 API: http://localhost:${port}/api`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, async () => {
    console.log(`🛑 Received ${signal}, shutting down gracefully`);
    process.exit(0);
  });
});
```

**Key Features**:
- **Static File Serving**: Serves built React app in production
- **SPA Routing**: Handles React Router by serving index.html for non-API routes
- **Graceful Shutdown**: Proper cleanup on process termination
- **Comprehensive Logging**: Server status and endpoint information

## Git Configuration

### `.gitignore`

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Dependencies
node_modules/

# Build outputs
dist
dist-ssr
*.local

# Environment
.env
.env.local
.env.production

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Package locks (using npm)
package-lock.json

# Configuration
.config/
```

## Development Workflow

### Starting Development Environment

```bash
# Full development stack (recommended)
npm run dev:full

# Or individually:
npm run server    # Backend only
npm run dev       # Frontend only

# Clean environment before starting
npm run clean
```

### Development Script Breakdown

```json
{
  "dev": "vite --config ./client/vite.config.ts",
  "server": "nodemon --exec tsx server/index.ts", 
  "dev:full": "concurrently -n 'SERVER,VITE' -c 'cyan,green' \"npm run server\" \"npm run dev\"",
  "clean": "bash scripts/cleanup-dev.sh"
}
```

**Script Functions**:
- **`dev`**: Starts Vite dev server on port 8080 with HMR
- **`server`**: Starts backend with nodemon auto-restart
- **`dev:full`**: Runs both simultaneously with colored output
- **`clean`**: Kills stale processes and frees ports

### Production Build Process

```bash
# Full production build
npm run build

# Individual builds
npm run build:client   # Creates dist/spa/
npm run build:server   # Creates dist/server/

# Start production server
npm start
```

### Production Script Breakdown

```json
{
  "build": "npm run build:client && npm run build:server",
  "build:client": "vite build --config ./client/vite.config.ts",
  "build:server": "vite build --config ./server/vite.config.server.ts", 
  "start": "node dist/server/node-build.mjs"
}
```

## Configuration Environment Variables

### Server Configuration Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3000 | Backend server port |
| `HOST` | 0.0.0.0 | Server bind address |
| `NODE_ENV` | development | Environment mode |
| `DATABASE_PATH` | ./server/db/database.sqlite | SQLite database file |
| `ACCESS_TOKEN_SECRET` | (required) | JWT access token secret |
| `REFRESH_TOKEN_SECRET` | (required) | JWT refresh token secret |

### Client Configuration Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_SERVER_URL` | http://localhost:3000 | Backend API base URL |
| `VITE_SOCKET_URL` | ws://localhost:3000 | Socket.IO server URL |

### Configuration Usage in Code

#### Server Configuration Loading

```typescript
// server/index.ts
import dotenv from "dotenv";
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || "0.0.0.0", 
  nodeEnv: process.env.NODE_ENV || 'development',
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!
};
```

#### Client Configuration Access

```typescript
// client/utils/config.ts
const config = {
  serverUrl: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
  socketUrl: import.meta.env.VITE_SOCKET_URL || 'ws://localhost:3000'
};
```

## Build Output Structure

```
dist/
├── spa/                    # Frontend build output
│   ├── index.html         # Main HTML file
│   ├── assets/            # Bundled CSS/JS/images
│   │   ├── index-[hash].js
│   │   └── index-[hash].css
│   └── favicon.ico
└── server/                # Backend build output
    ├── node-build.mjs     # Server entry point
    └── assets/            # Server assets
```

## Development vs Production Differences

### Development Mode Features
- **Hot Module Replacement**: Instant frontend updates
- **Auto-restart**: Backend restarts on file changes
- **Detailed Logging**: Verbose console output with `pino-pretty`
- **Separate Ports**: Frontend (8080) and backend (3000) on different ports
- **Proxy Configuration**: Vite proxies API requests to backend

### Production Mode Features
- **Static Serving**: Backend serves built frontend files
- **Single Port**: All traffic through backend port
- **Minification**: Optimized asset sizes (frontend only)
- **Source Maps**: Available for debugging
- **Process Management**: Graceful shutdown handling

## Configuration Best Practices

### Security Considerations
1. **Environment Secrets**: Never commit `.env` files with real secrets
2. **Token Generation**: Use cryptographically secure secrets in production
3. **CORS Configuration**: Restrict origins in production environments
4. **Helmet Integration**: Security headers via `@fastify/helmet`

### Performance Optimizations
1. **SWC Compilation**: Faster than Babel for React builds
2. **ES Modules**: Modern module format throughout
3. **Tree Shaking**: Unused code elimination in builds
4. **Code Splitting**: Automatic route-based splitting

### Development Experience
1. **Path Aliases**: Consistent `@/` imports across codebase
2. **TypeScript Integration**: Full type safety with shared types
3. **Concurrent Development**: Parallel frontend/backend development
4. **Port Management**: Automatic cleanup of stale processes

This configuration setup provides a robust foundation for both development productivity and production deployment, with modern tooling and comprehensive type safety throughout the stack.
