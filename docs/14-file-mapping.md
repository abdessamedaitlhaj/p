# File Mapping and Export Documentation

This document provides comprehensive mapping of file exports, imports, and security-related function usage patterns across the entire codebase to help developers understand secure code organization and security dependencies.

## 🔐 Security-Related File Exports

### Security Middleware Files

#### `server/middleware/socketAuth.ts` (Socket Authentication)
**Exports**:
```typescript
export const socketAuthMiddleware: (socket: Socket, next: Function) => void
```

**Key Functionality**: JWT verification for all socket connections
**Used By**: All socket namespaces (`/chat`, `/game`, `/lobby`, `/tournament`)

#### `server/middleware/rateLimit.ts` (Rate Limiting)
**Exports**:
```typescript
export class RateLimiter
export const globalRateLimit: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
export const authRateLimit: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
export function createRateLimit(maxRequests: number, windowMs: number): Function
```

**Key Functionality**: DoS protection, brute force prevention
**Used By**: Main server setup, authentication routes

#### `server/middleware/verifyToken.ts` (HTTP Authentication)
**Exports**:
```typescript
export const verifyJwt: (req: FastifyRequest, reply: FastifyReply, done: Function) => void
export const verifyToken: Function // Authenticated routes
export const verifyTokenAndAuthorization: Function // User-specific resources
```

**Key Functionality**: JWT verification for HTTP routes, user authorization
**Used By**: Protected API routes (`/api/users/*`, `/api/messages/*`, `/api/cli/*`)

### Security Validation Files

#### `server/socket/validation.ts` (Input Validation)
**Exports**:
```typescript
export const SendMessageSchema: z.ZodSchema
export const JoinGameSchema: z.ZodSchema
export const SendInviteSchema: z.ZodSchema
export const TournamentCreateSchema: z.ZodSchema
export function validateSocketData<T>(schema: z.ZodSchema<T>, data: unknown): T
```

**Key Functionality**: Zod-based input validation for all socket events
**Used By**: All socket event handlers in `secureHandlers.ts`

## Backend File Exports and Imports

### Core Server Files

#### `server/index.ts` (Main Server Entry Point)
**Exports**: None (main entry point)
**Key Security Imports**:
```typescript
import fastify from 'fastify'
import fastifyHelmet from '@fastify/helmet' // Security headers
import { globalRateLimit, authRateLimit } from './middleware/rateLimit'
import { socketAuthMiddleware } from './middleware/socketAuth'
import { createSocketNamespaces } from './socket/namespaces'
import { registerSecureHandlers } from './socket/secureHandlers'

// Secure route imports
import { AuthRoutes } from './routes/auth' // Rate-limited auth routes
import { RefreshRoutes } from './routes/refreshToken' // Token management
import { UserRoutes } from './routes/users' // Protected user routes
import { MessageRoutes } from './routes/messages' // Authenticated chat
import { CliAuthRoutes, CliRoutes } from './cli/cliRoutes' // Secure CLI
```

**Security Features**: 
- CSP headers via Helmet
- Global rate limiting
- Secure CORS configuration
- Authentication middleware setup
- Namespace isolation

#### `server/socket/namespaces.ts` (Secure Socket Namespaces)
**Exports**:
```typescript
export interface SocketNamespaces {
  chat: Namespace;
  game: Namespace;
  lobby: Namespace;
  tournament: Namespace;
}
export function createSocketNamespaces(app: FastifyInstance): SocketNamespaces
```

**Security Features**:
- Authentication middleware applied to ALL namespaces
- Namespace isolation prevents cross-context access
- Logged connections with authenticated user IDs

---

#### `server/types.ts` (Shared Backend Types)
**Exports**:
```typescript
export interface GameSettings { /* game configuration */ }
export interface GameSettingsWithTheme extends GameSettings { /* themed settings */ }
export interface GameStats { /* performance statistics */ }
export interface GameResult { /* match results */ }
export interface ChatMessage { /* chat message structure */ }
export interface Tournament { /* tournament data */ }
export interface TournamentPlayer { /* player in tournament */ }
export interface MatchInvite { /* tournament match invitation */ }
```

**Key Usage**: Imported by all backend modules requiring shared type definitions

---

### Game Logic System

