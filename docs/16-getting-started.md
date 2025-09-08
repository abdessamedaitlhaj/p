# Secure Getting Started Guide

This guide will take you from zero to running the **security-hardened** Pong platform locally, with step-by-step instructions including security configuration and environment setup.

## 📋 Prerequisites

### System Requirements
- **Node.js**: Version 18.0 or higher ([Download here](https://nodejs.org/))
- **Git**: For cloning the repository ([Download here](https://git-scm.com/))
- **Code Editor**: VS Code recommended ([Download here](https://code.visualstudio.com/))
- **Terminal**: Command line access (built into VS Code)

### Check Your Setup
```bash
# Verify Node.js installation
node --version  # Should show v18.0.0 or higher

# Verify npm installation  
npm --version   # Should show 8.0.0 or higher

# Verify git installation
git --version   # Should show git version info
```

## � Security Setup

### Step 1: Clone the Repository
```bash
# Clone the project
git clone https://github.com/VIBE08/pong.git

# Navigate to the project directory
cd pong

# Check the folder contents
ls -la
```

You should see folders like `client/`, `server/`, `docs/`, plus security files like `SECURITY.md`.

### Step 2: Configure Security Environment
```bash
# Copy environment template
cp .env.example .env  # If template exists
# OR create new .env file:
touch .env
```

**Configure `.env` with secure values:**
```bash
# CRITICAL: Generate secure JWT secrets (64+ characters each)
ACCESS_TOKEN_SECRET=your-super-secure-64-char-access-token-secret-here-change-this
REFRESH_TOKEN_SECRET=your-different-64-char-refresh-token-secret-here-change-this

# CORS Security (explicitly set allowed origins)
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

# Database
DATABASE_URL=./db/pong.db

# Server configuration
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
```

⚠️ **IMPORTANT**: Never use the example secrets in production! Generate unique, strong secrets.

### Step 3: Set Up Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Open the .env file in your editor
code .env
```

**Replace the placeholder secrets with secure values:**
```bash
# Generate secure secrets (run these commands in terminal)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy these generated strings into your `.env` file:
```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Client Configuration
VITE_SERVER_URL=http://localhost:3000
VITE_SOCKET_URL=ws://localhost:3000

# Authentication Secrets (replace with your generated values)
ACCESS_TOKEN_SECRET=your_first_generated_secret_here
REFRESH_TOKEN_SECRET=your_second_generated_secret_here
```

### Step 4: Initialize the Database
The database will be created automatically when you first start the server. The SQLite file will appear at `server/db/database.sqlite`.

### Step 5: Start the Development Server
```bash
# Start both backend and frontend together (recommended)
npm run dev:full
```

You should see output like:
```
[SERVER] 🚀 Server running at http://0.0.0.0:3000
[SERVER] 🎮 Socket.IO server ready
[VITE] ➜ Local: http://localhost:8080/
[VITE] ➜ Network: use --host to expose
```

## 🎮 First Time Setup Verification

### Step 1: Open the Application
Open your browser and go to: `http://localhost:8080`

You should see the Pong platform homepage.

### Step 2: Create Your First Account
1. Click "Register" or "Sign Up"
2. Fill in the registration form:
   - Username: `testplayer`
   - Email: `test@example.com`  
   - Password: `password123`
3. Click "Register"

### Step 3: Play Your First Game
1. After logging in, click "Play Local Game"
2. Adjust game settings if desired
3. Click "Start Game"
4. Use these controls:
   - **Left Paddle**: `W` (up) and `S` (down)
   - **Right Paddle**: `Arrow Up` and `Arrow Down`

### Step 4: Test Real-time Features
1. Open a second browser tab to `http://localhost:8080`
2. Register another account: `player2` / `test2@example.com` / `password123`
3. From player1's account, click "Find Match" 
4. From player2's account, click "Find Match"
5. You should be matched automatically for a remote game!

## 🔧 Development Workflow

### Running Individual Services
```bash
# Backend only (port 3000)
npm run server

# Frontend only (port 8080) 
npm run dev

# Clean up stale processes
npm run clean
```

### Making Your First Change
Let's modify the homepage to verify everything works:

1. Open `client/pages/HomePage.tsx`
2. Find the main heading and add your name:
```tsx
<h1 className="text-4xl font-bold text-center mb-8">
  Welcome to Pong Platform - Built by [Your Name]
</h1>
```
3. Save the file
4. The page should automatically refresh with your changes!

### Understanding the File Structure
```
pong/
├── client/               # React frontend (port 8080)
│   ├── components/       # Reusable UI components  
│   ├── pages/           # Route pages (HomePage, GamePage, etc.)
│   ├── hooks/           # Custom React hooks
│   ├── store/           # Zustand state management
│   └── types/           # TypeScript type definitions
├── server/              # Fastify backend (port 3000)
│   ├── controllers/     # HTTP request handlers
│   ├── game/           # Game engine and physics
│   ├── models/         # Database models
│   ├── routes/         # API route definitions
│   ├── socket/         # Real-time Socket.IO handlers
│   └── db/             # SQLite database
├── shared/             # Code shared between client/server
└── docs/              # Documentation (you're reading this!)
```

## 🐛 Common Issues and Solutions

### Issue: "Port 3000 already in use"
```bash
# Find what's using the port
lsof -ti:3000

# Kill the process (replace PID with the number from above)
kill -9 <PID>

# Or use the cleanup script
npm run clean
```

### Issue: "EACCES: permission denied"
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) ~/.npm

# Or use a Node version manager like nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

### Issue: Database errors on startup
```bash
# Delete the database file and restart (loses all data)
rm server/db/database.sqlite
npm run dev:full
```

### Issue: Frontend won't connect to backend
1. Check that both servers are running
2. Verify the `.env` file has correct URLs
3. Check browser console for connection errors
4. Try `http://localhost:8080` not `127.0.0.1`

### Issue: Socket.IO connection failures
1. Check browser developer tools Network tab
2. Look for failed WebSocket connections
3. Verify `VITE_SOCKET_URL=ws://localhost:3000` in `.env`
4. Restart both servers

## 📚 Next Steps

Now that you have the platform running, here's what to explore next:

### Beginner Tasks
1. **Customize a theme**: Modify colors in `tailwind.config.ts`
2. **Add a new page**: Copy `HomePage.tsx` and create your own route
3. **Try the CLI**: Follow the CLI documentation to play from terminal
4. **Create a tournament**: Test the tournament system with multiple accounts

### Understanding the Code
1. Read [Database Models](./09-database-models.md) to understand data structure
2. Check [Backend Routes](./07-backend-routes.md) for API endpoints
3. Review [Socket.IO Architecture](./13-socket-io-architecture.md) for real-time features
4. Study [Game Backend Architecture](./02-game-backend-architecture.md) for game logic

### Development Tasks
1. **Add logging**: Try adding `console.log` statements to see data flow
2. **Modify game settings**: Change paddle speed or ball physics
3. **Update the UI**: Try changing colors, fonts, or layout
4. **Add validation**: Improve form validation on registration

## 🆘 Getting Help

### Check These First
1. **Browser Console**: Press F12 and check for JavaScript errors
2. **Server Logs**: Look at the terminal running the backend
3. **Network Tab**: Check if API requests are failing
4. **Database**: Verify `server/db/database.sqlite` exists

### Documentation Resources
- **Complete API**: [Backend Routes Documentation](./07-backend-routes.md)
- **State Management**: [State Management Guide](./08-state-management.md)  
- **Common Patterns**: [Development Patterns](./18-development-patterns.md)
- **Debugging Help**: [Debugging Guide](./19-debugging-guide.md)

### Community Support
- Check existing GitHub issues for similar problems
- Create detailed bug reports with steps to reproduce
- Include your environment (OS, Node version, browser)

## ✅ Setup Checklist

Use this checklist to verify your setup is complete:

- [ ] Node.js 18+ installed and verified
- [ ] Repository cloned successfully
- [ ] `npm install` completed without errors
- [ ] Environment variables set with secure secrets
- [ ] Backend starts on port 3000
- [ ] Frontend starts on port 8080
- [ ] Can register and login to a user account
- [ ] Can play a local game with keyboard controls
- [ ] Can find and play a remote match
- [ ] Database file created at `server/db/database.sqlite`
- [ ] Made a test code change and saw it update automatically

## 🎯 Quick Commands Reference

```bash
# Essential development commands
npm run dev:full        # Start everything
npm run clean          # Fix port/process issues  
npm run server         # Backend only
npm run dev           # Frontend only

# Build for production
npm run build         # Build both client and server
npm run start         # Start production server

# Database reset (loses all data)
rm server/db/database.sqlite && npm run dev:full
```

Congratulations! You now have a fully functional real-time multiplayer Pong platform running locally. You're ready to start exploring the codebase and making your own modifications!