#### `server/game/GameEngine.ts`
**Exports**:
```typescript
export default class GameEngine {
  static update(state: GameState, inputs: any[]): { state: GameState; events: any[] }
  static detectCollisions(state: GameState): CollisionEvents
  static updateBall(state: GameState): GameState
  static updatePaddles(state: GameState, inputs: any[]): GameState
}
```

**Imports**: 
- `GameState` from './GameState'
- Game configuration constants

**Used by**: GameRoom, RemoteGameRoom, test suites

---

#### `server/game/GameState.ts` 
**Exports**:
```typescript
export interface GameState {
  ball: { x: number; y: number; vx: number; vy: number; radius: number }
  paddles: { p1: PaddleState; p2: PaddleState }
  score: { p1: number; p2: number }
  gameStarted: boolean
  gameEnded: boolean
  winner?: 'p1' | 'p2'
  settings: GameSettings
}

export interface PaddleState {
  y: number
  height: number
  speed: number
}

export function createInitialGameState(settings: GameSettings): GameState
export function cloneGameState(state: GameState): GameState
```

**Used by**: GameEngine, GameRoom, RemoteGameRoom, frontend game hooks

---

#### `server/game/GameRoom.ts`
**Exports**:
```typescript
export default class GameRoom {
  constructor(socket: Socket, settings: GameSettingsWithTheme)
  
  public state: GameState
  public settings: GameSettingsWithTheme
  public interval?: NodeJS.Timeout
  
  private handleInput(input: any): void
  private broadcastState(): void
  public destroy(): void
}
```

**Imports**:
- `GameEngine` from './GameEngine'
- `GameState, createInitialGameState` from './GameState'
- `Socket` from 'socket.io'

**Used by**: roomManager for local game management

---

#### `server/game/RemoteGameRoom.ts`
**Exports**:
```typescript
export default class RemoteGameRoom {
  constructor(
    player1: Socket, player2: Socket,
    player1UserId: string, player2UserId: string,
    settings?: GameSettingsWithTheme,
    metadata?: { matchType?: string }
  )
  
  public state: GameState
  public player1: Socket
  public player2: Socket
  public isStarted: boolean
  
  public getPlayer1UserId(): string
  public getPlayer2UserId(): string
  public onPlayerExit?(socketId: string): void
  
  private handleInput(input: any, playerId: 'p1' | 'p2'): void
  private handleGameEnd(winner: 'p1' | 'p2'): void
  public destroy(): void
}
```

**Imports**:
- `GameEngine` from './GameEngine'
- `GameState, createInitialGameState` from './GameState'
- `remoteStats` from './remoteStats'
- Database models for result storage

**Used by**: roomManager for remote game management

---

### Room Management System

#### `server/roomManager.ts`
**Exports**:
```typescript
class RoomManager {
  // Local game rooms
  createLocalRoom(socket: Socket, settings: GameSettingsWithTheme): Promise<string>
  getRoom(roomId: string): GameRoom | undefined
  deleteRoom(roomId: string): void
  
  // Remote game rooms  
  createRemoteGameRoom(
    p1: Socket, p2: Socket, 
    p1Id: string, p2Id: string,
    settings?: GameSettingsWithTheme,
    metadata?: any
  ): string
  getRemoteRoom(roomId: string): RemoteGameRoom | undefined
  deleteRemoteRoom(roomId: string): void
  
  // Utility methods
  listRooms(): string[]
  getRoomCount(): number
  cleanup(): void
}

export default new RoomManager()
```

**Imports**:
- `GameRoom` from './game/GameRoom'
- `RemoteGameRoom` from './game/RemoteGameRoom'
- `Socket` from 'socket.io'

**Used by**: Socket handlers, server initialization, cleanup routines

---

### Activity Management System

#### `server/activityManager.ts`
**Exports**:
```typescript
interface LockState {
  locked: boolean
  reason?: 'match' | 'tournament' | 'invite'
  pendingInviteId?: string
  tournamentLocked?: boolean
}

class ActivityManager {
  initialize(io: any): void
  
  // Lock management
  lockForMatch(p1Id: string, p2Id: string): void
  unlockUser(userId: string): void
  isUserLocked(userId: string): LockState
  
  // Tournament locks
  setTournamentLock(userId: string, locked: boolean): void
  
  // Invite management
  setPendingInvite(inviterId: string, targetId: string, inviteId: string): void
  clearPendingInvite(inviterId: string, targetId: string): void
  isUserBusyForInvite(userId: string): boolean
  
  // State queries
  getLockState(userId: string): LockState
  resetLocksForUser(userId: string): void
}

export default new ActivityManager()
```

**Used by**: Socket handlers, tournament system, matchmaking system

---

### Tournament Management System

#### `server/tournamentManager.ts`
**Exports**:
```typescript
class TournamentManager {
  // Tournament CRUD
  create(name: string, creatorId: string, socket: Socket, startsInMinutes: number): Tournament
  join(tournamentId: string, userId: string, socket: Socket): Tournament
  leaveByUser(tournamentId: string, userId: string): Tournament
  
  // State queries
  listAvailable(): Tournament[]
  listCompleted(): Tournament[]
  isUserActive(userId: string): boolean
  
  // Match management
  respondToMatchInvite(
    io: any, tournamentId: string, 
    matchKey: string, userId: string, 
    response: 'accept' | 'decline'
  ): void
  
  // Socket tracking
  updatePlayerSocket(userId: string, socketId: string): void
  leaveAllBySocket(socketId: string): void
  
  // Broadcasting
  broadcast(io: any, tournament: Tournament, event: string, data: any): void
}

export default new TournamentManager()
```

**Imports**:
- Tournament flow controllers from `./tournament/`
- Database models for persistence

**Used by**: Socket handlers, server initialization

---

### Database Models

#### `server/models/Users.ts`
**Exports**:
```typescript
export interface User {
  id: number
  username: string
  email: string
  password_hash: string
  avatarurl?: string
  created_at: Date
  last_seen?: Date
  status: 'online' | 'offline'
}

export async function createUser(userData: Partial<User>): Promise<User>
export async function getUserById(id: number): Promise<User | null>
export async function getUserByEmail(email: string): Promise<User | null>
export async function getUserByUsername(username: string): Promise<User | null>
export async function updateUser(id: number, updates: Partial<User>): Promise<void>
export async function deleteUser(id: number): Promise<void>
export async function listUsers(limit?: number, offset?: number): Promise<User[]>
```

**Used by**: Authentication routes, socket handlers, user management

---

#### `server/models/GameResults.ts`
**Exports**:
```typescript
export interface GameResult {
  id: number
  p1_id: number
  p2_id: number
  winner_id?: number
  p1_score: number
  p2_score: number
  game_duration: number
  created_at: Date
  match_type: 'local' | 'remote' | 'tournament' | 'matchmaking'
  per_match_stats?: string // JSON stored stats
}

export async function createGameResult(result: Partial<GameResult>): Promise<GameResult>
export async function getGameResultById(id: number): Promise<GameResult | null>
export async function getGameResultsByPlayer(playerId: number): Promise<GameResult[]>
export async function getRecentGameResults(limit: number): Promise<GameResult[]>
```

**Used by**: Game completion handlers, statistics calculation, match history

---

#### `server/models/PlayerStats.ts`
**Exports**:
```typescript
export interface PlayerStats {
  id: number
  user_id: number
  games_played: number
  games_won: number
  games_lost: number
  total_score: number
  avg_game_duration: number
  longest_game: number
  shortest_game: number
  best_winning_streak: number
  current_streak: number
  last_updated: Date
}

export async function createPlayerStats(userId: number): Promise<PlayerStats>
export async function getPlayerStats(userId: number): Promise<PlayerStats | null>
export async function updatePlayerStats(userId: number, gameResult: GameResult): Promise<void>
export async function getTopPlayers(limit: number): Promise<PlayerStats[]>
export async function resetPlayerStats(userId: number): Promise<void>
```

**Used by**: Statistics routes, game completion handlers, leaderboard generation

---

### Authentication and Middleware

#### `server/middleware/verifyToken.ts`
**Exports**:
```typescript
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string
    username: string
    email: string
  }
}

export async function verifyToken(
  request: FastifyRequest, 
  reply: FastifyReply
): Promise<void>
```

**Used by**: Protected routes, user authentication flow

---

#### `server/token/generateToken.ts`
**Exports**:
```typescript
export function generateAccessToken(user: any): string
export function generateRefreshToken(user: any): string
export function verifyAccessToken(token: string): any
export function verifyRefreshToken(token: string): any
```

**Used by**: Authentication routes, token refresh logic, CLI authentication

---

### Route Controllers

#### `server/controllers/auth.ts`
**Exports**:
```typescript
export async function loginUser(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function registerUser(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function logoutUser(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function getCurrentUser(request: FastifyRequest, reply: FastifyReply): Promise<void>
```

**Used by**: `routes/auth.ts` for endpoint handlers

---

#### `server/controllers/users.ts`
**Exports**:
```typescript
export async function getAllUsers(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function getUserProfile(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function updateUserProfile(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function getUserStats(request: FastifyRequest, reply: FastifyReply): Promise<void>
export async function getMatchHistory(request: FastifyRequest, reply: FastifyReply): Promise<void>
```

**Used by**: `routes/users.ts` for user management endpoints

---

## Frontend File Exports and Imports

### Core Application Files

#### `client/App.tsx`
**Exports**: `export default App`
**Imports**:
```typescript
import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/Context'
import { Toaster } from 'react-hot-toast'

// Page components
import HomePage from './pages/HomePage'
import Login from './pages/Login'
import GamePage from './pages/GamePage'
import RemoteGamePage from './pages/RemoteGamePage'
import TournamentPage from './pages/TournamentPage'
// ... other page imports

// Components
import Navbar from './components/Navbar'
import PersistLogin from './components/PersistLogin'
```

**Functionality**: Main application router, global providers, route configuration

---

### State Management

#### `client/store/createRootStore.ts`
**Exports**:
```typescript
export interface RootStore {
  // Slice states
  users: UsersState
  messages: MessagesState  
  chat: ChatState
  activity: ActivityState
  
  // Actions
  setUsers: (users: User[]) => void
  addMessage: (message: ChatMessage) => void
  setActivityLock: (locked: boolean, reason?: string) => void
}

export const createRootStore = (): RootStore => { /* store creation logic */ }
```

**Used by**: `useStore.tsx`, component state management

---

#### `client/store/useStore.tsx` 
**Exports**:
```typescript
export const useStore = <T>(selector: (state: RootStore) => T): T => {
  return useStoreImpl(selector)
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <StoreContext.Provider value={store}>
      {children}
    </StoreContext.Provider>
  )
}
```

**Imports**: 
- `createRootStore` from './createRootStore'
- React context setup

**Used by**: All components needing global state access

---

### Game Logic Hooks

#### `client/hooks/useLocalGame.ts`
**Exports**:
```typescript
export interface LocalGameState {
  gameState: GameState | null
  isGameActive: boolean
  roomId: string | null
  settings: GameSettings | null
}

export interface LocalGameActions {
  startGame: (settings: GameSettings) => void
  endGame: () => void
  sendInput: (input: any) => void
  resetGame: () => void
}

export const useLocalGame = (): [LocalGameState, LocalGameActions] => {
  // Hook implementation
}
```

**Imports**:
- `Socket` from socket.io-client
- `GameState` from shared types
- `useStore` for global state

**Used by**: GamePage component, local game interface

---

#### `client/hooks/useRemoteGame.ts`
**Exports**:
```typescript
export interface RemoteGameState {
  gameState: GameState | null
  isConnected: boolean
  roomId: string | null  
  playerId: 'p1' | 'p2' | null
  opponentInfo: { name: string; id: string } | null
  gameStatus: 'waiting' | 'playing' | 'finished'
}

export interface RemoteGameActions {
  joinRoom: (roomId: string, playerId: 'p1' | 'p2') => void
  leaveRoom: () => void
  sendInput: (input: any) => void
  startGame: () => void
}

export const useRemoteGame = (): [RemoteGameState, RemoteGameActions] => {
  // Hook implementation  
}
```

**Imports**:
- Socket connection from global store
- Game state types
- Activity management hooks

**Used by**: RemoteGamePage component, matchmaking interface

---

#### `client/hooks/useGameInput.ts`
**Exports**:
```typescript
export interface GameInputState {
  keys: {
    w: boolean
    s: boolean  
    arrowUp: boolean
    arrowDown: boolean
  }
  lastInput: any
}

export const useGameInput = (onInput?: (input: any) => void) => {
  const [inputState, setInputState] = useState<GameInputState>(initialState)
  
  useEffect(() => {
    // Keyboard event listeners
  }, [])
  
  return inputState
}
```

**Used by**: Game components for input handling

---

### Page Components

#### `client/pages/HomePage.tsx`
**Exports**: `export default HomePage`
**Imports**:
```typescript
import React from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'
```

**Functionality**: Landing page, navigation to game modes

---

#### `client/pages/GamePage.tsx`
**Exports**: `export default GamePage`
**Imports**:
```typescript
import React from 'react'
import { useLocalGame } from '../hooks/useLocalGame'
import { useGameInput } from '../hooks/useGameInput'
import PongTable from '../components/PongTable'
import GameSettings from '../components/GameSettings'
```

**Functionality**: Local game interface, game settings, rendering

---

#### `client/pages/RemoteGamePage.tsx` 
**Exports**: `export default RemoteGamePage`
**Imports**:
```typescript
import React from 'react'
import { useParams } from 'react-router-dom'
import { useRemoteGame } from '../hooks/useRemoteGame'
import { useGameInput } from '../hooks/useGameInput'
import PongTable from '../components/PongTable'
```

**Functionality**: Remote multiplayer game interface

---

#### `client/pages/TournamentPage.tsx`
**Exports**: `export default TournamentPage`
**Imports**:
```typescript
import React from 'react'
import { useStore } from '../store/useStore'
import TournamentBracket from '../components/TournamentBracket'
import TournamentInviteCards from '../components/TournamentInviteCards'
```

**Functionality**: Tournament bracket display, match coordination

---

### UI Components

#### `client/components/PongTable/index.tsx`
**Exports**: `export default PongTable`
**Imports**:
```typescript
import React, { useRef, useEffect } from 'react'
import { GameState } from '../../types/types'
import { renderGame } from './render/gameRenderer'
import { interpolateGameState } from './render/interpolation'
```

**Props Interface**:
```typescript
interface PongTableProps {
  gameState: GameState | null
  width: number
  height: number
  theme?: string
  showScore?: boolean
  isSpectating?: boolean
}
```

**Used by**: GamePage, RemoteGamePage, tournament components

---

#### `client/components/Navbar.tsx`
**Exports**: `export default Navbar`  
**Imports**:
```typescript
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useStore } from '../store/useStore'
import ThemeSelector from './ThemeSelector'
```

**Functionality**: Navigation, user status, theme selection

---

#### `client/components/chat/ChatArea.tsx`
**Exports**: `export default ChatArea`
**Imports**:
```typescript
import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import ChatAreaHeader from './ChatAreaHeader'
import Input from './Input'
```

**Functionality**: Real-time chat interface, message display

---

### Utility Files

#### `client/utils/Axios.ts`
**Exports**:
```typescript
export const axiosInstance = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const setupAxiosInterceptors = (refreshTokenFn: () => Promise<string>) => {
  // Request/response interceptors for token management
}
```

**Used by**: API calls, authentication flow

---

#### `client/lib/gameConfig.ts`
**Exports**:
```typescript
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  ballSpeed: 5,
  paddleSpeed: 8,
  maxScore: 5,
  ballRadius: 8,
  paddleHeight: 80,
  paddleWidth: 10
}

export const GAME_DIMENSIONS = {
  width: 800,
  height: 400,
  padding: 20
}

export const PHYSICS_CONFIG = {
  fps: 60,
  tickRate: 1000/60,
  interpolationBuffer: 100
}
```

**Used by**: Game components, physics calculations, settings management

---

#### `client/lib/themes.ts`
**Exports**:
```typescript
export interface Theme {
  id: string
  name: string
  colors: {
    background: string
    foreground: string  
    ball: string
    paddle: string
    text: string
  }
}

export const AVAILABLE_THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    colors: { background: '#000', foreground: '#fff', ball: '#fff', paddle: '#fff', text: '#fff' }
  },
  // ... other themes
]

export const getThemeById = (id: string): Theme | undefined
export const applyTheme = (theme: Theme): void
```

**Used by**: Theme selection, game rendering, UI styling

---

## Cross-File Dependencies and Usage Patterns

### Common Import Patterns

#### Socket.IO Usage
```typescript
// Backend socket handlers
import { Socket } from 'socket.io'
import type { FastifyInstance } from 'fastify'

// Frontend socket connection
import { io, Socket } from 'socket.io-client'
import { useStore } from '../store/useStore'
```

#### Database Model Usage
```typescript
// Controllers importing models
import { createUser, getUserById } from '../models/Users'
import { createGameResult } from '../models/GameResults'
import { updatePlayerStats } from '../models/PlayerStats'

// Socket handlers using models
import { Message } from '../models/Message'
import { Tournament } from '../models/Tournaments'
```

#### State Management Pattern
```typescript
// Components using global state
import { useStore } from '../store/useStore'

const Component = () => {
  const users = useStore(state => state.users)
  const setUsers = useStore(state => state.setUsers)
  
  // Component logic
}
```

### Manager Class Dependencies

```ascii
Dependency Flow for Manager Classes

activityManager ←─── socketHandlers ←─── tournamentManager
      ↓                    ↓                    ↓
   lockState          roomManager         bracketController
      ↓                    ↓                    ↓  
   broadcast          GameRoom/           matchFlowController
                   RemoteGameRoom              ↓
                        ↓               database models
                   GameEngine
                        ↓
                   GameState
```

### Frontend Component Hierarchy

```ascii
App.tsx
├── Router
│   ├── HomePage
│   ├── GamePage
│   │   ├── PongTable
│   │   ├── GameSettings  
│   │   └── useLocalGame
│   ├── RemoteGamePage
│   │   ├── PongTable
│   │   └── useRemoteGame
│   ├── TournamentPage
│   │   ├── TournamentBracket
│   │   └── TournamentInviteCards
│   └── ChatPage
│       ├── ChatArea
│       ├── ChatSidebar
│       └── chat hooks
├── Navbar
├── PersistLogin
└── Global Providers
    ├── AuthProvider
    ├── StoreProvider
    └── Socket Provider
```

### Key Integration Points

#### Game State Flow
```typescript
// Backend: GameEngine → GameRoom → Socket emission
GameEngine.update() → room.broadcastState() → socket.emit('game_state')

// Frontend: Socket reception → Store → Component rendering  
socket.on('game_state') → updateGameState() → PongTable.render()
```

#### Authentication Flow
```typescript
// Backend: Route → Controller → Model → Token
/auth/login → loginUser() → getUserByEmail() → generateAccessToken()

// Frontend: Form → API → Store → Navigation
LoginForm → axiosInstance.post() → setUser() → navigate()
```

#### Tournament Flow
```typescript
// Backend: Socket → Manager → Controller → Database
tournament_join → tournamentManager.join() → bracketController.addPlayer() → Tournament.save()

// Frontend: Component → Socket → Store → UI Update
JoinButton → socket.emit() → tournament_joined → updateTournament() → re-render
```

## File Organization Summary

### Backend Architecture
- **Entry Point**: `server/index.ts` orchestrates all systems
- **Core Systems**: Room, activity, tournament managers as singletons
- **Game Logic**: Isolated in `game/` directory with pure functions
- **Models**: Database abstractions in `models/` directory
- **Controllers**: Business logic in `controllers/` directory  
- **Routes**: HTTP endpoint definitions in `routes/` directory
- **Socket**: Real-time communication in `socket/` directory

### Frontend Architecture  
- **Entry Point**: `client/App.tsx` sets up routing and providers
- **Pages**: Route components in `pages/` directory
- **Components**: Reusable UI in `components/` directory
- **Hooks**: Custom logic hooks in `hooks/` directory
- **Store**: Global state management in `store/` directory
- **Utils**: Helper functions in `utils/` and `lib/` directories

### Cross-Cutting Concerns
- **Types**: Shared interfaces between frontend/backend
- **Configuration**: Build and environment setup
- **Authentication**: Token-based auth with refresh mechanism
- **Real-time**: Socket.IO for all live communication
- **Database**: SQLite with runtime schema management

This file mapping provides the foundation for understanding code relationships and making targeted modifications to the Pong platform.
